import time

import numpy as np
import pandas as pd
import torch
import torch.nn as nn
from sklearn.preprocessing import StandardScaler

from src.forecasting import FEATURE_COLS, TARGET_COL


class LSTMForecaster(nn.Module):
    """Modest 1-2 layer LSTM/GRU regressor: a sequence of daily features maps to a single
    scalar 5-day-forward return, taken from the final timestep's hidden state."""

    def __init__(self, n_features, hidden_size=32, num_layers=1, cell_type='lstm'):
        super().__init__()
        rnn_cls = nn.LSTM if cell_type == 'lstm' else nn.GRU
        self.rnn = rnn_cls(input_size=n_features, hidden_size=hidden_size, num_layers=num_layers, batch_first=True)
        self.head = nn.Linear(hidden_size, 1)

    def forward(self, x):
        out, _ = self.rnn(x)
        last_hidden = out[:, -1, :]
        return self.head(last_hidden).squeeze(-1)


def build_sequences(feature_table, seq_len):
    """Sliding-window sequences of FEATURE_COLS, each ending on the day whose
    target_log_return_5d it predicts -- same target as every other model in this project."""
    feature_values = feature_table[FEATURE_COLS].values.astype('float32')
    targets = feature_table[TARGET_COL].values.astype('float32')
    dates = feature_table.index

    X, y, seq_dates = [], [], []
    for i in range(seq_len - 1, len(feature_table)):
        X.append(feature_values[i - seq_len + 1:i + 1])
        y.append(targets[i])
        seq_dates.append(dates[i])

    return np.array(X), np.array(y), pd.DatetimeIndex(seq_dates)


def scale_sequences(X_train, X_other, scaler=None):
    """Fit a StandardScaler on training sequences only (flattened across time), apply to both --
    never let the scaler see test-period data, same no-lookahead discipline as every other model."""
    n_features = X_train.shape[-1]
    if scaler is None:
        scaler = StandardScaler()
        scaler.fit(X_train.reshape(-1, n_features))
    X_train_scaled = scaler.transform(X_train.reshape(-1, n_features)).reshape(X_train.shape)
    X_other_scaled = scaler.transform(X_other.reshape(-1, n_features)).reshape(X_other.shape)
    return X_train_scaled, X_other_scaled, scaler


def train_lstm(X_train, y_train, X_val, y_val, device, hidden_size=32, num_layers=1, cell_type='lstm',
               max_epochs=50, patience=5, lr=1e-3, batch_size=64):
    """Train with early stopping on a chronological validation split (the most recent slice of
    training data -- never a random shuffle, since that would leak future-relative-to-validation
    information into training for a time series)."""
    n_features = X_train.shape[-1]
    model = LSTMForecaster(n_features, hidden_size, num_layers, cell_type).to(device)
    optimizer = torch.optim.Adam(model.parameters(), lr=lr)
    loss_fn = nn.MSELoss()

    X_train_t = torch.tensor(X_train, dtype=torch.float32, device=device)
    y_train_t = torch.tensor(y_train, dtype=torch.float32, device=device)
    X_val_t = torch.tensor(X_val, dtype=torch.float32, device=device)
    y_val_t = torch.tensor(y_val, dtype=torch.float32, device=device)

    best_val_loss = float('inf')
    best_state = None
    patience_counter = 0
    n_samples = X_train_t.shape[0]
    epochs_trained = 0

    for epoch in range(max_epochs):
        epochs_trained = epoch + 1
        model.train()
        perm = torch.randperm(n_samples)
        for start in range(0, n_samples, batch_size):
            idx = perm[start:start + batch_size]
            xb, yb = X_train_t[idx], y_train_t[idx]
            optimizer.zero_grad()
            pred = model(xb)
            loss = loss_fn(pred, yb)
            loss.backward()
            optimizer.step()

        model.eval()
        with torch.no_grad():
            val_loss = loss_fn(model(X_val_t), y_val_t).item()

        if val_loss < best_val_loss - 1e-6:
            best_val_loss = val_loss
            best_state = {k: v.clone() for k, v in model.state_dict().items()}
            patience_counter = 0
        else:
            patience_counter += 1
            if patience_counter >= patience:
                break

    model.load_state_dict(best_state)
    return model, best_val_loss, epochs_trained


def predict_lstm(model, X, device):
    model.eval()
    with torch.no_grad():
        X_t = torch.tensor(X, dtype=torch.float32, device=device)
        return model(X_t).cpu().numpy()


