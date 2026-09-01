(function (global) {
  'use strict';

  const MM = global.MM;

  const tiltedCache = {};
  function tiltedSeries(tiltKey) {
    if (tiltedCache[tiltKey]) return tiltedCache[tiltKey];
    const tilt = MM.SECTOR_TILTS[tiltKey];
    const dates = MM.INDEX_DATES;
    const map = new Map();
    let value = MM.getIndexValue(dates[0]);
    map.set(dates[0], value);
    for (let i = 1; i < dates.length; i++) {
      const prev = MM.getIndexValue(dates[i - 1]);
      const cur = MM.getIndexValue(dates[i]);
      const logRet = Math.log(cur / prev);
      const ev = MM.eventForDate(dates[i]);
      const factor = (ev && tilt.windows[ev.id] != null) ? tilt.windows[ev.id] : tilt.base;
      value = value * Math.exp(logRet * factor);
      map.set(dates[i], value);
    }
    tiltedCache[tiltKey] = map;
    return map;
  }

  const INSTRUMENTS = {
    equity_index: (d) => MM.getIndexValue(d),
    nifty: (d) => MM.getNiftyValue(d),
    gold: (d) => MM.getGoldValue(d),
    diversified: (d) => tiltedSeries('diversified').get(MM.nearestTradingDate(d)),
    concentrated_realty: (d) => tiltedSeries('concentrated_realty').get(MM.nearestTradingDate(d)),
    concentrated_it: (d) => tiltedSeries('concentrated_it').get(MM.nearestTradingDate(d)),
    defensive_fmcg_pharma: (d) => tiltedSeries('defensive_fmcg_pharma').get(MM.nearestTradingDate(d)),
  };

  const INSTRUMENT_LABELS = {
    equity_index: 'Broad equity (Sensex-tracker)',
    nifty: 'Broad equity (Nifty-tracker)',
    gold: 'Gold',
    diversified: 'Diversified multi-sector equity',
    concentrated_realty: 'Concentrated: Realty/Auto',
    concentrated_it: 'Concentrated: IT',
    defensive_fmcg_pharma: 'Defensive: FMCG/Pharma',
  };

  function tradingDatesBetween(startDate, endDate) {
    const all = MM.INDEX_DATES;
    const s = MM.nearestTradingDate(startDate);
    const e = endDate ? MM.nearestTradingDate(endDate) : all[all.length - 1];
    const si = all.indexOf(s);
    const ei = all.indexOf(e);
    return all.slice(si, ei + 1);
  }

  function simulatePortfolio(weights, initialBalance, startDate, endDate, rebalance) {
    const keys = Object.keys(weights).filter((k) => weights[k] > 0);
    const dates = tradingDatesBetween(startDate, endDate);
    if (!dates.length) return [];

    const totalWeight = keys.reduce((s, k) => s + weights[k], 0);
    const cashWeight = Math.max(0, 1 - totalWeight);

    const startPrices = {};
    keys.forEach((k) => { startPrices[k] = INSTRUMENTS[k](dates[0]); });

    const shares = {};
    keys.forEach((k) => { shares[k] = (initialBalance * weights[k]) / startPrices[k]; });
    let cash = initialBalance * cashWeight;

    const rebalanceMarks = new Set();
    if (rebalance) {
      let lastPeriod = null;
      for (const d of dates) {
        const period = rebalance === 'M' ? d.slice(0, 7)
          : rebalance === 'Q' ? d.slice(0, 4) + '-Q' + Math.ceil(+d.slice(5, 7) / 3)
          : d.slice(0, 4);
        if (period !== lastPeriod) { rebalanceMarks.add(d); lastPeriod = period; }
      }
      rebalanceMarks.delete(dates[0]);
    }

    const records = [];
    for (const d of dates) {
      const holdingValues = {};
      let totalValue = cash;
      for (const k of keys) {
        const price = INSTRUMENTS[k](d);
        holdingValues[k] = shares[k] * price;
        totalValue += holdingValues[k];
      }
      records.push(Object.assign({ date: d, total_value: totalValue, cash }, holdingValues));

      if (rebalanceMarks.has(d)) {
        for (const k of keys) {
          const price = INSTRUMENTS[k](d);
          shares[k] = (totalValue * weights[k]) / price;
        }
        cash = totalValue * cashWeight;
      }
    }
    return records;
  }

  function computeMetrics(records) {
    if (!records.length) return null;
    const values = records.map((r) => r.total_value);
    const totalReturnPct = (values[values.length - 1] / values[0] - 1) * 100;

    let peak = values[0], maxDrawdown = 0;
    for (const v of values) {
      peak = Math.max(peak, v);
      maxDrawdown = Math.min(maxDrawdown, (v - peak) / peak);
    }

    const dailyReturns = [];
    for (let i = 1; i < values.length; i++) dailyReturns.push(values[i] / values[i - 1] - 1);
    const mean = dailyReturns.reduce((s, v) => s + v, 0) / dailyReturns.length;
    const variance = dailyReturns.reduce((s, v) => s + (v - mean) ** 2, 0) / Math.max(1, dailyReturns.length - 1);
    const annualizedVolPct = Math.sqrt(variance) * Math.sqrt(252) * 100;

    return {
      total_return_pct: Math.round(totalReturnPct * 100) / 100,
      max_drawdown_pct: Math.round(maxDrawdown * 100 * 100) / 100,
      annualized_volatility_pct: Math.round(annualizedVolPct * 100) / 100,
      end_value: values[values.length - 1],
    };
  }

  global.MMPortfolio = { simulatePortfolio, computeMetrics, INSTRUMENTS, INSTRUMENT_LABELS, tradingDatesBetween };
})(window);
