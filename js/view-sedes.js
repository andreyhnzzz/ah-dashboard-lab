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
      '<span class="venue__pin" aria-hidden="true">📍</span>'+
      '<span class="venue__body"><span class="venue__name">'+C.esc(st.name)+'</span>'+
      '<span class="venue__city">'+C.esc(st.city)+' · '+count+' partidos</span></span></button>';
  }

  function matchRow(m){
    var played = m.status==='played' && m.home_score!=null;
    var score = played ? (m.home_score+' – '+m.away_score) : '<span class="tag tag--pending">Pendiente</span>';
    var stage = m.stage==='group' ? ('Grupo '+m.group) : (m.stage_label||'Eliminatoria');
    return '<li class="vmatch">'+
      '<span class="vmatch__teams">'+C.teamFlag(m.home_team)+' '+C.esc(C.teamName(m.home_team))+
        ' <span class="vmatch__vs">vs</span> '+C.esc(C.teamName(m.away_team))+' '+C.teamFlag(m.away_team)+'</span>'+
      '<span class="vmatch__meta">'+C.esc(stage)+' · '+C.esc(C.fmtDate(m.local_date))+'</span>'+
      '<span class="vmatch__score">'+score+'</span></li>';
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

  App.views = App.views || {};
  App.views.sedes = {
    title: 'Tour Virtual de Sedes', desc: 'Elegí una sede para saltar a sus partidos.', icon: '🏟️',
    render: function (el) {
      if(!S.stadiums.length){ el.innerHTML='<div class="card"><p class="notice">No se pudo cargar la lista de sedes. Probá "Recargar datos".</p></div>'; return; }
      el.innerHTML =
        '<div class="sedes-layout">'+
          '<section class="venue-list" aria-label="Sedes del Mundial">'+
            S.stadiums.map(stadiumButton).join('')+
          '</section>'+
          '<section id="venue-detail" class="venue-detail" tabindex="-1" aria-live="polite">'+
            '<div class="card placeholder"><p class="notice">Seleccioná una sede de la izquierda para ver sus partidos aquí.</p></div>'+
          '</section>'+
        '</div>';

      var detail = el.querySelector('#venue-detail');
      var buttons = el.querySelectorAll('.venue');
      buttons.forEach(function(btn){
        btn.addEventListener('click', function(){
          var id = parseInt(btn.getAttribute('data-stadium'),10);
          // Estado activo (accesible con aria-pressed).
          buttons.forEach(function(b){ b.classList.remove('is-active'); b.setAttribute('aria-pressed','false'); });
          btn.classList.add('is-active'); btn.setAttribute('aria-pressed','true');
          // Evita trabajo redundante ante clics repetidos sobre la misma sede.
          if(activeId !== id){ activeId = id; renderDetail(detail, id); }
          // Navegación interna del DOM: scroll suave hacia el detalle.
          detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
          detail.focus({ preventScroll: true });
        });
      });
      // Restaura la selección previa si se vuelve a la vista.
      if(activeId!=null){
        var prev = el.querySelector('.venue[data-stadium="'+activeId+'"]');
        if(prev){ prev.classList.add('is-active'); prev.setAttribute('aria-pressed','true'); renderDetail(detail, activeId); }
      }
    }
  };
})(window.App = window.App || {});
