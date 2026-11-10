/* ── App shell, router, theme, language, PIN lock ──────────────── */
(function () {
  const MMB = window.MMB;
  const t = MMB.t;

  let appStarted = false;
  let chromeBound = false;
  let backBound = false;

  MMB.setFAB = function (html) {
    const host = document.getElementById('fabHost');
    if (host) host.innerHTML = html || '';
  };

  MMB.navigate = function (path) {
    const clean = String(path || 'dashboard').replace(/^#?\/?/, '');
    if (location.hash === '#/' + clean) { MMB.rerender(); return; }
    location.hash = '#/' + clean;
  };

  function parseRoute() {
    const h = (location.hash || '').replace(/^#\/?/, '');
    const parts = h.split('?')[0].split('/').filter(Boolean);
    if (!parts.length) return { name: 'dashboard' };
    if (parts[0] === 'accounts') return { name: 'accounts' };
    if (parts[0] === 'account' && parts[1]) return { name: 'account', id: parts[1] };
    if (parts[0] === 'stock') return { name: 'stock', tab: parts[1] === 'out' ? 'out' : 'in' };
    if (parts[0] === 'sale') return { name: 'saleForm', id: parts[1] && parts[1] !== 'new' ? parts[1] : null };
    if (parts[0] === 'purchase') return { name: 'purchaseForm', id: parts[1] && parts[1] !== 'new' ? parts[1] : null };
    if (parts[0] === 'settings') return { name: 'settings' };
    return { name: 'dashboard' };
  }

  function setNav(route) {
    const key = route.name === 'account' ? 'accounts'
      : (route.name === 'saleForm' || route.name === 'purchaseForm') ? 'stock'
        : route.name;
    document.querySelectorAll('[data-nav]').forEach(function (a) {
      a.classList.toggle('active', a.getAttribute('data-nav') === key);
    });
  }

  function setTopbar(route) {
    let title = t('nav.dashboard');
    let sub = MMB.fmtDate(MMB.todayISO()) + ' · ' + MMB.weekday(MMB.todayISO());
    if (route.name === 'accounts') {
      title = t('accounts.title');
      sub = MMB.accounts().length === 1 ? t('accounts.countOne', { n: 1 }) : t('accounts.count', { n: MMB.accounts().length });
    } else if (route.name === 'account') {
      const a = MMB.account(route.id);
      title = a ? a.name : t('accounts.title');
      sub = a ? t('accounts.type.' + a.type) + (a.phone ? ' · ' + a.phone : '') : '';
    } else if (route.name === 'stock') {
      title = t('stock.title');
      sub = route.tab === 'out' ? t('stock.outDesc') : t('stock.inDesc');
    } else if (route.name === 'saleForm' || route.name === 'purchaseForm') {
      const isSale = route.name === 'saleForm';
      const rec = route.id ? (isSale
        ? MMB.db.sales.find(function (s) { return s.id === route.id; })
        : MMB.db.purchases.find(function (p) { return p.id === route.id; })) : null;
      title = rec ? (isSale ? t('stock.editSale') : t('stock.editPurchase')) : (isSale ? t('stock.newSale') : t('stock.newPurchase'));
      sub = rec ? (isSale ? '#' + rec.billNo : rec.no) : (isSale ? t('stock.billNo') + ' ' + MMB.nextBillNo() : MMB.nextPurchaseNo());
    } else if (route.name === 'settings') {
      title = t('settings.title');
      sub = t('settings.subtitle');
    }
    const pt = document.getElementById('pageTitle');
    const ps = document.getElementById('pageSub');
    if (pt) pt.textContent = title;
    if (ps) ps.textContent = sub;
    document.title = MMB.t('app.name') + ' — ' + title;
  }

  function renderCurrent(scrollTop) {
    const route = parseRoute();
    MMB.closeAll();
    MMB.setFAB('');
    setNav(route);
    setTopbar(route);
    document.body.classList.toggle('mmb-ledger', route.name === 'account');
    const view = document.getElementById('view');
    if (!view) return;
    if (scrollTop) window.scrollTo({ top: 0, behavior: 'auto' });
    try {
      if (route.name === 'account') MMB.views.accounts.renderLedger(view, route.id);
      else MMB.views[route.name].render(view, route);
      MMB.applyI18n(view);
      if (scrollTop) requestAnimationFrame(function () { window.scrollTo(0, 0); });
    } catch (e) {
      console.error(e);
      view.innerHTML = '<div class="card card-pad"><h2 class="page-title">' + MMB.esc(t('common.error')) + '</h2><p class="muted" style="margin-top:8px">' + MMB.esc(e.message || '') + '</p><button class="btn btn-primary mt-16" onclick="location.reload()">' + t('common.reset') + '</button></div>';
    }
  }

  MMB.rerender = function () { renderCurrent(false); };

  MMB.updateStatic = function () {
    MMB.applyI18n(document);
    const sideDate = document.getElementById('sideDate');
    if (sideDate) sideDate.textContent = MMB.fmtDate(MMB.todayISO()) + ' · ' + MMB.weekday(MMB.todayISO());
    updateThemeButton();
    const langBtn = document.getElementById('langBtn');
    if (langBtn) langBtn.setAttribute('title', MMB.lang() === 'en' ? 'اردو' : 'English');
  };

  function updateThemeButton() {
    const theme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    const btn = document.getElementById('themeBtn');
    if (btn) btn.innerHTML = MMB.icon(theme === 'dark' ? 'sun' : 'moon');
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#101713' : '#1F3D2E');
  }

  MMB.setTheme = function (theme) {
    theme = theme === 'dark' ? 'dark' : 'light';
    MMB.db.settings.theme = theme;
    MMB.save();
    document.documentElement.setAttribute('data-theme', theme);
    updateThemeButton();
    if (appStarted) renderCurrent(false);
  };

  MMB.setLanguage = function (lang) {
    lang = lang === 'ur' ? 'ur' : 'en';
    MMB.db.settings.lang = lang;
    MMB.save();
    MMB.setLang(lang);
    MMB.updateStatic();
    if (appStarted) renderCurrent(false);
  };

  /* ── PIN lock ─────────────────────────────────────────────── */
  let pinBuffer = '';
  let pinBusy = false;

  function renderPinDots() {
    const el = document.getElementById('pinDots');
    if (!el) return;
    const count = Math.max(4, pinBuffer.length);
    el.innerHTML = Array.from({ length: count }).map(function (_, i) {
      return '<span class="pin-dot ' + (i < pinBuffer.length ? 'filled' : '') + '"></span>';
    }).join('');
  }

  function setPinError(msg) {
    const el = document.getElementById('pinError');
    if (el) el.textContent = msg || '';
  }

  function unlockApp() {
    try { sessionStorage.setItem('mmb_unlocked', '1'); } catch (e) { }
    const lock = document.getElementById('lockScreen');
    if (lock) lock.hidden = true;
    document.body.classList.remove('locked');
    document.body.style.overflow = '';
    pinBuffer = '';
    setPinError('');
  }

  async function checkPin(force) {
    if (pinBusy) return;
    if (pinBuffer.length < 4) return;
    pinBusy = true;
    const token = pinBuffer;
    const ok = await MMB.verifyPin(pinBuffer);
    pinBusy = false;
    if (ok) { unlockApp(); return; }
    if (pinBuffer !== token) return;
    if (force || pinBuffer.length >= 6) {
      setPinError(t('lock.wrong'));
      const card = document.querySelector('.lock-card');
      if (card) { card.classList.add('shake'); setTimeout(function () { card.classList.remove('shake'); }, 400); }
      pinBuffer = '';
      renderPinDots();
    }
  }

  function pushPin(d) {
    if (pinBuffer.length >= 6) return;
    pinBuffer += d;
    setPinError('');
    renderPinDots();
    checkPin(false);
  }

  function popPin() {
    pinBuffer = pinBuffer.slice(0, -1);
    setPinError('');
    renderPinDots();
  }

  function showLock() {
    MMB.closeAll();
    const lock = document.getElementById('lockScreen');
    if (!lock) return;
    lock.hidden = false;
    document.body.classList.add('locked');
    document.body.style.overflow = 'hidden';
    pinBuffer = '';
    renderPinDots();
    setPinError('');
    const keypad = document.getElementById('keypad');
    if (keypad && !keypad.dataset.bound) {
      keypad.dataset.bound = '1';
      const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'blank', '0', 'back'];
      keypad.innerHTML = keys.map(function (k) {
        if (k === 'blank') return '<span class="key blank"></span>';
        if (k === 'back') return '<button type="button" class="key wide" data-key="back" aria-label="Delete">⌫</button>';
        return '<button type="button" class="key" data-key="' + k + '">' + k + '</button>';
      }).join('');
      keypad.addEventListener('click', function (e) {
        const b = e.target.closest('[data-key]');
        if (!b) return;
        const k = b.getAttribute('data-key');
        if (k === 'back') popPin(); else pushPin(k);
      });
    }
    MMB.applyI18n(lock);
    const forgot = document.getElementById('forgotPin');
    if (forgot && !forgot.dataset.bound) {
      forgot.dataset.bound = '1';
      forgot.addEventListener('click', async function () {
        const ok = await MMB.confirm({ title: t('lock.forgot'), body: t('lock.forgotBody'), danger: true, confirmText: t('lock.clear') });
        if (!ok) return;
        MMB.resetData();
        location.reload();
      });
    }
  }

  document.addEventListener('keydown', function (e) {
    const lock = document.getElementById('lockScreen');
    if (!lock || lock.hidden) return;
    if (/^[0-9]$/.test(e.key)) { e.preventDefault(); pushPin(e.key); }
    else if (e.key === 'Backspace') { e.preventDefault(); popPin(); }
    else if (e.key === 'Enter') { e.preventDefault(); checkPin(true); }
  });

  function initLock() {
    if (!MMB.pinSet()) return;
    let unlocked = false;
    try { unlocked = sessionStorage.getItem('mmb_unlocked') === '1'; } catch (e) { }
    if (!unlocked) showLock();
  }

  function initNativeBack() {
    if (backBound) return;
    backBound = true;
    if (!MMB.isNativeApp || !MMB.isNativeApp()) return;
    const capacitor = window.Capacitor;
    const app = capacitor && capacitor.Plugins ? capacitor.Plugins.App : null;
    if (!app || !app.addListener) return;
    app.addListener('backButton', function () {
      const lock = document.getElementById('lockScreen');
      if (lock && !lock.hidden) return;
      const authScreen = document.getElementById('authScreen');
      if (authScreen && !authScreen.hidden) return;
      if (MMB.hasOverlay()) { MMB.closeTop(); return; }
      const route = parseRoute();
      if (route.name === 'account') MMB.navigate('accounts');
      else if (route.name === 'saleForm') MMB.navigate('stock/out');
      else if (route.name === 'purchaseForm') MMB.navigate('stock/in');
      else if (route.name !== 'dashboard') MMB.navigate('dashboard');
      else if (app.minimizeApp) app.minimizeApp();
    });
  }

  /* ── cloud controls ───────────────────────────────────────── */
  function fmtSyncTime(iso) {
    if (!iso) return t('sync.never');
    const d = new Date(iso);
    if (isNaN(d.getTime())) return t('sync.never');
    try {
      return d.toLocaleString(MMB.lang() === 'ur' ? 'ur-PK' : 'en-GB', {
        day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
      });
    } catch (e) {
      return MMB.fmtDate(iso.slice(0, 10)) + ' ' + MMB.fmtTime(iso.slice(11, 16));
    }
  }

  function refreshSyncUI() {
    const n = MMB.pendingCount ? MMB.pendingCount() : 0;
    const badge = document.getElementById('syncBadge');
    if (badge) {
      badge.textContent = n > 99 ? '99+' : String(n);
      badge.hidden = n === 0;
    }
    const syncBtn = document.getElementById('syncBtn');
    if (syncBtn) syncBtn.classList.toggle('has-pending', n > 0);
    const cloudPending = document.getElementById('cloudPending');
    if (cloudPending) cloudPending.textContent = t('settings.cloudPending') + ' · ' + n;
    const stamp = document.getElementById('syncStamp');
    if (stamp) {
      const iso = (MMB.sync && MMB.sync.lastFetchedISO) ? MMB.sync.lastFetchedISO() : null;
      stamp.textContent = t('sync.lastFetched', { time: fmtSyncTime(iso) });
      stamp.hidden = false;
    }
  }

  function onSyncState(kind) {
    const sb = document.getElementById('syncBtn');
    const fb = document.getElementById('fetchBtn');
    if (sb) {
      sb.classList.toggle('spinning', kind === 'pushing');
      sb.disabled = !!kind;
      if (kind === 'pushing') sb.setAttribute('aria-label', t('sync.syncing'));
      else sb.setAttribute('aria-label', t('sync.sync'));
    }
    if (fb) {
      fb.classList.toggle('spinning', kind === 'fetching');
      fb.disabled = !!kind;
      if (kind === 'fetching') fb.setAttribute('aria-label', t('sync.fetching'));
      else fb.setAttribute('aria-label', t('sync.fetch'));
    }
    if (!kind) refreshSyncUI();
  }

  // Never repaint a form that the user is filling in. The data is already
  // applied; the next navigation shows it.
  function safeRerender() {
    if (MMB.hasOverlay && MMB.hasOverlay()) return;
    const route = parseRoute();
    if (route.name === 'saleForm' || route.name === 'purchaseForm') return;
    if (appStarted) renderCurrent(false);
  }

  MMB.safeRerender = safeRerender;

  function syncErrorText(code) {
    if (code === 'not-signed-in') return t('sync.notSignedIn');
    if (code === 'permission-denied') return t('sync.denied');
    if (code === 'unavailable') return t('sync.offline');
    return t('sync.failed');
  }

  async function doSync() {
    if (!MMB.sync || MMB.sync.busy()) return;
    // Do not trust navigator.onLine here: an Android WebView can report false
    // even when the phone is online. Let the request decide.
    if (!MMB.db.sync.lastSyncedAt && MMB.pendingCount() > 20) {
      MMB.toast(t('sync.firstSync'), 'gold');
    }
    const res = await MMB.sync.push();
    if (!res || !res.ok) {
      if (res && res.error === 'busy') return;
      MMB.toast(syncErrorText(res && res.error), 'error');
      return;
    }
    refreshSyncUI();
    // A push does not change local data, so there is nothing to repaint.
    if (res.empty || !res.pushed) MMB.toast(t('sync.upToDate'), 'gold');
    else MMB.toast(t('sync.synced', { n: Math.max(1, res.transactions != null ? res.transactions : res.pushed) }), 'gold');
  }

  async function doFetch() {
    if (!MMB.sync || MMB.sync.busy()) return;
    // See doSync: navigator.onLine is not reliable inside the Android app.
    const startedAt = Date.now();
    const res = await MMB.sync.fetch();
    if (!res || !res.ok) {
      if (res && res.error === 'busy') return;
      MMB.toast(syncErrorText(res && res.error), 'error');
      return;
    }
    refreshSyncUI();
    if (res.discarded) MMB.toast(t('sync.deletedLocal', { n: res.discarded }), 'error');
    else if (res.fetched) MMB.toast(t('sync.fetched', { n: res.fetched }), 'gold');
    else MMB.toast(t('sync.upToDate'), 'gold');

    // Keep the button spinning until the screen shows the fetched data. A
    // small minimum makes a very fast fetch visible instead of a blink.
    const wait = Math.max(0, 550 - (Date.now() - startedAt));
    setTimeout(function () {
      try { safeRerender(); }
      finally { if (MMB.sync.finish) MMB.sync.finish(); }
    }, wait);
  }

  /* ── auth gate ────────────────────────────────────────────── */
  function bindChrome() {
    if (chromeBound) return;
    chromeBound = true;

    document.getElementById('langBtn').addEventListener('click', function () {
      MMB.setLanguage(MMB.lang() === 'en' ? 'ur' : 'en');
    });
    document.getElementById('themeBtn').addEventListener('click', function () {
      MMB.setTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
    });
    const topSale = document.getElementById('topSaleBtn');
    if (topSale) topSale.addEventListener('click', function () { MMB.openSaleForm(); });
    const sideSale = document.getElementById('sideSaleBtn');
    if (sideSale) sideSale.addEventListener('click', function () { MMB.openSaleForm(); });
    const sidePurchase = document.getElementById('sidePurchaseBtn');
    if (sidePurchase) sidePurchase.addEventListener('click', function () { MMB.openPurchaseForm(); });

    const syncBtn = document.getElementById('syncBtn');
    if (syncBtn) syncBtn.addEventListener('click', doSync);
    const fetchBtn = document.getElementById('fetchBtn');
    if (fetchBtn) fetchBtn.addEventListener('click', doFetch);

    MMB.onSyncChange = refreshSyncUI;
    MMB.onSyncState = onSyncState;

    window.addEventListener('hashchange', function () { if (appStarted) renderCurrent(true); });

    window.addEventListener('storage', function (e) {
      if (e.key === 'mmb_dryfruits_v1') MMB.toast(t('settings.anotherTabReload'), 'gold');
    });

    window.addEventListener('online', function () {
      const off = document.getElementById('authOffline');
      if (off) off.hidden = true;
    });
    window.addEventListener('offline', function () {
      const off = document.getElementById('authOffline');
      const screen = document.getElementById('authScreen');
      if (off && screen && !screen.hidden) off.hidden = false;
    });
  }

  function hideAuth() {
    const authScreen = document.getElementById('authScreen');
    if (authScreen) authScreen.hidden = true;
    const boot = document.getElementById('bootGate');
    if (boot) boot.hidden = true;
    document.body.classList.remove('auth-pending', 'signed-out');
    document.body.classList.add('authed');
  }

  function showAuth(message) {
    MMB.closeAll();
    const lock = document.getElementById('lockScreen');
    if (lock) lock.hidden = true;
    try { sessionStorage.removeItem('mmb_unlocked'); } catch (e) { /* ignore */ }

    document.body.classList.remove('authed', 'auth-pending');
    document.body.classList.add('signed-out');
    document.body.style.overflow = '';

    const boot = document.getElementById('bootGate');
    if (boot) boot.hidden = true;
    const authScreen = document.getElementById('authScreen');
    if (authScreen) authScreen.hidden = false;

    MMB.applyI18n(document);
    MMB.setAuthError(message || '');
    const pass = document.getElementById('authPassword');
    if (pass) pass.value = '';
    const email = document.getElementById('authEmail');
    if (email && !email.value) { try { email.focus(); } catch (e) { /* ignore */ } }
  }

  function startApp() {
    hideAuth();
    if (appStarted) {
      MMB.updateStatic();
      renderCurrent(false);
      refreshSyncUI();
      initLock();
      return;
    }
    appStarted = true;
    if (!location.hash) {
      try { history.replaceState(null, '', '#/dashboard'); } catch (e) { location.hash = '#/dashboard'; }
    }
    MMB.updateStatic();
    renderCurrent(true);
    refreshSyncUI();
    initLock();
    initNativeBack();
    if (MMB.initUpdater) MMB.initUpdater();
  }

  /* ── init ─────────────────────────────────────────────────── */
  function init() {
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    MMB.setLang(MMB.db.settings.lang || 'en');
    document.documentElement.setAttribute('data-theme', MMB.db.settings.theme === 'dark' ? 'dark' : 'light');
    MMB.applyI18n(document);
    updateThemeButton();
    bindChrome();
    MMB.bindAuthScreen();

    MMB.cloud.onChange(function (user, err) {
      if (user) startApp();
      else showAuth(err === 'unavailable' ? t('auth.unavailable') : '');
    });
    MMB.cloud.init();

    if ('serviceWorker' in navigator && location.protocol.indexOf('http') === 0 && !(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform())) {
      window.addEventListener('load', function () {
        navigator.serviceWorker.register('sw.js').catch(function (e) { console.warn('SW registration failed', e); });
      });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
