// node shoot.mjs page.html out.png [scale]  -> renders a 1080x1920 page at 2x and saves it (downscaled later)
import http from 'node:http'; import { readFile } from 'node:fs/promises'; import path from 'node:path';
import puppeteer from 'puppeteer';
const ROOT = path.resolve('.'); const [page_, out, scale = '2'] = process.argv.slice(2);
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.woff2': 'font/woff2', '.png': 'image/png', '.svg': 'image/svg+xml' };
const srv = http.createServer(async (q, r) => { try { const p = decodeURIComponent(new URL(q.url, 'http://x').pathname); const f = path.join(ROOT, p);
  const body = await readFile(f); r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] ?? 'application/octet-stream' }); r.end(body); } catch { r.writeHead(404).end(); } });
await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
const b = await puppeteer.launch({ headless: true, protocolTimeout: 600000, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--font-render-hinting=none', '--force-color-profile=srgb'] });
const p = await b.newPage(); p.on('pageerror', (e) => console.error('[pageerror]', e.message)); p.on('console', (m) => { if (m.type() === 'error' || m.text().startsWith('CHECK')) console.error('[page]', m.text()); });
await p.setViewport({ width: 1080, height: 1920, deviceScaleFactor: Number(scale) });
await p.goto(`http://127.0.0.1:${srv.address().port}/${page_}`, { waitUntil: 'load', timeout: 0 });
await p.waitForFunction('window.READY === true', { timeout: 300000 });
await p.screenshot({ path: out, clip: { x: 0, y: 0, width: 1080, height: 1920 } });
await b.close(); srv.close(); console.log('shot', out);
