"""Hinglish narration for reel 003 (Hindi version).

Engine choice (A/B on the hook + CTA lines, logged in /home/claude/voicelab/hi):
  * Chatterbox Multilingual (hi), default voice: garbled the CTA ("come in karo PDF").
  * Chatterbox Multilingual, cloned channel voice: English terms fine, Hindi aspirates lost ("wo pi" for "wo bhi").
  * F5-TTS Hindi (SPRINGLab, IIT Madras, CC-BY-4.0, trained on IndicTTS + IndicVoices-R): native Hindi
    pronunciation, but flat (2.1 st pitch s.d.) and a different speaker.
  -> F5-Hindi for the delivery, then Chatterbox VC to the channel voice: keeps F5's pronunciation (same Whisper
     confidence) and lifts pitch movement to 6.0 st, close to the English reels' 5.1 st.

Pipeline per passage: F5 takes (seeds x speed) -> Whisper small (hi) CER vs the Devanagari text -> best take ->
Chatterbox VC -> 48 kHz, trimmed -> MMS forced alignment of the romanised `say` tokens -> word times mapped onto
the Roman caption tokens -> timeline.json (+ anchors, on-screen strings, weak words for caption breaking).

Run:  PYTHONPATH=<stubs> /home/claude/voicelab/.venv/bin/python tts_hi.py [synth|assemble|all]
Takes are cached in audio/cand/, so re-runs only synthesise what changed.
"""
import json, re, sys, pathlib, hashlib, unicodedata, time
import numpy as np, soundfile as sf
from scipy.signal import resample_poly

ROOT = pathlib.Path(__file__).parent
CAND = ROOT / "audio" / "cand"; CAND.mkdir(parents=True, exist_ok=True)
SCRIPT = json.loads((ROOT / "script.json").read_text())
LINES = {l["id"]: l for l in SCRIPT["lines"]}
FPS, SR = 30, 48000
PASSAGES = [("p1", ["V01"]), ("p2", ["V02"]), ("p3", ["V03"]), ("p4", ["V04"]), ("p5", ["V05", "V06"]), ("p6", ["V07"]), ("p7", ["V08"])]
GAP_BEFORE = {"p1": 0.2, "p2": 0.32, "p3": 0.3, "p4": 0.32, "p5": 0.32, "p6": 0.3, "p7": 0.36}
HOLD_AFTER = {"V05": 0.25}
TAIL = 1.6
TAKES = [(7, 1.12), (11, 1.12), (7, 1.0)]        # (seed, F5 speed); scored AFTER voice conversion
VC_TARGET = pathlib.Path("/home/claude/voicelab/hi/ref_en.wav")   # 11 s of the channel voice (English reels)
F5_REF_TEXT = "इस बागीचे में, आप शुरू से अन्त तक घूम आइये, तो दुनिया भर की सुन्दर चीज़ों के साथ, एक अनन्यता महसूस करेंगें"

def norm_hi(s):
    s = unicodedata.normalize("NFC", s).replace("़", "").replace("ँ", "ं")   # nukta, chandrabindu
    return re.sub(r"[^ऀ-ॿ]", "", s)

def cer(a, b):
    d = list(range(len(b) + 1))
    for i, x in enumerate(a, 1):
        p = d[:]; d[0] = i
        for j, y in enumerate(b, 1): d[j] = min(p[j] + 1, d[j - 1] + 1, p[j - 1] + (x != y))
    return d[-1] / max(1, len(a))

# ---------------------------------------------------------------- engines (lazy)
_f5 = _vc = _asr = None
def f5():
    global _f5
    if _f5 is None:
        import torch; torch.set_num_threads(2)
        from huggingface_hub import hf_hub_download
        from f5_tts.infer.utils_infer import load_vocoder, load_model, preprocess_ref_audio_text
        from f5_tts.model import DiT
        ck = hf_hub_download("SPRINGLab/F5-Hindi-24KHz", "model_2500000.safetensors")
        vocab = hf_hub_download("SPRINGLab/F5-Hindi-24KHz", "vocab.txt")
        ref = hf_hub_download("SPRINGLab/F5-Hindi-24KHz", "samples/output2.wav")
        cfg = dict(dim=768, depth=18, heads=12, ff_mult=2, text_dim=512, conv_layers=4, text_mask_padding=False, pe_attn_head=1)
        model = load_model(DiT, cfg, ck, vocab_file=vocab)
        ra, rt = preprocess_ref_audio_text(ref, F5_REF_TEXT, show_info=lambda *a: None)
        _f5 = (model, load_vocoder("vocos"), ra, rt)
    return _f5
