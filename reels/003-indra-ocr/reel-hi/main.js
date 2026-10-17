// Reel 003 "Indra OCR": one continuous 3D take through a lit studio world, type and captions on top.
// Deterministic: renderFrame(t) depends only on t, constants, timeline.json and beats.json.
import { createWorld, sstep } from './engine3d.js';
import { C, SANS, MONO, clamp01, lerp, easeOut, easeInOut, smooth, backOut, makeText, makeClock, makeCaptions, makeDither } from './overlay.js';

await Promise.all(['500 40px Geist', '600 40px Geist', '700 40px Geist', '900 40px Geist', '500 34px "Geist Mono"', '600 34px "Geist Mono"', '700 34px "Geist Mono"'].map((f) => document.fonts.load(f)));
const TL = await (await fetch('./timeline.json')).json();
const BEATS = (await (await fetch('./beats.json')).json()).beats;
const { L, wordAt, onBeat, D } = makeClock(TL, BEATS);
// language-aware: named word anchors + localised on-screen strings from timeline.json (English defaults)
const AN = (id, key, d) => { const a = L[id].anchors; return a && key in a ? a[key] : d; };
const STR = TL.strings || {}, tx = (k, d) => STR[k] ?? d;
const W = 1080, H = 1920, out = document.getElementById('c'); out.width = W; out.height = H;
const g = out.getContext('2d');
const { text, measure, rr } = makeText(g);
const dither = makeDither(g, W, H);

const T = { s2: onBeat(L.V02.start), s3: onBeat(L.V03.start), s4: onBeat(L.V04.start), s5: onBeat(L.V05.start), s6: onBeat(L.V07.start), s7: onBeat(L.V08.start) };
const win = (t, a, b, fi = 0.3, fo = 0.25) => Math.min(smooth((t - a) / fi), 1 - smooth((t - (b - fo)) / fo));

// ------------------------------------------------------------------ world
const world = createWorld({ accent: '#7EF0C4', rim: '#4D8BFF' });
const { THREE, scene } = world;

