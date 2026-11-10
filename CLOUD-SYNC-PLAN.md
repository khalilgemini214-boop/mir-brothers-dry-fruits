# Cloud Sync Plan — Firebase Auth + Firestore

Status: **decisions locked** (10 Nov 2026) — implemented through Phase 5.

> **Implementation notes (these override the proposal below where they differ):**
> - Counters stay local; no block reservation. Duplicate bill numbers are flagged, never renumbered.
> - Fetch is strictly read-only: no heartbeat, no settings writes.
> - The cursor is the newest `_serverUpdatedAt` received from a **single `records` collection**. One query = one consistent snapshot, so the cursor cannot skip a record written during a parallel multi-collection read. All sync-owned fields are underscore-prefixed (`_kind`, `_serverUpdatedAt`, `_deviceId`, `_tombstone`, `_deletedAt`) so they can never collide with business fields such as `type` or `deleted`.
> - Settings and branding have their own cursors and never advance the records cursor.
> - Deletes always win over an offline edit; last successful push wins on edits; there is no conflict archive.
> - Settings are not physically split; a whitelist selects what is synced, so theme/language/PIN/counters cannot leak between devices.
> - Tombstones store only `{_tombstone, _deletedAt, _kind, _serverUpdatedAt}`. Soft deletes (accounts/products) keep the business `deleted: true` field and remain in the collection so old bills still resolve names.
> - The shop logo lives in `meta/branding`, never in the settings document.

---

## 0. What you asked for

1. Firebase Auth (email + password), no in-app registration. Accounts are created by you in the Firebase console.
2. Signed-out users see the login screen only. Signed-in users never see it again until they sign out.
3. Two header buttons:
   - **Sync** — badge with the number of unsynced transactions; pushes them to Firestore.
   - **Fetch** — pulls everything new from Firestore (first fetch = everything).
4. "Last fetched" stored in the app, showing the **Firebase server time**; the next fetch only asks for records after it.
5. Deletes are tombstones with a new timestamp, so other devices receive the delete on their next fetch.
6. No glitches and no data loss between two or more devices.
7. **Fetch never writes to Firestore. Only the Sync button writes.**

---

## 1. What the app is today (facts that shape the design)

| Fact | Where | Consequence |
|---|---|---|
| Everything is one JSON blob in `localStorage` under `mmb_dryfruits_v1` | `js/db.js:4`, `js/db.js:92` | Sync must work at **record level**, not blob level |
| All mutations mutate in-memory arrays, then call `MMB.save()` (33 call sites) | `js/db.js`, `js/views/*.js` | Rewriting every view is risky → detect changes by diffing |
| Record ids are random-ish (`Date.now()` + random) | `js/utils.js:5` | Good for creates. Bad for derived ledger rows, which are deleted and recreated on edit (`js/db.js:528`, `:652`) |
| Sales/purchases spawn ledger rows; edits delete and recreate them | `js/db.js:528-545`, `:652-658` | Must use deterministic ledger ids, or every edit creates duplicates/tombstones |
| Bill numbers come from a single local counter | `js/db.js:516-518`, `:583`, `:642` | Two offline devices can issue the same number — **accepted** (see §13) |
| `settings` mixes device preferences (theme, lang, PIN) with business data (shop, commission) | `js/db.js:12-33` | Must split: local-only vs shared |
| Deletes are hard removals from arrays | `js/db.js:167`, `:388`, `:606`, `:667`, `:720`, `:797`, `:823` | Must become tombstones; accounts/products must be soft-deleted so old bills still resolve names |
| Stale-tab guard compares blob `updatedAt` | `js/db.js:93-103` | Not enough once saves are per-record; needs a revision/lock |
| Build copies a fixed file list into `www/` and `dist/` | `scripts/build.mjs:52` | New files must be added there and to `sw.js:4` |
| App is offline-first (PWA + Capacitor APK) | `sw.js`, `capacitor.config.json` | Firebase SDK must be vendored locally, not CDN-loaded |

---

## 2. Locked decisions

