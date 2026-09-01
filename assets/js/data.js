(function (global) {
  'use strict';

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function daysBetween(a, b) {
    return Math.round((b - a) / 86400000);
  }

  function addDays(date, n) {
    const d = new Date(date.getTime());
    d.setUTCDate(d.getUTCDate() + n);
    return d;
  }

  function isWeekend(d) {
    const day = d.getUTCDay();
    return day === 0 || day === 6;
  }

  function buildSeries(anchors, seed, volAt) {
    const rng = mulberry32(seed);
    const points = anchors.map(([ds, v]) => [new Date(ds + 'T00:00:00Z'), v]);
    const series = [];

    for (let i = 0; i < points.length - 1; i++) {
      const [d0, v0] = points[i];
      const [d1, v1] = points[i + 1];
      const totalDays = daysBetween(d0, d1);
      if (totalDays <= 0) continue;

      const offsets = [];
      for (let off = 0; off <= totalDays; off++) {
        const d = addDays(d0, off);
        if (!isWeekend(d)) offsets.push(off);
      }
      const n = offsets.length;
      if (n < 2) {
        series.push([d0, v0]);
        continue;
      }

      const logV0 = Math.log(v0), logV1 = Math.log(v1);
      const bridge = new Array(n).fill(0);
      for (let k = 1; k < n; k++) {
        const vol = volAt ? volAt(addDays(d0, offsets[k])) : 0.012;
        const step = (rng() - 0.5) * 2 * vol;
        bridge[k] = bridge[k - 1] + step;
      }
      const lastNoise = bridge[n - 1];
      for (let k = 0; k < n; k++) {
        const t = k / (n - 1);
        bridge[k] = bridge[k] - t * lastNoise;
      }

      for (let k = 0; k < n; k++) {
        const t = k / (n - 1);
        const drift = logV0 + (logV1 - logV0) * t;
        const value = Math.exp(drift + bridge[k]);
        series.push([addDays(d0, offsets[k]), i === points.length - 2 && k === n - 1 ? v1 : value]);
      }
      const lastPushedDate = addDays(d0, offsets[n - 1]);
      if (lastPushedDate.getTime() === d1.getTime()) series.pop();
    }
    series.push(points[points.length - 1]);
    return series;
  }

  const SENSEX_ANCHORS = [
    ['2000-01-03', 5150], ['2000-02-11', 5933], ['2000-09-01', 4500],
    ['2001-03-01', 4200], ['2001-09-21', 3560], ['2002-06-01', 3200],
    ['2003-04-01', 3120], ['2004-05-17', 4900], ['2005-01-03', 6600],
    ['2006-05-11', 12612], ['2006-06-14', 8929], ['2007-01-02', 13943],
    ['2008-01-08', 21206], ['2008-10-27', 8509], ['2009-03-09', 8160],
    ['2009-06-01', 14625], ['2010-11-05', 21005], ['2011-12-01', 15455],
    ['2013-01-02', 19426], ['2014-05-16', 25019], ['2015-01-02', 27887],
    ['2016-02-11', 22951], ['2016-09-08', 29077], ['2016-11-08', 27591],
    ['2016-12-26', 26230], ['2017-06-01', 31145], ['2018-01-29', 36443],
    ['2018-10-26', 33349], ['2019-06-03', 39683], ['2020-01-14', 41953],
    ['2020-03-23', 25981], ['2020-06-01', 33605], ['2021-02-01', 48601],
    ['2021-10-18', 61766], ['2022-06-17', 50921], ['2023-06-01', 62622],
    ['2023-12-01', 69825], ['2024-09-27', 85978], ['2025-02-01', 76171],
    ['2025-04-07', 73137], ['2025-09-01', 82500], ['2026-02-01', 87200],
    ['2026-08-24', 91400],
  ];

  const GOLD_ANCHORS = [
    ['2000-01-03', 4235], ['2003-04-01', 5200], ['2007-12-01', 10800],
    ['2008-10-27', 12500], ['2009-06-01', 14700], ['2009-12-01', 16000],
    ['2011-09-01', 28000], ['2013-04-01', 26000], ['2015-01-02', 26800],
    ['2019-06-01', 32000], ['2020-01-14', 40000], ['2020-03-23', 42500],
    ['2020-08-07', 56000], ['2021-01-01', 48700], ['2022-01-03', 48000],
    ['2023-01-02', 55000], ['2024-01-01', 63000], ['2024-09-27', 73000],
    ['2025-02-01', 78500], ['2025-09-01', 84000], ['2026-08-24', 92000],
  ];

  const VOL_WINDOWS = [
    ['2000-02-11', '2001-09-21', 0.024],
    ['2003-04-01', '2008-01-08', 0.016],
    ['2008-01-08', '2009-03-09', 0.028],
    ['2009-03-09', '2010-11-05', 0.020],
    ['2016-11-08', '2016-12-26', 0.020],
    ['2020-01-14', '2020-03-23', 0.032],
    ['2020-03-23', '2020-06-01', 0.026],
    ['2020-06-01', '2021-10-18', 0.018],
    ['2024-09-27', '2025-04-07', 0.018],
  ];
  function volAtDate(baseVol) {
    const windows = VOL_WINDOWS.map(([a, b, v]) => [new Date(a), new Date(b), v]);
    return function (d) {
      for (const [a, b, v] of windows) if (d >= a && d <= b) return v;
      return baseVol;
    };
  }

  const INDEX_SERIES = buildSeries(SENSEX_ANCHORS, 42, volAtDate(0.010));
  const GOLD_SERIES = buildSeries(GOLD_ANCHORS, 1337, volAtDate(0.009));

  const NIFTY_RATIO = 2.95;

  function seriesToMap(series) {
    const map = new Map();
    for (const [d, v] of series) map.set(d.toISOString().slice(0, 10), v);
    return map;
  }
  const INDEX_MAP = seriesToMap(INDEX_SERIES);
  const GOLD_MAP = seriesToMap(GOLD_SERIES);
  const INDEX_DATES = INDEX_SERIES.map(([d]) => d.toISOString().slice(0, 10));

  function nearestTradingDate(dateStr) {
    if (INDEX_MAP.has(dateStr)) return dateStr;
    let lo = 0, hi = INDEX_DATES.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (INDEX_DATES[mid] < dateStr) lo = mid + 1; else hi = mid;
    }
    return INDEX_DATES[Math.min(lo, INDEX_DATES.length - 1)];
  }

  function getIndexValue(dateStr) {
    return INDEX_MAP.get(nearestTradingDate(dateStr));
  }
  function getGoldValue(dateStr) {
    return GOLD_MAP.get(nearestTradingDate(dateStr));
  }
  function getNiftyValue(dateStr) {
    return getIndexValue(dateStr) / NIFTY_RATIO;
  }

  const EVENTS = [
    {
      id: 'dotcom', order: 1, moduleNum: 1,
      label: '2000–01 · Dot-com crash', short: 'Dot-com crash',
      start: '2000-02-11', end: '2001-09-21',
      theme: 'volatility', title: 'Risk & volatility',
      badge: 'crash',
      summary: 'The Sensex fell roughly 40% from its Feb 2000 peak as the global dot-com bubble unwound and the Ketan Parekh scandal hit Indian markets.',
    },
    {
      id: 'bullrun', order: 2, moduleNum: 2,
      label: '2003–07 · Bull run', short: 'Bull run',
      start: '2003-04-01', end: '2008-01-08',
      theme: 'compounding', title: 'Market cycles & compounding',
      badge: 'rally',
      summary: 'A multi-year expansion took the Sensex from ~3,120 to an all-time high above 21,000, nearly a 6x return, and the clearest lesson in why time in the market compounds.',
    },
    {
      id: 'gfc2008', order: 3, moduleNum: 3,
      label: '2008 · Financial crisis', short: 'Financial crisis',
      start: '2008-01-08', end: '2009-03-09',
      theme: 'diversification', title: 'Diversification',
      badge: 'crash',
      summary: 'The global financial crisis erased roughly 60% of the Sensex from its Jan 2008 peak to the Mar 2009 trough, the deepest drawdown in the dataset.',
    },
    {
      id: 'recovery0910', order: 4, moduleNum: 6,
      label: '2009–10 · Recovery rally', short: 'Recovery rally',
      start: '2009-03-09', end: '2010-11-05',
      theme: 'reentry', title: 'Recovery & re-entry timing',
      badge: 'rally',
      summary: 'From the Mar 2009 low, the Sensex rallied roughly 150% in under two years. Investors who stayed in cash through the bottom missed most of the recovery.',
    },
    {
      id: 'demon2016', order: 5, moduleNum: 7,
      label: '2016 · Demonetization', short: 'Demonetization',
      start: '2016-11-08', end: '2016-12-26',
      theme: 'policy', title: 'Policy shocks',
      badge: 'crash',
      summary: 'The overnight withdrawal of ₹500/₹1,000 notes triggered a short, sharp ~5% dip, a reminder that policy decisions move markets independent of company fundamentals.',
    },
    {
      id: 'covid2020', order: 6, moduleNum: 4,
      label: '2020 · COVID crash', short: 'COVID crash',
      start: '2020-01-14', end: '2020-03-23',
      theme: 'panic', title: 'Panic vs. patience',
      badge: 'crash',
      summary: 'The fastest crash in the dataset: the Sensex fell about 38% in barely over five weeks as COVID-19 lockdowns began, the platform\'s central case study.',
    },
    {
      id: 'postcovid', order: 7, moduleNum: 8,
      label: '2020–21 · Post-COVID rally', short: 'Post-COVID rally',
      start: '2020-03-23', end: '2021-10-18',
      theme: 'rebalancing', title: 'Corrections & rebalancing',
      badge: 'rally',
      summary: 'A roughly 138% rally off the COVID low, powered by monetary stimulus and retail participation, and a lesson in how quickly "safe" cash allocations can become the wrong call.',
    },
    {
      id: 'correction2425', order: 8, moduleNum: 5,
      label: '2024–25 · Correction', short: 'Correction',
      start: '2024-09-27', end: '2025-02-01',
      theme: 'safehaven', title: 'Safe havens (gold)',
      badge: 'crash',
      summary: 'A double-digit correction from the Sep 2024 all-time high, while gold kept climbing, again playing its safe-haven role.',
    },
  ];

  function realReturnPct(ev) {
    const startV = getIndexValue(ev.start);
    const endV = getIndexValue(ev.end);
    return ((endV / startV) - 1) * 100;
  }
  EVENTS.forEach((ev) => { ev.realReturnPct = Math.round(realReturnPct(ev) * 10) / 10; });

  const ML_METRICS = {
    bsesn: {
      normal: {
        window_label: 'Normal (trained thru 2016, tested 2017)',
        linear_regression: { mae_pct: 1.129, rmse_pct: 1.383, dir_acc_pct: 49.2, n: 260 },
        arima: { mae_pct: 1.054, rmse_pct: 1.303, dir_acc_pct: 66.9, n: 260 },
        random_forest: { mae_pct: 1.099, rmse_pct: 1.352, dir_acc_pct: 59.6, ci: [53.6, 65.4], sig_better: true, n: 260 },
        xgboost: { mae_pct: 1.362, rmse_pct: 1.679, dir_acc_pct: 45.8, ci: [39.8, 51.8], sig_better: false, n: 260 },
      },
      gfc2008: {
        window_label: '2008 financial crisis (trained thru 2007, tested Jan08–Mar09)',
        linear_regression: { mae_pct: 4.978, rmse_pct: 6.351, dir_acc_pct: 46.6, n: 326 },
        arima: { mae_pct: 4.958, rmse_pct: 6.336, dir_acc_pct: 44.8, n: 326 },
        random_forest: { mae_pct: 5.134, rmse_pct: 6.528, dir_acc_pct: 49.4, ci: [44.0, 54.8], sig_worse: false, n: 326 },
        xgboost: { mae_pct: 5.325, rmse_pct: 6.903, dir_acc_pct: 52.5, ci: [47.0, 57.8], sig_worse: false, n: 326 },
      },
      covid2020: {
        window_label: 'COVID crash (trained thru 2019, tested 20 Feb–30 Apr 2020)',
        linear_regression: { mae_pct: 6.324, rmse_pct: 7.935, dir_acc_pct: 45.1, n: 51 },
        arima: { mae_pct: 6.293, rmse_pct: 7.898, dir_acc_pct: 31.4, n: 51 },
        random_forest: { mae_pct: 6.948, rmse_pct: 8.606, dir_acc_pct: 27.5, ci: [17.1, 40.9], sig_worse: true, p: 0.0013, n: 51 },
        xgboost: { mae_pct: 8.810, rmse_pct: 10.695, dir_acc_pct: 31.4, ci: [20.3, 45.0], sig_worse: true, p: 0.0078, n: 51 },
      },
      dotcom: {
        window_label: 'Dot-com crash (trained thru Jan 2000, tested 11 Feb 2000–21 Sep 2001)',
        linear_regression: { mae_pct: 3.586, rmse_pct: 4.703, dir_acc_pct: 50.4, ci: [45.6, 55.1], sig_better: false, sig_worse: false, n: 421 },
        arima: { mae_pct: 3.597, rmse_pct: 4.810, dir_acc_pct: 43.7, ci: [39.0, 48.5], sig_better: false, sig_worse: true, p: 0.0098, n: 421 },
        random_forest: { mae_pct: 4.040, rmse_pct: 5.312, dir_acc_pct: 44.4, ci: [39.7, 49.2], sig_better: false, sig_worse: true, p: 0.022, n: 421 },
        xgboost: { mae_pct: 4.543, rmse_pct: 6.006, dir_acc_pct: 47.3, ci: [42.5, 52.0], sig_better: false, sig_worse: false, n: 421 },
      },
      bullrun: {
        window_label: 'Bull run (trained thru Mar 2003, tested 1 Apr 2003–8 Jan 2008)',
        linear_regression: { mae_pct: 2.625, rmse_pct: 3.326, dir_acc_pct: 56.7, ci: [53.9, 59.5], sig_better: true, sig_worse: false, n: 1210 },
        arima: { mae_pct: 2.643, rmse_pct: 3.354, dir_acc_pct: 58.5, ci: [55.7, 61.3], sig_better: true, sig_worse: false, n: 1210 },
        random_forest: { mae_pct: 2.982, rmse_pct: 3.800, dir_acc_pct: 55.3, ci: [52.5, 58.1], sig_better: true, sig_worse: false, p: 0.0002, n: 1210 },
        xgboost: { mae_pct: 3.085, rmse_pct: 3.960, dir_acc_pct: 56.3, ci: [53.5, 59.1], sig_better: true, sig_worse: false, n: 1210 },
      },
      recovery0910: {
        window_label: 'Recovery rally (trained thru Mar 2009, tested 9 Mar 2009–5 Nov 2010)',
        linear_regression: { mae_pct: 2.690, rmse_pct: 3.901, dir_acc_pct: 53.6, ci: [48.8, 58.4], sig_better: false, sig_worse: false, n: 412 },
        arima: { mae_pct: 2.640, rmse_pct: 3.826, dir_acc_pct: 62.1, ci: [57.4, 66.7], sig_better: true, sig_worse: false, n: 412 },
        random_forest: { mae_pct: 3.029, rmse_pct: 4.135, dir_acc_pct: 49.0, ci: [44.2, 53.8], sig_better: false, sig_worse: false, n: 412 },
        xgboost: { mae_pct: 3.032, rmse_pct: 4.061, dir_acc_pct: 54.9, ci: [50.0, 59.6], sig_better: true, sig_worse: false, p: 0.0488, n: 412 },
      },
      demon2016: {
        window_label: 'Demonetization (trained thru 7 Nov 2016, tested 8 Nov–26 Dec 2016)',
        linear_regression: { mae_pct: 1.768, rmse_pct: 2.162, dir_acc_pct: 29.4, ci: [16.8, 46.2], sig_better: false, sig_worse: true, p: 0.0164, n: 34 },
        arima: { mae_pct: 1.712, rmse_pct: 2.132, dir_acc_pct: 38.2, ci: [23.9, 55.0], sig_better: false, sig_worse: false, n: 34 },
        random_forest: { mae_pct: 1.647, rmse_pct: 2.070, dir_acc_pct: 38.2, ci: [23.9, 55.0], sig_better: false, sig_worse: false, n: 34 },
        xgboost: { mae_pct: 1.631, rmse_pct: 2.102, dir_acc_pct: 58.8, ci: [42.2, 73.6], sig_better: false, sig_worse: false, n: 34 },
      },
      postcovid: {
        window_label: 'Post-COVID rally (trained thru 22 Mar 2020, tested 23 Mar 2020–18 Oct 2021)',
        linear_regression: { mae_pct: 2.079, rmse_pct: 2.946, dir_acc_pct: 51.2, ci: [46.2, 56.1], sig_better: false, sig_worse: false, n: 391 },
        arima: { mae_pct: 1.973, rmse_pct: 2.730, dir_acc_pct: 65.7, ci: [60.9, 70.3], sig_better: true, sig_worse: false, n: 391 },
        random_forest: { mae_pct: 2.105, rmse_pct: 2.966, dir_acc_pct: 60.1, ci: [55.2, 64.8], sig_better: true, sig_worse: false, p: 0.0001, n: 391 },
        xgboost: { mae_pct: 2.176, rmse_pct: 2.936, dir_acc_pct: 55.0, ci: [50.0, 59.8], sig_better: true, sig_worse: false, p: 0.0486, n: 391 },
      },
      correction2425: {
        window_label: '2024–25 correction (trained thru 26 Sep 2024, tested 27 Sep 2024–1 Feb 2025)',
        linear_regression: { mae_pct: 1.404, rmse_pct: 1.848, dir_acc_pct: 58.0, ci: [47.5, 67.7], sig_better: false, sig_worse: false, n: 88 },
        arima: { mae_pct: 1.508, rmse_pct: 1.935, dir_acc_pct: 45.5, ci: [35.5, 55.8], sig_better: false, sig_worse: false, n: 88 },
        random_forest: { mae_pct: 1.489, rmse_pct: 1.919, dir_acc_pct: 44.3, ci: [34.4, 54.7], sig_better: false, sig_worse: false, n: 88 },
        xgboost: { mae_pct: 1.523, rmse_pct: 1.906, dir_acc_pct: 46.6, ci: [36.5, 56.9], sig_better: false, sig_worse: false, n: 88 },
      },
    },
    reliance_covid_xgboost: { mae_pct: 10.738, rmse_pct: 12.341, dir_acc_pct: 29.4, ci: [18.7, 43.0], sig_worse: true, p: 0.0033, n: 51 },

    basketSignificance: [
      { model: 'arima', window: 'gfc2008', total: 18, sigBetter: 1, sigWorse: 4, pctBetter: 5.6, pctWorse: 22.2 },
      { model: 'arima', window: 'covid2020', total: 20, sigBetter: 0, sigWorse: 7, pctBetter: 0.0, pctWorse: 35.0 },
      { model: 'arima', window: 'normal', total: 20, sigBetter: 8, sigWorse: 0, pctBetter: 40.0, pctWorse: 0.0 },
      { model: 'linear_regression', window: 'gfc2008', total: 18, sigBetter: 5, sigWorse: 0, pctBetter: 27.8, pctWorse: 0.0 },
      { model: 'linear_regression', window: 'covid2020', total: 20, sigBetter: 0, sigWorse: 0, pctBetter: 0.0, pctWorse: 0.0 },
      { model: 'linear_regression', window: 'normal', total: 20, sigBetter: 6, sigWorse: 1, pctBetter: 30.0, pctWorse: 5.0 },
      { model: 'random_forest', window: 'gfc2008', total: 18, sigBetter: 3, sigWorse: 4, pctBetter: 16.7, pctWorse: 22.2 },
      { model: 'random_forest', window: 'covid2020', total: 20, sigBetter: 1, sigWorse: 10, pctBetter: 5.0, pctWorse: 50.0 },
      { model: 'random_forest', window: 'normal', total: 20, sigBetter: 10, sigWorse: 3, pctBetter: 50.0, pctWorse: 15.0 },
      { model: 'xgboost', window: 'gfc2008', total: 18, sigBetter: 3, sigWorse: 1, pctBetter: 16.7, pctWorse: 5.6 },
      { model: 'xgboost', window: 'covid2020', total: 20, sigBetter: 1, sigWorse: 9, pctBetter: 5.0, pctWorse: 45.0 },
      { model: 'xgboost', window: 'normal', total: 20, sigBetter: 3, sigWorse: 1, pctBetter: 15.0, pctWorse: 5.0 },
      { model: 'random_forest', window: 'dotcom', total: 11, sigBetter: 1, sigWorse: 2, pctBetter: 9.1, pctWorse: 18.2 },
      { model: 'xgboost', window: 'dotcom', total: 11, sigBetter: 4, sigWorse: 1, pctBetter: 36.4, pctWorse: 9.1 },
      { model: 'random_forest', window: 'bullrun', total: 12, sigBetter: 8, sigWorse: 1, pctBetter: 66.7, pctWorse: 8.3 },
      { model: 'xgboost', window: 'bullrun', total: 12, sigBetter: 6, sigWorse: 1, pctBetter: 50.0, pctWorse: 8.3 },
      { model: 'random_forest', window: 'recovery0910', total: 18, sigBetter: 6, sigWorse: 1, pctBetter: 33.3, pctWorse: 5.6 },
      { model: 'xgboost', window: 'recovery0910', total: 18, sigBetter: 3, sigWorse: 3, pctBetter: 16.7, pctWorse: 16.7 },
      { model: 'random_forest', window: 'demon2016', total: 20, sigBetter: 2, sigWorse: 4, pctBetter: 10.0, pctWorse: 20.0 },
      { model: 'xgboost', window: 'demon2016', total: 20, sigBetter: 2, sigWorse: 3, pctBetter: 10.0, pctWorse: 15.0 },
      { model: 'random_forest', window: 'postcovid', total: 20, sigBetter: 6, sigWorse: 2, pctBetter: 30.0, pctWorse: 10.0 },
      { model: 'xgboost', window: 'postcovid', total: 20, sigBetter: 5, sigWorse: 0, pctBetter: 25.0, pctWorse: 0.0 },
      { model: 'random_forest', window: 'correction2425', total: 20, sigBetter: 3, sigWorse: 1, pctBetter: 15.0, pctWorse: 5.0 },
      { model: 'xgboost', window: 'correction2425', total: 20, sigBetter: 2, sigWorse: 5, pctBetter: 10.0, pctWorse: 25.0 },
    ],
  };

  const MODEL_NAMES = {
    linear_regression: 'Linear Regression',
    arima: 'ARIMA(5,0,0)',
    random_forest: 'Random Forest',
    xgboost: 'XGBoost',
  };

  const SECTOR_TILTS = {
    diversified: { base: 1.0, windows: {} },
    concentrated_realty: {
      base: 1.15,
      windows: { gfc2008: 1.9, covid2020: 1.7, dotcom: 1.3 },
    },
    concentrated_it: {
      base: 0.95,
      windows: { gfc2008: 0.85, covid2020: 0.7, dotcom: 2.1 },
    },
    defensive_fmcg_pharma: {
      base: 0.7,
      windows: { gfc2008: 0.55, covid2020: 0.5 },
    },
  };

  function eventForDate(dateStr) {
    return EVENTS.find((ev) => dateStr >= ev.start && dateStr <= ev.end) || null;
  }

  global.MM = {
    INDEX_DATES,
    getIndexValue, getGoldValue, getNiftyValue,
    nearestTradingDate,
    EVENTS, ML_METRICS, MODEL_NAMES, SECTOR_TILTS,
    eventForDate,
    FIRST_DATE: INDEX_DATES[0],
    LAST_DATE: INDEX_DATES[INDEX_DATES.length - 1],
  };
})(window);