// page textures: a printed page, and the same page "as Markdown"
function pageTex(kind, seed) {
  const c = document.createElement('canvas'); c.width = 340; c.height = 440; const x = c.getContext('2d');
  let s = seed; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  if (kind === 'paper') {
    x.fillStyle = '#F2F1EC'; x.fillRect(0, 0, 340, 440);
    x.fillStyle = '#2A2D33'; x.fillRect(30, 34, 170, 18);
    for (let i = 0; i < 15; i++) { x.fillStyle = 'rgba(40,44,52,.55)'; x.fillRect(30, 76 + i * 22, 220 + rnd() * 70, 7); }
    x.strokeStyle = 'rgba(40,44,52,.35)'; x.lineWidth = 2; x.strokeRect(30, 330, 280, 80);
    for (let i = 1; i < 3; i++) { x.beginPath(); x.moveTo(30, 330 + i * 27); x.lineTo(310, 330 + i * 27); x.stroke(); }
  } else {
    x.fillStyle = '#0B1014'; x.fillRect(0, 0, 340, 440);
    x.fillStyle = '#7EF0C4'; x.font = '700 30px "Geist Mono"'; x.fillText('#', 30, 56); x.fillRect(58, 36, 140, 18);
    for (let i = 0; i < 12; i++) { x.fillStyle = i % 4 === 0 ? 'rgba(126,240,196,.75)' : 'rgba(220,228,236,.5)'; x.fillRect(i % 4 === 0 ? 30 : 48, 86 + i * 24, 180 + rnd() * 90, 7); }
    x.strokeStyle = 'rgba(126,240,196,.6)'; x.lineWidth = 2; x.strokeRect(30, 380, 280, 36);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
const PW = 0.85, PH = 1.1, PT = 0.012;
const pageGeo = new THREE.BoxGeometry(PW, PT, PH);
const sideMat = new THREE.MeshStandardMaterial({ color: 0xdedcd4, roughness: 0.9 });
const paperMats = [11, 23, 37].map((sd) => { const f = new THREE.MeshStandardMaterial({ map: pageTex('paper', sd), roughness: 0.9, color: 0xa8a69f }); return [sideMat, sideMat, f, f, sideMat, sideMat]; });
const mdMats = [5, 9].map((sd) => { const f = new THREE.MeshBasicMaterial({ map: pageTex('md', sd), toneMapped: false }); return [sideMat, sideMat, f, f, sideMat, sideMat]; });

// station A: a stack of documents, a scanning light plane above it, and a stream of pages through the light
const stack = new THREE.Group(); scene.add(stack);
{ const dummy = new THREE.Object3D(); const ims = paperMats.map((mt) => { const im = new THREE.InstancedMesh(pageGeo, mt, 16); im.count = 0; im.castShadow = true; im.receiveShadow = true; stack.add(im); return im; });
  for (let i = 0; i < 46; i++) { dummy.position.set(Math.sin(i * 1.7) * 0.025, PT / 2 + i * (PT + 0.001), Math.cos(i * 2.3) * 0.025); dummy.rotation.set(0, Math.sin(i * 0.9) * 0.05, 0); dummy.updateMatrix();
    const im = ims[i % 3]; im.setMatrixAt(im.count++, dummy.matrix); }
  ims.forEach((im) => { im.instanceMatrix.needsUpdate = true; }); }
const BEAM_Y = 1.25;
const beamC = document.createElement('canvas'); beamC.width = 512; beamC.height = 64; const bx = beamC.getContext('2d');
const bgd = bx.createLinearGradient(0, 0, 0, 64); bgd.addColorStop(0, 'rgba(126,240,196,0)'); bgd.addColorStop(0.5, 'rgba(126,240,196,1)'); bgd.addColorStop(1, 'rgba(126,240,196,0)');
bx.fillStyle = bgd; bx.fillRect(0, 0, 512, 64);
const beam = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.0), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(beamC), transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
beam.rotation.x = -Math.PI / 2; beam.position.set(0, BEAM_Y, 0); scene.add(beam);
const beamFrame = new THREE.Mesh(new THREE.RingGeometry(1.25, 1.29, 4, 1), new THREE.MeshBasicMaterial({ color: 0x7ef0c4, toneMapped: false, side: THREE.DoubleSide }));
beamFrame.rotation.x = -Math.PI / 2; beamFrame.rotation.z = Math.PI / 4; beamFrame.position.set(0, BEAM_Y, 0); scene.add(beamFrame);
const beamLight = new THREE.PointLight(0x7ef0c4, 12, 6, 2); beamLight.position.set(0, BEAM_Y + 0.2, 0.3); scene.add(beamLight);

// station B: the model itself, a small glass chip the stream flows into
const CHIP = new THREE.Vector3(3.3, 0.55, -3.6);
const chip = new THREE.Mesh(new world.RoundedBoxGeometry(0.9, 0.9, 0.9, 6, 0.12), new THREE.MeshPhysicalMaterial({ color: 0x0f1a17, metalness: 0.2, roughness: 0.08, transmission: 0.0, clearcoat: 1, clearcoatRoughness: 0.05, emissive: 0x0b3a2c, emissiveIntensity: 0.6 }));
chip.position.copy(CHIP); chip.castShadow = true; scene.add(chip);
const chipEdges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(0.92, 0.92, 0.92)), new THREE.LineBasicMaterial({ color: 0x7ef0c4, transparent: true, opacity: 0.8 }));
chipEdges.position.copy(CHIP); scene.add(chipEdges);
const chipLight = new THREE.PointLight(0x7ef0c4, 25, 5, 2); chipLight.position.copy(CHIP).add(new THREE.Vector3(0, 0.9, 0.6)); scene.add(chipLight);

// the page stream: stack top -> up through the beam -> arcs right into the chip
const STREAM_T0 = 0.1, DT = 0.09, LIFE = 2.0, POOL = 26;
const streamPts = [new THREE.Vector3(0, 0.6, 0), new THREE.Vector3(0, 1.25, -0.05), new THREE.Vector3(0.75, 1.75, -0.7), new THREE.Vector3(2.0, 1.85, -2.1), new THREE.Vector3(3.0, 1.3, -3.3), CHIP.clone()];
const streamCurve = new THREE.CatmullRomCurve3(streamPts, false, 'centripetal');
const pool = [];
for (let i = 0; i < POOL; i++) { const m = new THREE.Mesh(pageGeo, paperMats[0]); scene.add(m); pool.push(m); }
function updateStream(t, until) {
  const latest = Math.floor((t - STREAM_T0) / DT);
  for (let j = 0; j < POOL; j++) {
    const m = pool[j], n = latest - j, te = STREAM_T0 + n * DT, u = (t - te) / LIFE;
    if (n < 0 || u < 0 || u > 1 || te > until) { m.visible = false; continue; }
    m.visible = true;
    const p = streamCurve.getPoint(u); m.position.copy(p);
    const passed = p.y > BEAM_Y + 0.02 || u > 0.2;
    m.material = passed ? mdMats[n % 2] : paperMats[n % 3];
    m.rotation.set(-easeInOut(u * 1.6) * 0.9 + 0.05 * Math.sin(n), 0.15 * Math.sin(n * 0.7) + u * 0.7, 0.04 * Math.cos(n));
    const sc = (u > 0.84 ? lerp(1, 0.12, (u - 0.84) / 0.16) : 1) * 0.82; m.scale.setScalar(sc);
  }
}

