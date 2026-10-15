"""Score + sound design + voice mix for reel 1 ("437").

Everything is synthesised here (no samples, no licensed music), and every cue is
computed from timeline.json with the same formulas scene.js / main.js use, so
sound and picture stay locked. Output: audio/mix.wav (48 kHz stereo).
"""
import json
import pathlib

import numpy as np
import soundfile as sf
from scipy.signal import butter, sosfilt

ROOT = pathlib.Path(__file__).resolve().parent
SR = 48000
RNG = np.random.default_rng(437)
TL = json.loads((ROOT / "timeline.json").read_text())
D = TL["duration"]
N = int(D * SR) + SR
L = {l["id"]: l for l in TL["lines"]}

# ---- story clock (mirrors scene.js T)
T = dict(
    zero=L["L03"]["start"], stormIn=L["L04"]["start"] - 0.15, angry=L["L05"]["start"],
    blast=L["L05"]["end"] + 0.22, calm=L["L05"]["end"] + 0.75,
    rule1=L["L07"]["start"], wink=L["L07"]["end"] + 0.08, rule2=L["L08"]["start"], zap=L["L08"]["start"] + 0.55,
    rule3=L["L09"]["start"], cred=L["L10"]["start"] - 0.2, oh=L["L11"]["start"],
    filmed=L["L12"]["start"], code=L["L13"]["start"] - 0.05, codeEnd=L["L14"]["start"] - 0.35,
    cta=L["L14"]["start"], follow=L["L15"]["start"], end=L["L16"]["start"],
    tick=L["L16"]["start"] + (L["L16"]["end"] - L["L16"]["start"]) * 0.62,
)
T["edited"] = L["L12"]["start"] + (L["L12"]["end"] - L["L12"]["start"]) * 0.52


# ---- dsp helpers
def ax(n): return np.arange(n) / SR
def lp(x, f): return sosfilt(butter(2, f, "low", fs=SR, output="sos"), x)
def hp(x, f): return sosfilt(butter(2, f, "high", fs=SR, output="sos"), x)
def bp(x, a, b): return sosfilt(butter(2, [a, b], "band", fs=SR, output="sos"), x)
def midi(m): return 440 * 2 ** ((m - 69) / 12)


def put(buf, x, t, g=1.0):
    i = int(round(t * SR))
    if i < 0:
        x = x[-i:]; i = 0
    if i >= len(buf):
        return
    j = min(len(buf), i + len(x)); buf[i:j] += x[: j - i] * g


def adsr(n, a=0.005, d=0.08, s=0.6, r=0.15):
    e = np.full(n, s, float)
    na, nd, nr = int(a * SR), int(d * SR), min(n, int(r * SR))
    e[:na] = np.linspace(0, 1, na, endpoint=False); e[na:na + nd] = np.linspace(1, s, len(e[na:na + nd]), endpoint=False)
    if nr: e[-nr:] *= np.linspace(1, 0, nr)
    return e


def gate(t0, t1, fi=0.3, fo=0.3):
    t = ax(N)
    return np.minimum(np.clip((t - t0) / fi, 0, 1), np.clip((t1 - t) / fo, 0, 1))


def noise(n): return RNG.standard_normal(n)


# ---- instruments
def kick(g=1.0, dur=0.42):
    n = int(dur * SR); t = ax(n); f = 45 + 120 * np.exp(-t * 32)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 7.5)
    click = hp(noise(n), 3000) * np.exp(-t * 300) * 0.3
    return (body + click) * g


def clap(g=0.4):
    n = int(0.25 * SR); t = ax(n); x = bp(noise(n), 900, 5000)
    env = sum(np.exp(-np.clip(t - d, 0, None) * 60) * (t >= d) for d in (0, 0.011, 0.022)) + np.exp(-t * 18) * 0.6
    return x * env * g


def hat(g=0.12, open_=False):
    n = int((0.22 if open_ else 0.05) * SR); return hp(noise(n), 8000) * np.exp(-ax(n) * (14 if open_ else 90)) * g


def pad(freqs, dur, g=0.1, bright=1500):
    n = int(dur * SR); t = ax(n); x = np.zeros(n)
    for f in freqs:
        for det in (-0.12, 0.0, 0.12):
            ph = 2 * np.pi * f * (2 ** (det / 12)) * t
            x += np.sin(ph) + 0.35 * np.sin(2 * ph) + 0.12 * np.sin(3 * ph)
    return lp(x / (3 * len(freqs)), bright) * adsr(n, 0.4, 0.3, 0.85, min(1.0, dur * 0.4)) * g


