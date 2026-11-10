# Muhammad Mir & Brothers — Dry Fruits

An offline-first, bilingual (English / اردو) business app for a dry-fruits trader: accounts and ledgers, stock in/out, A5 sale bills, broker commission and a dashboard.

Open `index.html` directly in a browser, or serve the folder with any static server. Everything is stored locally in the browser's `localStorage`; there is no server and no internet requirement.

## Quick start

1. Open `index.html` (or serve the folder). The app starts empty — your own data is never mixed with sample data.
2. Go to **Settings** and check the shop profile, logo, brokerage rate and **Next bill number**. It starts at `0227` (the number on your bill); change it to the next number in your bill book before the first bill.
3. Go to **Accounts** and add your customers, brokers, cash/bank accounts and expense heads. You can also create an account inline from any customer/supplier/broker picker.
4. Go to **Stock → Stock In** and record a purchase from a supplier. This adds stock and credits the supplier's balance.
5. Go to **Stock → Stock Out** and create a sale bill. Pick the customer, add the products, pick a broker. The broker is credited 0.45% of the goods value automatically. Save & print.
6. If goods come back, open the sale → **Sale return**. Stock returns at the original cost, the customer is credited, and the brokerage is reversed; bill charges stay on the original bill.
7. In an account's ledger, use **Credit** / **Debit** to move money. Adding a *party* creates a matching entry in the party's ledger.

The language button (globe) switches the whole app between English and Urdu (RTL). The bill itself is always bilingual — English and Urdu — and keeps the same A5 layout in both modes.

## Rules used

- **Balance signs:** `+` green = the account holder has money with you (you owe them). `−` red = they owe you. Cash/bank `+` = money available. Expense `+` = amount spent.
- **Credit / Debit:**
  - Customer, supplier and broker: credit adds to the balance, debit reduces it.
  - Cash / bank: debit = money in, credit = money out.
  - Expense: debit = expense, credit = reversal.
  - A party entry is created with the opposite type, so both ledgers stay in step.
- **Brokerage:** 0.45% of the goods value (not the charges), configurable in Settings, sales only, one broker per bill. It is credited to the broker and treated as a cost in P&L. It is *not* added to the customer's bill automatically; the optional **Dalali** charge field is there if you want to pass a charge to the buyer.
- **Sale bill:** goods + any charge fields (Bardana, Dalali, Nikhara, Chhappai, Pehri, Tulai, Other). The full total is debited to the customer's ledger with the bill number.
- **Purchases:** supplier is credited the full purchase value. No extra charges on purchases (as requested).
- **Stock:** each product has a default kg-per-carton (usually 10, editable). Entry can be in kg or cartons and converts automatically. Rates are always per kg. Valuation uses weighted average cost; selling more than available shows a warning but is allowed.
- **Purchase returns:** partial or full, per line, at the original purchase rate. Supplier's balance is debited and stock goes out.
- **Sale returns:** partial or full, per line, at the original sale rate. Stock comes back at the original cost, the customer is credited, and the broker's commission is reversed proportionally (0.45% of the returned goods). Bill charges are **not** refunded — the return hint says this. A sale with returns cannot be edited or deleted until the returns are removed.
- **Stock adjustments:** damage / shortage / self-use / other; positive or negative; valued at average cost and counted as a loss/gain in P&L.
- **True profit (P&L):** bill totals (goods + charges) − sale returns − cost of goods sold at weighted average + returned cost − brokerage net of reversal − expenses − stock losses. Sale bills are the revenue; purchases affect stock and COGS, not P&L directly.
- **Bill numbers:** start at `0227`, 4 digits, never reused. Change the next number in **Settings → Next bill number** before your first bill (for example to `0228` if `0227` is already in your book). Purchase numbers are `P-0001`.
- **Printing:** A5, with both English and Urdu headings and Arial/Nastaliq fallbacks. Use “Save as PDF” in the print dialog for a PDF.

## Data & backup

- Data is stored under the key `mmb_dryfruits_v1` in `localStorage`.
- **Settings → Data & backup** downloads a JSON backup, restores one, or exports CSV files.
- Clearing browser data will remove the app's data. Download a backup regularly, especially before changing phones.
- The PIN is a convenience screen lock, not encryption.

## Printing

