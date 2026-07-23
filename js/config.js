// El panel de control de toda la app: un solo lugar para tocar y todo se
// entera (endpoints, backoff, claves de localStorage).
(function (App) {
  'use strict';

  App.config = {
    // false = API real (worldcup26.ir); true = dataset local (js/mock-data.js).
    USE_MOCK: false,

    // Vacío = mismo origen (server.js hace de proxy hacia la API real).
    API_BASE: '',

    AUTH_REGISTER_ENDPOINT: '/auth/register',
    AUTH_LOGIN_ENDPOINT: '/auth/authenticate',

    ENDPOINTS: {
      teams: '/get/teams',
      games: '/get/games',
      groups: '/get/groups',
      stadiums: '/get/stadiums'
    },

    // Backoff exponencial ante 429/5xx: 1s, 2s, 4s, 8s.
    MAX_ATTEMPTS: 5,
    BACKOFF_BASE_MS: 1000,

    STORAGE: {
      token: 'wc26.jwt',
      deviceEmail: 'wc26.deviceEmail',
      devicePassword: 'wc26.devicePassword',
      localUser: 'wc26.localUser',
      localPassHash: 'wc26.localPassHash',
      unlocked: 'wc26.unlocked', // sessionStorage: sesión local activa
      favorite: 'wc26.favoriteTeam',
      lastView: 'wc26.lastView',
      colorblind: 'wc26.colorblind',
      fontScale: 'wc26.a11y.fontScale',
      contrast: 'wc26.a11y.contrast',
      dyslexia: 'wc26.a11y.dyslexia',
      links: 'wc26.a11y.links',
      cursor: 'wc26.a11y.cursor',
      pauseMotion: 'wc26.a11y.pauseMotion',
      cachePrefix: 'wc26.cache.'
    },

    // El botón de pánico controlado: fuerza un 401/429/500 a pedido, para
    // demostrar en vivo que la resiliencia realmente hace algo.
    SIMULATE: '',
    SIMULATE_TARGET: 'games'
  };

})(window.App = window.App || {});
