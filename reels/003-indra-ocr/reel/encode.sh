#!/usr/bin/env bash
# One file for upload and chat: flat motion graphics stay ~10 MB at CRF 12.
set -euo pipefail; cd "$(dirname "$0")"; mkdir -p out
ffmpeg -y -v error -framerate 30 -i frames/f%05d.png -i audio/mix.wav -c:v libx264 -preset slow -crf 12 -maxrate 25M -bufsize 50M \
  -x264-params aq-mode=3:deblock=-1,-1 -pix_fmt yuv420p -colorspace bt709 -color_primaries bt709 -color_trc bt709 \
  -c:a aac -b:a 256k -ar 48000 -shortest -movflags +faststart out/rithikgour_reel03.mp4
ls -la out/*.mp4
