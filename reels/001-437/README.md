# Reel 001 · "437"

The launch reel. 40 seconds, 1080×1920, 30 fps, 1,202 frames, 16 voice lines.

Every frame is drawn by three.js in headless Chrome. The voice is local Kokoro TTS
(`af_heart`), and the score and sound design are synthesised in Python. Nothing is
filmed, no AI image or video model is used, and no licensed audio is included.

[← back to all reels](../../README.md)

## Requirements

- Node.js 22.12 or newer (Puppeteer 25 needs it)
- For the voice and the mix: Python 3.10 to 3.13
- For the final encode: `ffmpeg` on your PATH
- A network connection for `npm install`: Puppeteer downloads its own Chrome

> **Windows:** the npm scripts call `python3`. If that opens the Microsoft Store, run
> `python tts.py` / `python mix.py` directly instead. `scripts/download-models.sh` needs
> Git Bash or WSL.

## First frame (no Python, no model)

```bash
npm install
npm run stills
```

That writes 16 PNGs to `stills/`, one at the midpoint of each voice line. Add
`-- --at 0,12.5` to also grab specific times in seconds (`stills/t0.00.png`, ...).

This works before you download anything else because **`timeline.json` is committed on
purpose**. It holds the voice timings and the per-frame mouth envelope that `tts.py`
would generate, so the renderer has everything it needs. Run `npm run voice` later and
it gets overwritten with your own timings.

## The full pipeline

```bash
pip install -r requirements.txt
./scripts/download-models.sh   # kokoro-v1.0.onnx + voices-v1.0.bin -> assets/
npm run voice                  # tts.py: audio/lines/*.wav, audio/voice.wav, timeline.json
npm run stills                 # check the look before the long render
npm run render                 # frames/f00000.png ... f01201.png (resumable)
npm run mix                    # mix.py: score + SFX + voice -> audio/mix.wav
npm run encode                 # ffmpeg -> out/reel.mp4
```

| Script | Runs | Output |
| --- | --- | --- |
| `npm run voice` | `python3 tts.py` | `audio/lines/<id>.wav`, `audio/voice.wav`, `timeline.json` |
| `npm run stills` | `node render.mjs --stills` | `stills/<line id>.png` |
| `npm run render` | `node render.mjs` | `frames/f%05d.png`, skips frames already on disk |
| `npm run render:fresh` | `node render.mjs --fresh` | deletes `frames/` first |
| `npm run mix` | `python3 mix.py` | `audio/mix.wav` (48 kHz stereo) |
| `npm run encode` | `ffmpeg ...` | `out/reel.mp4` (H.264 + AAC, loudness-normalised to -14 LUFS) |

`render.mjs` also takes a few flags (pass them after `--`, e.g. `npm run render -- --scale 0.5`):

| Flag | What it does |
| --- | --- |
| `--scale 0.5` | renders the 3D at half resolution (the 2D overlay stays 1080×1920). Good for drafts. |
| `--from 300 --to 400` | render only that frame range |
| `--bench` | time 10 frames and print ms/frame |
| `--q "&cover"` | the cover layout (`drawCover` in `main.js`) instead of the normal overlay |
| `--q "&physical"` | clear-coated physical materials on the bot |

## What's in each file

| File | What it is |
| --- | --- |
| `script.json` | the 16 lines: spoken text, on-screen caption, highlighted words, pause before each line |
| `tts.py` | runs Kokoro per line, cleans it up (trim, fades, high-pass, light compression), resamples to 48 kHz, writes `timeline.json` |
| `timeline.json` | line start/end times plus one mouth-openness value per frame. Everything else is timed from this. |
| `scene.js` | the 3D world: Byte the bot and his face, the feed wall, the clickbait storm, holo panels, the wireframe reveal, the lighting moods |
| `main.js` | camera moves, post-processing, the counter, the rule slams, captions, the CTA cards, and `window.renderFrame(t)` |
| `render.mjs` | serves this folder locally, opens it in headless Chrome via Puppeteer and saves `renderFrame(t)` as PNGs |
| `mix.py` | music and sound design, synthesised from scratch and keyed to the same story clock as the picture, then ducked under the voice |
| `index.html` | the page the renderer loads: fonts, import map, one 1080×1920 canvas |
| `profile.html` | the Instagram profile picture, drawn on a 2D canvas. Open it with `?mood=wink` or `?mood=open`. |
| `fonts/` | Inter, JetBrains Mono, Space Grotesk (SIL OFL 1.1, see `fonts/OFL.txt`) |
| `scripts/download-models.sh` | fetches the Kokoro model files into `assets/`. Skips files you already have. |