// station C: the race. Two lanes; Tesseract sends one page per 0.9 s, Indra ~17x as many.
const LANE_Z0 = -6.5, LANE_Z1 = -17;
function lane(x, color) {
  const g2 = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.02, LANE_Z0 - LANE_Z1), new THREE.MeshStandardMaterial({ color: 0x0d1117, roughness: 0.4, metalness: 0.4 }));
  g2.position.set(x, 0.01, (LANE_Z0 + LANE_Z1) / 2); g2.receiveShadow = true; scene.add(g2);
  for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.025, LANE_Z0 - LANE_Z1), new THREE.MeshBasicMaterial({ color, toneMapped: false })); e.position.set(x + s * 0.63, 0.02, (LANE_Z0 + LANE_Z1) / 2); scene.add(e); }
}
lane(-0.85, 0x6b7280); lane(0.85, 0x7ef0c4);
const laneGeo = new THREE.BoxGeometry(0.6, 0.01, 0.78);
const raceSlow = new THREE.InstancedMesh(laneGeo, paperMats[0], 6), raceFast = new THREE.InstancedMesh(laneGeo, mdMats[0], 70);
scene.add(raceSlow, raceFast); raceSlow.frustumCulled = raceFast.frustumCulled = false;
const SLOW_DT = 0.9, FAST_DT = 0.9 / 17, LANE_TRAVEL = 2.4;
const dmy = new THREE.Object3D();
function laneUpdate(im, x, dt, t, t0, t1) {
  const latest = Math.floor((t - t0) / dt); let c = 0;
  for (let j = 0; j < im.instanceMatrix.count; j++) {
    const n = latest - j, te = t0 + n * dt, u = (t - te) / LANE_TRAVEL;
    if (n < 0 || u < 0 || u > 1 || t < t0 || t > t1) continue;
    dmy.position.set(x, 0.06 + Math.sin(u * Math.PI) * 0.04, lerp(LANE_Z0 - 0.3, LANE_Z1 + 0.5, easeInOut(u) * 0.2 + u * 0.8));
    dmy.rotation.set(0, Math.sin(n) * 0.06, 0); dmy.updateMatrix(); im.setMatrixAt(c++, dmy.matrix);
  }
  im.count = c; im.visible = c > 0; im.instanceMatrix.needsUpdate = true;
}

// station D: the terminal
const CMD1 = 'pip install indra-ocr', CMD2 = 'indra-ocr *.pdf --out results/';
const OUTS = ['invoice-4821.md', 'lease-agreement.md', 'paper-attention.md', 'meeting-notes.md'];
const K = {};
function sched() {
  K.c1 = L.V04.start + 0.05; K.c1e = K.c1 + CMD1.length / 20;
  K.c2 = Math.max(K.c1e + 0.35, wordAt('V04', AN('V04', 'cmd2', 2)) - 0.1); K.c2e = K.c2 + CMD2.length / 22;
  K.o0 = K.c2e + 0.2;
}
sched();
const typed = (s, t0, cps, t) => s.slice(0, Math.max(0, Math.floor((t - t0) * cps)));
const term = world.panel({ w: 2.2, h: 1.9, px: 1100, draw: (x, t, w, h) => {
  x.fillStyle = '#0A0D12'; x.fillRect(0, 0, w, h);
  x.fillStyle = 'rgba(255,255,255,.05)'; x.fillRect(0, 0, w, 74);
  ['#FF5F57', '#FEBC2E', '#28C840'].forEach((c, i) => { x.fillStyle = c; x.beginPath(); x.arc(44 + i * 32, 37, 10, 0, 7); x.fill(); });
  x.font = '500 28px "Geist Mono"'; x.fillStyle = 'rgba(243,245,248,.45)'; x.textAlign = 'center'; x.fillText('~/docs — zsh', w / 2, 46); x.textAlign = 'left';
  x.font = '600 50px "Geist Mono"'; let y = 170;
  const prompt = (cmd, cur) => { x.fillStyle = '#7EF0C4'; x.fillText('❯', 44, y); x.fillStyle = '#E8ECEF'; x.fillText(cmd, 96, y); if (cur && Math.floor(t * 2.2) % 2 === 0) { x.fillStyle = '#7EF0C4'; x.fillRect(96 + x.measureText(cmd).width, y - 40, 24, 52); } };
  prompt(t < K.c1e ? typed(CMD1, K.c1, 20, t) : CMD1, t < K.c1e + 0.2);
  if (t > K.c1e + 0.12) { y += 70; x.font = '500 38px "Geist Mono"'; x.fillStyle = 'rgba(243,245,248,.5)'; x.fillText('Successfully installed indra-ocr', 44, y); x.font = '600 50px "Geist Mono"'; }
  if (t > K.c2) { y += 92; prompt(t < K.c2e ? typed(CMD2, K.c2, 22, t) : CMD2, t < K.c2e + 0.2); }
  OUTS.forEach((o, i) => {
    const a = clamp01((t - (K.o0 + i * 0.16)) / 0.15); if (a <= 0) return;
    y += 66; x.globalAlpha = a; x.font = '600 42px "Geist Mono"'; x.fillStyle = '#7EF0C4'; x.fillText('✓', 44, y); x.fillStyle = 'rgba(232,236,239,.9)'; x.fillText('results/' + o, 90, y); x.globalAlpha = 1;
  });
  x.font = '500 28px "Geist Mono"'; x.fillStyle = 'rgba(243,245,248,.4)'; x.textAlign = 'right'; x.fillText('example output', w - 36, h - 30); x.textAlign = 'left';
}});
term.group.position.set(0, 1.5, -21); term.group.rotation.y = 0;

