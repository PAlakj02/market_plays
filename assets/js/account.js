(function (global) {
  'use strict';
  const STORAGE_KEY = 'account';
  const STARTING_BALANCE = 100000;

  function defaultAccount() {
    return { cash: STARTING_BALANCE, holdings: {}, transactions: [] };
  }

  function load() {
    const acc = MMApp.Storage.get(STORAGE_KEY, null);
    if (acc && typeof acc.cash === 'number' && acc.holdings && acc.transactions) return acc;
    const fresh = defaultAccount();
    MMApp.Storage.set(STORAGE_KEY, fresh);
    return fresh;
  }
  function save(acc) {
    MMApp.Storage.set(STORAGE_KEY, acc);
  }

  function buy(ticker, shares, price) {
    if (shares <= 0 || !isFinite(price) || price <= 0) throw new Error('Invalid order');
    const acc = load();
    const cost = shares * price;
    if (cost > acc.cash + 1e-6) throw new Error('Insufficient balance');
    acc.cash -= cost;
    const h = acc.holdings[ticker] || { shares: 0, avgPrice: 0 };
    const newShares = h.shares + shares;
    h.avgPrice = (h.avgPrice * h.shares + price * shares) / newShares;
    h.shares = newShares;
    acc.holdings[ticker] = h;
    acc.transactions.push({ type: 'buy', ticker, shares, price, cost, timestamp: Date.now() });
    save(acc);
    return acc;
  }

  function sell(ticker, shares, price) {
    if (shares <= 0 || !isFinite(price) || price <= 0) throw new Error('Invalid order');
    const acc = load();
    const h = acc.holdings[ticker];
    if (!h || h.shares < shares - 1e-9) throw new Error('Not enough shares');
    const proceeds = shares * price;
    h.shares -= shares;
    if (h.shares <= 1e-9) delete acc.holdings[ticker]; else acc.holdings[ticker] = h;
    acc.cash += proceeds;
    acc.transactions.push({ type: 'sell', ticker, shares, price, proceeds, timestamp: Date.now() });
    save(acc);
    return acc;
  }

  function holdingsWorth(acc, prices) {
    let total = 0;
    for (const t in acc.holdings) {
      const price = prices[t];
      if (price != null) total += acc.holdings[t].shares * price;
    }
    return total;
  }

  function reset() {
    const fresh = defaultAccount();
    save(fresh);
    return fresh;
  }

  global.MMAccount = { load, save, buy, sell, holdingsWorth, reset, STARTING_BALANCE };
})(window);
