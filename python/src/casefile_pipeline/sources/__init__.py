# Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
"""Data sources: one generic Earthdata fetcher plus one small reader per product.

Skeleton only: nothing is implemented yet. Part 2 of docs/05_BUILD_PLAN.md builds this module.

Built in step 2A (prompts/part-2A.txt). Readers are registered under their source id from
config/sources.yaml, so a new dataset is one more reader and no other code (docs/02_DATA.md §14).
Network access is allowed only inside this package (AGENTS.md rule 9).
"""