| # | Decision |
|---|---|
| 1 | **Bill/purchase numbers:** keep the current local counters. Two offline devices may issue the same number; accepted. A duplicate-number warning is added to the lists so it is visible, not silent. |
| 2 | **Same record edited on two devices:** last successful push wins. No conflict archive. |
| 3 | **Delete vs offline edit:** the tombstone wins. A remote delete removes the record even if this device has unsynced edits to it. |
| 4 | **First connect:** fetch from Firestore and merge by id. **Nothing is uploaded automatically.** Local changes wait for the user to press Sync. |
| 5 | **Fetch is read-only.** It performs zero Firestore writes — no heartbeat, no settings, no counters. |
| 6 | **Firebase SDK:** vendored compat build under `assets/vendor/` (offline-safe, matches the current no-bundler style). |
| 7 | **Data layout:** one Firestore collection per record type, plus a small `meta/` collection. |
| 8 | **Ordering key:** Firestore server timestamps only. Client `createdAt`/`updatedAt` stay display fields; they never decide what is fetched or what wins. |

---

## 3. The guarantees (what "no glitch" means concretely)

1. **No skipped records.** The cursor is the newest server timestamp actually received, and the query uses `>=`. A device with a wrong clock cannot hide a record.
2. **No duplicates.** Stable document ids for every record; deterministic ids for ledger rows.
3. **No lost local work on fetch** — except where you chose otherwise: a remote tombstone wins over a pending local edit.
4. **Deletes propagate.** A delete is a tombstone document, never a Firestore `delete()`.
5. **Re-running Sync or Fetch is harmless.** Every step is idempotent.
6. **No half-applied UI.** Fetches merge into a staging copy, commit in one synchronous step, then render once.
7. **One operation at a time.** Push and fetch share a cross-tab mutex.
8. **A partial push is safe.** Firestore batches are atomic; unconfirmed entries remain in the outbox and retry.
9. **Fetch changes nothing in the cloud.** Guaranteed by design: the fetch code path contains no Firestore write call.

### What cannot be guaranteed (be honest)

- Two devices creating bills offline can produce the same bill number. You accepted this; the UI will flag duplicates.
- A device that is offline for a very long time needs a Full resync (one click in Settings).
- If a record is deleted on one device while another edits it offline, the edit is intentionally discarded (decision 3).

---

## 4. Firebase setup (one-time, you do this)

1. Create a Firebase project and a Web App; copy the web config.
2. Enable **Authentication → Email/Password** (leave "Email link" off).
3. Create your user(s) by hand: Authentication → Users → Add user.
4. Create **Firestore** in production mode, nearby region (e.g. `asia-south1`).
5. Add authorized domains: `localhost`, your GitHub Pages domain, and `https://localhost` for the Capacitor WebView.
6. Deploy the rules below.
7. Any account that exists in the project may use the app. Because of that, keep account creation under your control: use Authentication → Settings → User actions → **Block account creation** if your project shows it, and always use strong passwords.

### Firestore rules (any signed-in account)

```js
rules_version = '2';
service cloud.firestore {
  match /databases/{db}/documents {
    function signedIn() {
      return request.auth != null;
    }

    match /records/{id}  { allow read, write: if signedIn(); }
    match /meta/{doc}    { allow read, write: if signedIn(); }
  }
}
```

Any valid email/password account in the Firebase project can use the cloud data. There is no per-UID allowlist.

Only the public web config (`apiKey`, `authDomain`, `projectId`, ...) is shipped. That is not a secret; the rules are the security boundary.

---

## 5. Local data model v2

Keep one localStorage key, bump to `schema: 2`, and keep sync metadata in a block that is never exported or rendered:

```js
{
  schema: 2,
  app, version, createdAt, updatedAt,
  rev,                        // increments on every local commit
  settings: {
    shared: { shop, commissionRate, lowStockKg, defaultCartonKg },  // synced
    local:  { lang, theme, pinSalt, pinHash, updates,
              billCounter, purchaseCounter, deviceId }              // never synced
  },
  accounts, products, ledger, sales, purchases, returns, adjustments,
  sync: {
    uid, deviceId,
    cursor: { seconds, nanos } | null,    // newest server timestamp received
    lastFetchedServerAt: { seconds, nanos } | null,
    lastSyncedAt: 'ISO',
    dirty: { 'sale:sal_x': { op:'set'|'del', at, rev } },   // outbox
    tombstones: { 'sale:sal_x': { at, pushed:bool, last:{...record} } },
    seen: { 'sale:sal_x': 1730000000000 },                   // newest server ms applied
    base: { 'sale:sal_x': 'hash of last known local content' } // diff baseline
  }
}
```

`billCounter` / `purchaseCounter` move to **local** settings: keeping them shared would make the number jump backwards after a fetch. Each device keeps its own sequence, exactly as today.

