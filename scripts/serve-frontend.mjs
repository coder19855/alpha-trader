#!/usr/bin/env node
/**
 * Production static server for the Angular build.
 * Serves dist/apps/alpha-trader-web/browser on HOST:PORT (default 0.0.0.0:4000)
 * and proxies /api/* to the Fastify backend (default http://127.0.0.1:3000).
 */
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { request as httpRequest } from 'node:http';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = join(__dirname, '..', 'dist', 'apps', 'alpha-trader-web', 'browser');
const HOST = process.env.HOST ?? '0.0.0.0';
const PORT = Number(process.env.PORT ?? 4000);
const API_TARGET = (process.env.API_PROXY_TARGET ?? 'http://127.0.0.1:3000').replace(
  /\/$/,
  '',
);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
};

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

function proxyToApi(req, res) {
  const target = new URL(req.url ?? '/', API_TARGET);
  const headers = { ...req.headers, host: target.host };

  const proxyReq = httpRequest(
    {
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port,
      path: `${target.pathname}${target.search}`,
      method: req.method,
      headers,
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers);
      proxyRes.pipe(res);
    },
  );

  proxyReq.on('error', (err) => {
    if (!res.headersSent) {
      sendJson(res, 502, { error: `API proxy failed: ${err.message}` });
    } else {
      res.end();
    }
  });

  req.pipe(proxyReq);
}

function serveStatic(pathname, res) {
  const safePath = pathname.replace(/\.\./g, '');
  const filePath = join(ROOT, safePath);

  if (!filePath.startsWith(ROOT)) {
    sendJson(res, 403, { error: 'Forbidden' });
    return;
  }

  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    const indexPath = join(ROOT, 'index.html');
    if (!existsSync(indexPath)) {
      sendJson(res, 404, { error: 'Frontend build not found. Run npm run build:web first.' });
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    createReadStream(indexPath).pipe(res);
    return;
  }

  const ext = extname(filePath);
  res.writeHead(200, {
    'Content-Type': MIME[ext] ?? 'application/octet-stream',
  });
  createReadStream(filePath).pipe(res);
}

if (!existsSync(ROOT)) {
  console.error(`[alpha-trader-web] Missing build output: ${ROOT}`);
  process.exit(1);
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

  if (url.pathname.startsWith('/api')) {
    proxyToApi(req, res);
    return;
  }

  const pathname = url.pathname === '/' ? '/index.html' : url.pathname;
  serveStatic(pathname, res);
});

server.listen(PORT, HOST, () => {
  console.log(`[alpha-trader-web] http://${HOST}:${PORT} → static (${ROOT})`);
  console.log(`[alpha-trader-web] /api/* → ${API_TARGET}`);
});