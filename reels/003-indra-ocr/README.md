# 003 · Indra OCR: turn a folder of PDFs into an AI-ready knowledge base

From reel #3 on [@rithikgour.ai](https://instagram.com/rithikgour.ai). Comment **PDF** on the reel to get this link in your DMs.

[Indra OCR](https://www.datalab.to/blog/indra-ocr) (Datalab, Oct 13 2026) reads PDFs and scans with a ~1M-parameter recognition model on plain CPU. No GPU, no API key, nothing uploaded. `pdf_to_md.py` is 10 lines: it converts every PDF/scan in a folder to Markdown and stitches them into one `knowledge.md` you can paste into any LLM or index for RAG.

## Run it (about 5 minutes)

```bash
pip install indra-ocr                     # Python 3.10+, ~18 MB of models download on first run
python pdf_to_md.py samples/              # or your own folder
```

Output (tested on the two sample scans in `samples/`):

```
✓ invoice-4821.pdf -> markdown/invoice-4821.md
✓ meeting-notes.pdf -> markdown/meeting-notes.md

2 files -> samples/markdown/knowledge.md  (paste it into any LLM or index it for RAG)
```

## Other things to try

```bash
indra-ocr paper.pdf                    # markdown to stdout
indra-ocr *.pdf --out results/         # one .md per file, all cores
indra-ocr scan.png --format json       # lines, boxes, layout blocks, confidences
indra-ocr-viewer --port 8765           # see the boxes and reading order on each page
```

## Honest numbers and limits (from Datalab's post)

- Up to 49 pages/second on a 32-core CPU; about 230 ms per page on 4 vCPUs. Your laptop will sit in between.
- About 17x the throughput of Tesseract 5 on Datalab's 32-core benchmark (11.5x PaddleOCR's text models).
- Not for handwriting yet. Complex tables (merged cells, no ruling lines) can lose structure. Scans are read for Latin, Cyrillic, Greek, Devanagari, Bengali and Chinese; digital PDFs with a text layer work in any script.
- Licence: code Apache-2.0; model weights use a modified OpenRAIL-M licence (free for research, personal use and startups under $20M funding/revenue; read it before commercial use).

License for this script: MIT

## How the reel was made

[`reel/`](reel) is the real source. New in this one: `engine3d.js`, a deterministic three.js "studio world" (glossy reflective floor, soft key and coloured rim lights, fog, live Canvas2D panels, dust) that the camera flies through in one continuous take, with `overlay.js` drawing type and word-synced captions on top. Voice: Chatterbox TTS, best of two takes per line picked by Whisper. Cover: [`cover/`](cover), a three.js product shot.

Audio: `mix.py` lays a Mixkit trap bed ("Young Trizzy", Arulo) under the voice, offset to 41.6 s so the six scene cuts land on kicks (mean 40 ms, max 83 ms from a strong transient). Three tricks keep the music loud without burying the voice: a smoothed side-chain duck, a dynamic-EQ "voice pocket" that cuts the music's 300 Hz–3.5 kHz band by 9 dB only while someone is speaking, and an extra 7 dB dip under the CTA keyword. Whisper transcribes the music mix with the same word error rate as the dry voice. `NO_BGM=1 MIX_OUT=mix_nomusic.wav python mix.py` renders a voice + SFX version so you can add an Instagram sound in the app instead.

```bash
cd reel && npm install && npm run stills
```
