/* ============================================================================
 * view-matriz.js — Apartado 2.5: Matriz de Enfrentamientos por Grupo
 * Técnica: cuadrícula interactiva cruzando groups + teams + games.
 * Resiliencia: la matriz se dibuja SIEMPRE completa (todas las celdas
 * "Pendiente"); cuando llegan los partidos se actualizan SOLO las celdas
 * afectadas (refresh()), sin reconstruir la tabla desde cero.
 * ==========================================================================*/
(function (App) {
  'use strict';
  var C = App.common, S = C.store;
  var current = null; // letra de grupo activo

  var GROUPS = ['A','B','C','D','E','F','G','H','I','J','K','L'];

  // Equipos de un grupo (orden por posición si hay standings; si no, por nombre).
  function teamsOfGroup(letter){
    var standings = S.groupByLetter[letter];
    if(standings && standings.length){
      return standings.map(function(r){ return S.teamById[r.team_id]; }).filter(Boolean);
    }
    return S.teams.filter(function(t){ return t.group===letter; })
      .sort(function(a,b){ return a.name.localeCompare(b.name,'es'); });
  }

  // Partido de fase de grupos entre dos equipos (si existe).
  function gameBetween(aId, bId){
    var list = S.matchesByTeam[aId] || [];
    for(var i=0;i<list.length;i++){
      var m=list[i];
      if(m.stage!=='group'){ continue; }
      if((m.home_team===aId&&m.away_team===bId)||(m.home_team===bId&&m.away_team===aId)){ return m; }
    }
    return null;
  }

  function groupTabs(){
    return '<div class="group-tabs" role="tablist" aria-label="Grupos">'+
      GROUPS.map(function(g){
        return '<button class="group-tab'+(g===current?' is-active':'')+'" role="tab" '+
          'aria-selected="'+(g===current)+'" data-group="'+g+'" type="button">'+g+'</button>';
      }).join('')+'</div>';
  }

  // Construye la matriz completa con todas las celdas en "Pendiente".
  function buildMatrix(letter){
    var teams = teamsOfGroup(letter);
    if(!teams.length){ return '<p class="notice">No hay datos del grupo '+C.esc(letter)+'.</p>'; }
    var head = '<tr><th scope="col" class="matrix__corner">'+C.esc(letter)+'</th>'+
      teams.map(function(t){ return '<th scope="col" class="matrix__colh" title="'+C.esc(t.name)+'">'+C.teamFlagHtml(t.id)+'<span class="matrix__code">'+C.esc(t.code)+'</span></th>'; }).join('')+'</tr>';
    var body = teams.map(function(rowT){
      var cells = teams.map(function(colT){
        if(rowT.id===colT.id){ return '<td class="matrix__cell is-diagonal" aria-disabled="true"><span aria-hidden="true">—</span><span class="visually-hidden">mismo equipo</span></td>'; }
        var id='cell-'+letter+'-'+rowT.id+'-'+colT.id;
        return '<td class="matrix__cell" id="'+id+'" data-row="'+rowT.id+'" data-col="'+colT.id+'">'+
          '<span class="tag tag--pending">Pendiente</span></td>';
      }).join('');
      return '<tr><th scope="row" class="matrix__rowh" title="'+C.esc(rowT.name)+'">'+C.teamFlagHtml(rowT.id)+' '+C.esc(rowT.code)+'</th>'+cells+'</tr>';
    }).join('');
    return '<div class="matrix-wrap"><table class="matrix"><caption class="visually-hidden">Resultados del grupo '+C.esc(letter)+
      '. Fila contra columna.</caption><thead>'+head+'</thead><tbody>'+body+'</tbody></table></div>'+
      '<p class="muted matrix__legend">Cada celda muestra Fila – Columna. La diagonal (equipo contra sí mismo) está deshabilitada.</p>';
  }

  // Actualiza SOLO las celdas con partido jugado (no reconstruye la tabla).
  function fillResults(el){
    if(!S.ready.games){ return; }
    var teams = teamsOfGroup(current);
    teams.forEach(function(rowT){
      teams.forEach(function(colT){
        if(rowT.id===colT.id){ return; }
        var cell = el.querySelector('#cell-'+current+'-'+rowT.id+'-'+colT.id);
        if(!cell){ return; }
        var m = gameBetween(rowT.id, colT.id);
        if(m && m.status==='played' && m.home_score!=null){
          var rowScore = (m.home_team===rowT.id)?m.home_score:m.away_score;
          var colScore = (m.home_team===rowT.id)?m.away_score:m.home_score;
          var cls = rowScore>colScore?'res-w':rowScore<colScore?'res-l':'res-d';
          cell.innerHTML = '<span class="matrix__result '+cls+'">'+rowScore+'–'+colScore+'</span>';
          cell.classList.add('is-played');
        }
      });
    });
  }

  function paintGroup(el){
    el.querySelector('#matrix-host').innerHTML = buildMatrix(current);
    fillResults(el);
    // estado de tabs
    el.querySelectorAll('.group-tab').forEach(function(b){
      var on = b.getAttribute('data-group')===current;
      b.classList.toggle('is-active', on); b.setAttribute('aria-selected', on);
    });
  }

  App.views = App.views || {};
  App.views.matriz = {
    title: 'Matriz de Enfrentamientos', desc: 'Cuadrícula 4×4 de resultados por grupo.', icon: 'grid',
    render: function (el) {
      if(!current){ current = 'A'; }
      el.innerHTML = groupTabs() + '<div id="matrix-host" aria-live="polite"></div>';
      el.querySelectorAll('.group-tab').forEach(function(btn){
        btn.addEventListener('click', function(){ current = btn.getAttribute('data-group'); paintGroup(el); });
      });
      paintGroup(el);
    },
    // Llamado tras una recarga exitosa: actualiza celdas sin rebuild.
    refresh: function (el){ fillResults(el); }
  };
})(window.App = window.App || {});
