// Reel 1 — "437": camera, post-processing, kinetic type, captions, and the
// deterministic window.renderFrame(t) contract used by render.mjs.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { buildWorld, clamp01, lerp, smooth, easeOut, easeIn, easeInOut, easeOutBack, noise1, win, rr } from './scene.js';

const W = 1080, H = 1920;
const q = new URLSearchParams(location.search);
const SCALE = Number(q.get('scale') || 1), MSAA = Number(q.get('msaa') || 4);
const GW = Math.round(W * SCALE), GH = Math.round(H * SCALE);

await document.fonts.load('800 80px Inter'); await document.fonts.load('600 40px Inter');
await document.fonts.load('700 40px "Space Grotesk"'); await document.fonts.load('700 30px "JetBrains Mono"');
await document.fonts.ready;
for (const f of ['800 80px Inter', '700 40px "Space Grotesk"', '700 30px "JetBrains Mono"']) if (!document.fonts.check(f)) throw new Error('font failed: ' + f);

const TL = await (await fetch('./timeline.json')).json();
const SOURCE = (await (await fetch('./scene.js')).text()) + '\n' + (await (await fetch('./main.js')).text());

// ---------------------------------------------------------------- renderer + post
const glCanvas = document.createElement('canvas');
const renderer = new THREE.WebGLRenderer({ canvas: glCanvas, antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(1); renderer.setSize(GW, GH, false);
renderer.shadowMap.enabled = !q.has('noshadow'); renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.9;

const { scene, update, T, L } = buildWorld(renderer, TL, SOURCE);
const camera = new THREE.PerspectiveCamera(36, W / H, 0.05, 120);

const rt = new THREE.WebGLRenderTarget(GW, GH, { type: THREE.HalfFloatType, samples: MSAA });
const composer = new EffectComposer(renderer, rt);
composer.setPixelRatio(1); composer.setSize(GW, GH);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(GW / 2, GH / 2), 0.55, 0.35, 2.0);
composer.addPass(bloom);
composer.addPass(new OutputPass());
if (MSAA === 0) { const fx = new ShaderPass(FXAAShader); fx.material.uniforms.resolution.value.set(1 / GW, 1 / GH); composer.addPass(fx); }
const finish = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, time: { value: 0 }, ca: { value: 0.0015 }, flash: { value: 0 }, flashCol: { value: new THREE.Color(1, 1, 1) },
              glitch: { value: 0 }, vig: { value: 0.55 }, grain: { value: 0.045 }, res: { value: new THREE.Vector2(GW, GH) } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float time, ca, flash, glitch, vig, grain; uniform vec3 flashCol; uniform vec2 res; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){
      vec2 uv = vUv;
      // horizontal slice glitch
      float band = floor(uv.y * 38.0 + floor(time * 24.0) * 7.0);
      float off = (h(vec2(band, floor(time * 24.0))) - 0.5) * 0.09 * glitch * step(0.6, h(vec2(band * 1.7, 3.1)));
      uv.x += off;
      vec2 d = uv - 0.5; float r2 = dot(d, d);
      float a = ca + glitch * 0.012;
      vec3 c;
      c.r = texture2D(tDiffuse, uv + d * a * 1.0).r;
      c.g = texture2D(tDiffuse, uv).g;
      c.b = texture2D(tDiffuse, uv - d * a * 1.0).b;
      c *= 1.0 - vig * smoothstep(0.12, 0.62, r2);
      c += (h(uv * res + fract(time * 7.13) * 91.7) - 0.5) * grain;
      c = mix(c, flashCol, clamp(flash, 0.0, 1.0));
      gl_FragColor = vec4(c, 1.0);
    }`,
});
composer.addPass(finish);

// ---------------------------------------------------------------- camera direction
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const OPEN = { p: V(0, 1.38, 3.9), l: V(0, 1.33, 0), f: 36 };
const KEYS = [
  { t: 0, d: 0.001, ...OPEN },
  { t: 0.05, d: 3.3, p: V(0, 1.36, 3.5), l: V(0, 1.31, 0), f: 36, e: 'io' },
  { t: T.zero, d: 0.22, p: V(0, 1.2, 3.4), l: V(0, 1.2, 0), f: 36, e: 'out' },
  { t: T.stormIn, d: 1.5, p: V(0, 1.85, 6.4), l: V(0, 1.45, 0), f: 40, e: 'io' },
  { t: L.L05.start - 0.3, d: 0.45, p: V(0, 1.3, 3.5), l: V(0, 1.28, 0), f: 34, e: 'out' },
  { t: T.blast, d: 0.35, p: V(0, 1.6, 6.6), l: V(0, 1.55, 0), f: 42, e: 'out' },
  { t: T.calm, d: 2.4, p: V(0, 1.1, 5.0), l: V(0, 1.5, 0), f: 36, e: 'io' },
  { t: T.rule1 - 0.12, d: 0.32, p: V(0, 1.3, 3.3), l: V(0, 1.32, 0), f: 34, e: 'out' },
  { t: T.rule2 - 0.15, d: 0.4, p: V(-0.6, 1.25, 5.8), l: V(0.1, 2.05, 0), f: 40, e: 'out' },
  { t: T.rule3 - 0.1, d: 0.5, p: V(-0.9, 1.45, 5.6), l: V(-0.45, 1.5, 0), f: 38, e: 'out' },
  { t: T.cred - 0.1, d: 0.55, p: V(-2.6, 1.75, 6.4), l: V(0, 1.75, 0), f: 40, e: 'out' },
  { t: T.cred + 0.5, d: 3.0, p: V(2.3, 1.85, 6.5), l: V(0, 1.75, 0), f: 40, e: 'io' },
  { t: T.oh - 0.05, d: 0.45, p: V(0, 1.35, 3.7), l: V(0, 1.33, 0), f: 34, e: 'out' },
  { t: T.filmed, d: 4.4, p: V(0, 5.6, 14.5), l: V(0, 1.9, 0), f: 42, e: 'io' },
  { t: T.codeEnd, d: 0.55, p: V(0, 1.15, 6.2), l: V(0, 0.75, 0), f: 38, e: 'out' },
  { t: T.end - 0.35, d: 2.3, ...OPEN, e: 'io' },
];
const EASE = { io: easeInOut, out: easeOut, lin: (x) => clamp01(x) };
const SHAKES = [[T.zero, 0.45, 0.07], [T.blast, 0.7, 0.12], [T.rule1, 0.18, 0.03], [T.rule2, 0.18, 0.03], [T.rule3, 0.18, 0.03], [T.code, 0.3, 0.05], [T.tick, 0.2, 0.025]];
const cp = V(0, 0, 0), cl = V(0, 0, 0);
function placeCamera(t) {
  cp.copy(KEYS[0].p); cl.copy(KEYS[0].l); let fov = KEYS[0].f;
  for (let i = 1; i < KEYS.length; i++) {
    const k = KEYS[i]; if (t < k.t) break;
    const e = (EASE[k.e] || easeInOut)((t - k.t) / k.d);
    cp.lerp(k.p, e); cl.lerp(k.l, e); fov = lerp(fov, k.f, e);
  }
  // handheld drift + shake impulses
  cp.x += noise1(t * 0.25, 1) * 0.06; cp.y += noise1(t * 0.22, 2) * 0.04;
  let sh = 0; for (const [at, len, amp] of SHAKES) if (t >= at && t < at + len) sh += amp * (1 - (t - at) / len);
  cl.x += noise1(t * 31, 4) * sh; cl.y += noise1(t * 29, 5) * sh;
  camera.position.copy(cp); camera.fov = fov; camera.updateProjectionMatrix(); camera.lookAt(cl);
}

// ---------------------------------------------------------------- overlay canvas
const out = document.getElementById('c'); out.width = W; out.height = H;
const ctx = out.getContext('2d');
const MINT = '#7ef0c4', AMBER = '#ffc861', RED = '#ff4d5e', INK = '#ffffff';

function txt(s, x, y, { size = 80, font = 'Inter', weight = 800, color = INK, align = 'center', stroke = 0, glow = 0, glowColor = color, track = 0, alpha = 1 } = {}) {
  ctx.save(); ctx.globalAlpha *= alpha;
  ctx.font = `${weight} ${size}px ${font === 'Inter' ? 'Inter' : `"${font}"`}`; ctx.textAlign = align; ctx.textBaseline = 'middle';
  ctx.letterSpacing = `${track}px`;
  if (glow) { ctx.shadowColor = glowColor; ctx.shadowBlur = glow; }
  if (stroke) { ctx.lineJoin = 'round'; ctx.lineWidth = stroke; ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.strokeText(s, x, y); }
  ctx.fillStyle = color; ctx.fillText(s, x, y);
  ctx.restore();
}
const pop = (t, at, d = 0.32) => easeOutBack((t - at) / d);

// ---- counter (hook + ending)
function drawCounter(t) {
  const a1 = t < T.stormIn ? 1 - smooth((t - (T.stormIn - 0.35)) / 0.3) : 0;
  const a2 = smooth((t - (T.end - 0.3)) / 0.35);
  const a = Math.max(a1, a2); if (a <= 0.001) return;
  let n, label, color = INK, glowC = 'rgba(126,160,255,0.9)';
  if (t < L.L02.start) { n = Math.round(lerp(391, 437, easeOut(t / 2.9))); label = 'AI REELS YOU WATCHED THIS MONTH'; }
  else if (t < T.end - 0.3) {
    const k = easeIn((t - (L.L02.start + 0.25)) / (T.zero - L.L02.start - 0.25));
    n = Math.max(0, Math.round(lerp(437, 0, k))); label = 'THINGS YOU ACTUALLY BUILT';
    if (t >= T.zero) { n = 0; color = RED; glowC = 'rgba(255,60,80,0.95)'; }
  } else { n = t < T.tick ? 437 : 438; label = 'AI REELS YOU WATCHED THIS MONTH'; if (t >= T.tick) { color = INK; glowC = 'rgba(126,240,196,0.95)'; } }
  ctx.save(); ctx.globalAlpha = a;
  const cy = 430;
  const zk = t >= T.zero && t < T.stormIn ? pop(t, T.zero, 0.25) : 1;
  const tk = t >= T.tick ? pop(t, T.tick, 0.3) : 1;
  const sc = (t >= T.zero && t < T.stormIn ? lerp(1.35, 1, zk) : 1) * (t >= T.tick ? lerp(1.25, 1, tk) : 1);
  // label pill
  ctx.font = '800 34px Inter'; ctx.letterSpacing = '5px';
  const lw = ctx.measureText(label).width + 64;
  ctx.fillStyle = 'rgba(8,10,20,0.62)'; rr(ctx, (W - lw) / 2, cy - 250, lw, 66, 33); ctx.fill();
  ctx.strokeStyle = t >= T.zero && t < T.stormIn ? 'rgba(255,77,94,0.8)' : 'rgba(255,255,255,0.25)'; ctx.lineWidth = 2; ctx.stroke();
  ctx.restore();
  txt(label, W / 2, cy - 216, { size: 34, track: 5, color: 'rgba(255,255,255,0.92)', alpha: a });
  ctx.save(); ctx.globalAlpha = a; ctx.translate(W / 2, cy); ctx.scale(sc, sc);
  // digit roll offset for the ending tick
  txt(String(n), 0, 18, { size: 300, font: 'Space Grotesk', weight: 700, color, glow: 60, glowColor: glowC, stroke: 0 });
  ctx.restore();
}

// ---- "3 RULES" + the rules
function slam(t, at, until, small, big, { color = INK, bigSize = 168, y = 420 } = {}) {
  const a = win(t, at, until, 0.06, 0.18); if (a <= 0.001) return;
  const k = easeOutBack((t - at) / 0.28);
  ctx.save(); ctx.globalAlpha = a;
  txt(small, W / 2, y - 130, { size: 36, track: 8, color: MINT, alpha: smooth((t - at - 0.05) / 0.2) });
  ctx.translate(W / 2, y); const s = lerp(1.5, 1, k); ctx.scale(s, s);
  // motion ghosts on entry
  if (t - at < 0.18) for (let i = 1; i <= 3; i++) txt(big, 0, i * 16, { size: bigSize, font: 'Space Grotesk', weight: 700, color, alpha: 0.18 * (1 - (t - at) / 0.18) });
  txt(big, 0, 0, { size: bigSize, font: 'Space Grotesk', weight: 700, color, glow: 40, glowColor: 'rgba(0,0,0,0.9)' });
  ctx.restore();
}
function drawRules(t) {
  slam(t, L.L06.start + 0.1, T.rule1 - 0.12, 'THIS ACCOUNT HAS', '3 RULES.');
  slam(t, T.rule1, T.rule2 - 0.12, 'RULE 01', 'NO FACE.');
  const tagA = win(t, T.wink, T.rule2 - 0.12, 0.1, 0.15);
  if (tagA > 0) txt('(okay, one.)', W / 2 + 150, 560, { size: 50, weight: 800, color: MINT, alpha: tagA, stroke: 10 });
  slam(t, T.rule2, T.rule3 - 0.12, 'RULE 02', 'NO HYPE.');
  slam(t, T.rule3, T.cred - 0.15, 'RULE 03', 'BUILD IT', { bigSize: 168, y: 380 });
  const a = win(t, T.rule3 + 0.15, T.cred - 0.15, 0.2, 0.18);
  if (a > 0) {
    // 10-minute timer ring
    const cx = W / 2, cy = 640, r = 110;
    const prog = clamp01((t - T.rule3 - 0.3) / 2.4);
    ctx.save(); ctx.globalAlpha = a;
    ctx.lineWidth = 18; ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = MINT; ctx.lineCap = 'round'; ctx.shadowColor = MINT; ctx.shadowBlur = 24;
    ctx.beginPath(); ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + prog * Math.PI * 2); ctx.stroke();
    ctx.restore();
    const secs = Math.round(lerp(600, 0, prog));
    txt(`${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`, cx, cy + 4, { size: 66, font: 'JetBrains Mono', weight: 700, alpha: a });
    txt('IN 10 MINUTES', W / 2, 800, { size: 44, track: 6, color: MINT, alpha: a, stroke: 8 });
  }
}

// ---- reveal
function strikeWord(t, word, at, y) {
  const a = win(t, at, T.code - 0.05, 0.12, 0.08); if (a <= 0) return;
  const k = pop(t, at, 0.3);
  txt(word, W / 2, y, { size: 150, font: 'Space Grotesk', weight: 700, alpha: a * clamp01(k), glow: 30, glowColor: 'rgba(0,0,0,0.9)' });
  const sk = easeOut((t - at - 0.35) / 0.25);
  if (sk > 0) {
    ctx.save(); ctx.globalAlpha = a; ctx.font = '700 150px "Space Grotesk"'; const w = ctx.measureText(word).width + 40;
    ctx.strokeStyle = RED; ctx.lineWidth = 16; ctx.lineCap = 'round'; ctx.shadowColor = RED; ctx.shadowBlur = 20;
    ctx.beginPath(); ctx.moveTo(W / 2 - w / 2, y + 8); ctx.lineTo(W / 2 - w / 2 + w * sk, y - 6); ctx.stroke(); ctx.restore();
  }
}
function drawReveal(t, frame) {
  if (t >= T.filmed && t < T.code) { txt('NOBODY', W / 2, 260, { size: 40, track: 10, color: MINT, alpha: win(t, T.filmed, T.code, 0.15, 0.08) }); }
  strikeWord(t, 'FILMED.', T.filmed + 0.1, 380);
  strikeWord(t, 'EDITED.', T.edited, 545);
  const a = win(t, T.code, T.codeEnd, 0.04, 0.2);
  if (a > 0) {
    const k = pop(t, T.code, 0.3);
    ctx.save(); ctx.globalAlpha = a; ctx.translate(W / 2, 380); const s = lerp(1.4, 1, k); ctx.scale(s, s);
    txt("IT'S CODE.", 0, 0, { size: 140, font: 'JetBrains Mono', weight: 700, color: MINT, glow: 50, glowColor: 'rgba(61,255,176,0.8)' });
    ctx.restore();
    const fa = a * smooth((t - L.L13.start - 0.7) / 0.25);
    txt(`frame ${String(frame).padStart(4, '0')} / ${TL.frames}`, W / 2, 520, { size: 52, font: 'JetBrains Mono', weight: 700, alpha: fa, color: INK, stroke: 8 });
    txt(`renderFrame(${(frame / TL.fps).toFixed(3)})`, W / 2, 590, { size: 38, font: 'JetBrains Mono', weight: 700, alpha: fa * 0.85, color: MINT, stroke: 8 });
  }
}

// ---- CTA: comment card, then follow card
function avatar(cx, cy, r) {
  ctx.save(); ctx.fillStyle = '#f3f0ea'; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#06080b'; rr(ctx, cx - r * 0.7, cy - r * 0.52, r * 1.4, r * 1.04, r * 0.3); ctx.fill();
  ctx.fillStyle = MINT; rr(ctx, cx - r * 0.38, cy - r * 0.25, r * 0.2, r * 0.32, r * 0.1); ctx.fill(); rr(ctx, cx + r * 0.18, cy - r * 0.25, r * 0.2, r * 0.32, r * 0.1); ctx.fill();
  ctx.fillRect(cx - r * 0.18, cy + r * 0.22, r * 0.36, r * 0.07); ctx.restore();
}
function drawCTA(t) {
  const a = win(t, T.cta, T.follow - 0.05, 0.3, 0.2);
  const y0 = 1150;
  if (a > 0) {
    const k = easeOutBack((t - T.cta) / 0.45);
    ctx.save(); ctx.globalAlpha = a; ctx.translate(0, lerp(220, 0, k));
    ctx.fillStyle = 'rgba(16,18,24,0.94)'; rr(ctx, 90, y0, 900, 190, 44); ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,0.14)'; ctx.lineWidth = 2; ctx.stroke();
    avatar(170, y0 + 95, 44);
    const word = 'SOURCE'; const n = Math.floor(clamp01((t - T.cta - 0.55) / 0.75) * word.length);
    ctx.font = '800 64px Inter'; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    if (n === 0) { ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.font = '600 46px Inter'; ctx.fillText('Add a comment…', 240, y0 + 95); }
    else { ctx.fillStyle = INK; ctx.fillText(word.slice(0, n), 240, y0 + 97); if (Math.floor(t * 4) % 2 === 0 && n < word.length) { const w = ctx.measureText(word.slice(0, n)).width; ctx.fillStyle = MINT; ctx.fillRect(248 + w, y0 + 60, 6, 72); } }
    const sent = t > T.cta + 1.45;
    ctx.fillStyle = sent ? MINT : 'rgba(126,240,196,0.35)'; ctx.beginPath(); ctx.arc(905, y0 + 95, 48, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#06110d'; ctx.beginPath(); ctx.moveTo(885, y0 + 70); ctx.lineTo(932, y0 + 95); ctx.lineTo(885, y0 + 120); ctx.lineTo(893, y0 + 95); ctx.closePath(); ctx.fill();
    ctx.restore();
    // reply bubble
    const ra = smooth((t - T.cta - 1.6) / 0.25) * a;
    if (ra > 0) {
      const rk = easeOutBack((t - T.cta - 1.6) / 0.35);
      ctx.save(); ctx.globalAlpha = ra; ctx.translate(W / 2, y0 - 70); ctx.scale(rk, rk);
      ctx.fillStyle = MINT; rr(ctx, -300, -52, 600, 104, 52); ctx.fill();
      ctx.restore();
      txt('code sent to your DMs ✓', W / 2, y0 - 68, { size: 44, weight: 800, color: '#06110d', alpha: ra * clamp01(rk) });
    }
  }
  const b = win(t, T.follow, T.end - 0.3, 0.3, 0.25);
  if (b > 0) {
    const k = easeOutBack((t - T.follow) / 0.45);
    ctx.save(); ctx.globalAlpha = b; ctx.translate(0, lerp(220, 0, k));
    ctx.fillStyle = 'rgba(16,18,24,0.94)'; rr(ctx, 90, y0, 900, 190, 44); ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,0.14)'; ctx.lineWidth = 2; ctx.stroke();
    avatar(180, y0 + 95, 56);
    ctx.font = '800 50px Inter'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillStyle = INK; ctx.fillText('rithikgour.ai', 262, y0 + 72);
    ctx.font = '600 32px Inter'; ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fillText('build > scroll', 262, y0 + 126);
    const tapped = t > T.follow + 1.15;
    const press = win(t, T.follow + 1.0, T.follow + 1.15, 0.06, 0.12);
    ctx.translate(845, y0 + 95); ctx.scale(1 - press * 0.08, 1 - press * 0.08);
    ctx.fillStyle = tapped ? 'rgba(255,255,255,0.12)' : MINT; rr(ctx, -110, -46, 220, 92, 30); ctx.fill();
    ctx.font = '800 40px Inter'; ctx.textAlign = 'center'; ctx.fillStyle = tapped ? INK : '#06110d'; ctx.fillText(tapped ? 'Following' : 'Follow', 0, 3);
    ctx.restore();
    // tap ripple
    const rp = (t - (T.follow + 1.05)) / 0.5;
    if (rp > 0 && rp < 1) { ctx.save(); ctx.globalAlpha = (1 - rp) * b; ctx.strokeStyle = INK; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(845, y0 + 95, 30 + rp * 120, 0, Math.PI * 2); ctx.stroke(); ctx.restore(); }
  }
}

// ---- karaoke captions (chunks of a few words, active word lit)
const NOCAP = new Set(['L03', 'L07', 'L08', 'L16']);
const CHUNKS = [];
for (const l of TL.lines) {
  if (NOCAP.has(l.id)) continue;
  const words = l.caption.split(' ');
  const weights = words.map((w) => Math.max(2, w.replace(/[^\w]/g, '').length + 1.5));
  const total = weights.reduce((a, b) => a + b, 0);
  let acc = 0; const times = weights.map((w) => { const s = l.start + (acc / total) * (l.end - l.start); acc += w; return s; });
  // chunk by width: at most ~16 characters per chunk
  let cur = [];
  const flush = () => { if (cur.length) CHUNKS.push({ line: l, words: cur }); cur = []; };
  words.forEach((w, i) => {
    const len = cur.reduce((a, c) => a + c.w.length + 1, 0) + w.length;
    if (cur.length && len > 15) flush();
    cur.push({ w, t: times[i], hl: l.hl.includes(w) });
    if (/[.?!]$/.test(w) && i < words.length - 1) flush();
  });
  flush();
}
CHUNKS.forEach((c, i) => { const next = CHUNKS[i + 1]; c.start = c.words[0].t - 0.04; c.end = next && next.line === c.line ? next.words[0].t - 0.04 : Math.min(c.line.end + 0.35, next ? next.start - 0.02 : 1e9); });
CHUNKS[0].start = 0; // hook text on frame 0

function drawCaptions(t) {
  const c = CHUNKS.find((k) => t >= k.start && t < k.end); if (!c) return;
  const y = t >= T.cta - 0.1 && t < T.end ? 330 : t >= T.cred - 0.1 && t < T.oh - 0.05 ? 470 : 1470;
  const size = 82;
  ctx.save(); ctx.font = `800 ${size}px Inter`; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  const space = size * 0.36;
  const widths = c.words.map((w) => ctx.measureText(w.w).width);
  const total = widths.reduce((a, b) => a + b, 0) + space * (c.words.length - 1);
  const k = easeOutBack((t - c.start) / 0.18);
  ctx.translate(W / 2, y); ctx.scale(lerp(0.85, 1, k), lerp(0.85, 1, k)); ctx.translate(-W / 2, -y);
  let x = (W - total) / 2;
  c.words.forEach((w, i) => {
    const spoken = t >= w.t - 0.02;
    const active = spoken && (i === c.words.length - 1 || t < c.words[i + 1].t);
    const col = w.hl && spoken ? (c.line.id === 'L03' ? RED : MINT) : spoken ? INK : 'rgba(255,255,255,0.55)';
    ctx.save();
    const wx = x + widths[i] / 2;
    if (active) { ctx.translate(wx, y); ctx.scale(1.05, 1.05); ctx.translate(-wx, -y); }
    ctx.lineWidth = 16; ctx.strokeStyle = 'rgba(0,0,0,0.9)'; ctx.strokeText(w.w, x, y);
    ctx.fillStyle = col; ctx.fillText(w.w, x, y);
    ctx.restore();
    x += widths[i] + space;
  });
  ctx.restore();
}


// ---- reel cover: everything important sits inside the centred 3:4 window (y 240-1680) used by the profile grid
function drawCover() {
  ctx.fillStyle = 'rgba(4,5,12,0.35)'; ctx.fillRect(0, 0, W, H);
  ctx.save(); ctx.font = '800 38px Inter'; ctx.letterSpacing = '6px';
  const label = 'AI REELS YOU WATCHED'; const lw = ctx.measureText(label).width + 70;
  ctx.fillStyle = 'rgba(8,10,20,0.75)'; rr(ctx, (W - lw) / 2, 352, lw, 72, 36); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 2; ctx.stroke(); ctx.restore();
  txt('AI REELS YOU WATCHED', W / 2, 390, { size: 38, track: 6, color: 'rgba(255,255,255,0.95)' });
  txt('437', W / 2, 600, { size: 330, font: 'Space Grotesk', weight: 700, color: INK, glow: 60, glowColor: 'rgba(126,160,255,0.95)' });
  txt('BUILT: 0', W / 2, 820, { size: 120, font: 'Space Grotesk', weight: 700, color: RED, glow: 40, glowColor: 'rgba(255,60,80,0.9)', stroke: 12 });
}

// ---------------------------------------------------------------- contract
function renderFrame(t) {
  const frame = Math.round(t * TL.fps);
  const S = update(t);
  placeCamera(t);
  bloom.strength = (q.has('bloom') ? Number(q.get('bloom')) : 1) * (0.55 + S.blastFlash * 1.2 + (S.wireOn ? 0.45 : 0));
  finish.uniforms.time.value = t;
  finish.uniforms.flash.value = S.blastFlash * 0.55 + S.flashZero * 0.18;
  finish.uniforms.flashCol.value.set(S.flashZero > S.blastFlash ? 0xff3344 : 0xeafff7);
  finish.uniforms.glitch.value = Math.max(win(t, T.zero, T.zero + 0.05, 0.01, 0.35), win(t, T.code - 0.08, T.code + 0.05, 0.03, 0.25), win(t, T.codeEnd - 0.05, T.codeEnd + 0.05, 0.03, 0.2));
  finish.uniforms.ca.value = 0.0012 + S.buried * 0.004;
  composer.render();
  ctx.globalAlpha = 1; ctx.drawImage(glCanvas, 0, 0, W, H);
  if (q.has('cover')) { drawCover(); return frame; }
  drawCounter(t); drawRules(t); drawReveal(t, frame); drawCTA(t); drawCaptions(t);
  return frame;
}

window.renderFrame = renderFrame;
window.DURATION = TL.duration; window.FPS = TL.fps; window.FRAMES = TL.frames;
window.BEATS = TL.lines.map((l) => ({ id: l.id, mid: (l.start + l.end) / 2 }));
renderFrame(0);
window.READY = true;
