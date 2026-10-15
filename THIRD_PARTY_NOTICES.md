# Third-party notices

The code in this repository is MIT licensed (see [LICENSE](LICENSE)). It ships with,
or downloads, the following third-party work under its own license.

## Included in this repo

| What | Where | License |
| --- | --- | --- |
| Inter (weights 600, 800) | `reels/*/fonts/Inter-*.woff2` | SIL Open Font License 1.1 |
| JetBrains Mono (weight 700) | `reels/*/fonts/JetBrainsMono-700.woff2` | SIL Open Font License 1.1 |
| Space Grotesk (weight 700) | `reels/*/fonts/SpaceGrotesk-700.woff2` | SIL Open Font License 1.1 |

Copyright lines and the full OFL text: [reels/001-437/fonts/OFL.txt](reels/001-437/fonts/OFL.txt).

## Installed by npm (not stored here)

| Package | License | Project |
| --- | --- | --- |
| three.js | MIT | https://github.com/mrdoob/three.js |
| Puppeteer | Apache-2.0 | https://github.com/puppeteer/puppeteer |

Puppeteer also downloads a Chrome for Testing build on install, which carries its own terms.

## Installed by pip (not stored here)

`kokoro-onnx`, `soundfile`, `scipy`, `numpy`, each under its own open-source license.

## Downloaded at setup (not redistributed)

| File | License | Source |
| --- | --- | --- |
| `kokoro-v1.0.onnx`, `voices-v1.0.bin` (Kokoro-82M TTS model + voices) | Apache-2.0 | https://github.com/thewh1teagle/kokoro-onnx/releases/tag/model-files-v1.0 |

`scripts/download-models.sh` fetches these into `assets/`, which is git-ignored. This repo
never contains the model weights or any generated audio.

## Not used

No samples, stock footage, licensed music or AI image/video models. Every sound is
synthesised in `mix.py`; every frame is drawn by `scene.js` and `main.js`.