// station E: a scanned page with layout boxes, and the Markdown it becomes
const SCAN = { x: -1.0, z: -27 }, MD = { x: 1.0, z: -27 };
const scanP = world.panel({ w: 1.5, h: 1.97, px: 760, draw: (x, t, w, h) => {
  x.fillStyle = '#F2F1EC'; x.fillRect(0, 0, w, h);
  const blocks = [[50, 60, 420, 50, 'title'], [50, 140, 640, 150, 'text'], [50, 320, 640, 120, 'list'], [50, 470, 640, 300, 'table'], [50, 800, 400, 120, 'text']];
  blocks.forEach(([bx2, by, bw, bh, kind]) => {
    if (kind === 'title') { x.fillStyle = '#23262C'; x.fillRect(bx2, by, bw, 40); }
    else if (kind === 'table') { x.strokeStyle = 'rgba(35,38,44,.6)'; x.lineWidth = 3; x.strokeRect(bx2, by, bw, bh); for (let i = 1; i < 5; i++) { x.beginPath(); x.moveTo(bx2, by + i * 60); x.lineTo(bx2 + bw, by + i * 60); x.stroke(); } for (let i = 1; i < 3; i++) { x.beginPath(); x.moveTo(bx2 + i * 213, by); x.lineTo(bx2 + i * 213, by + bh); x.stroke(); } }
    else { for (let i = 0; i < Math.floor(bh / 30); i++) { x.fillStyle = 'rgba(35,38,44,.55)'; x.fillRect(bx2 + (kind === 'list' ? 30 : 0), by + 10 + i * 30, bw - 40 - (i * 37) % 90, 10); if (kind === 'list') x.fillRect(bx2, by + 8 + i * 30, 12, 12); } }
  });
  const hand = [50, 950, 560, 70];
  x.strokeStyle = 'rgba(30,60,140,.8)'; x.lineWidth = 4; x.beginPath(); for (let i = 0; i < 40; i++) { const px2 = hand[0] + i * 13, py = hand[1] + 35 + Math.sin(i * 1.7) * 14 + Math.sin(i * 0.6) * 6; i ? x.lineTo(px2, py) : x.moveTo(px2, py); } x.stroke();
  // layout boxes, drawn in reading order as the camera arrives
  const t0 = L.V05.start + 0.1, cols = { title: '#7EF0C4', text: '#6B97FF', list: '#FFC861', table: '#FF8FA3' };
  blocks.forEach(([bx2, by, bw, bh, kind], i) => {
    const a = clamp01((t - (t0 + i * 0.22)) / 0.25); if (a <= 0) return;
    x.globalAlpha = a; x.strokeStyle = cols[kind]; x.lineWidth = 5; x.strokeRect(bx2 - 12, by - 12, bw + 24, bh + 24);
    x.fillStyle = cols[kind]; x.font = '700 26px "Geist Mono"'; x.fillText(`${i + 1} ${kind}`, bx2 - 10, by - 20); x.globalAlpha = 1;
  });
  const ha = clamp01((t - (L.V06.start + 0.1)) / 0.25);
  if (ha > 0) { x.globalAlpha = ha; x.strokeStyle = '#FF5E6C'; x.lineWidth = 6; x.setLineDash([16, 12]); x.strokeRect(hand[0] - 12, hand[1] - 6, hand[2] + 24, hand[3] + 20); x.setLineDash([]); x.fillStyle = '#FF5E6C'; x.font = '700 30px "Geist Mono"'; x.fillText('handwriting: not yet', hand[0] - 10, hand[1] - 16); x.globalAlpha = 1; }
}});
scanP.group.position.set(SCAN.x, 1.35, SCAN.z); scanP.group.rotation.y = 0.12;
const mdP = world.panel({ w: 1.5, h: 1.97, px: 760, draw: (x, t, w, h) => {
  x.fillStyle = '#0A0D12'; x.fillRect(0, 0, w, h);
  x.font = '600 26px "Geist Mono"'; x.fillStyle = 'rgba(243,245,248,.45)'; x.fillText('invoice-4821.md', 40, 50);
  const lines = [['# Invoice 4821', '#7EF0C4', 34], ['', 0, 0], ['Billed to: Acme Labs', '#E8ECEF', 28], ['Due: 30 Oct 2026', '#E8ECEF', 28], ['', 0, 0], ['- 3 seats, Pro plan', '#FFC861', 28], ['- onboarding call', '#FFC861', 28], ['', 0, 0], ['<table>', '#FF8FA3', 26], ['  <tr><td>Seats</td><td>3</td></tr>', '#FF8FA3', 26], ['  <tr><td>Total</td><td>$90</td></tr>', '#FF8FA3', 26], ['</table>', '#FF8FA3', 26]];
  const t0 = L.V05.start + 0.4;
  lines.forEach(([s, col, size], i) => {
    if (!s) return; const a = clamp01((t - (t0 + i * 0.09)) / 0.15); if (a <= 0) return;
    x.globalAlpha = a; x.font = `600 ${size}px "Geist Mono"`; x.fillStyle = col; x.fillText(s, 40, 120 + i * 62); x.globalAlpha = 1;
  });
}});
mdP.group.position.set(MD.x, 1.35, MD.z); mdP.group.rotation.y = -0.12;

