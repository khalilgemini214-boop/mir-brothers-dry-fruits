/* ── Firebase auth gate ──────────────────────────────────────────
   Only email/password sign-in. Accounts are created by the owner in
   the Firebase console; there is no sign-up in this app.            */
(function () {
  const MMB = window.MMB;
  const CFG = window.MMB_FIREBASE || {};
  const LAST_EMAIL = 'mmb_last_email';

  let app = null;
  let auth = null;
  let booted = false;
  let persistence = null;
  let currentUser = null;
  let changeHandler = null;
  let lastError = null;

  function configured() {
    return !!(CFG.apiKey && CFG.projectId && CFG.authDomain);
  }

  function emit() {
    if (changeHandler) changeHandler(currentUser, lastError);
  }

  function init() {
    if (booted) return;
    booted = true;
    if (!configured() || !window.firebase) {
      console.error('Firebase is not configured or the SDK did not load.');
      lastError = 'unavailable';
      setTimeout(emit, 0);
      return;
    }
    try {
      app = (firebase.apps && firebase.apps.length) ? firebase.app() : firebase.initializeApp(CFG);
      auth = firebase.auth();
      persistence = auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL)
        .catch(function (e) { console.warn('Auth persistence fallback', e); });
      auth.onAuthStateChanged(function (user) {
        currentUser = user || null;
        lastError = null;
        emit();
      }, function (e) {
        console.error('Auth state error', e);
        lastError = (e && e.code) || 'unavailable';
        emit();
      });
    } catch (e) {
      console.error('Firebase init failed', e);
      lastError = 'unavailable';
      setTimeout(emit, 0);
    }
  }

  async function signIn(email, password) {
    if (!auth) {
      const err = new Error('Sign-in is unavailable');
      err.code = 'auth/unavailable';
      throw err;
    }
    if (persistence) { try { await persistence; } catch (e) { /* ignore */ } }
    lastError = null;
    return auth.signInWithEmailAndPassword(email, password);
  }

  async function signOut() {
    if (!auth) return;
    await auth.signOut();
  }

  function friendly(code) {
    switch (String(code || '')) {
      case 'auth/invalid-email':
      case 'auth/user-not-found':
      case 'auth/wrong-password':
      case 'auth/invalid-credential':
      case 'auth/invalid-login-credentials':
      case 'auth/missing-password':
        return MMB.t('auth.invalid');
      case 'auth/too-many-requests':
        return MMB.t('auth.tooMany');
      case 'auth/user-disabled':
        return MMB.t('auth.disabled');
      case 'auth/network-request-failed':
      case 'auth/timeout':
        return MMB.t('auth.network');
      case 'auth/unavailable':
        return MMB.t('auth.unavailable');
      default:
        return MMB.t('auth.invalid');
    }
  }

  function setError(msg) {
    const el = document.getElementById('authError');
    if (el) el.textContent = msg || '';
  }

  function setBusy(on) {
    const btn = document.getElementById('authSubmit');
    const label = document.getElementById('authSubmitLabel');
    const email = document.getElementById('authEmail');
    const pass = document.getElementById('authPassword');
    if (btn) { btn.disabled = !!on; btn.classList.toggle('busy', !!on); }
    if (label) label.textContent = on ? MMB.t('auth.signingIn') : MMB.t('auth.signIn');
    if (email) email.disabled = !!on;
    if (pass) pass.disabled = !!on;
  }

  // navigator.onLine is unreliable in an Android WebView (it needs the
  // ACCESS_NETWORK_STATE permission and can still be stale), so the badge is
  // driven by real request failures instead of the flag.
  function setOffline(show) {
    const el = document.getElementById('authOffline');
    if (el) el.hidden = !show;
  }

  function syncLangBtn() {
    const btn = document.getElementById('authLang');
    if (!btn) return;
    btn.textContent = MMB.lang() === 'en' ? 'اردو' : 'English';
    btn.setAttribute('lang', MMB.lang() === 'en' ? 'ur' : 'en');
  }

  function toggleLang() {
    const next = MMB.lang() === 'en' ? 'ur' : 'en';
    MMB.db.settings.lang = next;
    MMB.save();
    MMB.setLang(next);
    MMB.applyI18n(document);
    setError('');
    setBusy(false);
    syncLangBtn();
  }

  MMB.cloud = {
    configured: configured,
    init: init,
    signIn: signIn,
    signOut: signOut,
    email: function () { return currentUser ? (currentUser.email || '') : ''; },
    uid: function () { return currentUser ? currentUser.uid : ''; },
    signedIn: function () { return !!currentUser; },
    onChange: function (fn) { changeHandler = fn; },
    lastError: function () { return lastError; },
    friendly: friendly
  };

  MMB.setAuthError = setError;
  MMB.setAuthBusy = setBusy;

  MMB.bindAuthScreen = function () {
    const form = document.getElementById('authForm');
    if (!form || form.dataset.bound) return;
    form.dataset.bound = '1';

    const email = document.getElementById('authEmail');
    const pass = document.getElementById('authPassword');
    const show = document.getElementById('authShow');
    const langBtn = document.getElementById('authLang');

    try { email.value = localStorage.getItem(LAST_EMAIL) || ''; } catch (e) { /* ignore */ }

    form.addEventListener('submit', async function (ev) {
      ev.preventDefault();
      setError('');
      const mail = email.value.trim();
      const secret = pass.value;
      if (!mail || !secret) {
        setError(MMB.t('auth.required'));
        (mail ? pass : email).focus();
        return;
      }
      setBusy(true);
      try {
        await MMB.cloud.signIn(mail, secret);
        try { localStorage.setItem(LAST_EMAIL, mail); } catch (e) { /* ignore */ }
        pass.value = '';
      } catch (err) {
        const code = err && err.code;
        if (code === 'auth/network-request-failed' || code === 'auth/timeout') setOffline(true);
        setError(friendly(code));
        const card = document.querySelector('.auth-card');
        if (card) {
          card.classList.add('shake');
          setTimeout(function () { card.classList.remove('shake'); }, 420);
        }
      } finally {
        setBusy(false);
      }
    });

    if (show) {
      show.addEventListener('click', function () {
        const hidden = pass.type === 'password';
        pass.type = hidden ? 'text' : 'password';
        show.classList.toggle('on', hidden);
        show.setAttribute('aria-label', MMB.t(hidden ? 'auth.hide' : 'auth.show'));
      });
    }

    if (langBtn) langBtn.addEventListener('click', toggleLang);

    window.addEventListener('online', function () {
      setOffline(false);
      const screen = document.getElementById('authScreen');
      if (screen && !screen.hidden) setError('');
    });
    window.addEventListener('offline', function () { setOffline(true); });

    syncLangBtn();
  };
})();
