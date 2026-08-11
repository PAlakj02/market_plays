import numpy as np
import pandas as pd


def simulate_portfolio(close_wide, weights, initial_balance, start_date, end_date=None, rebalance=None, max_fill_days=5):
    """Simulate a buy-and-hold (or periodically rebalanced) portfolio against a wide date x ticker close-price matrix."""
    tickers = list(weights.keys())
    missing = [t for t in tickers if t not in close_wide.columns]
    if missing:
        raise ValueError(f'Unknown ticker(s) not in dataset: {missing}')

    prices = close_wide.loc[start_date:end_date, tickers].copy()
    unavailable = [t for t in tickers if prices[t].isna().all() or prices[t].first_valid_index() > prices.index[0]]
    if unavailable:
        print('Warning: no price data at start_date for:', unavailable, '-- excluded from this simulation')
    tickers = [t for t in tickers if t not in unavailable]
    prices = prices[tickers]

    # Cap the forward-fill the same way Phase 1 does, instead of silently flattening
    # a long real gap (e.g. a thinly-traded ETF in its early days) into a fake flat price.
    filled = prices.ffill(limit=max_fill_days)
    long_gaps = filled.isna().sum()
    long_gaps = long_gaps[long_gaps > 0]
    if len(long_gaps):
        print(f'Warning: gaps longer than {max_fill_days} days (flat-filled anyway, treat as low-confidence for these tickers/periods):')
        print(long_gaps)
    prices = filled.ffill()

    total_weight = sum(weights[t] for t in tickers)
    cash_weight = max(0.0, 1.0 - total_weight)

    shares = {t: (initial_balance * weights[t]) / prices[t].iloc[0] for t in tickers}
    cash = initial_balance * cash_weight

    if rebalance:
        period_index = prices.index.to_period(rebalance)
        rebalance_marks = set(pd.Series(prices.index, index=period_index).groupby(level=0).min())
    else:
        rebalance_marks = set()

    records = []
    for date, row in prices.iterrows():
        holding_values = {t: shares[t] * row[t] for t in tickers}
        total_value = sum(holding_values.values()) + cash
        records.append({'date': date, 'total_value': total_value, 'cash': cash, **holding_values})

        if date in rebalance_marks and date != prices.index[0]:
            for t in tickers:
                shares[t] = (total_value * weights[t]) / row[t]
            cash = total_value * cash_weight

    return pd.DataFrame(records).set_index('date')


def compute_metrics(portfolio_df, freq_per_year=252):
    """Total return, max drawdown, and annualized volatility for a simulate_portfolio() result."""
    values = portfolio_df['total_value']
    total_return = (values.iloc[-1] / values.iloc[0] - 1) * 100
    drawdown = (values - values.cummax()) / values.cummax()
    daily_returns = values.pct_change().dropna()
    annualized_vol = daily_returns.std() * np.sqrt(freq_per_year) * 100
    return {
        'total_return_pct': round(total_return, 2),
        'max_drawdown_pct': round(drawdown.min() * 100, 2),
        'annualized_volatility_pct': round(annualized_vol, 2),
    }
