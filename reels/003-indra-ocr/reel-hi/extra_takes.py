# extra candidates: more seeds for weak passages, and every Chatterbox take re-voiced through VC for one consistent timbre
import os, sys, json, hashlib, pathlib, time, torch, numpy as np, soundfile as sf
torch.set_num_threads(2)
ROOT = pathlib.Path('/home/claude/reel003hi'); CAND = ROOT / 'audio' / 'cand'
S = json.loads((ROOT / 'script.json').read_text()); LINES = {l['id']: l for l in S['lines']}
PAS = dict([("p1", ["V01"]), ("p2", ["V02"]), ("p3", ["V03"]), ("p4", ["V04"]), ("p5", ["V05", "V06"]), ("p6", ["V07"]), ("p7", ["V08"])])
TGT = '/home/claude/voicelab/hi/ref_en.wav'
stage = sys.argv[1]
def h(pid): return hashlib.md5(" ".join(LINES[i]["text"] for i in PAS[pid]).encode()).hexdigest()[:8]
if stage == 'cb':
    from chatterbox.mtl_tts import ChatterboxMultilingualTTS
    m = ChatterboxMultilingualTTS.from_pretrained(device='cpu')
    for pid, seeds in {"p2": [3, 5], "p4": [3, 5], "p7": [3, 5]}.items():
        text = " ".join(LINES[i]["text"] for i in PAS[pid])
        for sd in seeds:
            p = CAND / f"{pid}_{h(pid)}_cb{sd}.wav"
            if p.exists(): continue
            torch.manual_seed(sd); w = m.generate(text, language_id='hi', audio_prompt_path=TGT, exaggeration=0.55, cfg_weight=0.5)
            sf.write(p, w.squeeze(0).numpy(), m.sr); print('cb', p.name, flush=True)
if stage == 'f5':
    sys.path.insert(0, str(ROOT)); import tts_hi as T
    from f5_tts.infer.utils_infer import infer_process
    model, voc, ra, rt = T.f5()
    for pid, takes in {"p2": [(3, 1.0), (5, 1.06)]}.items():
        text = " ".join(LINES[i]["text"] for i in PAS[pid])
        for sd, sp in takes:
            p = CAND / f"{pid}_{h(pid)}_s{sd}_v{sp}.wav"
            if p.exists(): continue
            torch.manual_seed(sd); w, sr, _ = infer_process(ra, rt, text, model, voc, nfe_step=32, speed=sp, show_info=lambda *a: None)
            sf.write(p, np.asarray(w, np.float32), sr); print('f5', p.name, flush=True)
if stage == 'vc':
    from chatterbox.vc import ChatterboxVC
    vc = ChatterboxVC.from_pretrained('cpu')
    for p in sorted(CAND.glob('*.wav')):
        if p.name.endswith('_vc.wav') or '_final' in p.name: continue
        q = p.with_name(p.stem + '_vc.wav')
        if q.exists(): continue
        if not any(p.name.startswith(f"{pid}_{h(pid)}") for pid in PAS): continue
        w = vc.generate(str(p), target_voice_path=TGT).squeeze(0).numpy(); sf.write(q, w, vc.sr); print('vc', q.name, flush=True)
