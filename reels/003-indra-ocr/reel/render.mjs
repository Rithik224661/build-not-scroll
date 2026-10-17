// Deterministic frame capture for the reel.
//   node render.mjs --stills [--scale 0.75]   -> stills/<beat>.png at each beat's midpoint (+ key moments)
//   node render.mjs [--scale 0.75] [--from N --to M] [--fresh]
//                                             -> frames/f%05d.png (resumes: skips frames already on disk)
//   node render.mjs --bench                   -> times 10 frames

import http from 'node:http';
import { readFile, mkdir, rm, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const arg = (name, def) => { const i = process.argv.indexOf(`--${name}`); return i > -1 ? process.argv[i + 1] : def; };
const flag = (name) => process.argv.includes(`--${name}`);
const SCALE = Number(arg('scale', '1'));

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.woff2': 'font/woff2' };

function serve() {
  const server = http.createServer(async (req, res) => {
    try {
      const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      const file = path.normalize(path.join(ROOT, p === '/' ? '/index.html' : p));
      if (!file.startsWith(ROOT + path.sep)) return res.writeHead(403).end();
      const body = await readFile(file);
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(body);
    } catch { res.writeHead(404).end(); }
  });
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r(server)));
}

const exists = (f) => access(f).then(() => true, () => false);

async function main() {
  const server = await serve();
  const browser = await puppeteer.launch({
    headless: true,
    protocolTimeout: 600_000,
    args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
           '--font-render-hinting=none', '--force-color-profile=srgb'],
  });
  try {
    const page = await browser.newPage();
    page.on('pageerror', (e) => console.error('[page error]', e.message));
    page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) console.error('[page]', m.text()); });
    await page.setViewport({ width: 540, height: 960, deviceScaleFactor: 1 });
    await page.goto(`http://127.0.0.1:${server.address().port}/index.html?x=1${arg('q','')}`, { waitUntil: 'load' });
    await page.waitForFunction('window.READY === true', { timeout: 120_000 });
    const meta = await page.evaluate(() => ({ dur: window.DURATION, fps: window.FPS, frames: window.FRAMES, beats: window.BEATS, cuts: window.CUTS }));
    console.log(`duration ${meta.dur}s, ${meta.frames} frames @ ${meta.fps}fps, scale ${SCALE}`);

    const grab = (t) => page.evaluate((tt) => { const shot = window.renderFrame(tt); return { shot, url: document.getElementById('c').toDataURL('image/png') }; }, t);
    const save = (file, url) => writeFile(file, Buffer.from(url.split(',')[1], 'base64'));

    if (flag('events')) {
      const sfx = await page.evaluate(() => window.SFX);
      await writeFile(path.join(ROOT, 'audio', 'sfx_cues.json'), JSON.stringify({ duration: meta.dur, cues: sfx }, null, 1));
      console.log(`wrote ${sfx.length} cues`); return;
    }
    if (flag('bench')) {
      const t0 = Date.now();
      for (let i = 0; i < 10; i++) await grab(10 + i / meta.fps);
      console.log(`bench: ${((Date.now() - t0) / 10).toFixed(0)} ms/frame`);
      return;
    }

    if (flag('stills')) {
      const dir = path.join(ROOT, 'stills'); await mkdir(dir, { recursive: true });
      const extra = (arg('at', '') || '').split(',').filter(Boolean).map(Number);
      const list = [...meta.beats.map((b) => [b.id, b.mid]), ...extra.map((t) => [`t${t.toFixed(2)}`, t])];
      for (const [id, t] of list) {
        const { shot, url } = await grab(t);
        await save(path.join(dir, `${id}.png`), url);
        console.log(`still ${id} @ ${t.toFixed(2)}s  shot=${shot}`);
      }
      return;
    }

    const outDir = path.join(ROOT, 'frames');
    if (flag('fresh')) await rm(outDir, { recursive: true, force: true });
    await mkdir(outDir, { recursive: true });
    const from = Number(arg('from', '0')), to = Math.min(Number(arg('to', String(meta.frames))), meta.frames);
    const t0 = Date.now(); let done = 0;
    for (let i = from; i < to; i++) {
      const file = path.join(outDir, `f${String(i).padStart(5, '0')}.png`);
      if (await exists(file)) continue;
      const { url } = await grab(i / meta.fps);
      await save(file, url);
      done++;
      if (done % 30 === 0) {
        const per = (Date.now() - t0) / done;
        console.log(`frame ${i + 1}/${to}  ${per.toFixed(0)} ms/frame  eta ${((to - i - 1) * per / 60000).toFixed(1)} min`);
      }
    }
    console.log(`RENDER_DONE ${done} new frames`);
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
