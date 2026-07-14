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

    /* --- Equipo favorito (sobrevive a un refresco completo) ---------------- */
    getFavorite: function () {
      var raw = safeGet(S.favorite);
      return raw == null ? null : parseInt(raw, 10);
    },
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
