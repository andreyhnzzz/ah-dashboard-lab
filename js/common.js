/* ============================================================================
 * common.js — Utilidades compartidas y estado en memoria
 * ----------------------------------------------------------------------------
 * Todas las vistas (sedes, agenda, timeline, fanático, matriz) leen los datos
 * desde `App.common.store` y usan estos helpers. Aquí viven: escape de HTML,
 * cálculo de contraste/tema del equipo, banners de estado, modal 401 y el
 * índice de datos normalizados construido una sola vez tras la carga.
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

  /* ---------------------- Fecha legible ----------------------------------- */
  var MONTHS = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
  var WEEKDAYS = ['dom','lun','mar','mié','jue','vie','sáb'];
  function fmtDate(iso){
    var p=String(iso).split('-'); if(p.length!==3){return iso;}
    return parseInt(p[2],10)+' '+MONTHS[parseInt(p[1],10)-1];
  }
  function fmtDateLong(iso){
    var p=String(iso).split('-'); if(p.length!==3){return iso;}
    // Día de la semana sin depender de zona horaria (UTC).
    var d=new Date(Date.UTC(+p[0],+p[1]-1,+p[2]));
    return WEEKDAYS[d.getUTCDay()]+' '+parseInt(p[2],10)+' '+MONTHS[+p[1]-1]+' '+p[0];
  }

  /* ---------------------- Store de datos normalizados --------------------- */
  var store = {
    teams: [], teamById: {}, teamsSorted: [],
    stadiums: [], stadiumById: {},
    games: [], gamesByStadium: {}, gamesByDate: {}, matchesByTeam: {},
    groups: [], groupByLetter: {},
    ready: { teams:false, games:false, groups:false, stadiums:false }
  };

  function setTeams(teams){
    store.teams = teams; store.teamById = {};
    teams.forEach(function(t){ store.teamById[t.id]=t; });
    store.teamsSorted = teams.slice().sort(function(a,b){ return a.name.localeCompare(b.name,'es'); });
    store.ready.teams = true;
  }
  function setStadiums(list){
    store.stadiums = list; store.stadiumById = {};
    list.forEach(function(s){ store.stadiumById[s.id]=s; });
    store.ready.stadiums = true;
  }
  function setGames(games){
    store.games = games;
    store.gamesByStadium = {}; store.gamesByDate = {}; store.matchesByTeam = {};
    games.forEach(function(m){
      (store.gamesByStadium[m.stadium_id]=store.gamesByStadium[m.stadium_id]||[]).push(m);
      (store.gamesByDate[m.local_date]=store.gamesByDate[m.local_date]||[]).push(m);
      [m.home_team, m.away_team].forEach(function(tid){
        if(tid!=null){ (store.matchesByTeam[tid]=store.matchesByTeam[tid]||[]).push(m); }
      });
    });
    store.ready.games = true;
  }
  function setGroups(groups){
    store.groups = groups; store.groupByLetter = {};
    groups.forEach(function(g){ store.groupByLetter[g.group]=g.standings; });
    store.ready.groups = true;
  }
  function teamName(id){ var t=store.teamById[id]; return t?t.name:'Por definir'; }
  function teamFlag(id){ var t=store.teamById[id]; return t?t.flag:'🏆'; }

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
    teamName: teamName, teamFlag: teamFlag,
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
