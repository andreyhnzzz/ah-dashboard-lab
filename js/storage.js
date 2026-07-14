/* ============================================================================
 * storage.js — Persistencia en localStorage (token, favorito y caché offline)
 * ----------------------------------------------------------------------------
 * Encapsula TODO acceso a localStorage detrás de una API pequeña y con nombres
 * claros. Ventajas: (1) un solo lugar que sabe de claves y de serialización,
 * (2) manejo defensivo si localStorage no está disponible o el JSON está roto.
 * ==========================================================================*/
(function (App) {
  'use strict';

  var S = App.config.STORAGE;

  // localStorage puede lanzar (modo privado, cuota llena). Se envuelve todo.
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

  App.storage = {
    /* --- Token JWT --------------------------------------------------------- */
    getToken: function () { return safeGet(S.token); },
    setToken: function (token) { safeSet(S.token, token); },
    clearToken: function () { safeRemove(S.token); },

    /* --- Identidad de dispositivo (para /auth/register una sola vez y luego
     * /auth/authenticate en cada visita — ver api.js). La API real no ofrece
     * credenciales de curso; cada navegador se registra una vez a sí mismo
     * con un correo/clave generados localmente y los reutiliza siempre. ---- */
    getDeviceEmail: function () { return safeGet(S.deviceEmail); },
    getDevicePassword: function () { return safeGet(S.devicePassword); },
    setDeviceCredentials: function (email, password) {
      safeSet(S.deviceEmail, email); safeSet(S.devicePassword, password);
    },

    /* --- Equipo favorito (sobrevive a un refresco completo) ----------------
     * Se guarda y devuelve como STRING: los ids de la API real son strings
     * ("1".."48"), y normalizar todo a string evita bugs de comparación
     * (1 !== "1") entre team.id, home_team_id, stadium_id, etc. ------------ */
    getFavorite: function () { return safeGet(S.favorite); },
    setFavorite: function (teamId) { safeSet(S.favorite, String(teamId)); },

    /* --- Última vista visitada (para restaurarla tras un refresco completo) */
    getLastView: function () { return safeGet(S.lastView); },
    setLastView: function (id) { safeSet(S.lastView, id); },

    /* --- Caché offline por endpoint ---------------------------------------
     * Guarda la última respuesta exitosa junto con una marca de tiempo, para
     * poder mostrar "datos no actualizados" cuando una petición nueva falla.
     * --------------------------------------------------------------------- */
    cacheResponse: function (endpoint, data) {
      var record = { savedAt: Date.now(), data: data };
      safeSet(S.cachePrefix + endpoint, JSON.stringify(record));
    },
    getCached: function (endpoint) {
      var raw = safeGet(S.cachePrefix + endpoint);
      if (!raw) { return null; }
      try { return JSON.parse(raw); } // { savedAt, data }
      catch (e) { return null; }      // JSON corrupto → como si no hubiera caché
    },
    hasCache: function (endpoint) {
      return safeGet(S.cachePrefix + endpoint) != null;
    }
  };

})(window.App = window.App || {});
