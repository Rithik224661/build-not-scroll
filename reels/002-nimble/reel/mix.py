"""Final audio for reel 002.

voice.wav (from tts.py) -> light voice chain (ffmpeg: high-pass, mud cut, presence lift, gentle compression, de-ess)
+ continuous BGM bed (Mixkit "House Vibez" by Lily J, Mixkit licence; see THIRD_PARTY_NOTICES.md),
  ducked under the voice with a smoothed side-chain envelope (no pumping, no dead silence between lines)
+ foley SFX from audio/sfx_cues.json (written by `node render.mjs --events` from the same clock as the picture)
-> two-pass loudnorm to -14 LUFS integrated, -1.0 dBTP, then a safety limiter.

Writes audio/mix.wav (48 kHz stereo, 24-bit) and qa/mix_report.json.
"""
import json, os, pathlib, subprocess, tempfile, re
import numpy as np, soundfile as sf

ROOT = pathlib.Path(__file__).parent
ASSETS = pathlib.Path(os.environ.get("AUDIO_DIR", ROOT / "assets" / "audio"))   # filled by scripts/download-audio.sh
SR = 48000
BGM = ASSETS / "bgm" / "house-vibez.mp3"
BED_UNDER_VOICE_DB = -15.0      # bed RMS relative to voice RMS while speaking
DUCK_DB = 5.0                   # extra lift in gaps = bed is 7 dB louder when nobody talks
FADE_OUT = 1.4

def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode: raise RuntimeError(r.stderr[-2000:])
    return r

def load(path, ch=2):
    with tempfile.NamedTemporaryFile(suffix=".wav") as f:
        run(["ffmpeg", "-y", "-v", "error", "-i", str(path), "-ac", str(ch), "-ar", str(SR), "-c:a", "pcm_f32le", f.name])
        x, _ = sf.read(f.name, dtype="float32", always_2d=True)
    return x

def eq_music(x):
    # +3 dB high shelf at 6 kHz so hats and air survive phone speakers under the voice
    with tempfile.NamedTemporaryFile(suffix=".wav") as fi, tempfile.NamedTemporaryFile(suffix=".wav") as fo:
        sf.write(fi.name, x, SR, subtype="FLOAT")
        run(["ffmpeg", "-y", "-v", "error", "-i", fi.name, "-af", "equalizer=f=6000:t=h:w=0.7:g=3", "-c:a", "pcm_f32le", fo.name])
        y, _ = sf.read(fo.name, dtype="float32", always_2d=True)
    return y

def db(x): return 10 ** (x / 20)
def rms(x): return float(np.sqrt(np.mean(np.square(x)) + 1e-12))