The sale bill has a logo, shop header (English + Urdu), bill number/date, customer, vehicle/destination, item table, charges, grand total, amount in words and signature lines. To preview a saved bill, open a sale in **Stock Out → sale → View bill**. The preview and print are fixed LTR documents (like the paper bill) even when the app UI is in Urdu; the bill labels stay bilingual. The printed title bar falls back to a light bar if the browser's print dialog has background graphics disabled, so it stays readable.

## Android app & silent updates

The project now has a Capacitor 8 Android wrapper, a self-hosted live-update pipeline, and a **Settings → App updates** panel. Updates do not require reinstalling the app; a new APK is only needed when native code changes.

### One-time GitHub setup

1. Push this folder to a GitHub repository. Use a **public** repository (or otherwise make Pages and the release APK publicly reachable) so the app can download the feed, update zip and APK without signing in.
2. In **Settings → Pages**, set **Source** to **GitHub Actions**.
3. Create a signing keystore **once** and keep it safe. Every APK update must be signed with the same key, otherwise Android will refuse to install over the old app:
   ```bash
   keytool -genkeypair -v -keystore mir-release.keystore -alias mir -keyalg RSA -keysize 2048 -validity 10000
   ```
   Base64-encode the keystore file (macOS: `base64 -i mir-release.keystore`; Linux: `base64 -w0 mir-release.keystore`; PowerShell: `[Convert]::ToBase64String([IO.File]::ReadAllBytes('mir-release.keystore'))`).
4. Add these repository secrets in **Settings → Secrets and variables → Actions**:
   - `ANDROID_KEYSTORE_BASE64`
   - `ANDROID_KEYSTORE_PASSWORD`
   - `ANDROID_KEY_ALIAS` (e.g. `mir`)
   - `ANDROID_KEY_PASSWORD`
5. Push to `main`: the workflow builds and deploys the web app, `update.json` and the update zip to GitHub Pages. Then push a version tag:
   ```bash
   git tag v1.0.0
   git push origin v1.0.0
   ```
   The workflow builds, signs and attaches `app-release.apk` to the GitHub Release. Download it on the phone and install it (allow “install unknown apps” for the browser).

### How updates work

- Every push to `main` gets a new build id (the git SHA). The workflow writes a new `update.json`, `updates/app-<id>.zip`, and deploys the web app. You do **not** need to bump versions for web/UI changes.
- **Android:** the app checks the feed (in Settings, and on launch if enabled), downloads the zip with `@capgo/capacitor-updater`, and sets it as the next bundle. It applies on the next background/relaunch, or immediately with **Restart now**. Your `localStorage` data is preserved.
- **Web/PWA:** the same check updates the service worker and shows **Reload**.
- If `version.json` has a `minNativeVersion` greater than the installed APK's version, the app shows **Download new app** (Settings and dashboard). The button opens the latest GitHub Release APK. Installing over the old app keeps the data, as long as the signing key is the same.
- For **native/plugin changes**: bump `version`, `versionCode` and `minNativeVersion` in `version.json`, push `main`, then push a tag such as `v1.1.0`. Older apps will see the APK button instead of a web bundle.

### Local builds

```bash
npm install
npm run build:web          # creates www/ and dist/
npx cap sync android       # copies www into the Android project
npx cap open android       # opens Android Studio
```

`npm run build:web` also creates `dist/update.json` and `dist/updates/app-<build>.zip`. To make a locally built APK point at GitHub, set `PAGES_BASE_URL` while building (e.g. `https://<user>.github.io/<repo>`). Without it the feed is local (`./update.json`) and cannot receive remote updates — use the GitHub Actions build for real OTA updates.

The APK download URL is `https://github.com/<owner>/<repo>/releases/latest/download/app-release.apk` (added to the feed automatically).

The **Check updates** button needs HTTP(S) or the Android app. Opening a raw `file://` copy cannot fetch `update.json` (browsers block it), so use a local static server, GitHub Pages, or the APK when testing updates.

### Update feed

`update.json` contains:
```json
{
  "webVersion": "1.0.0+<commit>",
  "build": "<commit>",
  "minNativeVersion": "1.0.0",
  "apkUrl": "https://github.com/.../releases/latest/download/app-release.apk",
  "zipUrl": "https://.../updates/app-<commit>.zip",
  "notes": "..."
}
```
The feed URL is baked into the APK's `js/config.js` at build time; you can override it in **Settings → App updates → Update feed URL** without rebuilding.