## Make it yours

### Change the words

Edit `script.json`. Each line looks like this:

```json
{ "id": "L02", "text": "Things you actually built?", "pre": 0.3, "hl": ["built?"] }
```

`text` is what the voice says, `caption` (optional) is what's shown if it should differ,
`hl` are the caption words that light up, `pre` is the pause before the line. Then run
voice → stills → render → mix → encode. The story beats (`T` in `scene.js`, mirrored in
`mix.py`) are computed from line start/end times, so camera moves, slams and sound cues
move with your new timing. Some beats are tied to specific line ids (`L03` is the crash
to zero, `L13` is the code reveal), so if you add or remove lines, check the `T` table.

### Use your own voice

1. Record each line from `script.json` as `audio/lines/<id>.wav` (`L01.wav` ... `L16.wav`),
   48 kHz, mono.
2. In `tts.py`, remove the `Kokoro(...)` setup and replace the body of the loop down to the
   `sf.write` so it loads your file instead of calling the model:

   ```python
   x, sr = sf.read(ROOT / f"audio/lines/{ln['id']}.wav", dtype="float32")
   assert sr == SR and x.ndim == 1, "expected 48 kHz mono"
   x = edges(x, SR)  # optional: same trim + fades as the TTS path
   ```

   Keep everything after that (`t += ln.get("pre", 0.3)` onward) as is. Don't call
   `sf.write` on your recordings, or you'll overwrite them.
3. Run `npm run voice` and continue as usual. The mouth envelope and every visual cue
   are rebuilt from your delivery.

### Change the palette

- **3D lighting:** the `MOODS` table near the top of `buildWorld` in `scene.js`. Each mood
  sets the sky gradient, glow, key and rim lights, dust and floor-grid strength.
  `moodKeys` right below it says which mood is active when.
- **2D overlay:** `MINT`, `AMBER`, `RED`, `INK` near the top of the overlay section in `main.js`.
- **Post FX:** bloom strength in `renderFrame`, grain/vignette/chromatic aberration in the
  `finish` shader uniforms.

### Change Byte's expressions

`drawFace(t, mood, talk, wink, look)` in `scene.js` draws the face on a 768×576 canvas.
Each mood (`tired`, `sad`, `shock`, `angry`, `happy`, `focus`, `sly`, `code`, `neutral`)
is a branch for the eyes and another for the mouth. Which mood plays when is decided in
the `// face mood` block inside `update(t)`.

## The one rule

`renderFrame(t)` may depend only on `t` and constants. No `Math.random`, no
`Date.now`, no `performance.now`. Randomness comes from `hash()` and `noise1()` in
`scene.js`, which are pure functions. That's why stills match the final render, why the
render can resume after a crash, and why sound and picture stay locked: `mix.py` derives
its cues from the same timeline with the same formulas (and a fixed noise seed).

## Known limits

- **The full render is slow on a CPU.** On a CPU-only machine all 1,202 frames took about
  80 minutes (~4 s/frame). `render.mjs` launches Chrome with SwiftShader
  (`--use-angle=swiftshader`), which renders WebGL in software so the output is the same
  on every machine. Your GPU only helps if you remove that flag, and then pixels may
  differ slightly between machines. `--scale 0.5` is the quick way to draft.
- **Lip movement follows loudness, not phonemes.** `tts.py` stores one RMS value per
  frame and the mouth opens with it. It reads as talking, but it won't shape an "o" or an "m".
- **The voice is a small local model.** It's free and runs offline, but it sounds like
  what it is. Record your own (above) if that matters.
- **Captions are timed by word length**, not by forced alignment, so long words can
  drift a little from the audio.
