"""
Extracts day-by-day actual-vs-predicted price series (plus per-day error and
directional correctness) for every (asset, window, model) combination that has
a saved model artifact in models/, and writes one JSON file per (asset, window)
to public/data/replay/, plus an index.json listing everything written.

Inference and deterministic replay only -- nothing is retrained, refit (in the
sense of re-estimating parameters), or overwritten:

- LSTM was trained once per window, so this just loads the saved bundle and
  predicts -- plain inference, no replay needed.
- Random Forest and XGBoost were refit every 20 trading days during their
  original walk-forward evaluation, but only the LAST fit was saved. Using
  only that model to predict the whole window would both violate no-lookahead
  for early test dates and fail to reproduce the metrics already published in
  results/. So this replays the same periodic-refit schedule with the same
  hyperparameters and random_state as the original notebooks -- this
  regenerates values that were already computed once and discarded, it does
  not introduce a different model.
- ARIMA's saved model is its final state after absorbing the whole test
  window. Its fitted parameters never changed after the initial fit (every
  later .append() used refit=False), so this reconstructs the pre-test-window
  state via .filter(saved_params) -- applying already-learned parameters,
  never re-estimating them -- then replays the same append+forecast loop.
- Linear regression was refit fresh every single test day; reproducing its
  series means re-running that same deterministic daily-refit loop (identical
  code, identical data -- not a new model).

Window-agnostic by design: windows and assets are discovered by reading the
metadata JSON already saved alongside every model artifact (not a hardcoded
window list), so re-running this unchanged after new window artifacts land
picks them up automatically.
"""

import json
import pickle
from pathlib import Path

import numpy as np
import pandas as pd
import pyarrow.parquet as pq
import torch
from sklearn.ensemble import RandomForestRegressor
from statsmodels.tsa.arima.model import ARIMA
from xgboost import XGBRegressor

import sys

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.append(str(PROJECT_ROOT))

from src.forecasting import ARIMA_ORDER, build_feature_target_table, safe_asset_name, train_eval_linreg, train_eval_tree_model
from src.sequence_model import build_sequences, predict_lstm

MODELS_DIR = PROJECT_ROOT / 'models'
PROCESSED_DIR = PROJECT_ROOT / 'data' / 'processed'
OUTPUT_DIR = PROJECT_ROOT / 'public' / 'data' / 'replay'

HORIZON = 5
REFIT_EVERY = 20  # must match the original Phase 3b training cadence

WINDOW_LABELS = {
    '2008_financial_crisis': '2008 Financial Crisis',
    'covid_crash': 'COVID-19 Crash',
    'normal': 'Normal Market (2017)',
}


def window_label(window_key):
    return WINDOW_LABELS.get(window_key, window_key.replace('_', ' ').title())


def make_random_forest():
    # n_jobs=1, not -1: running alongside torch/MPS in the same process, the native
    # multi-threaded code here can conflict with MPS's own threads and segfault on macOS.
    return RandomForestRegressor(n_estimators=200, max_depth=5, min_samples_leaf=20, random_state=42, n_jobs=1)


def make_xgboost():
    return XGBRegressor(n_estimators=200, max_depth=4, learning_rate=0.05, subsample=0.8, colsample_bytree=0.8, random_state=42, n_jobs=1)


TREE_FACTORIES = {'random_forest': make_random_forest, 'xgboost': make_xgboost}


def discover_artifacts():
    """Group every models/*.json by (window, asset), keyed off the metadata's own fields --
    not filename parsing -- so this is correct regardless of naming and picks up new windows
    automatically."""
    groups = {}
    for meta_path in sorted(MODELS_DIR.glob('*.json')):
        with open(meta_path) as f:
            meta = json.load(f)
        key = (meta['window'], meta['asset'])
        groups.setdefault(key, {})[meta['model_type']] = meta
    return groups


def shift_trading_days(dates_index, all_dates, n):
    """For each date in dates_index, the date n trading days later within all_dates (the
    asset's full available trading calendar). None if that runs past available data."""
    positions = all_dates.get_indexer(dates_index)
    shifted = []
    for pos in positions:
        target_pos = pos + n
        shifted.append(all_dates[target_pos] if 0 <= target_pos < len(all_dates) else None)
    return shifted


def replay_arima(feature_table, meta):
    base = 'arima_' + safe_asset_name(meta['asset']) + '_' + meta['window']
    with open(MODELS_DIR / (base + '.pkl'), 'rb') as f:
        saved = pickle.load(f)

    full_log_returns = np.log(feature_table['Close']).diff().dropna()
    train_log_returns = full_log_returns.loc[:meta['train_end']]
    test_dates = feature_table.loc[meta['test_start']:meta['test_end']].index

    fitted = ARIMA(train_log_returns, order=ARIMA_ORDER).filter(saved.params)
    preds = {}
    for date in test_dates:
        if date in full_log_returns.index:
            fitted = fitted.append([full_log_returns.loc[date]], refit=False)
        forecast = fitted.get_forecast(steps=HORIZON)
        preds[date] = forecast.predicted_mean.sum()
    return pd.Series(preds)


