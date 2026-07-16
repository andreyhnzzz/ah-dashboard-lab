/* ============================================================================
 * server.js — Servidor de desarrollo con PROXY a la API del Mundial 2026
 * ----------------------------------------------------------------------------
 * Se arranca con `npm start`. Hace DOS cosas:
 *
 *   1. Sirve los archivos estáticos del proyecto (index.html, css, js, assets).
 *   2. Reenvía ("proxy") las peticiones a /auth/* y /get/* hacia
 *      https://worldcup26.ir DEL LADO DEL SERVIDOR.
 *
 * ¿Por qué el proxy? La API oficial NO envía el header
 * `Access-Control-Allow-Origin` en /auth/register ni /auth/authenticate (sí lo
 * hace en /get/*), así que el navegador bloquea el login por política CORS
 * desde cualquier origen ajeno al proveedor (ver docs/LOGIN.md). CORS es una
 * regla que aplican SOLO los navegadores: una petición servidor→servidor (este
 * Node hacia worldcup26.ir) no está sujeta a ella. Al pasar el login por este
 * proxy, el navegador habla en el MISMO origen (localhost) y el servidor
 * reenvía a la API real — el login funciona de verdad, con datos en vivo.
 *
 * Sin dependencias externas (solo módulos nativos de Node): `npm start`
 * funciona recién clonado, sin `npm install`.
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

/* ---------------------------------------------------------------------------
 * Proxy: reenvía la petición entrante a https://worldcup26.ir<misma ruta>.
 * Solo se copian los headers relevantes; se pide identity para no lidiar con
 * compresión, y NO se manda Origin (así la API ni siquiera evalúa CORS).
 * ------------------------------------------------------------------------- */
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
      // Respuesta al navegador en el mismo origen (localhost): no hace falta
      // CORS. Se reenvían status y content-type; el cuerpo se re-emite crudo.
      res.writeHead(pres.statusCode, {
        'Content-Type': pres.headers['content-type'] || 'application/json; charset=utf-8'
      });
      pres.pipe(res);
    });
    preq.on('error', function (err) {
      // La API no respondió (caída, sin red, DNS…). Se devuelve 502 para que
      // el cliente lo trate como error de servidor (reintenta y, si persiste,
      // cae a datos locales — ver js/view-login.js).
      console.error('[proxy] error hacia ' + API_HOST + req.url + ':', err.message);
      res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'bad_gateway', message: 'No se pudo contactar la API oficial: ' + err.message }));
    });
    if (body.length) { preq.write(body); }
    preq.end();
  });
}

/* ---------------------------------------------------------------------------
 * Estáticos: sirve archivos del proyecto de forma segura (sin path traversal).
 * ------------------------------------------------------------------------- */
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
      'Cache-Control': 'no-cache' // desarrollo: siempre la última versión
    });
    fs.createReadStream(filePath).pipe(res);
  });
}

/* ---------------------------------------------------------------------------
 * Router: /auth/* y /get/* → proxy; el resto → estáticos.
 * ------------------------------------------------------------------------- */
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
