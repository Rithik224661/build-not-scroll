"""Narration for reel 002: Chatterbox TTS (MIT, Resemble AI), CPU.

Why Chatterbox over Kokoro (measured on the hook passage, see voicelab/eval_takes.py):
  pitch range 15.2 semitones vs 9.3 (Kokoro af_heart) -> far less monotone; same intelligibility.

Pipeline:
  1. One passage per scene (lines inside a scene are generated together, so joins are natural prosody,
     not stitched clips).
  2. Several candidates per passage (seeds / respellings). Each is transcribed with faster-whisper small.en
     and scored against the caption text. Lowest word error wins; ties go to the pace closest to 3.5 words/s.
  3. 24 kHz -> 48 kHz, silence trimmed to a 60 ms margin, 12 ms fades, fixed gaps between scenes.
  4. Word timestamps from Whisper are aligned to the caption words -> timeline.json for the renderer.

Run:  python tts.py   (Python 3.11 venv with requirements.txt installed)
Candidates are cached in audio/cand/, so re-runs only synthesise what changed.
"""
import json, re, pathlib, difflib, hashlib, time
import numpy as np, soundfile as sf
from scipy.signal import resample_poly

ROOT = pathlib.Path(__file__).parent
CAND = ROOT / "audio" / "cand"; CAND.mkdir(parents=True, exist_ok=True)
SCRIPT = json.loads((ROOT / "script.json").read_text())
LINES = {l["id"]: l for l in SCRIPT["lines"]}
FPS, SR = 30, 48000
EXAG, CFG = 0.55, 0.5

# passage -> line ids.  V11 is its own passage so the sign-off gets a breath before it.
PASSAGES = [("p1", ["V01"]), ("p2", ["V02"]), ("p3", ["V03"]), ("p4", ["V04"]), ("p5", ["V05", "V06"]), ("p6", ["V07"]), ("p7", ["V08"])]
GAP_BEFORE = {"p1": 0.2, "p2": 0.32, "p3": 0.3, "p4": 0.32, "p5": 0.32, "p6": 0.3, "p7": 0.36}
# extra pause after a line, inside a passage, so the picture can finish an action before the next line
# (V06 -> the command finishes typing before "It answers yes or no"). Inserted at the middle of the natural gap.
HOLD_AFTER = {"V05": 0.25}
TAIL = 1.6                      # brand card holds after the last word (rule: hold >= 1 s)
# pronunciation fixes, tried as extra candidates (Chatterbox said "Neta" for "Meta" in the A/B)
RESPELL = []   # "Metta" respelling not needed: seed 7 says "Meta" cleanly (A/B log)
SEEDS = [7, 11]

ALIAS = {"indra": "indra", "indro": "indra", "tesseracts": "tesseract", "pdfs": "pdfs", "md": "markdown"}
def toks(s):
    out = []
    for w in re.sub(r"[^a-z0-9' -]", " ", s.lower()).replace("-", " ").split():
        w = w.strip("'"); out.append(ALIAS.get(w, w))
    return [w for w in out if w]

# ---------------------------------------------------------------- engines
_tts = _asr = None
def tts():
    global _tts
    if _tts is None:
        from chatterbox.tts import ChatterboxTTS
        _tts = ChatterboxTTS.from_pretrained(device="cpu")
    return _tts
def asr():
    global _asr
    if _asr is None:
        from faster_whisper import WhisperModel
        _asr = WhisperModel("small.en", device="cpu", compute_type="int8", cpu_threads=2)
    return _asr

def synth(text, seed):
    key = hashlib.sha1(f"{text}|{seed}|{EXAG}|{CFG}".encode()).hexdigest()[:12]
    p = CAND / f"{key}.wav"
    if not p.exists():
        import torch
        torch.manual_seed(seed)
        t0 = time.time()
        w = tts().generate(text, exaggeration=EXAG, cfg_weight=CFG)
        sf.write(p, w.squeeze(0).numpy().astype(np.float32), tts().sr)
        print(f"  synth {key} seed={seed} {time.time() - t0:.0f}s", flush=True)
    x, sr = sf.read(p, dtype="float32")
    return resample_poly(x, SR, sr).astype(np.float32), p.name

def trim(x, thr_db=-45, margin=0.12):
    env = np.convolve(np.abs(x), np.ones(480) / 480, mode="same")
    idx = np.where(env > 10 ** (thr_db / 20))[0]
    a, b = max(0, idx[0] - int(margin * SR)), min(len(x), idx[-1] + int(margin * SR))
    y = x[a:b].copy(); f = int(0.012 * SR)
    y[:f] *= np.linspace(0, 1, f); y[-f:] *= np.linspace(1, 0, f)
    return y

def transcribe(x):
    x16 = resample_poly(x, 16000, SR).astype(np.float32)
    segs, _ = asr().transcribe(x16, beam_size=5, language="en", word_timestamps=True)
    return [(w.word.strip(), w.start, w.end, w.probability) for s in segs for w in s.words]

def wer(ref, hyp):
    d = list(range(len(hyp) + 1))
    for i in range(1, len(ref) + 1):
        prev, d[0] = d[0], i
        for j in range(1, len(hyp) + 1):
            prev, d[j] = d[j], min(d[j] + 1, d[j - 1] + 1, prev + (ref[i - 1] != hyp[j - 1]))
    return d[-1] / max(len(ref), 1)

