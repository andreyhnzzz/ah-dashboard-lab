/* ============================================================================
 * view-timeline.js — Apartado 2.3: Timeline Infinito
 * Técnica: IntersectionObserver sobre un centinela para insertar bloques de 10
 * partidos a medida que el usuario hace scroll (sin paginar la petición HTTP).
 * Resiliencia: si la carga falla, botón de reintento manual (dispara backoff);
 * al recuperarse, la inserción arranca desde cero sin duplicar.
 * ==========================================================================*/
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
    var score = played ? (m.home_score+' – '+m.away_score) : '<span class="tag tag--pending">Pendiente</span>';
    return '<li class="tl-item fade-in">'+
      '<div class="tl-item__idx">#'+n+'</div>'+
      '<div class="tl-item__date">'+C.esc(C.fmtDate(m.local_date))+'</div>'+
      '<div class="tl-item__teams">'+
        '<span>'+C.teamFlagHtml(m.home_team, m.home_team_label)+' '+C.esc(C.teamName(m.home_team, m.home_team_label))+'</span>'+
        '<span class="tl-item__score">'+score+'</span>'+
        '<span>'+C.esc(C.teamName(m.away_team, m.away_team_label))+' '+C.teamFlagHtml(m.away_team, m.away_team_label)+'</span>'+
      '</div>'+
      '<div class="tl-item__stage muted">'+C.esc(stage)+'</div>'+
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

  App.views = App.views || {};
  App.views.timeline = {
    title: 'Timeline Infinito', desc: 'Los 104 partidos, cargados de a 10 al hacer scroll.', icon: '♾️',
    render: function (el) {
      disconnect(); inserted = 0;

      if(!S.ready.games || !S.games.length){
        el.innerHTML = '<div class="card empty-state">'+
          '<div class="empty-state__icon" aria-hidden="true">📡</div>'+
          '<h3>No se pudo cargar el calendario</h3>'+
          '<p class="notice">La petición de partidos falló. Reintentá para disparar el backoff exponencial.</p>'+
          '<button class="btn btn--primary" id="tl-retry" type="button">Reintentar carga</button>'+
        '</div>';
        el.querySelector('#tl-retry').addEventListener('click', function(){ App.app.reload(); });
        return;
      }

      ordered = orderGames();
      el.innerHTML =
        '<div class="card tl-head">'+
          '<span class="section-title" style="margin:0">Calendario cronológico</span>'+
          '<span class="muted" id="tl-counter" aria-live="polite">0 de '+ordered.length+' partidos</span>'+
        '</div>'+
        '<ul class="tl-list" id="tl-list"></ul>'+
        '<div class="tl-sentinel" id="tl-sentinel"><span class="loader" aria-hidden="true"></span> Cargando más…</div>';

      var listEl = el.querySelector('#tl-list');
      var sentinelEl = el.querySelector('#tl-sentinel');
      var counterEl = el.querySelector('#tl-counter');

      // Primer bloque inmediato para que nunca haya lista vacía.
      appendBlock(listEl, sentinelEl, counterEl);

      if('IntersectionObserver' in window){
        observer = new IntersectionObserver(function(entries){
          entries.forEach(function(entry){
            if(entry.isIntersecting){ appendBlock(listEl, sentinelEl, counterEl); }
          });
        }, { root: null, rootMargin: '120px', threshold: 0 });
        observer.observe(sentinelEl);
      } else {
        // Degradación elegante: botón manual si no hay IntersectionObserver.
        sentinelEl.innerHTML = '<button class="btn" id="tl-more" type="button">Cargar más</button>';
        sentinelEl.querySelector('#tl-more').addEventListener('click', function(){ appendBlock(listEl, sentinelEl, counterEl); });
      }
    },
    // El router llama a destroy() al salir: evita observers huérfanos.
    destroy: function(){ disconnect(); }
  };
})(window.App = window.App || {});
