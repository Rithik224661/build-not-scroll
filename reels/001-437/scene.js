// Reel 1 — "437". The 3D world. A pure function of t (seconds), constants and
// timeline.json: no clocks, no Math.random, so the same input gives the same pixels.

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// ------------------------------------------------------------------ math helpers
export const clamp01 = (x) => Math.min(1, Math.max(0, x));
export const lerp = (a, b, k) => a + (b - a) * k;
export const smooth = (x) => { x = clamp01(x); return x * x * (3 - 2 * x); };
export const easeOut = (x) => 1 - Math.pow(1 - clamp01(x), 3);
export const easeIn = (x) => Math.pow(clamp01(x), 3);
export const easeInOut = (x) => { x = clamp01(x); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
export const easeOutBack = (x) => { x = clamp01(x); const c = 1.9; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };
export const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
export const noise1 = (x, seed = 0) => {
  const i = Math.floor(x), f = x - i;
  const a = hash(i + seed * 101.3), b = hash(i + 1 + seed * 101.3);
  return lerp(a, b, f * f * (3 - 2 * f)) * 2 - 1;
};
// window weight: 0 before a, rises over fi, 1 until b, falls over fo
export const win = (t, a, b, fi = 0.2, fo = 0.2) => Math.min(smooth((t - a) / fi), 1 - smooth((t - b) / fo));

const C = (h) => new THREE.Color(h);

function canvasTex(w, h) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  return { c, g: c.getContext('2d'), tex };
}
export function rr(g, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

// ------------------------------------------------------------------ world
export function buildWorld(renderer, TL, SOURCE) {
  const L = Object.fromEntries(TL.lines.map((l) => [l.id, l]));
  // Story clock — every beat is derived from the voice timeline.
  const T = {
    zero: L.L03.start,                 // counter crashes to 0
    stormIn: L.L04.start - 0.15,       // clickbait cards start flying in
    angry: L.L05.start,
    blast: L.L05.end + 0.22,           // shockwave
    calm: L.L05.end + 0.75,
    rule1: L.L07.start, wink: L.L07.end + 0.08,
    rule2: L.L08.start, zap: L.L08.start + 0.55,
    rule3: L.L09.start,
    cred: L.L10.start - 0.2,
    oh: L.L11.start,
    filmed: L.L12.start, edited: L.L12.start + (L.L12.end - L.L12.start) * 0.52,
    code: L.L13.start - 0.05, codeEnd: L.L14.start - 0.35,
    cta: L.L14.start, follow: L.L15.start,
    end: L.L16.start, tick: L.L16.start + (L.L16.end - L.L16.start) * 0.62,
    D: TL.duration,
  };

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.fog = new THREE.Fog(0x05060c, 6.5, 19);

  // ---------------------------------------------------------------- moods (lighting palettes)
  const MOODS = {
    doom:  { top: '#141a46', bot: '#020309', glow: '#3b4cff', key: '#9fb0ff', rimA: '#4f62ff', rimB: '#b44cff', dust: '#8fa0ff', grid: 0.18 },
    zero:  { top: '#3a0812', bot: '#050103', glow: '#ff2a3c', key: '#ff8a8a', rimA: '#ff3344', rimB: '#ff7a33', dust: '#ff8a8a', grid: 0.12 },
    hype:  { top: '#3d0830', bot: '#08020a', glow: '#ff2e88', key: '#ff9ac4', rimA: '#ff2e88', rimB: '#ffb02e', dust: '#ffb0d8', grid: 0.15 },
    calm:  { top: '#0b2a24', bot: '#020706', glow: '#3dffc0', key: '#f2fff9', rimA: '#7ef0c4', rimB: '#3d7bff', dust: '#bfffe9', grid: 0.35 },
    cred:  { top: '#0a2030', bot: '#02060a', glow: '#3da8ff', key: '#eef8ff', rimA: '#7ef0c4', rimB: '#4d7bff', dust: '#bfe6ff', grid: 0.45 },
    code:  { top: '#00140d', bot: '#000402', glow: '#3dffb0', key: '#bfffe6', rimA: '#3dffb0', rimB: '#1fae7a', dust: '#7ef0c4', grid: 1.0 },
    cta:   { top: '#1d1a10', bot: '#050403', glow: '#ffb347', key: '#fff4e6', rimA: '#7ef0c4', rimB: '#ffb347', dust: '#ffe2b0', grid: 0.3 },
  };
  for (const m of Object.values(MOODS)) for (const k of Object.keys(m)) if (typeof m[k] === 'string') m[k] = C(m[k]);
  const moodKeys = [
    [0, 'doom'], [T.zero - 0.05, 'zero'], [T.stormIn + 0.4, 'hype'], [T.blast + 0.1, 'calm'],
    [T.cred, 'cred'], [T.code, 'code'], [T.codeEnd + 0.25, 'cta'], [T.end - 0.2, 'doom'],
  ];
  const tmpMood = {};
  function moodAt(t) {
    let i = 0; for (let k = 0; k < moodKeys.length; k++) if (t >= moodKeys[k][0]) i = k;
    const cur = MOODS[moodKeys[i][1]], prev = MOODS[moodKeys[Math.max(0, i - 1)][1]];
    const dur = moodKeys[i][1] === 'zero' || moodKeys[i][1] === 'code' ? 0.12 : 0.7;
    const k = i === 0 ? 1 : smooth((t - moodKeys[i][0]) / dur);
    for (const key of Object.keys(cur)) {
      if (cur[key].isColor) { tmpMood[key] = (tmpMood[key] || new THREE.Color()).copy(prev[key]).lerp(cur[key], k); }
      else tmpMood[key] = lerp(prev[key], cur[key], k);
    }
    return tmpMood;
  }

  // ---------------------------------------------------------------- background dome
  const domeMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color() }, bot: { value: new THREE.Color() }, glow: { value: new THREE.Color() }, glowAmt: { value: 0.6 }, t: { value: 0 } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform vec3 top; uniform vec3 bot; uniform vec3 glow; uniform float glowAmt; uniform float t; varying vec3 vP;
      void main(){
        float h = clamp(vP.y * 0.5 + 0.5, 0.0, 1.0);
        vec3 c = mix(bot, top, smoothstep(0.35, 0.9, h));
        float g = exp(-pow(length(vec2(vP.x * 1.4, (vP.y - 0.05) * 2.0) - vec2(0.0, 0.0)) * 2.6, 2.0));
        c += glow * g * glowAmt;
        // faint horizontal light bands for depth
        c += glow * 0.04 * smoothstep(0.0, 1.0, sin(vP.y * 40.0 + t * 0.6) * 0.5 + 0.5) * (1.0 - h);
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(40, 48, 24), domeMat);
  dome.rotation.y = Math.PI; // glow faces the camera side behind the bot
  scene.add(dome);

  // ---------------------------------------------------------------- floor with reflective sheen + grid
  const grid = canvasTex(1024, 1024);
  {
    const g = grid.g; g.fillStyle = '#000'; g.fillRect(0, 0, 1024, 1024);
    g.strokeStyle = '#ffffff'; g.lineWidth = 2;
    for (let i = 0; i <= 1024; i += 64) { g.globalAlpha = i % 256 === 0 ? 0.9 : 0.35; g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 1024); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(1024, i); g.stroke(); }
    g.globalAlpha = 1; grid.tex.wrapS = grid.tex.wrapT = THREE.RepeatWrapping; grid.tex.repeat.set(10, 10); grid.tex.needsUpdate = true;
  }
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x07080c, roughness: 0.42, metalness: 0.35, envMapIntensity: 0.18,
    emissive: new THREE.Color(0x7ef0c4), emissiveMap: grid.tex, emissiveIntensity: 0.2 });
  const floor = new THREE.Mesh(new THREE.CircleGeometry(30, 64), floorMat);
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
  // soft contact shadow under the bot
  const blob = canvasTex(256, 256);
  { const g = blob.g; const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128); gr.addColorStop(0, 'rgba(0,0,0,0.85)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 256, 256); blob.tex.needsUpdate = true; }
  const shadowBlob = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), new THREE.MeshBasicMaterial({ map: blob.tex, transparent: true, depthWrite: false }));
  shadowBlob.rotation.x = -Math.PI / 2; shadowBlob.position.y = 0.005; scene.add(shadowBlob);

  // ---------------------------------------------------------------- lights
  const hemi = new THREE.HemisphereLight(0x8090ff, 0x080810, 0.35); scene.add(hemi);
  const key = new THREE.SpotLight(0xffffff, 16, 18, Math.PI / 6, 0.6, 1.5);
  key.position.set(-2.2, 4.6, 4.2); key.target.position.set(0, 1.1, 0);
  key.castShadow = true; key.shadow.mapSize.set(1024, 1024); key.shadow.bias = -0.0006; key.shadow.normalBias = 0.02;
  scene.add(key, key.target);
  const rimA = new THREE.DirectionalLight(0xffffff, 1.3); rimA.position.set(-4, 3, -4); scene.add(rimA);
  const rimB = new THREE.DirectionalLight(0xffffff, 1.1); rimB.position.set(4, 2.5, -3.5); scene.add(rimB);
  const fill = new THREE.PointLight(0xffffff, 0.9, 8, 2); fill.position.set(0, 1.4, 3.2); scene.add(fill);

  // ---------------------------------------------------------------- dust motes
  const DUST = 520;
  const dustGeo = new THREE.BufferGeometry();
  const dustPos = new Float32Array(DUST * 3); dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  const dustTex = canvasTex(64, 64);
  { const g = dustTex.g; const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); dustTex.tex.needsUpdate = true; }
  const dustMat = new THREE.PointsMaterial({ size: 0.045, map: dustTex.tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.7 });
  const dust = new THREE.Points(dustGeo, dustMat); scene.add(dust);

  // ---------------------------------------------------------------- the doomscroll feed wall
  const FEED_TITLES = ['AI TOOL #12', 'NEW MODEL', 'AGENTS', '10X YOUR', 'PROMPT', 'AI NEWS', 'TOP 5', 'MUST TRY', 'FREE AI', 'WOW', 'NEW!', 'AI HACK'];
  const feedTex = FEED_TITLES.map((title, i) => {
    const T2 = canvasTex(288, 512); const g = T2.g;
    const hue = Math.floor(hash(i * 3.3) * 360);
    const gr = g.createLinearGradient(0, 0, 288, 512);
    gr.addColorStop(0, `hsl(${hue},80%,45%)`); gr.addColorStop(1, `hsl(${(hue + 60) % 360},85%,18%)`);
    g.fillStyle = gr; rr(g, 0, 0, 288, 512, 28); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.15)'; g.beginPath(); g.arc(144, 200, 70 + hash(i) * 30, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(0,0,0,0.35)'; rr(g, 18, 360, 252, 130, 14); g.fill();
    g.fillStyle = '#fff'; g.font = '800 40px Inter'; g.textAlign = 'center'; g.fillText(title, 144, 412);
    g.fillStyle = 'rgba(255,255,255,0.6)'; rr(g, 60, 440, 168, 14, 7); g.fill();
    g.fillStyle = '#fff'; g.beginPath(); g.moveTo(130, 175); g.lineTo(130, 225); g.lineTo(172, 200); g.closePath(); g.fill();
    T2.tex.needsUpdate = true; return T2.tex;
  });
  const feed = new THREE.Group(); feed.position.set(0, 0, -3.6); scene.add(feed);
  const feedCards = [];
  const CARD_W = 1.15, CARD_H = 2.04, GAP = 0.18, COLS = 5, ROWS = 7;
  for (let c = 0; c < COLS; c++) for (let r = 0; r < ROWS; r++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(CARD_W, CARD_H), new THREE.MeshBasicMaterial({ map: feedTex[(c * 5 + r * 3) % feedTex.length], transparent: true, toneMapped: false, fog: false }));
    m.userData = { c, r }; feed.add(m); feedCards.push(m);
  }

  // ---------------------------------------------------------------- the clickbait storm
  const BAIT = [
    ['10 AI TOOLS', 'TO GET RICH'], ['CHATGPT', 'IS DEAD'], ['THIS AI', 'REPLACES YOUR JOB'], ['SECRET PROMPT', 'NOBODY TELLS YOU'],
    ['I MADE $10K', 'IN 7 DAYS'], ['STOP USING', 'CHATGPT'], ['AGI IS HERE', '(AGAIN)'], ['YOU ARE USING', 'AI WRONG'],
    ['BEST AI TOOL', 'OF 2026'], ['THIS CHANGES', 'EVERYTHING'], ['NO CODE', 'MILLIONAIRE'], ['GOOGLE IS', 'FINISHED'],
  ];
  function baitTexture(lines, i) {
    const T2 = canvasTex(640, 360); const g = T2.g;
    const pal = [['#ff2e63', '#5b0b2a'], ['#ff7a00', '#5a1d00'], ['#8a2eff', '#1e0a4a'], ['#ff2e88', '#3a0628']][i % 4];
    const gr = g.createLinearGradient(0, 0, 640, 360); gr.addColorStop(0, pal[0]); gr.addColorStop(1, pal[1]);
    g.fillStyle = gr; rr(g, 0, 0, 640, 360, 30); g.fill();
    g.lineWidth = 10; g.strokeStyle = '#ffe14d'; rr(g, 8, 8, 624, 344, 26); g.stroke();
    g.textAlign = 'left'; g.lineJoin = 'round';
    const draw = (txt, y, size, col) => { g.font = `900 ${size}px Inter`; g.lineWidth = 14; g.strokeStyle = '#000'; g.strokeText(txt, 40, y); g.fillStyle = col; g.fillText(txt, 40, y); };
    draw(lines[0], 150, 72, '#ffffff'); draw(lines[1], 240, 62, '#ffe14d');
    g.font = '700 26px Inter'; g.fillStyle = 'rgba(255,255,255,0.85)'; g.fillText(`${(1 + hash(i * 9.1) * 8).toFixed(1)}M views`, 40, 318);
    // red arrow
    g.strokeStyle = '#ff1e1e'; g.lineWidth = 14; g.lineCap = 'round';
    g.beginPath(); g.moveTo(560, 300); g.lineTo(520, 230); g.stroke(); g.beginPath(); g.moveTo(520, 230); g.lineTo(552, 236); g.moveTo(520, 230); g.lineTo(522, 262); g.stroke();
    T2.tex.needsUpdate = true; return T2.tex;
  }
  const storm = [];
  BAIT.forEach((lines, i) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.9), new THREE.MeshStandardMaterial({ map: baitTexture(lines, i), roughness: 0.5, metalness: 0, emissive: 0xffffff, emissiveMap: null, emissiveIntensity: 0, side: THREE.DoubleSide, transparent: true }));
    m.material.emissiveMap = m.material.map; m.material.emissiveIntensity = 0.4;
    m.castShadow = true;
    const ang = hash(i * 1.7) * Math.PI * 2;
    const from = new THREE.Vector3(Math.cos(ang) * 9, 1 + hash(i * 4.1) * 6, Math.sin(ang) * 5 - 2);
    // landing slot: a loose sphere around the bot (it gets buried)
    const a2 = i * 2.399; // golden angle
    const yN = 1 - (i + 0.5) / BAIT.length * 2;
    const rad = Math.sqrt(1 - yN * yN);
    const slot = new THREE.Vector3(Math.cos(a2) * (0.55 + rad * 0.95), 1.15 + yN * 1.15, -Math.abs(Math.sin(a2)) * rad * 0.9 + 0.05);
    // keep the face visible: anything landing in front of it is pushed to the side
    if (slot.z > 0.1 && Math.abs(slot.x) < 0.75 && Math.abs(slot.y - 1.15) < 0.5) slot.x = Math.sign(slot.x || 1) * 0.95;
    const arrive = T.stormIn + i * ((L.L05.start - 0.25 - T.stormIn) / BAIT.length);
    m.userData = { from, slot, arrive, spin: (hash(i * 7.7) - 0.5) * 2 };
    scene.add(m); storm.push(m);
  });
  // the one card that gets zapped during "No hype."
  const lateBait = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.84), new THREE.MeshStandardMaterial({ map: baitTexture(['NEW AI TOOL', 'CHANGES EVERYTHING'], 2), roughness: 0.5, side: THREE.DoubleSide, transparent: true, emissive: 0xffffff, emissiveIntensity: 0.55 }));
  lateBait.material.emissiveMap = lateBait.material.map; scene.add(lateBait);

  // shards that fly out when the late card is zapped
  const SHARDS = 60;
  const shards = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.07, 0.07), new THREE.MeshBasicMaterial({ color: 0xffe14d, toneMapped: false, transparent: true, side: THREE.DoubleSide }), SHARDS);
  scene.add(shards);

  // ---------------------------------------------------------------- shockwave ring
  const ringMat = new THREE.MeshBasicMaterial({ color: 0x9dffe0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.92, 1.0, 96), ringMat); scene.add(ring);
  const ring2 = new THREE.Mesh(new THREE.RingGeometry(0.97, 1.0, 96), ringMat.clone()); ring2.rotation.x = -Math.PI / 2; scene.add(ring2);

  // ================================================================ THE BOT ("Byte")
  const bot = new THREE.Group(); scene.add(bot);
  const body = new THREE.Group(); bot.add(body); // squash/stretch pivot
  const LITE = !new URLSearchParams(location.search).has('physical');
  const shell = LITE ? new THREE.MeshStandardMaterial({ color: 0xf3f0ea, roughness: 0.25, metalness: 0.0, envMapIntensity: 0.55 }) : new THREE.MeshPhysicalMaterial({ color: 0xf3f0ea, roughness: 0.28, metalness: 0.0, clearcoat: 0.8, clearcoatRoughness: 0.18, envMapIntensity: 0.45 });
  const dark = LITE ? new THREE.MeshStandardMaterial({ color: 0x0c0d12, roughness: 0.12, metalness: 0.3 }) : new THREE.MeshPhysicalMaterial({ color: 0x0c0d12, roughness: 0.15, metalness: 0.3, clearcoat: 1.0, clearcoatRoughness: 0.08 });
  const mintGlow = new THREE.MeshStandardMaterial({ color: 0x7ef0c4, emissive: 0x7ef0c4, emissiveIntensity: 4.0, roughness: 0.4 });
  const head = new THREE.Mesh(new RoundedBoxGeometry(1.0, 0.82, 0.78, 8, 0.24), shell); head.castShadow = true; body.add(head);
  const bezel = new THREE.Mesh(new RoundedBoxGeometry(0.84, 0.62, 0.06, 6, 0.12), dark); bezel.position.z = 0.37; body.add(bezel);
  const face = canvasTex(768, 576);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.76, 0.57), new THREE.MeshBasicMaterial({ map: face.tex, toneMapped: false, transparent: false }));
  screen.position.z = 0.405; body.add(screen);
  // glass sheen over the screen
  const sheenT = canvasTex(256, 192);
  { const g = sheenT.g; const gr = g.createLinearGradient(0, 0, 256, 192); gr.addColorStop(0, 'rgba(255,255,255,0.22)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.0)'); g.fillStyle = gr; g.fillRect(0, 0, 256, 192); sheenT.tex.needsUpdate = true; }
  const sheen = new THREE.Mesh(new THREE.PlaneGeometry(0.76, 0.57), new THREE.MeshBasicMaterial({ map: sheenT.tex, transparent: true, depthWrite: false, toneMapped: false }));
  sheen.position.z = 0.409; body.add(sheen);
  const ears = [];
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.1, 32), shell); ear.rotation.z = Math.PI / 2; ear.position.x = 0.53 * s; body.add(ear);
    const glow = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.105, 32), mintGlow); glow.rotation.z = Math.PI / 2; glow.position.x = 0.545 * s; body.add(glow);
    ears.push(glow);
  }
  const antStem = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.26, 12), dark); antStem.position.y = 0.53; body.add(antStem);
  const antTip = new THREE.Mesh(new THREE.SphereGeometry(0.065, 24, 16), mintGlow); antTip.position.y = 0.69; body.add(antTip);
  // arms: pivot at the shoulder
  const arms = {};
  for (const s of [-1, 1]) {
    const piv = new THREE.Group(); piv.position.set(0.5 * s, -0.12, 0.05); body.add(piv);
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.065, 0.3, 6, 16), shell); arm.position.y = -0.2; arm.castShadow = true; piv.add(arm);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.085, 20, 14), dark); hand.position.y = -0.4; piv.add(hand);
    arms[s < 0 ? 'L' : 'R'] = piv;
  }
  // thruster
  const thr = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.14, 0.1, 32), dark); thr.position.y = -0.46; body.add(thr);
  const thrRing = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.022, 12, 48), mintGlow); thrRing.rotation.x = Math.PI / 2; thrRing.position.y = -0.52; body.add(thrRing);
  const flameMat = new THREE.MeshBasicMaterial({ color: 0x7ef0c4, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.42, 24, 1, true), flameMat); flame.rotation.x = Math.PI; flame.position.y = -0.74; body.add(flame);
  const botLight = new THREE.PointLight(0x7ef0c4, 0.8, 2.5, 2); botLight.position.set(0, -0.8, 0.2); body.add(botLight);
  const faceLight = new THREE.PointLight(0x7ef0c4, 0.0, 2.2, 2); faceLight.position.set(0, 0, 0.9); body.add(faceLight);

  // ---------------------------------------------------------------- the face (canvas)
  function drawFace(t, mood, talk, wink, look) {
    const { g } = face; const W = 768, H = 576;
    const tint = mood === 'sad' || mood === 'zero' ? '#ff6b7a' : mood === 'angry' ? '#ff4d6d' : mood === 'code' ? '#3dffb0' : '#7ef0c4';
    g.fillStyle = '#06080b'; g.fillRect(0, 0, W, H);
    const bg = g.createRadialGradient(W / 2, H / 2, 40, W / 2, H / 2, 420); bg.addColorStop(0, 'rgba(126,240,196,0.10)'); bg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    g.fillStyle = 'rgba(126,240,196,0.045)'; for (let y = 0; y < H; y += 6) g.fillRect(0, y, W, 2);
    g.save(); g.shadowColor = tint; g.shadowBlur = 28; g.fillStyle = tint; g.strokeStyle = tint; g.lineCap = 'round';
    const blinkP = (t + 0.7) % 3.1; let blink = blinkP < 0.11 ? 0.12 : 1;
    const ex = [258, 510], ey = 238 + look.y * 18;
    const lx = look.x * 30;
    ex.forEach((x0, i) => {
      const x = x0 + lx;
      const isWink = wink > 0.5 && i === 1;
      const b = isWink ? 0.1 : blink;
      g.lineWidth = 30;
      if (mood === 'happy' || (isWink && mood !== 'sly')) {
        if (isWink) { g.beginPath(); g.moveTo(x - 52, ey + 8); g.lineTo(x + 52, ey + 8); g.stroke(); }
        else { g.beginPath(); g.arc(x, ey + 34, 56, Math.PI * 1.12, Math.PI * 1.88); g.stroke(); }
      } else if (mood === 'tired') {
        rr(g, x - 50, ey - 4, 100, 46 * b, 22); g.fill();
        g.fillStyle = '#06080b'; g.fillRect(x - 70, ey - 40, 140, 44); g.fillStyle = tint;
      } else if (mood === 'sad' || mood === 'zero') {
        rr(g, x - 40, ey - 30 * b, 80, 86 * b, 34); g.fill();
        g.lineWidth = 16; g.beginPath(); const s = i === 0 ? 1 : -1; g.moveTo(x - 50 * s, ey - 70); g.lineTo(x + 40 * s, ey - 94); g.stroke();
        if (mood === 'sad') { g.globalAlpha = 0.85; g.beginPath(); g.ellipse(x + (i ? -40 : 40), ey + 92 + (t * 120) % 60, 9, 14, 0, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1; }
      } else if (mood === 'angry') {
        rr(g, x - 46, ey - 34 * b, 92, 80 * b, 30); g.fill();
        g.fillStyle = '#06080b'; g.beginPath(); const s = i === 0 ? 1 : -1;
        g.moveTo(x - 80 * s, ey - 70); g.lineTo(x + 70 * s, ey - 4); g.lineTo(x + 70 * s, ey - 90); g.closePath(); g.fill(); g.fillStyle = tint;
      } else if (mood === 'shock') {
        g.lineWidth = 22; g.beginPath(); g.arc(x, ey, 58 * b, 0, Math.PI * 2); g.stroke();
        g.beginPath(); g.arc(x, ey, 18, 0, Math.PI * 2); g.fill();
      } else if (mood === 'sly') {
        rr(g, x - 46, ey - 6, 92, 50 * b, 22); g.fill();
        g.fillStyle = '#06080b'; g.fillRect(x - 70, ey - 44, 140, 46); g.fillStyle = tint;
      } else if (mood === 'focus') {
        rr(g, x - 52, ey - 10, 104, 30, 15); g.fill();
      } else if (mood === 'code') {
        g.font = '700 130px "JetBrains Mono"'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(i ? '}' : '{', x, ey + 6);
      } else {
        rr(g, x - 42, ey - 50 * b, 84, 104 * b, 38); g.fill();
        g.fillStyle = 'rgba(255,255,255,0.75)'; g.beginPath(); g.arc(x + 16, ey - 22 * b, 10, 0, Math.PI * 2); g.fill(); g.fillStyle = tint;
      }
    });
    // mouth
    const my = 432;
    g.lineWidth = 22;
    if (talk > 0.04) {
      const h = 16 + talk * 70, w = 120 - talk * 26;
      rr(g, W / 2 - w / 2, my - h / 2, w, h, Math.min(26, h / 2)); g.fill();
    } else if (mood === 'happy' || wink > 0.5) {
      g.beginPath(); g.arc(W / 2, my - 52, 64, Math.PI * 0.22, Math.PI * 0.78); g.stroke();
    } else if (mood === 'sad' || mood === 'zero') {
      g.beginPath(); g.arc(W / 2, my + 52, 54, Math.PI * 1.22, Math.PI * 1.78); g.stroke();
    } else if (mood === 'angry') {
      g.beginPath(); g.moveTo(W / 2 - 60, my + 6); g.lineTo(W / 2 + 60, my - 6); g.stroke();
    } else if (mood === 'shock') {
      g.beginPath(); g.ellipse(W / 2, my, 30, 40, 0, 0, Math.PI * 2); g.fill();
    } else if (mood === 'sly') {
      g.beginPath(); g.moveTo(W / 2 - 64, my); g.quadraticCurveTo(W / 2 + 10, my + 16, W / 2 + 66, my - 26); g.stroke();
    } else if (mood === 'tired') {
      g.beginPath(); g.moveTo(W / 2 - 46, my); g.lineTo(W / 2 + 46, my); g.stroke();
    } else if (mood === 'code') {
      g.font = '700 70px "JetBrains Mono"'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('</>', W / 2, my);
    } else {
      g.beginPath(); g.moveTo(W / 2 - 50, my); g.quadraticCurveTo(W / 2, my + 18, W / 2 + 50, my); g.stroke();
    }
    g.restore();
    face.tex.needsUpdate = true;
  }

  // ---------------------------------------------------------------- holo panels (credibility + code reveal)
  function holoPanel(w, h, px, py) {
    const P = canvasTex(px, py);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: P.tex, transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }));
    m.visible = false; scene.add(m);
    return { ...P, m };
  }
  const pTerm = holoPanel(1.5, 0.99, 760, 500);
  const pGraph = holoPanel(1.36, 1.0, 680, 500);
  const pId = holoPanel(1.95, 0.6, 920, 280);
  pTerm.m.position.set(-0.98, 2.45, -0.9); pTerm.m.rotation.y = 0.32;
  pGraph.m.position.set(1.1, 2.4, -0.9); pGraph.m.rotation.y = -0.32;
  pId.m.position.set(0, 0.5, 0.7);
  [pTerm, pGraph, pId].forEach((P) => { P.baseY = P.m.position.y; });
  const codeL = holoPanel(4.2, 7.0, 900, 1500);
  const codeR = holoPanel(4.2, 7.0, 900, 1500);
  codeL.m.position.set(-3.4, 3.2, -3.2); codeL.m.rotation.y = 0.55;
  codeR.m.position.set(3.4, 3.2, -3.2); codeR.m.rotation.y = -0.55;

  function panelBase(P, title, alpha) {
    const { g, c } = P; g.clearRect(0, 0, c.width, c.height);
    g.globalAlpha = alpha;
    rr(g, 4, 4, c.width - 8, c.height - 8, 30); g.fillStyle = 'rgba(6,24,22,0.78)'; g.fill();
    g.lineWidth = 4; g.strokeStyle = 'rgba(126,240,196,0.75)'; g.stroke();
    g.fillStyle = '#7ef0c4'; g.beginPath(); g.arc(42, 44, 10, 0, Math.PI * 2); g.fill();
    g.font = '700 30px "JetBrains Mono"'; g.textBaseline = 'middle'; g.fillStyle = '#c9fff0'; g.fillText(title, 66, 45);
    g.fillStyle = 'rgba(126,240,196,0.3)'; g.fillRect(28, 80, c.width - 56, 2);
  }
  const TERM = ['$ agent run --env prod', '> planner   ready', '> research  ready', '> writer    ready', '> tools: search, crm, email', '> status: live in production'];
  function drawTerm(t, a) {
    panelBase(pTerm, 'terminal', a); const { g } = pTerm; g.font = '700 30px "JetBrains Mono"';
    const t0 = T.cred + 0.35;
    TERM.forEach((ln, i) => {
      const at = t0 + i * 0.42; if (t < at) return;
      const n = Math.floor(clamp01((t - at) / 0.32) * ln.length);
      g.fillStyle = i === 0 ? '#ffffff' : i === TERM.length - 1 ? '#7ef0c4' : '#a9d9cc';
      g.fillText(ln.slice(0, n), 34, 130 + i * 58);
    });
    if (Math.floor(t * 3) % 2 === 0) { g.fillStyle = '#7ef0c4'; g.fillRect(34, 130 + Math.min(TERM.length, Math.floor((t - t0) / 0.42) + 1) * 58 - 18, 16, 34); }
    g.globalAlpha = 1; pTerm.tex.needsUpdate = true;
  }
  const NODES = [[340, 150, 'planner'], [150, 300, 'research'], [340, 330, 'tools'], [530, 300, 'writer'], [340, 450, 'ship']];
  const EDGES = [[0, 1], [0, 2], [0, 3], [1, 4], [2, 4], [3, 4]];
  function drawGraph(t, a) {
    panelBase(pGraph, 'agents', a); const { g } = pGraph;
    const k = clamp01((t - T.cred - 0.3) / 0.8);
    g.lineWidth = 4;
    EDGES.forEach(([i, j], e) => {
      const A = NODES[i], B = NODES[j];
      g.strokeStyle = 'rgba(126,240,196,0.45)'; g.beginPath(); g.moveTo(A[0], A[1]); g.lineTo(lerp(A[0], B[0], k), lerp(A[1], B[1], k)); g.stroke();
      const p = ((t * 0.9 + e * 0.37) % 1);
      if (k >= 1) { g.fillStyle = '#ffffff'; g.beginPath(); g.arc(lerp(A[0], B[0], p), lerp(A[1], B[1], p), 7, 0, Math.PI * 2); g.fill(); }
    });
    NODES.forEach(([x, y, name], i) => {
      const s = easeOutBack(clamp01((t - T.cred - 0.2 - i * 0.12) / 0.4));
      g.fillStyle = 'rgba(6,24,22,1)'; g.strokeStyle = '#7ef0c4'; g.lineWidth = 4;
      g.beginPath(); g.arc(x, y, 34 * s, 0, Math.PI * 2); g.fill(); g.stroke();
      g.fillStyle = '#c9fff0'; g.font = '700 24px "JetBrains Mono"'; g.textAlign = 'center'; if (s > 0.6) g.fillText(name, x, y + 62); g.textAlign = 'left';
    });
    g.globalAlpha = 1; pGraph.tex.needsUpdate = true;
  }
  function drawId(t, a) {
    const { g, c } = pId; g.clearRect(0, 0, c.width, c.height); g.globalAlpha = a;
    rr(g, 4, 4, c.width - 8, c.height - 8, 40); g.fillStyle = 'rgba(6,20,20,0.86)'; g.fill(); g.lineWidth = 4; g.strokeStyle = 'rgba(126,240,196,0.9)'; g.stroke();
    g.font = '800 70px Inter'; g.fillStyle = '#ffffff'; g.textBaseline = 'middle'; g.fillText('rithikgour', 44, 104);
    const w = g.measureText('rithikgour').width; g.fillStyle = '#7ef0c4'; g.fillText('.ai', 44 + w, 104);
    g.font = '600 34px Inter'; g.fillStyle = '#bfeee0'; g.fillText('AI engineer · agents · automation', 44, 178);
    g.font = '600 28px Inter'; g.fillStyle = 'rgba(191,238,224,0.75)'; g.fillText('one build per reel · no hype', 44, 228);
    g.globalAlpha = 1; pId.tex.needsUpdate = true;
  }
  const KW = /\b(const|let|return|function|export|import|from|if|for|new|=>|true|false)\b/;
  const srcLines = (SOURCE || '').split('\n').filter((l) => l.trim().length).map((l) => l.replace(/\t/g, '  ').slice(0, 54));
  function drawCode(P, t, a, offset) {
    const { g, c } = P; g.clearRect(0, 0, c.width, c.height); g.globalAlpha = a;
    rr(g, 4, 4, c.width - 8, c.height - 8, 30); g.fillStyle = 'rgba(0,14,9,0.82)'; g.fill(); g.lineWidth = 4; g.strokeStyle = 'rgba(61,255,176,0.8)'; g.stroke();
    g.font = '700 26px "JetBrains Mono"'; g.textBaseline = 'middle';
    const lh = 38, scroll = (t - T.filmed) * 26 + offset;
    const first = Math.floor(scroll);
    for (let i = 0; i < 40; i++) {
      const idx = (first + i) % Math.max(1, srcLines.length);
      const ln = srcLines[idx] || ''; const y = 60 + i * lh - (scroll - first) * lh;
      if (y < 30 || y > c.height - 20) continue;
      g.fillStyle = 'rgba(61,255,176,0.35)'; g.fillText(String(idx + 1).padStart(3, ' '), 22, y);
      g.fillStyle = KW.test(ln) ? '#7dffcb' : ln.includes("'") ? '#ffd27a' : '#cfeee3';
      g.fillText(ln, 100, y);
    }
    g.globalAlpha = 1; P.tex.needsUpdate = true;
  }

  // ---------------------------------------------------------------- wireframe twin materials
  const wireMat = new THREE.MeshBasicMaterial({ color: 0x3dffb0, wireframe: true, transparent: true, opacity: 0.9, toneMapped: false });
  const solidMeshes = [];
  scene.traverse((o) => { if (o.isMesh && o !== dome && o !== screen && o !== sheen && !o.material.transparent && o !== floor) solidMeshes.push(o); });
  [head, bezel, thr].forEach((m) => { if (!solidMeshes.includes(m)) solidMeshes.push(m); });
  solidMeshes.forEach((m) => { m.userData.solid = m.material; });
  let wireOn = false;
  function setWire(on) {
    if (on === wireOn) return; wireOn = on;
    solidMeshes.forEach((m) => { m.material = on ? wireMat : m.userData.solid; });
    storm.forEach((m) => { m.visible = !on && m.visible; });
  }

  // ================================================================ per-frame
  const v3 = new THREE.Vector3(), v3b = new THREE.Vector3();
  const speakingAt = (t) => TL.lines.find((l) => t >= l.start - 0.03 && t <= l.end + 0.03);
  const mouth = (t) => TL.mouth[Math.max(0, Math.min(TL.frames - 1, Math.round(t * TL.fps)))] || 0;

  function update(t) {
    const M = moodAt(t);
    // ---- background + lights
    domeMat.uniforms.top.value.copy(M.top); domeMat.uniforms.bot.value.copy(M.bot); domeMat.uniforms.glow.value.copy(M.glow);
    domeMat.uniforms.glowAmt.value = 0.38 + 0.25 * win(t, T.blast, T.blast + 0.3, 0.02, 0.6); domeMat.uniforms.t.value = t;
    scene.fog.color.copy(M.bot);
    key.color.copy(M.key); rimA.color.copy(M.rimA); rimB.color.copy(M.rimB); hemi.color.copy(M.rimA).multiplyScalar(0.6);
    fill.color.copy(M.key);
    floorMat.emissive.copy(M.rimA); floorMat.emissiveIntensity = M.grid * 0.35;
    const flashZero = win(t, T.zero, T.zero + 0.08, 0.01, 0.5);
    key.intensity = 16 + flashZero * 30;

    // ---- dust
    for (let i = 0; i < DUST; i++) {
      const x = (hash(i * 1.31) - 0.5) * 12, z = (hash(i * 2.17) - 0.5) * 10 - 1;
      const sp = 0.05 + hash(i * 3.7) * 0.12;
      const y = ((hash(i * 4.9) * 7 + t * sp) % 7);
      dustPos[i * 3] = x + Math.sin(t * 0.3 + i) * 0.1; dustPos[i * 3 + 1] = y; dustPos[i * 3 + 2] = z;
    }
    dustGeo.attributes.position.needsUpdate = true; dustMat.color.copy(M.dust);
    dustMat.opacity = 0.55 + 0.35 * win(t, T.code, T.codeEnd, 0.2, 0.3);

    // ---- feed wall: visible in the hook and again at the end
    const feedVis = Math.max(1 - smooth((t - (T.stormIn + 0.2)) / 0.6), smooth((t - (T.end - 0.4)) / 0.8));
    feed.visible = feedVis > 0.01;
    if (feed.visible) {
      // scroll speed: fast, slows to a stop on "Zero.", gentle again at the end
      const s1 = Math.min(t, T.zero);
      const scroll = t < T.end ? (s1 * 1.9 - Math.pow(Math.max(0, s1 - 2.5), 2) * 0.35) : (T.end - 3) * 0.7 + (t - T.end) * 1.6;
      const span = ROWS * (CARD_H + GAP);
      feedCards.forEach((m) => {
        const { c, r } = m.userData;
        const colShift = (c % 2 ? 0.5 : 0) * (CARD_H + GAP) + c * 0.37;
        let y = ((r * (CARD_H + GAP) + scroll * (1 + c * 0.04) + colShift) % span) - span / 2 + 2.4;
        m.position.set((c - (COLS - 1) / 2) * (CARD_W + GAP), y, -Math.abs(c - 2) * 0.35);
        m.rotation.y = (c - 2) * -0.12;
        m.material.opacity = feedVis * (0.75 - Math.abs(c - 2) * 0.12) * (1 - 0.6 * flashZero);
        m.material.color.setScalar(t > T.zero && t < T.end ? 0.3 : 0.62);
      });
    }

    // ---- bot motion
    const pTalk = speakingAt(t) ? mouth(t) : 0;
    const blastK = win(t, T.blast - 0.3, T.blast + 0.05, 0.3, 0.4);   // wind-up then release
    const buried = smooth((t - (T.stormIn + 0.6)) / 1.6) * (1 - smooth((t - T.blast) / 0.05));
    const hover = 1.15 + Math.sin(t * 2.1) * 0.05;
    let by = hover;
    // sag on "Zero." then recover
    by -= 0.22 * win(t, T.zero, T.zero + 0.7, 0.08, 0.7);
    // jump up on blast
    by += 0.3 * win(t, T.blast, T.blast + 0.15, 0.08, 0.6);
    // end shrug bounce
    by += 0.06 * win(t, T.tick, T.tick + 0.2, 0.08, 0.3);
    bot.position.set(Math.sin(t * 0.7) * 0.04 + noise1(t * 14, 3) * 0.035 * buried, by, 0);
    // squash & stretch
    const squash = -0.12 * win(t, T.zero, T.zero + 0.12, 0.05, 0.35) + 0.14 * win(t, T.blast, T.blast + 0.08, 0.03, 0.3) - 0.1 * blastK * (t < T.blast ? 1 : 0);
    body.scale.set(1 - squash * 0.6, 1 + squash, 1 - squash * 0.6);
    // head turns
    let yaw = Math.sin(t * 0.5) * 0.08, pitch = 0.05, roll = Math.sin(t * 0.9) * 0.03;
    if (t < T.zero) { pitch = -0.08; yaw = 0.15 * Math.sin(t * 0.8); }              // looking up at the feed
    if (t >= T.zero && t < T.stormIn) { pitch = 0.22; roll = 0.08; }                  // dejected
    if (t >= T.stormIn && t < T.blast) { yaw = noise1(t * 3, 5) * 0.4; }              // looking around at the storm
    if (t >= T.rule2 && t < T.zap + 0.6) { pitch = -0.25; yaw = 0.15; }               // looks up at the late card
    if (t >= T.rule3 && t < T.cred) { yaw = 0.35; }                                   // toward the timer
    if (t >= T.oh && t < T.filmed) { yaw = 0; pitch = 0; roll = 0.12; }               // sly head tilt to camera
    if (t >= T.cta && t < T.follow) { pitch = 0.18; }                                 // looks down at the comment card
    if (t >= T.tick) { roll = 0.14 * win(t, T.tick, T.D, 0.15, 0.4); }
    body.rotation.set(pitch, yaw, roll + pTalk * 0.03 * Math.sin(t * 13));

    // arms
    const pointFace = win(t, T.rule1 + 0.05, T.wink + 0.5, 0.2, 0.25);
    const zapArm = win(t, T.zap - 0.25, T.zap + 0.35, 0.15, 0.3);
    const present = win(t, T.rule3 + 0.1, T.cred - 0.1, 0.25, 0.3);
    const flail = buried;
    const spread = win(t, T.blast, T.blast + 0.25, 0.04, 0.5);
    const shrug = win(t, T.tick - 0.1, T.D, 0.15, 0.4);
    const pointDown = win(t, T.cta + 0.2, T.follow + 0.2, 0.25, 0.3);
    const wave = win(t, T.follow + 0.3, T.end - 0.3, 0.25, 0.3);
    arms.R.rotation.set(-0.15 - pointFace * 2.2 - zapArm * 2.6 - pointDown * 0.9 + flail * noise1(t * 9, 1) * 0.8, 0, 0.18 + spread * 1.2 + shrug * 1.1 + wave * (1.9 + Math.sin(t * 12) * 0.35));
    arms.L.rotation.set(-0.15 - pTalk * 0.25 + flail * noise1(t * 9, 2) * 0.8, 0, -0.18 - spread * 1.2 - present * 1.4 - shrug * 1.1);

    // face mood
    let mood = 'neutral';
    if (t < L.L02.start) mood = 'tired';
    else if (t < T.zero) mood = 'tired';
    else if (t < T.stormIn) mood = 'sad';
    else if (t < L.L05.start) mood = 'shock';
    else if (t < T.blast + 0.2) mood = 'angry';
    else if (t < T.rule1) mood = 'neutral';
    else if (t < T.wink + 0.6) mood = 'happy';
    else if (t < T.rule3) mood = 'focus';
    else if (t < T.oh) mood = 'happy';
    else if (t < T.code) mood = 'sly';
    else if (t < T.codeEnd + 0.2) mood = 'code';
    else if (t < T.end) mood = 'happy';
    else mood = t < T.tick ? 'tired' : 'sly';
    const wink = t >= T.wink && t < T.wink + 0.5 ? 1 : 0;
    const look = { x: t < T.zero ? Math.sin(t * 1.3) * 0.5 : t >= T.rule3 && t < T.cred ? 0.7 : 0, y: t < T.zero ? -0.6 : 0 };
    drawFace(t, mood, pTalk, wink, look);
    const glowC = mood === 'sad' || mood === 'angry' ? 0xff4d6d : 0x7ef0c4;
    mintGlow.color.set(glowC); mintGlow.emissive.set(glowC); flameMat.color.set(glowC).multiplyScalar(1.5); botLight.color.set(glowC);
    antTip.scale.setScalar(1 + pTalk * 0.5 + zapArm * 1.5);
    flame.scale.set(1, 0.85 + 0.25 * Math.sin(t * 37) + 0.12 * Math.sin(t * 23) + spread * 1.5, 1);
    faceLight.intensity = 0.35 + pTalk * 0.4;
    shadowBlob.position.set(bot.position.x, 0.005, 0); shadowBlob.scale.setScalar(1.15 - (bot.position.y - 1.15) * 0.6);

    // ---- storm cards
    storm.forEach((m, i) => {
      const { from, slot, arrive, spin } = m.userData;
      const k = easeOut((t - arrive) / 0.55);
      if (t < arrive || wireOn) { m.visible = false; return; }
      m.visible = true;
      // slot is relative to the bot's rest height; cards press in as more arrive and jitter while stuck
      const press = 1 - buried * 0.12;
      const rel = v3b.set(slot.x * press, (slot.y - 1.15) * press, slot.z * press).add(bot.position);
      rel.x += noise1(t * 6, i) * 0.03; rel.y += noise1(t * 6, i + 9) * 0.03;
      v3.copy(from).lerp(rel, k);
      // blast: fly out radially
      const out = easeOut((t - T.blast) / 0.9);
      if (t >= T.blast) {
        const dir = v3.clone().sub(bot.position).normalize();
        v3.addScaledVector(dir, out * 9); v3.y += out * 1.5;
      }
      m.position.copy(v3);
      m.lookAt(bot.position.x + (v3.x - bot.position.x) * 3, v3.y, v3.z + 4);
      m.rotateZ(spin * (1 - k) * 3 + (t >= T.blast ? out * spin * 9 : 0));
      m.material.opacity = 1 - smooth((t - T.blast - 0.35) / 0.5);
      if (m.material.opacity < 0.01) m.visible = false;
    });

    // ---- the late card + zap
    lateBait.visible = t > T.rule2 - 0.1 && t < T.zap + 0.05 && !wireOn;
    if (lateBait.visible) {
      const k = easeOutBack((t - (T.rule2 - 0.1)) / 0.5);
      lateBait.position.set(0.25, lerp(4.4, 2.35, k), 0.3);
      lateBait.rotation.set(0, 0, lerp(0.5, -0.08, k) + Math.sin(t * 9) * 0.03);
    }
    const shardK = (t - T.zap) / 0.9;
    shards.visible = shardK > 0 && shardK < 1 && !wireOn;
    if (shards.visible) {
      const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
      for (let i = 0; i < SHARDS; i++) {
        const a = hash(i * 1.9) * Math.PI * 2, b = (hash(i * 3.1) - 0.5) * Math.PI;
        const r = easeOut(shardK) * (0.8 + hash(i) * 1.6);
        e.set(shardK * 9 * hash(i * 5), shardK * 7, 0); q.setFromEuler(e);
        const s = 1 - shardK;
        mtx.compose(new THREE.Vector3(0.25 + Math.cos(a) * Math.cos(b) * r, 2.35 + Math.sin(b) * r - shardK * shardK * 0.8, 0.3 + Math.sin(a) * Math.cos(b) * r), q, new THREE.Vector3(s, s, s));
        shards.setMatrixAt(i, mtx);
      }
      shards.instanceMatrix.needsUpdate = true;
    }

    // ---- shockwave
    const rk = (t - T.blast) / 0.75;
    ring.visible = ring2.visible = rk > 0 && rk < 1;
    if (ring.visible) {
      ring.material.color.set(0x9dffe0).multiplyScalar(3); ring2.material.color.set(0x9dffe0).multiplyScalar(3);
      ring.position.copy(bot.position); ring.scale.setScalar(0.4 + easeOut(rk) * 9); ring.material.opacity = (1 - rk) * 0.9;
      ring.lookAt(ring.position.x, ring.position.y, ring.position.z + 10);
      ring2.position.set(bot.position.x, 0.02, 0); ring2.scale.setScalar(0.4 + easeOut(rk) * 12); ring2.material.opacity = (1 - rk) * 0.7;
    }

    // ---- holo panels
    const credA = win(t, T.cred, T.oh - 0.1, 0.35, 0.35);
    [pTerm, pGraph, pId].forEach((P, i) => {
      const a = win(t, T.cred + i * 0.15, T.oh - 0.1, 0.35, 0.35);
      P.m.visible = a > 0.01;
      if (P.m.visible) { P.m.scale.set(1, Math.max(0.01, easeOutBack(a)), 1); P.m.position.y = P.baseY + Math.sin(t * 1.4 + i) * 0.03; }
    });
    if (pTerm.m.visible) drawTerm(t, credA);
    if (pGraph.m.visible) drawGraph(t, credA);
    if (pId.m.visible) drawId(t, credA);
    const codeA = win(t, T.code - 0.05, T.codeEnd, 0.18, 0.3) * 0.95 + 0.35 * win(t, T.filmed, T.code, 0.4, 0.05);
    codeL.m.visible = codeR.m.visible = codeA > 0.01;
    if (codeL.m.visible) { drawCode(codeL, t, codeA, 0); drawCode(codeR, t, codeA, 211); }

    // ---- wireframe reveal
    setWire(t >= T.code && t < T.codeEnd);
    floorMat.emissiveIntensity = wireOn ? 1.1 : floorMat.emissiveIntensity;

    return { M, T, wireOn, flashZero, blastFlash: win(t, T.blast, T.blast + 0.03, 0.01, 0.3), buried };
  }

  return { scene, update, T, L, bot };
}
