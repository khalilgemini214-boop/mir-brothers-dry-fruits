/* ── Firestore sync: manual push (Sync) and read-only pull (Fetch) ─
   Ordering is always by Firestore server time. Local edits stay in the
   outbox until the user presses Sync; Fetch never writes to Firestore. */
(function () {
  const MMB = window.MMB;
  const COLLECTIONS = ['accounts', 'products', 'ledger', 'sales', 'purchases', 'returns', 'adjustments'];
  const SHARED_SETTINGS = ['shop', 'commissionRate', 'lowStockKg', 'defaultCartonKg'];
  const CHUNK = 400;

  let fs = null;
  let busy = null;
  let transport = 'streaming';
  let nudgeBound = false;

  function getDb() {
    if (!fs) {
      if (!window.firebase || !firebase.firestore) throw new Error('firebase-unavailable');
      fs = firebase.firestore();
      // Firestore's default streaming transport can fail inside an Android
      // WebView (especially behind some Wi-Fi networks). Long polling is the
      // supported fallback and works there.
      const native = (MMB.isNativeApp && MMB.isNativeApp()) ||
        !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
      if (native && fs.settings) {
        try {
          fs.settings({ experimentalForceLongPolling: true });
          transport = 'long-polling';
        } catch (e) {
          console.warn('Firestore long-polling setting failed', e);
        }
      }

      if (native) {
        // Firestore's connectivity monitor is event-driven. The WebView can
        // emit a false "offline" before the client exists, so tell it now and
        // again whenever a false offline event arrives.
        nudgeOnline();
        setTimeout(nudgeOnline, 0);
        if (!nudgeBound) {
          nudgeBound = true;
          window.addEventListener('offline', function () { setTimeout(nudgeOnline, 250); });
        }
      }
    }
    return fs;
  }

  function nudgeOnline() {
    try {
      if (fs && fs.enableNetwork) {
        const p = fs.enableNetwork();
        if (p && p.catch) p.catch(function () { });
      }
      window.dispatchEvent(new Event('online'));
    } catch (e) { /* ignore */ }
  }

  function serverStamp() {
    return firebase.firestore.FieldValue.serverTimestamp();
  }

  // Firestore rejects undefined field values; records are JSON-safe already.
  function clean(rec) {
    return JSON.parse(JSON.stringify(rec));
  }

  function isNativePlatform() {
    return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  }

  function restBase() {
    const project = (window.MMB_FIREBASE && window.MMB_FIREBASE.projectId) || '';
    return 'https://firestore.googleapis.com/v1/projects/' +
      encodeURIComponent(project) + '/databases/(default)/documents';
  }

  function restDocName(path) {
    const project = (window.MMB_FIREBASE && window.MMB_FIREBASE.projectId) || '';
    return 'projects/' + project + '/databases/(default)/documents/' + path;
  }

  function timestampMs(value) {
    if (!value) return 0;
    const ms = Date.parse(value);
    return isFinite(ms) ? ms : 0;
  }

  function msStamp(ms) {
    return { seconds: Math.floor(ms / 1000), nanoseconds: Math.round((ms % 1000) * 1e6) };
  }

  function toRestValue(v) {
    if (v === null || v === undefined) return { nullValue: null };
    if (typeof v === 'string') return { stringValue: v };
    if (typeof v === 'boolean') return { booleanValue: v };
    if (typeof v === 'number') {
      if (!isFinite(v)) return { nullValue: null };
      return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
    }
    if (v instanceof Date) return { timestampValue: v.toISOString() };
    if (Array.isArray(v)) return { arrayValue: { values: v.map(toRestValue) } };
    if (typeof v === 'object') {
      const fields = {};
      Object.keys(v).forEach(function (k) {
        if (v[k] !== undefined) fields[k] = toRestValue(v[k]);
      });
      return { mapValue: { fields: fields } };
    }
    return { nullValue: null };
  }

  function fromRestValue(v) {
    if (!v) return null;
    if (v.nullValue !== undefined) return null;
    if (v.stringValue !== undefined) return v.stringValue;
    if (v.booleanValue !== undefined) return v.booleanValue;
    if (v.integerValue !== undefined) return Number(v.integerValue);
    if (v.doubleValue !== undefined) return Number(v.doubleValue);
    if (v.timestampValue !== undefined) return v.timestampValue;
    if (v.arrayValue !== undefined) {
      return ((v.arrayValue && v.arrayValue.values) || []).map(fromRestValue);
    }
    if (v.mapValue !== undefined) {
      const fields = (v.mapValue && v.mapValue.fields) || {};
      const out = {};
      Object.keys(fields).forEach(function (k) { out[k] = fromRestValue(fields[k]); });
      return out;
    }
    if (v.referenceValue !== undefined) return v.referenceValue;
    if (v.geoPointValue !== undefined) return v.geoPointValue;
    if (v.bytesValue !== undefined) return v.bytesValue;
    return null;
  }

  function fromRestFields(fields) {
    const out = {};
    Object.keys(fields || {}).forEach(function (k) { out[k] = fromRestValue(fields[k]); });
    return out;
  }

  function toRestFields(obj) {
    const fields = {};
    Object.keys(obj || {}).forEach(function (k) {
      if (obj[k] !== undefined) fields[k] = toRestValue(obj[k]);
    });
    return fields;
  }

  async function authToken(force) {
    if (!MMB.cloud.signedIn()) {
      const e = new Error('not-signed-in');
      e.code = 'not-signed-in';
      throw e;
    }
    const user = window.firebase && firebase.auth ? firebase.auth().currentUser : null;
    if (!user) {
      const e = new Error('not-signed-in');
      e.code = 'not-signed-in';
      throw e;
    }
    return user.getIdToken(!!force);
  }

  function restErrorCode(status, json) {
    const reason = json && json.error && json.error.status;
    if (status === 401) return 'unauthenticated';
    if (status === 403) return 'permission-denied';
    if (status === 404) return 'not-found';
    if (status === 400 && reason === 'FAILED_PRECONDITION') return 'failed-precondition';
    if (status === 409) return 'aborted';
    if (status === 429) return 'resource-exhausted';
    if (status >= 500) return 'unavailable';
    return 'unknown';
  }

  async function restFetch(url, token, opts) {
    let res = null;
    let text = '';
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(function () { controller.abort(); }, 30000) : null;
    const method = (opts && opts.method) || 'GET';
    const headers = { Authorization: 'Bearer ' + token };
    // Match the GET that the connection test proved works: no extra headers
    // on reads, JSON content type only when a body is sent.
    if (method !== 'GET') headers['Content-Type'] = 'application/json';
    try {
      res = await fetch(url, Object.assign({
        headers: headers,
        signal: controller ? controller.signal : undefined
      }, opts || {}));
      text = await res.text();
    } catch (e) {
      const err = new Error('Network request failed: ' + ((e && e.message) || e));
      err.code = 'unavailable';
      throw err;
    } finally {
      if (timer) clearTimeout(timer);
    }
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch (e) { /* ignore */ }
    if (!res.ok) {
      const err = new Error((json && json.error && json.error.message) || text || ('HTTP ' + res.status));
      err.code = restErrorCode(res.status, json);
      err.status = res.status;
      throw err;
    }
    return json || {};
  }

  async function restGetUrl(url, token) {
    try {
      return await restFetch(url, token, { method: 'GET' });
    } catch (e) {
      if (e.status === 401) {
        const fresh = await authToken(true);
        return restFetch(url, fresh, { method: 'GET' });
      }
      throw e;
    }
  }

  async function restGet(path, token) {
    try {
      return await restGetUrl(restBase() + '/' + path, token);
    } catch (e) {
      if (e.status === 404) return null;
      throw e;
    }
  }

  async function restCommit(writes, token) {
    if (!writes.length) return null;
    const body = JSON.stringify({ writes: writes });
    try {
      return await restFetch(restBase() + ':commit', token, { method: 'POST', body: body });
    } catch (e) {
      if (e.status === 401) {
        const fresh = await authToken(true);
        return restFetch(restBase() + ':commit', fresh, { method: 'POST', body: body });
      }
      throw e;
    }
  }

  function restWrite(path, fields) {
    return {
      update: { name: restDocName(path), fields: toRestFields(fields) },
      updateTransforms: [
        { fieldPath: '_serverUpdatedAt', setToServerValue: 'REQUEST_TIME' }
      ]
    };
  }

  function toStore(ts) {
    return ts ? { seconds: ts.seconds, nanoseconds: ts.nanoseconds } : null;
  }

  function fromStore(o) {
    if (!o || typeof o.seconds !== 'number') return null;
    return new firebase.firestore.Timestamp(o.seconds, o.nanoseconds || 0);
  }

  function setBusy(kind) {
    busy = kind;
    if (MMB.onSyncState) MMB.onSyncState(kind);
  }

  function fail(msg) {
    if (MMB.onSyncState) MMB.onSyncState(null, msg);
  }

  function requireReady() {
    if (!MMB.cloud.signedIn()) {
      const e = new Error('not-signed-in');
      e.code = 'not-signed-in';
      throw e;
    }
    const s = MMB.db.sync;
    s.uid = MMB.cloud.uid() || null;
    if (!s.deviceId) s.deviceId = MMB.uid('dev');
  }

  function finish() {
    const s = MMB.db.sync;
    s.lastError = null;
    MMB.save({ origin: 'remote' });
    setBusy(null);
    if (MMB.onSyncState) MMB.onSyncState(null);
  }

  /* ── push over REST (Android) ───────────────────────────────── */
  async function pushViaRest(transactions, startedAt) {
    const token = await authToken();
    const deviceId = MMB.db.sync.deviceId;
    let pushed = 0;
    const keys = Object.keys(MMB.db.sync.dirty);
    const settingsDirty = !!MMB.db.sync.dirtySettings;
    const logoDirty = !!MMB.db.sync.dirtyLogo;
    if (!keys.length && !settingsDirty && !logoDirty) {
      finish();
      return { ok: true, pushed: 0, empty: true };
    }

    if (logoDirty) {
      await restCommit([restWrite('meta/branding', {
        logo: MMB.db.settings.shop.logo || '',
        _deviceId: deviceId
      })], token);
      MMB.db.sync.dirtyLogo = false;
      MMB.db.sync.logoBase = MMB.recordHash({ logo: MMB.db.settings.shop.logo || '' });
      pushed++;
    }

    if (settingsDirty) {
      await restCommit([restWrite('meta/settings', Object.assign({}, MMB.sharedSettings(), {
        _deviceId: deviceId
      }))], token);
      MMB.db.sync.dirtySettings = false;
      pushed++;
    }

    const chunks = [];
    for (let i = 0; i < keys.length; i += CHUNK) chunks.push(keys.slice(i, i + CHUNK));

    let firstError = null;
    async function commitChunk(chunk) {
      if (firstError) return;
      const writes = [];
      const applied = [];
      chunk.forEach(function (key) {
        const idx = key.indexOf(':');
        const name = key.slice(0, idx);
        const id = key.slice(idx + 1);
        const entry = MMB.db.sync.dirty[key];
        if (!entry) return;
        if (entry.op === 'del') {
          writes.push(restWrite('records/' + id, {
            _kind: name,
            _tombstone: true,
            _deletedAt: entry.at,
            _deviceId: deviceId
          }));
        } else {
          const rec = (MMB.db[name] || []).find(function (r) { return r.id === id; });
          if (!rec) { applied.push({ key: key, at: entry.at }); return; }
          writes.push(restWrite('records/' + id, Object.assign({}, clean(rec), {
            _kind: name,
            _deviceId: deviceId
          })));
        }
        applied.push({ key: key, at: entry.at });
      });
      if (!writes.length && !applied.length) return;
      try {
        if (writes.length) await restCommit(writes, token);
      } catch (e) {
        firstError = e;
        throw e;
      }
      applied.forEach(function (a) {
        const cur = MMB.db.sync.dirty[a.key];
        if (cur && cur.at === a.at) delete MMB.db.sync.dirty[a.key];
      });
      pushed += applied.length;
      if (MMB.onSyncChange) MMB.onSyncChange();
    }

    const queue = chunks.slice();
    const workers = [];
    const parallel = Math.min(3, queue.length);
    for (let w = 0; w < parallel; w++) {
      workers.push((async function () {
        while (queue.length && !firstError) await commitChunk(queue.shift());
      })());
    }
    const settled = await Promise.allSettled(workers);
    const rejected = settled.find(function (r) { return r.status === 'rejected'; });
    if (rejected) throw rejected.reason;

    MMB.db.sync.lastSyncedAt = new Date().toISOString();
    MMB.db.sync.lastSyncMs = Date.now() - startedAt;
    MMB.db.sync.lastSyncRecords = pushed;
    MMB.db.sync.lastError = null;
    finish();
    return { ok: true, pushed: pushed, transactions: transactions };
  }

  /* ── push ───────────────────────────────────────────────────── */
  async function push() {
    if (busy) return { ok: false, error: 'busy' };
    setBusy('pushing');
    const startedAt = Date.now();
    let pushed = 0;
    try {
      requireReady();
      const transactions = MMB.pendingCount();
      if (isNativePlatform()) return await pushViaRest(transactions, startedAt);
      const db = getDb();
      const keys = Object.keys(MMB.db.sync.dirty);
      const settingsDirty = !!MMB.db.sync.dirtySettings;
      const logoDirty = !!MMB.db.sync.dirtyLogo;
      if (!keys.length && !settingsDirty && !logoDirty) {
        finish();
        return { ok: true, pushed: 0, empty: true };
      }

      if (logoDirty) {
        await db.collection('meta').doc('branding').set({
          logo: MMB.db.settings.shop.logo || '',
          _deviceId: MMB.db.sync.deviceId,
          _serverUpdatedAt: serverStamp()
        });
        MMB.db.sync.dirtyLogo = false;
        MMB.db.sync.logoBase = MMB.recordHash({ logo: MMB.db.settings.shop.logo || '' });
        pushed++;
      }

      if (settingsDirty) {
        await db.collection('meta').doc('settings').set(Object.assign({}, MMB.sharedSettings(), {
          _deviceId: MMB.db.sync.deviceId,
          _serverUpdatedAt: serverStamp()
        }));
        MMB.db.sync.dirtySettings = false;
        pushed++;
      }

      const chunks = [];
      for (let i = 0; i < keys.length; i += CHUNK) chunks.push(keys.slice(i, i + CHUNK));

      let firstError = null;
      async function commitChunk(chunk) {
        if (firstError) return;
        const batch = db.batch();
        const applied = [];
        let wrote = false;
        chunk.forEach(function (key) {
          const idx = key.indexOf(':');
          const name = key.slice(0, idx);
          const id = key.slice(idx + 1);
          const entry = MMB.db.sync.dirty[key];
          if (!entry) return;
          // One collection keeps the whole fetch in a single consistent
          // snapshot, which is what makes the cursor gap-free.
          const ref = db.collection('records').doc(id);
          if (entry.op === 'del') {
            batch.set(ref, {
              _kind: name,
              _tombstone: true,
              _deletedAt: entry.at,
              _deviceId: MMB.db.sync.deviceId,
              _serverUpdatedAt: serverStamp()
            });
            wrote = true;
          } else {
            const rec = (MMB.db[name] || []).find(function (r) { return r.id === id; });
            if (!rec) { applied.push({ key: key, at: entry.at }); return; }
            batch.set(ref, Object.assign({}, clean(rec), {
              _kind: name,
              _deviceId: MMB.db.sync.deviceId,
              _serverUpdatedAt: serverStamp()
            }));
            wrote = true;
          }
          applied.push({ key: key, at: entry.at });
        });
        if (!applied.length) return;
        try {
          if (wrote) await batch.commit();
        } catch (e) {
          firstError = e;
          throw e;
        }
        applied.forEach(function (a) {
          const cur = MMB.db.sync.dirty[a.key];
          if (cur && cur.at === a.at) delete MMB.db.sync.dirty[a.key];
        });
        pushed += applied.length;
        // Keep the cleared entries in memory only. One localStorage write at
        // the end is enough; a crash re-sends the remaining entries, which is
        // idempotent.
        if (MMB.onSyncChange) MMB.onSyncChange();
        if (MMB.onSyncState) MMB.onSyncState('pushing');
      }

      // Three batches in flight hides mobile round-trip latency. Batches never
      // overlap on a record, so ordering between them does not matter.
      const queue = chunks.slice();
      const workers = [];
      const parallel = Math.min(3, queue.length);
      for (let w = 0; w < parallel; w++) {
        workers.push((async function () {
          while (queue.length && !firstError) {
            await commitChunk(queue.shift());
          }
        })());
      }
      const settled = await Promise.allSettled(workers);
      const rejected = settled.find(function (r) { return r.status === 'rejected'; });
      if (rejected) throw rejected.reason;

      MMB.db.sync.lastSyncedAt = new Date().toISOString();
      MMB.db.sync.lastSyncMs = Date.now() - startedAt;
      MMB.db.sync.lastSyncRecords = pushed;
      finish();
      return { ok: true, pushed: pushed, transactions: transactions };
    } catch (e) {
      console.error('Push failed', e);
      MMB.db.sync.lastSyncMs = Date.now() - startedAt;
      MMB.db.sync.lastError = {
        code: (e && e.code) || 'failed',
        message: String((e && e.message) || e || '').slice(0, 400),
        at: new Date().toISOString(),
        op: 'push'
      };
      MMB.save({ origin: 'remote' });
      setBusy(null);
      fail(e);
      return { ok: false, error: e && e.code || 'failed', message: e && e.message, pending: MMB.pendingCount() };
    }
  }

  /* ── fetch ──────────────────────────────────────────────────── */
  function mergeRecord(next, name, id, data, ms) {
    const key = name + ':' + id;
    const list = next[name];
    const idx = list.findIndex(function (r) { return r.id === id; });
    const seen = next.sync.seen[key] || 0;

    if (data._tombstone === true) {
      let changed = false;
      if (idx >= 0) {
        if (next.sync.dirty[key]) next.sync.discarded = (next.sync.discarded || 0) + 1;
        list.splice(idx, 1);
        changed = true;
      }
      if (ms > seen || !next.sync.tombstones[key]) changed = true;
      next.sync.seen[key] = Math.max(seen, ms);
      next.sync.tombstones[key] = { at: data._deletedAt || new Date(ms || Date.now()).toISOString(), pushed: true };
      delete next.sync.dirty[key];
      delete next.sync.base[key];
      return changed;
    }

    // Pending local work is never overwritten by a fetch.
    if (next.sync.dirty[key]) return false;

    const rec = Object.assign({}, data);
    delete rec._serverUpdatedAt;
    delete rec._deviceId;
    delete rec._kind;
    delete rec._tombstone;
    delete rec._deletedAt;

    if (idx < 0) {
      list.push(rec);
      next.sync.seen[key] = ms;
      next.sync.base[key] = MMB.recordHash(rec);
      delete next.sync.tombstones[key];
      return true;
    }
    if (ms > seen) {
      const h = MMB.recordHash(rec);
      next.sync.seen[key] = ms;
      if (next.sync.base[key] === h) return false; // our own push coming back
      list[idx] = rec;
      next.sync.base[key] = h;
      delete next.sync.tombstones[key];
      return true;
    }
    return false;
  }

  /* ── fetch over REST (Android) ──────────────────────────────── */
  async function fetchViaRest(startedAt) {
    const token = await authToken();
    const cursor = MMB.db.sync.cursor;
    const cursorMs = cursor && typeof cursor.seconds === 'number'
      ? cursor.seconds * 1000 + Math.floor((cursor.nanoseconds || 0) / 1e6)
      : 0;
    const next = JSON.parse(JSON.stringify(MMB.db));
    let changes = 0;
    const changedKeys = [];
    let maxMs = cursorMs;

    let pageToken = '';
    do {
      let url = restBase() + '/records?pageSize=500';
      if (pageToken) url += '&pageToken=' + encodeURIComponent(pageToken);
      const page = await restGetUrl(url, token);
      (page.documents || []).forEach(function (doc) {
        const id = decodeURIComponent(String(doc.name || '').split('/').pop() || '');
        if (!id) return;
        const data = fromRestFields(doc.fields || {});
        const ms = timestampMs(data._serverUpdatedAt || doc.updateTime || '');
        if (ms > maxMs) maxMs = ms;
        const kind = data._kind;
        if (COLLECTIONS.indexOf(kind) === -1) return;
        if (ms < cursorMs) return;
        if (mergeRecord(next, kind, id, data, ms)) {
          changes++;
          changedKeys.push(kind + ':' + id);
        }
      });
      pageToken = page.nextPageToken || '';
    } while (pageToken);

    const settingsDoc = await restGet('meta/settings', token);
    if (settingsDoc) {
      const data = fromRestFields(settingsDoc.fields || {});
      const ms = timestampMs(data._serverUpdatedAt || settingsDoc.updateTime || '');
      if (!next.sync.dirtySettings && ms > (next.sync.settingsSeen || 0)) {
        const before = MMB.sharedSettingsHash(next);
        SHARED_SETTINGS.forEach(function (k) {
          if (k === 'shop' && data[k]) {
            next.settings.shop = Object.assign({}, data[k], { logo: next.settings.shop.logo || '' });
          } else if (data[k] !== undefined) {
            next.settings[k] = data[k];
          }
        });
        next.sync.settingsSeen = ms;
        if (MMB.sharedSettingsHash(next) !== before) {
          changes++;
          changedKeys.push('meta:settings');
        }
      }
    }

    const brandingDoc = await restGet('meta/branding', token);
    if (brandingDoc) {
      const data = fromRestFields(brandingDoc.fields || {});
      const ms = timestampMs(data._serverUpdatedAt || brandingDoc.updateTime || '');
      if (!next.sync.dirtyLogo && ms > (next.sync.logoSeen || 0)) {
        if (typeof data.logo === 'string' && data.logo !== next.settings.shop.logo) {
          next.settings.shop.logo = data.logo;
          changes++;
          changedKeys.push('meta:branding');
        }
        next.sync.logoSeen = ms;
        next.sync.logoBase = MMB.recordHash({ logo: next.settings.shop.logo || '' });
      }
    }

    if (maxMs > 0) {
      next.sync.cursor = msStamp(maxMs);
      next.sync.lastFetchedServerAt = msStamp(maxMs);
    }
    next.sync.lastFetchedAt = new Date().toISOString();
    next.sync.lastFetchMs = Date.now() - startedAt;
    next.sync.lastFetchChanges = changes;
    next.sync.lastError = null;
    const discarded = next.sync.discarded || 0;
    delete next.sync.discarded;

    MMB.db = next;
    if (!next.sync.dirtySettings) {
      MMB.db.sync.settingsBase = MMB.recordHash(MMB.sharedSettings());
    }
    if (!next.sync.dirtyLogo) {
      MMB.db.sync.logoBase = MMB.recordHash({ logo: MMB.db.settings.shop.logo || '' });
    }
    MMB.save({ origin: 'remote' });
    return { ok: true, fetched: changes, discarded: discarded, keys: changedKeys };
  }

  async function fetchAll() {
    if (busy) return { ok: false, error: 'busy' };
    setBusy('fetching');
    const startedAt = Date.now();
    try {
      requireReady();
      if (isNativePlatform()) return await fetchViaRest(startedAt);
      const db = getDb();
      const cursor = fromStore(MMB.db.sync.cursor);
      const next = JSON.parse(JSON.stringify(MMB.db));
      let changes = 0;
      const changedKeys = [];
      let maxTs = cursor;

      let recordsQuery = db.collection('records');
      if (cursor) recordsQuery = recordsQuery.where('_serverUpdatedAt', '>=', cursor);
      const reads = [
        recordsQuery.get().then(function (snap) { return { name: 'records', snap: snap }; }),
        db.collection('meta').doc('settings').get().then(function (snap) {
          return { name: 'meta', snap: snap };
        }),
        db.collection('meta').doc('branding').get().then(function (snap) {
          return { name: 'branding', snap: snap };
        })
      ];
      const results = await Promise.all(reads);

      results.forEach(function (r) {
        // Settings and branding keep their own cursors. Letting them move the
        // records cursor could step over a record written between the reads.
        if (r.name === 'branding') {
          if (!r.snap.exists) return;
          const data = r.snap.data() || {};
          const ms = data._serverUpdatedAt && data._serverUpdatedAt.toMillis ? data._serverUpdatedAt.toMillis() : 0;
          if (next.sync.dirtyLogo) return;
          if (ms <= (next.sync.logoSeen || 0)) return;
          if (typeof data.logo === 'string' && data.logo !== next.settings.shop.logo) {
            next.settings.shop.logo = data.logo;
            changes++;
            changedKeys.push('meta:branding');
          }
          next.sync.logoSeen = ms;
          next.sync.logoBase = MMB.recordHash({ logo: next.settings.shop.logo || '' });
          return;
        }
        if (r.name === 'meta') {
          if (!r.snap.exists) return;
          const data = r.snap.data() || {};
          const ms = data._serverUpdatedAt && data._serverUpdatedAt.toMillis ? data._serverUpdatedAt.toMillis() : 0;
          if (next.sync.dirtySettings) return;
          if (ms <= (next.sync.settingsSeen || 0)) return;
          const before = MMB.sharedSettingsHash(next);
          SHARED_SETTINGS.forEach(function (k) {
            if (k === 'shop' && data[k]) {
              // The logo is deliberately absent from this document.
              next.settings.shop = Object.assign({}, data[k], {
                logo: next.settings.shop.logo || ''
              });
            } else if (data[k] !== undefined) {
              next.settings[k] = data[k];
            }
          });
          next.sync.settingsSeen = ms;
          if (MMB.sharedSettingsHash(next) !== before) {
            changes++;
            changedKeys.push('meta:settings');
          }
          return;
        }
        r.snap.forEach(function (doc) {
          const data = doc.data() || {};
          const name = data._kind;
          if (COLLECTIONS.indexOf(name) === -1) return;
          const ts = data._serverUpdatedAt;
          const ms = ts && ts.toMillis ? ts.toMillis() : 0;
          if (ts && (!maxTs || ts.toMillis() > maxTs.toMillis() ||
            (ts.toMillis() === maxTs.toMillis() && ts.nanoseconds > maxTs.nanoseconds))) maxTs = ts;
          if (mergeRecord(next, name, doc.id, data, ms)) { changes++; changedKeys.push(name + ':' + doc.id); }
        });
      });

      if (maxTs) {
        next.sync.cursor = toStore(maxTs);
        next.sync.lastFetchedServerAt = toStore(maxTs);
      }
      next.sync.lastFetchedAt = new Date().toISOString();
      next.sync.lastFetchMs = Date.now() - startedAt;
      next.sync.lastFetchChanges = changes;
      next.sync.lastError = null;
      const discarded = next.sync.discarded || 0;
      delete next.sync.discarded;

      MMB.db = next;
      if (next.sync.dirtySettings) {
        // Local settings are still pending; keep the local baseline.
      } else {
        MMB.db.sync.settingsBase = MMB.recordHash(MMB.sharedSettings());
      }
      if (!next.sync.dirtyLogo) {
        MMB.db.sync.logoBase = MMB.recordHash({ logo: MMB.db.settings.shop.logo || '' });
      }
      MMB.save({ origin: 'remote' });
      // The caller keeps the spinner on while it repaints, then calls
      // MMB.sync.finish(). Errors clear the busy state above.
      return { ok: true, fetched: changes, discarded: discarded, keys: changedKeys };
    } catch (e) {
      console.error('Fetch failed', e);
      MMB.db.sync.lastError = {
        code: (e && e.code) || 'failed',
        message: String((e && e.message) || e || '').slice(0, 400),
        at: new Date().toISOString(),
        op: 'fetch'
      };
      MMB.save({ origin: 'remote' });
      setBusy(null);
      fail(e);
      return { ok: false, error: e && e.code || 'failed', message: e && e.message };
    }
  }

  // Tests both paths: a plain HTTPS request to the Firestore REST API and the
  // real SDK read. Together they separate "database/project/network" problems
  // from "WebChannel transport" problems.
  async function testConnection() {
    const cfg = window.MMB_FIREBASE || {};
    const out = {
      project: cfg.projectId || '',
      startedAt: new Date().toISOString(),
      online: (function () { try { return navigator.onLine; } catch (e) { return null; } })(),
      native: !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()),
      rest: null,
      sdk: null
    };
    let token = null;
    try {
      const user = window.firebase && firebase.auth ? firebase.auth().currentUser : null;
      if (!user) {
        out.stage = 'auth';
        out.error = 'not-signed-in';
        return out;
      }
      out.uid = user.uid;
      token = await user.getIdToken();
    } catch (e) {
      out.stage = 'auth';
      out.error = String((e && e.message) || e).slice(0, 300);
      return out;
    }

    try {
      const url = 'https://firestore.googleapis.com/v1/projects/' +
        encodeURIComponent(cfg.projectId || '') +
        '/databases/(default)/documents/records?pageSize=1';
      const started = Date.now();
      const res = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
      const body = await res.text();
      out.rest = { ok: res.ok, status: res.status, ms: Date.now() - started, body: body.slice(0, 700) };
    } catch (e) {
      out.rest = { ok: false, status: 0, error: String((e && e.message) || e).slice(0, 300) };
    }

    // If HTTPS itself cannot read the database, the SDK will fail for the same
    // reason; the REST result is the diagnosis and avoids a long SDK retry.
    if (!out.rest || !out.rest.ok) {
      out.lastError = MMB.db.sync.lastError || null;
      return out;
    }

    if (isNativePlatform()) {
      // Sync/Fetch no longer use the SDK on Android; its offline state is
      // irrelevant. The REST result above is the real answer.
      out.transport = 'rest';
      out.sdkSkipped = 'Android uses the REST transport';
      out.lastError = MMB.db.sync.lastError || null;
      return out;
    }

    try {
      const db = getDb();
      out.transport = transport;
      // Give the online nudge a moment to start the stream.
      await new Promise(function (resolve) { setTimeout(resolve, 800); });
      const started = Date.now();
      const read = db.collection('records').limit(1).get();
      const timeout = new Promise(function (_, reject) {
        setTimeout(function () {
          const err = new Error('SDK read timed out after 15s');
          err.code = 'timeout';
          reject(err);
        }, 15000);
      });
      const snap = await Promise.race([read, timeout]);
      out.sdk = {
        ok: true,
        docs: snap.size,
        fromCache: snap.metadata ? snap.metadata.fromCache : null,
        ms: Date.now() - started
      };
    } catch (e) {
      out.transport = transport;
      out.sdk = {
        ok: false,
        code: (e && e.code) || 'failed',
        message: String((e && e.message) || e).slice(0, 400)
      };
    }
    out.lastError = MMB.db.sync.lastError || null;
    return out;
  }

  MMB.sync = {
    push: push,
    fetch: fetchAll,
    test: testConnection,
    busy: function () { return busy; },
    // fetch() keeps the busy flag on success so the header button can spin
    // until the caller has repainted. Call this after the repaint.
    finish: function () { setBusy(null); },
    cursorDate: function () {
      const o = MMB.db.sync.lastFetchedServerAt;
      if (!o || typeof o.seconds !== 'number') return null;
      return new Date(o.seconds * 1000 + Math.floor((o.nanoseconds || 0) / 1e6));
    },
    lastFetchedISO: function () {
      const d = MMB.sync.cursorDate();
      return d && !isNaN(d.getTime()) ? d.toISOString() : null;
    },
    resetCursor: function () {
      MMB.db.sync.cursor = null;
    }
  };
})();
