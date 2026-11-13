# Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
"""Generic fetcher for any product in NASA Earthdata (docs/01_ARCHITECTURE.md §6.1, docs/02_DATA.md §2).

- Login: earthaccess with EARTHDATA_USERNAME / EARTHDATA_PASSWORD from the environment, or the person's ~/.netrc.
  A credential is never printed, logged or written.
- Finding files: a CMR search through earthaccess by short name and version. The month of each granule comes from
  its temporal metadata, never from its file name; a missing or doubled month raises (P-10). File names and
  addresses are only ever taken from the search result (P-11).
- Fetching one variable per granule, routes in order: 1 OPeNDAP subset, 2 remote read, 3 whole file.
- A file cache in .cache/raw/<short name>/ with one record per month, so a stopped run resumes.
"""
from __future__ import annotations

import datetime as dt
import hashlib
import json
import os
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from urllib.parse import quote, urlparse

import numpy as np

from casefile_engine.base import ROOT

from . import AccessMismatch, Reader

CACHE = ROOT / ".cache"
ROUTES = ("opendap_subset", "remote_read", "whole_file")


class MonthError(ValueError):
    """The granules of a product do not form one complete monthly sequence."""


class LoginFailed(RuntimeError):
    pass


# ============================================================================ login
def netrc_file() -> Path | None:
    """The netrc file to use: $NETRC, else ~/.netrc or ~/_netrc (Windows tools use either name). Not read here."""
    if os.environ.get("NETRC"):
        return Path(os.environ["NETRC"])
    for n in (".netrc", "_netrc"):
        if (Path.home() / n).exists():
            return Path.home() / n
    return None


def credential_source() -> str | None:
    """Where a login would come from: 'environment', 'netrc' or None. Reads no credential value."""
    if os.environ.get("EARTHDATA_USERNAME") and os.environ.get("EARTHDATA_PASSWORD"):
        return "environment"
    return "netrc" if netrc_file() is not None else None


def login():
    """Log in to NASA Earthdata through earthaccess. Never interactive; never prints a credential."""
    import earthaccess

    strategy = credential_source()
    if strategy is None:
        raise LoginFailed("no Earthdata login found: set EARTHDATA_USERNAME and EARTHDATA_PASSWORD, or create ~/.netrc "
                          "with a line for urs.earthdata.nasa.gov (build plan, Part 0)")
    if strategy == "netrc":
        # earthaccess reads ~/_netrc on Windows and ~/.netrc elsewhere, unless NETRC names the file: point it at the
        # file that exists, for this process only.
        os.environ["NETRC"] = str(netrc_file())
    try:
        auth = earthaccess.login(strategy=strategy)
    except Exception as e:  # noqa: BLE001  (earthaccess never puts the password in a message)
        raise LoginFailed(f"Earthdata login ({strategy}) failed: {type(e).__name__}") from None
    if not getattr(auth, "authenticated", False):
        raise LoginFailed(f"Earthdata login ({strategy}) was refused: check the username and password")
    return auth


# ============================================================================ months
def month_range(first: str, last: str) -> list[str]:
    """Every month 'YYYY-MM' from first to last inclusive."""
    y, m = int(first[:4]), int(first[5:7])
    y1, m1 = int(last[:4]), int(last[5:7])
    out = []
    while (y, m) <= (y1, m1):
        out.append(f"{y:04d}-{m:02d}")
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)
    return out


def granule_month(umm: dict) -> str:
    """The month 'YYYY-MM' a monthly granule covers, from its temporal metadata (not from its name)."""
    rng = umm["TemporalExtent"]["RangeDateTime"]
    b, e = str(rng["BeginningDateTime"]), str(rng["EndingDateTime"])
    if b[:7] != e[:7] or b[8:10] != "01":
        raise MonthError(f"granule {umm.get('GranuleUR')} covers {b}..{e}, not one calendar month")
    return b[:7]


def granule_name(umm: dict) -> str:
    """The file name of a granule, as listed in its metadata (the part of GranuleUR after the collection prefix)."""
    ur = str(umm["GranuleUR"])
    return ur.split(":", 1)[1] if ":" in ur else ur


def month_table(items: list, first: str, last: str, umm=lambda g: g["umm"]) -> dict:
    """{month: granule} for every month first..last. Raises MonthError on a doubled or a missing month (P-10)."""
    table: dict[str, object] = {}
    for g in items:
        m = granule_month(umm(g))
        if not (first <= m <= last):
            continue
        if m in table:
            raise MonthError(f"month {m} is doubled: {granule_name(umm(table[m]))} and {granule_name(umm(g))}")
        table[m] = g
    missing = [m for m in month_range(first, last) if m not in table]
    if missing:
        raise MonthError(f"{len(missing)} month(s) missing between {first} and {last}, first {missing[0]}")
    return dict(sorted(table.items()))