def pluck(f, dur=0.3, g=0.2, bright=3500):
    n = int(dur * SR); t = ax(n); saw = 2 * ((f * t) % 1) - 1
    return lp(saw + 0.5 * np.sin(2 * np.pi * f * t), bright) * np.exp(-t * 9) * g


def ping(f, g=0.25):  # notification ding
    n = int(0.6 * SR); t = ax(n)
    x = np.sin(2 * np.pi * f * t) + 0.4 * np.sin(2 * np.pi * f * 2.76 * t) * np.exp(-t * 12)
    return x * np.exp(-t * 6.5) * adsr(n, 0.002, 0.02, 1, 0.05) * g


def boom(g=1.0):
    n = int(2.2 * SR); t = ax(n); f = 32 + 70 * np.exp(-t * 5)
    sub = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 1.6)
    crack = lp(noise(n), 2500) * np.exp(-t * 7) * 0.6
    return (sub + crack) * g


def whoosh(dur=0.5, g=0.3, lo=300, hi=5000, rev=False):
    n = int(dur * SR); t = ax(n); x = bp(noise(n), lo, hi)
    e = np.sin(np.pi * np.clip(t / dur, 0, 1)) ** 2
    if rev: e = (t / dur) ** 3
    return x * e * g


def thud(g=0.6):
    n = int(0.5 * SR); t = ax(n); f = 60 + 80 * np.exp(-t * 25)
    return (np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 9) + lp(noise(n), 1200) * np.exp(-t * 30) * 0.4) * g


def click(g=0.2, bright=6000):
    n = int(0.025 * SR); return bp(noise(n), 1500, bright) * np.exp(-ax(n) * 220) * g


def blip(f=1800, g=0.12, dur=0.07):
    n = int(dur * SR); return np.sin(2 * np.pi * f * ax(n)) * adsr(n, 0.002, 0.02, 0.6, 0.03) * g


def zapfx(g=0.35):
    n = int(0.45 * SR); t = ax(n); f = 2600 * np.exp(-t * 9) + 120
    x = np.sign(np.sin(2 * np.pi * np.cumsum(f) / SR)) * 0.5 + np.sin(2 * np.pi * np.cumsum(f) / SR)
    return lp(x, 6000) * np.exp(-t * 5) * g + bp(noise(n), 2000, 9000) * np.exp(-t * 14) * g * 0.5


def chime(g=0.18):
    out = np.zeros(int(0.9 * SR))
    for k, m in enumerate((88, 95)):
        n = int(0.8 * SR); t = ax(n); x = np.sin(2 * np.pi * midi(m) * t) * np.exp(-t * 5)
        i = int(k * 0.07 * SR); out[i:i + n] += x[: len(out) - i]
    return out * g


def glitch_burst(dur=0.35, g=0.35):
    n = int(dur * SR); x = noise(n)
    steps = (np.floor(ax(n) * 60) % 3 == 0).astype(float)
    crush = np.round(np.sin(2 * np.pi * 220 * ax(n) * (1 + 3 * steps)) * 4) / 4
    return (bp(x, 500, 7000) * steps + crush * 0.4) * np.exp(-ax(n) * 6) * g


# ================================================================ score
music = np.zeros(N)
sfx = np.zeros(N)
t_all = ax(N)

# --- Act 1: doomscroll ambience (0 -> stormIn), returns at the end for the loop
drone = (np.sin(2 * np.pi * 55 * t_all) + 0.6 * np.sin(2 * np.pi * 82.4 * t_all + 1) + 0.3 * np.sin(2 * np.pi * 110 * t_all * 1.003))
drone = lp(drone, 500) * (0.75 + 0.25 * np.sin(2 * np.pi * 0.25 * t_all))
amb_gain = np.maximum(gate(-1, T["stormIn"] + 0.3, 0.01, 0.5), gate(T["end"] - 0.6, D + 2, 1.0, 0.1))
music += drone * amb_gain * 0.16
for k, ch in enumerate([[57, 60, 64], [53, 57, 60]]):  # Am, F  — cold, unresolved
    put(music, pad([midi(m) for m in ch], 3.2, 0.09, 1200), k * 2.9)
    put(music, pad([midi(m) for m in ch], 2.6, 0.08, 1200), T["end"] - 0.4 + k * 1.3)

# counter ticks: one soft click per value change while counting up
prev = None
for i in range(int(2.95 * 1000)):
    t = i / 1000; k = 1 - (1 - min(1, t / 2.9)) ** 3; v = round(391 + (437 - 391) * k)
    if prev is not None and v != prev: put(sfx, click(0.16, 7000), t)
    prev = v
