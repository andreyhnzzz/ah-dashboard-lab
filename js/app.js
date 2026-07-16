/* ============================================================================
 * app.js — Orquestador: router de vistas, carga de datos y eventos globales
 * ----------------------------------------------------------------------------
 * Reúne las cinco vistas bajo un mismo shell. Carga los cuatro recursos
 * (teams, groups, games, stadiums) una sola vez con la capa de resiliencia y
 * los comparte vía App.common.store. La navegación no vuelve a pedir datos.
 * ==========================================================================*/
(function (App) {
  'use strict';

  var C = App.config, K = App.common;
  var NAV = ['inicio','sedes','agenda','timeline','fanatico','matriz'];

  var state = {
    favoriteId: null,
    currentId: null,
    currentEl: null,
    loadSeq: 0
  };

  /* ---------------------- Navegación / router ----------------------------- */
  function buildNav(){
    var nav = K.$('nav');
    nav.innerHTML = NAV.map(function(id){
      var v = App.views[id];
      return '<li><button class="nav__item" data-view="'+id+'" type="button">'+
        '<span class="nav__icon">'+K.icon(v.icon)+'</span>'+
        '<span class="nav__label">'+K.esc(v.title)+'</span></button></li>';
    }).join('');
  }

  function go(id){
    if(!App.views[id]){ return; }
    // Limpieza de la vista saliente (p. ej. desconectar IntersectionObserver).
    var prev = state.currentId && App.views[state.currentId];
    if(prev && typeof prev.destroy==='function'){ prev.destroy(); }

    var isFirst = !state.currentId;
    state.currentId = id;
    var view = App.views[id];
    var el = K.$('view');
    state.currentEl = el;

    function swap(){
      // Estado visual del nav.
      document.querySelectorAll('.nav__item').forEach(function(b){
        var on = b.getAttribute('data-view')===id;
        b.classList.toggle('is-active', on);
        if(on){ b.setAttribute('aria-current','page'); } else { b.removeAttribute('aria-current'); }
      });

      // Topbar.
      K.$('view-title').textContent = view.title;
      K.$('view-desc').textContent = view.desc;

      el.setAttribute('aria-busy','false');
      view.render(el);
      el.focus({ preventScroll: true });

      // Recuerda la vista activa: si el usuario hace un refresco completo del
      // navegador (F5) estando en el Dashboard del Fanático, el reto de
      // resiliencia 2.4 exige volver a mostrarlo (con datos cacheados si hace
      // falta) en vez de perder el contexto en la pantalla de Resumen.
      App.storage.setLastView(id);
    }

    // Transición de "explosión de colores" horizontal entre vistas (no aplica
    // en la primera carga, ni si el usuario prefiere menos movimiento).
    var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if(isFirst || reduceMotion){ swap(); return; }
    playWipe(function(){
      swap();
      el.classList.remove('view--entering');
      void el.offsetWidth;          // reinicia la animación de entrada
      el.classList.add('view--entering');
    });
  }

  // Reproduce el overlay de colores oficiales: estalla desde el centro para
  // cubrir (llama a onCovered en el punto de cobertura total) e implosiona de
  // vuelta para revelar la vista nueva. Tolerante a llamadas rápidas seguidas.
  var wipeBusy = false;
  function playWipe(onCovered){
    var wipe = K.$('wc-wipe');
    if(!wipe || wipeBusy){ onCovered(); return; }
    wipeBusy = true;
    wipe.classList.remove('is-revealing');
    void wipe.offsetWidth;
    wipe.classList.add('is-covering');
    setTimeout(function(){
      onCovered();                              // vista ya cubierta: intercambiar
      wipe.classList.remove('is-covering');
      void wipe.offsetWidth;
      wipe.classList.add('is-revealing');
      setTimeout(function(){
        wipe.classList.remove('is-revealing');
        wipeBusy = false;
      }, 340);
    }, 300);
  }
  App.app = App.app || {};
  App.app.go = go;
  App.app.getFavorite = function(){ return state.favoriteId; };

  /* ---------------------- Hooks de red → UI ------------------------------- */
  function registerHooks(){
    App.api.hooks.onRetry = function(info){
      var when = Math.round(info.waitMs/1000);
      var origen = info.status ? ('Error '+info.status) : 'Fallo de red';
      console.info('[resiliencia] '+origen+' → reintento '+info.attempt+' en '+when+'s (backoff exponencial)');
      K.ui.setConnection('retry');
      K.ui.showRetry(origen+'. Reintentando automáticamente (intento '+info.attempt+') en '+when+' s…');
    };
    App.api.hooks.onCountdownTick = function(info){
      K.ui.setConnection('retry');
      K.ui.showRetry('Límite de tasa (429). Próximo reintento en '+info.secondsLeft+' s… (intento '+info.attempt+')');
    };
    App.api.hooks.onRetryDone = function(){ K.ui.hideRetry(); };
    App.api.hooks.onAuthExpired = function(){
      // 401: cualquier error de sesión cierra AMBAS capas (local + API) y
      // pide reautenticación completa, sin location.reload() ni perder la
      // vista actual ni el equipo favorito.
      console.warn('[resiliencia] 401 → sesión cerrada, pidiendo reautenticación completa');
      K.ui.setConnection('offline');
      App.storage.clearUnlocked();
      App.auth.show('local-unlock', function(){
        App.auth.show('expired', async function(){ await loadAll(); });
      });
    };
  }

  /* ---------------------- Carga de datos ---------------------------------- */
  // Devuelve {stale, savedAt}; lanza AuthError o HttpError (sin caché).
  async function loadOne(endpoint, setter){
    var r = await App.api.getData(endpoint);
    setter(r.data);
    return { stale: !!r.stale, savedAt: r.savedAt };
  }

  async function loadAll(){
    var seq = ++state.loadSeq;
    K.ui.hideError();

    var resources = [
      { ep: C.ENDPOINTS.teams,    set: K.setTeams,    name: 'equipos' },
      { ep: C.ENDPOINTS.stadiums, set: K.setStadiums, name: 'sedes' },
      { ep: C.ENDPOINTS.groups,   set: K.setGroups,   name: 'grupos' },
      { ep: C.ENDPOINTS.games,    set: K.setGames,    name: 'partidos' }
    ];

    var anyStale=false, staleAt=null, hardFails=0;

    for(var i=0;i<resources.length;i++){
      var res = resources[i];
      try {
        var out = await loadOne(res.ep, res.set);
        if(out.stale){ anyStale=true; staleAt = staleAt || out.savedAt; }
      } catch (err) {
        if(err instanceof App.api.AuthError){ return; } // modal mostrado; abortar
        console.error('[carga] '+res.name+' sin datos ni caché:', err);
        hardFails++;
      }
      if(seq !== state.loadSeq){ return; } // recarga más reciente en curso
    }

    // Selector de favorito (se llena en cuanto hay equipos).
    populateFavorites();

    // Estado global de conexión / datos no actualizados.
    if(anyStale){
      console.warn('[resiliencia] sirviendo datos cacheados (offline)');
      K.ui.showStale(staleAt); K.ui.setConnection('offline');
    } else {
      K.ui.hideStale(); K.ui.setConnection('ok');
    }
    if(hardFails === resources.length){
      K.ui.showError('No hay conexión con la API ni datos guardados.');
    }

    renderCurrent(true);
  }

  // Render de la vista actual; en recargas usa refresh() si la vista lo ofrece
  // (p. ej. la matriz actualiza solo las celdas afectadas, sin reconstruir).
  function renderCurrent(afterReload){
    if(!state.currentId){ return; }
    var view = App.views[state.currentId];
    var el = K.$('view');
    if(afterReload && typeof view.refresh==='function' && el.children.length){
      view.refresh(el);
    } else {
      view.render(el);
    }
  }
  App.app.reload = function(){ loadAll(); };

  /* ---------------------- Favorito global --------------------------------- */
  function populateFavorites(){
    var sel = K.$('fav-select');
    if(!K.store.teamsSorted.length || sel.options.length>1){ return; }
    K.store.teamsSorted.forEach(function(t){
      var o=document.createElement('option');
      // <option> no admite HTML/<img>, así que el código FIFA reemplaza al
      // emoji/URL de bandera (t.flag ahora es una URL real, no renderizable aquí).
      o.value=t.id; o.textContent=(t.code?t.code+' · ':'')+t.name+'  (Grupo '+t.group+')';
      if(t.id===state.favoriteId){ o.selected=true; }
      sel.appendChild(o);
    });
  }

  function setFavorite(id){
    state.favoriteId = id || null;
    if(id){
      App.storage.setFavorite(id);
      var t = K.store.teamById[id];
      if(t){ K.applyTeamTheme(t.color); }
    } else {
      K.applyTeamTheme(null);
    }
    // Si estamos en la vista del fanático, refléjalo de inmediato.
    if(state.currentId==='fanatico'){ App.views.fanatico.render(K.$('view')); }
  }

  /* ---------------------- Eventos ----------------------------------------- */
  function wireEvents(){
    // Navegación (delegación sobre la lista).
    K.$('nav').addEventListener('click', function(e){
      var btn = e.target.closest('.nav__item'); if(!btn){ return; }
      go(btn.getAttribute('data-view'));
    });
    // Accesos directos desde el Resumen (data-goto).
    K.$('view').addEventListener('click', function(e){
      var card = e.target.closest('[data-goto]'); if(!card){ return; }
      go(card.getAttribute('data-goto'));
    });
    // Favorito global.
    K.$('fav-select').addEventListener('change', function(e){
      // Los ids de equipo son strings (adaptTeam los normaliza con String()),
      // así que NO se debe parseInt() aquí: rompería el lookup en teamById.
      setFavorite(e.target.value || null);
    });
    // Reintento / recarga.
    K.$('btn-retry').addEventListener('click', function(){ K.ui.hideError(); loadAll(); });
    K.$('btn-reload').addEventListener('click', function(){ loadAll(); });
    // La reautenticación tras un 401 vive en la pantalla de login
    // (js/view-login.js → App.auth), disparada desde hooks.onAuthExpired.
    // Modo demo.
    K.$('toggle-mock').addEventListener('change', function(e){ C.USE_MOCK=e.target.checked; console.info('[config] USE_MOCK =',C.USE_MOCK); loadAll(); });
    K.$('sim-select').addEventListener('change', function(e){ C.SIMULATE=e.target.value; console.info('[config] SIMULATE =',C.SIMULATE||'(normal)','target=',C.SIMULATE_TARGET); });
    K.$('sim-target').addEventListener('change', function(e){ C.SIMULATE_TARGET=e.target.value; console.info('[config] SIMULATE_TARGET =',C.SIMULATE_TARGET); });
    K.$('btn-logout').addEventListener('click', logout);
  }

  /* ---------------------- Arranque ---------------------------------------- */
  async function loadAllAndApplyTheme(){
    await loadAll();
    if(state.favoriteId && K.store.teamById[state.favoriteId]){
      K.applyTeamTheme(K.store.teamById[state.favoriteId].color);
    }
  }

  // Capa de dispositivo (API real): sin token, hay que loguear primero
  // ("new" o "returning") antes de pedir un solo /get/*.
  async function ensureDeviceAuth(){
    if(App.storage.getToken()){
      await loadAllAndApplyTheme();
    } else {
      var hasDevice = !!(App.storage.getDeviceEmail() && App.storage.getDevicePassword());
      App.auth.show(hasDevice ? 'returning' : 'new', loadAllAndApplyTheme);
    }
  }

  // Cierra ambas capas de sesión (local + token de API) y vacía los datos en
  // memoria: no debe quedar nada visible ni cargado tras cerrar sesión.
  function logout(){
    App.storage.clearToken();
    App.storage.clearUnlocked();
    K.resetStore();
    App.auth.show('local-unlock', ensureDeviceAuth);
  }

  async function bootstrap(){
    K.watchScheme();
    buildNav();
    registerHooks();
    wireEvents();
    App.auth.init();
    state.favoriteId = App.storage.getFavorite();
    // Pinta el shell (vacío) detrás del login para que nunca haya pantalla en
    // blanco, y restaura la vista de antes del refresco (reto 2.4).
    var restored = App.storage.getLastView();
    go(restored && App.views[restored] ? restored : 'inicio');

    // Sin desbloqueo local no se ve un solo dato: primero la capa de acceso
    // (usuario/contraseña de este navegador), luego la de dispositivo (API).
    if(App.storage.isUnlocked()){
      await ensureDeviceAuth();
    } else {
      var hasLocalUser = !!App.storage.getLocalUser();
      App.auth.show(hasLocalUser ? 'local-unlock' : 'local-new', ensureDeviceAuth);
    }
  }

  if(document.readyState==='loading'){ document.addEventListener('DOMContentLoaded', bootstrap); }
  else { bootstrap(); }

})(window.App = window.App || {});
