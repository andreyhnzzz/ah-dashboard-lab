// El pincel del dashboard: matemática de color + pintar el acento del
// equipo en las variables CSS de :root. No sabe nada de equipos ni de la
// API — solo de colores. Se carga ANTES que common.js.
(function (App) {
  'use strict';

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
  // ¿Texto negro o blanco encima de este color? La luminancia decide.
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
  // Le sube el volumen a un color apagado para que funcione como acento,
  // ajustado según si el sistema está en modo claro u oscuro.
  function adjustAccent(hex, isDarkMode){
    var hsl=rgbToHsl(hexToRgb(hex));
    if(hsl.s<0.12){hsl.s=0.12;}
    if(isDarkMode){ if(hsl.l<0.52){hsl.l=0.6;} } else { if(hsl.l>0.6){hsl.l=0.5;} }
    return hslToHex(hsl);
  }
  function rgba(hex, a){ var c=hexToRgb(hex); return 'rgba('+c.r+','+c.g+','+c.b+','+a+')'; }
  function isDark(){ return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches; }

  // La API no manda color de equipo — se lo inventamos con un hash del
  // código FIFA. Mismo equipo, mismo color, siempre (no es al azar).
  function colorFromString(s){
    var str = String(s || '?'), hash = 0;
    for (var i = 0; i < str.length; i++) { hash = (hash * 31 + str.charCodeAt(i)) | 0; }
    var hue = Math.abs(hash) % 360;
    return hslToHex({ h: hue, s: 0.55, l: 0.42 });
  }

  // El único estado de este módulo: el último color puesto, para poder
  // repintar si el sistema cambia de claro a oscuro (o viceversa).
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
  // El sistema cambia de claro a oscuro y el tema se repinta solo, sin pedir permiso.
  function watchScheme(){
    if(!window.matchMedia){return;}
    var mq=window.matchMedia('(prefers-color-scheme: dark)');
    var f=function(){ applyTeamTheme(currentColor); };
    if(mq.addEventListener){mq.addEventListener('change',f);} else if(mq.addListener){mq.addListener(f);}
  }

  App.color = {
    contrastText: contrastText,
    colorFromString: colorFromString,
    rgba: rgba,
    isDark: isDark,
    applyTeamTheme: applyTeamTheme,
    watchScheme: watchScheme
  };

})(window.App = window.App || {});
