/* ============================================================================
 * view-fanatico.js — Apartado 2.4: Dashboard del Fanático Incondicional
 * Técnica: tematización dinámica (variables CSS por equipo) + persistencia del
 * favorito en localStorage. El selector de favorito vive en la topbar (global).
 * Resiliencia: si falta el grupo o los partidos, se dibuja con guiones y avisos
 * locales; nunca queda vacío.
 * ==========================================================================*/
(function (App) {
  'use strict';
  var C = App.common, S = C.store;

  function tile(label, value, hint, cls){
    return '<div class="stat-tile '+(cls||'')+'">'+
      '<span class="stat-tile__label">'+C.esc(label)+'</span>'+
      '<span class="stat-tile__value">'+value+'</span>'+
      (hint?'<span class="stat-tile__hint">'+hint+'</span>':'')+'</div>';
  }

  function heroHtml(team, row){
    var pos = row ? row.position : '—';
    var qualifies = row && row.position<=2;
    var badge = row ? '<span class="badge-qualify '+(qualifies?'is-in':'is-out')+'">'+
      (qualifies?(C.icon('check')+' Zona de clasificación'):'Fuera de zona')+'</span>' : '';
    return '<section class="hero fade-in">'+
      '<span class="hero__flag">'+C.teamFlagHtml(team.id)+'</span>'+
      '<div class="hero__meta"><h2 class="hero__team">'+C.esc(team.name)+'</h2>'+
        '<span class="hero__group">Grupo '+C.esc(team.group)+' · Mundial 2026</span>'+badge+'</div>'+
      '<div class="hero__position"><div class="hero__position-num">'+C.esc(pos)+(row?'º':'')+'</div>'+
        '<div class="hero__position-label">Posición de grupo</div></div></section>';
  }

  function statRow(row, favId){
    if(!row){ return '<div class="stat-row">'+tile('Puntos','—','Sin datos de grupo','stat-tile--accent')+
      tile('Goles a favor','—','')+tile('Goles en contra','—','')+tile('Diferencia','—','')+'</div>'; }
    var rec = C.teamRecord(favId); // W/D/L derivado de los partidos reales
    var gd=row.gd, cls=gd>0?'pos-good':(gd<0?'pos-bad':''), txt=(gd>0?'+':'')+gd;
    var recTxt='PJ '+rec.played+' · '+rec.w+'G '+rec.d+'E '+rec.l+'P';
    return '<div class="stat-row">'+
      tile('Puntos', String(row.pts), recTxt, 'stat-tile--accent')+
      tile('Goles a favor', String(row.gf), 'Anotados')+
      tile('Goles en contra', String(row.ga), 'Recibidos')+
      tile('Diferencia', '<span class="'+cls+'">'+txt+'</span>', 'GF − GC')+'</div>';
  }

  function standings(list, favId){
    if(!list || !list.length){ return '<p class="notice">Tabla de posiciones no disponible por ahora.</p>'; }
    var rows = list.map(function(r){
      var t=S.teamById[r.team_id]||{name:'Por definir'};
      var rec = C.teamRecord(r.team_id);
      var q=r.position<=2, cls=(r.team_id===favId?'is-favorite ':'')+(q?'qualifies':'');
      return '<tr class="'+cls.trim()+'"><td><span class="pos-pill">'+r.position+'</span></td>'+
        '<td>'+C.teamFlagHtml(r.team_id)+' '+C.esc(t.name)+'</td><td>'+rec.played+'</td><td>'+r.pts+'</td>'+
        '<td>'+r.gf+'</td><td>'+r.ga+'</td><td>'+(r.gd>0?'+':'')+r.gd+'</td></tr>';
    }).join('');
    return '<table class="standings"><caption>Las dos primeras posiciones avanzan de ronda.</caption>'+
      '<thead><tr><th scope="col">#</th><th scope="col">Equipo</th><th scope="col" title="Partidos jugados">PJ</th>'+
      '<th scope="col" title="Puntos">Pts</th><th scope="col" title="Goles a favor">GF</th>'+
      '<th scope="col" title="Goles en contra">GC</th><th scope="col" title="Diferencia de goles">DG</th></tr></thead>'+
      '<tbody>'+rows+'</tbody></table>';
  }

  function matches(list, fav){
    if(!list || !list.length){ return '<p class="notice">No se pudieron cargar los partidos de este equipo.</p>'; }
    var items = list.slice().sort(function(a,b){ return a.local_date.localeCompare(b.local_date); }).map(function(m){
      var homeName = C.teamName(m.home_team, m.home_team_label);
      var awayName = C.teamName(m.away_team, m.away_team_label);
      var played=m.status==='played'&&m.home_score!=null;
      var favIsHome=m.home_team===fav.id, gf=favIsHome?m.home_score:m.away_score, ga=favIsHome?m.away_score:m.home_score;
      var rc=played?(gf>ga?'res-w':gf<ga?'res-l':'res-d'):'', rl=rc==='res-w'?'Victoria':rc==='res-l'?'Derrota':rc==='res-d'?'Empate':'';
      var center=played?('<div class="match__score">'+m.home_score+' – '+m.away_score+'</div><div class="match__result '+rc+'">'+rl+'</div>')
        :'<span class="match__pending">Pendiente</span>';
      return '<li class="match"><span class="match__side">'+
        '<span class="match__flag">'+C.teamFlagHtml(m.home_team, m.home_team_label)+'</span>'+
        '<span class="match__name '+(m.home_team===fav.id?'is-fav':'')+'">'+C.esc(homeName)+'</span></span>'+
        '<span class="match__center">'+center+'<div class="match__date">'+C.esc(C.fmtDate(m.local_date))+'</div></span>'+
        '<span class="match__side match__side--away"><span class="match__name '+(m.away_team===fav.id?'is-fav':'')+'">'+C.esc(awayName)+'</span>'+
        '<span class="match__flag">'+C.teamFlagHtml(m.away_team, m.away_team_label)+'</span></span></li>';
    }).join('');
    return '<ul class="matches">'+items+'</ul>';
  }

  App.views = App.views || {};
  App.views.fanatico = {
    title: 'Dashboard del Fanático', desc: 'Elegí tu selección en la barra superior para personalizar el panel.', icon: 'star',
    render: function (el) {
      var favId = App.app.getFavorite();

      // Hay favorito guardado (sobrevive a un refresco completo) pero el store
      // todavía no cargó equipos: mostrar esqueleto, NO el estado "sin favorito"
      // (que sería engañoso — el favorito sí existe, solo falta el dato).
      if(favId && !S.ready.teams){
        el.innerHTML = '<div class="skeleton skeleton--tile" style="height:150px"></div>'+
          '<div class="stat-row">'+C.skeletonCards(4)+'</div>';
        return;
      }

      var team = favId ? S.teamById[favId] : null;
      if(!team){
        el.innerHTML = '<div class="card empty-state">'+
          '<div class="empty-state__icon">'+C.icon('star')+'</div>'+
          '<h3>Elegí tu selección favorita</h3>'+
          '<p class="notice">Usá el selector <strong>«Equipo favorito»</strong> en la barra superior. '+
          'El panel se personaliza y el color de acento cambia según el equipo.</p></div>';
        return;
      }
      var list = S.groupByLetter[team.group] || [];
      var row = null; for(var i=0;i<list.length;i++){ if(list[i].team_id===favId){ row=list[i]; break; } }
      var teamMatches = S.matchesByTeam[favId] || [];
      el.innerHTML =
        heroHtml(team, row) + statRow(row, favId) +
        '<div class="split">'+
          '<section class="card fade-in"><h3 class="section-title">Grupo '+C.esc(team.group)+'</h3>'+standings(list, favId)+'</section>'+
          '<section class="card fade-in"><h3 class="section-title">Partidos de '+C.esc(team.name)+'</h3>'+matches(teamMatches, team)+'</section>'+
        '</div>';
    }
  };
})(window.App = window.App || {});
