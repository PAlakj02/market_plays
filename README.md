# MarketMinds

A web app that teaches financial literacy by letting students build a virtual portfolio
and replay real historical market data (NIFTY50, SENSEX, individual NSE stocks, gold,
India VIX, ~2000-2025) against it day by day — including an ML forecasting layer that
shows where prediction succeeds and fails.

Full proposal: `MarketMinds_Proposal (2).docx.md`

## Current Status

- **Phase 1 (data pipeline) — done.** `notebooks/01_data_pipeline.ipynb` builds the master
  dataset: NIFTY 50, SENSEX, a 19-stock sector-diversified basket, gold (GOLDBEES.NS), and
  India VIX, ~2000-2025, saved to `data/processed/marketminds_master.parquet`.
- **Phase 2 (backtesting/replay engine) — done.** `notebooks/02_backtesting_replay.ipynb`
  plus `src/backtest.py` simulate a student portfolio against real history: concentrated
  vs. diversified demos for the COVID and 2008 crashes, and a gold-vs-equity safe-haven
  comparison.
- **Phase 3 (baseline ML forecasting) — done.** `notebooks/03_baseline_models.ipynb`
  (single asset) and `notebooks/04_model_validation_full_basket.ipynb` (full basket, 20
  assets), plus `src/forecasting.py`, validate linear regression and ARIMA on
  next-5-day-return prediction — walk-forward, no lookahead, evaluated separately on
  normal / 2008 / COVID windows with directional accuracy, confidence intervals, and
  significance testing against random chance.

  **Headline finding**: ARIMA shows real, statistically significant skill in calm markets
  (40% of assets significantly better than random) but that skill flips to significantly
  *worse* than random in COVID (35% of assets) — not just losing an edge, but being
  confidently wrong. Linear regression shows weaker but consistent skill in calm/2008
  conditions, and goes statistically silent (not wrong, just underpowered at COVID's
  small sample size) rather than reversing. Full results in
  `results/phase3_significance_summary.csv` and
  `results/baseline_model_validation_full_basket.csv`.
- **Phase 3b (nonlinear models) — done.** `notebooks/04_nonlinear_models.ipynb` extends
  Phase 3 with Random Forest and XGBoost, same features/target/windows/basket, same
  significance testing, producing a four-model comparison (linear regression, ARIMA,
  Random Forest, XGBoost) across the full basket.

  **Headline finding**: Random Forest shows the strongest normal-market skill of all four
  models (50% of assets significantly better than random) but also the worst crash
  breakdown (50% of assets significantly *wrong* in COVID) — more flexible models find
  more real-looking patterns in calm markets, but those patterns are more likely to be
  regime-specific and backfire hardest when the regime breaks. Linear regression never
  becomes confidently wrong anywhere — it just goes weak/silent, a genuinely different
  failure mode than the other three models. XGBoost's low normal-market skill (15%) was
  verified as a real result via a hyperparameter sanity check (`results/phase3b_xgboost_
  sanity_check.csv`), not an under-fitting artifact. Full comparison in
  `results/phase3b_nonlinear_comparison.csv` and
  `results/nonlinear_model_validation_full_basket.csv`.
- **Next**: the LSTM (per the model roadmap), then the Next.js frontend.

## Stack

- Frontend: Next.js + Tailwind, deployed on Vercel
- Data / ML: Python — pandas, NumPy, scikit-learn, statsmodels, PyTorch
- Backend: Supabase (Postgres + auth)
- Data sources: yfinance, Kaggle baseline datasets, gold (GOLDBEES.NS), India VIX

## Setup

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
jupyter notebook
```

## Folder structure

```
data/
  raw/            # untouched pulls: yfinance, kaggle (gitignored)
  interim/        # partially cleaned (gitignored)
  processed/      # final cleaned datasets used everywhere downstream (gitignored)
notebooks/
  01_data_pipeline.ipynb                    # Phase 1: ingestion, cleaning, feature engineering
  02_backtesting_replay.ipynb               # Phase 2: portfolio replay engine
  03_baseline_models.ipynb                  # Phase 3: linear regression + ARIMA, single asset
  04_model_validation_full_basket.ipynb     # Phase 3: same models validated across full basket
  04_nonlinear_models.ipynb                 # Phase 3b: Random Forest + XGBoost, four-model comparison
src/
  backtest.py         # portfolio simulation engine (Phase 2)
  forecasting.py      # walk-forward model training/evaluation engine (Phase 3 + 3b)
models/           # saved trained artifacts (.pkl + .json metadata) — always trained offline
results/          # saved evaluation summary tables (.csv)
app/              # Next.js frontend
docs/
```

Models are always trained offline in notebooks and saved to `models/` — the app never trains live.
