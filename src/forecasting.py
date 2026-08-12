import warnings

import numpy as np
import pandas as pd
from scipy.stats import norm
from sklearn.linear_model import LinearRegression
from statsmodels.tsa.arima.model import ARIMA

FEATURE_COLS = ['daily_return', 'ma_20', 'ma_50', 'ma_200', 'rsi_14', 'macd', 'macd_signal', 'volatility_20d']
TARGET_COL = 'target_log_return_5d'
HORIZON = 5
ARIMA_ORDER = (5, 0, 0)


def build_feature_target_table(asset_df, horizon=HORIZON):
    """Backward-looking features + forward-looking target for one asset's price history."""
    df = asset_df.sort_values('date').set_index('date').copy()
    df[TARGET_COL] = np.log(df['Close'].shift(-horizon)) - np.log(df['Close'])
    return df[FEATURE_COLS + [TARGET_COL, 'Close']].dropna()


def train_eval_linreg(feature_table, cfg):
    """Walk-forward linear regression: refit on all data strictly before each test day."""
    test_dates = feature_table.loc[cfg['test_start']:cfg['test_end']].index
    preds = {}
    for date in test_dates:
        train_slice = feature_table[feature_table.index < date]
        model = LinearRegression().fit(train_slice[FEATURE_COLS], train_slice[TARGET_COL])
        preds[date] = model.predict(feature_table.loc[[date], FEATURE_COLS])[0]
    predicted = pd.Series(preds)
    actual = feature_table.loc[predicted.index, TARGET_COL]
    return predicted, actual


def train_eval_arima(feature_table, cfg, order=ARIMA_ORDER, horizon=HORIZON):
    """Walk-forward ARIMA: fit once on training data, then update state (no refit) as each test day's actual return arrives.

    Returns (predicted, actual, converged) -- `converged` flags whether the initial MLE fit actually
    converged, so a shaky fit for one ticker/window is visible in the results instead of a buried warning.
    """
    full_log_returns = np.log(feature_table['Close']).diff().dropna()
    train_log_returns = full_log_returns.loc[:cfg['train_end']]
    test_dates = feature_table.loc[cfg['test_start']:cfg['test_end']].index

    with warnings.catch_warnings():
        warnings.simplefilter('ignore')
        fitted = ARIMA(train_log_returns, order=order).fit(method_kwargs={'maxiter': 200})
        converged = bool(fitted.mle_retvals.get('converged', True)) if hasattr(fitted, 'mle_retvals') else True

        preds = {}
        for date in test_dates:
            if date in full_log_returns.index:
                fitted = fitted.append([full_log_returns.loc[date]], refit=False)
            forecast = fitted.get_forecast(steps=horizon)
            preds[date] = forecast.predicted_mean.sum()

    predicted = pd.Series(preds)
    actual = feature_table.loc[predicted.index, TARGET_COL]
    return predicted, actual, converged


def safe_asset_name(ticker):
    """Filesystem-safe asset name for saved model filenames (e.g. '^NSEI' -> 'IDX_NSEI')."""
    return ticker.replace('^', 'IDX_')


def train_eval_tree_model(feature_table, cfg, model_factory, refit_every=20):
    """Walk-forward evaluation for a tree-based regressor (Random Forest, XGBoost, ...).

    Refits every `refit_every` trading days on an expanding window, rather than daily like
    the linear regression baseline -- refitting a tree ensemble at every single test day is
    far more expensive than linear regression's closed-form OLS fit, so this trades a little
    recency for tractable runtime. No-lookahead still holds: every prediction only ever uses
    a model trained on data strictly before it, just not necessarily refreshed as of yesterday.

    Returns (predicted, actual, last_model, last_importances) -- `last_model` is the fit
    trained on the most data in the window (the final refit), used as the saved artifact;
    `last_importances` is a Series of feature_importances_ from that same fit, or None if
    the model doesn't expose one.
    """
    test_dates = feature_table.loc[cfg['test_start']:cfg['test_end']].index
    preds = {}
    model = None
    last_importances = None

    with warnings.catch_warnings():
        warnings.simplefilter('ignore')
        for i, date in enumerate(test_dates):
            if model is None or i % refit_every == 0:
                train_slice = feature_table[feature_table.index < date]
                model = model_factory()
                model.fit(train_slice[FEATURE_COLS], train_slice[TARGET_COL])
                if hasattr(model, 'feature_importances_'):
                    last_importances = pd.Series(model.feature_importances_, index=FEATURE_COLS)
            preds[date] = model.predict(feature_table.loc[[date], FEATURE_COLS])[0]

    predicted = pd.Series(preds)
    actual = feature_table.loc[predicted.index, TARGET_COL]
    return predicted, actual, model, last_importances


def directional_accuracy_ci(n_correct, n_total, confidence=0.95):
    """Wilson score interval for a directional-accuracy proportion, plus a two-sided z-test against 50% (random chance).

    `significant_better_than_random` = real skill (accuracy significantly above 50%).
    `significant_worse_than_random` = reliably wrong (accuracy significantly below 50%), not just noisy.
    """
    if n_total == 0:
        return {
            'ci_low': np.nan, 'ci_high': np.nan, 'p_value_vs_random': np.nan,
            'significant_vs_random': False, 'significant_better_than_random': False,
            'significant_worse_than_random': False,
        }

    p_hat = n_correct / n_total
    z = norm.ppf(1 - (1 - confidence) / 2)

    denom = 1 + z ** 2 / n_total
    center = (p_hat + z ** 2 / (2 * n_total)) / denom
    margin = z * np.sqrt(p_hat * (1 - p_hat) / n_total + z ** 2 / (4 * n_total ** 2)) / denom

    z_stat = (p_hat - 0.5) / np.sqrt(0.5 * 0.5 / n_total)
    p_value = 2 * (1 - norm.cdf(abs(z_stat)))
    is_significant = p_value < 0.05

    return {
        'ci_low': round((center - margin) * 100, 1),
        'ci_high': round((center + margin) * 100, 1),
        'p_value_vs_random': round(float(p_value), 4),
        'significant_vs_random': bool(is_significant),
        'significant_better_than_random': bool(is_significant and p_hat > 0.5),
        'significant_worse_than_random': bool(is_significant and p_hat < 0.5),
    }


def compute_eval_metrics(actual_log_return, predicted_log_return):
    """MAE/RMSE in % return terms, plus directional accuracy with a confidence interval and significance test vs random chance."""
    actual_pct = (np.exp(actual_log_return) - 1) * 100
    predicted_pct = (np.exp(predicted_log_return) - 1) * 100
    errors = predicted_pct - actual_pct

    correct = (np.sign(predicted_pct) == np.sign(actual_pct))
    n_total = len(correct)
    n_correct = int(correct.sum())
    directional_accuracy = n_correct / n_total * 100 if n_total else np.nan

    ci = directional_accuracy_ci(n_correct, n_total)

    return {
        'mae_pct': round(float(errors.abs().mean()), 3),
        'rmse_pct': round(float(np.sqrt((errors ** 2).mean())), 3),
        'directional_accuracy_pct': round(float(directional_accuracy), 1),
        'dir_acc_ci_low': ci['ci_low'],
        'dir_acc_ci_high': ci['ci_high'],
        'p_value_vs_random': ci['p_value_vs_random'],
        'significant_vs_random': ci['significant_vs_random'],
        'significant_better_than_random': ci['significant_better_than_random'],
        'significant_worse_than_random': ci['significant_worse_than_random'],
        'n_predictions': n_total,
    }
