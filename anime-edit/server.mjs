// Tiny static file server for the preview and the headless render.
// three.js is borrowed from one of the sim projects (no second copy on disk).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
export const VENDOR = path.join(ROOT, '..', 'week 9', 'hot-trillion', 'node_modules');
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.ttf': 'font/ttf', '.wav': 'audio/wav',
};

export function startServer(port = 5197) {
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p === '/') p = '/index.html';
    const base = p.startsWith('/vendor/') ? VENDOR : ROOT;
    const file = path.join(base, p.replace(/^\/vendor\//, '/'));
    if (!file.startsWith(base)) { res.writeHead(403).end(); return; }
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404).end('not found'); return; }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(data);
    });
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const port = Number(process.env.PORT || 5197);
  await startServer(port);
  console.log(`preview: http://127.0.0.1:${port}/  (add ?t=3 for one moment)`);
}