// station F: the DM card that delivers the script
const dm = world.panel({ w: 1.6, h: 1.0, px: 1000, draw: (x, t, w, h) => {
  x.fillStyle = '#0E1218'; x.fillRect(0, 0, w, h); x.save(); x.translate(-10, 20); x.scale(1.4, 1.4); w = w / 1.4;
  const a1 = clamp01((t - (T.s6 + 0.2)) / 0.3), a2 = clamp01((t - (wordAt('V07', AN('V07', 'card', 4)) - 0.1)) / 0.3);
  x.globalAlpha = a1; x.fillStyle = '#2B6BFF'; rr2(x, w - 300, 60, 250, 90, 45); x.fill();
  x.fillStyle = '#fff'; x.font = '700 44px Geist'; x.textAlign = 'center'; x.fillText('PDF', w - 175, 120); x.textAlign = 'left';
  x.globalAlpha = a2; x.fillStyle = '#1C222B'; rr2(x, 50, 190, 640, 160, 36); x.fill();
  x.fillStyle = '#7EF0C4'; rr2(x, 80, 220, 100, 100, 18); x.fill(); x.fillStyle = '#0A0D12'; x.font = '700 30px "Geist Mono"'; x.fillText('.py', 100, 282);
  x.fillStyle = '#E8ECEF'; x.font = '600 38px "Geist Mono"'; x.fillText('pdf_to_md.py', 210, 262); x.fillStyle = 'rgba(232,236,239,.55)'; x.font = '500 28px "Geist Mono"'; x.fillText('10 lines · runs offline', 210, 306);
  x.globalAlpha = 1; x.restore();
}});
function rr2(x, a, b, w, h, r) { x.beginPath(); x.roundRect(a, b, w, h, r); }
dm.group.position.set(0, 1.7, -33.5);