# count-down whir (437 -> 0), then the crash
cd0 = L["L02"]["start"] + 0.25
n = int((T["zero"] - cd0) * SR); tt = ax(n); f = 300 + 2600 * (tt / (T["zero"] - cd0)) ** 2
put(sfx, np.sin(2 * np.pi * np.cumsum(f) / SR) * (0.4 + 0.6 * (np.floor(tt * 40) % 2)) * (tt / tt[-1]) * 0.07, cd0)
put(sfx, thud(0.9), T["zero"]); put(sfx, glitch_burst(0.4, 0.3), T["zero"])
n = int(0.9 * SR); tt = ax(n)  # sad descending "bwomp"
put(sfx, lp(2 * ((np.cumsum(220 * np.exp(-tt * 1.4)) / SR) % 1) - 1, 900) * np.exp(-tt * 2.5) * 0.18, T["zero"] + 0.05)

# --- Act 2: the clickbait storm — a ping per card, a rising riser, a pulse
arrive_gap = (L["L05"]["start"] - 0.25 - T["stormIn"]) / 12
for i in range(12):
    put(sfx, ping(midi([84, 88, 91, 86, 89, 93, 85, 90, 87, 92, 88, 95][i]), 0.16), T["stormIn"] + i * arrive_gap + 0.1)
    put(sfx, whoosh(0.35, 0.05, 800, 6000), T["stormIn"] + i * arrive_gap - 0.15)
rise_n = int((T["blast"] - T["stormIn"]) * SR); tt = ax(rise_n)
riser = bp(noise(rise_n), 400, 6000) * (tt / tt[-1]) ** 2.5 * 0.12
riser += np.sin(2 * np.pi * np.cumsum(200 + 900 * (tt / tt[-1]) ** 2) / SR) * (tt / tt[-1]) ** 2 * 0.05
put(sfx, riser, T["stormIn"])
for k in range(30):
    tb = T["stormIn"] + k * 0.25
    if tb > T["blast"] - 0.1: break
    put(music, kick(0.35 + 0.25 * k / 30, 0.25), tb)
n = int((T["blast"] - T["stormIn"]) * SR)
storm_bass = lp(np.sin(2 * np.pi * 41.2 * ax(n)) + 0.4 * np.sin(2 * np.pi * 61.7 * ax(n)), 300) * np.clip(ax(n) / 1.5, 0, 1)
put(music, storm_bass, T["stormIn"], 0.14)

# --- the blast
put(sfx, whoosh(0.35, 0.25, 200, 8000, rev=True), T["blast"] - 0.35)
put(sfx, boom(0.95), T["blast"])
put(sfx, whoosh(0.9, 0.2, 300, 7000), T["blast"])
put(sfx, hp(noise(int(0.8 * SR)), 4000) * np.exp(-ax(int(0.8 * SR)) * 5) * 0.12, T["blast"] + 0.02)  # shatter air

# --- Act 3: clean groove (calm -> oh), then a filtered build, then the drop at "code"
BPM = 100; B = 60 / BPM
CH = [[57, 60, 64, 67], [53, 57, 60, 64], [48, 52, 55, 59], [55, 59, 62, 66]]   # Am7 Fmaj7 Cmaj7 G(maj7-ish)
BASS = [45, 41, 36, 43]
groove = np.zeros(N); drums = np.zeros(N)
g0 = T["calm"] + 0.15
bar = 0; t = g0
while t < T["end"] - 0.2:
    ch = CH[bar % 4]
    put(groove, pad([midi(m) for m in ch], 4 * B, 0.075, 2200), t)
    for s16 in range(8):
        put(groove, pluck(midi(ch[(s16 * 3) % 4] + 12), 0.22, 0.045, 3000), t + s16 * B / 2 + (0.02 if s16 % 2 else 0))
    put(groove, pluck(midi(BASS[bar % 4]), 0.5, 0.2, 700), t); put(groove, pluck(midi(BASS[bar % 4]), 0.4, 0.14, 700), t + 2.5 * B)
    for b in range(4):
        tb = t + b * B
        put(drums, kick(0.6), tb)
        if b in (1, 3): put(drums, clap(0.32), tb)
        put(drums, hat(0.07), tb + B / 2); put(drums, hat(0.04), tb + B / 4 * 3)
        if b == 3: put(drums, hat(0.06, True), tb + B / 2)
    t += 4 * B; bar += 1
# sidechain pump from the kick grid
pump = np.ones(N)
t = g0
while t < D:
    i = int(t * SR); m = int(0.18 * SR)
    if i + m < N: pump[i:i + m] = np.minimum(pump[i:i + m], 0.55 + 0.45 * np.linspace(0, 1, m) ** 0.7)
    t += B
