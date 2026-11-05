/* ── Live updates: GitHub feed + Capacitor updater ───────────────
   Web/PWA : checks update.json and reloads through the service worker.
   Android : downloads the next web bundle with @capgo/capacitor-updater.
   Native changes are signalled with minNativeVersion -> APK download. */
(function () {
  const MMB = window.MMB;
  const t = MMB.t;
  const cfg = window.MMB_CONFIG || { version: '1.0.0', build: 'dev', feedUrl: '', apkUrl: '' };

  MMB.updateState = {
    checking: false,
    status: 'idle',
    message: '',
    feed: null,
    currentWeb: cfg.version || '1.0.0',
    currentBuild: cfg.build || 'dev',
    nativeVersion: '',
    bundleId: null,
    bundleVersion: null,
    nativeRequired: null,
    webReady: false,
    lastCheckedAt: null,
    error: ''
  };

  function isNative() {
    return !!(window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform());
  }
  MMB.isNativeApp = isNative;

  function plugin(name) {
    try { return window.Capacitor && window.Capacitor.Plugins ? window.Capacitor.Plugins[name] : null; } catch (e) { return null; }
  }

  function isOffline() {
    try { return navigator.onLine === false; } catch (e) { return false; }
  }

  function feedUrl() {
    const custom = MMB.db && MMB.db.settings && MMB.db.settings.updates ? String(MMB.db.settings.updates.feedUrl || '').trim() : '';
    return custom || String(cfg.feedUrl || '').trim();
  }
  MMB.updateFeedUrl = feedUrl;

  function baseVersion(v) { return String(v || '').split('+')[0].replace(/[^0-9.].*$/, ''); }

  function cmpVersion(a, b) {
    const pa = baseVersion(a).split('.').map(function (n) { return parseInt(n, 10) || 0; });
    const pb = baseVersion(b).split('.').map(function (n) { return parseInt(n, 10) || 0; });
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const x = pa[i] || 0, y = pb[i] || 0;
      if (x > y) return 1;
      if (x < y) return -1;
    }
    return 0;
  }

  async function getNativeVersion() {
    if (!isNative()) return '0.0.0';
    if (MMB.updateState.nativeVersion) return MMB.updateState.nativeVersion;
    try {
      const app = plugin('App');
      if (app && app.getInfo) {
        const info = await app.getInfo();
        MMB.updateState.nativeVersion = info.version || cfg.nativeVersion || '1.0.0';
        return MMB.updateState.nativeVersion;
      }
    } catch (e) { /* fall back */ }
    MMB.updateState.nativeVersion = cfg.nativeVersion || '1.0.0';
    return MMB.updateState.nativeVersion;
  }

  async function fetchFeed(url) {
    // Native: use CapacitorHttp so GitHub Pages / raw.githubusercontent CORS
    // headers cannot block the check.
    if (isNative()) {
      const http = plugin('CapacitorHttp');
      if (http && http.get) {
        try {
          const res = await http.get({
            url: url + (url.indexOf('?') === -1 ? '?' : '&') + 't=' + Date.now(),
            responseType: 'json',
            connectTimeout: 15000,
            readTimeout: 15000
          });
          if (res && res.status && res.status >= 400) throw new Error('http-' + res.status);
          return typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
        } catch (e) {
          // Bridge or plugin trouble: retry with the WebView's own fetch below.
        }
      }
    }
    const res = await fetch(url + (url.indexOf('?') === -1 ? '?' : '&') + 't=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) throw new Error('http-' + res.status);
    return await res.json();
  }

  function statusTitle() {
    const s = MMB.updateState;
    if (s.checking || s.status === 'checking') return t('settings.checking');
    if (s.status === 'up-to-date') return t('settings.upToDate');
    if (s.status === 'downloading') return t('settings.downloading');
    if (s.status === 'ready') return t('settings.updateReady');
    if (s.status === 'native-required') return t('settings.nativeRequired', { version: s.nativeRequired ? s.nativeRequired.version : '' });
    if (s.status === 'web-ready') return t('settings.updateAvailable', { version: s.feed ? s.feed.webVersion : '' });
    if (s.status === 'no-feed') return t('settings.feedMissing');
    if (s.status === 'offline') return t('settings.offline');
    if (s.status === 'error') return t('settings.updateError');
    return t('settings.updatesHint');
  }

  function statusButtons() {
    const s = MMB.updateState;
    if (s.status === 'native-required') {
      return '<div class="hint warn mt-12">' + t('settings.nativeBody') + '</div>' +
        '<button class="btn btn-gold btn-block mt-12" data-upd-apk>' + MMB.icon('download') + t('settings.downloadNewApp') + '</button>';
    }
    if (s.status === 'ready') {
      return '<button class="btn btn-primary btn-block mt-12" data-upd-restart>' + MMB.icon('refresh') + t('settings.restartNow') + '</button>';
    }
    if (s.status === 'web-ready') {
      return '<button class="btn btn-primary btn-block mt-12" data-upd-reload>' + MMB.icon('refresh') + t('settings.reload') + '</button>';
    }
    if (s.status === 'error' || s.status === 'offline') {
      return '<button class="btn btn-primary btn-block mt-12" data-upd-retry>' + MMB.icon('refresh') + t('settings.retry') + '</button>';
    }
    return '';
  }

  MMB.updateBoxHTML = function () {
    const s = MMB.updateState;
    const web = (s.currentWeb || '—') + (s.currentBuild && s.currentBuild !== 'dev' ? ' · ' + s.currentBuild : '');
    const native = isNative() ? (s.nativeVersion || '…') : '—';
    const feed = s.feed && s.feed.webVersion ? s.feed.webVersion : '';
    const feedUrlText = feedUrl();
    let last = t('settings.neverChecked');
    if (s.lastCheckedAt) {
      const d = new Date(s.lastCheckedAt);
      const hm = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
      last = MMB.fmtDate(MMB.todayISO(d)) + ' ' + MMB.fmtTime(hm);
    }
    return '<div class="setting-row">' +
      '<div class="si blue">' + MMB.icon('refresh') + '</div>' +
      '<div class="setting-label"><div class="st">' + t('settings.currentWeb') + '</div><div class="ss num">' + MMB.esc(web) + ' · ' + t('settings.currentNative') + ': ' + MMB.esc(native) + '</div></div>' +
      '</div>' +
      '<div class="setting-row" style="display:block">' +
      '<div class="row-flex" style="justify-content:space-between;align-items:flex-start;gap:12px">' +
      '<div class="setting-label"><div class="st">' + MMB.esc(statusTitle()) + '</div>' +
      (s.feed && s.feed.notes ? '<div class="ss">' + MMB.esc(s.feed.notes) + '</div>' : '') +
      '<div class="ss">' + t('settings.lastChecked', { date: last }) + (feed ? ' · ' + t('settings.latest') + ': ' + MMB.esc(feed) : '') + '</div></div>' +
      '<button class="btn btn-sm btn-primary" id="updCheck" ' + (s.checking ? 'disabled' : '') + '>' + (s.checking ? t('settings.checking') : t('settings.checkUpdates')) + '</button>' +
      '</div>' +
      statusButtons() +
      (s.error && s.status === 'error' ? '<div class="hint mt-8" style="word-break:break-all">' + MMB.esc(t('settings.errorDetail', { code: s.error })) + '</div>' : '') +
      (feedUrlText ? '<div class="hint mt-12" style="word-break:break-all">' + MMB.esc(feedUrlText) + '</div>' : '') +
      '</div>';
  };

  MMB.bindUpdateBox = function (root) {
    const box = (root || document).querySelector('#updateBox');
    if (!box) return;
    box.innerHTML = MMB.updateBoxHTML();
    const check = box.querySelector('#updCheck');
    if (check) check.addEventListener('click', function () { MMB.checkForUpdates({ manual: true }); });
    const apk = box.querySelector('[data-upd-apk]');
    if (apk) apk.addEventListener('click', function () { MMB.openApkDownload(); });
    const restart = box.querySelector('[data-upd-restart]');
    if (restart) restart.addEventListener('click', function () { MMB.applyDownloadedUpdate(); });
    const reload = box.querySelector('[data-upd-reload]');
    if (reload) reload.addEventListener('click', function () { MMB.reloadWebApp(); });
    const retry = box.querySelector('[data-upd-retry]');
    if (retry) retry.addEventListener('click', function () { MMB.checkForUpdates({ manual: true }); });
  };

  MMB.dashboardUpdateHTML = function () {
    const s = MMB.updateState;
    if (s.status === 'native-required') {
      return '<div class="banner" style="border-color:color-mix(in srgb,var(--gold) 45%,var(--line))">' +
        MMB.icon('alert') +
        '<div><strong>' + t('update.nativeBanner', { version: s.nativeRequired ? s.nativeRequired.version : '' }) + '</strong> ' +
        '<span class="muted">' + t('update.nativeShort') + '</span></div>' +
        '<button class="btn btn-sm btn-gold" data-upd-apk>' + MMB.icon('download') + t('update.download') + '</button></div>';
    }
    if (s.status === 'ready') {
      return '<div class="banner" style="border-color:color-mix(in srgb,var(--green-2) 35%,var(--line));background:var(--green-soft)">' +
        MMB.icon('check') +
        '<div><strong>' + t('update.readyBanner', { version: s.bundleVersion || '' }) + '</strong> ' +
        '<span class="muted">' + t('update.readyShort') + '</span></div>' +
        '<button class="btn btn-sm btn-primary" data-upd-restart>' + MMB.icon('refresh') + t('update.restart') + '</button></div>';
    }
    if (s.status === 'web-ready') {
      return '<div class="banner" style="border-color:color-mix(in srgb,var(--green-2) 35%,var(--line));background:var(--green-soft)">' +
        MMB.icon('refresh') + '<strong>' + t('update.webBanner') + '</strong>' +
        '<button class="btn btn-sm btn-primary" data-upd-reload>' + t('update.reload') + '</button></div>';
    }
    return '';
  };

  MMB.mountUpdateBanner = function (root) {
    const host = (root || document).querySelector('#dashUpdateBanner');
    if (!host) return;
    host.innerHTML = MMB.dashboardUpdateHTML();
    const apk = host.querySelector('[data-upd-apk]');
    if (apk) apk.addEventListener('click', function () { MMB.openApkDownload(); });
    const restart = host.querySelector('[data-upd-restart]');
    if (restart) restart.addEventListener('click', function () { MMB.applyDownloadedUpdate(); });
    const reload = host.querySelector('[data-upd-reload]');
    if (reload) reload.addEventListener('click', function () { MMB.reloadWebApp(); });
  };

  MMB.refreshUpdateUI = function () {
    if (document.getElementById('updateBox')) MMB.bindUpdateBox(document);
    if (document.getElementById('dashUpdateBanner')) MMB.mountUpdateBanner(document);
  };

  MMB.checkForUpdates = async function (opts) {
    opts = opts || {};
    const s = MMB.updateState;
    if (s.checking) return;
    s.checking = true;
    s.status = 'checking';
    s.error = '';
    MMB.refreshUpdateUI();
    try {
      const url = feedUrl();
      if (!url) throw new Error('no-feed');
      if (isOffline()) throw new Error('offline');
      if (isNative() && !/^https?:\/\//i.test(url)) throw new Error('no-feed');
      const feed = await fetchFeed(url);
      if (!feed || !feed.webVersion) throw new Error('bad-feed');
      s.feed = feed;
      s.lastCheckedAt = new Date().toISOString();
      const native = await getNativeVersion();
      s.nativeVersion = native;

      if (isNative() && feed.minNativeVersion && cmpVersion(feed.minNativeVersion, native) > 0) {
        s.status = 'native-required';
        s.nativeRequired = {
          version: feed.minNativeVersion,
          url: feed.apkUrl || cfg.apkUrl || ''
        };
        s.webReady = false;
        MMB.refreshUpdateUI();
        if (opts.manual || opts.auto) MMB.toast(t('settings.nativeAvailable'), 'gold');
        return;
      }

      const newer = (feed.build && s.currentBuild && feed.build !== s.currentBuild) ||
        cmpVersion(feed.webVersion, s.currentWeb) > 0;
      if (!newer) {
        s.status = 'up-to-date';
        s.nativeRequired = null;
        MMB.refreshUpdateUI();
        if (opts.manual) MMB.toast(t('settings.upToDate'));
        return;
      }

      if (isNative()) {
        const updater = plugin('CapacitorUpdater');
        if (!updater || !updater.download) throw new Error('no-updater');
        if (!feed.zipUrl) throw new Error('no-zip');
        s.status = 'downloading';
        MMB.refreshUpdateUI();
        const bundle = await updater.download({ url: feed.zipUrl, version: feed.webVersion });
        if (!bundle || !bundle.id) throw new Error('download-failed');
        await updater.next({ id: bundle.id });
        s.bundleId = bundle.id;
        s.bundleVersion = feed.webVersion;
        s.status = 'ready';
        s.nativeRequired = null;
        s.webReady = false;
        MMB.refreshUpdateUI();
        MMB.toast(t('settings.updateDownloaded'), 'gold');
        return;
      }

      // Web / PWA: the new build is already deployed; the service worker
      // fetches it and the page reloads.
      s.status = 'web-ready';
      s.webReady = true;
      s.nativeRequired = null;
      MMB.refreshUpdateUI();
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg) await reg.update();
      } catch (e) { /* ignore */ }
      if (opts.manual) MMB.toast(t('settings.updateAvailable', { version: feed.webVersion }), 'gold');
    } catch (e) {
      console.warn('Update check failed', e);
      const code = e && e.message ? String(e.message) : 'error';
      s.error = code;
      s.status = code === 'no-feed' ? 'no-feed' : code === 'offline' ? 'offline' : 'error';
      if (opts.auto) {
        // A launch-time check should not leave a scary error sitting in Settings.
        // Offline stays visible so the online listener can retry it.
        if (code !== 'offline') {
          s.status = 'idle';
          s.error = '';
        }
      }
      MMB.refreshUpdateUI();
      if (opts.manual) {
        const msg = code === 'no-feed' ? t('settings.updateNoFeed') : code === 'offline' ? t('settings.offline') : t('settings.updateError');
        MMB.toast(msg, code === 'offline' ? 'gold' : 'error');
      }
    } finally {
      s.checking = false;
      MMB.refreshUpdateUI();
    }
  };

  MMB.applyDownloadedUpdate = async function () {
    const s = MMB.updateState;
    if (!isNative()) { MMB.reloadWebApp(); return; }
    const updater = plugin('CapacitorUpdater');
    if (!updater || !s.bundleId || !updater.set) { MMB.toast(t('settings.updateError'), 'error'); return; }
    try {
      await updater.set({ id: s.bundleId });
    } catch (e) {
      MMB.toast(t('settings.updateError'), 'error');
    }
  };

  MMB.reloadWebApp = async function () {
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) {
        const changed = new Promise(function (resolve) {
          let done = false;
          const finish = function () { if (!done) { done = true; resolve(); } };
          navigator.serviceWorker.addEventListener('controllerchange', finish, { once: true });
          setTimeout(finish, 1800);
        });
        await reg.update();
        await changed;
      }
    } catch (e) { /* ignore */ }
    location.reload();
  };

  MMB.openApkDownload = async function () {
    const s = MMB.updateState;
    const url = (s.nativeRequired && s.nativeRequired.url) || (s.feed && s.feed.apkUrl) || cfg.apkUrl || '';
    if (!url) { MMB.toast(t('settings.updateError'), 'error'); return; }
    try {
      if (isNative()) {
        const browser = plugin('Browser');
        if (browser && browser.open) await browser.open({ url: url });
        else window.open(url, '_system');
      } else {
        window.open(url, '_blank', 'noopener');
      }
      MMB.toast(t('settings.updateApkHint'), 'gold');
    } catch (e) {
      MMB.toast(t('settings.updateError'), 'error');
    }
  };

  MMB.notifyAppReady = function () {
    if (!isNative()) return;
    const updater = plugin('CapacitorUpdater');
    if (updater && updater.notifyAppReady) {
      try { updater.notifyAppReady().catch(function () { }); } catch (e) { /* ignore */ }
    }
  };

  MMB.initUpdater = function () {
    MMB.notifyAppReady();
    getNativeVersion().then(function () { MMB.refreshUpdateUI(); });
    window.addEventListener('online', function () {
      if (MMB.updateState.status !== 'offline') return;
      const stillAuto = MMB.db && MMB.db.settings && MMB.db.settings.updates ? MMB.db.settings.updates.autoCheck : true;
      if (stillAuto !== false) MMB.checkForUpdates({ auto: true });
    });
    if (!isNative()) return;
    const auto = MMB.db && MMB.db.settings && MMB.db.settings.updates ? MMB.db.settings.updates.autoCheck : true;
    if (auto === false) return;
    setTimeout(function () {
      const stillAuto = MMB.db && MMB.db.settings && MMB.db.settings.updates ? MMB.db.settings.updates.autoCheck : true;
      if (stillAuto !== false) MMB.checkForUpdates({ auto: true });
    }, 1800);
  };
})();
