# Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
"""Reader for GPM IMERG V07 Final monthly: /Grid/precipitation (rain_imerg) (step 2A).

Skeleton only: nothing is implemented yet. Part 2 of docs/05_BUILD_PLAN.md builds this module.

Conversion on read: mm/hr x 24 -> mm/day. Arrives as (time, lon, lat): transpose to (lat, lon).
Keep only the box covering every region of config/regions.yaml plus 1 degree (docs/02_DATA.md §3.2).
Returns months, the grid id (imerg_native) and values [n_months][n_lat][n_lon]; fill values become NaN.
"""
