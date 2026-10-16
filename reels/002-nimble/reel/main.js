// Reel 002 "Nimble": a clean, art-directed 2D motion piece.
// Deterministic: window.renderFrame(t) depends only on t, constants and timeline.json.
// Design rules applied (Day 1 feedback + video-shotcraft aesthetic rules):
//  one hero per scene, no camera shake, no film grain, no glow spam, holds >= 1 s on key info,
//  readable type (captions >= 56 px, aux >= 32 px), real-speed typing, eased (never linear) motion.

const W = 1080, H = 1920;
const q = new URLSearchParams(location.search);

await Promise.all([
  '500 40px Geist', '600 40px Geist', '700 40px Geist', '900 40px Geist',
  '500 34px "Geist Mono"', '600 34px "Geist Mono"', '700 34px "Geist Mono"',
].map((f) => document.fonts.load(f)));
await document.fonts.ready;
for (const f of ['700 40px Geist', '900 40px Geist', '500 34px "Geist Mono"']) if (!document.fonts.check(f)) throw new Error('font failed ' + f);

const TL = await (await fetch('./timeline.json')).json();
const L = Object.fromEntries(TL.lines.map((l) => [l.id, l]));
const BEATS = (await (await fetch('./beats.json')).json()).beats;   // music beat grid (librosa, 123 BPM)
const D = TL.duration;

// ------------------------------------------------------------ tokens
const C = {
  bg: '#05070B', ink: '#F3F5F8', dim: 'rgba(243,245,248,0.64)', faint: 'rgba(243,245,248,0.36)',
  blue: '#6B97FF', mint: '#7EF0C4', card: '#0C1118', line: 'rgba(255,255,255,0.09)',
};
const SANS = 'Geist', MONO = '"Geist Mono"';

// ------------------------------------------------------------ math
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const lerp = (a, b, k) => a + (b - a) * k;
const easeOut = (x) => 1 - Math.pow(1 - clamp01(x), 4);          // quart out
const easeInOut = (x) => { x = clamp01(x); return x < 0.5 ? 8 * x ** 4 : 1 - Math.pow(-2 * x + 2, 4) / 2; };
const smooth = (x) => { x = clamp01(x); return x * x * (3 - 2 * x); };
const win = (t, a, b, fi = 0.3, fo = 0.3) => Math.min(smooth((t - a) / fi), 1 - smooth((t - (b - fo)) / fo));
const mix = (c1, c2, k) => { const p = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)); const a = p(c1), b = p(c2); return `rgb(${a.map((v, i) => Math.round(lerp(v, b[i], k))).join(',')})`; };

// ------------------------------------------------------------ canvas
const out = document.getElementById('c'); out.width = W; out.height = H;
const g = out.getContext('2d');

function text(s, x, y, { size = 60, weight = 700, font = SANS, color = C.ink, align = 'left', track = 0, alpha = 1, base = 'alphabetic', shadow = 0 } = {}) {
  g.save(); g.globalAlpha *= alpha;
  g.font = `${weight} ${size}px ${font}`; g.textAlign = align; g.textBaseline = base; g.letterSpacing = `${track}px`;
  if (shadow) { g.shadowColor = 'rgba(0,0,0,0.55)'; g.shadowBlur = shadow; g.shadowOffsetY = shadow / 4; }
  g.fillStyle = color; g.fillText(s, x, y); g.restore();
}
function measure(s, size, weight = 700, font = SANS, track = 0) { g.save(); g.font = `${weight} ${size}px ${font}`; g.letterSpacing = `${track}px`; const w = g.measureText(s).width; g.restore(); return w; }
function rr(x, y, w, h, r) { g.beginPath(); g.roundRect(x, y, w, h, r); }

// ------------------------------------------------------------ story clock (all from the voice timeline)
// scene cuts snap to the music beat just before the line (within 0.5 s), else line start - 0.2
const onBeat = (lineStart) => { const c = BEATS.filter((b) => b <= lineStart - 0.03 && b >= lineStart - 0.5); return c.length ? c[c.length - 1] : lineStart - 0.2; };
const T = { s2: onBeat(L.V03.start), s3: onBeat(L.V05.start), s4: onBeat(L.V09.start), s5: onBeat(L.V10.start), s6: onBeat(L.V11.start) };
// word time helper: time the k-th caption word of a line is spoken
const wordAt = (id, k) => (L[id].words[Math.min(k, L[id].words.length - 1)] || { t: L[id].start }).t;

