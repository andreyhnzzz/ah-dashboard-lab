/* ============================================================================
 * view-login.js — Pantalla de login (App.auth)
 * ----------------------------------------------------------------------------
 * Referencia visual: el login minimalista de claude.ai (tarjeta centrada,
 * un único botón de acento, sin ruido). Es la ÚNICA puerta hacia un token
 * válido: la usa tanto el arranque de la app (app.js → bootstrap) como el
 * manejo del reto de resiliencia 401 (api.js → hooks.onAuthExpired), así que
 * "el sistema de login va de la mano con la simulación de errores que
 * requieren re-loguear" descrito en el enunciado.
 *
 * Estados (misma tarjeta, contenido distinto):
 *   'new'       → primer ingreso en este navegador: pide un nombre y
 *                 dispara POST /auth/register (o su versión mock).
 *   'returning' → ya hay identidad de dispositivo guardada: un solo botón
 *                 dispara POST /auth/authenticate.
 *   'expired'   → un 401 (real o simulado desde "Modo demo") invalidó el
 *                 token en curso: mismo botón que 'returning', pero con aviso
 *                 explícito de sesión expirada.
 * ==========================================================================*/
(function (App) {
  'use strict';

  function $(id) { return document.getElementById(id); }
  function sleep(ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); }

  var mode = 'new';
  var onSuccess = null; // callback async que corre tras loguear con éxito
  var initialized = false;

  // Oculta parte del correo generado para no imprimir la identidad completa
  // en pantalla (buena práctica aun tratándose de datos de dispositivo, no
  // personales): "dashboard.ab12@wc26-isw521.local" → "dashboard.ab1…@wc26-isw521.local".
  function maskEmail(email) {
    if (!email) { return ''; }
    var at = email.indexOf('@');
    if (at < 0) { return email; }
    var user = email.slice(0, at), domain = email.slice(at);
    return (user.length > 5 ? user.slice(0, 5) + '…' : user) + domain;
  }

  function paint() {
    var title = $('auth-title'), desc = $('auth-desc'), submit = $('auth-submit');
    var fieldName = $('auth-field-name'), fieldEmail = $('auth-field-email'), chip = $('auth-email-chip');
    var email = App.storage.getDeviceEmail();

    if (mode === 'new') {
      title.textContent = 'Creá tu sesión';
      desc.textContent = 'Registrá este navegador ante la API oficial del Mundial 2026 (worldcup26.ir) para consultar datos reales y en vivo.';
      fieldName.hidden = false; fieldEmail.hidden = true;
      submit.textContent = 'Crear sesión y continuar';
    } else if (mode === 'expired') {
      title.textContent = 'Tu sesión expiró';
      desc.textContent = 'El token de acceso ya no es válido (error 401). Volvé a iniciar sesión para continuar — no perdés tu vista, tu configuración ni tu equipo favorito.';
      fieldName.hidden = true; fieldEmail.hidden = false; chip.textContent = maskEmail(email);
      submit.textContent = 'Reautenticarme';
    } else { // 'returning'
      title.textContent = 'Bienvenido de nuevo';
      desc.textContent = 'Ya tenías una sesión de dispositivo guardada en este navegador. Continuá para reconectarte a la API.';
      fieldName.hidden = true; fieldEmail.hidden = false; chip.textContent = maskEmail(email);
      submit.textContent = 'Continuar';
    }
    hideStatus();
  }

  function showStatus(text, kind) { // kind: 'loading' | 'error'
    var el = $('auth-status');
    el.textContent = text;
    el.hidden = false;
    el.className = 'auth-status ' + (kind === 'error' ? 'auth-status--error' : 'auth-status--loading');
  }
  function hideStatus() { $('auth-status').hidden = true; }

  function setBusy(busy) {
    $('auth-submit').disabled = busy;
    $('auth-name').disabled = busy;
  }

  // Mensaje accionable según el tipo de fallo — el login es la primera
  // pantalla que ve cualquiera, así que un "error de red" genérico no alcanza
  // para que alguien sin contexto técnico sepa qué hacer.
  function describeError(err) {
    if (err instanceof App.api.AuthError) {
      return 'La API respondió pero no devolvió una sesión válida. Probá de nuevo en unos segundos.';
    }
    if (err instanceof App.api.HttpError) {
      if (err.status === 429) { return 'Demasiadas solicitudes a la API (límite de tasa). Ya se reintentó automáticamente; esperá un minuto y volvé a intentar.'; }
      if (err.status >= 500) { return 'El servidor de la API tuvo un problema temporal (error ' + err.status + '). Ya se reintentó automáticamente; probá de nuevo.'; }
      return 'La API rechazó la solicitud (error ' + err.status + ').';
    }
    // TypeError de fetch ("Failed to fetch"): puede ser falta de conexión,
    // pero el caso confirmado y reproducible es que worldcup26.ir NO manda
    // Access-Control-Allow-Origin en /auth/register ni /auth/authenticate
    // (sí lo manda en /get/*) — el navegador bloquea el login por CORS para
    // cualquier origen que no sea el propio del proveedor, algo ajeno a esta
    // app y no solucionable desde el cliente. Ver docs/LOGIN.md.
    return 'No se pudo conectar con la API en vivo para iniciar sesión (probable bloqueo CORS del proveedor en /auth/*, ver docs/LOGIN.md) o falta de conexión. Continuando con datos locales de demostración…';
  }

  // Durante el intento, refleja los reintentos con backoff (429/5xx) en la
  // misma tarjeta — si no, quedarían "atrapados" detrás del auth-gate, que
  // cubre toda la app y oculta el banner global de reintento.
  async function withRetryStatus(fn) {
    var prevOnRetry = App.api.hooks.onRetry, prevOnTick = App.api.hooks.onCountdownTick, prevOnDone = App.api.hooks.onRetryDone;
    App.api.hooks.onRetry = function (info) {
      showStatus('Reintentando (intento ' + info.attempt + ')… ' + Math.round(info.waitMs / 1000) + ' s', 'loading');
    };
    App.api.hooks.onCountdownTick = function (info) {
      showStatus('Límite de tasa. Próximo intento en ' + info.secondsLeft + ' s…', 'loading');
    };
    App.api.hooks.onRetryDone = function () {};
    try {
      await fn();
    } finally {
      App.api.hooks.onRetry = prevOnRetry;
      App.api.hooks.onCountdownTick = prevOnTick;
      App.api.hooks.onRetryDone = prevOnDone;
    }
  }

  async function attemptLogin() {
    if (mode === 'new') {
      var name = $('auth-name').value.trim();
      await App.api.registerDevice(name);
    } else {
      var email = App.storage.getDeviceEmail(), pass = App.storage.getDevicePassword();
      if (email && pass) { await App.api.loginDevice(email, pass); }
      else { await App.api.registerDevice(); } // credenciales perdidas: re-registra
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setBusy(true);
    showStatus(mode === 'new' ? 'Registrando dispositivo…' : 'Conectando…', 'loading');
    try {
      await withRetryStatus(attemptLogin);
      hide();
      if (typeof onSuccess === 'function') { await onSuccess(); }
    } catch (err) {
      console.error('[auth] fallo de autenticación contra la API real:', err);
      // Confirmado con curl (sin CORS) vs. navegador: worldcup26.ir NO manda
      // Access-Control-Allow-Origin en /auth/register ni /auth/authenticate
      // (sí lo hace en /get/*), así que CUALQUIER navegador, desde CUALQUIER
      // origen que no sea el propio del proveedor, tiene el login bloqueado
      // por política CORS — no es un problema de red del usuario ni de este
      // código, y no se soluciona reintentando (ver docs/LOGIN.md). Por eso
      // la app NO debe quedar atrapada en la pantalla de login: cae sola a
      // modo local (mismo dataset que "Modo demo"), dejando constancia
      // visible del cambio (sin alert()).
      showStatus('No se pudo conectar con la API real (bloqueo CORS del proveedor en /auth/*, ver docs/LOGIN.md). Continuando con datos locales de demostración…', 'loading');
      try {
        App.config.USE_MOCK = true;
        var mockToggle = $('toggle-mock');
        if (mockToggle) { mockToggle.checked = true; }
        await attemptLogin(); // en modo mock no toca la red: no puede fallar
        await sleep(700); // deja el aviso visible un instante antes de continuar
        hide();
        if (typeof onSuccess === 'function') { await onSuccess(); }
      } catch (fallbackErr) {
        // No debería ocurrir nunca (el camino mock es local), pero si pasa,
        // recién ahí se muestra un error real y se ofrece reintentar.
        console.error('[auth] fallback local también falló:', fallbackErr);
        showStatus(describeError(fallbackErr), 'error');
      }
    } finally {
      setBusy(false);
    }
  }

  // Muestra la tarjeta y bloquea el resto de la app para lectores de
  // pantalla (aria-hidden) mientras no haya token válido.
  function show(newMode, afterSuccess) {
    mode = newMode;
    onSuccess = afterSuccess || null;
    paint();
    $('auth-gate').hidden = false;
    document.body.classList.add('auth-open');
    var shell = document.querySelector('.shell');
    if (shell) { shell.setAttribute('aria-hidden', 'true'); }
    (mode === 'new' ? $('auth-name') : $('auth-submit')).focus();
  }

  function hide() {
    $('auth-gate').hidden = true;
    document.body.classList.remove('auth-open');
    var shell = document.querySelector('.shell');
    if (shell) { shell.removeAttribute('aria-hidden'); }
  }

  function init() {
    if (initialized) { return; }
    initialized = true;
    $('auth-form').addEventListener('submit', handleSubmit);
  }

  App.auth = { show: show, hide: hide, init: init };
})(window.App = window.App || {});