// ------------------------------------------------------------------ camera: one take
const S = T;
world.cameraPath([
  { t: 0, p: [0.05, 1.3, 5.0], l: [0.25, 1.3, 0], fov: 36 },
  { t: S.s2 - 0.1, p: [0.25, 1.45, 4.0], l: [0.55, 1.5, -0.5], fov: 36 },
  { t: S.s2 + 1.9, p: [1.5, 1.45, 0.4], l: [3.3, 0.9, -3.6], fov: 36 },
  { t: S.s3 - 0.45, p: [2.05, 1.25, -0.75], l: [3.3, 0.75, -3.6], fov: 36 },
  { t: S.s3 + 0.5, p: [0.1, 4.6, -3.8], l: [0, 0, -11.5], fov: 40 },
  { t: S.s4 - 0.5, p: [0.0, 2.9, -8.8], l: [0, 0.3, -15], fov: 40 },
  { t: S.s4 + 0.45, p: [0, 2.0, -15.0], l: [0, 2.3, -21], fov: 36 },
  { t: S.s5 - 0.45, p: [0.08, 2.0, -15.5], l: [0, 2.3, -21], fov: 36 },
  { t: S.s5 + 0.6, p: [-1.0, 2.0, -22.6], l: [-1.0, 1.95, -27], fov: 36 },
  { t: wordAt('V05', AN('V05', 'md', 5)) - 0.2, p: [-0.95, 2.0, -22.75], l: [-1.0, 1.95, -27], fov: 36 },
  { t: wordAt('V05', AN('V05', 'md', 5)) + 0.6, p: [1.0, 2.0, -22.6], l: [1.0, 1.95, -27], fov: 36 },
  { t: L.V06.start - 0.15, p: [1.05, 2.0, -22.8], l: [1.0, 1.95, -27], fov: 36 },
  { t: L.V06.start + 0.5, p: [-1.0, 1.4, -23.3], l: [-1.0, 0.75, -27], fov: 36 },
  { t: S.s6 - 0.15, p: [-0.6, 3.4, -24.6], l: [0, 2.0, -33.5], fov: 36 },
  { t: S.s6 + 0.5, p: [0, 2.3, -29.2], l: [0, 2.05, -33.5], fov: 36 },
  { t: S.s7 - 0.1, p: [0, 2.3, -30.4], l: [0, 2.05, -33.5], fov: 36 },
  { t: D, p: [0.0, 8.5, -5.5], l: [0, 0.2, -19], fov: 40 },
]);