// ------------------------------------------------------------ background (deep, layered, no grain)
const dither = (() => {   // static screen-space dither: kills gradient banding, costs ~nothing to encode
  const c = document.createElement('canvas'); c.width = 256; c.height = 256; const x = c.getContext('2d');
  const id = x.createImageData(256, 256); let s = 1234567;
  for (let i = 0; i < id.data.length; i += 4) { s = (s * 1103515245 + 12345) >>> 0; const v = (s >>> 24); id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 255; }
  x.putImageData(id, 0, 0); return g.createPattern(c, 'repeat');
})();
function glow(cx, cy, r, color, a) {
  const gr = g.createRadialGradient(cx, cy, 0, cx, cy, r);
  gr.addColorStop(0, color.replace('rgb(', 'rgba(').replace(')', `,${a})`));
  gr.addColorStop(0.55, color.replace('rgb(', 'rgba(').replace(')', `,${a * 0.28})`));
  gr.addColorStop(1, color.replace('rgb(', 'rgba(').replace(')', ',0)'));
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
}
function background(t) {
  // colour temperature: cold news blue -> mint as the story moves to your laptop
  const k = smooth((t - T.s2) / 2.2);
  const hue = mix('#3D6BFF', '#2FD6A0', k);
  const hue2 = mix('#7A5CFF', '#2A8CFF', k);
  const base = g.createLinearGradient(0, 0, 0, H);
  base.addColorStop(0, '#0C1222'); base.addColorStop(0.5, '#070A11'); base.addColorStop(1, '#05070A');
  g.fillStyle = base; g.fillRect(0, 0, W, H);
  const dx = Math.sin(t * 0.21) * 40, dy = Math.cos(t * 0.17) * 30;
  glow(540 + dx, 520 + dy, 1100, hue, 0.40);
  glow(140 - dx, 1500, 820, hue2, 0.16);
  glow(540, 1980, 900, hue, 0.10);   // low floor light: gives the frame a ground plane
  glow(960, 1150 + dy, 620, hue, 0.08);
  // vignette
  const v = g.createRadialGradient(540, 860, 520, 540, 960, 1250);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.42)');
  g.fillStyle = v; g.fillRect(0, 0, W, H);
}
function finishDither() { g.save(); g.globalAlpha = 0.045; g.globalCompositeOperation = 'overlay'; g.fillStyle = dither; g.fillRect(0, 0, W, H); g.restore(); }

// scene wrapper: fade + small vertical drift on entry/exit
function scene(t, a, b, draw, { fi = 0.32, fo = 0.18, drift = 28 } = {}) {
  const k = win(t, a, b, fi, fo); if (k <= 0.001) return;
  const entering = t < a + fi;
  g.save(); g.globalAlpha = k;
  g.translate(0, (1 - k) * (entering ? drift : -drift));
  draw(t); g.restore();
}

