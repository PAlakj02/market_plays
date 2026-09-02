(function (global) {
  'use strict';

  function formatINR(n, opts) {
    opts = opts || {};
    const decimals = opts.decimals || 0;
    const neg = n < 0;
    n = Math.abs(n);
    const fixed = n.toFixed(decimals);
    const [intPart, decPart] = fixed.split('.');
    let last3 = intPart.slice(-3);
    let rest = intPart.slice(0, -3);
    if (rest !== '') last3 = ',' + last3;
    rest = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',');
    const formatted = rest + last3;
    return (neg ? '-' : '') + '₹' + formatted + (decPart ? '.' + decPart : '');
  }

  function formatPct(n, opts) {
    opts = opts || {};
    const decimals = opts.decimals != null ? opts.decimals : 1;
    const sign = n > 0 ? '+' : '';
    return sign + n.toFixed(decimals) + '%';
  }

  function formatDate(dateStr) {
    const d = new Date(dateStr + 'T00:00:00Z');
    return d.toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
  }

  const STORAGE_PREFIX = 'marketminds:';
  const Storage = {
    get(key, fallback) {
      try {
        const raw = localStorage.getItem(STORAGE_PREFIX + key);
        return raw ? JSON.parse(raw) : fallback;
      } catch (e) { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value)); } catch (e) {}
    },
    push(key, entry, max) {
      const arr = Storage.get(key, []);
      arr.push(entry);
      if (max && arr.length > max) arr.splice(0, arr.length - max);
      Storage.set(key, arr);
      return arr;
    },
  };

  function toast(msg, ms) {
    let el = document.querySelector('.toast');
    if (!el) {
      el = document.createElement('div');
      el.className = 'toast';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    requestAnimationFrame(() => el.classList.add('show'));
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove('show'), ms || 2200);
  }

  function drawLineChart(canvas, datasets, opts) {
    opts = opts || {};
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(1, rect.width), h = Math.max(1, rect.height);
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const padL = opts.padLeft != null ? opts.padLeft : 4;
    const padR = opts.padRight != null ? opts.padRight : 4;
    const padT = opts.padTop != null ? opts.padTop : 10;
    const padB = opts.padBottom != null ? opts.padBottom : 10;

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    datasets.forEach((ds) => ds.points.forEach((p) => {
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
    }));
    if (!isFinite(minX)) return;
    if (opts.yMin != null) minY = Math.min(minY, opts.yMin);
    if (opts.yMax != null) maxY = Math.max(maxY, opts.yMax);
    const yPad = (maxY - minY) * 0.08 || Math.abs(maxY) * 0.08 || 1;
    minY -= yPad; maxY += yPad;
    if (maxX === minX) maxX = minX + 1;
    if (maxY === minY) maxY = minY + 1;

    const px = (x) => padL + ((x - minX) / (maxX - minX)) * (w - padL - padR);
    const py = (y) => h - padB - ((y - minY) / (maxY - minY)) * (h - padT - padB);

    ctx.strokeStyle = opts.gridColor || '#232A38';
    ctx.lineWidth = 1;
    const gridLines = opts.gridLines || 3;
    for (let i = 0; i <= gridLines; i++) {
      const y = padT + (i / gridLines) * (h - padT - padB);
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }

    if (opts.zeroLine != null) {
      const zy = py(opts.zeroLine);
      ctx.strokeStyle = opts.zeroLineColor || '#565E70';
      ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(0, zy); ctx.lineTo(w, zy); ctx.stroke();
      ctx.setLineDash([]);
    }

    if (opts.shadedRanges) {
      opts.shadedRanges.forEach((r) => {
        ctx.fillStyle = r.color || 'rgba(255,75,92,0.08)';
        const x0 = px(r.x0), x1 = px(r.x1);
        ctx.fillRect(x0, padT, x1 - x0, h - padT - padB);
      });
    }

    datasets.forEach((ds) => {
      if (!ds.points.length) return;
      ctx.strokeStyle = ds.color || '#17D97A';
      ctx.lineWidth = ds.width || 2;
      ctx.setLineDash(ds.dash || []);
      ctx.beginPath();
      ds.points.forEach((p, i) => {
        const x = px(p.x), y = py(p.y);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.setLineDash([]);

      if (ds.fill) {
        ctx.lineTo(px(ds.points[ds.points.length - 1].x), py(minY));
        ctx.lineTo(px(ds.points[0].x), py(minY));
        ctx.closePath();
        ctx.fillStyle = ds.fillColor || 'rgba(23,217,122,0.08)';
        ctx.fill();
      }
    });

    return { px, py, minX, maxX, minY, maxY };
  }

  function fmtInWorker() {}

  global.MMApp = { formatINR, formatPct, formatDate, Storage, toast, drawLineChart };
})(window);