def main():
    voice_raw = ROOT / "audio" / "voice.wav"
    vproc = ROOT / "audio" / "voice_proc.wav"
    run(["ffmpeg", "-y", "-v", "error", "-i", str(voice_raw), "-af",
         "highpass=f=85:poles=2,equalizer=f=280:t=q:w=1.1:g=-2,equalizer=f=3600:t=q:w=1.0:g=2.2,"
         "equalizer=f=11000:t=h:w=0.7:g=1.2,deesser=i=0.35,"
         "acompressor=threshold=-21dB:ratio=2.6:attack=6:release=90:makeup=2", "-ar", str(SR), "-c:a", "pcm_f32le", str(vproc)])
    v = load(vproc, 1)[:, 0]
    n = len(v); dur = n / SR

    # side-chain envelope: 1 while speaking, 0 in gaps; smoothed (fast-ish attack, slow release)
    win = int(0.03 * SR); e = np.sqrt(np.convolve(v ** 2, np.ones(win) / win, mode="same"))
    speaking = (e > db(-42)).astype(np.float32)
    env = np.zeros_like(speaking); a_att, a_rel = 1 - np.exp(-1 / (0.09 * SR)), 1 - np.exp(-1 / (0.45 * SR))
    acc = 0.0
    for i in range(0, n, 48):                       # 1 ms control rate
        tgt = speaking[i]; acc += (tgt - acc) * (1 - (1 - (a_att if tgt > acc else a_rel)) ** 48); env[i:i + 48] = acc
    voice_rms = rms(v[speaking > 0])

    # BGM: skip the intro to the first sustained-energy point, loop if needed
    b = load(BGM, 2)
    b = eq_music(b)
    blk = int(0.5 * SR); r = np.array([rms(b[i:i + blk]) for i in range(0, len(b) - blk, blk)])
    start = int(np.argmax(r > 0.75 * np.median(r[: min(len(r), 120)]))) * blk
    b = b[start:]
    while len(b) < n: b = np.concatenate([b, b])
    b = b[:n]
    bed_rms = rms(b)
    g_speak = db(BED_UNDER_VOICE_DB) * voice_rms / bed_rms
    gain = g_speak * (1 + (db(DUCK_DB) - 1) * (1 - env))
    fo = int(FADE_OUT * SR); gain[-fo:] *= np.linspace(1, 0, fo) ** 1.5
    fi = int(0.04 * SR); gain[:fi] *= np.linspace(0, 1, fi)
    mixbuf = b * gain[:, None]

    # SFX
    cues = json.loads((ROOT / "audio" / "sfx_cues.json").read_text())["cues"]
    cache, placed = {}, []
    for c in cues:
        if c["s"] not in cache:
            x = load(ASSETS / "sfx" / f"{c['s']}.mp3", 2)
            pk = np.abs(x).max() + 1e-9; cache[c["s"]] = x / pk          # peak-normalise, then the cue's dB sets level
        x = cache[c["s"]]
        if "dur" in c:                                                     # typing bed: loop the burst to the typing length
            body = x[int(0.10 * SR):]; need = int(c["dur"] * SR) + int(0.04 * SR)
            x = np.concatenate([body] * (need // len(body) + 1))[:need].copy()
            f = int(0.04 * SR); x[-f:] *= np.linspace(1, 0, f)[:, None]; x[:int(0.01 * SR)] *= np.linspace(0, 1, int(0.01 * SR))[:, None]
        a = int(round(c["t"] * SR))
        if a >= n: continue
        seg = x[: n - a] * db(c["db"]) * voice_rms / 0.1                  # levels are relative to the voice
        f = min(len(seg), int(0.006 * SR)); seg[-f:] *= np.linspace(1, 0, f)[:, None]
        mixbuf[a:a + len(seg)] += seg; placed.append(c)

    out = mixbuf + v[:, None]
    pre = ROOT / "audio" / "premix.wav"
    sf.write(pre, out.astype(np.float32), SR, subtype="FLOAT")

    # two-pass loudnorm to -14 LUFS
    r1 = run(["ffmpeg", "-v", "info", "-i", str(pre), "-af", "loudnorm=I=-14:TP=-1.0:LRA=9:print_format=json", "-f", "null", "-"])
    m = json.loads(re.findall(r"\{[^{}]+\}", r1.stderr)[-1])
    final = ROOT / "audio" / "mix.wav"
    run(["ffmpeg", "-y", "-v", "error", "-i", str(pre), "-af",
         f"loudnorm=I=-14:TP=-1.0:LRA=9:measured_I={m['input_i']}:measured_TP={m['input_tp']}:measured_LRA={m['input_lra']}:"
         f"measured_thresh={m['input_thresh']}:offset={m['target_offset']}:linear=true,alimiter=limit=0.84:level=false,aresample={SR}",
         "-ar", str(SR), "-c:a", "pcm_s24le", str(final)])
    r2 = run(["ffmpeg", "-v", "info", "-i", str(final), "-af", "loudnorm=I=-14:TP=-1.0:print_format=json", "-f", "null", "-"])
    m2 = json.loads(re.findall(r"\{[^{}]+\}", r2.stderr)[-1])
    rep = {"duration": round(dur, 3), "bgm_start_s": round(start / SR, 2), "voice_rms_dbfs": round(20 * np.log10(voice_rms), 1),
           "sfx_placed": len(placed), "final_I": m2["input_i"], "final_TP": m2["input_tp"], "final_LRA": m2["input_lra"]}
    (ROOT / "qa" / "mix_report.json").write_text(json.dumps(rep, indent=1))
    print("MIX_DONE", json.dumps(rep))

if __name__ == "__main__":
    main()