// ------------------------------------------------------------ S1: the 816B number, then two Mac Studios
function pill(label, cx, y, color = C.blue, size = 30) {
  const w = measure(label, size, 600, SANS, 3) + 76, h = size + 34;
  g.save(); rr(cx - w / 2, y - h / 2, w, h, h / 2);
  g.fillStyle = 'rgba(255,255,255,0.05)'; g.fill(); g.lineWidth = 2; g.strokeStyle = 'rgba(255,255,255,0.12)'; g.stroke(); g.restore();
  g.save(); g.fillStyle = color; g.beginPath(); g.arc(cx - w / 2 + 28, y, 6, 0, Math.PI * 2); g.fill(); g.restore();
  text(label, cx + 14, y + size * 0.36, { size, weight: 600, align: 'center', track: 3, color: C.dim });
}
function macStudio(x, y, w, s = 1) {
  const h = w * 0.47;
  g.save(); g.translate(x, y); g.scale(s, s);
  // soft floor shadow
  const sh = g.createRadialGradient(0, h * 0.62, 0, 0, h * 0.62, w * 0.62); sh.addColorStop(0, 'rgba(0,0,0,0.6)'); sh.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = sh; g.fillRect(-w, h * 0.62 - w * 0.62, 2 * w, w * 1.24);
  // top face
  g.beginPath(); g.moveTo(-w / 2 + 40, -h / 2); g.lineTo(w / 2 - 40, -h / 2); g.lineTo(w / 2 - 26, -h / 2 + 26); g.lineTo(-w / 2 + 26, -h / 2 + 26); g.closePath();
  const tp = g.createLinearGradient(0, -h / 2, 0, -h / 2 + 26); tp.addColorStop(0, '#F2F4F7'); tp.addColorStop(1, '#C9CDD3'); g.fillStyle = tp; g.fill();
  // body
  rr(-w / 2 + 4, -h / 2 + 22, w - 8, h - 22, 22);
  const bd = g.createLinearGradient(0, -h / 2, 0, h / 2); bd.addColorStop(0, '#D9DDE2'); bd.addColorStop(0.55, '#B7BCC4'); bd.addColorStop(1, '#8D939C');
  g.fillStyle = bd; g.fill();
  // ports
  g.fillStyle = '#1B1E23';
  for (let i = 0; i < 2; i++) { rr(-w / 2 + 44 + i * 34, h * 0.08, 18, 8, 4); g.fill(); }
  rr(-w / 2 + 130, h * 0.07, 70, 10, 5); g.fill();
  g.fillStyle = '#E9FFF6'; g.beginPath(); g.arc(w / 2 - 40, h * 0.12, 4, 0, Math.PI * 2); g.fill();
  g.restore();
}
function sceneHook(t) {
  const up = easeInOut((t - (L.V02.start - 0.1)) / 0.8);          // number moves up when "two Mac Studios" starts
  const push = (1 + 0.10 * smooth(t / (L.V02.start + 0.2))) * lerp(1.12, 1, easeOut(t / 0.45));
  // eyebrow
  g.save(); g.globalAlpha *= 1 - smooth((t - L.V02.start) / 0.4);
  g.translate(0, (1 - easeOut(t / 0.5)) * -18); pill('META  ·  MUSE SPARK OPEN  ·  OCT 15', 540, 470, C.blue, 34);
  g.restore();
  // hero number
  const cy = lerp(840, 560, up), sc = lerp(1, 0.6, up) * push;
  g.save(); g.translate(540, cy); g.scale(sc, sc);
  g.font = `900 360px ${SANS}`; g.letterSpacing = '-16px'; g.textAlign = 'center'; g.textBaseline = 'middle';
  const gr = g.createLinearGradient(0, -170, 0, 170); gr.addColorStop(0, '#FFFFFF'); gr.addColorStop(1, '#9DB8FF');
  g.fillStyle = gr; g.fillText('816B', 0, 0);
  g.restore();
  text('parameters  ·  open weights', 540, lerp(1050, 700, up) + (1 - easeOut((t - (wordAt('V01', 9) - 0.1)) / 0.5)) * 16, { size: lerp(46, 40, up), weight: 600, align: 'center', color: C.dim, track: 1, alpha: easeOut((t - (wordAt('V01', 9) - 0.1)) / 0.5) });
  // two Mac Studios
  const m = easeOut((t - (L.V02.start + 0.25)) / 0.9), m2 = easeOut((t - (L.V02.start + 0.45)) / 0.9);
  if (m > 0) {
    g.save(); g.globalAlpha *= Math.min(1, m * 3); macStudio(325, lerp(1160, 1000, m), 380, lerp(0.86, 1, m)); g.restore();
    g.save(); g.globalAlpha *= Math.min(1, m2 * 3); macStudio(755, lerp(1160, 1000, m2), 380, lerp(0.86, 1, m2)); g.restore();
    const a = easeOut((t - (L.V02.start + 0.45)) / 0.5);
    text('2 × Mac Studio', 540, 1250, { size: 64, weight: 700, align: 'center', alpha: a });
    text('M5 Ultra · up to 512 GB memory each', 540, 1315, { size: 36, weight: 500, align: 'center', color: C.dim, alpha: a });
  }
}

// ------------------------------------------------------------ S2: "the release you'll actually use" + model card
function sceneRelease(t) {
  const a1 = easeOut((t - T.s2) / 0.7);
  text('The release you’ll', 96, 470, { size: 88, weight: 700, track: -2, alpha: a1 });
  text('actually use.', 96, 570, { size: 88, weight: 700, track: -2, color: C.mint, alpha: a1 });
  const c = easeOut((t - (L.V04.start - 0.05)) / 0.9);
  if (c <= 0) return;
  const x = 96, y = lerp(860, 760, c), w = 888, h = 470;
  g.save(); g.globalAlpha *= c;
  g.shadowColor = 'rgba(0,0,0,0.55)'; g.shadowBlur = 80; g.shadowOffsetY = 30;
  rr(x, y, w, h, 40); const bg = g.createLinearGradient(0, y, 0, y + h); bg.addColorStop(0, '#111823'); bg.addColorStop(1, '#0A0F16'); g.fillStyle = bg; g.fill();
  g.shadowColor = 'transparent'; g.lineWidth = 2; g.strokeStyle = C.line; g.stroke();
  // top hairline highlight (single, clipped to the card)
  g.save(); rr(x, y, w, h, 40); g.clip();
  const hl = g.createLinearGradient(x, 0, x + w, 0); hl.addColorStop(0, 'rgba(126,240,196,0)'); hl.addColorStop(0.5, 'rgba(126,240,196,0.55)'); hl.addColorStop(1, 'rgba(126,240,196,0)');
  g.fillStyle = hl; g.fillRect(x, y, w, 2); g.restore();
  text('ollama  ·  v0.40.4', x + 56, y + 92, { size: 34, weight: 500, font: MONO, color: C.dim });
  text('nimble', x + 50, y + 262, { size: 170, weight: 900, track: -6 });
  const tags = ['9B params', 'Apache 2.0', 'runs locally'];
  let tx = x + 56;
  tags.forEach((tag, i) => {
    const k = easeOut((t - (L.V04.start + 0.6 + i * 0.18)) / 0.5);
    const tw = measure(tag, 34, 600) + 48;
    g.save(); g.globalAlpha *= k; rr(tx, y + 330, tw, 66, 33); g.fillStyle = i === 2 ? 'rgba(126,240,196,0.14)' : 'rgba(255,255,255,0.06)'; g.fill();
    g.lineWidth = 2; g.strokeStyle = i === 2 ? 'rgba(126,240,196,0.5)' : 'rgba(255,255,255,0.12)'; g.stroke(); g.restore();
    text(tag, tx + 24, y + 375, { size: 34, weight: 600, color: i === 2 ? C.mint : C.ink, alpha: k });
    tx += tw + 18;
  });
  g.restore();
  text('a decision model: text in, answer out', 540, y + h + 90, { size: 38, weight: 500, align: 'center', color: C.dim, alpha: easeOut((t - (L.V04.start + 1.2)) / 0.6) });
}

