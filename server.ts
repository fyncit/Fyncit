import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Port 3000 is hardcoded per environment constraints
const PORT = 3000;
const HOST = '0.0.0.0';

const DIST_DIR = path.resolve(__dirname, 'dist');
const FALLBACK_DIR = __dirname;

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.txt': 'text/plain; charset=utf-8',
};

function getSafeFilePath(baseDir: string, urlPath: string): string | null {
  try {
    const decoded = decodeURIComponent(urlPath);
    const safePath = path.normalize(decoded).replace(/^(\.\.[\/\\])+/, '');
    const fullPath = path.join(baseDir, safePath);
    if (!fullPath.startsWith(baseDir)) {
      return null;
    }
    return fullPath;
  } catch {
    return null;
  }
}

function serveFile(res: http.ServerResponse, filePath: string, isHead: boolean): void {
  try {
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    const stat = fs.statSync(filePath);

    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': stat.size,
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
    });

    if (isHead) {
      res.end();
      return;
    }

    const stream = fs.createReadStream(filePath);
    stream.on('error', () => {
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
      }
      res.end('Internal Server Error');
    });
    stream.pipe(res);
  } catch {
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
    }
    res.end('Internal Server Error');
  }
}

function getIndexHtmlPath(): string | null {
  const distIndex = path.join(DIST_DIR, 'index.html');
  if (fs.existsSync(distIndex)) {
    return distIndex;
  }
  const rootIndex = path.join(FALLBACK_DIR, 'index.html');
  if (fs.existsSync(rootIndex)) {
    return rootIndex;
  }
  return null;
}

const server = http.createServer((req, res) => {
  const isHead = req.method === 'HEAD';
  if (req.method !== 'GET' && !isHead) {
    res.writeHead(405, { 'Content-Type': 'text/plain' });
    res.end('Method Not Allowed');
    return;
  }

  const rawUrl = req.url || '/';
  const urlPath = rawUrl.split('?')[0];

  // Health check endpoints
  if (urlPath === '/health' || urlPath === '/healthz' || urlPath === '/_health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('OK');
    return;
  }

  // Determine base directory (prefer dist)
  const baseDir = fs.existsSync(DIST_DIR) ? DIST_DIR : FALLBACK_DIR;

  // Try to serve static file
  if (urlPath !== '/') {
    const candidatePath = getSafeFilePath(baseDir, urlPath);
    if (candidatePath && fs.existsSync(candidatePath) && fs.statSync(candidatePath).isFile()) {
      serveFile(res, candidatePath, isHead);
      return;
    }
  }

  // SPA fallback: serve index.html for root and any non-file client routes
  const indexPath = getIndexHtmlPath();
  if (indexPath) {
    serveFile(res, indexPath, isHead);
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Production server running on http://${HOST}:${PORT}`);
});