def vc():
    global _vc
    if _vc is None:
        from chatterbox.vc import ChatterboxVC
        _vc = ChatterboxVC.from_pretrained("cpu")
    return _vc
def asr():
    global _asr
    if _asr is None:
        from faster_whisper import WhisperModel
        _asr = WhisperModel("small", device="cpu", compute_type="int8", cpu_threads=2)
    return _asr

def transcribe(x24):
    y = resample_poly(x24, 2, 3).astype(np.float32)          # 24 k -> 16 k
    segs, _ = asr().transcribe(y, language="hi", beam_size=5)
    segs = list(segs)
    return " ".join(s.text.strip() for s in segs), float(np.mean([s.avg_logprob for s in segs])) if segs else -9

def trim(x, sr, margin=0.06, thr_db=-45):
    e = np.sqrt(np.convolve(x ** 2, np.ones(int(0.01 * sr)) / int(0.01 * sr), mode="same"))
    on = np.where(e > 10 ** (thr_db / 20))[0]
    if not len(on): return x
    a, b = max(0, on[0] - int(margin * sr)), min(len(x), on[-1] + int(margin * sr))
    y = x[a:b].copy(); f = int(0.012 * sr); y[:f] *= np.linspace(0, 1, f); y[-f:] *= np.linspace(1, 0, f)
    return y

# ---------------------------------------------------------------- stage 1: synthesise candidates, score, pick
# Two engines, both ending in the channel voice:  F5-Hindi -> Chatterbox VC,  and Chatterbox Multilingual cloned.
# Scoring is script-fair: Whisper (hi) output and the Devanagari reference are both romanised (uroman; Latin words
# Whisper writes for English terms are mapped to how they are said), then CER on letters. Plus the MMS forced-
# alignment confidence of the intended `say` romanisation. Pick = lowest (CER - 0.5 * alignment confidence).
CB_SEEDS = [7, 11]
LATIN = {"ocr": "o si ar", "pdf": "pi di ef", "pdfs": "pi di efs", "ai": "e ai", "gpu": "ji pi yu", "mb": "em bi"}
_cb = _ur = None
def cb():
    global _cb
    if _cb is None:
        from chatterbox.mtl_tts import ChatterboxMultilingualTTS
        _cb = ChatterboxMultilingualTTS.from_pretrained(device="cpu")
    return _cb
def roman(s):
    global _ur
    if _ur is None:
        import uroman; _ur = uroman.Uroman()
    out = []
    for w in s.split():
        lw = re.sub(r"[^a-z]", "", w.lower())
        out.append(LATIN.get(lw, lw) if lw else _ur.romanize_string(w))
    t = re.sub(r"[^a-z]", "", " ".join(out).lower())
    return re.sub(r"(.)\1+", r"\1", t)                      # collapse long vowels / doubled letters

def mms_conf(x24, ids):
    import torch, torchaudio
    global _mms
    b = torchaudio.pipelines.MMS_FA
    if "_mms" not in globals(): _mms = (b.get_model(with_star=False), b.get_tokenizer(), b.get_aligner())
    model, tok, aligner = _mms
    words = [re.sub(r"[^a-z]", "", s) for lid in ids for t in LINES[lid]["say"].split() for s in t.split("_")]
    wav = torch.from_numpy(resample_poly(x24, 2, 3).astype(np.float32))[None]
    with torch.inference_mode():
        em, _ = model(wav); spans = aligner(em[0], tok([w for w in words if w]))
    return float(np.mean([s.score for ws in spans for s in ws]))

