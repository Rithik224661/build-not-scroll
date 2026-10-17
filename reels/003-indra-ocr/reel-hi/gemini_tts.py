"""Optional upgrade path: Hinglish narration with Gemini TTS (free tier, AI Studio key), one voice for the whole reel.

GEMINI_API_KEY=... python gemini_tts.py            -> lists TTS models, renders every passage in each candidate voice,
                                                       scores them like tts_hi.py (romanised CER + MMS alignment),
                                                       keeps the single best voice and writes audio/cand/<pid>_<hash>_final.wav
Then run `python tts_hi.py assemble` as usual. The key is read from the environment only and never written to disk.
"""
import os, sys, json, base64, hashlib, pathlib, time, urllib.request, urllib.error
import numpy as np, soundfile as sf

ROOT = pathlib.Path(__file__).parent
sys.path.insert(0, str(ROOT))
import tts_hi as T

KEY = os.environ["GEMINI_API_KEY"]
API = "https://generativelanguage.googleapis.com/v1beta"
VOICES = os.environ.get("VOICES", "Puck,Fenrir,Charon,Orus,Sadachbia").split(",")
STYLE = ("Read this as an energetic, confident Indian tech creator on Instagram Reels, speaking natural Hinglish: "
         "Hindi grammar with English tech words pronounced the way Indian developers say them. Crisp, fast pace, "
         "clear consonants, punchy on numbers, no dramatic pauses. Say exactly this:\n")
# mixed script reads most naturally for an LLM voice: Hindi in Devanagari, English terms in Latin, numbers as Hindi words
GEM = {
    "V01": "यह AI model सिर्फ़ one million parameters का है। एक second में उनचास pages पढ़ लेता है। वो भी, बिना GPU के।",
    "V02": "नाम है Indra OCR। कोई भी PDF या scan, सीधा clean Markdown में। और पूरा model सिर्फ़ अठारह MB का।",
    "V03": "Tesseract, जो OCR सब use करते हैं, उससे यह क़रीब सत्रह गुना fast है।",
    "V04": "बस एक install, और एक command। PDFs का पूरा folder, हो गया।",
    "V05": "हर page Markdown में आता है, headings, lists और tables के साथ, सही reading order में।",
    "V06": "Handwriting? अभी नहीं।",
    "V07": "Comment करो PDF, और मैं आपको एक दस-line script भेजूँगा, जिससे PDFs का folder AI-ready knowledge base बन जाता है।",
    "V08": "और यह reel उस दोस्त को भेजो, जो आज भी PDFs से copy-paste करता है।",
}

def call(path, body=None):
    req = urllib.request.Request(f"{API}/{path}{'&' if '?' in path else '?'}key={KEY}", data=json.dumps(body).encode() if body else None,
                                 headers={"Content-Type": "application/json"})
    for attempt in range(6):
        try:
            with urllib.request.urlopen(req, timeout=120) as r: return json.loads(r.read())
        except urllib.error.HTTPError as e:
            msg = e.read().decode()[:300]
            if e.code in (429, 500, 503): time.sleep(15 * (attempt + 1)); continue     # free-tier rate limits: back off
            raise RuntimeError(f"{e.code} {msg}")
    raise RuntimeError("rate-limited too long")

def pick_model():
    ms = [m["name"].split("/")[-1] for m in call("models?pageSize=200")["models"] if "tts" in m["name"]]
    print("tts models:", ms)
    pref = [m for m in ms if "flash-tts" in m and "lite" not in m] or ms
    return sorted(pref)[-1]

def synth(model, voice, text):
    body = {"contents": [{"parts": [{"text": STYLE + text}]}],
            "generationConfig": {"responseModalities": ["AUDIO"],
                                 "speechConfig": {"voiceConfig": {"prebuiltVoiceConfig": {"voiceName": voice}}}}}
    r = call(f"models/{model}:generateContent", body)
    part = r["candidates"][0]["content"]["parts"][0]["inlineData"]
    pcm = np.frombuffer(base64.b64decode(part["data"]), np.int16).astype(np.float32) / 32768
    return pcm, 24000

def main():
    model = pick_model(); print("using", model)
    per_voice = {v: [] for v in VOICES}
    for pid, ids in T.PASSAGES:
        text = " ".join(T.LINES[i]["text"] for i in ids)          # hash stays tied to the Devanagari script
        h = hashlib.md5(text.encode()).hexdigest()[:8]
        gtext = " ".join(GEM[i] for i in ids)
        for v in VOICES:
            p = T.CAND / f"{pid}_{h}_gem_{v}.wav"
            if not p.exists():
                x, sr = synth(model, v, gtext); sf.write(p, x, sr); time.sleep(4)
            x, sr = sf.read(p, dtype="float32")
            heard, _ = T.transcribe(x); c = T.cer(T.roman(text), T.roman(heard)); conf = T.mms_conf(x, ids)
            per_voice[v].append((pid, p, c - 0.5 * conf, c, conf))
            print(json.dumps({"passage": pid, "voice": v, "rcer": round(c, 3), "align": round(conf, 3), "dur": round(len(x) / sr, 2), "heard": heard}, ensure_ascii=False), flush=True)
    ranking = sorted(VOICES, key=lambda v: np.mean([s for _, _, s, _, _ in per_voice[v]]))
    best = ranking[0]
    print("voice ranking:", [(v, round(float(np.mean([c for *_, c, _ in per_voice[v]])), 3)) for v in ranking])
    import shutil
    for pid, p, *_ in per_voice[best]:
        h = p.name.split("_")[1]; shutil.copyfile(p, T.CAND / f"{pid}_{h}_final.wav")
    print("GEMINI_DONE voice", best)

if __name__ == "__main__":
    main()