// ------------------------------------------------------------------ overlay scenes
function stat(t, at, y, big, label, color = C.ink) {
  const a = easeOut((t - (at - 0.08)) / 0.35); if (a <= 0) return;
  const s = lerp(0.9, 1, backOut((t - (at - 0.08)) / 0.4));
  g.save(); g.globalAlpha *= a; g.translate(96, y); g.scale(s, s);
  text(big, 0, 0, { size: 190, weight: 900, track: -8, color, shadow: 30 });
  const bw = measure(big, 190, 900, SANS, -8);
  text(label, bw + 26, -22, { size: 54, weight: 600, color: C.ink, shadow: 18 });
  g.restore();
}
function hook(t) {
  const a = 1 - smooth((t - (S.s2 - 0.25)) / 0.25); if (a <= 0) return;
  g.save(); g.globalAlpha *= a;
  { const pg = g.createLinearGradient(0, 260, 0, 1010); pg.addColorStop(0, 'rgba(5,7,10,0)'); pg.addColorStop(0.15, 'rgba(5,7,10,0.45)'); pg.addColorStop(0.85, 'rgba(5,7,10,0.45)'); pg.addColorStop(1, 'rgba(5,7,10,0)'); g.fillStyle = pg; g.fillRect(0, 260, 780, 750); }
  stat(t, -1, 420, '1M', 'parameters');
  stat(t, wordAt('V01', AN('V01', 's49', 9)), 640, '49', 'pages / second', C.mint);
  stat(t, wordAt('V01', AN('V01', 'gpu', 14)), 860, '0', 'GPUs');
  { const fa = easeOut((t - wordAt('V01', AN('V01', 's49', 9))) / 0.4); if (fa > 0) { g.save(); g.globalAlpha *= fa; const fw = measure('up to 49/s on a 32-core CPU · Datalab benchmark', 32, 500) + 44; rr(80, 912, fw, 54, 27); g.fillStyle = 'rgba(5,7,10,0.72)'; g.fill(); g.restore();
    text('up to 49/s on a 32-core CPU · Datalab benchmark', 102, 950, { size: 32, weight: 500, color: C.dim, alpha: fa }); } }
  g.restore();
}
function model(t) {
  const a = win(t, S.s2 + 0.1, S.s3); if (a <= 0) return;
  g.save(); g.globalAlpha *= a;
  text('Indra OCR', 96, 470, { size: 130, weight: 900, track: -5, shadow: 30 });
  text(tx('pdfline', 'PDF or scan  →  clean Markdown'), 100, 560, { size: 50, weight: 600, color: C.ink, alpha: easeOut((t - wordAt('V02', AN('V02', 'pdfline', 6))) / 0.4), shadow: 16 });
  const ma = easeOut((t - (wordAt('V02', AN('V02', 'mb18', 15)) - 0.1)) / 0.4);
  if (ma > 0) { g.save(); g.globalAlpha *= ma; rr(96, 610, 330, 96, 48); g.fillStyle = 'rgba(126,240,196,0.16)'; g.fill(); g.lineWidth = 2; g.strokeStyle = 'rgba(126,240,196,0.7)'; g.stroke(); g.restore();
    text('18 MB model', 132, 674, { size: 46, weight: 700, color: C.mint, alpha: ma }); }
  g.restore();
}
function race(t) {
  const a = win(t, S.s3 + 0.05, S.s4); if (a <= 0) return;
  g.save(); g.globalAlpha *= a;
  const k = easeOut((t - (wordAt('V03', AN('V03', 'x17', 8)) - 0.1)) / 0.4);
  text('≈17×', 540, 520, { size: 230, weight: 900, track: -10, align: 'center', color: C.mint, alpha: k, shadow: 34 });
  text(tx('faster', 'faster than Tesseract'), 540, 610, { size: 54, weight: 700, align: 'center', alpha: k, shadow: 16 });
  // lane labels with live counters
  const el = Math.max(0, t - S.s3);
  const slow = Math.floor(el / SLOW_DT), fast = Math.floor(el / FAST_DT);
  text('Tesseract 5', 270, 1170, { size: 40, weight: 700, align: 'center', color: C.dim, shadow: 14 });
  text(`${slow} pages`, 270, 1226, { size: 36, weight: 600, font: MONO, align: 'center', color: C.dim, shadow: 14 });
  text('Indra OCR', 810, 1170, { size: 40, weight: 700, align: 'center', color: C.mint, shadow: 14 });
  text(`${fast} pages`, 810, 1226, { size: 36, weight: 600, font: MONO, align: 'center', color: C.mint, shadow: 14 });
  text('throughput on 32 CPU cores, Datalab benchmark', 540, 1300, { size: 32, weight: 500, align: 'center', color: C.faint, shadow: 12 });
  g.restore();
}
function build(t) {
  const a = win(t, S.s4 + 0.1, S.s5); if (a <= 0) return;
  g.save(); g.globalAlpha *= a;
  text(tx('install', 'One install.'), 96, 420, { size: 96, weight: 700, track: -3, shadow: 26, alpha: easeOut((t - L.V04.start) / 0.35) });
  text(tx('command', 'One command.'), 96, 520, { size: 96, weight: 700, track: -3, color: C.mint, shadow: 26, alpha: easeOut((t - (wordAt('V04', AN('V04', 'cmd2', 2)) - 0.05)) / 0.35) });
  g.restore();
}
function convert(t) {
  const a = win(t, S.s5 + 0.1, S.s6); if (a <= 0) return;
  g.save(); g.globalAlpha *= a;
  text('Scan → Markdown', 540, 420, { size: 92, weight: 900, track: -3, align: 'center', shadow: 26 });
  text('headings · lists · tables · reading order', 540, 490, { size: 40, weight: 600, align: 'center', color: C.dim, shadow: 14, alpha: easeOut((t - wordAt('V05', AN('V05', 'heads', 6))) / 0.4) });
  g.restore();
}
function cta(t) {
  const a = win(t, S.s6, S.s7 + 0.2); if (a <= 0) return;
  g.save(); g.globalAlpha *= a;
  text(tx('comment', 'Comment'), 540, 400, { size: 76, weight: 700, align: 'center', color: C.dim, shadow: 20 });
  g.save(); g.translate(540, 560); const s = lerp(0.85, 1, backOut((t - S.s6) / 0.5)); g.scale(s, s);
  g.font = `900 250px ${SANS}`; g.letterSpacing = '-8px'; g.textAlign = 'center'; g.textBaseline = 'middle';
  const gr = g.createLinearGradient(0, -120, 0, 120); gr.addColorStop(0, '#B9FFE6'); gr.addColorStop(1, '#4FD8A5'); g.fillStyle = gr;
  g.shadowColor = 'rgba(0,0,0,.5)'; g.shadowBlur = 40; g.fillText('PDF', 0, 0); g.restore();
  text('10-line script → AI-ready knowledge base', 540, 735, { size: 42, weight: 600, align: 'center', color: C.ink, shadow: 16, alpha: easeOut((t - (wordAt('V07', AN('V07', 'card', 4)) - 0.1)) / 0.4) });
  g.restore();
}
function brand(t) {
  const a = easeOut((t - (S.s7 + 0.3)) / 0.6); if (a <= 0) return;
  text(tx('friend', 'Send it to that friend.'), 540, 470, { size: 84, weight: 700, track: -2, align: 'center', shadow: 26, alpha: a });
  text('@rithikgour.ai', 540, 560, { size: 42, weight: 600, align: 'center', color: C.mint, shadow: 16, alpha: easeOut((t - (S.s7 + 0.8)) / 0.6) });
}