def synth(mode="all"):
    report = []
    for pid, ids in PASSAGES:
        text = " ".join(LINES[i]["text"] for i in ids)
        h = hashlib.md5(text.encode()).hexdigest()[:8]
        cands = []
        for seed, speed in TAKES:                                  # F5-Hindi -> VC
            p = CAND / f"{pid}_{h}_s{seed}_v{speed}.wav"
            if not p.exists() and mode in ("f5", "all"):
                import torch
                from f5_tts.infer.utils_infer import infer_process
                model, voc, ra, rt = f5(); torch.manual_seed(seed); t0 = time.time()
                w, sr, _ = infer_process(ra, rt, text, model, voc, nfe_step=32, speed=speed, show_info=lambda *a: None)
                sf.write(p, np.asarray(w, np.float32), sr); print(f"synth {p.name} {time.time() - t0:.0f}s", flush=True)
            pv = p.with_name(p.stem + "_vc.wav")
            if not pv.exists() and p.exists() and mode in ("f5", "all"):
                w = vc().generate(str(p), target_voice_path=str(VC_TARGET)).squeeze(0).numpy(); sf.write(pv, w, vc().sr)
            if pv.exists(): cands.append(pv)
        for seed in CB_SEEDS:                                      # Chatterbox Multilingual, cloned channel voice
            p = CAND / f"{pid}_{h}_cb{seed}.wav"
            if not p.exists() and mode in ("cb", "all"):
                import torch; torch.manual_seed(seed); t0 = time.time()
                w = cb().generate(text, language_id="hi", audio_prompt_path=str(VC_TARGET), exaggeration=0.55, cfg_weight=0.5)
                sf.write(p, w.squeeze(0).numpy(), cb().sr); print(f"synth {p.name} {time.time() - t0:.0f}s", flush=True)
            if p.exists(): cands.append(p)
        if mode not in ("score", "all"): continue
        # score every candidate on disk for this passage: F5->VC takes, Chatterbox takes and Chatterbox->VC takes
        cands = sorted(c for c in CAND.glob(f"{pid}_{h}_*.wav") if "_final" not in c.name and (c.name.endswith("_vc.wav") or "_cb" in c.name))
        best = None; ref = roman(text)
        for p in cands:
            x, sr = sf.read(p, dtype="float32")
            heard, lp = transcribe(x)
            c = cer(ref, roman(heard)); conf = mms_conf(x, ids)
            score = c - 0.5 * conf
            r = {"passage": pid, "take": p.name, "rcer": round(c, 3), "align": round(conf, 3), "score": round(score, 3), "dur": round(len(x) / sr, 2), "heard": heard}
            print(json.dumps(r, ensure_ascii=False), flush=True); report.append(r)
            if best is None or score < best[0]: best = (score, p, r)
        import shutil; shutil.copyfile(best[1], CAND / f"{pid}_{h}_final.wav")
        report.append({"passage": pid, "chosen": best[1].name, "rcer": best[2]["rcer"], "align": best[2]["align"]})
        print(json.dumps(report[-1], ensure_ascii=False), flush=True)
    (ROOT / "qa").mkdir(exist_ok=True)
    (ROOT / "qa" / "tts_report.json").write_text(json.dumps(report, indent=1, ensure_ascii=False))

# ---------------------------------------------------------------- stage 2: align + assemble
def align_passage(x48, ids):
    """MMS forced alignment (torchaudio MMS_FA, romanised text) -> {line_id: [(start, end) per caption token]}"""
    import torch, torchaudio
    b = torchaudio.pipelines.MMS_FA
    global _mms
    if "_mms" not in globals(): _mms = (b.get_model(with_star=False), b.get_tokenizer(), b.get_aligner())
    model, tok, aligner = _mms
    wav = torch.from_numpy(resample_poly(x48, 1, 3).astype(np.float32))[None]
    flat, owner = [], []
    for lid in ids:
        for ci, t in enumerate(LINES[lid]["say"].split()):
            for sub in t.split("_"):
                sub = re.sub(r"[^a-z']", "", sub.lower())
                if sub: flat.append(sub); owner.append((lid, ci))
    with torch.inference_mode():
        em, _ = model(wav)
        spans = aligner(em[0], tok(flat))
    ratio = wav.size(1) / em.size(1) / 16000
    out = {lid: [None] * len(LINES[lid]["say"].split()) for lid in ids}
    for (lid, ci), sp in zip(owner, spans):
        s, e = sp[0].start * ratio, sp[-1].end * ratio
        cur = out[lid][ci]; out[lid][ci] = (s, e) if cur is None else (cur[0], e)
    return out

