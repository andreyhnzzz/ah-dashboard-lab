// Todo lo que toca la red pasa por acá — el resto de la app ni sabe que
// fetch existe. JWT, reintentos y backoff, todo en un solo lugar.
(function (App) {
  'use strict';

  var C = App.config;

  function AuthError(message) { this.name = 'AuthError'; this.message = message || '401'; }
  AuthError.prototype = Object.create(Error.prototype);

  function HttpError(status, message) {
    this.name = 'HttpError';
    this.status = status;
    this.message = message || ('HTTP ' + status);
  }
  HttpError.prototype = Object.create(Error.prototype);

  // La red no sabe que hay una interfaz del otro lado — solo grita por acá.
  var hooks = {
    onRetry: function () {},
    onCountdownTick: function () {},
    onRetryDone: function () {},
    onAuthExpired: function () {}
  };
  App.api = { AuthError: AuthError, HttpError: HttpError, hooks: hooks };

  function sleep(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  function authHeaders() {
    var token = App.storage.getToken();
    var headers = { 'Accept': 'application/json' };
    if (token) { headers['Authorization'] = 'Bearer ' + token; }
    return headers;
  }

  function shortName(endpoint) {
    for (var key in C.ENDPOINTS) { if (C.ENDPOINTS[key] === endpoint) { return key; } }
    return null;
  }

  async function transport(endpoint) {
    if (C.USE_MOCK) {
      var target = C.SIMULATE_TARGET || 'all';
      var applies = !C.SIMULATE || target === 'all' || target === shortName(endpoint);
      return App.mock.respond(endpoint, applies ? C.SIMULATE : '');
    }
    return fetch(C.API_BASE + endpoint, { method: 'GET', headers: authHeaders() });
  }

  function randomToken(len) {
    if (window.crypto && window.crypto.getRandomValues) {
      var arr = window.crypto.getRandomValues(new Uint32Array(len || 3));
      return Array.prototype.map.call(arr, function (n) { return n.toString(36); }).join('');
    }
    return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  }

  // El login también tiene derecho a reintentar — un tropiezo no debería
  // dejar a nadie afuera de la fiesta.
  async function postWithRetry(url, payload) {
    var attempt = 0;
    while (true) {
      attempt += 1;
      var res;
      try {
        res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify(payload)
        });
      } catch (networkError) {
        if (attempt < C.MAX_ATTEMPTS) { await backoffWait(attempt, 0); continue; }
        hooks.onRetryDone();
        throw networkError;
      }
      if (res.ok || (res.status !== 429 && res.status < 500)) { hooks.onRetryDone(); return res; }
      if (attempt < C.MAX_ATTEMPTS) { await backoffWait(attempt, res.status); continue; }
      hooks.onRetryDone();
      return res;
    }
  }

  async function registerDevice(displayName) {
    if (C.USE_MOCK) {
      var mockEmail = 'demo.' + randomToken() + '@wc26-isw521.local';
      App.storage.setDeviceCredentials(mockEmail, 'mock-password');
      var fakeToken1 = 'mock.jwt.' + Date.now();
      App.storage.setToken(fakeToken1);
      return fakeToken1;
    }
    var suffix = randomToken();
    var email = 'dashboard.' + suffix + '@wc26-isw521.local';
    var password = 'Wc26-' + suffix + '-Aa1';
    var res = await postWithRetry(C.API_BASE + C.AUTH_REGISTER_ENDPOINT,
      { name: (displayName || 'Fanático ISW-521'), email: email, password: password });
    if (!res.ok) { throw new HttpError(res.status, 'No se pudo registrar el dispositivo en la API'); }
    var body = await res.json();
    if (!body.token) { throw new AuthError('El registro no devolvió un token'); }
    App.storage.setDeviceCredentials(email, password);
    App.storage.setToken(body.token);
    return body.token;
  }

  async function loginDevice(email, password) {
    if (C.USE_MOCK) {
      var fakeToken2 = 'mock.jwt.' + Date.now();
      App.storage.setToken(fakeToken2);
      return fakeToken2;
    }
    var res = await postWithRetry(C.API_BASE + C.AUTH_LOGIN_ENDPOINT, { email: email, password: password });
    if (!res.ok) { throw new HttpError(res.status, 'Fallo de autenticación'); }
    var body = await res.json();
    if (!body.token) { throw new AuthError('El login no devolvió un token'); }
    App.storage.setToken(body.token);
    return body.token;
  }

  async function authenticate() {
    var email = App.storage.getDeviceEmail();
    var password = App.storage.getDevicePassword();
    if (email && password) { return await loginDevice(email, password); }
    return await registerDevice();
  }
  App.api.authenticate = authenticate;
  App.api.registerDevice = registerDevice;
  App.api.loginDevice = loginDevice;

  async function backoffWait(attempt, status) {
    var waitMs = C.BACKOFF_BASE_MS * Math.pow(2, attempt - 1); // 1s,2s,4s,8s...
    hooks.onRetry({ attempt: attempt, status: status, waitMs: waitMs });
    if (status === 429) {
      var secondsLeft = Math.round(waitMs / 1000);
      while (secondsLeft > 0) {
        hooks.onCountdownTick({ secondsLeft: secondsLeft, attempt: attempt, status: status });
        await sleep(1000);
        secondsLeft -= 1;
      }
    } else {
      await sleep(waitMs);
    }
  }

  // Plan B del modo offline: si hay algo guardado, lo servimos con la
  // etiqueta de "viejo" en vez de dejar a la app con las manos vacías.
  function fallbackOrThrow(endpoint, error) {
    var cached = App.storage.getCached(endpoint);
    if (cached) { return { data: cached.data, stale: true, savedAt: cached.savedAt, error: error }; }
    throw error;
  }

  // Traduce una respuesta HTTP ya recibida a una decisión:
  //   { value }         → éxito, devolver esos datos
  //   { retry, status } → 429/5xx, reintentar con backoff
  //   { giveUp, status } → otro error, caer a caché o lanzar
  // El 401 es especial: limpia token, avisa a la UI y lanza AuthError.
  async function classifyResponse(endpoint, res) {
    if (res.ok) {
      var data = await res.json();
      App.storage.cacheResponse(endpoint, data);
      return { value: { data: data, stale: false } };
    }
    if (res.status === 401) {
      // Token quemado: se limpia y se avisa. Nada de reload — eso es trampa.
      App.storage.clearToken();
      hooks.onRetryDone();
      hooks.onAuthExpired();
      throw new AuthError('Sesión expirada (401)');
    }
    if (res.status === 429 || res.status >= 500) { return { retry: true, status: res.status }; }
    return { giveUp: true, status: res.status };
  }

  // El semáforo de todo el flujo: siempre { data, stale, savedAt? } o un
  // error con nombre y apellido (401 → AuthError, resto → HttpError).
  async function getData(endpoint) {
    if (!App.storage.getToken()) { await authenticate(); }
    var attempt = 0;
    while (true) {
      attempt += 1;
      var res;
      try {
        res = await transport(endpoint);
      } catch (networkError) {
        if (App.storage.hasCache(endpoint) || attempt >= C.MAX_ATTEMPTS) { hooks.onRetryDone(); return fallbackOrThrow(endpoint, networkError); }
        await backoffWait(attempt, 0); continue;
      }
      var r = await classifyResponse(endpoint, res);
      if (r.value) { hooks.onRetryDone(); return r.value; }
      if (r.giveUp || attempt >= C.MAX_ATTEMPTS) { hooks.onRetryDone(); return fallbackOrThrow(endpoint, new HttpError(r.status)); }
      await backoffWait(attempt, r.status); continue;
    }
  }
  App.api.getData = getData;

})(window.App = window.App || {});