## Files

```
index.html               app shell
css/app.css              design system + A5 print styles
js/config.js             build version + update feed URL
js/utils.js              formatting, dates, CSV, hashing
js/i18n.js               English / Urdu dictionary
js/db.js                 storage, ledger, stock replay, bills, P&L, sale returns
js/ui.js                 sheets, pickers, charts, bill HTML
js/updater.js            GitHub feed, Capgo bundle download, APK download
js/views/dashboard.js
js/views/accounts.js     accounts list + ledger
js/views/stock.js        stock in/out, forms, purchase/sale returns, adjustments
js/views/settings.js
js/app.js                router, theme, language, PIN lock, sync buttons
js/cloud-config.js       Firebase web config (public values)
js/cloud.js              Firebase Auth gate, login screen, session
js/sync.js               Firestore push (Sync) and read-only pull (Fetch)
css/auth.css             login / boot screen
css/sync.css             header sync badge and last-fetch stamp
firestore.rules          Firestore security rules
firebase.json            rules + emulator config
manifest.webmanifest     installable web app
sw.js                    offline cache for web/PWA
assets/                  logo, icon, fonts
package.json             Capacitor + updater dependencies and scripts
version.json             web version, Android versionCode, minNativeVersion
capacitor.config.json    Android app id + updater configuration
scripts/build.mjs        www/ + dist/ + update.json + zip
scripts/android-version.mjs
android/                 generated Capacitor Android project (signed via CI secrets)
.github/workflows/deploy.yml  Pages deploy + signed APK release
```

## Cloud sync (Firebase Auth + Firestore)

The app is still offline-first: localStorage is the working copy. The cloud is only touched by the two header buttons.

**Setup (one time)**

1. Create a Firebase project and a **Web App**; copy the config into `js/cloud-config.js`.
2. Authentication → Sign-in method → enable **Email/Password**. There is no sign-up in the app.
3. Authentication → Users → **Add user** for every email that may use the app. Any account that exists in the project can sign in and use the cloud data — there is no per-UID allowlist.
4. Create Firestore (production mode).
5. Deploy the rules in `firestore.rules` (they allow any signed-in account):
   `firebase deploy --only firestore:rules`
6. Authentication → Settings → Authorized domains: add `localhost` and your GitHub Pages domain. The Capacitor app uses `https://localhost`.
7. Security: because every existing account has full access, keep account creation under your control. If your Firebase console shows **Authentication → Settings → User actions → Block account creation**, turn it on. Otherwise use strong passwords and add accounts only from the console. The web `apiKey` is public by design; the rules, not the key, decide who gets in.

**Behaviour**

- **Sync** uploads the pending changes shown in its badge. A device that already had local data before this update queues all of it once, so the first Sync uploads the existing shop — this can take a while on mobile data because every bill, ledger row, account and product is one Firestore document. Later syncs only send changed records. Deletes are written as tombstones, never as Firestore `delete()` calls.
- **Fetch** only reads. All records live in one `records` collection, so a fetch is a single consistent Firestore snapshot. It requests records whose `_serverUpdatedAt` is at or after the stored cursor and shows that server time in the header / Settings.
- A record with pending local changes is never overwritten by Fetch. Another device's delete wins over a pending local edit (by design).
- The bill and purchase counters are local to each device. Two devices creating bills offline can produce the same number; the list flags duplicates.
- Full resync is in Settings → Cloud. It resets the cursor and fetches everything again; it never uploads.
- The shop logo is stored in `meta/branding`, separate from the settings document, because it can be large.

## Known scope notes

- **Android only** for the native wrapper. iOS can be added later with `npx cap add ios` on macOS.
- The first APK must be built by the GitHub Action (or with `PAGES_BASE_URL` set) so its baked feed URL points at GitHub. A local APK with the default `./update.json` cannot receive OTA updates.
- The same signing keystore must be used for every APK; otherwise Android will refuse to install the update over the old app. Back up the keystore.
- Cloud data requires network access and a signed-in account. The first login on a new device must be online. A signed-in session keeps working offline; Sync and Fetch need a connection.
- Backups (Settings → Data & backup) remain the safest way to move or archive a device.
- The PIN is a screen lock only, not encryption.
- The first bill number defaults to `0227`; change it in Settings to match your bill book.
