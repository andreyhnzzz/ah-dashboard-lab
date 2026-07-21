/* ============================================================================
 * common.js — Adaptador de datos + utilidades compartidas + store en memoria.
 * Único punto que conoce la forma real de la API — ver docs/ARCHITECTURE.md.
 * ==========================================================================*/
(function (App) {
  'use strict';

  function $(id) { return document.getElementById(id); }

  // Ícono SVG del sprite embebido en index.html (ver <svg class="icon-sprite">).
  // Reemplaza los emojis: mismo tratamiento tipográfico en toda la app,
  // hereda color vía currentColor y escala con font-size.
  function icon(name, extraCls) {
    return '<svg class="icon' + (extraCls ? ' ' + extraCls : '') + '" aria-hidden="true" focusable="false"><use href="#icon-' + name + '"></use></svg>';
  }

  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* ---------------------- Color: contraste y tema ------------------------- */
  // La matemática de color y la tematización viven en js/color.js (módulo de
  // responsabilidad única, cargado antes que este). Aquí solo se toman las
  // funciones que common.js usa internamente y que reexpone a las vistas.
  var contrastText = App.color.contrastText;
  var colorFromString = App.color.colorFromString;

  // Color fijo por grupo (A–L), ver css/tokens.css (--grp-a…--grp-l). Se usa en
  // la Matriz de Enfrentamientos y en las tarjetas de resultado "scoreboard"
  // para que cada grupo tenga una identidad visual propia, como en las
  // referencias de diseño (tarjetas de grupo con marco de color).
  function groupColor(letter) {
    var l = String(letter || 'a').toLowerCase();
    return 'var(--grp-' + (/^[a-l]$/.test(l) ? l : 'a') + ')';
  }

  /* ---------------------- Fecha legible ------------------------------------
   * El store guarda las fechas ya normalizadas a 'YYYY-MM-DD' (ver adaptGame).
   * --------------------------------------------------------------------- */
  var MONTHS = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
  var WEEKDAYS = ['dom','lun','mar','mié','jue','vie','sáb'];
  function fmtDate(iso){
    var p=String(iso).split('-'); if(p.length!==3){return iso;}
    return parseInt(p[2],10)+' '+MONTHS[parseInt(p[1],10)-1];
  }
  function fmtDateLong(iso){
    var p=String(iso).split('-'); if(p.length!==3){return iso;}
    var d=new Date(Date.UTC(+p[0],+p[1]-1,+p[2]));
    return WEEKDAYS[d.getUTCDay()]+' '+parseInt(p[2],10)+' '+MONTHS[+p[1]-1]+' '+p[0];
  }

  // Adaptador API real → forma interna (esquema completo en docs/ARCHITECTURE.md).
  // Admite array plano o envuelto ({teams:[...]} / {data:[...]}).
  function unwrapArray(raw, keys){
    if (Array.isArray(raw)) { return raw; }
    if (raw && typeof raw === 'object') {
      for (var i = 0; i < keys.length; i++) {
        if (Array.isArray(raw[keys[i]])) { return raw[keys[i]]; }
      }
    }
    return [];
  }

  var STAGE_LABELS = {
    group: 'Fase de grupos', r32: 'Dieciseisavos', r16: 'Octavos',
    qf: 'Cuartos de final', sf: 'Semifinal', third: 'Tercer puesto', final: 'Final'
  };

  function adaptTeam(raw){
    var id = String(raw.id);
    var name = raw.name_en || raw.name_fa || raw.fifa_code || ('Equipo ' + id);
    return {
      id: id,
      name: name,
      code: raw.fifa_code || '',
      group: raw.groups || raw.group || '',
      flag: raw.flag || '',                    // URL de bandera real (o '' si no vino)
      color: colorFromString(raw.fifa_code || name)
    };
  }

  function adaptStadium(raw){
    return {
      id: String(raw.id),
      name: raw.name_en || raw.fifa_name || ('Estadio ' + raw.id),
      city: raw.city_en || '',
      country: raw.country_en || '',
      capacity: raw.capacity != null ? Number(raw.capacity) : null
    };
  }

  // 'MM/DD/YYYY HH:mm' (formato real) → 'YYYY-MM-DD' (para agrupar/ordenar).
  function normalizeDate(raw){
    var s = String(raw || '').trim();
    var m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (m) { return m[3] + '-' + ('0'+m[1]).slice(-2) + '-' + ('0'+m[2]).slice(-2); }
    // Ya viene en ISO (p. ej. datos de ejemplo antiguos) o formato desconocido.
    var iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    return iso ? iso[0] : s;
  }

  function adaptGame(raw){
    var homeId = raw.home_team_id != null ? String(raw.home_team_id) : null;
    var awayId = raw.away_team_id != null ? String(raw.away_team_id) : null;
    var finished = String(raw.finished || '').toUpperCase() === 'TRUE';
    var hs = raw.home_score !== '' && raw.home_score != null ? parseInt(raw.home_score, 10) : null;
    var as_ = raw.away_score !== '' && raw.away_score != null ? parseInt(raw.away_score, 10) : null;
    var stage = raw.type || 'group';
    return {
      id: String(raw.id || raw._id),
      stage: stage,
      stage_label: STAGE_LABELS[stage] || 'Eliminatoria',
      group: raw.group || null,
      local_date: normalizeDate(raw.local_date),
      stadium_id: raw.stadium_id != null ? String(raw.stadium_id) : null,
      home_team: homeId,
      away_team: awayId,
      home_team_label: raw.home_team_label || '',
      away_team_label: raw.away_team_label || '',
      home_score: (finished && !isNaN(hs)) ? hs : null,
      away_score: (finished && !isNaN(as_)) ? as_ : null,
      status: finished ? 'played' : 'scheduled'
    };
  }

  /* ---------------------- Store de datos normalizados --------------------- */
  var store = {
    teams: [], teamById: {}, teamsSorted: [],
    stadiums: [], stadiumById: {},
    games: [], gamesByStadium: {}, gamesByDate: {}, matchesByTeam: {},
    groups: [], groupByLetter: {},
    ready: { teams:false, games:false, groups:false, stadiums:false }
  };

  // Vacía el store en memoria: al cerrar sesión, no debe quedar ni un dato
  // cargado detrás de la pantalla de login (aunque esté visualmente oculta).
  function resetStore(){
    store.teams = []; store.teamById = {}; store.teamsSorted = [];
    store.stadiums = []; store.stadiumById = {};
    store.games = []; store.gamesByStadium = {}; store.gamesByDate = {}; store.matchesByTeam = {};
    store.groups = []; store.groupByLetter = {};
    store.ready.teams = store.ready.games = store.ready.groups = store.ready.stadiums = false;
  }

  function setTeams(raw){
    var teams = unwrapArray(raw, ['teams', 'data']).map(adaptTeam);
    store.teams = teams; store.teamById = {};
    teams.forEach(function(t){ store.teamById[t.id]=t; });
    store.teamsSorted = teams.slice().sort(function(a,b){ return a.name.localeCompare(b.name,'es'); });
    store.ready.teams = true;
  }
  function setStadiums(raw){
    var list = unwrapArray(raw, ['stadiums', 'data']).map(adaptStadium);
    store.stadiums = list; store.stadiumById = {};
    list.forEach(function(s){ store.stadiumById[s.id]=s; });
    store.ready.stadiums = true;
  }
  function setGames(raw){
    var games = unwrapArray(raw, ['games', 'data']).map(adaptGame);
    store.games = games;
    store.gamesByStadium = {}; store.gamesByDate = {}; store.matchesByTeam = {};
    games.forEach(function(m){
      if (m.stadium_id != null) { (store.gamesByStadium[m.stadium_id]=store.gamesByStadium[m.stadium_id]||[]).push(m); }
      if (m.local_date) { (store.gamesByDate[m.local_date]=store.gamesByDate[m.local_date]||[]).push(m); }
      [m.home_team, m.away_team].forEach(function(tid){
        if(tid!=null){ (store.matchesByTeam[tid]=store.matchesByTeam[tid]||[]).push(m); }
      });
    });
    store.ready.games = true;
  }
  function setGroups(raw){
    var groups = unwrapArray(raw, ['groups', 'data']);
    store.groups = groups; store.groupByLetter = {};
    groups.forEach(function(g){
      var rows = (g.teams || []).map(function(r){
        return {
          team_id: String(r.team_id),
          pts: parseInt(r.pts, 10) || 0,
          gf: parseInt(r.gf, 10) || 0,
          ga: parseInt(r.ga, 10) || 0
        };
      });
      rows.forEach(function(r){ r.gd = r.gf - r.ga; });
      rows.sort(function(a,b){ return (b.pts-a.pts) || (b.gd-a.gd) || (b.gf-a.gf); });
      rows.forEach(function(r, i){ r.position = i + 1; });
      // La API real envuelve la letra del grupo en "name" (p. ej. {"name":"H",
      // "teams":[...]}), no en "group" — se acepta el fallback por si el mock
      // u otra versión de la API usara la clave antigua.
      store.groupByLetter[g.name || g.group] = rows;
    });
    store.ready.groups = true;
  }

  // Nombre/bandera de un equipo, con fallback a la etiqueta de eliminatoria
  // (p. ej. "Winner Match 87") cuando el rival todavía no está definido.
  function teamName(id, fallbackLabel){
    var t = store.teamById[id];
    return t ? t.name : (fallbackLabel || 'Por definir');
  }
  // Devuelve HTML seguro: <img> con la bandera real si existe URL, o un
  // emoji genérico como respaldo (equipo aún no definido / bandera ausente).
  function teamFlagHtml(id, label){
    var t = store.teamById[id];
    if (t && t.flag) {
      return '<img class="flag-ico" src="'+esc(t.flag)+'" alt="" loading="lazy" width="20" height="15">';
    }
    return icon('trophy', 'flag-ico flag-ico--fallback');
  }

  // Tarjeta de partido "scoreboard" (ver docs/ARCHITECTURE.md), reutilizada
  // por Sedes/Agenda/Timeline/Fanático. opts.statusColor suele ser groupColor(letra).
  function scorecardBar(opts) {
    var home = store.teamById[opts.homeId], away = store.teamById[opts.awayId];
    var homeColor = (home && home.color) || '#3a3a42';
    var awayColor = (away && away.color) || '#3a3a42';
    var homeName = teamName(opts.homeId, opts.homeLabel);
    var awayName = teamName(opts.awayId, opts.awayLabel);
    // Los scores flanquean el emblema central (reemplaza al "–").
    var homeNum = opts.played ? '<span class="scorecard__num scorecard__num--home">'+esc(opts.homeScore)+'</span>' : '';
    var awayNum = opts.played ? '<span class="scorecard__num scorecard__num--away">'+esc(opts.awayScore)+'</span>' : '';
    var subtab = '';
    if (opts.statusText != null) {
      subtab = '<div class="scorecard__subtab" style="--g:'+(opts.statusColor || 'var(--score-fg-muted)')+'">'+
        '<span class="scorecard__subtab-main">'+esc(opts.statusText)+'</span>'+
        (opts.resultText ? '<span class="scorecard__result '+(opts.resultClass||'')+'">'+esc(opts.resultText)+'</span>' : '')+
      '</div>';
    }
    return '<div class="scorecard'+(opts.played?' is-played':'')+'">'+
      '<div class="scorecard__bar">'+
        '<span class="scorecard__side scorecard__side--home'+(opts.favId===opts.homeId?' is-fav':'')+'" style="background:'+homeColor+';color:'+contrastText(homeColor)+'">'+
          teamFlagHtml(opts.homeId, opts.homeLabel)+'<span class="scorecard__name">'+esc(homeName)+'</span>'+
        '</span>'+
        '<span class="scorecard__capsule">'+
          homeNum+
          '<span class="scorecard__marks" aria-hidden="true">'+
            '<img class="scorecard__mark scorecard__mark--trophy" src="assets/trophy-sm.png" alt="">'+
            '<img class="scorecard__mark scorecard__mark--emblem" src="assets/emblem-sm.png" alt="">'+
          '</span>'+
          awayNum+
        '</span>'+
        '<span class="scorecard__side scorecard__side--away'+(opts.favId===opts.awayId?' is-fav':'')+'" style="background:'+awayColor+';color:'+contrastText(awayColor)+'">'+
          '<span class="scorecard__name">'+esc(awayName)+'</span>'+teamFlagHtml(opts.awayId, opts.awayLabel)+
        '</span>'+
      '</div>'+subtab+
    '</div>';
  }

  // Récord Jugados/Ganados/Empatados/Perdidos de un equipo en fase de grupos,
  // derivado de los partidos reales (la API de grupos solo da pts/gf/ga, no
  // el desglose W/D/L).
  function teamRecord(teamId){
    var list = store.matchesByTeam[teamId] || [];
    var rec = { played: 0, w: 0, d: 0, l: 0 };
    list.forEach(function(m){
      if (m.stage !== 'group' || m.status !== 'played') { return; }
      var isHome = m.home_team === teamId;
      var gf = isHome ? m.home_score : m.away_score;
      var ga = isHome ? m.away_score : m.home_score;
      if (gf == null || ga == null) { return; }
      rec.played++;
      if (gf > ga) { rec.w++; } else if (gf < ga) { rec.l++; } else { rec.d++; }
    });
    return rec;
  }

  /* ---------------------- Banners y modal (globales) ---------------------- */
  var ui = {
    showRetry: function(text){ $('banner-retry-text').textContent=text; $('banner-retry').hidden=false; },
    hideRetry: function(){ $('banner-retry').hidden=true; },
    showStale: function(savedAt){
      var when = savedAt ? (' · guardado '+new Date(savedAt).toLocaleString('es-CR')) : '';
      $('banner-stale-text').textContent='Mostrando datos guardados (no actualizados)'+when+'.';
      $('banner-stale').hidden=false;
    },
    hideStale: function(){ $('banner-stale').hidden=true; },
    showError: function(text){ $('banner-error-text').textContent=text||'No se pudieron cargar los datos.'; $('banner-error').hidden=false; },
    hideError: function(){ $('banner-error').hidden=true; },
    setConnection: function(state){ // 'ok' | 'offline' | 'retry'
      var pill=$('conn-pill'), txt=$('conn-text');
      pill.className='pill '+(state==='ok'?'pill--ok':state==='offline'?'pill--warn':'pill--retry');
      txt.textContent = state==='ok'?'En línea':state==='offline'?'Sin conexión':'Reintentando';
    }
    // El modal de sesión expirada (401) se reemplazó por la pantalla de login
    // completa (App.auth, ver js/view-login.js) — ver hooks.onAuthExpired en app.js.
  };

  /* ---------------------- Skeleton genérico ------------------------------- */
  function skeletonCards(n, cls){
    var out=''; for(var i=0;i<(n||4);i++){ out+='<div class="skeleton '+(cls||'skeleton--tile')+'"></div>'; }
    return out;
  }

  App.common = {
    $: $, esc: esc, icon: icon, store: store,
    setTeams: setTeams, setStadiums: setStadiums, setGames: setGames, setGroups: setGroups, resetStore: resetStore,
    teamName: teamName, teamFlagHtml: teamFlagHtml, teamRecord: teamRecord, groupColor: groupColor, scorecardBar: scorecardBar,
    fmtDate: fmtDate, fmtDateLong: fmtDateLong,
    ui: ui, skeletonCards: skeletonCards,
    // Reexportado desde js/color.js: las vistas y app.js siguen llamando a
    // App.common.* sin conocer la reubicación (fachada estable, bajo acoplamiento).
    contrastText: App.color.contrastText,
    applyTeamTheme: App.color.applyTeamTheme,
    watchScheme: App.color.watchScheme
  };

})(window.App = window.App || {});
