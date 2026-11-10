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
        try { fs.settings({ experimentalForceLongPolling: true }); }
        catch (e) { console.warn('Firestore long-polling setting failed', e); }
      }
    }
    return fs;
  }

  function serverStamp() {
    return firebase.firestore.FieldValue.serverTimestamp();
  }

  // Firestore rejects undefined field values; records are JSON-safe already.
  function clean(rec) {
    return JSON.parse(JSON.stringify(rec));
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

  /* ── push ───────────────────────────────────────────────────── */
  async function push() {
    if (busy) return { ok: false, error: 'busy' };
    setBusy('pushing');
    const startedAt = Date.now();
    let pushed = 0;
    try {
      requireReady();
      const transactions = MMB.pendingCount();
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

  async function fetchAll() {
    if (busy) return { ok: false, error: 'busy' };
    setBusy('fetching');
    const startedAt = Date.now();
    try {
      requireReady();
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

  MMB.sync = {
    push: push,
    fetch: fetchAll,
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
