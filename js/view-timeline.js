// 2.3 Timeline Infinito: IntersectionObserver inserta bloques de 10 al hacer scroll.
(function (App) {
  'use strict';
  var C = App.common, S = C.store;
  var BLOCK = 10;
  var observer = null;
  var inserted = 0;
  var ordered = [];

  function orderGames(){
    return S.games.slice().sort(function(a,b){
      var d = a.local_date.localeCompare(b.local_date);
      return d !== 0 ? d : (a.id - b.id);
    });
  }

  function item(m, n){
    var played = m.status==='played' && m.home_score!=null;
    var stage = m.stage==='group' ? ('Grupo '+m.group) : (m.stage_label||'Eliminatoria');
    return '<li class="tl-item">'+
      '<div class="tl-item__idx">#'+n+'</div>'+
      C.scorecardBar({
        homeId: m.home_team, homeLabel: m.home_team_label, awayId: m.away_team, awayLabel: m.away_team_label,
        played: played, homeScore: m.home_score, awayScore: m.away_score,
        statusText: stage+' · '+C.fmtDate(m.local_date), statusColor: m.stage==='group'?C.groupColor(m.group):null
      })+
    '</li>';
  }

  function disconnect(){ if(observer){ observer.disconnect(); observer=null; } }

  function appendBlock(listEl, sentinelEl, counterEl){
    var next = ordered.slice(inserted, inserted + BLOCK);
    if(!next.length){ return; }
    var html = ''; next.forEach(function(m, i){ html += item(m, inserted + i + 1); });
    listEl.insertAdjacentHTML('beforeend', html);
    inserted += next.length;
    counterEl.textContent = inserted + ' de ' + ordered.length + ' partidos';
    if(inserted >= ordered.length){
      // Todo insertado: liberamos el observer y marcamos el final.
      disconnect();
      sentinelEl.innerHTML = '<span class="tl-end">— Fin del calendario ('+ordered.length+' partidos) —</span>';
    }
  }

  // Estado de error: la petición falló y no hay nada que mostrar (reto 2.3).
  var TL_EMPTY = '<div class="card empty-state">'+
    '<div class="empty-state__icon">'+C.icon('signal')+'</div>'+
    '<h3>No se pudo cargar el calendario</h3>'+
    '<p class="notice">La petición de partidos falló. Reintentá para disparar el backoff exponencial.</p>'+
    '<button class="btn btn--primary" id="tl-retry" type="button">Reintentar carga</button>'+
  '</div>';

  function tlShell(count){
    return '<div class="card tl-head">'+
      '<span class="section-title" style="margin:0">Calendario cronológico</span>'+
      '<span class="muted" id="tl-counter" aria-live="polite">0 de '+count+' partidos</span>'+
    '</div>'+
    '<ul class="tl-list" id="tl-list"></ul>'+
    '<div class="tl-sentinel" id="tl-sentinel"><span class="loader" aria-hidden="true"></span> Cargando más…</div>';
  }

  // Observa el centinela para insertar bloques al hacer scroll; si el navegador
  // no trae IntersectionObserver, degrada a un botón "Cargar más".
  function watchSentinel(listEl, sentinelEl, counterEl){
    var load = function(){ appendBlock(listEl, sentinelEl, counterEl); };
    if('IntersectionObserver' in window){
      observer = new IntersectionObserver(function(entries){
        entries.forEach(function(entry){ if(entry.isIntersecting){ load(); } });
      }, { root: null, rootMargin: '120px', threshold: 0 });
      observer.observe(sentinelEl);
    } else {
      sentinelEl.innerHTML = '<button class="btn" id="tl-more" type="button">Cargar más</button>';
      sentinelEl.querySelector('#tl-more').addEventListener('click', load);
    }
  }

  App.views = App.views || {};
  App.views.timeline = {
    title: 'Timeline Infinito', desc: 'Los 104 partidos, cargados de a 10 al hacer scroll.', icon: 'infinity',
    render: function (el) {
      disconnect(); inserted = 0;
      if(!S.ready.games || !S.games.length){
        el.innerHTML = TL_EMPTY;
        el.querySelector('#tl-retry').addEventListener('click', function(){ App.app.reload(); });
        return;
      }
      ordered = orderGames();
      el.innerHTML = tlShell(ordered.length);
      var listEl = el.querySelector('#tl-list');
      var sentinelEl = el.querySelector('#tl-sentinel');
      var counterEl = el.querySelector('#tl-counter');
      appendBlock(listEl, sentinelEl, counterEl); // primer bloque inmediato: nunca lista vacía
      watchSentinel(listEl, sentinelEl, counterEl);
    },
    // El router llama a destroy() al salir: evita observers huérfanos.
    destroy: function(){ disconnect(); }
  };
})(window.App = window.App || {});
