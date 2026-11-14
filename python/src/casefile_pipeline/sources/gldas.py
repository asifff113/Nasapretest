# Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
"""Reader for GLDAS Noah Land Surface Model L4 monthly 1.0° V2.1 (GLDAS_NOAH10_M 2.1): evaporation and runoff.

Short name, version and DOI come from config/sources.yaml (gldas_noah10_m); variable names and monthly units from
config/variables.yaml (evapotranspiration = Evap_tavg; runoff = Qs_acc + Qsb_acc, "total runoff is the sum of
subsurface runoff and surface runoff", GLDAS-2 README §3.5 item 2).

What the files hold (GLDAS-2 README, GES DISC, revised 13 Aug 2025, Table 1 and Table 3.3; read in the granule
GLDAS_NOAH10_M.A202007.021.nc4 on 13 Nov 2026): NetCDF-4, variables at the root with dims (time, lat, lon), one time
step per file; latitude −59.5…89.5 (150), longitude −179.5…179.5 (360); _FillValue −9999 over the sea and
inland water (land model); Evap_tavg in "kg m-2 s-1"; Qs_acc and Qsb_acc in "kg m-2".

Monthly files are straight averages of the 3-hourly values (README §3.5 item 6):
- Evap_tavg is the mean rate over the month, kg m⁻² s⁻¹: × 86 400 → mm/day.
- Qs_acc and Qsb_acc are the average 3-hour accumulation over the month, kg/m²/3hr (the file's attribute says
  only "kg m-2"): × 8 → mm/day (`rate_units`, casefile_pipeline.units).
The engine then makes yearly totals from mm/day × days (rule: sum), as for rain.
"""
from . import Reader, register

GLDAS_NOAH10_M = register(Reader(source_id="gldas_noah10_m", grid_id="gldas_1deg", group=None, dims=("time", "lat", "lon"),
                                 time="time", lat="lat", lon="lon",
                                 units={"Evap_tavg": "kg m-2 s-1", "Qs_acc": "kg m-2", "Qsb_acc": "kg m-2", "SoilMoi0_10cm_inst": "kg m-2"},
                                 rate_units={"Qs_acc": "kg m-2 3hr-1", "Qsb_acc": "kg m-2 3hr-1"}))