def default_window(reader: Reader, today: dt.date | None = None) -> tuple[str, str]:
    """(first, last) month of the record: first from config/sources.yaml; last is the end month given there when it
    is a 'YYYY-MM' (IMERG V07 Final ends 2025-09), else December of the last complete year (MERRA-2)."""
    t = reader.source["temporal"]
    first = str(t["start"])[:7]
    end = str(t.get("end", ""))
    if len(end) == 7 and end[4] == "-" and end[:4].isdigit():
        return first, end
    today = today or dt.date.today()
    return first, f"{today.year - 1}-12"


def search(reader: Reader, first: str, last: str) -> list:
    """CMR search through earthaccess by the product's short name and version, for the months first..last."""
    import earthaccess

    y, m = int(last[:4]), int(last[5:7])
    end_day = (dt.date(y + (m == 12), m % 12 + 1, 1) - dt.timedelta(days=1)).isoformat()
    found = earthaccess.search_data(short_name=reader.short_name, version=reader.version, temporal=(f"{first}-01", end_day))
    for g in found:
        ref = g["umm"].get("CollectionReference", {})
        if ref.get("ShortName") != reader.short_name or str(ref.get("Version")) != reader.version:
            raise AccessMismatch(f"search returned a granule of {ref} instead of {reader.short_name} {reader.version}")
    if reader.name_check:
        reader.name_check([granule_name(g["umm"]) for g in found])
    return list(found)


# ============================================================================ addresses
def check_address(url: str) -> str:
    """Refuse the discontinued on-premises GES DISC servers (docs/02_DATA.md §2)."""
    host = urlparse(url).hostname or ""
    if "gesdisc" in host and host.endswith(".eosdis.nasa.gov"):
        raise ValueError(f"refusing an on-premises GES DISC address: {host}")
    return url


def opendap_url(umm: dict) -> str | None:
    """The granule's related URL with subtype 'OPENDAP DATA', or None."""
    for r in umm.get("RelatedUrls", []):
        if r.get("Subtype") == "OPENDAP DATA" and str(r.get("URL", "")).startswith("https://"):
            return check_address(r["URL"])
    return None


# ============================================================================ the cache
def raw_dir(reader: Reader, variable: str, root: Path | None = None) -> Path:
    """The month cache of one variable of a product: .cache/raw/<short name>/<variable>/ (or under `root`).
    Each variable is fetched on its own, so adding a variable never changes the saved files of another."""
    return (root or CACHE / "raw") / reader.short_name / variable


def record_path(reader: Reader, month: str, variable: str, root: Path | None = None) -> Path:
    return raw_dir(reader, variable, root) / f"{month}.json"


def sha256_path(p: Path) -> str:
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def values_sha256(values: np.ndarray) -> str:
    """SHA-256 of a decoded field as little-endian float32 in C order (stays the same if headers change)."""
    return hashlib.sha256(np.ascontiguousarray(values, dtype="<f4").tobytes()).hexdigest()


def open_saved(path: Path, reader: Reader):
    """Open a saved NetCDF-4 response for decoding: the reader's group if present, else the root."""
    import xarray as xr

    if reader.group:
        try:
            return xr.open_dataset(path, engine="h5netcdf", group=reader.group, mask_and_scale=False, decode_times=False)
        except OSError:
            pass
    return xr.open_dataset(path, engine="h5netcdf", mask_and_scale=False, decode_times=False)


def _var_entry(reader: Reader, variable: str) -> dict:
    for v in reader.variables():
        if str(v["variable"]) == variable:
            return v
    raise KeyError(f"{reader.short_name}: no used variable '{variable}' in config/variables.yaml")


def load_month(reader: Reader, month: str, variable: str, box=None) -> tuple[np.ndarray, dict]:
    """The decoded field [n_lat][n_lon] of one cached month of one variable, and its record."""
    d = raw_dir(reader, variable)
    rec = json.loads(record_path(reader, month, variable).read_text(encoding="utf-8"))
    if rec["box"] != (list(box) if box is not None else None):
        raise ValueError(f"{reader.short_name} {variable} {month}: cached with box {rec['box']}, needed {box}; delete {d} and fetch again")
    if rec["route"] == "opendap_subset":
        with open_saved(d / rec["saved"], reader) as ds:
            return reader.decode(ds, _var_entry(reader, variable), box)[0], rec
    with np.load(d / rec["saved"], allow_pickle=False) as z:
        return z[variable], rec


# ============================================================================ the three routes
_local = threading.local()


def _session():
    import earthaccess

    if not hasattr(_local, "session"):
        _local.session = earthaccess.get_requests_https_session()
    return _local.session


def _route_opendap(reader: Reader, variable: str, granule, dest: Path) -> Path:
    url = opendap_url(granule["umm"])
    if url is None:
        raise RuntimeError("the granule lists no OPENDAP DATA url")
    full = f"{url}.dap.nc4?dap4.ce={quote(reader.constraint(variable), safe='')}"
    tmp = dest.with_suffix(".part")
    with _session().get(full, stream=True, timeout=300) as r:
        if r.status_code != 200:
            raise RuntimeError(f"OPeNDAP answered HTTP {r.status_code}")
        with open(tmp, "wb") as f:
            f.writelines(r.iter_content(1 << 20))
    os.replace(tmp, dest)
    return dest