Migration on load:
- `settings` → `settings.shared` + `settings.local`.
- Add `rev`.
- Give every record `updatedAt = createdAt || app.createdAt`.
- Rewrite bill-linked ledger ids to deterministic ids (§6) and drop duplicates.
- Populate `sync.base`; mark nothing dirty. Existing data is treated as "not yet synced"; it becomes dirty only when the user edits it, or through the first-connect rule (§17).

---

## 6. Firestore data model

```
accounts/{id}      products/{id}     ledger/{id}
sales/{id}         purchases/{id}    returns/{id}
adjustments/{id}
meta/settings      meta/branding
```

Document shape:

```js
{
  ...record fields...,         // same shape the app already uses
  updatedAt: '2026-11-10T...', // client, for humans/debug
  deviceId: 'dev_ab12',
  serverUpdatedAt: <serverTimestamp>   // THE ordering key
}
```

Tombstone:

```js
{
  deleted: true,
  deletedAt: '2026-11-10T...',
  deviceId,
  serverUpdatedAt: <serverTimestamp>,
  last: { ...the record as it was deleted... }   // enables restore
}
```

Deterministic ledger ids (replace random ids for bill-linked rows):

```
led_{saleId}_sale
led_{saleId}_commission
led_{purchaseId}_purchase
led_{returnId}_return
led_{saleReturnId}_saleReturn
led_{saleReturnId}_commissionReversal
```

Manual entries keep their random ids (they are independent facts, not derived).

Why per-type collections: the single-field index on `serverUpdatedAt` exists by default (no composite index), rules are simple, and the console is readable.

`meta/settings` holds the shared settings object. `meta/branding` holds the logo separately, because a base64 logo can approach the 1 MiB document limit; sync it only if it stays under ~700 KB, otherwise keep it local.

---

## 7. Change detection (outbox) without rewriting the views

`MMB.save()` computes a per-record fingerprint (FNV-1a hash of canonical JSON) for each collection and compares it to `sync.base`:

- new id → dirty `set`
- changed hash → dirty `set`
- id in `base` but missing now → dirty `del` + local tombstone
- id reappears → clear tombstone, dirty `set`

Record counts are small (hundreds to a few thousand), so a full diff per save is cheaper and far less error-prone than adding `updatedAt` maintenance to 33 call sites.

**Critical:** fetched records must not become dirty. `MMB.save()` therefore takes an origin:

```js
MMB.save()                    // local edit → diff → outbox
MMB.save({ origin:'remote' }) // fetch apply → update base/tombstones, no outbox
```

With `origin:'remote'`, the base hashes and `seen` map are updated in the same commit, so a fetch never creates work for Sync.

UI helpers:

```js
MMB.pendingCount()   // unsynced changes (badge)
MMB.syncNow()        // push only
MMB.fetchNow()       // pull only
MMB.syncState()      // idle|pushing|fetching|offline|error
```

---

## 8. Push (Sync) — the only writer

Preconditions: signed in, online, no fetch running.

1. Take the cross-tab lock.
2. Re-read localStorage; if `rev` changed under us, reload and re-diff (never push a stale view of the world).
3. Build writes from `dirty`:
   - `set` → `batch.set(doc, { ...record, updatedAt, deviceId, serverUpdatedAt: serverTimestamp() })`
   - `del` → `batch.set(doc, { deleted:true, deletedAt, deviceId, serverUpdatedAt: serverTimestamp(), last })` (never `delete()`)
   - shared settings changed → `batch.set(meta/settings, { ...shared, serverUpdatedAt })`
