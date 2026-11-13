// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
// ScreeningMap (docs/04_UI.md §4.7, §7): canvas, equirectangular, bundled outlines. Colour = rate per decade within
// ±colourLimit; cells that stand out after Benjamini–Hochberg (flag bit "significant") solid with a centre dot
// when zoomed in, the other testable cells lighter; cells that cannot be tested hatched. Arrow keys move a cell
// cursor; Enter opens the cell page. Decoding and pixel scaling only: no statistic is computed here.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Minus, Plus, RotateCcw } from 'lucide-react';
import type { MapLayer } from '../data/results';
import type { Lang } from '../data/types';
import { tOr, useT } from '../i18n';
import { int, num, rate as fmtRate } from '../i18n/format';
import { useTokens } from '../charts/tokens';
import { Button } from '../ui/common/button';
import { diverging, rgb, scalePos } from './colours';
import type { Outlines } from './outlines';

export interface CellInfo {
  row: number;
  col: number;
  lat: number;
  lon: number;
  rate: number | null;
  testable: boolean;
  significant: boolean;
  reasons: string[];
}

export function cellInfo(layer: MapLayer, row: number, col: number): CellInfo {
  const g = layer.meta.grid;
  const i = row * g.nlon + col;
  const flags = layer.flags[i] ?? 0;
  const bits = layer.meta.flagBits;
  const has = (name: string) => (bits[name] !== undefined ? (flags & (bits[name] as number)) !== 0 : false);
  const reasons = Object.keys(bits).filter((k) => k !== 'testable' && k !== 'significant' && has(k));
  const r = layer.fields.rate?.[i];
  return {
    row,
    col,
    lat: g.lat0 + row * g.dlat,
    lon: g.lon0 + col * g.dlon,
    rate: r !== undefined && Number.isFinite(r) ? r : null,
    testable: has('testable'),
    significant: has('significant'),
    reasons,
  };
}

/** "23.5° N, 90.5° E" in the language's digits. */
export function latLon(lat: number, lon: number, lang: Lang): string {
  const la = `${num(Math.abs(lat), lang, 1)}° ${lat >= 0 ? 'N' : 'S'}`;
  const lo = `${num(Math.abs(lon), lang, 1)}° ${lon >= 0 ? 'E' : 'W'}`;
  return `${la}, ${lo}`;
}

interface ViewBox {
  k: number;
  x: number;
  y: number;
}

