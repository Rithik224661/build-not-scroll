// prints the caption chunks the renderer will draw (QA for line breaks and timing)
import http from 'node:http'; import { readFile } from 'node:fs/promises'; import path from 'node:path'; import puppeteer from 'puppeteer';
const ROOT = path.resolve('.');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.woff2': 'font/woff2' };
const srv = http.createServer(async (q, r) => { try { const f = path.join(ROOT, decodeURIComponent(new URL(q.url, 'http://x').pathname)); const b = await readFile(f); r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] ?? 'application/octet-stream' }); r.end(b); } catch { r.writeHead(404).end(); } });
await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
const b = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage(); await p.setViewport({ width: 1080, height: 1920 });
await p.goto(`http://127.0.0.1:${srv.address().port}/index.html?gl=0.3`, { waitUntil: 'load', timeout: 0 });
await p.waitForFunction('window.CAPTION_CHUNKS', { timeout: 300000 });
for (const c of await p.evaluate(() => window.CAPTION_CHUNKS)) console.log(`${c.line} ${c.start.toFixed(2)}-${c.end.toFixed(2)}  ${c.text}  (${c.text.length})`);
await b.close(); srv.close();