def fetch_month(reader: Reader, month: str, granule, route: str, variable: str, box=None, root: Path | None = None) -> dict:
    """Fetch one variable of one month by `route`, decode it, write its record; return the record (with the facts)."""
    import xarray as xr

    d = raw_dir(reader, variable, root)
    d.mkdir(parents=True, exist_ok=True)
    name = granule_name(granule["umm"])
    entry = _var_entry(reader, variable)
    rec = {"month": month, "name": name, "variable": variable, "route": route, "box": list(box) if box is not None else None}
    if route == "opendap_subset":
        saved = _route_opendap(reader, variable, granule, d / f"{month}__{name}.dap.nc4")
        with open_saved(saved, reader) as ds:
            field, facts = reader.decode(ds, entry, box)
        rec.update(saved=saved.name, bytes=saved.stat().st_size, sha256=sha256_path(saved))
    elif route == "remote_read":
        import earthaccess

        (fobj,) = earthaccess.open([granule])
        with xr.open_dataset(fobj, engine="h5netcdf", group=reader.group, mask_and_scale=False, decode_times=False) as ds:
            field, facts = reader.decode(ds, entry, box)
        saved = d / f"{month}__{name}.values.npz"
        np.savez(saved, **{variable: field})
        rec.update(saved=saved.name, bytes=saved.stat().st_size, sha256=sha256_path(saved))
    elif route == "whole_file":
        import earthaccess

        tmpdir = d / f"_download_{month}"
        tmpdir.mkdir(exist_ok=True)
        (path,) = [Path(p) for p in earthaccess.download([granule], str(tmpdir), show_progress=False)]
        rec.update(bytes=path.stat().st_size, sha256=sha256_path(path))
        with open_saved(path, reader) as ds:
            field, facts = reader.decode(ds, entry, box)
        path.unlink()
        tmpdir.rmdir()
        saved = d / f"{month}__{name}.values.npz"
        np.savez(saved, **{variable: field})
        rec["saved"] = saved.name
    else:
        raise ValueError(f"unknown route {route}")
    rec["valuesSha256"] = values_sha256(field[None])
    rec["facts"] = {variable: facts}
    record_path(reader, month, variable, root).write_bytes((json.dumps(rec, indent=1)).encode("utf-8"))
    return rec


def probe_routes(reader: Reader, month: str, granule, variable: str, box=None, log=print, root: Path | None = None) -> dict:
    """Try the routes in order on one granule; return the record of the first that works (the access check)."""
    errors = {}
    for route in ROUTES:
        try:
            rec = fetch_month(reader, month, granule, route, variable, box, root)
            rec["routesTried"] = errors
            return rec
        except AccessMismatch:
            raise                                    # the file differs from the documentation: stop, do not try others
        except Exception as e:  # noqa: BLE001 — every failure of a route is reported, then the next route is tried
            errors[route] = f"{type(e).__name__}: {str(e)[:200]}"
            log(f"    route {route} failed: {errors[route]}")
    raise RuntimeError(f"{reader.short_name}: no route works ({errors}); see docs/02_DATA.md §8 — a person decides")


def cached_route(reader: Reader, table: dict, variable: str, box=None) -> str | None:
    """The route of the months already cached for this variable with this box, if they agree on one."""
    want = list(box) if box is not None else None
    routes = set()
    for m in table:
        rp = record_path(reader, m, variable)
        if rp.exists():
            rec = json.loads(rp.read_text(encoding="utf-8"))
            if rec.get("box") == want:
                routes.add(rec["route"])
    return routes.pop() if len(routes) == 1 else None


def fetch_product(reader: Reader, table: dict, route: str, variable: str, box=None, workers: int = 8, retries: int = 4,
                  log=print) -> list[dict]:
    """Fetch one variable for every month of `table` ({month: granule}) by `route`, skipping months already cached."""
    todo = []
    for m, g in table.items():
        rp = record_path(reader, m, variable)
        if rp.exists():
            rec = json.loads(rp.read_text(encoding="utf-8"))
            if rec.get("box") == (list(box) if box is not None else None) and (raw_dir(reader, variable) / rec["saved"]).exists():
                continue
        todo.append((m, g))
    log(f"  {reader.short_name} {variable}: {len(table)} months, {len(table) - len(todo)} cached, {len(todo)} to fetch by {route}")

    def one(m, g):
        for k in range(retries + 1):
            try:
                return fetch_month(reader, m, g, route, variable, box)
            except AccessMismatch:
                raise
            except Exception as e:  # noqa: BLE001
                if k == retries:
                    raise RuntimeError(f"{reader.short_name} {variable} {m}: {type(e).__name__}: {str(e)[:200]}") from None
                time.sleep(2 ** k * 3)

    done = 0
    with ThreadPoolExecutor(max_workers=workers) as ex:
        futs = [ex.submit(one, m, g) for m, g in todo]
        for f in as_completed(futs):
            f.result()
            done += 1
            if done % 50 == 0 or done == len(todo):
                log(f"    {reader.short_name} {variable}: {done}/{len(todo)} fetched")
    return [json.loads(record_path(reader, m, variable).read_text(encoding="utf-8")) for m in table]
