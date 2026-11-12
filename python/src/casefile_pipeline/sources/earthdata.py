# Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
"""Generic fetcher for any product in NASA Earthdata (step 2A).

Skeleton only: nothing is implemented yet. Part 2 of docs/05_BUILD_PLAN.md builds this module.

To build (docs/01_ARCHITECTURE.md §6.1, docs/02_DATA.md §2):
- login with earthaccess using EARTHDATA_USERNAME / EARTHDATA_PASSWORD from the environment; never log a credential
- CMR search through earthaccess; take each granule's month from its temporal metadata, never from its file name
- fetch one variable per granule, routes in order: OPeNDAP subset, remote read, whole file
- file cache in .cache/raw/<short name>/; parallel workers, retry with back-off, resume a stopped run
Never build file names or *.gesdisc.eosdis.nasa.gov addresses by hand.
"""
