// El director de orquesta: reparte las seis vistas en un mismo shell, pide
// los datos una vez y los reparte por App.common.store. Cambiar de vista
// nunca vuelve a golpear la red.
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

  // Intercambia el contenido de la vista: estado del nav, topbar, render y foco.
  // Marca "volvé acá" (lastView) para restaurar la vista tras un F5 (reto 2.4).
  function swapView(id, view, el){
    document.querySelectorAll('.nav__item').forEach(function(b){
      var on = b.getAttribute('data-view')===id;
      b.classList.toggle('is-active', on);
      if(on){ b.setAttribute('aria-current','page'); } else { b.removeAttribute('aria-current'); }
    });
    K.$('view-title').textContent = view.title;
    K.$('view-desc').textContent = view.desc;
    el.setAttribute('aria-busy','false');
    view.render(el);
    el.focus({ preventScroll: true });
    App.storage.setLastView(id);
  }

  function go(id){
    if(!App.views[id]){ return; }
    // Se apaga la luz de la vista que se va (p. ej. desconecta el observer).
    var prev = state.currentId && App.views[state.currentId];
    if(prev && typeof prev.destroy==='function'){ prev.destroy(); }

    var isFirst = !state.currentId;
    state.currentId = id;
    var view = App.views[id];
    var el = K.$('view');
    state.currentEl = el;

    // El efecto "explosión de colores" se salta en la primera carga y si
    // alguien pidió menos movimiento (SO o panel a11y).
    if(isFirst || motionReduced()){ swapView(id, view, el); return; }
    playWipe(function(){
      swapView(id, view, el);
      el.classList.remove('view--entering');
      void el.offsetWidth;          // reinicia la animación de entrada
      el.classList.add('view--entering');
    });
  }

  // ¿Frenamos la animación? SO o el toggle "pausar animaciones" mandan.
  function motionReduced(){
    var os = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    return !!os || document.body.classList.contains('a11y-pause-motion');
  }

  // Lee la duración desde la variable CSS: una sola fuente de verdad para
  // el timing (tocás css/tokens.css y el JS se entera solo).
  function cssDurationMs(varName, fallback){
    var raw = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
    var n = parseFloat(raw);
    if(!raw || isNaN(n)){ return fallback; }
    return raw.indexOf('ms') > -1 ? n : n * 1000;
  }

  // Estalla desde el centro, tapa todo, cambia la vista por debajo, e
  // implosiona para revelarla. Si lo llamás dos veces seguido, no se pisa.
  var wipeBusy = false;
  function playWipe(onCovered){
    var wipe = K.$('wc-wipe');
    if(!wipe || wipeBusy){ onCovered(); return; }
    var coverMs = cssDurationMs('--wipe-cover-dur', 600);
    var revealMs = cssDurationMs('--wipe-reveal-dur', 630);
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
      }, revealMs);
    }, coverMs);
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
      // El 401 en persona: se cierran las dos capas de sesión y se pide
      // volver a entrar. Cero location.reload(), cero perder la vista o
      // el equipo favorito — eso sería hacer trampa con la experiencia.
      console.warn('[resiliencia] 401 → sesión cerrada, pidiendo reautenticación completa');
      K.ui.setConnection('offline');
      App.storage.clearUnlocked();
      App.auth.show('local-unlock', function(){
        App.auth.show('expired', async function(){ await loadAll(); });
      });
    };
  }

  /* ---------------------- Carga de datos ---------------------------------- */
  // Un endpoint, un intento. Si no hay caché de respaldo, el error sube tal
  // cual (AuthError o HttpError) para que loadAll() decida qué hacer.
  async function loadOne(endpoint, setter){
    var r = await App.api.getData(endpoint);
    setter(r.data);
    return { stale: !!r.stale, savedAt: r.savedAt };
  }

  // Los cuatro recursos del torneo; se cargan una sola vez por sesión.
  var RESOURCES = [
    { ep: C.ENDPOINTS.teams,    set: K.setTeams,    name: 'equipos' },
    { ep: C.ENDPOINTS.stadiums, set: K.setStadiums, name: 'sedes' },
    { ep: C.ENDPOINTS.groups,   set: K.setGroups,   name: 'grupos' },
    { ep: C.ENDPOINTS.games,    set: K.setGames,    name: 'partidos' }
  ];

  // El semáforo global de conexión: en línea, offline (con caché) o apagón total.
  function applyLoadState(anyStale, staleAt, hardFails){
    if(anyStale){
      console.warn('[resiliencia] sirviendo datos cacheados (offline)');
      K.ui.showStale(staleAt); K.ui.setConnection('offline');
    } else {
      K.ui.hideStale(); K.ui.setConnection('ok');
    }
    if(hardFails === RESOURCES.length){
      K.ui.showError('No hay conexión con la API ni datos guardados.');
    }
  }

  async function loadAll(){
    var seq = ++state.loadSeq;
    K.ui.hideError();
    var anyStale=false, staleAt=null, hardFails=0;

    for(var i=0;i<RESOURCES.length;i++){
      var res = RESOURCES[i];
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

    populateFavorites(); // se llena apenas hay equipos con quién llenarlo
    applyLoadState(anyStale, staleAt, hardFails);
    renderCurrent(true);
  }

  // ¿Recarga? Si la vista sabe hacer refresh() quirúrgico (la matriz solo
  // toca las celdas que cambiaron), se usa eso en vez de reconstruir todo.
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
      // Un <option> no pinta banderas ni emojis, así que el código FIFA
      // hace de reemplazo texto-plano.
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
    // Si ya estás mirando el Dashboard del Fanático, que se note al toque.
    if(state.currentId==='fanatico'){ App.views.fanatico.render(K.$('view')); }
  }

  /* ---------------------- Panel de accesibilidad --------------------------- */
  var FONT_SCALE_MIN = 80, FONT_SCALE_MAX = 160, FONT_SCALE_STEP = 10;

  function setA11yPanelOpen(open){
    var fab = K.$('a11y-fab'), panel = K.$('a11y-panel');
    panel.hidden = !open;
    fab.setAttribute('aria-expanded', open ? 'true' : 'false');
    if(open){ panel.querySelector('.a11y-panel__close').focus(); }
  }

  function applyFontScale(pct){
    document.documentElement.style.fontSize = pct + '%';
    K.$('a11y-fs-value').textContent = pct + '%';
  }

  // [checkbox, clase de <body>, getter, setter] — una fila de tabla por
  // toggle, así "Restablecer" los recorre a todos sin repetir código.
  function a11yToggles(){
    return [
      ['toggle-colorblind', 'colorblind',       App.storage.getColorblind, App.storage.setColorblind],
      ['toggle-contrast',   'a11y-contrast',     App.storage.getContrast,   App.storage.setContrast],
      ['toggle-dyslexia',   'a11y-dyslexia',     App.storage.getDyslexia,   App.storage.setDyslexia],
      ['toggle-links',      'a11y-links',        App.storage.getLinks,      App.storage.setLinks],
      ['toggle-cursor',     'a11y-cursor',       App.storage.getCursor,     App.storage.setCursor],
      ['toggle-motion',     'a11y-pause-motion', App.storage.getPauseMotion, App.storage.setPauseMotion]
    ];
  }

  // Abrir/cerrar el panel: botón flotante, botón cerrar, Escape y clic afuera.
  function wireA11yDismiss(){
    K.$('a11y-fab').addEventListener('click', function(){ setA11yPanelOpen(K.$('a11y-panel').hidden); });
    K.$('a11y-close').addEventListener('click', function(){ setA11yPanelOpen(false); });
    document.addEventListener('keydown', function(e){
      if(e.key==='Escape' && !K.$('a11y-panel').hidden){ setA11yPanelOpen(false); K.$('a11y-fab').focus(); }
    });
    document.addEventListener('click', function(e){
      if(K.$('a11y-panel').hidden || e.target.closest('.a11y-widget')){ return; }
      setA11yPanelOpen(false);
    });
  }

  // Suma/resta al tamaño de texto, acotado y persistido (el estado vive en storage).
  function stepFontScale(delta){
    var v = Math.max(FONT_SCALE_MIN, Math.min(FONT_SCALE_MAX, App.storage.getFontScale() + delta));
    applyFontScale(v); App.storage.setFontScale(v);
  }

  // Zoom de texto casero: pasos de 10% sobre el font-size raíz (todo es rem).
  function wireFontScale(){
    applyFontScale(App.storage.getFontScale());
    K.$('a11y-fs-dec').addEventListener('click', function(){ stepFontScale(-FONT_SCALE_STEP); });
    K.$('a11y-fs-inc').addEventListener('click', function(){ stepFontScale(FONT_SCALE_STEP); });
  }

  // Restaura lo guardado y engancha cada toggle a su clase de <body>.
  function wireA11yToggles(toggles){
    toggles.forEach(function(t){
      var input = K.$(t[0]), on = t[2]();
      input.checked = on;
      document.body.classList.toggle(t[1], on);
      input.addEventListener('change', function(e){
        document.body.classList.toggle(t[1], e.target.checked);
        t[3](e.target.checked);
      });
    });
  }

  // "Restablecer": apaga cada toggle y vuelve el texto a 100%.
  function wireA11yReset(toggles){
    K.$('a11y-reset').addEventListener('click', function(){
      toggles.forEach(function(t){
        K.$(t[0]).checked = false;
        document.body.classList.remove(t[1]);
        t[3](false);
      });
      applyFontScale(100); App.storage.setFontScale(100);
    });
  }

  function wireA11yPanel(){
    wireA11yDismiss();
    wireFontScale();
    var toggles = a11yToggles();
    wireA11yToggles(toggles);
    wireA11yReset(toggles);
  }

  /* ---------------------- Eventos ----------------------------------------- */
  // Barra de "Herramientas para la defensa": modo mock + simulador de errores.
  function wireDemoTools(){
    K.$('toggle-mock').addEventListener('change', function(e){ C.USE_MOCK=e.target.checked; console.info('[config] USE_MOCK =',C.USE_MOCK); loadAll(); });
    K.$('sim-select').addEventListener('change', function(e){ C.SIMULATE=e.target.value; console.info('[config] SIMULATE =',C.SIMULATE||'(normal)','target=',C.SIMULATE_TARGET); });
    K.$('sim-target').addEventListener('change', function(e){ C.SIMULATE_TARGET=e.target.value; console.info('[config] SIMULATE_TARGET =',C.SIMULATE_TARGET); });
  }

  function wireEvents(){
    // Navegación y accesos directos del Resumen (delegación de eventos).
    K.$('nav').addEventListener('click', function(e){
      var btn = e.target.closest('.nav__item'); if(btn){ go(btn.getAttribute('data-view')); }
    });
    K.$('view').addEventListener('click', function(e){
      var card = e.target.closest('[data-goto]'); if(card){ go(card.getAttribute('data-goto')); }
    });
    // Favorito global. Sin parseInt: los ids de equipo son strings.
    K.$('fav-select').addEventListener('change', function(e){ setFavorite(e.target.value || null); });
    // Reintento / recarga (el re-login tras 401 lo maneja hooks.onAuthExpired).
    K.$('btn-retry').addEventListener('click', function(){ K.ui.hideError(); loadAll(); });
    K.$('btn-reload').addEventListener('click', function(){ loadAll(); });
    K.$('btn-logout').addEventListener('click', logout);
    wireDemoTools();
    wireA11yPanel();
  }

  /* ---------------------- Arranque ---------------------------------------- */
  async function loadAllAndApplyTheme(){
    await loadAll();
    if(state.favoriteId && K.store.teamById[state.favoriteId]){
      K.applyTeamTheme(K.store.teamById[state.favoriteId].color);
    }
  }

  // Sin token no se pide ni un solo /get/* — primero hay que loguear
  // ("new" o "returning") contra la API real.
  async function ensureDeviceAuth(){
    if(App.storage.getToken()){
      await loadAllAndApplyTheme();
    } else {
      var hasDevice = !!(App.storage.getDeviceEmail() && App.storage.getDevicePassword());
      App.auth.show(hasDevice ? 'returning' : 'new', loadAllAndApplyTheme);
    }
  }

  // Cierra las dos cerraduras y tira la llave: nada debe quedar visible ni
  // cargado en memoria después de un logout.
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
    // El shell se pinta ANTES del login: nunca, nunca una pantalla en
    // blanco. Y si veníamos del Dashboard del Fanático, se vuelve ahí.
    var restored = App.storage.getLastView();
    go(restored && App.views[restored] ? restored : 'inicio');

    // Doble puerta: primero el candado local (este navegador), recién
    // después la identidad de dispositivo contra la API real.
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
