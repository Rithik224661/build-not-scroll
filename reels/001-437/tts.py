"""Voice + timeline pass for the launch reel.

Clean pipeline (fixes the v1 "radio tape" artefacts):
  * full-precision Kokoro model (not int8)
  * no whisper/noise effect
  * gentle edge fades instead of hard silence trimming
  * light voice chain: high-pass, presence lift, soft compression
  * high-quality 24k -> 48k resample

Outputs: audio/lines/<id>.wav, audio/voice.wav (48 kHz mono), timeline.json
"""
import json
import pathlib

import numpy as np
import soundfile as sf
from kokoro_onnx import Kokoro
from scipy.signal import butter, resample_poly, sosfiltfilt

ROOT = pathlib.Path(__file__).resolve().parent
FPS, SR_IN, SR = 30, 24000, 48000


def edges(x, sr, thr_db=-50, pad=0.03):
    """Trim leading/trailing silence with padding, then 8 ms fades (no clicks, no clipped consonants)."""
    thr = 10 ** (thr_db / 20)
    idx = np.where(np.abs(x) > thr)[0]
    if idx.size:
        a = max(0, idx[0] - int(pad * sr)); b = min(len(x), idx[-1] + int(pad * 2 * sr))
        x = x[a:b]
    f = int(0.008 * sr)
    x = x.copy()
    x[:f] *= np.linspace(0, 1, f); x[-f:] *= np.linspace(1, 0, f)
    return x


def voice_chain(x, sr):
    x = sosfiltfilt(butter(2, 75, "high", fs=sr, output="sos"), x)
    presence = sosfiltfilt(butter(2, [2500, 6000], "band", fs=sr, output="sos"), x)
    x = x + 0.18 * presence
    # soft-knee compression on a smoothed envelope (zero-phase, no pumping artefacts)
    env = np.sqrt(np.convolve(x ** 2, np.ones(int(0.02 * sr)) / int(0.02 * sr), mode="same")) + 1e-6
    ref = np.percentile(env[env > 1e-3], 85)
    gain = np.where(env > ref * 0.6, (env / (ref * 0.6)) ** (-0.35), 1.0)
    return (x * gain).astype(np.float32)


def main():
    S = json.loads((ROOT / "script.json").read_text())
    k = Kokoro(str(ROOT / "assets/kokoro-v1.0.onnx"), str(ROOT / "assets/voices-v1.0.bin"))
    (ROOT / "audio/lines").mkdir(parents=True, exist_ok=True)
    clips, lines, t = [], [], 0.0
    for ln in S["lines"]:
        raw, sr = k.create(ln.get("tts", ln["text"]), voice=S["voice"]["id"], speed=ln.get("speed", S["voice"]["speed"]), lang="en-us")
        assert sr == SR_IN
        x = edges(np.asarray(raw, np.float32), SR_IN)
        x = resample_poly(x, 2, 1).astype(np.float32)          # 24k -> 48k
        x = voice_chain(x, SR)
        sf.write(ROOT / f"audio/lines/{ln['id']}.wav", x, SR)
        t += ln.get("pre", 0.3)
        start, dur = t, len(x) / SR
        clips.append((start, x))
        words = ln.get("caption", ln["text"]).split()
        lines.append({"id": ln["id"], "caption": ln.get("caption", ln["text"]), "hl": ln.get("hl", []),
                      "start": round(start, 4), "end": round(start + dur, 4), "words": len(words)})
        t = start + dur
    duration = t + S.get("tail", 1.0)
    frames = int(np.ceil(duration * FPS))
    n = int(np.ceil(duration * SR))
    mix = np.zeros(n, np.float32)
    for s, x in clips:
        i = int(round(s * SR)); mix[i:i + len(x)] += x
    mix *= 0.9 / max(1e-6, np.abs(mix).max())
    sf.write(ROOT / "audio/voice.wav", mix, SR)
    hop = SR // FPS
    rms = np.array([np.sqrt(np.mean(mix[f * hop:(f + 1) * hop] ** 2) + 1e-12) for f in range(frames)])
    env = np.clip(rms / np.percentile(rms[rms > 1e-3], 95), 0, 1)
    env = np.where(env < 0.06, 0, env)
    tl = {"fps": FPS, "duration": round(frames / FPS, 4), "frames": frames, "lines": lines,
          "mouth": [round(float(v), 3) for v in env]}
    (ROOT / "timeline.json").write_text(json.dumps(tl, indent=1))
    print(f"duration {duration:.2f}s  frames {frames}")
    for l in lines:
        print(f"  {l['id']} {l['start']:6.2f}-{l['end']:6.2f}  {l['caption']}")


if __name__ == "__main__":
    main()
