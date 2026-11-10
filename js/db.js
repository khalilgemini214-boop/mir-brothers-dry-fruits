/* ── Data layer: localStorage, ledger, stock replay, bills ────── */
(function () {
  const MMB = window.MMB;
  const KEY = 'mmb_dryfruits_v1';
  const SCHEMA = 2;
  const COLLECTIONS = ['accounts', 'products', 'ledger', 'sales', 'purchases', 'returns', 'adjustments'];
  const SHARED_SETTINGS = ['shop', 'commissionRate', 'lowStockKg', 'defaultCartonKg'];

  // Existing installs still carry the old shop profile in localStorage.
  // Upgrade it in place, but only when the fields are untouched defaults.
  const SHOP_OLD = {
    addressEn: 'Shop No. 3, Jani Dost Muhammad Chowk, Chamni Bazar Road, Quetta',
    addressUr: 'دکان نمبر 3، جانی دوست محمد چوک، چمنی بازار روڈ، کوئٹہ',
    phones: ['081-2839625', '0301-3761005', '0333-7806994']
  };
  const SHOP_NEW = {
    addressEn: 'Shop No.3, Haji Doust Muhammad Market, Chuharmal Road, Quetta.',
    addressUr: 'دکان نمبر 3، حاجی دوست محمد مارکیٹ، چوہرمل روڈ، کوئٹہ',
    phones: ['03013761005', '03168296398', '03197812344', '03073817033']
  };

  function upgradeShopDefaults(out) {
    const shop = out.settings.shop;
    let changed = false;
    if (shop.addressEn === SHOP_OLD.addressEn) { shop.addressEn = SHOP_NEW.addressEn; changed = true; }
    if (shop.addressUr === SHOP_OLD.addressUr) { shop.addressUr = SHOP_NEW.addressUr; changed = true; }
    if (Array.isArray(shop.phones) && shop.phones.length === SHOP_OLD.phones.length &&
      shop.phones.every(function (p, i) { return p === SHOP_OLD.phones[i]; })) {
      shop.phones = SHOP_NEW.phones.slice();
      changed = true;
    }
    return changed;
  }

  MMB.recordHash = function (rec) { return hashRecord(rec); };

  function hashRecord(rec) {
    const s = JSON.stringify(rec);
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16) + ':' + s.length;
  }

  // Ledger rows created by a bill are a projection of that bill. Deriving their
  // ids from the bill makes an edit update the same document on every device
  // instead of deleting one row and creating another.
  function ledgerIdFor(e) {
    if (!e || !e.refType || e.refType === 'manual' || !e.refId) return e && e.id;
    if (e.refType === 'sale') return 'led_' + e.refId + (e.subtype === 'commission' ? '_commission' : '_sale');
    if (e.refType === 'purchase') return 'led_' + e.refId + '_purchase';
    if (e.refType === 'return') return 'led_' + e.refId + '_return';
    if (e.refType === 'saleReturn') return 'led_' + e.refId + (e.subtype === 'commissionReversal' ? '_commissionReversal' : '_saleReturn');
    return e.id;
  }

  function sharedSettingsOf(db) {
    const s = db.settings;
    const out = {};
    SHARED_SETTINGS.forEach(function (k) { out[k] = s[k]; });
    if (out.shop) {
      out.shop = Object.assign({}, out.shop);
      delete out.shop.logo; // the logo is stored separately, it can be large
    }
    return out;
  }

  function defaults() {
    return {
      app: 'mmb-dryfruits',
      version: 1,
      schema: SCHEMA,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      rev: 1,
      settings: {
        lang: 'en',
        theme: 'light',
        shop: {
          nameEn: 'Muhammad Mir & Brothers',
          nameUr: 'محمد میر اینڈ برادرز',
          taglineEn: 'Importer & Exporter',
          taglineUr: 'امپورٹر اینڈ ایکسپورٹر',
          addressEn: 'Shop No.3, Haji Doust Muhammad Market, Chuharmal Road, Quetta.',
          addressUr: 'دکان نمبر 3، حاجی دوست محمد مارکیٹ، چوہرمل روڈ، کوئٹہ',
          phones: ['03013761005', '03168296398', '03197812344', '03073817033'],
          logo: ''
        },
        commissionRate: 0.45,
        lowStockKg: 5,
        defaultCartonKg: 10,
        billCounter: 227,
        purchaseCounter: 1,
        pinSalt: null,
        pinHash: null,
        backupLastAt: null,
        updates: { feedUrl: '', autoCheck: true, lastCheckedAt: null }
      },
      accounts: [],
      products: [],
      ledger: [],
      sales: [],
      purchases: [],
      returns: [],
      adjustments: [],
      sync: {
        uid: null,
        deviceId: null,
        cursor: null,
        lastFetchedServerAt: null,
        lastSyncedAt: null,
        dirty: {},
        tombstones: {},
        seen: {},
        base: {},
        settingsBase: '',
        dirtySettings: false,
        logoBase: '',
        dirtyLogo: false,
        logoSeen: 0
      }
    };
  }

  function deepMerge(base, extra) {
    if (!extra || typeof extra !== 'object') return base;
    const out = Array.isArray(base) ? base.slice() : Object.assign({}, base);
    Object.keys(extra).forEach(function (k) {
      const v = extra[k];
      if (v && typeof v === 'object' && !Array.isArray(v) && base && typeof base[k] === 'object' && !Array.isArray(base[k])) {
        out[k] = deepMerge(base[k], v);
      } else if (v !== undefined) {
        out[k] = v;
      }
    });
    return out;
  }

  function migrate(out) {
    const now = new Date().toISOString();

    const seen = {};
    const ledger = [];
    (out.ledger || []).forEach(function (e) {
      if (!e || !e.id) return;
      const id = ledgerIdFor(e);
      if (id) e.id = id;
      if (seen[e.id]) return;
      seen[e.id] = true;
      if (!e.updatedAt) e.updatedAt = e.createdAt || now;
      ledger.push(e);
    });
    out.ledger = ledger;

    COLLECTIONS.forEach(function (name) {
      if (name === 'ledger') return;
      (out[name] || []).forEach(function (rec) {
        if (!rec.id) rec.id = MMB.uid(name.slice(0, 3));
        if (!rec.updatedAt) rec.updatedAt = rec.createdAt || now;
      });
    });

    // Baseline for the change diff. Only records the diff has never seen are
    // added, so a pending edit survives a reload.
    COLLECTIONS.forEach(function (name) {
      (out[name] || []).forEach(function (rec) {
        const key = name + ':' + rec.id;
        if (!out.sync.base[key]) out.sync.base[key] = hashRecord(rec);
      });
    });
    if (!out.sync.settingsBase) out.sync.settingsBase = hashRecord(sharedSettingsOf(out));
    if (!out.sync.logoBase) out.sync.logoBase = hashRecord({ logo: out.settings.shop.logo || '' });
  }

  // First run of cloud sync on a device that already had local data: queue
  // everything once, so the first Sync is not a no-op.
  function seedOutbox(out) {
    const now = new Date().toISOString();
    COLLECTIONS.forEach(function (name) {
      (out[name] || []).forEach(function (rec) {
        if (!rec || !rec.id) return;
        out.sync.dirty[name + ':' + rec.id] = {
          op: 'set', at: now, entity: name,
          manual: name === 'ledger' ? rec.refType === 'manual' : false,
          pair: name === 'ledger' ? !!rec.isPairSide : false
        };
      });
    });
    out.sync.dirtySettings = true;
    out.sync.dirtyLogo = true;
  }

  function normalize(raw) {
    const d = defaults();
    const out = Object.assign(d, raw || {});
    out.settings = deepMerge(d.settings, (raw && raw.settings) || {});
    out.settings.shop = deepMerge(d.settings.shop, (raw && raw.settings && raw.settings.shop) || {});
    if (!Array.isArray(out.settings.shop.phones)) out.settings.shop.phones = d.settings.shop.phones.slice();
    COLLECTIONS.forEach(function (k) {
      if (!Array.isArray(out[k])) out[k] = [];
    });
    out.settings.billCounter = Math.max(1, Number(out.settings.billCounter) || 227);
    out.settings.purchaseCounter = Math.max(1, Number(out.settings.purchaseCounter) || 1);
    out.settings.commissionRate = Number(out.settings.commissionRate);
    if (!isFinite(out.settings.commissionRate)) out.settings.commissionRate = 0.45;
    out.app = 'mmb-dryfruits';
    out.version = 1;
    out.schema = SCHEMA;
    out.rev = Math.max(1, Number(out.rev) || 1);
    out.sync = Object.assign({}, d.sync, (raw && raw.sync) || {});
    ['dirty', 'tombstones', 'seen', 'base'].forEach(function (k) {
      if (!out.sync[k] || typeof out.sync[k] !== 'object' || Array.isArray(out.sync[k])) out.sync[k] = {};
    });
    migrate(out);

    if (upgradeShopDefaults(out)) {
      // Make the new profile the baseline and queue it for the next Sync.
      out.sync.settingsBase = hashRecord(sharedSettingsOf(out));
      out.sync.dirtySettings = true;
    }

    const hasData = COLLECTIONS.some(function (k) { return out[k].length > 0; });
    const neverSynced = !out.sync.uid && !out.sync.lastSyncedAt && !out.sync.lastFetchedAt;
    const hasPending = Object.keys(out.sync.dirty).length > 0;
    if (hasData && neverSynced && !hasPending) seedOutbox(out);

    return out;
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return normalize(null);
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return defaults();
      return normalize(parsed);
    } catch (e) {
      console.warn('Could not read saved data', e);
      return defaults();
    }
  }

  MMB.db = load();

  // Compares every record with the last known fingerprint and records what
  // changed. This keeps all existing mutation code untouched.
  function markDirty() {
    const d = MMB.db;
    const s = d.sync;
    const now = new Date().toISOString();

    COLLECTIONS.forEach(function (name) {
      const present = {};
      (d[name] || []).forEach(function (rec) {
        if (!rec || !rec.id) return;
        const key = name + ':' + rec.id;
        present[key] = true;
        if (s.base[key] === hashRecord(rec)) return;
        rec.updatedAt = now;
        s.base[key] = hashRecord(rec);
        s.dirty[key] = {
          op: 'set', at: now, entity: name,
          manual: name === 'ledger' ? rec.refType === 'manual' : false,
          pair: name === 'ledger' ? !!rec.isPairSide : false
        };
        delete s.tombstones[key];
      });
      Object.keys(s.base).forEach(function (key) {
        if (key.indexOf(name + ':') !== 0) return;
        if (present[key]) return;
        const prev = s.dirty[key];
        delete s.base[key];
        s.dirty[key] = {
          op: 'del', at: now, entity: name,
          manual: prev ? !!prev.manual : false,
          pair: prev ? !!prev.pair : false
        };
        if (!s.tombstones[key]) s.tombstones[key] = { at: now, pushed: false };
      });
    });

    const sh = hashRecord(sharedSettingsOf(d));
    if (s.settingsBase !== sh) {
      s.settingsBase = sh;
      s.dirtySettings = true;
    }

    const lh = hashRecord({ logo: d.settings.shop.logo || '' });
    if (s.logoBase !== lh) {
      s.logoBase = lh;
      s.dirtyLogo = true;
    }
  }

  MMB.save = function (opts) {
    opts = opts || {};
    // Guard against a stale tab overwriting newer data from another tab.
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const prev = JSON.parse(raw);
        if (prev && Number(prev.rev || 0) > Number(MMB.db.rev || 0)) {
          if (MMB.toast) MMB.toast(MMB.t('settings.anotherTab'), 'error');
          return false;
        }
      }
    } catch (e) { /* ignore */ }

    MMB.db.rev = (Number(MMB.db.rev) || 1) + 1;
    if (opts.origin !== 'remote') markDirty();
    MMB.db.updatedAt = new Date().toISOString();
    try {
      localStorage.setItem(KEY, JSON.stringify(MMB.db));
      if (MMB.onSyncChange) MMB.onSyncChange();
      return true;
    } catch (e) {
      console.error(e);
      if (MMB.toast) MMB.toast('Storage is full. Please export a backup and remove old data.', 'error');
      return false;
    }
  };

  // One "transaction" can touch a bill plus its ledger rows. Count what the
  // user did, not every row the bill generated.
  MMB.pendingCount = function () {
    const s = MMB.db.sync;
    let n = 0;
    Object.keys(s.dirty).forEach(function (key) {
      const d = s.dirty[key];
      if (d.entity !== 'ledger') n++;
      else if (d.manual && !d.pair) n++;
    });
    return n;
  };

  MMB.sharedSettings = function () { return sharedSettingsOf(MMB.db); };
  MMB.sharedSettingsHash = function (db) { return hashRecord(sharedSettingsOf(db || MMB.db)); };

  MMB.resetData = function () {
    try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
    MMB.db = defaults();
    // A cleared device must not push default settings over the cloud copy.
    MMB.db.sync.settingsBase = hashRecord(sharedSettingsOf(MMB.db));
    MMB.db.sync.logoBase = hashRecord({ logo: MMB.db.settings.shop.logo || '' });
    MMB.save();
  };

  MMB.settings = function () { return MMB.db.settings; };
  MMB.accounts = function (type) {
    const list = MMB.db.accounts.filter(function (a) { return !a.deleted; });
    return type ? list.filter(function (a) { return a.type === type; }) : list;
  };
  MMB.account = function (id) { return MMB.db.accounts.find(function (a) { return a.id === id; }) || null; };
  MMB.product = function (id) { return MMB.db.products.find(function (p) { return p.id === id; }) || null; };

  MMB.accountName = function (id) {
    const a = MMB.account(id);
    return a ? a.name : '—';
  };

  /* ── accounts ─────────────────────────────────────────────── */
  MMB.addAccount = function (data) {
    const name = String(data.name || '').trim();
    if (!name) return { ok: false, error: 'name' };
    const a = {
      id: MMB.uid('acc'),
      name: name,
      phone: String(data.phone || '').trim(),
      type: data.type || 'customer',
      createdAt: new Date().toISOString()
    };
    MMB.db.accounts.push(a);
    MMB.save();
    return { ok: true, account: a };
  };

  MMB.updateAccount = function (id, data) {
    const a = MMB.account(id);
    if (!a) return { ok: false };
    a.name = String(data.name || a.name).trim();
    a.phone = String(data.phone == null ? a.phone : data.phone).trim();
    if (data.type) a.type = data.type;
    MMB.save();
    return { ok: true, account: a };
  };

  MMB.accountIsUsed = function (id) {
    const d = MMB.db;
    return d.ledger.some(function (e) { return e.accountId === id; }) ||
      d.sales.some(function (s) { return s.customerId === id || s.brokerId === id; }) ||
      d.purchases.some(function (p) { return p.supplierId === id; }) ||
      d.returns.some(function (r) { return r.supplierId === id || r.customerId === id || r.brokerId === id; });
  };

  MMB.deleteAccount = function (id) {
    if (MMB.accountIsUsed(id)) return { ok: false, reason: 'used' };
    const a = MMB.account(id);
    if (!a) return { ok: false };
    // Soft delete: old bills keep resolving the name on every device.
    a.deleted = true;
    a.deletedAt = new Date().toISOString();
    MMB.save();
    return { ok: true };
  };

  /* ── balance signs ──────────────────────────────────────────
     Customer / supplier / broker : credit +   debit −
     Cash / bank / expense        : debit  +   credit −
     Positive = green, negative = red.                          */
  MMB.entrySign = function (account, entryType) {
    if (!account) return 1;
    if (account.type === 'cash' || account.type === 'expense') return entryType === 'debit' ? 1 : -1;
    return entryType === 'credit' ? 1 : -1;
  };

  MMB.accountBalance = function (id) {
    const a = MMB.account(id);
    if (!a) return 0;
    return MMB.round(MMB.db.ledger.reduce(function (sum, e) {
      if (e.accountId !== id) return sum;
      return sum + MMB.num(e.amount) * MMB.entrySign(a, e.type);
    }, 0), 2);
  };

  MMB.accountEntries = function (id, order) {
    const list = MMB.db.ledger.filter(function (e) { return e.accountId === id; });
    list.sort(function (a, b) {
      const ka = (a.date || '') + ' ' + (a.time || '00:00') + ' ' + (a.createdAt || '');
      const kb = (b.date || '') + ' ' + (b.time || '00:00') + ' ' + (b.createdAt || '');
      return order === 'oldest' ? (ka < kb ? -1 : ka > kb ? 1 : 0) : (ka > kb ? -1 : ka < kb ? 1 : 0);
    });
    return list;
  };

  MMB.entryPair = function (entry) {
    if (!entry || !entry.pairId) return null;
    return MMB.db.ledger.find(function (e) { return e.id === entry.pairId; }) || null;
  };

  MMB.entryTitle = function (e) {
    if (!e) return '';
    if (e.refType === 'sale') {
      const s = MMB.db.sales.find(function (x) { return x.id === e.refId; });
      const bill = s ? s.billNo : (e.meta && e.meta.no) || '';
      if (e.subtype === 'commission') return MMB.t('ledger.commission') + ' · ' + MMB.t('ledger.linkedBill', { no: bill });
      return MMB.t('ledger.linkedBill', { no: bill });
    }
    if (e.refType === 'purchase') {
      const p = MMB.db.purchases.find(function (x) { return x.id === e.refId; });
      return MMB.t('ledger.linkedPurchase', { no: p ? p.no : (e.meta && e.meta.no) || '' });
    }
    if (e.refType === 'return') {
      return MMB.t('ledger.return') + (e.meta && e.meta.no ? ' · ' + e.meta.no : '');
    }
    if (e.refType === 'saleReturn') {
      const bill = (e.meta && e.meta.no) || '';
      if (e.subtype === 'commissionReversal') return MMB.t('stock.commissionReversal') + ' · ' + MMB.t('ledger.linkedBill', { no: bill });
      return MMB.t('stock.saleReturn') + ' · ' + MMB.t('ledger.linkedBill', { no: bill });
    }
    return e.details || MMB.t('ledger.manual');
  };

  /* ── manual ledger entries ────────────────────────────────── */
  MMB.addEntry = function (data) {
    const d = MMB.db;
    const acc = MMB.account(data.accountId);
    if (!acc) return { ok: false, error: 'account' };
    const amount = MMB.round(MMB.num(data.amount), 2);
    if (!(amount > 0)) return { ok: false, error: 'amount' };
    const type = data.type === 'debit' ? 'debit' : 'credit';
    const base = {
      accountId: acc.id,
      type: type,
      amount: amount,
      details: String(data.details || '').trim(),
      date: data.date || MMB.todayISO(),
      time: data.time || MMB.nowHM(),
      refType: 'manual',
      createdAt: new Date().toISOString()
    };
    const main = Object.assign({ id: MMB.uid('led') }, base);
    d.ledger.push(main);

    if (data.partyId && data.partyId !== acc.id && MMB.account(data.partyId)) {
      const pair = Object.assign({}, base, {
        id: MMB.uid('led'),
        accountId: data.partyId,
        type: type === 'credit' ? 'debit' : 'credit',
        pairId: main.id,
        isPairSide: true
      });
      main.pairId = pair.id;
      d.ledger.push(pair);
    }
    MMB.save();
    return { ok: true, entry: main };
  };

  MMB.updateEntry = function (id, data) {
    const d = MMB.db;
    const e = d.ledger.find(function (x) { return x.id === id; });
    if (!e || e.refType !== 'manual') return { ok: false, error: 'locked' };
    const amount = MMB.round(MMB.num(data.amount), 2);
    if (!(amount > 0)) return { ok: false, error: 'amount' };
    const type = data.type === 'debit' ? 'debit' : 'credit';
    const oldPair = MMB.entryPair(e);

    e.amount = amount;
    e.type = type;
    e.details = String(data.details || '').trim();
    e.date = data.date || e.date;
    e.time = data.time || e.time;

    const partyId = data.partyId && data.partyId !== e.accountId && MMB.account(data.partyId) ? data.partyId : null;
    if (oldPair) d.ledger = d.ledger.filter(function (x) { return x.id !== oldPair.id; });
    e.pairId = null;

    if (partyId) {
      const pair = {
        id: MMB.uid('led'),
        accountId: partyId,
        type: type === 'credit' ? 'debit' : 'credit',
        amount: amount,
        details: e.details,
        date: e.date,
        time: e.time,
        refType: 'manual',
        pairId: e.id,
        isPairSide: true,
        createdAt: new Date().toISOString()
      };
      e.pairId = pair.id;
      d.ledger.push(pair);
    }
    MMB.save();
    return { ok: true, entry: e };
  };

  MMB.deleteEntry = function (id) {
    const d = MMB.db;
    const e = d.ledger.find(function (x) { return x.id === id; });
    if (!e) return { ok: false };
    if (e.refType && e.refType !== 'manual') return { ok: false, error: 'bill' };
    const remove = [e.id];
    if (e.pairId) remove.push(e.pairId);
    d.ledger = d.ledger.filter(function (x) { return remove.indexOf(x.id) === -1; });
    MMB.save();
    return { ok: true };
  };

  /* ── products ─────────────────────────────────────────────── */
  function normName(s) { return String(s || '').trim().toLowerCase().replace(/\s+/g, ' '); }

  MMB.findProduct = function (query) {
    const q = normName(query);
    if (!q) return null;
    return MMB.db.products.find(function (p) {
      if (p.deleted) return false;
      if (normName(p.name) === q) return true;
      return (p.aliases || []).some(function (a) { return normName(a) === q; });
    }) || null;
  };

  MMB.searchProducts = function (query) {
    const q = normName(query);
    return MMB.db.products.filter(function (p) {
      if (p.deleted) return false;
      if (!q) return true;
      if (normName(p.name).indexOf(q) !== -1) return true;
      return (p.aliases || []).some(function (a) { return normName(a).indexOf(q) !== -1; });
    });
  };

  MMB.addProduct = function (name, cartonKg) {
    const n = String(name || '').trim();
    if (!n) return { ok: false };
    const existing = MMB.findProduct(n);
    if (existing) return { ok: true, product: existing, existing: true };
    const p = {
      id: MMB.uid('prd'),
      name: n,
      aliases: [],
      cartonKg: Math.max(0.1, MMB.num(cartonKg) || MMB.db.settings.defaultCartonKg || 10),
      lowStockKg: null,
      createdAt: new Date().toISOString()
    };
    MMB.db.products.push(p);
    MMB.save();
    return { ok: true, product: p };
  };

  MMB.updateProduct = function (id, data) {
    const p = MMB.product(id);
    if (!p) return { ok: false };
    if (data.name != null) p.name = String(data.name).trim() || p.name;
    if (data.cartonKg != null) p.cartonKg = Math.max(0.1, MMB.num(data.cartonKg) || 10);
    if (data.lowStockKg != null) p.lowStockKg = data.lowStockKg === '' ? null : Math.max(0, MMB.num(data.lowStockKg));
    MMB.save();
    return { ok: true, product: p };
  };

  MMB.addAlias = function (id, text) {
    const p = MMB.product(id);
    const n = String(text || '').trim();
    if (!p || !n) return;
    if (normName(n) === normName(p.name)) return;
    p.aliases = p.aliases || [];
    if (!p.aliases.some(function (a) { return normName(a) === normName(n); })) {
      p.aliases.push(n);
      MMB.save();
    }
  };

  MMB.productIsUsed = function (id) {
    const d = MMB.db;
    return d.purchases.some(function (x) { return x.lines.some(function (l) { return l.productId === id; }); }) ||
      d.sales.some(function (x) { return x.lines.some(function (l) { return l.productId === id; }); }) ||
      d.returns.some(function (x) { return x.lines.some(function (l) { return l.productId === id; }); }) ||
      d.adjustments.some(function (x) { return x.productId === id; });
  };

  MMB.deleteProduct = function (id) {
    if (MMB.productIsUsed(id)) return { ok: false, error: 'used' };
    const p = MMB.product(id);
    if (!p) return { ok: false };
    // Soft delete: historical stock/bill lines keep resolving the product.
    p.deleted = true;
    p.deletedAt = new Date().toISOString();
    MMB.save();
    return { ok: true };
  };

  /* ── stock replay ─────────────────────────────────────────── */
  MMB.computeStock = function () {
    const d = MMB.db;
    const states = {};
    d.products.forEach(function (p) { states[p.id] = { qty: 0, value: 0, avg: 0 }; });
    const events = [];

    d.purchases.forEach(function (p) {
      (p.lines || []).forEach(function (l, i) {
        events.push({ at: (p.date || '') + ' ' + (p.time || '00:00'), createdAt: p.createdAt || '', kind: 'purchase', productId: l.productId, qty: MMB.num(l.qtyKg), rate: MMB.num(l.rate), refId: p.id, line: i });
      });
    });
    d.returns.filter(function (r) { return r.type === 'purchase'; }).forEach(function (r) {
      (r.lines || []).forEach(function (l, i) {
        events.push({ at: (r.date || '') + ' ' + (r.time || '00:00'), createdAt: r.createdAt || '', kind: 'purchaseReturn', productId: l.productId, qty: -Math.abs(MMB.num(l.qtyKg)), rate: MMB.num(l.rate), refId: r.id, line: i });
      });
    });
    d.sales.forEach(function (s) {
      (s.lines || []).forEach(function (l, i) {
        events.push({ at: (s.date || '') + ' ' + (s.time || '00:00'), createdAt: s.createdAt || '', kind: 'sale', productId: l.productId, qty: -Math.abs(MMB.num(l.qtyKg)), rate: MMB.num(l.rate), refId: s.id, line: i });
      });
    });
    d.returns.filter(function (r) { return r.type === 'sale'; }).forEach(function (r) {
      (r.lines || []).forEach(function (l, i) {
        events.push({ at: (r.date || '') + ' ' + (r.time || '00:00'), createdAt: r.createdAt || '', kind: 'saleReturn', productId: l.productId, qty: Math.abs(MMB.num(l.qtyKg)), saleId: r.saleId, lineIndex: l.lineIndex, refId: r.id, line: i });
      });
    });
    d.adjustments.forEach(function (a) {
      events.push({ at: (a.date || '') + ' ' + (a.time || '00:00'), createdAt: a.createdAt || '', kind: 'adjust', productId: a.productId, qty: MMB.num(a.qtyKg), refId: a.id });
    });

    events.sort(function (a, b) {
      if (a.at < b.at) return -1;
      if (a.at > b.at) return 1;
      return String(a.createdAt).localeCompare(String(b.createdAt));
    });

    const saleCogs = {};
    const returnCogs = {};
    const adjResult = [];
    events.forEach(function (ev) {
      const st = states[ev.productId];
      if (!st) return;
      if (ev.kind === 'purchase') {
        if (st.qty <= 0) {
          st.qty += ev.qty;
          st.value = Math.max(0, st.qty) * ev.rate;
          st.avg = ev.rate;
        } else {
          st.qty += ev.qty;
          st.value += ev.qty * ev.rate;
          st.avg = st.qty > 0 ? st.value / st.qty : ev.rate;
        }
      } else if (ev.kind === 'purchaseReturn') {
        const q = Math.abs(ev.qty);
        if (st.qty > 0) {
          st.value -= q * ev.rate;
          st.qty -= q;
          if (st.qty > 0) st.avg = st.value / st.qty;
          else { st.value = 0; st.avg = ev.rate; }
        } else {
          st.qty -= q;
        }
      } else if (ev.kind === 'sale') {
        const cogs = Math.abs(ev.qty) * (st.avg || 0);
        st.qty += ev.qty;
        st.value -= cogs;
        if (st.qty <= 0) st.value = 0;
        saleCogs[ev.refId] = saleCogs[ev.refId] || [];
        saleCogs[ev.refId][ev.line] = cogs;
      } else if (ev.kind === 'saleReturn') {
        const sale = d.sales.find(function (s) { return s.id === ev.saleId; });
        let perKg = st.avg || 0;
        if (sale && sale.lines[ev.lineIndex]) {
          const original = sale.lines[ev.lineIndex];
          const originalCogs = saleCogs[sale.id] && saleCogs[sale.id][ev.lineIndex];
          if (original.qtyKg > 0 && originalCogs != null) perKg = originalCogs / original.qtyKg;
        }
        const q = Math.abs(ev.qty);
        const cogs = q * perKg;
        st.qty += q;
        st.value += cogs;
        st.avg = st.qty > 0 ? st.value / st.qty : perKg;
        returnCogs[ev.refId] = (returnCogs[ev.refId] || 0) + cogs;
      } else if (ev.kind === 'adjust') {
        const val = ev.qty * (st.avg || 0);
        st.qty += ev.qty;
        st.value += val;
        if (st.qty <= 0) st.value = 0;
        else st.avg = st.value / st.qty;
        adjResult.push({ id: ev.refId, date: ev.at.slice(0, 10), amount: -val });
      }
    });

    Object.keys(states).forEach(function (id) {
      const st = states[id];
      if (st.qty <= 0) st.value = 0;
      st.qty = MMB.round(st.qty, 3);
      st.value = MMB.round(st.value, 2);
      st.avg = MMB.round(st.avg, 2);
    });

    return { states: states, saleCogs: saleCogs, returnCogs: returnCogs, adjustments: adjResult };
  };

  MMB.stockTotals = function (sd) {
    const d = sd || MMB.computeStock();
    let qty = 0, value = 0;
    Object.keys(d.states).forEach(function (id) {
      qty += Math.max(0, d.states[id].qty);
      value += d.states[id].value;
    });
    return { qty: MMB.round(qty, 2), value: MMB.round(value, 2) };
  };

  MMB.productQty = function (id, sd) {
    const d = sd || MMB.computeStock();
    return d.states[id] ? d.states[id].qty : 0;
  };

  /* ── bills ────────────────────────────────────────────────── */
  MMB.pad = function (n, len) { return String(n).padStart(len || 4, '0'); };
  MMB.nextBillNo = function () { return MMB.pad(MMB.db.settings.billCounter, 4); };
  MMB.nextPurchaseNo = function () { return 'P-' + MMB.pad(MMB.db.settings.purchaseCounter, 4); };

  function saleSummary(s, lang) {
    const count = s.lines.length;
    if (count === 1) {
      return s.lines[0].name + ' · ' + MMB.qty(s.lines[0].qtyKg, 'kg');
    }
    return count + ' ' + MMB.t('stock.items', { n: count }).replace(String(count) + ' ', '');
  }

  function addSaleLedger(s) {
    const d = MMB.db;
    d.ledger = d.ledger.filter(function (e) { return !(e.refType === 'sale' && e.refId === s.id); });
    d.ledger.push({
      id: ledgerIdFor({ refType: 'sale', refId: s.id, subtype: 'sale' }),
      accountId: s.customerId, type: 'debit', amount: s.total,
      details: 'Bill #' + s.billNo, date: s.date, time: s.time,
      refType: 'sale', refId: s.id, subtype: 'sale', meta: { no: s.billNo },
      createdAt: new Date().toISOString()
    });
    if (s.brokerId && s.commission > 0) {
      d.ledger.push({
        id: ledgerIdFor({ refType: 'sale', refId: s.id, subtype: 'commission' }),
        accountId: s.brokerId, type: 'credit', amount: s.commission,
        details: 'Brokerage · Bill #' + s.billNo, date: s.date, time: s.time,
        refType: 'sale', refId: s.id, subtype: 'commission', meta: { no: s.billNo },
        createdAt: new Date().toISOString()
      });
    }
  }

  MMB.saveSale = function (data, editId) {
    const d = MMB.db;
    if (editId && d.returns.some(function (r) { return r.type === 'sale' && r.saleId === editId; })) {
      return { ok: false, error: 'returns' };
    }
    const lines = (data.lines || []).map(function (l) {
      const qty = MMB.round(MMB.num(l.qtyKg), 3);
      const rate = MMB.round(Math.max(0, MMB.num(l.rate)), 2);
      return {
        productId: l.productId, name: l.name || (MMB.product(l.productId) || {}).name || '',
        qtyKg: qty, rate: rate, amount: MMB.round(qty * rate, 2),
        cartonQty: l.cartonQty || null, cartonKg: l.cartonKg || null, unit: l.unit || 'kg'
      };
    }).filter(function (l) { return l.qtyKg > 0 && l.productId; });
    if (!data.customerId || !MMB.account(data.customerId)) return { ok: false, error: 'customer' };
    if (!lines.length) return { ok: false, error: 'lines' };

    const goodsTotal = MMB.round(lines.reduce(function (s, l) { return s + l.amount; }, 0), 2);
    const charges = {};
    ['bardana', 'dalali', 'nikhara', 'chhappai', 'pehri', 'tulai', 'other'].forEach(function (k) {
      // Brokerage belongs to the broker, is paid by the shop, and is never
      // charged to the customer's bill.
      charges[k] = k === 'dalali' ? 0 : MMB.round(Math.max(0, MMB.num(data.charges && data.charges[k])), 2);
    });
    const chargesTotal = MMB.round(Object.keys(charges).reduce(function (s, k) { return s + charges[k]; }, 0), 2);
    const total = MMB.round(goodsTotal + chargesTotal, 2);
    const ratePct = MMB.db.settings.commissionRate;
    const commission = data.brokerId ? MMB.round(goodsTotal * ratePct / 100, 2) : 0;

    let sale;
    if (editId) {
      sale = d.sales.find(function (s) { return s.id === editId; });
      if (!sale) return { ok: false, error: 'missing' };
    } else {
      sale = { id: MMB.uid('sal'), billNo: MMB.nextBillNo(), createdAt: new Date().toISOString() };
      d.sales.push(sale);
      d.settings.billCounter = MMB.db.settings.billCounter + 1;
    }
    sale.customerId = data.customerId;
    sale.brokerId = data.brokerId || null;
    sale.date = data.date || MMB.todayISO();
    sale.time = data.time || MMB.nowHM();
    sale.lines = lines;
    sale.charges = charges;
    sale.goodsTotal = goodsTotal;
    sale.chargesTotal = chargesTotal;
    sale.total = total;
    sale.commissionRate = ratePct;
    sale.commission = commission;
    sale.vehicle = String(data.vehicle || '').trim();
    sale.destination = String(data.destination || '').trim();
    sale.note = String(data.note || '').trim();
    sale.updatedAt = new Date().toISOString();

    addSaleLedger(sale);
    MMB.save();
    return { ok: true, sale: sale };
  };

  MMB.deleteSale = function (id) {
    const d = MMB.db;
    const s = d.sales.find(function (x) { return x.id === id; });
    if (!s) return { ok: false };
    if (d.returns.some(function (r) { return r.type === 'sale' && r.saleId === id; })) return { ok: false, error: 'returns' };
    d.ledger = d.ledger.filter(function (e) { return !(e.refType === 'sale' && e.refId === id); });
    d.sales = d.sales.filter(function (x) { return x.id !== id; });
    MMB.save();
    return { ok: true };
  };

  MMB.savePurchase = function (data, editId) {
    const d = MMB.db;
    if (editId && d.returns.some(function (r) { return r.type === 'purchase' && r.purchaseId === editId; })) {
      return { ok: false, error: 'returns' };
    }
    const lines = (data.lines || []).map(function (l) {
      const qty = MMB.round(MMB.num(l.qtyKg), 3);
      const rate = MMB.round(Math.max(0, MMB.num(l.rate)), 2);
      return {
        productId: l.productId, name: l.name || (MMB.product(l.productId) || {}).name || '',
        qtyKg: qty, rate: rate, amount: MMB.round(qty * rate, 2),
        cartonQty: l.cartonQty || null, cartonKg: l.cartonKg || null, unit: l.unit || 'kg'
      };
    }).filter(function (l) { return l.qtyKg > 0 && l.productId; });
    if (!data.supplierId || !MMB.account(data.supplierId)) return { ok: false, error: 'supplier' };
    if (!lines.length) return { ok: false, error: 'lines' };

    const total = MMB.round(lines.reduce(function (s, l) { return s + l.amount; }, 0), 2);
    let purchase;
    if (editId) {
      purchase = d.purchases.find(function (p) { return p.id === editId; });
      if (!purchase) return { ok: false, error: 'missing' };
    } else {
      purchase = { id: MMB.uid('pur'), no: MMB.nextPurchaseNo(), createdAt: new Date().toISOString() };
      d.purchases.push(purchase);
      d.settings.purchaseCounter = MMB.db.settings.purchaseCounter + 1;
    }
    purchase.supplierId = data.supplierId;
    purchase.date = data.date || MMB.todayISO();
    purchase.time = data.time || MMB.nowHM();
    purchase.lines = lines;
    purchase.total = total;
    purchase.note = String(data.note || '').trim();
    purchase.updatedAt = new Date().toISOString();

    d.ledger = d.ledger.filter(function (e) { return !(e.refType === 'purchase' && e.refId === purchase.id); });
    d.ledger.push({
      id: ledgerIdFor({ refType: 'purchase', refId: purchase.id, subtype: 'purchase' }),
      accountId: purchase.supplierId, type: 'credit', amount: total,
      details: 'Purchase ' + purchase.no, date: purchase.date, time: purchase.time,
      refType: 'purchase', refId: purchase.id, subtype: 'purchase', meta: { no: purchase.no },
      createdAt: new Date().toISOString()
    });
    MMB.save();
    return { ok: true, purchase: purchase };
  };

  MMB.purchaseReturns = function (purchaseId) {
    return MMB.db.returns.filter(function (r) { return r.type === 'purchase' && r.purchaseId === purchaseId; });
  };

  MMB.deletePurchase = function (id) {
    const d = MMB.db;
    if (MMB.purchaseReturns(id).length) return { ok: false, error: 'returns' };
    d.ledger = d.ledger.filter(function (e) { return !(e.refType === 'purchase' && e.refId === id); });
    d.purchases = d.purchases.filter(function (p) { return p.id !== id; });
    MMB.save();
    return { ok: true };
  };

  MMB.returnedQty = function (purchaseId, lineIndex) {
    return MMB.purchaseReturns(purchaseId).reduce(function (sum, r) {
      return sum + (r.lines || []).reduce(function (s, l) {
        return s + (l.lineIndex === lineIndex ? Math.abs(MMB.num(l.qtyKg)) : 0);
      }, 0);
    }, 0);
  };

  MMB.savePurchaseReturn = function (data) {
    const d = MMB.db;
    const purchase = d.purchases.find(function (p) { return p.id === data.purchaseId; });
    if (!purchase) return { ok: false, error: 'purchase' };
    const lines = [];
    (data.lines || []).forEach(function (l, i) {
      const qty = MMB.round(MMB.num(l.qtyKg), 3);
      if (!(qty > 0)) return;
      const original = purchase.lines[l.lineIndex];
      if (!original) return;
      const max = Math.max(0, original.qtyKg - MMB.returnedQty(purchase.id, l.lineIndex));
      if (qty > max + 0.0001) return;
      lines.push({
        productId: original.productId, name: original.name, lineIndex: l.lineIndex,
        qtyKg: qty, rate: MMB.round(MMB.num(original.rate), 2),
        amount: MMB.round(qty * original.rate, 2)
      });
    });
    if (!lines.length) return { ok: false, error: 'lines' };
    const total = MMB.round(lines.reduce(function (s, l) { return s + l.amount; }, 0), 2);
    const ret = {
      id: MMB.uid('ret'), type: 'purchase', purchaseId: purchase.id, no: purchase.no,
      supplierId: purchase.supplierId, date: data.date || MMB.todayISO(), time: data.time || MMB.nowHM(),
      lines: lines, total: total, note: String(data.note || '').trim(), createdAt: new Date().toISOString()
    };
    d.returns.push(ret);
    d.ledger.push({
      id: ledgerIdFor({ refType: 'return', refId: ret.id, subtype: 'return' }),
      accountId: ret.supplierId, type: 'debit', amount: total,
      details: 'Return · Purchase ' + purchase.no, date: ret.date, time: ret.time,
      refType: 'return', refId: ret.id, subtype: 'return', meta: { no: purchase.no },
      createdAt: new Date().toISOString()
    });
    MMB.save();
    return { ok: true, ret: ret };
  };

  MMB.deleteReturn = function (id) {
    const d = MMB.db;
    const r = d.returns.find(function (x) { return x.id === id; });
    if (!r) return { ok: false };
    d.ledger = d.ledger.filter(function (e) { return !(e.refType === 'return' && e.refId === id); });
    d.returns = d.returns.filter(function (x) { return x.id !== id; });
    MMB.save();
    return { ok: true };
  };

  /* ── sale returns ─────────────────────────────────────────── */
  MMB.saleReturns = function (saleId) {
    return MMB.db.returns.filter(function (r) { return r.type === 'sale' && r.saleId === saleId; });
  };

  MMB.saleReturnedQty = function (saleId, lineIndex) {
    return MMB.saleReturns(saleId).reduce(function (sum, r) {
      return sum + (r.lines || []).reduce(function (s, l) {
        return s + (l.lineIndex === lineIndex ? Math.abs(MMB.num(l.qtyKg)) : 0);
      }, 0);
    }, 0);
  };

  MMB.saveSaleReturn = function (data) {
    const d = MMB.db;
    const sale = d.sales.find(function (s) { return s.id === data.saleId; });
    if (!sale) return { ok: false, error: 'sale' };
    const stock = MMB.computeStock();
    const lines = [];
    (data.lines || []).forEach(function (l) {
      const original = sale.lines[l.lineIndex];
      if (!original) return;
      const qty = MMB.round(MMB.num(l.qtyKg), 3);
      if (!(qty > 0)) return;
      const max = Math.max(0, original.qtyKg - MMB.saleReturnedQty(sale.id, l.lineIndex));
      if (qty > max + 0.0001) return;
      const rate = MMB.round(MMB.num(original.rate), 2);
      const originalCogs = stock.saleCogs[sale.id] && stock.saleCogs[sale.id][l.lineIndex];
      const perKg = original.qtyKg > 0 && originalCogs != null ? originalCogs / original.qtyKg : 0;
      lines.push({
        productId: original.productId, name: original.name, lineIndex: l.lineIndex,
        qtyKg: qty, rate: rate, amount: MMB.round(qty * rate, 2),
        cogs: MMB.round(qty * perKg, 2)
      });
    });
    if (!lines.length) return { ok: false, error: 'lines' };
    const total = MMB.round(lines.reduce(function (s, l) { return s + l.amount; }, 0), 2);
    const cogs = MMB.round(lines.reduce(function (s, l) { return s + (l.cogs || 0); }, 0), 2);
    const commissionRate = MMB.num(sale.commissionRate) || MMB.db.settings.commissionRate;
    const commissionReversal = sale.brokerId ? MMB.round(total * commissionRate / 100, 2) : 0;
    const ret = {
      id: MMB.uid('ret'), type: 'sale', saleId: sale.id, no: sale.billNo,
      customerId: sale.customerId, brokerId: sale.brokerId || null,
      date: data.date || MMB.todayISO(), time: data.time || MMB.nowHM(),
      lines: lines, total: total, cogs: cogs,
      commissionRate: commissionRate, commissionReversal: commissionReversal,
      note: String(data.note || '').trim(), createdAt: new Date().toISOString()
    };
    d.returns.push(ret);
    d.ledger.push({
      id: ledgerIdFor({ refType: 'saleReturn', refId: ret.id, subtype: 'saleReturn' }),
      accountId: ret.customerId, type: 'credit', amount: total,
      details: 'Return · Bill #' + sale.billNo, date: ret.date, time: ret.time,
      refType: 'saleReturn', refId: ret.id, subtype: 'saleReturn', meta: { no: sale.billNo },
      createdAt: new Date().toISOString()
    });
    if (ret.brokerId && commissionReversal > 0) {
      d.ledger.push({
        id: ledgerIdFor({ refType: 'saleReturn', refId: ret.id, subtype: 'commissionReversal' }),
        accountId: ret.brokerId, type: 'debit', amount: commissionReversal,
        details: 'Brokerage reversal · Bill #' + sale.billNo, date: ret.date, time: ret.time,
        refType: 'saleReturn', refId: ret.id, subtype: 'commissionReversal', meta: { no: sale.billNo },
        createdAt: new Date().toISOString()
      });
    }
    MMB.save();
    return { ok: true, ret: ret };
  };

  MMB.deleteSaleReturn = function (id) {
    const d = MMB.db;
    const r = d.returns.find(function (x) { return x.id === id && x.type === 'sale'; });
    if (!r) return { ok: false };
    d.ledger = d.ledger.filter(function (e) { return !(e.refType === 'saleReturn' && e.refId === id); });
    d.returns = d.returns.filter(function (x) { return x.id !== id; });
    MMB.save();
    return { ok: true };
  };

  MMB.saveAdjustment = function (data) {
    const d = MMB.db;
    if (!data.productId || !MMB.product(data.productId)) return { ok: false, error: 'product' };
    const qty = MMB.round(MMB.num(data.qtyKg), 3);
    if (!qty) return { ok: false, error: 'qty' };
    const a = {
      id: MMB.uid('adj'), productId: data.productId, qtyKg: qty,
      reason: data.reason || 'other', note: String(data.note || '').trim(),
      date: data.date || MMB.todayISO(), time: data.time || MMB.nowHM(),
      createdAt: new Date().toISOString()
    };
    d.adjustments.push(a);
    MMB.save();
    return { ok: true, adjustment: a };
  };

  MMB.deleteAdjustment = function (id) {
    MMB.db.adjustments = MMB.db.adjustments.filter(function (a) { return a.id !== id; });
    MMB.save();
    return { ok: true };
  };

  /* ── metrics ──────────────────────────────────────────────── */
  MMB.period = function (from, to, sd) {
    const d = MMB.db;
    const stock = sd || MMB.computeStock();
    const inRange = function (x) { return x.date >= from && x.date <= to; };
    const sales = d.sales.filter(inRange);
    const purchases = d.purchases.filter(inRange);
    const returns = d.returns.filter(function (r) { return r.type === 'purchase' && inRange(r); });
    const saleReturns = d.returns.filter(function (r) { return r.type === 'sale' && inRange(r); });
    const expenseAcc = {};
    d.accounts.forEach(function (a) { if (a.type === 'expense') expenseAcc[a.id] = true; });

    let salesTotal = 0, goodsTotal = 0, chargesTotal = 0, cogs = 0, commission = 0;
    sales.forEach(function (s) {
      salesTotal += s.total;
      goodsTotal += s.goodsTotal;
      chargesTotal += s.chargesTotal;
      commission += s.commission || 0;
      const arr = stock.saleCogs[s.id] || [];
      cogs += arr.reduce(function (a, b) { return a + (b || 0); }, 0);
    });
    saleReturns.forEach(function (r) {
      salesTotal -= r.total;
      goodsTotal -= r.total;
      cogs -= (stock.returnCogs && stock.returnCogs[r.id] != null) ? stock.returnCogs[r.id] : (r.cogs || 0);
      commission -= r.commissionReversal || 0;
    });
    let purchasesTotal = 0;
    purchases.forEach(function (p) { purchasesTotal += p.total; });
    returns.forEach(function (r) { purchasesTotal -= r.total; });

    let expenses = 0;
    d.ledger.forEach(function (e) {
      if (expenseAcc[e.accountId] && inRange(e)) {
        expenses += e.type === 'debit' ? e.amount : -e.amount;
      }
    });
    let stockLoss = 0;
    stock.adjustments.forEach(function (a) {
      if (a.date >= from && a.date <= to) stockLoss += a.amount;
    });

    salesTotal = MMB.round(salesTotal, 2);
    goodsTotal = MMB.round(goodsTotal, 2);
    chargesTotal = MMB.round(chargesTotal, 2);
    cogs = MMB.round(cogs, 2);
    commission = MMB.round(commission, 2);
    expenses = MMB.round(expenses, 2);
    stockLoss = MMB.round(stockLoss, 2);
    purchasesTotal = MMB.round(purchasesTotal, 2);
    const profit = MMB.round(salesTotal - cogs - commission - expenses - stockLoss, 2);

    return {
      from: from, to: to, salesCount: sales.length, saleReturnCount: saleReturns.length, purchaseCount: purchases.length,
      salesTotal: salesTotal, goodsTotal: goodsTotal, chargesTotal: chargesTotal,
      cogs: cogs, commission: commission, expenses: expenses, stockLoss: stockLoss,
      profit: profit, purchasesTotal: purchasesTotal
    };
  };

  MMB.todayStats = function (sd) {
    const t = MMB.todayISO();
    return MMB.period(t, t, sd);
  };
  MMB.monthStats = function (sd) {
    const t = MMB.todayISO();
    return MMB.period(t.slice(0, 8) + '01', t, sd);
  };

  MMB.summary = function () {
    let receivable = 0, payable = 0, cash = 0, expenses = 0, customerCount = 0, brokerCount = 0;
    MMB.db.accounts.forEach(function (a) {
      if (a.deleted) return;
      const b = MMB.accountBalance(a.id);
      if (a.type === 'customer') {
        customerCount++;
        if (b < 0) receivable += -b;
        if (b > 0) payable += b;
      } else if (a.type === 'broker') {
        brokerCount++;
        if (b > 0) payable += b;
      } else if (a.type === 'cash') {
        cash += b;
      } else if (a.type === 'expense') {
        expenses += b;
      }
    });
    return {
      receivable: MMB.round(receivable, 2), payable: MMB.round(payable, 2),
      cash: MMB.round(cash, 2), expenses: MMB.round(expenses, 2),
      customerCount: customerCount, brokerCount: brokerCount
    };
  };

  MMB.dailySeries = function (days) {
    const sd = MMB.computeStock();
    const out = [];
    for (let i = days - 1; i >= 0; i--) {
      const iso = MMB.daysAgoISO(i);
      const p = MMB.period(iso, iso, sd);
      out.push({ date: iso, sales: p.salesTotal, profit: p.profit });
    }
    return out;
  };

  MMB.recent = function (n) {
    const items = [];
    MMB.db.sales.forEach(function (s) {
      items.push({
        kind: 'sale', date: s.date, time: s.time, createdAt: s.createdAt,
        title: MMB.t('ledger.linkedBill', { no: s.billNo }) + ' · ' + s.lines.map(function (l) { return l.name; }).join(', '),
        sub: MMB.accountName(s.customerId), amount: s.total, accountId: s.customerId
      });
    });
    MMB.db.purchases.forEach(function (p) {
      items.push({
        kind: 'purchase', date: p.date, time: p.time, createdAt: p.createdAt,
        title: MMB.t('ledger.linkedPurchase', { no: p.no }) + ' · ' + p.lines.map(function (l) { return l.name; }).join(', '),
        sub: MMB.accountName(p.supplierId), amount: p.total, accountId: p.supplierId
      });
    });
    MMB.db.returns.filter(function (r) { return r.type === 'sale'; }).forEach(function (r) {
      items.push({
        kind: 'saleReturn', date: r.date, time: r.time, createdAt: r.createdAt,
        title: MMB.t('stock.saleReturn') + ' · ' + MMB.t('ledger.linkedBill', { no: r.no }) + ' · ' + r.lines.map(function (l) { return l.name; }).join(', '),
        sub: MMB.accountName(r.customerId), amount: r.total, accountId: r.customerId
      });
    });
    MMB.db.ledger.forEach(function (e) {
      if (e.pairId && e.isPairSide) return;
      if (e.refType && e.refType !== 'manual') return;
      const a = MMB.account(e.accountId);
      if (!a) return;
      items.push({
        kind: 'entry', date: e.date, time: e.time, createdAt: e.createdAt,
        title: e.details || MMB.t('ledger.manual'), sub: a.name,
        amount: e.amount, entryType: e.type, accountId: a.id,
        accountType: a.type, effect: MMB.entrySign(a, e.type) * MMB.num(e.amount)
      });
    });
    items.sort(function (a, b) {
      const ka = (a.date || '') + ' ' + (a.time || '') + ' ' + (a.createdAt || '');
      const kb = (b.date || '') + ' ' + (b.time || '') + ' ' + (b.createdAt || '');
      return ka > kb ? -1 : ka < kb ? 1 : 0;
    });
    return items.slice(0, n || 8);
  };

  MMB.lowStock = function (sd) {
    const stock = sd || MMB.computeStock();
    const limit = MMB.db.settings.lowStockKg;
    return MMB.db.products.filter(function (p) { return !p.deleted; }).map(function (p) {
      const st = stock.states[p.id] || { qty: 0 };
      const low = p.lowStockKg == null ? limit : p.lowStockKg;
      return { product: p, qty: st.qty, limit: low };
    }).filter(function (x) { return x.qty <= x.limit; }).sort(function (a, b) { return a.qty - b.qty; });
  };

  MMB.backupAgeDays = function () {
    const t = MMB.db.settings.backupLastAt;
    if (!t) return 999;
    const then = new Date(t).getTime();
    if (isNaN(then)) return 999;
    return Math.floor((Date.now() - then) / 86400000);
  };

  /* ── backup / restore / csv ───────────────────────────────── */
  MMB.exportJSON = function () {
    MMB.db.settings.backupLastAt = new Date().toISOString();
    MMB.save();
    const payload = JSON.parse(JSON.stringify(MMB.db));
    delete payload.sync;
    delete payload.rev;
    payload.exportedAt = new Date().toISOString();
    payload.app = 'mmb-dryfruits';
    return JSON.stringify(payload, null, 2);
  };

  MMB.importJSON = function (obj) {
    if (!obj || typeof obj !== 'object') return { ok: false };
    if (!Array.isArray(obj.accounts) || !Array.isArray(obj.ledger) || !Array.isArray(obj.sales)) return { ok: false };
    MMB.db = normalize(obj);
    // A restore is a fresh local baseline: never inherit sync bookkeeping from
    // a backup file, and queue every imported record for the next sync.
    MMB.db.sync = defaults().sync;
    MMB.db.updatedAt = new Date().toISOString();
    MMB.save();
    return { ok: true };
  };

  MMB.csvAccounts = function () {
    const rows = [['Name', 'Type', 'Phone', 'Balance']];
    MMB.db.accounts.forEach(function (a) {
      if (a.deleted) return;
      rows.push([a.name, MMB.typeLabel(a.type), a.phone, MMB.accountBalance(a.id)]);
    });
    return MMB.toCSV(rows);
  };
  MMB.csvLedger = function () {
    const rows = [['Date', 'Time', 'Account', 'Type', 'Amount', 'Details', 'Party']];
    MMB.db.ledger.forEach(function (e) {
      const a = MMB.account(e.accountId);
      const pair = MMB.entryPair(e);
      rows.push([e.date, e.time, a ? a.name : '', e.type, e.amount, e.details || MMB.entryTitle(e), pair ? MMB.accountName(pair.accountId) : '']);
    });
    return MMB.toCSV(rows);
  };
  MMB.csvSales = function () {
    const rows = [['Bill', 'Date', 'Customer', 'Broker', 'Goods', 'Charges', 'Total', 'Commission', 'Vehicle', 'Destination']];
    MMB.db.sales.forEach(function (s) {
      rows.push([s.billNo, s.date, MMB.accountName(s.customerId), s.brokerId ? MMB.accountName(s.brokerId) : '', s.goodsTotal, s.chargesTotal, s.total, s.commission, s.vehicle || '', s.destination || '']);
    });
    return MMB.toCSV(rows);
  };
  MMB.csvPurchases = function () {
    const rows = [['Purchase', 'Date', 'Supplier', 'Total', 'Note']];
    MMB.db.purchases.forEach(function (p) {
      rows.push([p.no, p.date, MMB.accountName(p.supplierId), p.total, p.note || '']);
    });
    return MMB.toCSV(rows);
  };
  MMB.csvReturns = function () {
    const rows = [['Type', 'Bill / Purchase', 'Date', 'Party', 'Goods', 'COGS', 'Brokerage reversal', 'Total', 'Note']];
    MMB.db.returns.forEach(function (r) {
      if (r.type === 'purchase') {
        rows.push(['Purchase return', r.no, r.date, MMB.accountName(r.supplierId), r.total, '', '', r.total, r.note || '']);
      } else {
        rows.push(['Sale return', r.no, r.date, MMB.accountName(r.customerId), r.total, r.cogs || 0, r.commissionReversal || 0, r.total, r.note || '']);
      }
    });
    return MMB.toCSV(rows);
  };
  MMB.csvStock = function () {
    const sd = MMB.computeStock();
    const rows = [['Product', 'Qty (kg)', 'Avg cost', 'Value', 'Low stock at']];
    MMB.db.products.forEach(function (p) {
      if (p.deleted) return;
      const st = sd.states[p.id] || { qty: 0, avg: 0, value: 0 };
      rows.push([p.name, st.qty, st.avg, st.value, p.lowStockKg == null ? MMB.db.settings.lowStockKg : p.lowStockKg]);
    });
    return MMB.toCSV(rows);
  };

  MMB.pinSet = function () { return !!(MMB.db.settings.pinHash && MMB.db.settings.pinSalt); };

  MMB.setPin = async function (pin) {
    const salt = MMB.salt();
    const hash = await MMB.asyncHash(salt + ':' + pin);
    MMB.db.settings.pinSalt = salt;
    MMB.db.settings.pinHash = hash;
    MMB.save();
  };

  MMB.verifyPin = async function (pin) {
    if (!MMB.pinSet()) return true;
    const hash = await MMB.asyncHash(MMB.db.settings.pinSalt + ':' + pin);
    return hash === MMB.db.settings.pinHash;
  };

  MMB.removePin = function () {
    MMB.db.settings.pinSalt = null;
    MMB.db.settings.pinHash = null;
    MMB.save();
  };

  MMB.saleText = function (s) {
    return s.lines.map(function (l) { return l.name + ' ' + MMB.qty(l.qtyKg, 'kg') + ' @ ' + MMB.money(l.rate); }).join(' · ');
  };
})();
