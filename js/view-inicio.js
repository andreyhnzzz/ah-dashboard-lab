/* ============================================================================
 * view-inicio.js — Resumen del torneo (landing)
 * Da contexto y accesos directos a cada apartado. Lee conteos del store.
 * ==========================================================================*/
(function (App) {
  'use strict';
  var C = App.common, S = C.store;

  function tile(value, label){
    return '<div class="kpi"><span class="kpi__value">'+value+'</span><span class="kpi__label">'+C.esc(label)+'</span></div>';
  }
  function moduleCard(id, icon, title, desc){
    return '<button class="module-card" data-goto="'+id+'" type="button">'+
      '<span class="module-card__icon">'+C.icon(icon)+'</span>'+
      '<span class="module-card__title">'+C.esc(title)+'</span>'+
      '<span class="module-card__desc">'+C.esc(desc)+'</span></button>';
  }

  App.views = App.views || {};
  App.views.inicio = {
    title: 'Resumen', desc: 'Panorama general del torneo y accesos directos.', icon: 'home',
    render: function (el) {
      var played = S.games.filter(function(g){ return g.status==='played'; }).length;
      el.innerHTML =
        '<section class="hero-lg fade-in">'+
          '<div>'+
            '<h2 class="hero-lg__title">Copa Mundial de la FIFA 2026</h2>'+
            '<p class="hero-lg__sub">Un solo panel con los cinco apartados: sedes, agenda simultánea, timeline infinito, dashboard del fanático y matriz de grupos.</p>'+
          '</div>'+
          '<div class="hero-lg__badge"><img src="assets/emblem.png" alt="Emblema oficial FIFA World Cup 26" width="96" height="96"></div>'+
        '</section>'+
        '<div class="kpi-row fade-in">'+
          tile(S.teams.length || '—', 'Selecciones')+
          tile(S.stadiums.length || '—', 'Sedes')+
          tile(S.games.length || '—', 'Partidos')+
          tile(played || '—', 'Jugados')+
        '</div>'+
        '<h3 class="section-title">Explorá los apartados</h3>'+
        '<div class="module-grid fade-in">'+
          moduleCard('sedes','stadium','Tour Virtual de Sedes','16 sedes; hacé clic para saltar a sus partidos.')+
          moduleCard('agenda','calendar','Agenda Simultánea','Días con varios partidos, en columnas paralelas.')+
          moduleCard('timeline','infinity','Timeline Infinito','Los 104 partidos con carga progresiva al hacer scroll.')+
          moduleCard('fanatico','star','Dashboard del Fanático','Seguí a tu selección y tematizá el panel.')+
          moduleCard('matriz','grid','Matriz de Enfrentamientos','Cuadrícula 4×4 de resultados por grupo.')+
        '</div>';
    }
  };
})(window.App = window.App || {});
