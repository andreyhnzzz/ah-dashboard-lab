/* ============================================================================
 * server.js — `npm start`: sirve estáticos + proxy /auth/* y /get/* a la API
 * real (evita el bloqueo CORS del proveedor). Sin dependencias — ver
 * docs/ARCHITECTURE.md y docs/LOGIN.md para el porqué.
 * ==========================================================================*/
'use strict';

var http = require('http');
var https = require('https');
var fs = require('fs');
var path = require('path');

var PORT = process.env.PORT || 8099;
var ROOT = __dirname;
var API_HOST = 'worldcup26.ir';               // API oficial del Mundial 2026
var PROXY_PREFIXES = ['/auth/', '/get/'];     // rutas que se reenvían a la API

var MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8'
};

// Reenvía la petición a https://worldcup26.ir<misma ruta>. No se manda
// Origin, así la API ni siquiera evalúa CORS (ver docs/ARCHITECTURE.md).
function proxy(req, res) {
  var chunks = [];
  req.on('data', function (c) { chunks.push(c); });
  req.on('end', function () {
    var body = Buffer.concat(chunks);
    var headers = { 'Accept': 'application/json', 'Accept-Encoding': 'identity' };
    if (req.headers['content-type']) { headers['Content-Type'] = req.headers['content-type']; }
    if (req.headers['authorization']) { headers['Authorization'] = req.headers['authorization']; }
    if (body.length) { headers['Content-Length'] = body.length; }

    var options = { host: API_HOST, port: 443, path: req.url, method: req.method, headers: headers };
    var preq = https.request(options, function (pres) {
      res.writeHead(pres.statusCode, {
        'Content-Type': pres.headers['content-type'] || 'application/json; charset=utf-8'
      });
      pres.pipe(res);
    });
    preq.on('error', function (err) {
      // 502: el cliente lo trata como error de servidor (reintenta con
      // backoff y, si persiste, cae a datos locales — ver js/view-login.js).
      console.error('[proxy] error hacia ' + API_HOST + req.url + ':', err.message);
      res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'bad_gateway', message: 'No se pudo contactar la API oficial: ' + err.message }));
    });
    if (body.length) { preq.write(body); }
    preq.end();
  });
}

// Sirve archivos del proyecto de forma segura (sin path traversal).
function serveStatic(req, res) {
  var urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') { urlPath = '/index.html'; }

  // Normaliza y confina la ruta a ROOT (evita ../ escapando del proyecto).
  var filePath = path.normalize(path.join(ROOT, urlPath));
  if (filePath.indexOf(ROOT) !== 0) {
    res.writeHead(403); res.end('Forbidden'); return;
  }

  fs.stat(filePath, function (err, stat) {
    if (err || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found: ' + urlPath);
      return;
    }
    var ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      // no-store (no solo no-cache): sin ETag/Last-Modified el navegador no
      // tiene con qué revalidar, así que "no-cache" igual puede servir una
      // copia vieja. En desarrollo esto se nota fuerte: si abriste la app
      // antes de que existiera el login/logout, el navegador puede quedarse
      // sirviendo ese JS viejo indefinidamente en visitas futuras.
      'Cache-Control': 'no-store, no-cache, must-revalidate'
    });
    fs.createReadStream(filePath).pipe(res);
  });
}

// Router: /auth/* y /get/* → proxy; el resto → estáticos.
var server = http.createServer(function (req, res) {
  var p = req.url.split('?')[0];
  var isApi = PROXY_PREFIXES.some(function (pre) { return p.indexOf(pre) === 0; });
  if (isApi) { proxy(req, res); } else { serveStatic(req, res); }
});

server.listen(PORT, function () {
  console.log('Mundial 2026 · Dashboard Integral');
  console.log('  Servidor:  http://localhost:' + PORT);
  console.log('  Proxy API: /auth/* y /get/*  →  https://' + API_HOST);
  console.log('  (Ctrl+C para detener)');
});
