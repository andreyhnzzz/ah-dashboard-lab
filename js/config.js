/* ============================================================================
 * config.js — Configuración central de la aplicación
 * ----------------------------------------------------------------------------
 * Un único lugar para ajustar el origen de datos, los endpoints, las claves de
 * localStorage y los parámetros del backoff exponencial. Mantener esto separado
 * hace el código legible y fácil de mantener (una sola fuente de verdad).
 *
 * Endpoints y forma de las respuestas verificados contra la documentación
 * oficial del backend que sirve worldcup26.ir (repositorio del autor de la
 * API, sección "API Reference" — ver README del proyecto para el detalle):
 * base https://worldcup26.ir, JWT Bearer en cada /get/*, registro/login en
 * /auth/register y /auth/authenticate, token válido 84 días.
 * ==========================================================================*/
(function (App) {
  'use strict';

  App.config = {
    /* --- Origen de datos -----------------------------------------------------
     * USE_MOCK = false → consume la API REAL del Mundial 2026 (worldcup26.ir)
     *                    vía fetch. Es el modo por defecto: los datos que ve
     *                    el usuario son los reales de la API, no inventados.
     * USE_MOCK = true  → usa el dataset local de ejemplo (js/mock-data.js),
     *                    con el MISMO formato de la API real, para poder
     *                    demostrar en DevTools los casos 401/429/500/offline
     *                    sin depender de la disponibilidad de la API pública
     *                    ni de su límite de tasa durante la defensa técnica.
     * Se alterna en vivo desde "Modo demo" en la barra superior.
     * ------------------------------------------------------------------------*/
    USE_MOCK: false,

    /* --- Base de la API ------------------------------------------------------
     * Vacío = MISMO ORIGEN: las peticiones salen como /auth/* y /get/* hacia el
     * servidor que sirve la página. Al levantar con `npm start` (ver server.js),
     * ese servidor REENVÍA esas rutas a https://worldcup26.ir del lado servidor,
     * evitando el bloqueo CORS que la API impone al login en el navegador
     * (ver docs/LOGIN.md). Con `npm start` el login funciona con datos EN VIVO.
     *
     * Si se abre con un servidor estático "tonto" (sin proxy) o con file://,
     * esas rutas no existen → la app cae automáticamente a datos locales de
     * demostración (mismo dataset, ver js/view-login.js). Para forzar la API
     * real directa (bloqueada por CORS en /auth/*, pero útil para pruebas de
     * /get/*), poné aquí 'https://worldcup26.ir'.
     * ------------------------------------------------------------------------*/
    API_BASE: '',

    /* --- Autenticación --------------------------------------------------------
     * La API exige JWT en cada /get/*. No hay credenciales fijas de curso: la
     * app genera UNA identidad de dispositivo la primera vez (POST /auth/register)
     * y la reutiliza en cada visita (POST /auth/authenticate) — ver api.js.
     * ------------------------------------------------------------------------*/
    AUTH_REGISTER_ENDPOINT: '/auth/register',
    AUTH_LOGIN_ENDPOINT: '/auth/authenticate',

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
      deviceEmail: 'wc26.deviceEmail',
      devicePassword: 'wc26.devicePassword',
      favorite: 'wc26.favoriteTeam',
      lastView: 'wc26.lastView',
      cachePrefix: 'wc26.cache.'
    },

    /* --- Simulación de errores (solo para la defensa técnica en DevTools) -----
     * Fuerza un status HTTP en el transporte MOCK para demostrar el manejo de
     * errores sin depender de la disponibilidad real de la API. Solo tiene
     * efecto cuando "Modo demo → Datos locales" está activo.
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