export function ScreeningMap({
  layer,
  colormap,
  outlines,
  lang,
  onOpen,
  label,
  start,
}: {
  layer: MapLayer;
  colormap: string | undefined;
  outlines: Outlines | null;
  lang: Lang;
  onOpen: (row: number, col: number) => void;
  label: string;
  /** Where the keyboard cursor starts (the home region's centre). */
  start?: { row: number; col: number };
}) {
  const t = useT();
  const tokens = useTokens();
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [rawVb, setVb] = useState<ViewBox>({ k: 1, x: 0, y: 0 });
  const [cursor, setCursor] = useState<{ row: number; col: number } | null>(null);
  const [hover, setHover] = useState<{ info: CellInfo; px: number; py: number } | null>(null);
  const drag = useRef<{ x: number; y: number; vx: number; vy: number; moved: boolean } | null>(null);
  const g = layer.meta.grid;

  // The base raster: one pixel per cell, drawn once per layer, palette and theme.
  const raster = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = g.nlon;
    c.height = g.nlat;
    const ctx = c.getContext('2d');
    const mask = document.createElement('canvas');
    mask.width = g.nlon;
    mask.height = g.nlat;
    const mctx = mask.getContext('2d');
    if (!ctx || !mctx) return { c, mask };
    const img = ctx.createImageData(g.nlon, g.nlat);
    const mimg = mctx.createImageData(g.nlon, g.nlat);
    const interp = diverging(colormap);
    const limit = layer.meta.colourLimit;
    const bits = layer.meta.flagBits;
    const tb = bits.testable ?? 1;
    const sb = bits.significant ?? 2;
    const rates = layer.fields.rate;
    const surface = rgb(tokens.surface);
    // A small palette lookup (256 steps) keeps this fast.
    const lut: [number, number, number][] = Array.from({ length: 256 }, (_, i) => rgb(interp(i / 255)));
    for (let i = 0; i < g.nlat * g.nlon; i++) {
      const f = layer.flags[i] ?? 0;
      const o = i * 4;
      const r = rates ? rates[i] : Number.NaN;
      if ((f & tb) !== 0 && r !== undefined && Number.isFinite(r)) {
        const [cr, cg, cb] = lut[Math.round(scalePos(r, limit) * 255)] ?? [128, 128, 128];
        const sig = (f & sb) !== 0;
        // Not standing out: lighter (mixed 55% toward the surface).
        const a = sig ? 1 : 0.45;
        img.data[o] = Math.round(cr * a + surface[0] * (1 - a));
        img.data[o + 1] = Math.round(cg * a + surface[1] * (1 - a));
        img.data[o + 2] = Math.round(cb * a + surface[2] * (1 - a));
        img.data[o + 3] = 255;
      } else {
        img.data[o] = surface[0];
        img.data[o + 1] = surface[1];
        img.data[o + 2] = surface[2];
        img.data[o + 3] = 255;
        mimg.data[o + 3] = 255; // hatch here
      }
    }
    ctx.putImageData(img, 0, 0);
    mctx.putImageData(mimg, 0, 0);
    return { c, mask };
  }, [layer, colormap, tokens, g.nlat, g.nlon]);

  // Fit the width; equirectangular 2:1, capped by the viewport height.
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const fit = () => {
      const w = el.clientWidth;
      const h = Math.min(Math.round(w / 2), Math.round(window.innerHeight * 0.72));
      setSize({ w, h });
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const baseScale = size.w / g.nlon; // px per cell at k = 1 (fit width)

  const clampVb = useCallback(
    (v: ViewBox): ViewBox => {
      const k = Math.min(24, Math.max(1, v.k));
      const W = g.nlon * baseScale * k;
      const H = g.nlat * baseScale * k;
      const x = Math.min(0, Math.max(size.w - W, v.x));
      const y = H <= size.h ? (size.h - H) / 2 : Math.min(0, Math.max(size.h - H, v.y));
      return { k, x, y };
    },
    [baseScale, g.nlat, g.nlon, size.h, size.w],
  );

  // The view always stays inside the map, whatever the size.
  const vb = useMemo(() => clampVb(rawVb), [rawVb, clampVb]);
  const cellPx = baseScale * vb.k;
  const toPx = useCallback(
    (lon: number, lat: number): [number, number] => {
      const col = (lon - (g.lon0 - g.dlon / 2)) / g.dlon;
      const row = (lat - (g.lat0 - g.dlat / 2)) / g.dlat;
      return [col * cellPx + vb.x, row * cellPx + vb.y];
    },
    [cellPx, vb.x, vb.y, g],
  );

  // Draw.
  useEffect(() => {
    const cv = canvas.current;
    if (!cv || size.w === 0) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(size.w * dpr);
    cv.height = Math.round(size.h * dpr);
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.w, size.h);
    ctx.fillStyle = tokens.surface;
    ctx.fillRect(0, 0, size.w, size.h);
    const W = g.nlon * cellPx;
    const H = g.nlat * cellPx;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(raster.c, vb.x, vb.y, W, H);

    // Hatching (45°, 30% opacity) through the not-testable mask.
    const tmp = document.createElement('canvas');
    tmp.width = cv.width;
    tmp.height = cv.height;
    const tctx = tmp.getContext('2d');
    if (tctx) {
      tctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const pat = document.createElement('canvas');
      pat.width = 8;
      pat.height = 8;
      const pctx = pat.getContext('2d');
      if (pctx) {
        pctx.strokeStyle = tokens.muted;
        pctx.globalAlpha = 0.6;
        pctx.lineWidth = 1.25;
        pctx.beginPath();
        pctx.moveTo(0, 8);
        pctx.lineTo(8, 0);
        pctx.moveTo(-1, 1);
        pctx.lineTo(1, -1);
        pctx.moveTo(7, 9);
        pctx.lineTo(9, 7);
        pctx.stroke();
        const p = tctx.createPattern(pat, 'repeat');
        if (p) {
          tctx.fillStyle = p;
          tctx.fillRect(0, 0, size.w, size.h);
          tctx.globalCompositeOperation = 'destination-in';
          tctx.imageSmoothingEnabled = false;
          tctx.drawImage(raster.mask, vb.x, vb.y, W, H);
          ctx.drawImage(tmp, 0, 0, size.w, size.h);
        }
      }
    }

    // Outlines.
    if (outlines) {
      ctx.lineWidth = Math.max(0.9, Math.min(1.6, 0.8 + vb.k * 0.08));
      ctx.strokeStyle = tokens.ink;
      ctx.globalAlpha = 0.75;
      ctx.beginPath();
      for (const ring of outlines.land) {
        ring.forEach(([lon, lat], i) => {
          const [x, y] = toPx(lon, lat);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
      }
      ctx.stroke();
      ctx.globalAlpha = 0.25;
      ctx.beginPath();
      for (const line of outlines.borders) {
        line.forEach(([lon, lat], i) => {
          const [x, y] = toPx(lon, lat);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // Centre dots on cells that stand out, once cells are big enough to see them.
    if (cellPx >= 7) {
      const sb = layer.meta.flagBits.significant ?? 2;
      const c0 = Math.max(0, Math.floor(-vb.x / cellPx));
      const c1 = Math.min(g.nlon - 1, Math.ceil((size.w - vb.x) / cellPx));
      const r0 = Math.max(0, Math.floor(-vb.y / cellPx));
      const r1 = Math.min(g.nlat - 1, Math.ceil((size.h - vb.y) / cellPx));
      ctx.fillStyle = tokens.ink;
      ctx.globalAlpha = 0.7;
      const rad = Math.min(3, cellPx * 0.14);
      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
          if (((layer.flags[r * g.nlon + c] ?? 0) & sb) !== 0) {
            ctx.beginPath();
            ctx.arc(vb.x + (c + 0.5) * cellPx, vb.y + (r + 0.5) * cellPx, rad, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
      ctx.globalAlpha = 1;
    }

    // The keyboard cursor.
    if (cursor) {
      ctx.strokeStyle = tokens.accent;
      ctx.lineWidth = 2.5;
      const pad = Math.max(2, cellPx * 0.1);
      ctx.strokeRect(vb.x + cursor.col * cellPx - pad, vb.y + cursor.row * cellPx - pad, cellPx + 2 * pad, cellPx + 2 * pad);
    }
  }, [raster, size, vb, cellPx, outlines, tokens, cursor, layer, g.nlat, g.nlon, toPx]);

  const cellAt = (px: number, py: number): { row: number; col: number } | null => {
    const col = Math.floor((px - vb.x) / cellPx);
    const row = Math.floor((py - vb.y) / cellPx);
    if (row < 0 || col < 0 || row >= g.nlat || col >= g.nlon) return null;
    return { row, col };
  };

  const zoomAt = (factor: number, px: number, py: number) => {
    setVb((v) => {
      const k = Math.min(24, Math.max(1, v.k * factor));
      const f = k / v.k;
      return clampVb({ k, x: px - (px - v.x) * f, y: py - (py - v.y) * f });
    });
  };

  const centreOn = (row: number, col: number) => {
    setVb((v) => {
      const cx = v.x + (col + 0.5) * cellPx;
      const cy = v.y + (row + 0.5) * cellPx;
      if (cx > 24 && cx < size.w - 24 && cy > 24 && cy < size.h - 24) return v;
      return clampVb({ k: v.k, x: size.w / 2 - (col + 0.5) * cellPx, y: size.h / 2 - (row + 0.5) * cellPx });
    });
  };

  useEffect(() => {
    const cv = canvas.current;
    if (!cv) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = cv.getBoundingClientRect();
      zoomAt(e.deltaY < 0 ? 1.25 : 0.8, e.clientX - rect.left, e.clientY - rect.top);
    };
    cv.addEventListener('wheel', onWheel, { passive: false });
    return () => cv.removeEventListener('wheel', onWheel);
  });

  const cursorInfo = cursor ? cellInfo(layer, cursor.row, cursor.col) : null;
  const describe = (c: CellInfo) =>
    t('site.map.cursor', {
      place: latLon(c.lat, c.lon, lang),
      rate: c.rate === null ? '–' : `${fmtRate(c.rate, lang)} ${layer.meta.units}`,
      status: c.testable ? (c.significant ? t('site.map.status_stands_out') : t('site.map.status_tested')) : `${t('site.map.status_untestable')}${c.reasons.length ? ` (${c.reasons.map((r) => tOr(t, `site.map.flag_${r}`, r)).join('; ')})` : ''}`,
    });

  return (
    <div className="relative" data-tour="screening-map" data-testid="screening-map">
      <div ref={wrap} className="relative w-full overflow-hidden rounded-[10px] border border-line bg-surface" style={{ height: size.h || undefined }}>
        <canvas
          ref={canvas}
          tabIndex={0}
          role="application"
          aria-roledescription={t('site.map.roledescription')}
          aria-label={label}
          aria-describedby="map-keys"
          data-testid="map-canvas"
          style={{ width: size.w, height: size.h, touchAction: 'none', cursor: 'crosshair' }}
          className="block outline-none focus-visible:outline-3 focus-visible:outline-offset-[-3px] focus-visible:outline-ring"
          onPointerDown={(e) => {
            (e.target as HTMLElement).setPointerCapture(e.pointerId);
            drag.current = { x: e.clientX, y: e.clientY, vx: vb.x, vy: vb.y, moved: false };
          }}
          onPointerMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const px = e.clientX - rect.left;
            const py = e.clientY - rect.top;
            const d = drag.current;
            if (d) {
              const dx = e.clientX - d.x;
              const dy = e.clientY - d.y;
              if (Math.abs(dx) + Math.abs(dy) > 4) d.moved = true;
              if (d.moved) {
                setVb(clampVb({ k: vb.k, x: d.vx + dx, y: d.vy + dy }));
                setHover(null);
                return;
              }
            }
            if (e.pointerType === 'mouse') {
              const c = cellAt(px, py);
              setHover(c ? { info: cellInfo(layer, c.row, c.col), px, py } : null);
            }
          }}
          onPointerUp={(e) => {
            const d = drag.current;
            drag.current = null;
            if (d?.moved) return;
            const rect = e.currentTarget.getBoundingClientRect();
            const c = cellAt(e.clientX - rect.left, e.clientY - rect.top);
            if (!c) return;
            const same = cursor && cursor.row === c.row && cursor.col === c.col;
            setCursor(c);
            if (e.pointerType === 'mouse' || same) onOpen(c.row, c.col);
            else setHover({ info: cellInfo(layer, c.row, c.col), px: e.clientX - rect.left, py: e.clientY - rect.top });
          }}
          onPointerLeave={() => setHover(null)}
          onKeyDown={(e) => {
            const cur = cursor ?? { row: Math.floor(g.nlat / 2), col: Math.floor(g.nlon / 2) };
            let next: { row: number; col: number } | null = null;
            const step = e.shiftKey ? 5 : 1;
            if (e.key === 'ArrowUp') next = { row: Math.max(0, cur.row - step), col: cur.col };
            else if (e.key === 'ArrowDown') next = { row: Math.min(g.nlat - 1, cur.row + step), col: cur.col };
            else if (e.key === 'ArrowLeft') next = { row: cur.row, col: (cur.col - step + g.nlon) % g.nlon };
            else if (e.key === 'ArrowRight') next = { row: cur.row, col: (cur.col + step) % g.nlon };
            else if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              if (cursor) onOpen(cursor.row, cursor.col);
              else setCursor(cur);
              return;
            } else if (e.key === '+' || e.key === '=') {
              e.preventDefault();
              zoomAt(1.5, size.w / 2, size.h / 2);
              return;
            } else if (e.key === '-') {
              e.preventDefault();
              zoomAt(1 / 1.5, size.w / 2, size.h / 2);
              return;
            }
            if (next) {
              e.preventDefault();
              setCursor(next);
              centreOn(next.row, next.col);
            }
          }}
          onFocus={() => {
            if (!cursor) setCursor(start ?? { row: Math.floor(g.nlat / 2), col: Math.floor(g.nlon / 2) });
          }}
        />
        {hover ? (
          <div
            className="pointer-events-none absolute z-10 max-w-[260px] rounded-[8px] border border-line-strong bg-surface px-3 py-2 text-sm shadow-lift"
            style={{ left: Math.min(hover.px + 14, Math.max(0, size.w - 270)), top: Math.max(4, hover.py - 70) }}
            data-testid="map-hover"
          >
            <p className="font-medium tabular">{latLon(hover.info.lat, hover.info.lon, lang)}</p>
            {hover.info.testable ? (
              <p className="tabular">
                {hover.info.rate === null ? '–' : `${fmtRate(hover.info.rate, lang)} ${layer.meta.units} ${t('verdict.labels.rate_short')}`}
                <span className="block text-muted">{hover.info.significant ? t('site.map.status_stands_out') : t('site.map.status_tested')}</span>
              </p>
            ) : (
              <p className="text-muted">
                {t('site.map.status_untestable')}
                {hover.info.reasons.length ? `: ${hover.info.reasons.map((r) => tOr(t, `site.map.flag_${r}`, r)).join('; ')}` : ''}
              </p>
            )}
          </div>
        ) : null}
        <div className="absolute right-2 top-2 flex flex-col gap-1">
          <Button variant="outline" size="icon" className="size-10 bg-surface/90" onClick={() => zoomAt(1.5, size.w / 2, size.h / 2)} aria-label={t('site.map.zoom_in')}>
            <Plus aria-hidden="true" />
          </Button>
          <Button variant="outline" size="icon" className="size-10 bg-surface/90" onClick={() => zoomAt(1 / 1.5, size.w / 2, size.h / 2)} aria-label={t('site.map.zoom_out')}>
            <Minus aria-hidden="true" />
          </Button>
          <Button variant="outline" size="icon" className="size-10 bg-surface/90" onClick={() => setVb(clampVb({ k: 1, x: 0, y: 0 }))} aria-label={t('site.map.reset')}>
            <RotateCcw aria-hidden="true" />
          </Button>
        </div>
      </div>
      <p id="map-keys" className="mt-2 text-sm text-muted">
        {t('site.map.keys')}
      </p>
      <p className="sr-only" aria-live="polite" data-testid="map-announce">
        {cursorInfo ? describe(cursorInfo) : ''}
      </p>
      {cursorInfo ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-line bg-surface-2 px-4 py-3" data-testid="map-selected">
          <p className="text-[15px] tabular">{describe(cursorInfo)}</p>
          <Button variant="primary" size="sm" onClick={() => onOpen(cursorInfo.row, cursorInfo.col)} data-testid="open-cell">
            {t('site.map.open_cell', { row: int(cursorInfo.row, lang), col: int(cursorInfo.col, lang) })}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
