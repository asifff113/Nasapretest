# Recompute scripts behind playbook v3, section 6.3

Python 3 with numpy, scipy, statsmodels, pymannkendall 1.4.3, pyhomogeneity.

- sim_size.py  – false-alarm rates of plain MK, library Hamed-Rao / Yue-Wang / TFPW / PW,
                 the bias-corrected AR(1) variance-inflation test (MK-AR1 family) and a
                 Santer-style t-test. Usage: python sim_size.py 2000 out.json
- sim2.py      – widened Sen-interval coverage, power at Weatherhead's n*, GLM's Sen claim,
                 Gemini's SYN-01/SYN-02. Usage: python sim2.py <folder containing sim_size.py>
- sim3.py      – Minimax's test cases 3 and 5. Usage: python sim3.py <same folder>
- sim_power.py – GLM's power comparison. Usage: python sim_power.py <same folder>
- golden.py    – golden values and worked examples (GLD-01/02, SYN-06/07, UNI-01/04, MDT, n*).

Seeds are fixed, 2,000 series per cell unless stated. The MK-AR1 variant here follows
GPT-6 Astra's description; check it against the spec pack's own implementation (docs/03_SCIENCE.md).

Added 2 Nov, for the red-team review (playbook section 9):

- rt_check.py  – the red team's stress tests (no trend): AR(1) 0.6, sum of AR(1) 0.1 and 0.9,
                 AR(2) 0.15/0.65, at 25 years (4,000 series) and 45 years (2,000); also plain MK,
                 pre-whitening, the Santer t-test and a per-series Ljung-Box check of leftover memory;
                 the date-compression example and the cube-size arithmetic.
                 Usage: python rt_check.py <same folder>
- rt_check2.py – coverage of the widened Sen interval for multipliers 1.96 to 2.35 at 20-46 years,
                 MK-AR1 with growing spread, and Sen(A - B) against Sen(A) - Sen(B).
                 Usage: python rt_check2.py <same folder>
- rt_pool.py   – power of a pooled leftover-memory check across 5 or 20 independent cells.
                 Usage: python rt_pool.py <same folder>

golden.py still prints values without asserting them; turning it into a failing test suite is
on the playbook's list for 5 Nov.
