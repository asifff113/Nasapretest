# Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
"""Reader for MERRA-2 monthly: T2M (air_temp) and PRECTOTCORR (rain) (step 2A).

Skeleton only: nothing is implemented yet. Part 2 of docs/05_BUILD_PLAN.md builds this module.

Products, versions, variable paths and units come from config/sources.yaml and config/variables.yaml.
Conversions on read: T2M K - 273.15 -> degC; PRECTOTCORR kg m-2 s-1 x 86400 -> mm/day (docs/02_DATA.md §3.1).
Returns months, the grid id (merra2_native) and values [n_months][n_lat][n_lon]; fill values become NaN.
"""