groove *= pump
# arrangement gains
calm_in = gate(T["calm"] + 0.1, D + 2, 0.8, 0.1)
build = gate(T["oh"] - 0.1, T["code"], 0.2, 0.02)            # "Oh. And this reel?" -> strip back
drop = gate(T["code"], T["codeEnd"] + 0.2, 0.01, 0.4)
outro = 1 - gate(T["end"] - 0.5, D + 2, 1.0, 0.1)
g_groove = calm_in * (1 - 0.75 * build) * outro
g_drums = calm_in * (1 - build) * outro
music += groove * g_groove + drums * g_drums * 0.9
# filtered build during the reveal setup
n = int((T["code"] - T["oh"]) * SR); tt = ax(n)
w = (tt / tt[-1]) ** 2; nz = noise(n)
put(sfx, (bp(nz, 300, 1200) * (1 - w) + bp(nz, 2000, 9000) * w) * w * 0.16, T["oh"])
for k in range(16):
    tb = T["filmed"] + k * (T["code"] - T["filmed"]) / 16 * (1 - 0.3 * k / 16)
    put(sfx, clap(0.08 + 0.12 * k / 16), tb)
# the drop: arpeggiated digital synth + bigger kick while the world is code
put(sfx, boom(0.7), T["code"]); put(sfx, glitch_burst(0.3, 0.3), T["code"] - 0.05)
arp = [69, 72, 76, 79, 81, 79, 76, 72]
t = T["code"]; k = 0
while t < T["codeEnd"]:
    put(music, pluck(midi(arp[k % 8]), 0.16, 0.09, 6000), t); t += B / 4; k += 1
t = T["code"]
while t < T["codeEnd"]:
    put(music, kick(0.75), t); t += B
put(sfx, glitch_burst(0.25, 0.22), T["codeEnd"] - 0.05)

# --- rules + UI sound design
for at in (L["L06"]["start"] + 0.1, T["rule1"], T["rule2"], T["rule3"]):
    put(sfx, thud(0.55), at); put(sfx, whoosh(0.25, 0.08, 1000, 8000), at - 0.12)
put(sfx, chime(0.16), T["wink"])
put(sfx, zapfx(0.3), T["zap"] - 0.05)
for k in range(10):  # timer ticks during rule 3
    put(sfx, click(0.09, 4000), T["rule3"] + 0.3 + k * 0.25)
for i in range(6):   # terminal typing
    at = T["cred"] + 0.35 + i * 0.42
    for c in range(5): put(sfx, click(0.07), at + c * 0.06)
for i in range(5): put(sfx, blip(1400 + i * 180, 0.06), T["cred"] + 0.2 + i * 0.12)
# CTA: typing SOURCE, send, reply; follow tap
for k in range(1, 7): put(sfx, click(0.22, 5000), T["cta"] + 0.55 + k * 0.125 - 0.02)
put(sfx, whoosh(0.25, 0.12, 1500, 9000), T["cta"] + 1.45)
put(sfx, blip(1200, 0.12, 0.08), T["cta"] + 1.6); put(sfx, blip(1800, 0.12, 0.1), T["cta"] + 1.68)
put(sfx, click(0.3, 4000), T["follow"] + 1.05); put(sfx, chime(0.18), T["follow"] + 1.12)
# ending tick 437 -> 438
put(sfx, click(0.3, 7000), T["tick"]); put(sfx, blip(990, 0.1, 0.12), T["tick"] + 0.02)

# ================================================================ voice + ducking
v, vsr = sf.read(ROOT / "audio/voice.wav", dtype="float64")
assert vsr == SR
voice = np.zeros(N); voice[: min(N, len(v))] = v[:N]
env = np.convolve(np.abs(voice), np.ones(int(0.1 * SR)) / int(0.1 * SR), mode="same")
env = np.clip(env / (np.percentile(env[env > 1e-4], 90) + 1e-9), 0, 1)
duck = 1 - 0.55 * env
bed = (music * 0.75 + sfx * 0.85) * duck + sfx * 0.15
mono = voice * 1.0 + bed
wide = 0.16 * lp(np.roll(music * duck, int(0.012 * SR)), 7000)
st = np.stack([mono + wide, mono - wide], 1)
st = hp(st.T, 28).T
st = np.tanh(st * 1.15) / np.tanh(1.15)          # gentle saturation / peak control
st = st / np.max(np.abs(st)) * 0.9
st = st[: int(D * SR)]
sf.write(ROOT / "audio/mix.wav", st.astype(np.float32), SR)
print("mix.wav", round(len(st) / SR, 2), "s;", {k: round(v, 2) for k, v in T.items()})
