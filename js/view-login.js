// Una tarjeta, dos candados: el local (usuario/contraseña que vos elegís,
// protege este navegador) y el de dispositivo (identidad autogenerada
// contra la API real). Sin el primero no se ve ni un dato.
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

  // Todos los campos posibles del formulario (se ocultan y cada modo reactiva
  // los suyos). `prep` corre las acciones puntuales de cada modo (valores, chip).
  var AUTH_FIELDS = ['auth-field-user', 'auth-field-pass', 'auth-field-pass2', 'auth-field-name', 'auth-field-email'];
  function setEmailChip() { $('auth-email-chip').textContent = maskEmail(App.storage.getDeviceEmail()); }
  var AUTH_MODES = {
    'local-new': {
      title: 'Creá tu acceso', submit: 'Crear acceso', footHidden: false,
      desc: 'Elegí un usuario y una contraseña para proteger este dashboard en este navegador.',
      fields: ['auth-field-user', 'auth-field-pass', 'auth-field-pass2'],
      prep: function () { $('auth-user').value = ''; $('auth-pass').value = ''; $('auth-pass2').value = ''; }
    },
    'local-unlock': {
      title: 'Iniciá sesión', submit: 'Entrar', footHidden: true,
      desc: 'Ingresá tu usuario y contraseña para acceder al dashboard.',
      fields: ['auth-field-user', 'auth-field-pass'],
      prep: function () { $('auth-user').value = App.storage.getLocalUser() || ''; $('auth-pass').value = ''; }
    },
    'new': {
      title: 'Conectá con la API', submit: 'Crear sesión y continuar', footHidden: false,
      desc: 'Registrá este navegador ante la API oficial del Mundial 2026 para consultar datos reales y en vivo.',
      fields: ['auth-field-name']
    },
    'expired': {
      title: 'Tu sesión expiró', submit: 'Reautenticarme', footHidden: true,
      desc: 'El token de acceso ya no es válido. Volvé a iniciar sesión para continuar.',
      fields: ['auth-field-email'], prep: setEmailChip
    },
    'returning': {
      title: 'Bienvenido de nuevo', submit: 'Continuar', footHidden: true,
      desc: 'Reconectando con la API oficial del Mundial 2026…',
      fields: ['auth-field-email'], prep: setEmailChip
    }
  };

  function paint() {
    var cfg = AUTH_MODES[mode] || AUTH_MODES.returning;
    AUTH_FIELDS.forEach(function (id) { $(id).hidden = true; });
    $('auth-title').textContent = cfg.title;
    $('auth-desc').textContent = cfg.desc;
    $('auth-submit').textContent = cfg.submit;
    $('auth-foot').hidden = cfg.footHidden;
    cfg.fields.forEach(function (id) { $(id).hidden = false; });
    if (cfg.prep) { cfg.prep(); }
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
    // "Failed to fetch" = sin conexión, o corriste esto sin el proxy de
    // `npm start` (entonces CORS te para en seco en /auth/*).
    return 'No se pudo conectar con la API en vivo. Continuando con datos locales de demostración…';
  }

  // El banner global de reintento queda tapado por el auth-gate, así que
  // acá se muestra el mismo backoff (429/5xx) directo en la tarjeta.
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
      else { await App.api.registerDevice(); } // sin credenciales guardadas, arranca de cero
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

  // Salvavidas: nadie se queda pegado en el login por un problema de red ajeno.
  // Se pasa a modo demo (datos locales) y se continúa como si nada.
  async function fallbackToMock() {
    showStatus('No se pudo conectar con la API real. Continuando con datos locales de demostración…', 'loading');
    App.config.USE_MOCK = true;
    var mockToggle = $('toggle-mock'); if (mockToggle) { mockToggle.checked = true; }
    await attemptDeviceLogin(); // en modo mock no hay red que le pueda fallar
    await sleep(700);
    hide();
    if (typeof onSuccess === 'function') { await onSuccess(); }
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
      try {
        await fallbackToMock();
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