// ------------------------------------------------------------ S3: the terminal
const TX = 72, TW = 936, TY = 600, TH = 680, PAD = 46, LH = 62, FS = 34;
function typed(s, t0, cps, t) { const n = Math.floor(clamp01((t - t0) * cps / s.length) * s.length); return s.slice(0, Math.max(0, n)); }
function terminalFrame(t, title) {
  g.save(); g.shadowColor = 'rgba(0,0,0,0.6)'; g.shadowBlur = 100; g.shadowOffsetY = 40;
  rr(TX, TY, TW, TH, 34); const bg = g.createLinearGradient(0, TY, 0, TY + TH); bg.addColorStop(0, '#0F141C'); bg.addColorStop(1, '#0A0E14'); g.fillStyle = bg; g.fill();
  g.restore(); g.save(); rr(TX, TY, TW, TH, 34); g.lineWidth = 2; g.strokeStyle = C.line; g.stroke();
  g.clip(); g.fillStyle = 'rgba(255,255,255,0.035)'; g.fillRect(TX, TY, TW, 76); g.fillStyle = C.line; g.fillRect(TX, TY + 76, TW, 2); g.restore();
  ['#FF5F57', '#FEBC2E', '#28C840'].forEach((c, i) => { g.fillStyle = c; g.beginPath(); g.arc(TX + 46 + i * 34, TY + 38, 10, 0, Math.PI * 2); g.fill(); });
  text(title, TX + TW / 2, TY + 50, { size: 30, weight: 500, font: MONO, align: 'center', color: C.faint });
}
function prompt(y, cmd, cursor, t) {
  text('❯', TX + PAD, y, { size: FS, weight: 700, font: MONO, color: C.mint });
  text(cmd, TX + PAD + 40, y, { size: FS, weight: 500, font: MONO, color: C.ink });
  if (cursor && Math.floor(t * 2.2) % 2 === 0) { const w = measure(cmd, FS, 500, MONO); g.fillStyle = C.mint; g.fillRect(TX + PAD + 42 + w, y - 30, 18, 38); }
}
// typing schedule (real human speed, ~15-20 chars/s)
const CMD1 = 'ollama pull nimble';
const CMD2a = 'ollama run nimble \\', CMD2b = '--ask "Is a refund being requested?" \\', CMD2c = '< email.txt';
const CMD3 = 'python sort.py inbox/';
const K = {};
function schedule() {
  K.c1 = L.V05.start + 0.15; K.c1e = K.c1 + CMD1.length / 15;                 // type, then Enter
  K.pull = K.c1e + 0.15; K.pullDone = K.pull + 1.2;
  K.email = L.V06.start - 0.1;                                                  // email card appears
  K.c2 = L.V06.start + 0.25; const r = 24; K.c2b = K.c2 + CMD2a.length / r; K.c2c = K.c2b + CMD2b.length / r; K.c2e = K.c2c + CMD2c.length / r;
  K.ans = Math.max(K.c2e + 0.2, L.V07.start + 0.1);                            // answer lands as "yes or no" is said
  K.clear = L.V08.start - 0.05; K.c3 = L.V08.start + 0.15; K.c3e = K.c3 + CMD3.length / 22;
  K.rows = K.c3e + 0.15;
}
schedule();
function sceneTerminal(t) {
  const enter = easeOut((t - T.s3) / 0.8);
  g.save(); g.translate(0, (1 - enter) * 120);
  terminalFrame(t, '~/inbox — zsh');
  g.save(); rr(TX, TY + 78, TW, TH - 78, 0); g.clip();
  let y = TY + 78 + PAD + 34;
  // the first two commands clear away (like Ctrl+L) before the folder run, instead of scrolling under it
  const gone = easeInOut((t - K.clear) / 0.4);
  g.save(); g.globalAlpha *= 1 - gone; g.translate(0, -gone * 60);
  // 1) pull
  const c1 = t < K.c1e ? typed(CMD1, K.c1, 15, t) : CMD1;
  prompt(y, c1, t < K.c1e + 0.1, t);
  if (t > K.pull) {
    y += LH;
    const p = easeInOut((t - K.pull) / 1.1);
    text('pulling nimble', TX + PAD, y, { size: FS, weight: 500, font: MONO, color: C.dim });
    const bx = TX + PAD + 320, bw = 320;
    rr(bx, y - 24, bw, 22, 11); g.fillStyle = 'rgba(255,255,255,0.08)'; g.fill();
    if (p > 0.01) { rr(bx, y - 24, bw * p, 22, 11); g.fillStyle = C.mint; g.fill(); }
    text(`${Math.round(p * 100)}%`, bx + bw + 24, y, { size: FS, weight: 500, font: MONO, color: C.dim });
    if (t > K.pullDone) { y += LH; text('success', TX + PAD, y, { size: FS, weight: 600, font: MONO, color: C.mint }); }
  }
  // 2) ask
  if (t > K.c2) {
    y += LH * 1.5;
    const a = t < K.c2b ? typed(CMD2a, K.c2, 24, t) : CMD2a;
    prompt(y, a, t < K.c2b, t);
    if (t > K.c2b) { y += LH; text(t < K.c2c ? typed(CMD2b, K.c2b, 24, t) : CMD2b, TX + PAD + 40, y, { size: FS, weight: 500, font: MONO, color: '#FFD9A0' }); }
    if (t > K.c2c) { y += LH; text(t < K.c2e ? typed(CMD2c, K.c2c, 24, t) : CMD2c, TX + PAD + 40, y, { size: FS, weight: 500, font: MONO, color: C.ink }); }
    if (t > K.ans) {
      y += LH * 1.4;
      const k = easeOut((t - K.ans) / 0.45);
      g.save(); g.globalAlpha *= k;
      rr(TX + PAD - 4, y - 44, 170, 62, 14); g.fillStyle = 'rgba(126,240,196,0.14)'; g.fill();
      text('yes', TX + PAD + 22, y, { size: 40, weight: 700, font: MONO, color: C.mint });
      text('97%', TX + PAD + 200, y, { size: 40, weight: 600, font: MONO, color: C.ink });
      rr(TX + PAD + 330, y - 22, 300, 14, 7); g.fillStyle = 'rgba(255,255,255,0.08)'; g.fill();
      rr(TX + PAD + 330, y - 22, 300 * 0.97 * easeOut((t - K.ans - 0.1) / 0.7), 14, 7); g.fillStyle = C.mint; g.fill();
      g.restore();
    }
  }
  g.restore();
  // 3) sort a folder
  if (t > K.c3) {
    y = TY + 78 + PAD + 34 + 78;
    const c3 = t < K.c3e ? typed(CMD3, K.c3, 22, t) : CMD3;
    prompt(y, c3, t < K.c3e + 0.1, t);
    const lb = easeOut((t - (L.V08.start - 0.05)) / 0.5);
    if (lb > 0) {   // the --choice labels sort.py sends, as a shell comment
      let cx = TX + PAD; const parts = [['# labels: ', C.faint], ['billing ', C.mint], ['technical ', C.blue], ['sales ', '#FFC861'], ['other', C.dim]];
      parts.forEach(([p, col]) => { text(p, cx, y - 78, { size: FS, weight: 500, font: MONO, color: col, alpha: lb }); cx += measure(p, FS, 500, MONO); });
    }
    // same order and format sort.py prints (files sorted by name)
    const rows = [['login-error.txt', 'technical', '88%'], ['partnership.txt', 'sales', '76%'], ['refund-4821.txt', 'billing', '91%']];
    rows.forEach((r, i) => {
      const k = easeOut((t - (K.rows + i * 0.2)) / 0.4); if (k <= 0) return;
      const yy = y + LH * (1.5 + i);
      g.save(); g.globalAlpha *= k; g.translate((1 - k) * -24, 0);
      text(r[0], TX + PAD, yy, { size: FS, weight: 500, font: MONO, color: C.dim });
      text(r[1], TX + PAD + 420, yy, { size: FS, weight: 700, font: MONO, color: { technical: C.blue, sales: '#FFC861', billing: C.mint }[r[1]] });
      text(r[2], TX + TW - PAD, yy, { size: FS, weight: 500, font: MONO, color: C.ink, align: 'right' });
      g.restore();
    });
  }
  g.restore();
  // footnote: honest labelling of the illustrative numbers
  text('example output', TX + TW - PAD, TY + TH - 30, { size: 32, weight: 500, font: MONO, color: C.dim, align: 'right', alpha: smooth((t - K.ans) / 0.5) });
  g.restore();
  // the email card that gets piped in
  const e = win(t, K.email, K.c2e + 0.35, 0.45, 0.3);
  if (e > 0) {
    const drop = easeInOut((t - (K.c2c - 0.3)) / 0.6);
    const ex = 150, ew = 780, eh = 230, ey = lerp(250, TY + 78 + PAD + 34 + LH * 5.5 - eh / 2 - 12, drop);
    g.save(); g.globalAlpha *= e; g.translate(540, ey + eh / 2); g.scale(lerp(1, 0.3, drop), lerp(1, 0.3, drop)); g.translate(-540, -(ey + eh / 2));
    g.shadowColor = 'rgba(0,0,0,0.5)'; g.shadowBlur = 60; g.shadowOffsetY = 24;
    rr(ex, ey, ew, eh, 28); g.fillStyle = '#F5F7FA'; g.fill(); g.shadowColor = 'transparent';
    text('email.txt', ex + 40, ey + 58, { size: 28, weight: 600, font: MONO, color: '#6B7280' });
    text('Order #4821 is still broken.', ex + 40, ey + 122, { size: 42, weight: 700, color: '#0B0F17' });
    text('I want my money back.', ex + 40, ey + 178, { size: 42, weight: 700, color: '#0B0F17' });
    g.restore();
  }
}

