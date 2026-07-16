/* ============================================================================
 * storage.js — Persistencia (localStorage + sessionStorage). Ver docs/ARCHITECTURE.md
 * ==========================================================================*/
(function (App) {
  'use strict';

  var S = App.config.STORAGE;

  function safeGet(key) {
    try { return window.localStorage.getItem(key); }
    catch (e) { return null; }
  }
  function safeSet(key, value) {
    try { window.localStorage.setItem(key, value); return true; }
    catch (e) { return false; }
  }
  function safeRemove(key) {
    try { window.localStorage.removeItem(key); } catch (e) { /* noop */ }
  }
  // La sesión local (desbloqueo) vive en sessionStorage: sobrevive a un F5
  // pero se cierra sola al cerrar la pestaña/navegador — a diferencia del
  // resto de las claves, que son localStorage y persisten indefinidamente.
  function safeSessionGet(key) {
    try { return window.sessionStorage.getItem(key); }
    catch (e) { return null; }
  }
  function safeSessionSet(key, value) {
    try { window.sessionStorage.setItem(key, value); } catch (e) { /* noop */ }
  }
  function safeSessionRemove(key) {
    try { window.sessionStorage.removeItem(key); } catch (e) { /* noop */ }
  }

  App.storage = {
    getToken: function () { return safeGet(S.token); },
    setToken: function (token) { safeSet(S.token, token); },
    clearToken: function () { safeRemove(S.token); },

    // Identidad de dispositivo ante la API real (worldcup26.ir) — ver api.js.
    getDeviceEmail: function () { return safeGet(S.deviceEmail); },
    getDevicePassword: function () { return safeGet(S.devicePassword); },
    setDeviceCredentials: function (email, password) {
      safeSet(S.deviceEmail, email); safeSet(S.devicePassword, password);
    },

    // Login local (usuario + hash de contraseña) que protege el acceso a este
    // dashboard en este navegador — independiente de la identidad de dispositivo.
    getLocalUser: function () { return safeGet(S.localUser); },
    getLocalPassHash: function () { return safeGet(S.localPassHash); },
    setLocalCredentials: function (user, passHash) {
      safeSet(S.localUser, user); safeSet(S.localPassHash, passHash);
    },
    isUnlocked: function () { return safeSessionGet(S.unlocked) === '1'; },
    setUnlocked: function () { safeSessionSet(S.unlocked, '1'); },
    clearUnlocked: function () { safeSessionRemove(S.unlocked); },

    // team.id es siempre string ("1".."48"); no usar parseInt en el caller.
    getFavorite: function () { return safeGet(S.favorite); },
    setFavorite: function (teamId) { safeSet(S.favorite, String(teamId)); },

    getLastView: function () { return safeGet(S.lastView); },
    setLastView: function (id) { safeSet(S.lastView, id); },

    // Caché offline por endpoint: última respuesta buena + timestamp.
    cacheResponse: function (endpoint, data) {
      var record = { savedAt: Date.now(), data: data };
      safeSet(S.cachePrefix + endpoint, JSON.stringify(record));
    },
    getCached: function (endpoint) {
      var raw = safeGet(S.cachePrefix + endpoint);
      if (!raw) { return null; }
      try { return JSON.parse(raw); }
      catch (e) { return null; } // JSON corrupto → como si no hubiera caché
    },
    hasCache: function (endpoint) {
      return safeGet(S.cachePrefix + endpoint) != null;
    }
  };

})(window.App = window.App || {});
