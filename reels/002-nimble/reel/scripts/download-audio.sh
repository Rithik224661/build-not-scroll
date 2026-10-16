#!/usr/bin/env bash
# Fetch the Mixkit music + sound effects used by mix.py into assets/audio/ (git-ignored).
# Mixkit's licence allows free use in your videos but not redistributing the raw files, so they are not in this repo.
set -euo pipefail
cd "$(dirname "$0")/.."
get() { mkdir -p "assets/audio/$(dirname "$1")"; [ -s "assets/audio/$1" ] || curl -fsSL "$2" -o "assets/audio/$1"; echo "ok  $1"; }
get bgm/house-vibez.mp3                  https://assets.mixkit.co/music/745/745.mp3
get sfx/impact/bass-hit-short.mp3        https://assets.mixkit.co/active_storage/sfx/2299/2299-preview.mp3
get sfx/impact/impact-zoom-quick.mp3     https://assets.mixkit.co/active_storage/sfx/772/772-preview.mp3
get sfx/transition/swoosh-quick.mp3      https://assets.mixkit.co/active_storage/sfx/166/166-preview.mp3
get sfx/transition/whoosh-fast.mp3       https://assets.mixkit.co/active_storage/sfx/1490/1490-preview.mp3
get sfx/transition/sweep-short.mp3       https://assets.mixkit.co/active_storage/sfx/175/175-preview.mp3
get sfx/transition/transition-tech-slide.mp3 https://assets.mixkit.co/active_storage/sfx/3120/3120-preview.mp3
get sfx/ui/hitech-touch-magnet.mp3       https://assets.mixkit.co/active_storage/sfx/3171/3171-preview.mp3
get sfx/ui/pop-electric.mp3              https://assets.mixkit.co/active_storage/sfx/2365/2365-preview.mp3
get sfx/ui/switch-click-quick.mp3        https://assets.mixkit.co/active_storage/sfx/2582/2582-preview.mp3
get sfx/ui/switch-light.mp3              https://assets.mixkit.co/active_storage/sfx/2579/2579-preview.mp3
get sfx/ui/switch-tap.mp3                https://assets.mixkit.co/active_storage/sfx/2585/2585-preview.mp3
get sfx/ui/ui-select-click.mp3           https://assets.mixkit.co/active_storage/sfx/1109/1109-preview.mp3
