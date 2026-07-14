/* ============================================================================
 * common.js — Adaptador de datos + utilidades compartidas + estado en memoria
 * ----------------------------------------------------------------------------
 * Todas las vistas (sedes, agenda, timeline, fanático, matriz) leen los datos
 * desde `App.common.store` y usan estos helpers. Aquí vive el ÚNICO punto que
 * conoce la forma real de la API del Mundial 2026 (home_team_id, finished:
 * 'TRUE'/'FALSE', envoltorio {games:[...]}, ids como string, fechas
 * MM/DD/YYYY, etc. — ver la documentación de la API en el README) y la
 * traduce a una forma interna simple que el resto de la app consume. El modo
 * demo (mock-data.js) entrega datos con ese MISMO formato real, así que este
 * adaptador es el único camino — no hay dos esquemas paralelos.
 * ==========================================================================*/
(function (App) {
  'use strict';

  function $(id) { return document.getElementById(id); }

  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* ---------------------- Color: contraste y tema ------------------------- */
  function hexToRgb(hex) {
    var h = String(hex).replace('#', '');
    if (h.length === 3) { h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2]; }
    return { r: parseInt(h.slice(0,2),16), g: parseInt(h.slice(2,4),16), b: parseInt(h.slice(4,6),16) };
  }
  function relLum(rgb) {
    var a = [rgb.r, rgb.g, rgb.b].map(function (v) {
      v /= 255; return v <= 0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4);
    });
    return 0.2126*a[0] + 0.7152*a[1] + 0.0722*a[2];
  }
  function contrastText(hex) { return relLum(hexToRgb(hex)) > 0.42 ? '#0b0b0b' : '#ffffff'; }
  function rgbToHsl(rgb) {
    var r=rgb.r/255,g=rgb.g/255,b=rgb.b/255,max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min,h=0,s=0,l=(max+min)/2;
    if (d!==0){ s=d/(1-Math.abs(2*l-1));
      if(max===r){h=((g-b)/d)%6;}else if(max===g){h=(b-r)/d+2;}else{h=(r-g)/d+4;}
      h*=60; if(h<0){h+=360;} }
    return {h:h,s:s,l:l};
  }
  function hslToHex(hsl){
    var c=(1-Math.abs(2*hsl.l-1))*hsl.s, x=c*(1-Math.abs((hsl.h/60)%2-1)), m=hsl.l-c/2, r,g,b,H=hsl.h;
    if(H<60){r=c;g=x;b=0;}else if(H<120){r=x;g=c;b=0;}else if(H<180){r=0;g=c;b=x;}
    else if(H<240){r=0;g=x;b=c;}else if(H<300){r=x;g=0;b=c;}else{r=c;g=0;b=x;}
    function t2(v){return ('0'+Math.round((v+m)*255).toString(16)).slice(-2);}
    return '#'+t2(r)+t2(g)+t2(b);
  }
  function adjustAccent(hex, isDark){
    var hsl=rgbToHsl(hexToRgb(hex));
    if(hsl.s<0.12){hsl.s=0.12;}
    if(isDark){ if(hsl.l<0.52){hsl.l=0.6;} } else { if(hsl.l>0.6){hsl.l=0.5;} }
    return hslToHex(hsl);
  }
  function rgba(hex, a){ var c=hexToRgb(hex); return 'rgba('+c.r+','+c.g+','+c.b+','+a+')'; }
  function isDark(){ return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches; }

  // La API real no incluye un color de marca por equipo. Se deriva uno
  // ESTABLE a partir del código FIFA (mismo equipo → mismo color siempre),
  // con buena saturación para que funcione como acento tematizable.
  function colorFromString(s){
    var str = String(s || '?'), hash = 0;
    for (var i = 0; i < str.length; i++) { hash = (hash * 31 + str.charCodeAt(i)) | 0; }
    var hue = Math.abs(hash) % 360;
    return hslToHex({ h: hue, s: 0.55, l: 0.42 });
  }

  var currentColor = '#1c5cab';
  function applyTeamTheme(hex){
    currentColor = hex || '#1c5cab';
    var accent = adjustAccent(currentColor, isDark());
    var root = document.documentElement.style;
    root.setProperty('--team-accent', accent);
    root.setProperty('--team-accent-contrast', contrastText(accent));
    root.setProperty('--team-tint', rgba(accent, 0.10));
    root.setProperty('--team-tint-strong', rgba(accent, 0.18));
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

  /* ---------------------- Adaptador: API real → forma interna -------------
   * Esquema real (ver README): teams {id,name_en,name_fa,fifa_code,groups,
   * flag}; stadiums {id,name_en,name_fa,fifa_name,city_en,country_en,
   * capacity}; groups {group,teams:[{team_id,pts,gf,ga}]}; games envuelto
   * {games:[{id,home_team_id,away_team_id,home_score,away_score,group,
   * local_date:'MM/DD/YYYY HH:mm',stadium_id,finished:'TRUE'/'FALSE',
   * type:'group'|'r32'|'r16'|'qf'|'sf'|'third'|'final',
   * home_team_name_en,away_team_name_en,home_team_label,away_team_label}]}.
   * ------------------------------------------------------------------------*/

  // Algunas respuestas pueden llegar como array plano o envueltas en un
  // objeto (p. ej. {teams:[...]} o {data:[...]}) según la implementación
  // exacta del servidor. Se admite cualquiera de las dos formas.
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
      store.groupByLetter[g.group] = rows;
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
    return '<span aria-hidden="true">🏆</span>';
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
    },
    showModal: function(){ $('session-modal').hidden=false; $('btn-reauth').focus(); },
    hideModal: function(){ $('session-modal').hidden=true; }
  };

  /* ---------------------- Skeleton genérico ------------------------------- */
  function skeletonCards(n, cls){
    var out=''; for(var i=0;i<(n||4);i++){ out+='<div class="skeleton '+(cls||'skeleton--tile')+'"></div>'; }
    return out;
  }

  App.common = {
    $: $, esc: esc, store: store,
    setTeams: setTeams, setStadiums: setStadiums, setGames: setGames, setGroups: setGroups,
    teamName: teamName, teamFlagHtml: teamFlagHtml, teamRecord: teamRecord,
    applyTeamTheme: applyTeamTheme, contrastText: contrastText,
    fmtDate: fmtDate, fmtDateLong: fmtDateLong,
    ui: ui, skeletonCards: skeletonCards,
    // Reaplica el tema al cambiar el esquema claro/oscuro del sistema.
    watchScheme: function(){
      if(!window.matchMedia){return;}
      var mq=window.matchMedia('(prefers-color-scheme: dark)');
      var f=function(){ applyTeamTheme(currentColor); };
      if(mq.addEventListener){mq.addEventListener('change',f);} else if(mq.addListener){mq.addListener(f);}
    }
  };

})(window.App = window.App || {});
