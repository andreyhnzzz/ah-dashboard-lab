// La memoria del navegador: lo que sobrevive a un F5 vive acá.
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
  // Esta sí es sessionStorage a propósito: sobrevive un F5 pero se apaga
  // sola al cerrar la pestaña. Todo lo demás abajo es para siempre.
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

    // El "quién soy" frente a la API real — de acá sale el JWT.
    getDeviceEmail: function () { return safeGet(S.deviceEmail); },
    getDevicePassword: function () { return safeGet(S.devicePassword); },
    setDeviceCredentials: function (email, password) {
      safeSet(S.deviceEmail, email); safeSet(S.devicePassword, password);
    },

    // Un candado aparte, solo para este navegador — nada que ver con el JWT.
    getLocalUser: function () { return safeGet(S.localUser); },
    getLocalPassHash: function () { return safeGet(S.localPassHash); },
    setLocalCredentials: function (user, passHash) {
      safeSet(S.localUser, user); safeSet(S.localPassHash, passHash);
    },
    isUnlocked: function () { return safeSessionGet(S.unlocked) === '1'; },
    setUnlocked: function () { safeSessionSet(S.unlocked, '1'); },
    clearUnlocked: function () { safeSessionRemove(S.unlocked); },

    // El favorito que sobrevive al refresh (reto 2.4). Ojo: id siempre string.
    getFavorite: function () { return safeGet(S.favorite); },
    setFavorite: function (teamId) { safeSet(S.favorite, String(teamId)); },

    getLastView: function () { return safeGet(S.lastView); },
    setLastView: function (id) { safeSet(S.lastView, id); },

    // Preferencias de accesibilidad — quedan puestas para la próxima vez.
    getColorblind: function () { return safeGet(S.colorblind) === '1'; },
    setColorblind: function (on) { if (on) { safeSet(S.colorblind, '1'); } else { safeRemove(S.colorblind); } },

    getFontScale: function () { var v = parseInt(safeGet(S.fontScale), 10); return v || 100; },
    setFontScale: function (pct) { safeSet(S.fontScale, String(pct)); },

    getContrast: function () { return safeGet(S.contrast) === '1'; },
    setContrast: function (on) { if (on) { safeSet(S.contrast, '1'); } else { safeRemove(S.contrast); } },

    getDyslexia: function () { return safeGet(S.dyslexia) === '1'; },
    setDyslexia: function (on) { if (on) { safeSet(S.dyslexia, '1'); } else { safeRemove(S.dyslexia); } },

    getLinks: function () { return safeGet(S.links) === '1'; },
    setLinks: function (on) { if (on) { safeSet(S.links, '1'); } else { safeRemove(S.links); } },

    getCursor: function () { return safeGet(S.cursor) === '1'; },
    setCursor: function (on) { if (on) { safeSet(S.cursor, '1'); } else { safeRemove(S.cursor); } },

    getPauseMotion: function () { return safeGet(S.pauseMotion) === '1'; },
    setPauseMotion: function (on) { if (on) { safeSet(S.pauseMotion, '1'); } else { safeRemove(S.pauseMotion); } },

    // El modo offline en dos funciones: última respuesta buena + hora, por
    // endpoint. Si todo lo demás falla, esto es lo que salva el dashboard.
    cacheResponse: function (endpoint, data) {
      var record = { savedAt: Date.now(), data: data };
      safeSet(S.cachePrefix + endpoint, JSON.stringify(record));
    },
    getCached: function (endpoint) {
      var raw = safeGet(S.cachePrefix + endpoint);
      if (!raw) { return null; }
      try { return JSON.parse(raw); }
      catch (e) { return null; } // caché rota = caché inexistente, sin drama
    },
    hasCache: function (endpoint) {
      return safeGet(S.cachePrefix + endpoint) != null;
    }
  };

})(window.App = window.App || {});
