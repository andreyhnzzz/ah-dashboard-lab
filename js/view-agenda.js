/* ============================================================================
 * view-agenda.js — Apartado 2.2: Agenda Simultánea
 * Técnica: agrupación por clave (local_date) + layout dividido en columnas.
 * Resiliencia: si al cambiar de fecha no hay datos, se muestran esqueletos por
 * columna (nunca pantalla en blanco).
 * ==========================================================================*/
(function (App) {
  'use strict';
  var C = App.common, S = C.store;
  var idx = 0;      // índice de la fecha actual dentro de las fechas simultáneas
  var dates = null; // caché de fechas con 2+ partidos

  function computeDates(){
    var out = [];
    Object.keys(S.gamesByDate).forEach(function(d){
      if(S.gamesByDate[d].length >= 2){ out.push(d); }
    });
    out.sort();
    return out;
  }

  function matchColumn(m){
    var played = m.status==='played' && m.home_score!=null;
    var st = S.stadiumById[m.stadium_id];
    var stage = m.stage==='group' ? ('Grupo '+m.group) : (m.stage_label||'Eliminatoria');
    var stageColor = m.stage==='group' ? C.groupColor(m.group) : 'var(--wc-violet)';
    return '<article class="acol">'+
      '<header class="acol__stage" style="--g:'+stageColor+'">'+C.esc(stage)+'</header>'+
      C.scorecardBar({
        homeId: m.home_team, homeLabel: m.home_team_label, awayId: m.away_team, awayLabel: m.away_team_label,
        played: played, homeScore: m.home_score, awayScore: m.away_score
      })+
      '<footer class="acol__venue">'+(st?(C.icon('stadium','acol__venue-icon')+' '+C.esc(st.name)+' · '+C.esc(st.city)):'Sede por confirmar')+'</footer>'+
      '</article>';
  }

  function skeletonColumns(n){
    var out=''; for(var i=0;i<(n||3);i++){ out+='<div class="skeleton skeleton--col"></div>'; }
    return '<div class="agenda-grid">'+out+'</div>';
  }

  // Estado sin columnas navegables (cargando o sin fechas simultáneas): fija
  // etiqueta + contenido y bloquea los controles. Nunca deja pantalla en blanco.
  function setAgendaEmpty(el, labelText, gridHtml){
    el.querySelector('#agenda-date').textContent = labelText;
    el.querySelector('#agenda-pos').textContent = '';
    el.querySelector('#agenda-grid').innerHTML = gridHtml;
    el.querySelector('#agenda-prev').disabled = true;
    el.querySelector('#agenda-next').disabled = true;
  }

  function paint(el){
    // Si /get/games no cargó, esqueletos (no "no hay fechas", que engañaría).
    if(!S.ready.games){ setAgendaEmpty(el, 'Cargando agenda…', skeletonColumns(3)); return; }
    if(!dates.length){ setAgendaEmpty(el, '—', '<p class="notice">No hay fechas con partidos simultáneos disponibles.</p>'); return; }

    if(idx<0){ idx=0; } if(idx>dates.length-1){ idx=dates.length-1; }
    var date = dates[idx];
    el.querySelector('#agenda-date').textContent = C.fmtDateLong(date);
    el.querySelector('#agenda-pos').textContent = '('+(idx+1)+' de '+dates.length+')';

    var games = S.gamesByDate[date].slice().sort(function(a,b){ return (a.stadium_id||0)-(b.stadium_id||0); });
    el.querySelector('#agenda-grid').innerHTML = '<div class="agenda-grid">'+games.map(matchColumn).join('')+'</div>';
    el.querySelector('#agenda-prev').disabled = (idx===0);
    el.querySelector('#agenda-next').disabled = (idx===dates.length-1);
  }

  App.views = App.views || {};
  App.views.agenda = {
    title: 'Agenda Simultánea', desc: 'Días con dos o más partidos, en columnas paralelas.', icon: 'calendar',
    render: function (el) {
      dates = computeDates();
      if(idx > dates.length-1){ idx = 0; }
      el.innerHTML =
        '<div class="agenda-controls card">'+
          '<button class="btn" id="agenda-prev" type="button" aria-label="Fecha anterior">‹ Anterior</button>'+
          '<div class="agenda-controls__center">'+
            '<strong id="agenda-date">—</strong> <span class="muted" id="agenda-pos"></span>'+
          '</div>'+
          '<button class="btn" id="agenda-next" type="button" aria-label="Fecha siguiente">Siguiente ›</button>'+
        '</div>'+
        '<div id="agenda-grid" aria-live="polite"></div>';

      el.querySelector('#agenda-prev').addEventListener('click', function(){ if(idx>0){ idx--; paint(el); } });
      el.querySelector('#agenda-next').addEventListener('click', function(){ if(idx<dates.length-1){ idx++; paint(el); } });
      paint(el);
    }
  };
})(window.App = window.App || {});