def assemble():
    cursor, pieces, timeline_lines = 0.0, [], []
    for pid, ids in PASSAGES:
        text = " ".join(LINES[i]["text"] for i in ids)
        h = hashlib.md5(text.encode()).hexdigest()[:8]
        x, sr = sf.read(CAND / f"{pid}_{h}_final.wav", dtype="float32")
        x = resample_poly(x, SR // 1000 * 1, sr // 1000).astype(np.float32) if sr != SR else x
        x = trim(x, SR)
        tw = align_passage(x, ids)
        # crop to the aligned speech: 60 ms before the first word, 120 ms after the last (kills trailing breaths/noise)
        a = max(0.0, tw[ids[0]][0][0] - 0.06); b = min(len(x) / SR, tw[ids[-1]][-1][1] + 0.12)
        x = x[int(a * SR):int(b * SR)].copy(); f = int(0.012 * SR); x[:f] *= np.linspace(0, 1, f); x[-f:] *= np.linspace(1, 0, f)
        tw = {lid: [(s0 - a, e0 - a) for s0, e0 in v] for lid, v in tw.items()}
        for k, lid in enumerate(ids[:-1]):                       # hold after a line inside a passage
            if lid not in HOLD_AFTER: continue
            nxt = ids[k + 1]; cut = (tw[lid][-1][1] + tw[nxt][0][0]) / 2; ins = HOLD_AFTER[lid]; ci = int(round(cut * SR))
            x = np.concatenate([x[:ci], np.zeros(int(round(ins * SR)), np.float32), x[ci:]])
            for later in ids[k + 1:]: tw[later] = [(s + ins, e + ins) for s, e in tw[later]]
        cursor += GAP_BEFORE[pid]
        pieces.append((cursor, x))
        for lid in ids:
            l = LINES[lid]; caps = l["caption"].split()
            ws = [{"w": w, "t": round(s + cursor, 3)} for w, (s, e) in zip(caps, tw[lid])]
            timeline_lines.append({"id": lid, "scene": l["scene"], "start": ws[0]["t"], "end": round(tw[lid][-1][1] + cursor, 3),
                                   "caption": l["caption"], "hl": l["hl"], "anchors": l.get("anchors", {}), **({"breaks": l["breaks"]} if "breaks" in l else {}), "words": ws})
        cursor += len(x) / SR
    dur = cursor + TAIL
    voice = np.zeros(int(round(dur * SR)) + SR, np.float32)
    for off, x in pieces:
        a = int(round(off * SR)); voice[a:a + len(x)] += x
    frames = int(round(dur * FPS)); voice = voice[: int(round(frames / FPS * SR))]
    sf.write(ROOT / "audio" / "voice.wav", voice, SR, subtype="PCM_24")
    tl = {"fps": FPS, "duration": round(frames / FPS, 4), "frames": frames, "lang": "hi",
          "strings": SCRIPT.get("strings", {}), "weak": SCRIPT.get("weak", []), "noStart": SCRIPT.get("noStart", []), "chunker": SCRIPT.get("chunker", "greedy"), "capSize": SCRIPT.get("capSize"), "lines": timeline_lines}
    (ROOT / "timeline.json").write_text(json.dumps(tl, indent=1, ensure_ascii=False))
    print("TTS_DONE duration", tl["duration"], "frames", frames)

if __name__ == "__main__":
    stage = sys.argv[1] if len(sys.argv) > 1 else "all"
    if stage in ("cb", "f5", "score"): synth(stage)
    if stage in ("synth", "all"): synth()
    if stage in ("assemble", "all"): assemble()
