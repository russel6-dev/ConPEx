#!/usr/bin/env bash
# Buat ZIP extension untuk dibagikan (Load unpacked) atau diunggah ke Chrome Web Store.
set -euo pipefail
cd "$(dirname "$0")/.."
VER=$(python3 -c "import json;print(json.load(open('extension/manifest.json'))['version'])")
mkdir -p dist
OUT="dist/ConPEx-v${VER}.zip"
rm -f "$OUT"
(cd extension && zip -qr -X "../$OUT" . -x '.*')
echo "$OUT ($(du -h "$OUT" | cut -f1))"
