# 002 · nimble: sort an inbox with a local AI model

From reel #2 on [@rithikgour.ai](https://instagram.com/rithikgour.ai). Comment **SORT** on the reel to get this link in your DMs.

`sort.py` is 20 lines of Python. It sends every `.txt` email in a folder to **nimble**, the decision model that ships with Ollama v0.40.4, and asks which team should handle it. nimble returns a label and a confidence score. No API key, no bill, and the email text never leaves your machine.

## Run it (about 10 minutes, most of it the download)

```bash
# 1. Install Ollama (macOS / Linux). Windows: irm https://ollama.com/install.ps1 | iex
curl -fsSL https://ollama.com/install.sh | sh

# 2. Pull the model (9B parameters, about 9.5 GB, Apache 2.0)
ollama pull nimble

# 3. Try one question by hand
ollama run nimble --ask "Is a refund being requested?" < inbox/refund-4821.txt

# 4. Sort the whole folder
python sort.py inbox/          # print a table
python sort.py inbox/ --move   # also file each email into inbox/<team>/
```

Example output (your percentages will differ):

```
login-error.txt              technical  88%
partnership.txt              sales      76%
refund-4821.txt              billing    91%
```

## Change it

- Edit `TEAMS` to use your own labels. The description after each label tells the model what it means.
- Ask a yes/no question instead: drop the `--choice` flags. The JSON answer then has `"type": "noul"` and a `noul` probability for "yes".
- Ask several questions in one call: repeat `--ask`. nimble handles up to 64 questions per call.

## Good to know

- Hardware: a 9B model needs a reasonably recent machine. 16 GB of RAM is a safe target; it is fastest on Apple Silicon.
- Prompt context is 8,192 tokens, so very long emails should be trimmed first.
- Python 3.8+ with the standard library only. No pip installs.

## Sources

- Ollama v0.40.4 source: `cmd/cmd.go` (the `--ask` / `--choice` / `--level` examples) and `cmd/decide.go` (output format)
- nimble model page on ollama.com

## How the reel itself was made

Everything in [`reel/`](reel) is the actual source of the reel: no camera, no video editor, no AI video model.

- **Picture:** `main.js` draws every frame with Canvas 2D. `render.mjs` calls `window.renderFrame(t)` in headless Chrome 1,072 times and saves PNGs. Same `t`, same pixels, give or take a rounding step on a few blurred shadow edges (on a CPU it takes about 1 s per frame, so ~18 minutes for the whole reel).
- **Voice:** `tts.py` runs [Chatterbox](https://github.com/resemble-ai/chatterbox) locally, one passage per scene, two takes each. Whisper transcribes every take and the one that matches the script best wins. Whisper's word timestamps drive the captions and every animation cue.
- **Sound:** `node render.mjs --events` writes the SFX cue sheet from the same clock as the picture (scene cuts snap to the music beats in `beats.json`); `mix.py` lays Mixkit foley and music under the voice and normalises to -14 LUFS.

```bash
cd reel && npm install
npm run stills                 # one PNG per voice line, uses the timeline.json in this folder
# full pipeline: Python 3.11 + ffmpeg
pip install -r requirements.txt && ./scripts/download-audio.sh
npm run voice && npm run cues && npm run render && npm run mix && npm run encode
```

The voice is AI (Chatterbox embeds an inaudible watermark in its output), so the reel carries Instagram's AI label.

License: MIT