// ------------------------------------------------------------ S4: three promises
function check(cx, cy, k) {
  g.save(); g.globalAlpha *= k; g.beginPath(); g.arc(cx, cy, 34, 0, Math.PI * 2); g.fillStyle = 'rgba(126,240,196,0.16)'; g.fill();
  g.lineWidth = 2; g.strokeStyle = 'rgba(126,240,196,0.6)'; g.stroke();
  g.strokeStyle = C.mint; g.lineWidth = 7; g.lineCap = 'round'; g.lineJoin = 'round';
  const p = easeOut(k * 1.4);
  g.beginPath(); g.moveTo(cx - 14, cy + 1); g.lineTo(cx - 3, cy + 12); if (p > 0.45) g.lineTo(cx - 3 + 19 * clamp01((p - 0.45) / 0.55), cy + 12 - 23 * clamp01((p - 0.45) / 0.55)); g.stroke(); g.restore();
}
function scenePromises(t) {
  const items = [['No API key.', Math.min(wordAt('V09', 0), T.s4 + 0.12)], ['No bill.', wordAt('V09', 3)], ['Nothing leaves', wordAt('V09', 6)]];
  items.forEach(([s, at], i) => {
    const k = easeOut((t - (at - 0.08)) / 0.5); if (k <= 0) return;
    const y = 800 + i * 190;
    check(170, y - 26, k);
    text(s, 240, y, { size: 84, weight: 700, track: -2, alpha: k, color: i === 2 ? C.mint : C.ink });
    if (i === 2) text('your laptop.', 240, y + 100, { size: 84, weight: 700, track: -2, alpha: k, color: C.mint });
  });
}

