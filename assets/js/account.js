// Portfolio/game-state store. Historically this was a single localStorage key shared by
// every visitor to the browser -- meaning two different signed-in accounts on the same
// browser saw the SAME balance/holdings, and nothing carried over to a different device.
//
// Now: still backed by localStorage for an instant, synchronous MMAccount.load() (every
// existing caller keeps working exactly as before), but keyed per signed-in user, and
// mirrored to Firestore (accounts/{uid}) so it follows the account across devices. Signed-out
// browsing is untouched -- pure local, guest-only play, same as the original behaviour.
//
// account.js stays a plain (non-module) script on purpose, so pages can keep calling
// MMAccount.load()/.buy()/.sell() synchronously. Firestore's SDK is ES-module-only, so it's
// pulled in here via a dynamic import() (valid from a classic script) once we know whether
// anyone is signed in.
(function (global) {
  'use strict';
  const GUEST_KEY = 'account';
  const STARTING_BALANCE = 100000;

  function defaultAccount() {
    return { cash: STARTING_BALANCE, holdings: {}, transactions: [] };
  }

  function storageKeyFor(uid) {
    return uid ? 'account:' + uid : GUEST_KEY;
  }

  function isValidAccount(acc) {
    return !!(acc && typeof acc.cash === 'number' && acc.holdings && acc.transactions);
  }

  function readLocal(uid) {
    const acc = MMApp.Storage.get(storageKeyFor(uid), null);
    return isValidAccount(acc) ? acc : null;
  }
  function writeLocal(uid, acc) {
    MMApp.Storage.set(storageKeyFor(uid), acc);
  }

  let currentUid = null;
  let currentAccount = null;

  function load() {
    if (!currentAccount) {
      currentAccount = readLocal(currentUid) || defaultAccount();
      writeLocal(currentUid, currentAccount);
    }
    return currentAccount;
  }

  function updateNavBadge() {
    const el = document.getElementById('navCashBadge');
    if (el && currentAccount) el.textContent = MMApp.formatINR(currentAccount.cash) + ' tokens';
  }

  let fs = null; // { doc, getDoc, setDoc } once loaded
  let firebaseDb = null;

  async function pushToCloud(acc) {
    if (!currentUid || !fs) return;
    try {
      await fs.setDoc(fs.doc(firebaseDb, 'accounts', currentUid), acc);
    } catch (e) {
      console.error('MarketMinds: failed to sync account to Firestore', e);
    }
  }

  function save(acc) {
    currentAccount = acc;
    writeLocal(currentUid, acc);
    updateNavBadge();
    pushToCloud(acc);
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

  // --- Cloud sync -------------------------------------------------------
  // MMAccount.ready resolves once the right account (guest-local, or the signed-in
  // user's cloud copy) has finished loading. Pages that render before any user
  // interaction can `await MMAccount.ready` first for a flicker-free first paint;
  // pages that don't are unaffected -- load() always returns a usable account
  // immediately (the guest/local one until sync catches up).
  let resolveReady;
  const ready = new Promise((resolve) => { resolveReady = resolve; });

  async function syncForUser(user) {
    currentUid = user ? user.uid : null;
    currentAccount = null; // force a fresh read under the (possibly new) key

    if (!user) {
      load();
      updateNavBadge();
      resolveReady(currentAccount);
      return;
    }

    try {
      if (!fs) {
        const [{ doc, getDoc, setDoc }, { firebaseDb: db }] = await Promise.all([
          import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js'),
          import('./firebase-config.js'),
        ]);
        fs = { doc, getDoc, setDoc };
        firebaseDb = db;
      }
      const ref = fs.doc(firebaseDb, 'accounts', user.uid);
      const snap = await fs.getDoc(ref);
      if (snap.exists()) {
        currentAccount = snap.data();
        writeLocal(user.uid, currentAccount);
      } else {
        // First time this user is signed in: seed their cloud account from whatever's
        // cached locally under their uid already, or a fresh default.
        currentAccount = readLocal(user.uid) || defaultAccount();
        await fs.setDoc(ref, currentAccount);
      }
    } catch (e) {
      console.error('MarketMinds: could not reach Firestore, using local copy instead', e);
      currentAccount = readLocal(user.uid) || defaultAccount();
    }

    updateNavBadge();
    resolveReady(currentAccount);
  }

  function waitForAuth() {
    if (global.MMAuth) {
      global.MMAuth.onAuthChange(syncForUser);
      return;
    }
    // auth.js is a deferred module script -- on first load it may not have attached
    // window.MMAuth yet by the time this classic script runs. It always has by
    // DOMContentLoaded (module scripts run before that event fires).
    document.addEventListener('DOMContentLoaded', () => {
      if (global.MMAuth) global.MMAuth.onAuthChange(syncForUser);
      else syncForUser(null); // page doesn't include auth.js at all -- guest mode
    });
  }
  waitForAuth();

  global.MMAccount = { load, save, buy, sell, holdingsWorth, reset, ready, STARTING_BALANCE };
})(window);
