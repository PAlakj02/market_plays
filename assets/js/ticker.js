(function () {
  'use strict';
  const el = document.querySelector('.ticker');
  if (!el || !window.MM) return;

  const dates = MM.INDEX_DATES;
  const last = dates[dates.length - 1];
  const prev = dates[dates.length - 2];

  function chg(getFn) {
    const now = getFn(last), before = getFn(prev);
    return { now, pct: ((now / before) - 1) * 100 };
  }

  const sensex = chg(MM.getIndexValue);
  const nifty = chg(MM.getNiftyValue);
  const gold = chg(MM.getGoldValue);

  function item(label, val, pct, decimals) {
    const cls = pct >= 0 ? 'up' : 'down';
    const arrow = pct >= 0 ? '▲' : '▼';
    return `<span class="${cls}">${label} &nbsp;${val}&nbsp; ${arrow}${Math.abs(pct).toFixed(2)}%</span>`;
  }

  const parts = [
    item('SENSEX', Math.round(sensex.now).toLocaleString('en-IN'), sensex.pct),
    item('NIFTY 50', Math.round(nifty.now).toLocaleString('en-IN'), nifty.pct),
    item('GOLD (10g)', '₹' + Math.round(gold.now).toLocaleString('en-IN'), gold.pct),
  ];
  const setHTML = parts.join('');

  el.innerHTML = setHTML;
  const setWidth = el.getBoundingClientRect().width || 400;
  const vw = window.innerWidth || 1920;
  const minHalfWidth = Math.max(vw * 2.5, 3200);
  const repeats = Math.max(2, Math.ceil(minHalfWidth / setWidth));
  const half = new Array(repeats).fill(setHTML).join('');
  el.innerHTML = half + half;

  const PX_PER_SEC = 70;
  const halfWidth = repeats * setWidth;
  const cycleMs = Math.round((halfWidth / PX_PER_SEC) * 1000);
  el.style.animationDuration = cycleMs + 'ms';

  el.style.animationDelay = '-' + (Date.now() % cycleMs) + 'ms';

  const noteEl = document.querySelector('.ticker-note');
  if (noteEl) noteEl.textContent = `as of ${MMApp.formatDate(last)} · reconstructed series, not a live feed`;
})();