# ---------------------------------------------------------------- caption-word timing
def align(ids, words):
    """Map every caption word of the given lines to a start time, using Whisper's word timestamps."""
    cap = []                                    # (line_id, caption_word, [subtokens])
    for lid in ids:
        for cw in LINES[lid]["caption"].split():
            cap.append((lid, cw, toks(cw) or [cw.lower()]))
    ref = [(i, t) for i, (_, _, st) in enumerate(cap) for t in st]
    hyp = [(j, t) for j, (w, *_) in enumerate(words) for t in (toks(w) or [w.lower()])]
    sm = difflib.SequenceMatcher(a=[t for _, t in ref], b=[t for _, t in hyp], autojunk=False)
    t_of = {}
    for blk in sm.get_matching_blocks():
        for k in range(blk.size):
            ci, hj = ref[blk.a + k][0], hyp[blk.b + k][0]
            t_of.setdefault(ci, (words[hj][1], words[hj][2]))
    # interpolate unmatched words between matched neighbours, by character length
    n = len(cap); starts = [None] * n; ends = [None] * n
    for i, v in t_of.items(): starts[i], ends[i] = v
    if starts[0] is None: starts[0] = words[0][1]
    if starts[-1] is None: starts[-1] = words[-1][1]; ends[-1] = words[-1][2]
    i = 0
    while i < n:
        if starts[i] is None:
            j = i
            while starts[j] is None: j += 1
            a, b = starts[i - 1], starts[j]; L = [len(cap[k][1]) for k in range(i - 1, j)]; c = np.cumsum(L)
            for k in range(i, j): starts[k] = a + (b - a) * c[k - i] / c[-1]
            i = j
        i += 1
    out = {}
    for k, (lid, cw, _) in enumerate(cap):
        out.setdefault(lid, []).append({"w": cw, "t": round(float(starts[k]), 3), "e": None if ends[k] is None else round(float(ends[k]), 3)})
    return out

# ---------------------------------------------------------------- main
def main():
    report, pieces, timeline_lines, cursor = [], [], [], 0.0
    for pid, ids in PASSAGES:
        text = " ".join(LINES[i]["text"] for i in ids)
        ref = toks(" ".join(LINES[i]["caption"] for i in ids))
        variants = [text] + [text.replace(a, b) for a, b in RESPELL if a in text]
        best = None
        for v in variants:
            for seed in SEEDS:
                x, name = synth(v, seed); x = trim(x)
                words = transcribe(x)
                hyp = toks(" ".join(w[0] for w in words))
                e = wer(ref, hyp); wps = len(ref) / (len(x) / SR)
                peak = float(np.abs(x).max())
                score = (round(e, 3), abs(wps - 3.5))
                report.append({"passage": pid, "cand": name, "variant": v != text, "seed": seed, "wer": round(e, 3),
                               "wps": round(wps, 2), "dur": round(len(x) / SR, 2), "peak": round(peak, 3),
                               "heard": " ".join(w[0] for w in words)})
                print(json.dumps(report[-1]), flush=True)
                if best is None or score < best[0]: best = (score, x, words, name)
        _, x, words, name = best
        tw = align(ids, words)
        for k, lid in enumerate(ids[:-1]):
            if lid not in HOLD_AFTER: continue
            nxt = ids[k + 1]
            end_l = max((w["e"] or w["t"]) for w in tw[lid]); cut = (end_l + tw[nxt][0]["t"]) / 2
            ins = HOLD_AFTER[lid]; ci = int(round(cut * SR))
            x = np.concatenate([x[:ci], np.zeros(int(round(ins * SR)), np.float32), x[ci:]])
            for later in ids[k + 1:]:
                for w in tw[later]:
                    w["t"] += ins
                    if w["e"] is not None: w["e"] += ins
        cursor += GAP_BEFORE[pid]
        pieces.append((cursor, x))
        for lid in ids:
            ws = [{"w": w["w"], "t": round(w["t"] + cursor, 3)} for w in tw[lid]]
            last = [w for w in tw[lid] if w["e"] is not None]
            end = (last[-1]["e"] if last else tw[lid][-1]["t"] + 0.3) + cursor
            l = LINES[lid]
            timeline_lines.append({"id": lid, "scene": l["scene"], "start": ws[0]["t"], "end": round(end, 3),
                                   "caption": l["caption"], "hl": l["hl"], "words": ws})
        report.append({"passage": pid, "chosen": name})
        cursor += len(x) / SR

    dur = cursor + TAIL
    voice = np.zeros(int(round(dur * SR)) + SR, np.float32)
    for off, x in pieces:
        a = int(round(off * SR)); voice[a:a + len(x)] += x
    frames = int(round(dur * FPS)); voice = voice[: int(round(frames / FPS * SR))]
    (ROOT / "audio").mkdir(exist_ok=True)
    sf.write(ROOT / "audio" / "voice.wav", voice, SR, subtype="PCM_24")
    tl = {"fps": FPS, "duration": round(frames / FPS, 4), "frames": frames, "lines": timeline_lines}
    (ROOT / "timeline.json").write_text(json.dumps(tl, indent=1))
    (ROOT / "qa").mkdir(exist_ok=True)
    (ROOT / "qa" / "tts_report.json").write_text(json.dumps(report, indent=1))
    print("TTS_DONE duration", tl["duration"], "frames", frames)

if __name__ == "__main__":
    main()
