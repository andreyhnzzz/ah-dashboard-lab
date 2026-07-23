/* ============================================================================
 * view-sedes.js — Apartado 2.1: Tour Virtual de Sedes
 * Técnica: scrollIntoView({behavior:'smooth'}) + estado activo entre elementos.
 * Resiliencia: si /get/games falla, las sedes siguen clicables; el detalle
 * muestra un mensaje local sin bloquear la navegación.
 * ==========================================================================*/
(function (App) {
  'use strict';
  var C = App.common, S = C.store;
  var activeId = null;

  function stadiumButton(st){
    var count = (S.gamesByStadium[st.id] || []).length;
    return '<button class="venue" type="button" data-stadium="'+st.id+'" aria-pressed="false">'+
      '<span class="venue__pin">'+C.icon('pin')+'</span>'+
      '<span class="venue__body"><span class="venue__name">'+C.esc(st.name)+'</span>'+
      '<span class="venue__city">'+C.esc(st.city)+' · '+count+' partidos</span></span></button>';
  }

  function matchRow(m){
    var played = m.status==='played' && m.home_score!=null;
    var stage = m.stage==='group' ? ('Grupo '+m.group) : (m.stage_label||'Eliminatoria');
    return '<li>'+C.scorecardBar({
      homeId: m.home_team, homeLabel: m.home_team_label, awayId: m.away_team, awayLabel: m.away_team_label,
      played: played, homeScore: m.home_score, awayScore: m.away_score,
      statusText: stage+' · '+C.fmtDate(m.local_date), statusColor: m.stage==='group'?C.groupColor(m.group):null
    })+'</li>';
  }

  function renderDetail(host, stadiumId){
    var st = S.stadiumById[stadiumId];
    if(!st){ host.innerHTML=''; return; }
    var games = (S.gamesByStadium[stadiumId] || []).slice().sort(function(a,b){ return a.local_date.localeCompare(b.local_date); });
    var body;
    if(!S.ready.games || !games.length){
      // Reto de resiliencia: mensaje local, la navegación sigue disponible.
      body = '<p class="notice">No se pudieron cargar los partidos de esta sede. Podés seguir navegando entre las demás.</p>';
    } else {
      body = '<ul class="vmatch-list">'+games.map(matchRow).join('')+'</ul>';
    }
    host.innerHTML = '<div class="card">'+
      '<h3 class="section-title">'+C.esc(st.name)+' <span class="muted">· '+C.esc(st.city)+'</span></h3>'+
      body+'</div>';
  }

  var SEDES_EMPTY = '<div class="card"><p class="notice">No se pudo cargar la lista de sedes. Probá "Recargar datos".</p></div>';
  function sedesShell(){
    return '<div class="sedes-layout">'+
      '<section class="venue-list" aria-label="Sedes del Mundial">'+S.stadiums.map(stadiumButton).join('')+'</section>'+
      '<section id="venue-detail" class="venue-detail" tabindex="-1" aria-live="polite">'+
        '<div class="card placeholder"><p class="notice">Seleccioná una sede de la izquierda para ver sus partidos aquí.</p></div>'+
      '</section></div>';
  }

  // Marca la sede activa (aria-pressed), pinta su detalle sin trabajo redundante
  // y hace el scroll suave — la técnica central del apartado 2.1.
  function selectStadium(btn, buttons, detail){
    var id = btn.getAttribute('data-stadium'); // stadiumById está indexado por string
    buttons.forEach(function(b){ b.classList.remove('is-active'); b.setAttribute('aria-pressed','false'); });
    btn.classList.add('is-active'); btn.setAttribute('aria-pressed','true');
    if(activeId !== id){ activeId = id; renderDetail(detail, id); }
    detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
    detail.focus({ preventScroll: true });
  }

  // Restaura la sede marcada al volver a la vista.
  function restoreSelection(el, detail){
    if(activeId==null){ return; }
    var prev = el.querySelector('.venue[data-stadium="'+activeId+'"]');
    if(prev){ prev.classList.add('is-active'); prev.setAttribute('aria-pressed','true'); renderDetail(detail, activeId); }
  }

  App.views = App.views || {};
  App.views.sedes = {
    title: 'Tour Virtual de Sedes', desc: 'Elegí una sede para saltar a sus partidos.', icon: 'stadium',
    render: function (el) {
      if(!S.stadiums.length){ el.innerHTML = SEDES_EMPTY; return; }
      el.innerHTML = sedesShell();
      var detail = el.querySelector('#venue-detail');
      var buttons = el.querySelectorAll('.venue');
      buttons.forEach(function(btn){ btn.addEventListener('click', function(){ selectStadium(btn, buttons, detail); }); });
      restoreSelection(el, detail);
    }
  };
})(window.App = window.App || {});
