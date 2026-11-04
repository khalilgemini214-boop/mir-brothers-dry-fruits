import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const versionFile = JSON.parse(fs.readFileSync(path.join(ROOT, 'version.json'), 'utf8'));
const version = String(versionFile.version || '1.0.0');
const versionCode = Number(versionFile.versionCode || 1);
const gradle = path.join(ROOT, 'android', 'app', 'build.gradle');

if (!fs.existsSync(gradle)) {
  console.error('android/app/build.gradle not found. Run npx cap add android first.');
  process.exit(1);
}

let text = fs.readFileSync(gradle, 'utf8');
text = text.replace(/versionCode\s+\d+/, 'versionCode ' + versionCode);
text = text.replace(/versionName\s+"[^"]*"/, 'versionName "' + version + '"');
fs.writeFileSync(gradle, text);
console.log('Android version set to ' + version + ' (' + versionCode + ')');