const captions = makeCaptions(g, TL, { nocap: ['V01', 'V07'], D, weak: TL.weak || [], noStart: TL.noStart || [], chunker: TL.chunker || 'greedy', ...(TL.capSize ? { size: TL.capSize } : {}) });

// top and bottom grade so type always sits on calm tone
function grade() {
  const top = g.createLinearGradient(0, 0, 0, 1000); top.addColorStop(0, 'rgba(4,6,9,0.72)'); top.addColorStop(1, 'rgba(4,6,9,0)');
  g.fillStyle = top; g.fillRect(0, 0, W, 1000);
  const bot = g.createLinearGradient(0, 1300, 0, H); bot.addColorStop(0, 'rgba(4,6,9,0)'); bot.addColorStop(1, 'rgba(4,6,9,0.6)');
  g.fillStyle = bot; g.fillRect(0, 1300, W, H - 1300);
  const v = g.createRadialGradient(540, 960, 600, 540, 960, 1250); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.38)');
  g.fillStyle = v; g.fillRect(0, 0, W, H);
}

// ------------------------------------------------------------------ SFX cue sheet
function sfxCues() {
  const c = [], add = (t, s, db, kind, dur) => c.push({ t: +t.toFixed(3), s, db, kind, ...(dur ? { dur: +dur.toFixed(3) } : {}) });
  add(0.0, 'impact/bass-hit-short', -17, 'hook');
  [wordAt('V01', AN('V01', 's49', 9)), wordAt('V01', AN('V01', 'gpu', 14))].forEach((w, i) => add(w - 0.08, 'ui/switch-tap', -19 - i, 'stat'));
  add(S.s2 - 0.1, 'transition/whoosh-fast', -22, 'to chip');
  add(wordAt('V02', AN('V02', 'mb18', 15)) - 0.1, 'impact/hit-weak', -21, '18 MB');
  add(S.s3 - 0.1, 'transition/transition-tech-slide', -21, 'race');
  add(wordAt('V03', AN('V03', 'x17', 8)) - 0.12, 'impact/impact-zoom-quick', -17, '17x');
  add(S.s4 - 0.1, 'transition/swoosh-quick', -22, 'terminal');
  add(K.c1, 'text/typewriter-digital', -25, 'typing', K.c1e - K.c1); add(K.c1e + 0.08, 'text/typewriter-hit-soft', -21, 'enter');
  add(K.c2, 'text/typewriter-digital', -25, 'typing', K.c2e - K.c2); add(K.c2e + 0.08, 'text/typewriter-hit-soft', -21, 'enter');
  OUTS.forEach((o, i) => add(K.o0 + i * 0.16, 'ui/switch-light', -24 - i, 'file'));
  add(S.s5 - 0.1, 'transition/sweep-short', -23, 'to scan');
  add(L.V06.start, 'ui/switch-click-quick', -21, 'not yet');
  add(S.s6 - 0.05, 'impact/impact-zoom-quick', -17, 'PDF');
  add(wordAt('V07', AN('V07', 'card', 4)) - 0.1, 'ui/switch-tap', -21, 'file card');
  add(S.s7 - 0.1, 'transition/whoosh-fast', -23, 'crane up');
  return c.sort((a, b) => a.t - b.t);
}
window.SFX = sfxCues();

// ------------------------------------------------------------------ contract
function renderFrame(t) {
  updateStream(t, S.s3 + 0.4);
  laneUpdate(raceSlow, -0.85, SLOW_DT, t, S.s3 - 0.3, S.s4 + 0.6);
  laneUpdate(raceFast, 0.85, FAST_DT, t, S.s3 - 0.3, S.s4 + 0.6);
  beam.material.opacity = 0.45 + 0.12 * Math.sin(t * 9);
  { const k = 1 - smooth((t - (S.s3 - 0.2)) / 0.8); beamLight.intensity = 12 * k; chipLight.intensity = 25 * k; beamLight.visible = chipLight.visible = k > 0.001; }
  chip.rotation.y = t * 0.35; chipEdges.rotation.y = t * 0.35;
  term.visible = t > S.s3 ? 1 : 0; scanP.visible = mdP.visible = t > S.s4 ? 1 : 0; dm.visible = t > S.s5 ? 1 : 0;
  g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  g.drawImage(world.render(t), 0, 0, W, H);
  grade();
  hook(t); model(t); race(t); build(t); convert(t); cta(t); brand(t);
  captions(t);
  dither();
  return Math.round(t * TL.fps);
}
window.renderFrame = renderFrame;
window.DURATION = D; window.FPS = TL.fps; window.FRAMES = TL.frames;
window.BEATS = TL.lines.map((l) => ({ id: l.id, mid: (l.start + l.end) / 2 }));
renderFrame(0);
window.READY = true;
