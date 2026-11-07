/**
 * Build the Capacitor web folder (www) and the GitHub Pages deployment (dist).
 *
 * Outputs:
 *   www/                      -> Capacitor webDir, copied into the APK
 *   dist/                     -> Pages site: app + update.json + updates/app-<build>.zip
 *   dist/update.json          -> the live-update feed the app checks
 *   dist/updates/app-<id>.zip -> the exact web bundle the Android updater downloads
 *
 * Environment (set by .github/workflows/deploy.yml):
 *   PAGES_BASE_URL  e.g. https://owner.github.io/repo
 *   GITHUB_REPOSITORY e.g. owner/repo
 *   BUILD_ID        optional; defaults to the short git SHA or "dev"
 *   APK_URL         optional; otherwise derived from GITHUB_REPOSITORY
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import archiver from 'archiver';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WWW = path.join(ROOT, 'www');
const DIST = path.join(ROOT, 'dist');

const versionFile = JSON.parse(fs.readFileSync(path.join(ROOT, 'version.json'), 'utf8'));
const version = String(versionFile.version || '1.0.0');
const versionCode = Number(versionFile.versionCode || 1);
const minNativeVersion = String(versionFile.minNativeVersion || version);
const notes = String(versionFile.notes || '');

function shortBuild() {
  if (process.env.BUILD_ID) return String(process.env.BUILD_ID).slice(0, 12);
  if (process.env.GITHUB_SHA) return String(process.env.GITHUB_SHA).slice(0, 7);
  try {
    return execSync('git rev-parse --short HEAD', { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch (e) {
    return 'dev';
  }
}

const build = shortBuild();
const webVersion = version + '+' + build;
const pagesBase = String(process.env.PAGES_BASE_URL || '').replace(/\/+$/, '');
const repo = String(process.env.GITHUB_REPOSITORY || '');
const apkUrl = process.env.APK_URL || (repo ? `https://github.com/${repo}/releases/latest/download/app-release.apk` : '');
const feedUrl = pagesBase ? `${pagesBase}/update.json` : './update.json';
const zipName = `app-${build}.zip`;
const zipUrl = pagesBase ? `${pagesBase}/updates/${zipName}` : `./updates/${zipName}`;

const INCLUDE = ['index.html', 'css', 'js', 'assets', 'manifest.webmanifest', 'sw.js'];

function copyApp(dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const item of INCLUDE) {
    fs.cpSync(path.join(ROOT, item), path.join(dest, item), { recursive: true });
  }
  const config = 'window.MMB_CONFIG = ' + JSON.stringify({
    version: webVersion,
    baseVersion: version,
    build: build,
    feedUrl: feedUrl,
    apkUrl: apkUrl,
    nativeVersion: version
  }, null, 2) + ';\n';
  fs.writeFileSync(path.join(dest, 'js', 'config.js'), config);

  const swPath = path.join(dest, 'sw.js');
  if (fs.existsSync(swPath)) {
    let sw = fs.readFileSync(swPath, 'utf8');
    sw = sw.replace(/const CACHE = '[^']+';/, `const CACHE = 'mmb-dryfruits-${version}-${build}';`);
    fs.writeFileSync(swPath, sw);
  }
}

function zipDir(src, dest) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const output = fs.createWriteStream(dest);
    const archive = archiver('zip', { zlib: { level: 9 } });
    output.on('close', resolve);
    output.on('error', reject);
    archive.on('error', reject);
    archive.pipe(output);
    archive.directory(src, false);
    archive.finalize();
  });
}

async function main() {
  fs.rmSync(WWW, { recursive: true, force: true });
  fs.rmSync(DIST, { recursive: true, force: true });

  copyApp(WWW);
  console.log(`www: ${WWW}`);

  fs.mkdirSync(DIST, { recursive: true });
  fs.cpSync(WWW, DIST, { recursive: true });

  const zipPath = path.join(DIST, 'updates', zipName);
  await zipDir(WWW, zipPath);
  // Capacitor Updater requires a SHA-256 checksum for manual bundle downloads.
  const checksum = crypto.createHash('sha256').update(fs.readFileSync(zipPath)).digest('hex');

  const feed = {
    webVersion,
    baseVersion: version,
    build,
    minNativeVersion,
    apkVersion: version,
    apkUrl,
    zipUrl,
    checksum,
    notes,
    publishedAt: new Date().toISOString()
  };
  fs.writeFileSync(path.join(DIST, 'update.json'), JSON.stringify(feed, null, 2) + '\n');
  console.log(`dist: ${DIST}`);
  console.log(`feed: ${JSON.stringify(feed, null, 2)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
