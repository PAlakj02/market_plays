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
  function hashStr(s) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  const T0_MS = Date.UTC(2026, 7, 24, 0, 0, 0);
  const REAL_DAYS_PER_LOOP = 30;

  let REAL = null;
  let SPAN_DAYS = 0;
  let COMPRESSION = 0;
  let loadingPromise = null;

  function daysBetweenCalendar(a, b) {
    return (b.getTime() - a.getTime()) / 86400000;
  }
  function addCalendarDays(d, n) {
    return new Date(d.getTime() + n * 86400000);
  }
  function isWeekend(d) {
    const day = d.getUTCDay();
    return day === 0 || day === 6;
  }

  async function load() {
    if (REAL) return REAL;
    if (!loadingPromise) {
      loadingPromise = fetch('assets/data/real_prices.json')
        .then((r) => r.json())
        .then((data) => {
          REAL = data;
          REAL._firstDate = new Date(data.dates[0] + 'T00:00:00Z');
          REAL._lastDate = new Date(data.dates[data.dates.length - 1] + 'T00:00:00Z');
          REAL._dateIndex = new Map(data.dates.map((d, i) => [d, i]));
          SPAN_DAYS = daysBetweenCalendar(REAL._firstDate, REAL._lastDate);
          COMPRESSION = SPAN_DAYS / REAL_DAYS_PER_LOOP;
          return REAL;
        });
    }
    return loadingPromise;
  }

  function simulatedOffsetDays(nowMs) {
    const realElapsedDays = (nowMs - T0_MS) / 86400000;
    return Math.max(0, realElapsedDays * COMPRESSION);
  }

  function clockState(nowMs) {
    nowMs = nowMs || Date.now();
    const offset = simulatedOffsetDays(nowMs);
    const loop = Math.floor(offset / SPAN_DAYS);
    const offsetInLoop = offset - loop * SPAN_DAYS;
    const simDate = addCalendarDays(REAL._firstDate, offsetInLoop);
    return { loop, offsetInLoop, simDate, offset };
  }

  function nearestRealIndex(dateStr) {
    if (REAL._dateIndex.has(dateStr)) return REAL._dateIndex.get(dateStr);
    const dates = REAL.dates;
    let lo = 0, hi = dates.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (dates[mid] < dateStr) lo = mid + 1; else hi = mid;
    }
    return Math.min(lo, dates.length - 1);
  }
  function realPriceAtIndex(ticker, idx) {
    const arr = REAL.prices[ticker];
    if (!arr) return null;
    for (let i = idx; i >= 0; i--) if (arr[i] != null) return arr[i];
    for (let i = idx; i < arr.length; i++) if (arr[i] != null) return arr[i];
    return null;
  }

  const ASSET_PROFILE = {
    '^BSESN': { drift: 0.13, vol: 0.16 },
    '^NSEI': { drift: 0.13, vol: 0.16 },
    'GOLDBEES.NS': { drift: 0.10, vol: 0.13 },
  };
  const DEFAULT_STOCK_PROFILE = { drift: 0.14, vol: 0.27 };
  function profileFor(ticker) {
    return ASSET_PROFILE[ticker] || DEFAULT_STOCK_PROFILE;
  }

  function syntheticCloseAtDayIndex(ticker, loop, dayIdx) {
    const profile = profileFor(ticker);
    const dailyDrift = Math.log(1 + profile.drift) / 252;
    const dailyVol = profile.vol / Math.sqrt(252);
    const startPrice = loop === 1
      ? realPriceAtIndex(ticker, REAL.dates.length - 1)
      : syntheticCloseAtDayIndex(ticker, loop - 1, Math.round(SPAN_DAYS));
    const rng = mulberry32(hashStr(ticker + ':loop' + loop));
    let logPrice = Math.log(startPrice);
    for (let i = 0; i <= dayIdx; i++) {
      const shock = (rng() - 0.5) * 2 * dailyVol * (rng() < 0.03 ? 3.5 : 1);
      logPrice += dailyDrift + shock;
    }
    return Math.exp(logPrice);
  }
  const synthCache = new Map();
  function syntheticSeries(ticker, loop) {
    const key = ticker + ':' + loop;
    if (synthCache.has(key)) return synthCache.get(key);
    const totalDays = Math.ceil(SPAN_DAYS) + 1;
    const profile = profileFor(ticker);
    const dailyDrift = Math.log(1 + profile.drift) / 252;
    const dailyVol = profile.vol / Math.sqrt(252);
    const startPrice = loop === 1
      ? realPriceAtIndex(ticker, REAL.dates.length - 1)
      : syntheticSeries(ticker, loop - 1)[totalDays - 1];
    const rng = mulberry32(hashStr(ticker + ':loop' + loop));
    const arr = new Array(totalDays);
    let logPrice = Math.log(startPrice);
    arr[0] = startPrice;
    for (let i = 1; i < totalDays; i++) {
      const shock = (rng() - 0.5) * 2 * dailyVol * (rng() < 0.03 ? 3.5 : 1);
      logPrice += dailyDrift + shock;
      arr[i] = Math.exp(logPrice);
    }
    synthCache.set(key, arr);
    return arr;
  }

  function closeForLoopDay(ticker, loop, dayIdx) {
    if (loop <= 0) return realPriceAtIndex(ticker, Math.min(dayIdx, REAL.dates.length - 1));
    const series = syntheticSeries(ticker, loop);
    return series[Math.max(0, Math.min(dayIdx, series.length - 1))];
  }

  function tradingDayIndexForOffset(offsetInLoop) {
    const wholeDays = Math.floor(offsetInLoop);
    let d = new Date(REAL._firstDate.getTime());
    let tradingIdx = 0;
    let calIdx = 0;
    tradingIdx = Math.round(wholeDays * (5 / 7));
    return { tradingIdx: Math.max(0, tradingIdx), frac: offsetInLoop - wholeDays };
  }

  function getPrice(ticker, nowMs) {
    if (!REAL) return null;
    const { loop, offsetInLoop } = clockState(nowMs);
    const { tradingIdx, frac } = tradingDayIndexForOffset(offsetInLoop);
    const p0 = closeForLoopDay(ticker, loop, tradingIdx);
    const p1 = closeForLoopDay(ticker, loop, tradingIdx + 1);
    if (p0 == null || p1 == null) return p0 || p1 || null;
    const logInterp = Math.log(p0) + (Math.log(p1) - Math.log(p0)) * frac;
    const rng = mulberry32(hashStr(ticker + ':' + loop + ':' + tradingIdx));
    const noiseAmp = 0.004;
    const noise = (rng() - 0.5) * 2 * noiseAmp * Math.sin(Math.PI * frac);
    return Math.exp(logInterp + noise);
  }

  function getRealPriceOnDate(ticker, dateStr) {
    if (!REAL) return null;
    if (dateStr < REAL.dates[0] || dateStr > REAL.dates[REAL.dates.length - 1]) return null;
    const arr = REAL.prices[ticker];
    if (!arr) return null;
    const idx = nearestRealIndex(dateStr);
    const MAX_GAP = 10;
    for (let d = 0; d <= MAX_GAP; d++) {
      if (idx - d >= 0 && arr[idx - d] != null) return arr[idx - d];
      if (idx + d < arr.length && arr[idx + d] != null) return arr[idx + d];
    }
    return null;
  }

  function getRealDatesBetween(startDate, endDate) {
    if (!REAL) return [];
    const si = nearestRealIndex(startDate);
    const ei = nearestRealIndex(endDate);
    return REAL.dates.slice(si, ei + 1);
  }

  function getAllPrices(nowMs) {
    const out = {};
    if (!REAL) return out;
    REAL.tickers.forEach((t) => { out[t] = getPrice(t, nowMs); });
    return out;
  }

  function getClockInfo(nowMs) {
    if (!REAL) return null;
    const state = clockState(nowMs);
    const dateStr = state.simDate.toISOString().slice(0, 10);
    return {
      loop: state.loop,
      isReal: state.loop <= 0,
      simulatedDate: dateStr,
      progressPct: (state.offsetInLoop / SPAN_DAYS) * 100,
    };
  }

  global.MMMarket = {
    load, getPrice, getAllPrices, getClockInfo, getRealPriceOnDate, getRealDatesBetween,
    get tickers() { return REAL ? REAL.tickers : []; },
    get loaded() { return !!REAL; },
  };
})(window);