def _fit_lstm_once(X_train_full, y_train_full, device, hidden_size, num_layers, cell_type,
                    max_epochs, patience, lr, batch_size, val_fraction):
    n_val = max(1, int(len(X_train_full) * val_fraction))
    X_train, y_train = X_train_full[:-n_val], y_train_full[:-n_val]
    X_val, y_val = X_train_full[-n_val:], y_train_full[-n_val:]
    X_train_scaled, X_val_scaled, scaler = scale_sequences(X_train, X_val)
    model, val_loss, epochs = train_lstm(
        X_train_scaled, y_train, X_val_scaled, y_val, device,
        hidden_size=hidden_size, num_layers=num_layers, cell_type=cell_type,
        max_epochs=max_epochs, patience=patience, lr=lr, batch_size=batch_size,
    )
    return model, scaler, val_loss, epochs


def train_eval_lstm(X, y, seq_dates, cfg, device, hidden_size=32, num_layers=1, cell_type='lstm',
                     max_epochs=50, patience=5, lr=1e-3, batch_size=64, val_fraction=0.15, refit_every=None):
    """Train on the expanding window up to test_start, then predict across the test window.

    `refit_every=None` (default): train once, use that fixed model for every test-window
    prediction. Fine for windows up to roughly a year or two -- retraining a neural net at every
    test day, or even every 20 days, would be far too slow for a basket this size, and one fit is
    enough when the test window is short.

    `refit_every=<trading days>`: periodically retrain -- a NEW model *and* a NEW feature scaler --
    on an expanding window at that cadence, similar to how Random Forest/XGBoost are refit every 20
    days. Needed for unusually long test windows (e.g. a multi-year bull run): price levels can
    drift far enough from the training period that a scaler calibrated at the start becomes badly
    out-of-distribution by the end. Tree models tolerate that gracefully; a neural net does not --
    this showed up as a 5-20x MAE blowup on the `bullrun` window before this was added.

    Expects pre-built sequences (X, y, seq_dates) from build_sequences(), shared across windows for
    the same asset to avoid rebuilding them multiple times.

    Returns (predicted, actual, model_bundle, info). `model_bundle` has everything needed to reload
    the model for inference (the LAST fitted model/scaler, when refit_every is set -- same
    save-the-final-fit convention as the tree models). `info` has total training_time_seconds
    (summed across all refits), epochs_trained (of the last fit), best_val_loss (of the last fit).
    """
    test_mask = (seq_dates >= pd.Timestamp(cfg['test_start'])) & (seq_dates <= pd.Timestamp(cfg['test_end']))
    X_test, y_test = X[test_mask], y[test_mask]
    test_dates = seq_dates[test_mask]

    train_mask = seq_dates <= pd.Timestamp(cfg['train_end'])
    X_train_full, y_train_full = X[train_mask], y[train_mask]

    if len(X_train_full) == 0 or len(X_test) == 0:
        return None, None, None, None

    fit_kwargs = dict(device=device, hidden_size=hidden_size, num_layers=num_layers, cell_type=cell_type,
                       max_epochs=max_epochs, patience=patience, lr=lr, batch_size=batch_size, val_fraction=val_fraction)
    n_features = X.shape[-1]
    total_training_time = 0.0

    if refit_every is None:
        start_time = time.time()
        model, scaler, best_val_loss, epochs_trained = _fit_lstm_once(X_train_full, y_train_full, **fit_kwargs)
        total_training_time = time.time() - start_time

        X_test_scaled = scaler.transform(X_test.reshape(-1, n_features)).reshape(X_test.shape)
        preds = predict_lstm(model, X_test_scaled, device)
    else:
        model, scaler, best_val_loss, epochs_trained = None, None, None, None
        preds = []
        for i in range(len(test_dates)):
            if model is None or i % refit_every == 0:
                cur_train_mask = seq_dates < test_dates[i]
                start_time = time.time()
                model, scaler, best_val_loss, epochs_trained = _fit_lstm_once(X[cur_train_mask], y[cur_train_mask], **fit_kwargs)
                total_training_time += time.time() - start_time
            X_today_scaled = scaler.transform(X_test[i:i + 1].reshape(-1, n_features)).reshape(1, X.shape[1], n_features)
            preds.append(float(predict_lstm(model, X_today_scaled, device)[0]))
        preds = np.array(preds)

    predicted = pd.Series(preds, index=test_dates)
    actual = pd.Series(y_test, index=test_dates)

    model_bundle = {
        'model': model, 'scaler': scaler, 'seq_len': X.shape[1],
        'hidden_size': hidden_size, 'num_layers': num_layers, 'cell_type': cell_type,
    }
    info = {
        'training_time_seconds': round(total_training_time, 1),
        'epochs_trained': epochs_trained,
        'best_val_loss': round(float(best_val_loss), 6) if best_val_loss is not None else None,
    }

    return predicted, actual, model_bundle, info
