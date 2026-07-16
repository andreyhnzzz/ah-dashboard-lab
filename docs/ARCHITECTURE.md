# Arquitectura y decisiones de diseño

Este documento reúne el razonamiento que antes vivía en comentarios largos
dentro del código. El código en sí quedó con comentarios cortos (1-2 líneas)
que apuntan acá cuando hace falta contexto adicional. Léelo si vas a tocar
algo y no entendés el "por qué" de una decisión.

## Índice

- [Capas de autenticación](#capas-de-autenticación)
- [api.js — resiliencia](#apijs--resiliencia)
- [server.js — proxy](#serverjs--proxy)
- [common.js — adaptador de datos](#commonjs--adaptador-de-datos)
- [Diseño visual — Mundial 2026](#diseño-visual--mundial-2026)
- [Tipografía](#tipografía)
- [Otras decisiones](#otras-decisiones)

## Capas de autenticación

Hay **dos capas independientes**, ambas obligatorias antes de ver un solo dato:

1. **Login local** (`local-new` / `local-unlock`, `js/view-login.js`) — usuario
   y contraseña elegidos por la persona, para proteger el dashboard en este
   navegador. La contraseña se guarda como hash SHA-256 (`user:pass` en
   minúsculas) en `localStorage`; el "desbloqueo" activo vive en
   `sessionStorage` (sobrevive a un F5, se cierra solo al cerrar la pestaña).
   Es una protección de acceso local, no un sistema de cuentas con servidor —
   cualquiera con acceso a las devtools de ese navegador puede leer el hash.
2. **Identidad de dispositivo** (`new` / `returning` / `expired`, mismo
   archivo) — contra la API real del Mundial 2026. No hay credenciales de
   curso hardcodeadas: cada navegador se registra una vez (`POST
   /auth/register`) con un correo/clave generados localmente y los reutiliza
   (`POST /auth/authenticate`). El token real dura 84 días.

El flujo (`js/app.js` → `bootstrap()` / `ensureDeviceAuth()` / `logout()`)
encadena ambas: sin desbloqueo local no se intenta el login de dispositivo, y
sin token de dispositivo no se pide un solo `/get/*`.

**Cerrar sesión** (`btn-logout`) limpia token + desbloqueo local + vacía el
store en memoria (`App.common.resetStore()`), y vuelve a `local-unlock` (no
`local-new`: el usuario/contraseña locales quedan guardados para la próxima).

**Errores de sesión (401)** cierran ambas capas automáticamente
(`hooks.onAuthExpired` en `app.js`) y encadenan `local-unlock` → `expired`,
sin `location.reload()` y sin perder la vista actual ni el equipo favorito.

## api.js — resiliencia

Cumple la arquitectura base de resiliencia del enunciado (sección 1.5):

1. JWT en cada `/get/*` vía `Authorization: Bearer`.
2. `async/await` exclusivo — nunca `.then()/.catch()`.
3. `401` → limpia token, avisa a la UI (ver arriba), sin `location.reload()`.
4. Backoff exponencial (1s, 2s, 4s, 8s) para `429`/`5xx`; en `429`, countdown
   visible en pantalla.
5. Offline: cachea la última respuesta OK y la sirve marcada `stale: true`.

`postWithRetry` aplica la misma lógica de reintento a `/auth/register` y
`/auth/authenticate`: el login no debe fallar al primer tropiezo transitorio.

Prohibiciones respetadas en todo el archivo: sin `alert()`, sin
`.then()/.catch()`, sin `location.reload()`.

## server.js — proxy

`npm start` levanta un servidor Node **sin dependencias externas** que hace
dos cosas: sirve los estáticos del proyecto, y reenvía `/auth/*` y `/get/*` a
`https://worldcup26.ir` **del lado del servidor**.

**¿Por qué el proxy?** La API oficial no envía el header
`Access-Control-Allow-Origin` en `/auth/register` ni `/auth/authenticate` (sí
lo hace en `/get/*`), así que el navegador bloquea el login por política CORS
desde cualquier origen que no sea el propio del proveedor. Confirmado
comparando `curl -X OPTIONS` (que ignora CORS) contra el comportamiento real
del navegador — ver `docs/LOGIN.md` para la evidencia completa. CORS es una
regla que aplican **solo** los navegadores: una petición servidor→servidor no
está sujeta a ella. Al pasar el login por este proxy, el navegador habla en
el mismo origen (`localhost`) y el servidor reenvía a la API real — el login
funciona de verdad, con datos en vivo.

Si se sirve el proyecto con otro servidor estático (sin este proxy) o con
`file://`, `/auth/*` no existe y la app cae sola a datos locales de
demostración (mismo dataset que "Modo demo" — ver `js/view-login.js`).

## common.js — adaptador de datos

Único punto que conoce la forma real de la API del Mundial 2026 y la traduce
a una forma interna simple. Esquema real (API `worldcup26.ir`):

- `teams`: `{id, name_en, name_fa, fifa_code, groups, flag}`
- `stadiums`: `{id, name_en, name_fa, fifa_name, city_en, country_en, capacity}`
- `groups`: `{name, teams:[{team_id, pts, gf, ga}]}` — el nombre del grupo va
  en `name`, **no** en `group` (bug real que se dio en este proyecto: el
  adaptador leía `g.group`, que siempre era `undefined`, rompiendo la tabla
  de posiciones para todos los grupos).
- `games` (envuelto en `{games:[...]}`):
  `{id, home_team_id, away_team_id, home_score, away_score, group,
  local_date:'MM/DD/YYYY HH:mm', stadium_id, finished:'TRUE'/'FALSE',
  type:'group'|'r32'|'r16'|'qf'|'sf'|'third'|'final', home_team_label,
  away_team_label}`.

El mock (`js/mock-data.js`) entrega datos con este mismo esquema real, así
que hay un solo adaptador — no dos formatos paralelos.

`App.common.resetStore()` vacía el store en memoria (llamado desde
`logout()`): tras cerrar sesión no debe quedar ni un dato cargado detrás de
la pantalla de login, aunque esté visualmente oculta.

## Diseño visual — Mundial 2026

Basado en la guía de identidad oficial adjunta al proyecto (emblema,
wordmark, paleta de color, patrones "Amplify"/"Unify").

- **Paleta oficial** (`css/tokens.css`, `--wc-*`): franja cálida
  (rojo/magenta) → franja fría (violeta/azul/verde azulado), usada para el
  "brand" fijo del shell (logo, login, subrayados). El acento **por equipo**
  (`--team-accent`) es independiente y se repinta en runtime vía JS
  (`applyTeamTheme`) según el equipo favorito — requisito de tematización
  dinámica del Dashboard del Fanático.
- **Color por grupo** (`--grp-a`…`--grp-l`): 12 tonos fijos, uno por grupo
  A–L, usados en la Matriz de Enfrentamientos y en el estado de cada
  scorecard, para que cada grupo tenga identidad visual propia.
- **Patrón "Amplify"** (`assets/pattern-amplify.svg`): la silueta real del
  "26" del emblema oficial (extraída de la fuente de logotipo), repetida y
  amplificada en bandas concéntricas con la paleta oficial. Se usa en la
  transición entre vistas (`.wc-wipe`, `js/app.js` → `playWipe`): el patrón
  emerge con zoom desde el emblema (el origen de la "explosión"), y también
  como destello en la aparición de cada scorecard.
- **Patrón "Unify"**: bloques geométricos grandes y planos de la paleta,
  usados como filigrana de fondo en el hero de Resumen y el hero del
  Fanático.
- **Scorecard** (`js/common.js` → `scorecardBar`, `css/components.css`):
  tarjeta de partido tipo "lower third" de transmisión deportiva. Extremos
  con el color de marca de cada equipo (derivado de forma estable del código
  FIFA — la API real no trae color de equipo). Cápsula central negra con el
  emblema oficial en medio (reemplaza el separador "–"), flanqueado por los
  dos scores; la copa aparece como origen de la animación de entrada y
  cruza-funde al emblema. Sub-panel colgando debajo con el estado
  (grupo/fecha o resultado).
- **Emojis**: reemplazados en toda la app por un sprite SVG propio
  (`index.html` → `.icon-sprite`), trazo 1.75 unificado.

## Tipografía

- **Display** (`--font-display`): `FWC2026 UltraCondensed`, el "Event
  Typeface" oficial (condensado, alto). Solo para texto **grande** (titulares,
  nombres/códigos de equipo, letras de grupo) — la propia guía de marca
  advierte que no es apta para texto pequeño.
- **Cuerpo y números** (`--font-sans`): `Noto Sans`, la tipografía de soporte
  oficial. Todo el texto pequeño de interfaz (botones, tags, nav) y los
  **números** de marcador/posiciones/KPIs van en Noto Sans Bold — así lo
  marca la guía oficial.
- **Logo** (`--font-logo`): `FIFA 26`, usada únicamente para el slogan "WE
  ARE 26" — no es apta para texto corrido.
- Las tres se autoalojan como `.woff2` (`css/fonts.css`) para funcionar sin
  conexión y sin CDN. `css/typography.css` se carga **al final** del cascade
  a propósito: varios componentes usan `font: inherit` (`.btn`, `.group-tab`,
  `.venue`…), que reinicia la familia tipográfica; declararla ahí, más tarde
  y con igual especificidad, garantiza que gane.
- **Licencias**: `FWC2026 UltraCondensed` y `FIFA 26` (logo) son recreaciones
  de la comunidad de uso **personal / no comercial** (no OFL, no
  redistribuibles) — se usan aquí solo por tratarse de un proyecto académico
  sin fines de lucro (ISW-521). `Noto Sans` es SIL OFL 1.1. Ver
  `assets/fonts/` para el detalle de cada licencia.

## Otras decisiones

- **Sin `parseInt()` en ids de equipo**: la API real usa ids como string
  (`"1".."48"`); parsearlos a número rompe el lookup en `teamById`.
- **`App.storage`** encapsula todo acceso a `localStorage`/`sessionStorage`
  detrás de una API pequeña, con manejo defensivo (modo privado, cuota
  llena, JSON corrupto).
- **Reto de resiliencia 2.4** (Dashboard del Fanático sobrevive a F5): la
  última vista visitada se guarda en `localStorage` (`wc26.lastView`) y se
  restaura en `bootstrap()`, con datos cacheados si hace falta.
- **Modo demo** (`USE_MOCK`, barra superior): permite forzar `401`/`429`/
  `500`/fallo de red en vivo, sin depender de la disponibilidad ni del límite
  de tasa (120 req/min) de la API pública, para la defensa técnica.
