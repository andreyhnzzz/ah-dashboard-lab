// 2.4 en carne propia: elegís tu equipo y el panel se repinta entero —
// color, posición de grupo, comparativa contra el líder.
(function (App) {
  'use strict';
  var C = App.common, S = C.store;

  /* --- Cabecera tipo transmisión: color del equipo + emblema + posición --- */
  function heroHtml(team, row){
    var color = team.color || '#4a2a86';
    var pos = row ? row.position : '—';
    var qualifies = row && row.position<=2;
    var badge = row
      ? '<span class="fan-hero__badge '+(qualifies?'is-in':'is-out')+'">'+
          (qualifies ? (C.icon('check')+' Zona de clasificación') : 'Fuera de zona')+'</span>'
      : '';
    return '<section class="fan-hero" style="--team:'+color+';--team-ink:'+C.contrastText(color)+'">'+
      '<div class="fan-hero__side">'+
        '<span class="fan-hero__flag">'+C.teamFlagHtml(team.id)+'</span>'+
        '<div class="fan-hero__id">'+
          '<h2 class="fan-hero__name">'+C.esc(team.name)+'</h2>'+
          '<span class="fan-hero__group">Grupo '+C.esc(team.group)+' · Copa Mundial 26</span>'+
          badge+
        '</div>'+
      '</div>'+
      '<div class="fan-hero__capsule">'+
        '<img class="fan-hero__mark" src="assets/emblem.png" alt="">'+
        '<div class="fan-hero__pos"><span class="fan-hero__pos-num">'+C.esc(pos)+'</span>'+
          '<span class="fan-hero__pos-label">'+(row?'° de grupo':'Sin datos')+'</span></div>'+
      '</div>'+
    '</section>';
  }

  // Una fila de barras. Se escala por magnitud: un -4 en "Diferencia" pinta
  // una barra tan larga como un +4; el signo se muestra aparte.
  function statBarRow(s, favColor, rivalColor){
    var la = Math.abs(s.l), ra = Math.abs(s.r), max = Math.max(la, ra, 1);
    var lw = Math.round(la/max*100), rw = Math.round(ra/max*100);
    var lead = s.l===s.r ? '' : (s.l>s.r ? ' is-lead-l' : ' is-lead-r');
    var fmt = function(v){ return s.signed && v>0 ? '+'+v : String(v); };
    return '<div class="statbar'+lead+'">'+
      '<span class="statbar__val statbar__val--l">'+fmt(s.l)+'</span>'+
      '<span class="statbar__track statbar__track--l">'+
        '<span class="statbar__fill" style="width:'+lw+'%;background:'+favColor+'"></span></span>'+
      '<span class="statbar__label">'+C.esc(s.label)+'</span>'+
      '<span class="statbar__track statbar__track--r">'+
        '<span class="statbar__fill" style="width:'+rw+'%;background:'+rivalColor+'"></span></span>'+
      '<span class="statbar__val statbar__val--r">'+fmt(s.r)+'</span>'+
    '</div>';
  }

  // Favorito contra el rival del grupo, en formato "panel de stats de ESPN".
  function statBars(favRow, favTeam, rivalRow, rivalTeam){
    var favRec = C.teamRecord(favTeam.id), rivalRec = C.teamRecord(rivalTeam.id);
    var favColor = favTeam.color || '#4a2a86', rivalColor = rivalTeam.color || '#c62368';
    var stats = [
      { label: 'Puntos',          l: favRow.pts, r: rivalRow.pts },
      { label: 'Ganados',         l: favRec.w,   r: rivalRec.w },
      { label: 'Goles a favor',   l: favRow.gf,  r: rivalRow.gf },
      { label: 'Goles en contra', l: favRow.ga,  r: rivalRow.ga },
      { label: 'Diferencia',      l: favRow.gd,  r: rivalRow.gd, signed: true }
    ];
    var rows = stats.map(function(s){ return statBarRow(s, favColor, rivalColor); }).join('');
    return '<section class="card fade-in">'+
      '<h3 class="section-title" style="--g:'+C.groupColor(favTeam.group)+'">Comparativa de grupo</h3>'+
      '<div class="statbars"><div class="statbars__head">'+
        '<span class="statbars__team" style="color:'+favColor+'">'+C.teamFlagHtml(favTeam.id)+' '+C.esc(favTeam.code||favTeam.name)+'</span>'+
        '<span class="statbars__vs">vs</span>'+
        '<span class="statbars__team" style="color:'+rivalColor+'">'+C.esc(rivalTeam.code||rivalTeam.name)+' '+C.teamFlagHtml(rivalTeam.id)+'</span>'+
      '</div>'+rows+'</div>'+
      '<p class="statbars__foot muted">Comparado con '+C.esc(rivalTeam.name)+', '+
        (rivalRow.position===1 ? 'líder del grupo' : (rivalRow.position+'° del grupo'))+'.</p>'+
    '</section>';
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
      var played=m.status==='played'&&m.home_score!=null;
      var favIsHome=m.home_team===fav.id, gf=favIsHome?m.home_score:m.away_score, ga=favIsHome?m.away_score:m.home_score;
      var rc=played?(gf>ga?'res-w':gf<ga?'res-l':'res-d'):'', rl=rc==='res-w'?'Victoria':rc==='res-l'?'Derrota':rc==='res-d'?'Empate':'';
      var stage = m.stage==='group' ? ('Grupo '+m.group) : (m.stage_label||'Eliminatoria');
      return '<li>'+C.scorecardBar({
        homeId: m.home_team, homeLabel: m.home_team_label, awayId: m.away_team, awayLabel: m.away_team_label,
        played: played, homeScore: m.home_score, awayScore: m.away_score,
        statusText: stage+' · '+C.fmtDate(m.local_date), statusColor: m.stage==='group'?C.groupColor(m.group):null,
        favId: fav.id, resultText: played?rl:null, resultClass: rc
      })+'</li>';
    }).join('');
    return '<ul class="matches">'+items+'</ul>';
  }

  // Favorito guardado pero equipos aún sin llegar: esqueleto, no el mensaje de
  // "elegí un equipo" (sería mentira — el favorito sí existe, falta el dato).
  var FAN_SKELETON = '<div class="skeleton skeleton--tile" style="height:120px"></div>'+
    '<div class="skeleton skeleton--tile" style="height:220px"></div>';
  var FAN_EMPTY = '<div class="card empty-state">'+
    '<div class="empty-state__icon">'+C.icon('star')+'</div>'+
    '<h3>Elegí tu selección favorita</h3>'+
    '<p class="notice">Usá el selector <strong>«Equipo favorito»</strong> en la barra superior. '+
    'El panel se personaliza y el color de acento cambia según el equipo.</p></div>';

  // Panel completo del equipo favorito: hero + comparativa + tabla + partidos.
  function fanaticoMain(team, favId){
    var list = S.groupByLetter[team.group] || [];
    var row = null; for(var i=0;i<list.length;i++){ if(list[i].team_id===favId){ row=list[i]; break; } }
    // El rival es el líder del grupo; si el favorito es líder, el segundo.
    var rivalRow = (row && list.length>1) ? (row.position===1 ? list[1] : list[0]) : null;
    var rivalTeam = rivalRow ? S.teamById[rivalRow.team_id] : null;
    var comparison = (row && rivalRow && rivalTeam)
      ? statBars(row, team, rivalRow, rivalTeam)
      : '<section class="card"><h3 class="section-title">Comparativa de grupo</h3>'+
        '<p class="notice">Sin datos de grupo suficientes para la comparativa.</p></section>';
    return heroHtml(team, row) + comparison +
      '<div class="split">'+
        '<section class="card fade-in"><h3 class="section-title" style="--g:'+C.groupColor(team.group)+'">Grupo '+C.esc(team.group)+'</h3>'+standings(list, favId)+'</section>'+
        '<section class="card fade-in"><h3 class="section-title">Partidos de '+C.esc(team.name)+'</h3>'+matches(S.matchesByTeam[favId]||[], team)+'</section>'+
      '</div>';
  }

  App.views = App.views || {};
  App.views.fanatico = {
    title: 'Dashboard del Fanático', desc: 'Elegí tu selección en la barra superior para personalizar el panel.', icon: 'star',
    render: function (el) {
      var favId = App.app.getFavorite();
      if(favId && !S.ready.teams){ el.innerHTML = FAN_SKELETON; return; }
      var team = favId ? S.teamById[favId] : null;
      if(!team){ el.innerHTML = FAN_EMPTY; return; }
      el.innerHTML = fanaticoMain(team, favId);
    }
  };
})(window.App = window.App || {});
