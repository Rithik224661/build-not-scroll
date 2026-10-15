#!/usr/bin/env bash
# Downloads the Kokoro TTS model + voices into assets/.
# They are not stored in this repo: they're Apache-2.0 files hosted by kokoro-onnx.
set -euo pipefail

BASE="https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/assets"
mkdir -p "$DIR"

for f in kokoro-v1.0.onnx voices-v1.0.bin; do
  if [ -s "$DIR/$f" ]; then
    echo "skip  $f (already in assets/)"
  else
    echo "fetch $f"
    curl -fL --retry 3 -o "$DIR/$f.part" "$BASE/$f"
    mv "$DIR/$f.part" "$DIR/$f"
  fi
done
echo "models ready in assets/"