// ------------------------------------------------------------ S5: CTA, S6: brand end card
function drawByte(cx, cy, s, t, wink = false) {
  g.save(); g.translate(cx, cy); g.scale(s, s);
  g.fillStyle = '#16181D'; rr(-6, -330, 12, 80, 6); g.fill();
  g.save(); g.shadowColor = C.mint; g.shadowBlur = 40; g.fillStyle = C.mint; g.beginPath(); g.arc(0, -330, 28, 0, Math.PI * 2); g.fill(); g.restore();
  for (const sx of [-1, 1]) { g.fillStyle = '#E3DFD7'; rr(sx * 240 - 26, -70, 52, 120, 26); g.fill(); g.fillStyle = C.mint; rr(sx * 254 - 9, -46, 18, 72, 9); g.fill(); }
  g.save(); g.shadowColor = 'rgba(0,0,0,0.5)'; g.shadowBlur = 50; g.shadowOffsetY = 20;
  const hd = g.createLinearGradient(0, -260, 0, 200); hd.addColorStop(0, '#FFFFFF'); hd.addColorStop(0.7, '#EEEAE2'); hd.addColorStop(1, '#CFCAC0');
  g.fillStyle = hd; rr(-232, -260, 464, 400, 112); g.fill(); g.restore();
  g.fillStyle = '#05070A'; rr(-188, -210, 376, 300, 64); g.fill();
  const blink = ((t + 0.4) % 3.2) < 0.12;
  g.save(); g.shadowColor = C.mint; g.shadowBlur = 26; g.fillStyle = C.mint; g.strokeStyle = C.mint; g.lineCap = 'round';
  if (blink) { g.lineWidth = 18; g.beginPath(); g.moveTo(-104, -70); g.lineTo(-52, -70); g.moveTo(52, -70); g.lineTo(104, -70); g.stroke(); }
  else {
    rr(-106, -116, 56, 82, 28); g.fill();
    if (wink) { g.lineWidth = 20; g.beginPath(); g.moveTo(52, -72); g.lineTo(108, -72); g.stroke(); } else { rr(50, -116, 56, 82, 28); g.fill(); }
  }
  g.lineWidth = 20; g.beginPath(); g.arc(0, -10, 64, Math.PI * 0.2, Math.PI * 0.8); g.stroke();
  g.restore(); g.restore();
}
function sceneCTA(t) {
  const a = easeOut((t - T.s5) / 0.7);
  text('Comment', 540, 560, { size: 76, weight: 700, align: 'center', color: C.dim, alpha: a });
  g.save(); g.globalAlpha *= a; g.translate(540, 760); const s = lerp(0.92, 1, a); g.scale(s, s);
  g.font = `900 270px ${SANS}`; g.letterSpacing = '-8px'; g.textAlign = 'center'; g.textBaseline = 'middle';
  const gr = g.createLinearGradient(0, -130, 0, 130); gr.addColorStop(0, '#B9FFE6'); gr.addColorStop(1, '#4FD8A5'); g.fillStyle = gr; g.fillText('SORT', 0, 0); g.restore();
  const b = easeOut((t - (wordAt('V10', 4) - 0.1)) / 0.6);
  // DM bubble
  g.save(); g.globalAlpha *= b; g.translate(0, (1 - b) * 30);
  rr(150, 1000, 780, 150, 75); g.fillStyle = 'rgba(255,255,255,0.06)'; g.fill(); g.lineWidth = 2; g.strokeStyle = 'rgba(255,255,255,0.12)'; g.stroke();
  text('→ 20-line script in your DMs', 540, 1090, { size: 46, weight: 600, align: 'center' });
  g.restore();
}
function sceneBrand(t) {
  const a = easeOut((t - T.s6) / 0.8);
  g.save(); g.globalAlpha *= a; drawByte(540, lerp(840, 820, a), 0.78, t); g.restore();
  text('Build more.', 540, 1130, { size: 96, weight: 700, align: 'center', track: -2, alpha: a });
  text('Scroll less.', 540, 1240, { size: 96, weight: 700, align: 'center', track: -2, color: C.mint, alpha: easeOut((t - (wordAt('V11', 2) - 0.05)) / 0.5) });
  text('@rithikgour.ai', 540, 1340, { size: 40, weight: 600, align: 'center', color: C.dim, alpha: easeOut((t - (T.s6 + 0.6)) / 0.6) });
}

