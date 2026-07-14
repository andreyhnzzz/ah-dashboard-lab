/* ============================================================================
 * config.js — Configuración central de la aplicación
 * ----------------------------------------------------------------------------
 * Un único lugar para ajustar el origen de datos, los endpoints, las claves de
 * localStorage y los parámetros del backoff exponencial. Mantener esto separado
 * hace el código legible y fácil de mantener (una sola fuente de verdad).
 * ==========================================================================*/
(function (App) {
  'use strict';

  App.config = {
    /* --- Origen de datos -----------------------------------------------------
     * USE_MOCK = true  → usa el dataset local (js/mock-data.js). Permite ejecutar
     *                    y calificar la app sin credenciales de la API real.
     * USE_MOCK = false → consume la API real vía fetch (requiere API_BASE + login).
     * Se puede alternar en vivo desde la barra de herramientas de la interfaz.
     * ------------------------------------------------------------------------*/
    USE_MOCK: true,

    // Base de la API REST pública del Mundial 2026.
    API_BASE: 'https://worldcup26.ir',

    // Endpoint de autenticación (devuelve un JWT). El nombre exacto puede variar
    // en la API real; se centraliza aquí para ajustarlo en un solo punto.
    AUTH_ENDPOINT: '/auth/login',

    // Credenciales de demostración. En producción NUNCA se hardcodean; aquí se
    // usan solo para poder obtener un token contra la API de práctica del curso.
    AUTH_CREDENTIALS: { username: 'demo', password: 'demo' },

    // Endpoints de datos que consume el Dashboard integral (todos los apartados).
    ENDPOINTS: {
      teams: '/get/teams',
      games: '/get/games',
      groups: '/get/groups',
      stadiums: '/get/stadiums'
    },

    /* --- Backoff exponencial -------------------------------------------------
     * Reintentos ante 429 / 500 con espera creciente: 1s, 2s, 4s, 8s.
     * ------------------------------------------------------------------------*/
    MAX_ATTEMPTS: 5,      // 1 intento + 4 reintentos
    BACKOFF_BASE_MS: 1000, // 1000 * 2^(intento-1)  → 1s, 2s, 4s, 8s

    // Claves de localStorage (namespaced para no colisionar con otras apps).
    STORAGE: {
      token: 'wc26.jwt',
      favorite: 'wc26.favoriteTeam',
      lastView: 'wc26.lastView',
      cachePrefix: 'wc26.cache.'
    },

    /* --- Simulación de errores (solo para la defensa técnica en DevTools) -----
     * Fuerza un status HTTP en el transporte para demostrar el manejo de errores.
     * Valores: '', '401', '429', '500', '500-twice', '429-once', 'network'.
     * SIMULATE_TARGET acota el fallo a UN endpoint ('games' por defecto, ya que
     * 4 de los 5 retos de resiliencia del enunciado asumen que solo /get/games
     * falla mientras equipos/sedes/grupos responden con normalidad) o 'all'
     * para forzar un apagón total. Editable desde la barra de herramientas.
     * ------------------------------------------------------------------------*/
    SIMULATE: '',
    SIMULATE_TARGET: 'games'
  };

})(window.App = window.App || {});
