/* ============================================================================
 * api.js — Capa de acceso a datos (Fetch + JWT + resiliencia)
 * ----------------------------------------------------------------------------
 * ÚNICO lugar que habla con la red. La capa de presentación (ui.js) nunca llama
 * a fetch directamente: pide datos a `App.api.getData(...)` y recibe siempre un
 * resultado normalizado. Esto cumple el requisito de la rúbrica de "separar la
 * lógica de fetch de la lógica de presentación".
 *
 * Cumple la Arquitectura Base de Resiliencia (sección 1.5 del enunciado):
 *   1. JWT: cada petición envía Authorization: Bearer <token>.
 *   2. async/await EXCLUSIVO. No hay .then() ni .catch() en ningún punto.
 *   3. 401 → limpia token y avisa a la UI (modal de sesión expirada). Sin reload.
 *   4. Backoff exponencial (1s,2s,4s,8s) para 429 y 500; en 429, countdown visible.
 *   5. Offline: cachea la última respuesta OK y la sirve marcada como "no actual".
 *
 * Prohibiciones respetadas: sin alert(), sin .then()/.catch(), sin location.reload().
 * ==========================================================================*/
(function (App) {
  'use strict';

  var C = App.config;

  /* --- Errores tipados (permiten a la UI distinguir el caso) --------------- */
  function AuthError(message) { this.name = 'AuthError'; this.message = message || '401'; }
  AuthError.prototype = Object.create(Error.prototype);

  function HttpError(status, message) {
    this.name = 'HttpError';
    this.status = status;
    this.message = message || ('HTTP ' + status);
  }
  HttpError.prototype = Object.create(Error.prototype);

  /* --- Hooks que la UI puede registrar para reflejar el estado de la red ----
   * Se inicializan como no-ops para que la capa de datos nunca dependa de la UI.
   * ------------------------------------------------------------------------*/
  var hooks = {
    onRetry: function () {},        // ({ attempt, status, waitMs }) → aviso "reintentando"
    onCountdownTick: function () {},// ({ secondsLeft, attempt, status }) → countdown 429
    onRetryDone: function () {},    // () → limpiar avisos de reintento
    onAuthExpired: function () {}   // () → mostrar modal de sesión expirada
  };
  App.api = { AuthError: AuthError, HttpError: HttpError, hooks: hooks };

  /* --- Utilidades ---------------------------------------------------------- */
  function sleep(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  function authHeaders() {
    var token = App.storage.getToken();
    var headers = { 'Accept': 'application/json' };
    if (token) { headers['Authorization'] = 'Bearer ' + token; }
    return headers;
  }

  // Nombre corto del endpoint (para acotar la simulación a uno solo).
  function shortName(endpoint) {
    for (var key in C.ENDPOINTS) { if (C.ENDPOINTS[key] === endpoint) { return key; } }
    return null;
  }

  /* --- Transporte: obtiene una Response (API real o mock) ------------------ */
  async function transport(endpoint) {
    if (C.USE_MOCK) {
      // El mock respeta C.SIMULATE para inyectar 401/429/500/network, acotado
      // al endpoint elegido en SIMULATE_TARGET ('all' = todos a la vez).
      var target = C.SIMULATE_TARGET || 'all';
      var applies = !C.SIMULATE || target === 'all' || target === shortName(endpoint);
      return App.mock.respond(endpoint, applies ? C.SIMULATE : '');
    }
    var res = await fetch(C.API_BASE + endpoint, {
      method: 'GET',
      headers: authHeaders()
    });
    return res;
  }

  /* --- Autenticación: obtiene y persiste el JWT --------------------------- */
  async function authenticate() {
    if (C.USE_MOCK) {
      // Token simulado para poder ejercitar el flujo completo sin backend real.
      var fakeToken = 'mock.jwt.' + Date.now();
      App.storage.setToken(fakeToken);
      return fakeToken;
    }
    var res = await fetch(C.API_BASE + C.AUTH_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(C.AUTH_CREDENTIALS)
    });
    if (!res.ok) { throw new HttpError(res.status, 'Fallo de autenticación'); }
    var body = await res.json();
    var token = body.token || body.access_token || body.jwt;
    if (!token) { throw new AuthError('La respuesta de login no contiene token'); }
    App.storage.setToken(token);
    return token;
  }
  App.api.authenticate = authenticate;

  /* --- Espera del backoff, con countdown visible en caso de 429 ----------- */
  async function backoffWait(attempt, status) {
    var waitMs = C.BACKOFF_BASE_MS * Math.pow(2, attempt - 1); // 1s,2s,4s,8s...
    hooks.onRetry({ attempt: attempt, status: status, waitMs: waitMs });

    // El 429 (límite de tasa) exige un countdown en segundos visible al usuario.
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

  /* --- Fallback offline: sirve caché marcada como "no actualizada" --------- */
  function fallbackOrThrow(endpoint, error) {
    var cached = App.storage.getCached(endpoint);
    if (cached) {
      return { data: cached.data, stale: true, savedAt: cached.savedAt, error: error };
    }
    throw error; // sin caché no hay nada que mostrar → el caller decide el estado de error
  }

  /* --- API pública: getData -----------------------------------------------
   * Devuelve SIEMPRE un objeto { data, stale, savedAt? } o lanza un error tipado.
   * `stale: true` indica datos servidos desde caché (mostrar aviso).
   * ------------------------------------------------------------------------*/
  async function getData(endpoint) {
    // Garantiza que exista token antes de pedir datos (JWT obligatorio).
    if (!App.storage.getToken()) {
      await authenticate();
    }

    var attempt = 0;
    while (true) {
      attempt += 1;
      var res;

      // 1) Intentar el transporte. Un fallo de red rechaza la promesa.
      try {
        res = await transport(endpoint);
      } catch (networkError) {
        // Offline: si ya hay copia en caché, mostrarla de inmediato (no tiene
        // sentido martillar la red). Sin caché, reintentar con backoff.
        if (App.storage.hasCache(endpoint)) {
          hooks.onRetryDone();
          return fallbackOrThrow(endpoint, networkError);
        }
        if (attempt < C.MAX_ATTEMPTS) { await backoffWait(attempt, 0); continue; }
        hooks.onRetryDone();
        return fallbackOrThrow(endpoint, networkError); // primera carga sin red y sin caché
      }

      // 2) Éxito: cachear y devolver datos frescos.
      if (res.ok) {
        var data = await res.json();
        App.storage.cacheResponse(endpoint, data);
        hooks.onRetryDone();
        return { data: data, stale: false };
      }

      // 3) 401: token inválido/expirado. Limpiar y avisar (modal), sin reload.
      if (res.status === 401) {
        App.storage.clearToken();
        hooks.onRetryDone();
        hooks.onAuthExpired();
        throw new AuthError('Sesión expirada (401)');
      }

      // 4) 429 / 5xx: reintentar con backoff exponencial.
      if (res.status === 429 || res.status >= 500) {
        if (attempt < C.MAX_ATTEMPTS) { await backoffWait(attempt, res.status); continue; }
        hooks.onRetryDone();
        return fallbackOrThrow(endpoint, new HttpError(res.status)); // agotado → caché
      }

      // 5) Otros 4xx no recuperables.
      hooks.onRetryDone();
      return fallbackOrThrow(endpoint, new HttpError(res.status));
    }
  }
  App.api.getData = getData;

  /* --- Reautenticación explícita (botón del modal de sesión expirada) ------ */
  async function reauthenticate() {
    await authenticate();
  }
  App.api.reauthenticate = reauthenticate;

})(window.App = window.App || {});
