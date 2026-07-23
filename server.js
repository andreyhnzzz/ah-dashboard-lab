// El puente sin CORS: el navegador no habla directo con worldcup26.ir,
// así que este server hace de intermediario. Cero dependencias externas.
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

// Copia los headers relevantes del cliente hacia la API (sin Origin, para que
// la API ni evalúe CORS). Content-Length solo si hay cuerpo.
function upstreamHeaders(req, body) {
  var headers = { 'Accept': 'application/json', 'Accept-Encoding': 'identity' };
  if (req.headers['content-type']) { headers['Content-Type'] = req.headers['content-type']; }
  if (req.headers['authorization']) { headers['Authorization'] = req.headers['authorization']; }
  if (body.length) { headers['Content-Length'] = body.length; }
  return headers;
}

// 502 = la API real no contestó. El front lo trata como un 500 más: dispara
// el mismo backoff que cualquier otro tropiezo de servidor.
function badGateway(res, req, err) {
  console.error('[proxy] error hacia ' + API_HOST + req.url + ':', err.message);
  res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ error: 'bad_gateway', message: 'No se pudo contactar la API oficial: ' + err.message }));
}

// Reenvía tal cual a https://worldcup26.ir. Sin Origin, la API ni se
// entera de que existe un CORS que evaluar.
function proxy(req, res) {
  var chunks = [];
  req.on('data', function (c) { chunks.push(c); });
  req.on('end', function () {
    var body = Buffer.concat(chunks);
    var options = { host: API_HOST, port: 443, path: req.url, method: req.method, headers: upstreamHeaders(req, body) };
    var preq = https.request(options, function (pres) {
      res.writeHead(pres.statusCode, {
        'Content-Type': pres.headers['content-type'] || 'application/json; charset=utf-8',
        // Aunque alguien pegue /get/teams en la barra de direcciones, esto
        // frena que el navegador lo interprete como HTML ejecutable.
        'X-Content-Type-Options': 'nosniff'
      });
      pres.pipe(res);
    });
    preq.on('error', function (err) { badGateway(res, req, err); });
    if (body.length) { preq.write(body); }
    preq.end();
  });
}

// Casco y cinturón para toda respuesta estática: nosniff, anti-clickjacking,
// sin fuga de referrer, y una CSP que solo confía en 'self'. Es la segunda
// capa contra XSS — la primera es esc() en js/common.js, que escapa antes
// de que nada llegue al DOM. El único permiso que se cede es 'unsafe-inline'
// en estilos (los colores de equipo se pintan inline); script-src se queda
// cerrado a cal y canto porque no hay ni un <script> suelto en el HTML.
var SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' https: data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'"
  ].join('; ')
};

// El truco viejo de "/app-secreto" coleándose por empezar igual que "/app":
// por eso se exige el separador de ruta exacto, no solo el prefijo.
function resolveWithinRoot(urlPath) {
  var filePath = path.normalize(path.join(ROOT, urlPath));
  if (filePath !== ROOT && filePath.indexOf(ROOT + path.sep) !== 0) { return null; }
  return filePath;
}

// Sirve archivos del proyecto de forma segura (sin path traversal).
function serveStatic(req, res) {
  var urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') { urlPath = '/index.html'; }

  var filePath = resolveWithinRoot(urlPath);
  if (!filePath) {
    res.writeHead(403, SECURITY_HEADERS); res.end('Forbidden'); return;
  }

  fs.stat(filePath, function (err, stat) {
    if (err || !stat.isFile()) {
      res.writeHead(404, Object.assign({ 'Content-Type': 'text/plain; charset=utf-8' }, SECURITY_HEADERS));
      res.end('404 Not Found: ' + urlPath);
      return;
    }
    var ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, Object.assign({
      'Content-Type': MIME[ext] || 'application/octet-stream',
      // no-store a propósito: sin esto el navegador podría servir para
      // siempre un JS viejo (de antes de que existiera el login, por ej.).
      'Cache-Control': 'no-store, no-cache, must-revalidate'
    }, SECURITY_HEADERS));
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
