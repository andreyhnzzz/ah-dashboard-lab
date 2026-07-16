/* ============================================================================
 * view-login.js — Pantalla de acceso (App.auth). Ver docs/ARCHITECTURE.md.
 * Dos capas en la misma tarjeta:
 *   1) Local ('local-new' / 'local-unlock'): usuario+contraseña elegidos por
 *      la persona, para proteger el dashboard en este navegador. Sin esto no
 *      se ve ni un dato de la app.
 *   2) Dispositivo ('new' / 'returning' / 'expired'): identidad autogenerada
 *      contra la API real del Mundial 2026 (sin credenciales de curso).
 * ==========================================================================*/
(function (App) {
  'use strict';

  function $(id) { return document.getElementById(id); }
  function sleep(ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); }

  var mode = 'local-new';
  var onSuccess = null;
  var initialized = false;

  async function sha256Hex(text) {
    var buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.prototype.map.call(new Uint8Array(buf), function (b) { return b.toString(16).padStart(2, '0'); }).join('');
  }

  function maskEmail(email) {
    if (!email) { return ''; }
    var at = email.indexOf('@');
    if (at < 0) { return email; }
    var user = email.slice(0, at), domain = email.slice(at);
    return (user.length > 5 ? user.slice(0, 5) + '…' : user) + domain;
  }

  function paint() {
    var title = $('auth-title'), desc = $('auth-desc'), submit = $('auth-submit'), foot = $('auth-foot');
    var fUser = $('auth-field-user'), fPass = $('auth-field-pass'), fPass2 = $('auth-field-pass2');
    var fName = $('auth-field-name'), fEmail = $('auth-field-email'), chip = $('auth-email-chip');
    [fUser, fPass, fPass2, fName, fEmail].forEach(function (f) { f.hidden = true; });

    if (mode === 'local-new') {
      title.textContent = 'Creá tu acceso';
      desc.textContent = 'Elegí un usuario y una contraseña para proteger este dashboard en este navegador.';
      fUser.hidden = fPass.hidden = fPass2.hidden = false;
      $('auth-user').value = ''; $('auth-pass').value = ''; $('auth-pass2').value = '';
      submit.textContent = 'Crear acceso';
      foot.hidden = false;
    } else if (mode === 'local-unlock') {
      title.textContent = 'Iniciá sesión';
      desc.textContent = 'Ingresá tu usuario y contraseña para acceder al dashboard.';
      fUser.hidden = fPass.hidden = false;
      $('auth-user').value = App.storage.getLocalUser() || ''; $('auth-pass').value = '';
      submit.textContent = 'Entrar';
      foot.hidden = true;
    } else if (mode === 'new') {
      title.textContent = 'Conectá con la API';
      desc.textContent = 'Registrá este navegador ante la API oficial del Mundial 2026 para consultar datos reales y en vivo.';
      fName.hidden = false;
      submit.textContent = 'Crear sesión y continuar';
      foot.hidden = false;
    } else if (mode === 'expired') {
      title.textContent = 'Tu sesión expiró';
      desc.textContent = 'El token de acceso ya no es válido. Volvé a iniciar sesión para continuar.';
      fEmail.hidden = false; chip.textContent = maskEmail(App.storage.getDeviceEmail());
      submit.textContent = 'Reautenticarme';
      foot.hidden = true;
    } else { // 'returning'
      title.textContent = 'Bienvenido de nuevo';
      desc.textContent = 'Reconectando con la API oficial del Mundial 2026…';
      fEmail.hidden = false; chip.textContent = maskEmail(App.storage.getDeviceEmail());
      submit.textContent = 'Continuar';
      foot.hidden = true;
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
    ['auth-user', 'auth-pass', 'auth-pass2', 'auth-name'].forEach(function (id) { $(id).disabled = busy; });
  }

  function describeError(err) {
    if (err instanceof App.api.AuthError) { return 'La API respondió pero no devolvió una sesión válida. Probá de nuevo en unos segundos.'; }
    if (err instanceof App.api.HttpError) {
      if (err.status === 429) { return 'Demasiadas solicitudes a la API. Ya se reintentó automáticamente; esperá un minuto y volvé a intentar.'; }
      if (err.status >= 500) { return 'El servidor de la API tuvo un problema temporal (' + err.status + '). Ya se reintentó; probá de nuevo.'; }
      return 'La API rechazó la solicitud (error ' + err.status + ').';
    }
    // "Failed to fetch": sin conexión, o CORS del proveedor en /auth/* si se
    // corrió sin el proxy de `npm start` — ver docs/LOGIN.md.
    return 'No se pudo conectar con la API en vivo (ver docs/LOGIN.md). Continuando con datos locales de demostración…';
  }

  // Refleja los reintentos con backoff (429/5xx) en la misma tarjeta, ya que
  // el auth-gate cubre el banner global de reintento.
  async function withRetryStatus(fn) {
    var prevOnRetry = App.api.hooks.onRetry, prevOnTick = App.api.hooks.onCountdownTick, prevOnDone = App.api.hooks.onRetryDone;
    App.api.hooks.onRetry = function (info) { showStatus('Reintentando (intento ' + info.attempt + ')… ' + Math.round(info.waitMs / 1000) + ' s', 'loading'); };
    App.api.hooks.onCountdownTick = function (info) { showStatus('Límite de tasa. Próximo intento en ' + info.secondsLeft + ' s…', 'loading'); };
    App.api.hooks.onRetryDone = function () {};
    try { await fn(); }
    finally {
      App.api.hooks.onRetry = prevOnRetry;
      App.api.hooks.onCountdownTick = prevOnTick;
      App.api.hooks.onRetryDone = prevOnDone;
    }
  }

  async function attemptDeviceLogin() {
    if (mode === 'new') {
      await App.api.registerDevice($('auth-name').value.trim());
    } else {
      var email = App.storage.getDeviceEmail(), pass = App.storage.getDevicePassword();
      if (email && pass) { await App.api.loginDevice(email, pass); }
      else { await App.api.registerDevice(); } // credenciales perdidas: re-registra
    }
  }

  async function handleLocalSubmit() {
    setBusy(true);
    showStatus(mode === 'local-new' ? 'Creando acceso…' : 'Verificando…', 'loading');
    try {
      var user = $('auth-user').value.trim(), pass = $('auth-pass').value;
      if (mode === 'local-new') {
        if (!user || pass.length < 4) { throw new Error('Elegí un usuario y una contraseña de al menos 4 caracteres.'); }
        if (pass !== $('auth-pass2').value) { throw new Error('Las contraseñas no coinciden.'); }
        App.storage.setLocalCredentials(user, await sha256Hex(user.toLowerCase() + ':' + pass));
      } else {
        var storedUser = App.storage.getLocalUser();
        var hash = await sha256Hex(user.toLowerCase() + ':' + pass);
        if (!user || user.toLowerCase() !== (storedUser || '').toLowerCase() || hash !== App.storage.getLocalPassHash()) {
          throw new Error('Usuario o contraseña incorrectos.');
        }
      }
      App.storage.setUnlocked();
      hide();
      if (typeof onSuccess === 'function') { await onSuccess(); }
    } catch (err) {
      showStatus(err.message || 'No se pudo continuar.', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function handleDeviceSubmit() {
    setBusy(true);
    showStatus(mode === 'new' ? 'Registrando dispositivo…' : 'Conectando…', 'loading');
    try {
      await withRetryStatus(attemptDeviceLogin);
      hide();
      if (typeof onSuccess === 'function') { await onSuccess(); }
    } catch (err) {
      console.error('[auth] fallo contra la API real:', err);
      // La app nunca debe quedar atrapada en el login por un problema de red
      // o CORS ajeno al usuario: cae a datos locales (ver docs/LOGIN.md).
      showStatus('No se pudo conectar con la API real. Continuando con datos locales de demostración…', 'loading');
      try {
        App.config.USE_MOCK = true;
        var mockToggle = $('toggle-mock'); if (mockToggle) { mockToggle.checked = true; }
        await attemptDeviceLogin(); // en modo mock no toca la red: no falla
        await sleep(700);
        hide();
        if (typeof onSuccess === 'function') { await onSuccess(); }
      } catch (fallbackErr) {
        console.error('[auth] fallback local también falló:', fallbackErr);
        showStatus(describeError(fallbackErr), 'error');
      }
    } finally {
      setBusy(false);
    }
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (mode === 'local-new' || mode === 'local-unlock') { handleLocalSubmit(); }
    else { handleDeviceSubmit(); }
  }

  function show(newMode, afterSuccess) {
    mode = newMode;
    onSuccess = afterSuccess || null;
    paint();
    $('auth-gate').hidden = false;
    document.body.classList.add('auth-open');
    var shell = document.querySelector('.shell');
    if (shell) { shell.setAttribute('aria-hidden', 'true'); }
    var focusId = (mode === 'local-new' || mode === 'local-unlock') ? 'auth-user' : (mode === 'new' ? 'auth-name' : 'auth-submit');
    $(focusId).focus();
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