// ------------------------------------------------------------ captions: phrase chunks, spoken words lit, no bounce
const NOCAP = new Set(['V03', 'V09', 'V11']);
const SKIPW = { V10: 2 };   // 'Comment "SORT"' is already the headline
const CHUNKS = [];
for (const l of TL.lines) {
  if (NOCAP.has(l.id)) continue;
  const ws = l.words.slice(SKIPW[l.id] || 0);
  const chars = ws.reduce((a, w) => a + w.w.length + 1, 0) - 1, n = Math.max(1, Math.ceil(chars / 30)), target = chars / n;
  const WEAK = new Set(['a', 'an', 'the', 'is', 'to', 'on', 'with', 'you', 'of', 'and', 'it', 'in', 'at', 'your', "i'll", 'that']);
  let cur = [], len = 0;
  ws.forEach((w, i) => {
    cur.push({ ...w, hl: l.hl.includes(w.w) }); len += w.w.length + 1;
    const made = CHUNKS.filter((c) => c.line === l).length, left = ws.length - i - 1;
    if (made >= n - 1 || left < 2) return;
    const punct = /[,:;.?!]$/.test(w.w) && Math.abs(len - target) <= 8;
    const full = len >= target && !WEAK.has(w.w.toLowerCase().replace(/[^a-z']/g, ''));
    if (punct || full || len > target + 8) { CHUNKS.push({ line: l, words: cur }); cur = []; len = 0; }
  });
  if (cur.length) CHUNKS.push({ line: l, words: cur });
}
CHUNKS.forEach((c, i) => {
  const n = CHUNKS[i + 1];
  c.start = c.words[0].t - 0.08;
  c.end = n && n.line === c.line ? n.words[0].t - 0.08 : Math.min(c.line.end + 0.3, n ? n.words[0].t - 0.1 : D);
});
CHUNKS[0].start = 0;
function captions(t) {
  const c = CHUNKS.find((k) => t >= k.start && t < k.end); if (!c) return;
  const a = Math.min(smooth((t - c.start) / 0.12), 1 - smooth((t - (c.end - 0.08)) / 0.08));
  const size = 58, y = 1500, space = size * 0.3;
  g.save(); g.font = `600 ${size}px ${SANS}`; g.textBaseline = 'alphabetic';
  const widths = c.words.map((w) => g.measureText(w.w).width);
  const total = widths.reduce((s, v) => s + v, 0) + space * (c.words.length - 1);
  let x = (W - total) / 2;
  const accent = t < T.s2 ? C.blue : C.mint;
  c.words.forEach((w, i) => {
    const spoken = t >= w.t - 0.03;
    g.globalAlpha = a * (spoken ? 1 : 0.42);
    g.shadowColor = 'rgba(0,0,0,0.65)'; g.shadowBlur = 16; g.shadowOffsetY = 3;
    g.fillStyle = w.hl && spoken ? accent : C.ink; g.fillText(w.w, x, y);
    x += widths[i] + space;
  });
  g.restore();
}

// ------------------------------------------------------------ cover mode
function cover() {
  background(0.6);
  pill('AI NEWS, DECODED  ·  OCT 2026', 540, 380, C.blue, 34);
  g.save(); g.translate(540, 640); g.font = `900 300px ${SANS}`; g.letterSpacing = '-14px'; g.textAlign = 'center'; g.textBaseline = 'middle';
  const gr = g.createLinearGradient(0, -150, 0, 150); gr.addColorStop(0, '#FFFFFF'); gr.addColorStop(1, '#9DB8FF'); g.fillStyle = gr; g.fillText('816B', 0, 0); g.restore();
  text('needs 2 Mac Studios.', 540, 880, { size: 80, weight: 700, align: 'center', track: -2 });
  // mint highlight bar behind the payoff line: gives the grid tile a bright anchor
  const w = measure('This 9B one runs', 80, 700, SANS, -2) + 72;
  g.save(); rr(540 - w / 2, 935, w, 206, 30); g.fillStyle = 'rgba(126,240,196,0.16)'; g.fill(); g.restore();
  text('This 9B one runs', 540, 1012, { size: 80, weight: 700, align: 'center', track: -2, color: C.mint });
  text('on your laptop.', 540, 1112, { size: 80, weight: 700, align: 'center', track: -2, color: C.mint });
  text('ollama run nimble', 540, 1225, { size: 48, weight: 600, font: MONO, align: 'center', color: C.mint });
  drawByte(540, 1530, 0.42, 1.0, true);
  finishDither();
}

// ------------------------------------------------------------ contract
function renderFrame(t) {
  if (q.has('cover')) { cover(); return Math.round(t * TL.fps); }
  g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  background(t);
  scene(t, -1, T.s2, sceneHook, { fi: 0.01 });
  scene(t, T.s2 - 0.08, T.s3, sceneRelease);
  scene(t, T.s3 - 0.08, T.s4, sceneTerminal, { drift: 0 });
  scene(t, T.s4 - 0.08, T.s5, scenePromises);
  scene(t, T.s5 - 0.08, T.s6, sceneCTA);
  scene(t, T.s6 - 0.08, D + 1, sceneBrand, { fo: 0.01 });
  captions(t);
  finishDither();
  return Math.round(t * TL.fps);
}
// ------------------------------------------------------------ SFX cue sheet (same clock as the picture; mix.py reads it)
function sfxCues() {
  const c = [], add = (t, s, db, kind, dur) => c.push({ t: +t.toFixed(3), s, db, kind, ...(dur ? { dur: +dur.toFixed(3) } : {}) });
  add(0.0, 'impact/bass-hit-short', -17, 'hook');
  add(L.V02.start - 0.12, 'transition/swoosh-quick', -21, 'number moves');
  add(L.V02.start + 0.3, 'ui/switch-light', -23, 'mac 1'); add(L.V02.start + 0.5, 'ui/switch-light', -25, 'mac 2');
  add(T.s2 - 0.1, 'transition/whoosh-fast', -22, 'cut s2');
  add(L.V04.start - 0.05, 'transition/sweep-short', -24, 'card in');
  add(T.s3 - 0.1, 'transition/transition-tech-slide', -22, 'terminal up');
  const typing = (t0, t1) => add(t0, 'text/typewriter-digital', -25, 'typing', t1 - t0);
  typing(K.c1, K.c1e); add(K.c1e + 0.08, 'text/typewriter-hit-soft', -21, 'enter');
  add(K.c2c - 0.3, 'transition/swoosh-quick', -25, 'email drops');
  typing(K.c2, K.c2e); add(K.c2e + 0.08, 'text/typewriter-hit-soft', -21, 'enter');
  add(K.ans, 'impact/hit-weak', -20, 'answer');
  add(K.clear, 'transition/sweep-short', -27, 'clear');
  typing(K.c3, K.c3e); add(K.c3e + 0.08, 'text/typewriter-hit-soft', -21, 'enter');
  [0, 1, 2].forEach((i) => add(K.rows + i * 0.2, 'ui/switch-light', -24 - i * 1.5, 'row'));
  add(T.s4 - 0.1, 'transition/swoosh-quick', -23, 'cut s4');
  [0, 3, 6].forEach((k, i) => add((i ? wordAt('V09', k) : Math.min(wordAt('V09', 0), T.s4 + 0.12)) - 0.05, 'ui/switch-tap', -19 - i, 'check'));
  add(T.s5 - 0.05, 'impact/impact-zoom-quick', -17, 'SORT');
  add(T.s6 - 0.1, 'transition/whoosh-fast', -24, 'cut brand');
  return c.sort((a, b) => a.t - b.t);
}
window.SFX = sfxCues();
window.renderFrame = renderFrame;
window.DURATION = D; window.FPS = TL.fps; window.FRAMES = TL.frames;
window.BEATS = TL.lines.map((l) => ({ id: l.id, mid: (l.start + l.end) / 2 }));
renderFrame(0);
window.READY = true;