4. Commit in chunks of at most **450 writes** (Firestore's limit is 500; leave headroom).
5. After each successful commit, remove exactly those entries from `dirty`/tombstones and persist. A crash mid-way leaves the rest queued.
6. Update the badge; toast "Synced N changes".

Because the local edit happened earlier, "last push wins" is implemented naturally: whichever device presses Sync last writes last.

---

## 9. Fetch — read-only, zero writes

Preconditions: signed in, online, no push running.

1. Take the cross-tab lock.
2. Query every collection:
   - `cursor == null` → read the whole collection
   - else → `where('serverUpdatedAt', '>=', cursor)`
   - use `getDocsFromServer` (never the cache) so the cursor cannot jump past unseen server data.
3. Merge all results into a **staging clone** of the db, following §11–12.
4. Apply `meta/settings` with the same rules.
5. Commit the staging clone (one synchronous assignment, `MMB.save({origin:'remote'})`, one rerender). Toast "Fetched N changes".
6. Set `cursor` and `lastFetchedServerAt` to the **maximum `serverUpdatedAt` observed** across all documents, then persist.
7. If nothing new arrived, keep the cursor, toast "Already up to date", and leave the displayed time unchanged.

No `set`, `update`, `add`, `delete`, or transaction call exists anywhere in this path.

### Why max-observed is safe as a cursor

Firestore resolves `serverTimestamp()` at commit, and commits are atomic and monotonically ordered per document. If a document commits after our read snapshot, its timestamp is later than the maximum we saw, so the next `>= cursor` query includes it. If it committed before the snapshot, it was in the results. Ties are re-read because the query is `>=`, and the `seen` map makes re-reading free. Therefore no gap is possible.

### "Last fetched" display

- The cursor **is** the displayed timestamp: the newest Firebase server time received.
- Shown as `Last fetch: 10 Nov 2026, 4:32 PM (server)` in local timezone, with a "Never" state.
- If a fetch returns nothing, the timestamp does not move — that is correct, because it reflects the newest data, not the click time. A secondary "Checked just now" (client clock) can sit next to it if you want the click time visible.
- Full resync in Settings sets the cursor to null and fetches everything; safe because merges are idempotent.

---

## 10. Deletes and tombstones

| Record | Delete behaviour |
|---|---|
| `sales`, `purchases`, `returns`, `ledger`, `adjustments` | Remove locally, add a tombstone with the full last copy, push as a tombstone document |
| `accounts`, `products` | Set `deleted: true` (soft delete) instead of removing, so historical bills still resolve names; push as a normal update. Pickers filter `!deleted`. |
| Cascades (a deleted bill removes its ledger rows) | The diff sees the missing ledger rows and tombstones them too — no special code |

Tombstones are kept forever locally and in Firestore. They are tiny, and retention is what makes "delete on one device, gone on the others" reliable even after months offline.

A fetch that receives a tombstone:
- local record missing → record `seen` and the tombstone, nothing else
- local record exists, clean **or dirty** → **remove it** (delete wins, decision 3), record `seen`, show a warning if local edits were discarded.

---

## 11. Merge policy (single table)

For each remote document, in this order:

| Local state | Remote state | Action |
|---|---|---|
| missing | exists, not deleted | insert, `seen = serverMs` |
| missing | deleted | store tombstone only |
| exists, **dirty** | deleted | **remove local record** (delete wins), store tombstone, warn |
| exists, **dirty** | exists, not deleted | **keep local**, do not touch; it will win when you press Sync |
| exists, clean, `seen` >= remote `serverMs` | older/equal | ignore (duplicate) |
| exists, clean | newer, not deleted | replace with remote, `seen = serverMs` |
| exists, clean | newer, deleted | remove + tombstone, `seen = serverMs` |

`seen` (a server millisecond value), not client `updatedAt`, decides freshness. A device with a two-day-slow clock is harmless.

The table is symmetric for any processing order, so a batch cannot depend on ordering.

---

## 12. Bill and purchase numbers

Per decision 1, the existing local counters stay:

- `settings.local.billCounter` / `purchaseCounter` continue to increment as today.
- They are never fetched or pushed, so a fetch cannot rewind the sequence.
- Two devices can print the same number if they create bills offline at the same time. To keep that visible:
  - Sales and purchases lists mark duplicate `billNo` / `no` values with a small "duplicate" badge.
  - The Sync success toast reports collisions found in the newly synced set.
  - Existing bills are never renumbered.

If this ever becomes a real problem, the reserved-block design from the earlier draft can be added later without changing the sync protocol.

---

## 13. Shared vs local settings

**Synced (`settings.shared`)**: shop name/address/phones, commission rate, low-stock threshold, default carton weight, logo (via `meta/branding`).

**Local only (`settings.local`)**: language, theme, PIN salt/hash, updater settings, device id, bill and purchase counters.

Reasons: a PIN hash from another device could lock a device you never configured; theme/language are preferences; counters must not jump backwards.

`meta/settings` is one document, so it resolves as whole-object LWW. Concurrent changes to two different fields could lose one; acceptable for this app.

---

## 14. Auth gate and login screen

- `js/cloud.js` owns Firebase init, auth, and sync.
- `auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL)` before sign-in; on startup `onAuthStateChanged` chooses login or app.
- Not signed in → hide `#appShell` and `.bottom-nav`, show a full-screen login card (logo, email, password with show/hide, Sign in, inline error, language toggle, offline hint). No "create account" link.
- Signed in → show the shell, run migrations, initialise sync, then the existing PIN lock (if configured) on top.
- Session survives restarts and works offline once established (Firebase restores the cached user). A brand-new device needs network once.
- Sign out: confirmation. If `pendingCount() > 0`, offer **Sync now / Sign out anyway / Cancel**. Local data is never discarded on sign-out.
- Namespace the storage key by uid (`mmb_dryfruits_v1_<uid>`) so two accounts cannot mix. The first uid to sign in adopts the legacy key.
- Optional: password reset via `sendPasswordResetEmail`.

Login errors mapped to friendly i18n strings: wrong email/password, too many attempts, network unavailable, account disabled.

---

## 15. Header UI and last-fetched display

`index.html` topbar (`.topbar-actions`, before the language button):

```
[ Sync (3) ]  [ Fetch ]  [ lang ] [ theme ] [ New sale ]
```

- **Sync**: refresh icon + count badge. Disabled and spinning while pushing. Zero pending → muted.
- **Fetch**: download icon. Spinning while fetching.
- A small status line under the page subtitle on desktop: `Last fetch: 10 Nov, 4:32 PM · server`.
- On mobile both become icon buttons with a numeric badge; the timestamp lives in Settings → Cloud and appears as a toast after a fetch.
- Settings gets a **Cloud** section: signed-in email, device id, pending count, last fetch (server time), last sync, Full resync, Sign out.
- New i18n keys in both `en` and `ur` (login, sync, fetch, lastFetched, never, unsynced, offline, error, signOut, resync, duplicate bill, ...).

Styling reuses `.badge`, `.icon-btn`, `.settings-card`; the login screen reuses the `.lock-screen` structure.

---

## 16. Multi-tab safety

Two tabs are two in-memory copies; the diff engine would misread the other tab's records as deletions.

- Every save acquires `navigator.locks.request('mmb-write')` when available (localStorage lock with a heartbeat as fallback).
- Inside the lock, re-read the stored blob. If `rev` differs from the in-memory base, **do not save**: show "This app was changed in another tab" with a Reload button.
- Listen to the `storage` event: reload the db and rerender immediately, so a tab is never stale for long.
- Sync and fetch use the same lock, so two tabs cannot push or fetch at once.

---

## 17. Migration and first connect

On first successful login:

1. Write an automatic safety backup (JSON) and keep a copy in localStorage before touching anything.
2. Run the schema-v2 migration.
3. Fetch everything from Firestore (read-only) and merge by id using §11.
4. **Do not push anything.** Local edits stay dirty and wait for the Sync button.
5. Show a one-time summary: `Fetched N · kept M local changes · removed K deleted`. Offer "Download backup".

| Local | Cloud | Result |
|---|---|---|
| empty | empty | empty app, nothing to do |
| empty | has data | full fetch |
| has data | empty | local stays; badge already reflects any edits made before login |
| has data | has data | merge by id; remote wins for clean local records; local dirty records remain until Sync |

There is no automatic upload, so the dangerous "both sides have bills" moment is deferred to an explicit Sync press. If the user presses Sync, the local versions win (last push wins) — that is the expected behaviour of a manual sync.

---

## 18. Failure modes → behaviour

| Event | Result |
|---|---|
| Offline during push | Committed chunks cleared, the rest stays queued. Badge shows the remainder. |
| App killed mid-push | Same as above; retry is idempotent. |
| Offline during fetch | Nothing applied, cursor unchanged. |
| Two devices create bills offline | Possible duplicate number; flagged in the list and in the sync toast. |
| Two devices edit the same account | Last successful push wins; both converge. |
| Delete on A, edit on B (offline) | Delete wins; B's edit is discarded with a warning. |
| Device clock wrong | Only displayed client timestamps are affected; fetching and merging use server time. |
| Fetch returns our own pushed docs | Ignored by the `seen` check. |
| 1 200 new records | Batched writes on push; single unpaged reads on fetch (add pagination past ~5k). |
| Logo too large | Kept local / compressed; never pushed into the settings document. |
| Sign out with pending changes | Explicit warning; local data preserved either way. |

---

## 19. File-by-file change list

New:
- `js/cloud.js` — Firebase init, auth, outbox push, fetch/merge, cursor, `MMB.sync*` API.
- `js/views/login.js` — login screen render and handlers (or inline markup in `index.html`).
- `assets/vendor/firebase-app-compat.js`, `firebase-auth-compat.js`, `firebase-firestore-compat.js`.
- `firestore.rules`, `firebase.json` — rules + emulator config.
- `js/cloud-config.js` — the web config values you paste.

Modified:
- `index.html` — login markup, header buttons, cloud status line, script tags.
- `js/db.js` — schema v2, settings split, migration, diff/outbox in `save`, `origin:'remote'`, deterministic ledger ids, soft delete.
- `js/app.js` — auth gate, header wiring, badge refresh, rerender after sync/fetch, tab/storage handling, sign-out.
- `js/views/settings.js` — Cloud section; "Reset" relabelled to "Clear this device" with an explanation that the cloud restores data.
- `js/views/accounts.js`, `js/views/stock.js` — filter soft-deleted records; duplicate bill-number badge.
- `js/i18n.js` — new en/ur strings.
- `css/app.css` — login card, badge on icon buttons, cloud status line.
- `sw.js` — add cloud.js, login.js, firebase vendor files; bump `CACHE`.
- `scripts/build.mjs` — vendor files already sit under `assets/`, so only `version.json` needs a bump.
- `README.md` — setup, rules deployment, first-connect behaviour, backup/restore note.
- `android/app/src/main/AndroidManifest.xml` — INTERNET permission already present; Firebase is HTTPS only.

Not changed: business logic in the views, printing, CSV, v1 backup import format.

---

## 20. Test matrix

1. A logs in, creates 3 accounts, pushes; B fetches → sees exactly 3.
2. B offline: creates a sale, edits an account, deletes a product; reconnect → badge 3 → push → A fetch applies update and tombstone.
3. Both offline edit the same account, both push, both fetch → identical state, one value.
4. A deletes a bill; B (offline) edits it; B fetches → bill is gone, warning shown.
5. Both offline create 5 bills → duplicate numbers flagged, never silently hidden.
6. Records created *while* B is fetching → B's next fetch receives them (no gaps).
7. Set B's clock 2 days slow, create a sale → A still receives it; cursor/display sane.
8. Seed 1 200 records → push in batches, fetch in a loop, everything arrives once.
9. Double-click sync; airplane mode mid-push; force-close mid-push → retry converges, no duplicates.
10. Two tabs open → the second reloads or refuses to save; no branching, no phantom deletes.
11. First connect with local and cloud data → fetch-only merge, no cloud writes, no duplicate records, safety backup exists.
12. Login: wrong password, unknown email, offline, session across restart, sign-out warning with pending data.
13. Rules: unauthenticated REST read denied; any account created in the console can use the app; a deleted/disabled account is denied.
14. PIN lock still works after login; language/theme stay per-device.
15. Import a v1 backup, then sync → records appear on the other device, no duplicates.
16. Fetch with a proxy/console log → confirm zero write requests (decision 5).

---

## 21. Phases and acceptance

**Phase 0 — Firebase setup** (you, in console). Done when the web config and UID are available and rules are deployed.

**Phase 1 — Auth gate.** Login screen, persistence, sign-out, error states. App otherwise unchanged.
*Accept:* app cannot be used signed out; session survives restart; offline signed-in use works.

**Phase 2 — Schema v2 locally.** Migration, settings split, deterministic ledger ids, soft deletes, `origin` on save. Still no network.
*Accept:* all existing features work; v1 backups import; no duplicate ledger rows after edits.

**Phase 3 — Outbox.** Diff engine, dirty count, local tombstones, badge.
*Accept:* badge counts exactly (creates, edits, deletes); survives reload; ledger edits count as updates.

**Phase 4 — Push + Fetch.** Server cursor, last-fetched, merge table, tombstone apply, read-only fetch.
*Accept:* tests 1, 2, 3, 5, 6, 7, 8, 9, 14, 16.

**Phase 5 — First connect, settings sync, resync, sign-out guard.**
*Accept:* tests 11, 12, 15.

**Phase 6 — Hardening.** Cross-tab lock, pagination, duplicate-number badges, performance pass, emulator tests.
*Accept:* tests 4, 10, 13.

**Phase 7 — Ship.** Bump version, build `www`/`dist`, update SW cache, deploy Pages, build the APK, two-device field test.

Rough effort: Phases 1–4 are the bulk; several focused sessions, not one.

---

## 22. Known limits (recap)

- Duplicate bill numbers are possible when two devices create bills offline. Visible, not silent.
- Delete wins over an offline edit (your decision).
- Settings are one document; concurrent edits to two different settings fields resolve as whole-object LWW.
- Full resync is the recovery path for a device that was offline for an extremely long time or has corrupted sync metadata.
- First login and the first fetch require network.

---

## 23. Next step

Paste the Firebase web config (`apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId`, `appId`) and the UID that is allowed to use the app. I will then start Phase 1 and work through the phases in order.