def get_predictions(model_type, meta, feature_table, device):
    """Returns predicted 5-day-forward log returns as a pandas Series, indexed by the
    ORIGINAL prediction date (before the +5-trading-day shift applied by the caller)."""
    cfg = {'train_end': meta['train_end'], 'test_start': meta['test_start'], 'test_end': meta['test_end']}

    if model_type == 'lstm':
        base = 'lstm_' + safe_asset_name(meta['asset']) + '_' + meta['window']
        bundle = torch.load(MODELS_DIR / (base + '.pt'), weights_only=False)
        X, y, seq_dates = build_sequences(feature_table, bundle['seq_len'])
        test_mask = (seq_dates >= pd.Timestamp(cfg['test_start'])) & (seq_dates <= pd.Timestamp(cfg['test_end']))
        X_test, test_dates = X[test_mask], seq_dates[test_mask]
        n_features = X_test.shape[-1]
        X_test_scaled = bundle['scaler'].transform(X_test.reshape(-1, n_features)).reshape(X_test.shape)
        preds = predict_lstm(bundle['model'], X_test_scaled, device)
        return pd.Series(preds, index=test_dates)

    if model_type == 'arima':
        return replay_arima(feature_table, meta)

    if model_type == 'linear_regression':
        predicted, _ = train_eval_linreg(feature_table, cfg)
        return predicted

    if model_type in TREE_FACTORIES:
        predicted, _, _, _ = train_eval_tree_model(feature_table, cfg, TREE_FACTORIES[model_type], refit_every=REFIT_EVERY)
        return predicted

    raise ValueError('Unknown model_type: ' + model_type)


def clean(value, digits=2):
    if value is None or (isinstance(value, float) and np.isnan(value)):
        return None
    return round(float(value), digits)


def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    master = pq.read_table(PROCESSED_DIR / 'marketminds_master.parquet').to_pandas()
    device = torch.device('mps' if torch.backends.mps.is_available() else 'cpu')
    print('Using device:', device)

    groups = discover_artifacts()
    print(f'Discovered {len(groups)} (window, asset) combinations across models/*.json\n')

    index_records = []

    for (window, asset), models_meta in sorted(groups.items()):
        asset_df = master[master['ticker'] == asset]
        feature_table = build_feature_target_table(asset_df)
        close = feature_table['Close']
        all_dates = feature_table.index

        model_predicted_price, model_abs_error, model_direction_correct = {}, {}, {}
        target_dates_ref = None

        for model_type, meta in models_meta.items():
            print(f'  {window} / {asset} / {model_type} ...')
            pred_log_return = get_predictions(model_type, meta, feature_table, device)

            origin_dates = pred_log_return.index
            target_dates = shift_trading_days(origin_dates, all_dates, HORIZON)

            predicted_price, abs_error, direction_correct, kept_targets = [], [], [], []
            for origin_date, target_date, pred_ret in zip(origin_dates, target_dates, pred_log_return.values):
                if target_date is None:
                    continue
                origin_price = close.loc[origin_date]
                actual_price_at_target = float(close.loc[target_date])
                pred_price = float(origin_price * np.exp(pred_ret))
                actual_ret = float(np.log(actual_price_at_target / origin_price))

                predicted_price.append(pred_price)
                abs_error.append(abs(pred_price - actual_price_at_target))
                direction_correct.append(bool(np.sign(pred_ret) == np.sign(actual_ret)))
                kept_targets.append(target_date)

            idx = pd.DatetimeIndex(kept_targets)
            model_predicted_price[model_type] = pd.Series(predicted_price, index=idx)
            model_abs_error[model_type] = pd.Series(abs_error, index=idx)
            model_direction_correct[model_type] = pd.Series(direction_correct, index=idx)
            target_dates_ref = idx if target_dates_ref is None else target_dates_ref.union(idx)

        if target_dates_ref is None or len(target_dates_ref) == 0:
            continue

        all_target_dates = target_dates_ref.sort_values()
        dates_list = [d.date().isoformat() for d in all_target_dates]
        actual_list = [clean(close.loc[d]) if d in close.index else None for d in all_target_dates]

        predicted_out, abs_error_out, direction_correct_out = {}, {}, {}
        for model_type in models_meta:
            predicted_out[model_type] = [clean(model_predicted_price[model_type].get(d)) for d in all_target_dates]
            abs_error_out[model_type] = [clean(model_abs_error[model_type].get(d)) for d in all_target_dates]
            direction_correct_out[model_type] = [
                (bool(v) if pd.notna(v) else None) for v in (model_direction_correct[model_type].get(d) for d in all_target_dates)
            ]

        payload = {
            'asset': asset,
            'window': window,
            'window_label': window_label(window),
            'start_date': dates_list[0],
            'end_date': dates_list[-1],
            'dates': dates_list,
            'actual': actual_list,
            'predicted': predicted_out,
            'abs_error': abs_error_out,
            'direction_correct': direction_correct_out,
        }

        out_name = safe_asset_name(asset) + '_' + window + '.json'
        with open(OUTPUT_DIR / out_name, 'w') as f:
            json.dump(payload, f)

        index_records.append({
            'asset': asset,
            'window': window,
            'window_label': window_label(window),
            'file': out_name,
            'start_date': dates_list[0],
            'end_date': dates_list[-1],
            'models': sorted(models_meta.keys()),
        })
        print(f'    wrote {out_name} ({len(dates_list)} dates, models={sorted(models_meta.keys())})\n')

    with open(OUTPUT_DIR / 'index.json', 'w') as f:
        json.dump(index_records, f, indent=2)

    print(f'Done. {len(index_records)} files written to {OUTPUT_DIR}')


if __name__ == '__main__':
    main()
