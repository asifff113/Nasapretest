# Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
"""Region masks, the support rule and pair splits; writes regions/index.json (step 2B).

Skeleton only: nothing is implemented yet. Part 2 of docs/05_BUILD_PLAN.md builds this module.

See docs/02_DATA.md §7.2-§7.4 and prompts/part-2B.txt: cell fractions from 5 x 5 sample points per cell,
S1/S2 with casefile_engine.base.spill_share, pair splits (S3) with casefile_engine.base.pair_split.
Results must reproduce tools/decide/support_out.json, support_pairs_out.json and support_split_out.json.
"""
