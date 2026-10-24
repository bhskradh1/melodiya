#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DIR="$ROOT_DIR/flutter_app"
cd "$ROOT_DIR"

if [[ ! -d dist ]]; then
  npm run build
fi

mkdir -p "$APP_DIR/assets/web"
find "$APP_DIR/assets/web" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
cp -R dist/. "$APP_DIR/assets/web/"

# Generate the Android runner only in the build workspace. The Flutter source
# is versioned; platform boilerplate is created reproducibly by Flutter stable.
if [[ ! -d "$APP_DIR/android" ]]; then
  (cd "$APP_DIR" && flutter create --platforms=android --project-name melodiya_app --org com.melodiya --no-pub .)
fi

python3 - <<'PY'
from pathlib import Path
import re

manifest = Path('flutter_app/android/app/src/main/AndroidManifest.xml')
if not manifest.exists():
    raise SystemExit('Flutter Android manifest was not generated.')

text = manifest.read_text()
permissions = []
if 'android.permission.INTERNET' not in text:
    permissions.append('    <uses-permission android:name="android.permission.INTERNET" />')
if 'android.permission.WAKE_LOCK' not in text:
    permissions.append('    <uses-permission android:name="android.permission.WAKE_LOCK" />')
if permissions:
    text = text.replace('<application', '\n'.join(permissions) + '\n\n    <application', 1)

text = re.sub(r'android:label="[^"]*"', 'android:label="Melodiya"', text, count=1)
if 'android:usesCleartextTraffic=' not in text:
    text = text.replace(
        'android:name="${applicationName}"',
        'android:name="${applicationName}" android:usesCleartextTraffic="true"',
        1,
    )
manifest.write_text(text)

for name in ('build.gradle.kts', 'build.gradle'):
    gradle = Path('flutter_app/android/app') / name
    if not gradle.exists():
        continue
    value = gradle.read_text()
    value = value.replace('minSdk = flutter.minSdkVersion', 'minSdk = 24')
    value = value.replace('minSdkVersion flutter.minSdkVersion', 'minSdkVersion 24')
    gradle.write_text(value)
PY

echo "Android project prepared in $APP_DIR"
