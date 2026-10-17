// overlay.js — the 2D layer drawn over the 3D world: type helpers, word-synced captions, beat-snapped clock.
// Lessons baked in from reels 1-2: captions balanced (<= ~30 chars), never end a chunk on a small word,
// no orphans, highlight words in the accent, nothing under 32 px, multiply alpha (never assign it).
export const SANS = 'Geist', MONO = '"Geist Mono"';
export const C = { ink: '#F3F5F8', dim: 'rgba(243,245,248,0.66)', faint: 'rgba(243,245,248,0.38)', mint: '#7EF0C4', blue: '#6B97FF', amber: '#FFC861', red: '#FF5E6C', paper: '#F4F6F8', dark: '#0E1115' };
export const clamp01 = (x) => Math.min(1, Math.max(0, x));
export const lerp = (a, b, k) => a + (b - a) * k;
export const easeOut = (x) => 1 - Math.pow(1 - clamp01(x), 4);
export const easeInOut = (x) => { x = clamp01(x); return x < 0.5 ? 8 * x ** 4 : 1 - Math.pow(-2 * x + 2, 4) / 2; };
export const smooth = (x) => { x = clamp01(x); return x * x * (3 - 2 * x); };
export const backOut = (x) => { x = clamp01(x); const c1 = 1.4, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };

export function makeText(g) {
  function text(s, x, y, { size = 60, weight = 700, font = SANS, color = C.ink, align = 'left', track = 0, alpha = 1, base = 'alphabetic', shadow = 0 } = {}) {
    if (alpha <= 0.001) return;
    g.save(); g.globalAlpha *= alpha;
    g.font = `${weight} ${size}px ${font}`; g.textAlign = align; g.textBaseline = base; g.letterSpacing = `${track}px`;
    if (shadow) { g.shadowColor = 'rgba(0,0,0,0.6)'; g.shadowBlur = shadow; g.shadowOffsetY = shadow / 4; }
    g.fillStyle = color; g.fillText(s, x, y); g.restore();
  }
  function measure(s, size, weight = 700, font = SANS, track = 0) { g.save(); g.font = `${weight} ${size}px ${font}`; g.letterSpacing = `${track}px`; const w = g.measureText(s).width; g.restore(); return w; }
  function rr(x, y, w, h, r) { g.beginPath(); g.roundRect(x, y, w, h, r); }
  return { text, measure, rr };
}

// clock helpers from the voice timeline + music beat grid
export function makeClock(TL, BEATS) {
  const L = Object.fromEntries(TL.lines.map((l) => [l.id, l]));
  const wordAt = (id, k) => (L[id].words[Math.min(k, L[id].words.length - 1)] || { t: L[id].start }).t;
  const onBeat = (s) => { const c = BEATS.filter((b) => b <= s - 0.03 && b >= s - 0.5); return c.length ? c[c.length - 1] : s - 0.2; };
  return { L, wordAt, onBeat, D: TL.duration };
}

// word-synced captions
export function makeCaptions(g, TL, { nocap = [], skip = {}, y = 1500, size = 58, accentAt = () => C.mint, D }) {
  const NOCAP = new Set(nocap), CHUNKS = [];
  const WEAK = new Set(['a', 'an', 'the', 'is', 'to', 'on', 'with', 'you', 'of', 'and', 'it', 'in', 'at', 'your', "i'll", 'that', 'for', 'my', 'this']);
  for (const l of TL.lines) {
    if (NOCAP.has(l.id)) continue;
    const ws = l.words.slice(skip[l.id] || 0); if (!ws.length) continue;
    const chars = ws.reduce((a, w) => a + w.w.length + 1, 0) - 1, n = Math.max(1, Math.ceil(chars / 30)), target = chars / n;
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
  if (CHUNKS.length && CHUNKS[0].line === TL.lines[0]) CHUNKS[0].start = 0;
  return function captions(t) {
    const c = CHUNKS.find((k) => t >= k.start && t < k.end); if (!c) return;
    const a = Math.min(smooth((t - c.start) / 0.12), 1 - smooth((t - (c.end - 0.08)) / 0.08));
    const space = size * 0.3;
    g.save(); g.font = `600 ${size}px ${SANS}`; g.textBaseline = 'alphabetic'; g.letterSpacing = '0px';
    const widths = c.words.map((w) => g.measureText(w.w).width);
    const total = widths.reduce((s, v) => s + v, 0) + space * (c.words.length - 1);
    // soft dark plate behind captions so they read over any 3D scene
    g.globalAlpha = a * 0.55; const pad = 34; g.fillStyle = 'rgba(5,7,10,0.55)';
    g.beginPath(); g.roundRect((1080 - total) / 2 - pad, y - size - 18, total + pad * 2, size + 46, 28); g.fill();
    let x = (1080 - total) / 2; const accent = accentAt(t);
    c.words.forEach((w, i) => {
      const spoken = t >= w.t - 0.03;
      g.globalAlpha = a * (spoken ? 1 : 0.42);
      g.shadowColor = 'rgba(0,0,0,0.6)'; g.shadowBlur = 14; g.shadowOffsetY = 3;
      g.fillStyle = w.hl && spoken ? accent : C.ink; g.fillText(w.w, x, y);
      x += widths[i] + space;
    });
    g.restore();
  };
}

// static screen-space dither (kills banding in gradients after encode)
export function makeDither(g, W, H) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 256; const x = c.getContext('2d');
  const id = x.createImageData(256, 256); let s = 1234567;
  for (let i = 0; i < id.data.length; i += 4) { s = (s * 1103515245 + 12345) >>> 0; const v = (s >>> 24); id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 255; }
  x.putImageData(id, 0, 0); const pat = g.createPattern(c, 'repeat');
  return () => { g.save(); g.globalAlpha = 0.04; g.globalCompositeOperation = 'overlay'; g.fillStyle = pat; g.fillRect(0, 0, W, H); g.restore(); };
}
