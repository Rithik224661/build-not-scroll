# 003 · Hinglish version

Same 3D world and cuts as `../reel`, re-timed to a Hinglish voiceover. The renderer reads everything language-specific from `timeline.json`: named word anchors, on-screen strings, caption rules. The English reel renders pixel-identically with the same `main.js` / `overlay.js`.

- `script.json`: per line, `text` (Devanagari TTS input; numbers spoken in Hindi), `caption` (Roman Hinglish on screen), `say` (one phonetic romanisation per caption token, used for forced alignment), `anchors` (which word triggers each visual beat), plus localised `strings`, Hindi `weak` / `noStart` words and manual caption `breaks`.
- `tts_hi.py`: two engines, scored the same way.
  - Engines: F5-TTS Hindi (SPRINGLab, IIT Madras, CC-BY-4.0) re-voiced with Chatterbox VC; Chatterbox Multilingual with the cloned channel voice.
  - Scoring: romanised CER from Whisper small (hi), plus MMS forced-alignment confidence.
  - Picks the best take per line, pitch-matches the lines, then aligns captions to the audio with MMS_FA.
- `gemini_tts.py`: optional upgrade using Gemini TTS (free tier key), with one voice for every line.
- Captions: `chunker: "dp"` uses optimal line breaking. Lines end at sentence or clause boundaries, never on a weak word, never open on an auxiliary, and never split a number from its unit.
- Music: Mixkit "Young Trizzy" (Arulo). `beats.json` comes from the track itself, so every cut lands on its beats.

Credits: F5-Hindi model by SPRING Lab, IIT Madras (CC-BY-4.0). Chatterbox by Resemble AI (MIT). MMS forced aligner by Meta (CC-BY-NC 4.0 weights; used here only for timing, not distributed).
