# Mundial 2026 · Dashboard Integral — ISW-521, Proyecto Final Categoría B

Aplicación web interactiva (JavaScript **sin frameworks**) que reúne en un solo
panel los **cinco apartados** del catálogo de la Categoría B, consumiendo la API
REST pública del Mundial 2026 (`worldcup26.ir`) sobre una arquitectura común de
resiliencia.

## Los cinco apartados (todos incluidos)

1. **Tour Virtual de Sedes** (2.1) — 16 sedes clicables; al elegir una,
   `scrollIntoView({behavior:'smooth'})` lleva a sus partidos (filtrados por
   `stadium_id`) con estado activo. Si `/games` falla, las sedes siguen
   clicables y el detalle muestra un mensaje local.
2. **Agenda Simultánea** (2.2) — agrupa por `local_date`, detecta días con 2+
   partidos y los muestra en columnas paralelas; navegación fecha anterior /
   siguiente; esqueletos mientras carga.
3. **Timeline Infinito** (2.3) — pide los **104 partidos** en una sola llamada,
   los ordena cronológicamente e inserta bloques de 10 con `IntersectionObserver`
   sobre un centinela, sin duplicar. Si la carga falla, botón de reintento
   manual que dispara el backoff.
4. **Dashboard del Fanático** (2.4) — selector de equipo favorito (global, en la
   barra superior) persistido en `localStorage`; **tematización dinámica** de las
   variables CSS según el equipo; posición de grupo, pts/GF/GC y calendario.
5. **Matriz de Enfrentamientos** (2.5) — por grupo, cuadrícula 4×4 cruzando
   groups + teams + games; celda con resultado o "Pendiente"; diagonal
   deshabilitada. Si `/games` falla, la matriz se dibuja completa en "Pendiente"
   y, al recuperar, se actualizan **solo las celdas afectadas** (sin rebuild).

## Sistema de login (`js/view-login.js`)

Antes de mostrar cualquier dato la app pasa por una **pantalla de login real**
(no solo un botón "reautenticarme" perdido en un modal) — tarjeta centrada
sobre fondo cálido, un único campo, un único botón de acento, sin ruido:
inspirada a propósito en el login minimalista de **claude.ai**. Es la ÚNICA
puerta hacia un token válido y **la misma pantalla resuelve los tres momentos
de la sesión**:

| Modo | Cuándo aparece | Qué pide |
|---|---|---|
| `new` | Primera vez en este navegador (no hay identidad de dispositivo guardada) | Un nombre para mostrar → `POST /auth/register` |
| `returning` | Ya existe una identidad guardada pero no hay token vigente (p. ej. se cerró el navegador) | Un clic en "Continuar" → `POST /auth/authenticate` |
| `expired` | Un **401** — real o **simulado desde "Modo demo"** — invalidó el token a mitad de sesión | Un clic en "Reautenticarme" → `POST /auth/authenticate` |

Esto es justamente el reto de resiliencia de la sección 1.5: el 401 limpia el
token y **exige volver a loguear antes de seguir**, sin `location.reload()` y
sin perder la vista activa ni el equipo favorito — `hooks.onAuthExpired` en
`js/api.js` llama a `App.auth.show('expired', …)` y, apenas el usuario vuelve
a autenticarse, retoma exactamente donde se había quedado. Podés reproducirlo
en cualquier momento con **Modo demo → Simular respuesta → `401 · Sesión
expirada`** y luego "Recargar datos": la pantalla de login vuelve a aparecer
sobre el resto de la app (con `aria-hidden` en el shell, como cualquier
diálogo modal accesible).

Sin errores/`alert()`: si el registro o el login fallan (por ejemplo, sin
conexión), el mensaje aparece **dentro de la misma tarjeta** con un botón para
reintentar, nunca como un `alert()` del navegador.

## Cómo ejecutarla

Abre por **doble clic** en `index.html` (scripts clásicos, sin `type="module"`;
funciona bajo `file://`). Para consumir la **API real** conviene servirla por
HTTP para evitar CORS:

```bash
python3 -m http.server 8099   # → http://localhost:8099/index.html
```

**Arranca consumiendo la API real** del Mundial 2026 (`https://worldcup26.ir`,
`USE_MOCK:false` en `js/config.js`) — los datos que ves (equipos, sedes,
grupos, calendario) son los reales de la API pública, no inventados ni
quemados en el código. Solo para trabajar sin conexión o para reproducir en
vivo los casos 401/429/500/offline durante la defensa técnica conviene
activar "Datos locales (mock)" en el panel **Modo demo** de la barra
superior — ver más abajo.

### Autenticación contra la API real

La API pública no entrega credenciales de curso: exige JWT en cada `/get/*`.
La app resuelve esto registrando **una identidad de dispositivo** la primera
vez que corre en un navegador:

1. **Pantalla de login** (`js/view-login.js → App.auth`, ver sección arriba):
   el usuario ve la tarjeta antes que cualquier dato, escribe un nombre y
   confirma → `POST /auth/register` (`js/api.js → registerDevice()`), con el
   email/contraseña generados localmente y guardados después en
   `localStorage` (nunca se muestran completos en la UI ni se envían a nadie
   más).
2. En cada visita siguiente, la misma pantalla (modo `returning`) dispara
   `POST /auth/authenticate` reutilizando esas credenciales (`loginDevice()`)
   — el token real dura 84 días según la documentación de la API, así que no
   hace falta re-registrarse cada vez.
3. Cada `/get/*` viaja con `Authorization: Bearer <token>`. Un 401 limpia el
   token y vuelve a mostrar la pantalla de login (modo `expired`), sin
   `location.reload()` y retomando la carga apenas se reautentica.

### Límite de esta entrega: no se pudo probar en vivo contra `worldcup26.ir`

El entorno donde se construyó y verificó este proyecto **no tiene salida de
red hacia `worldcup26.ir`** (ni por `curl`, ni por `fetch` en un navegador
headless, ni por un navegador con extensión conectada) — cualquier intento
devuelve un fallo de conexión a nivel de red, no un error de la aplicación.
Por eso:

- Los endpoints, el formato de las respuestas y el flujo de auth se
  implementaron **contra la documentación oficial** del backend (repositorio
  del autor de la API, sección "API Reference" del README), no contra
  capturas propias de tráfico real.
- El dataset de `js/mock-data.js` se regeneró para **espejar exactamente**
  esa misma forma de la API real (ids como string, `finished:'TRUE'/'FALSE'`,
  fechas `MM/DD/YYYY`, `games` envuelto en `{games:[...]}`, etc.), de modo que
  el **mismo adaptador** en `common.js` sirve a ambos orígenes — no hay dos
  rutas de código distintas para "real" y "mock".
- Se verificó con Playwright (Chromium headless) que: (a) al cargar con
  `USE_MOCK:false` la app efectivamente intenta `fetch` contra
  `https://worldcup26.ir` (confirmado por los intentos de red en la consola),
  y (b) con `USE_MOCK:true` las 6 vistas navegan sin errores, el favorito y
  las banderas (`<img>`, ya no texto/emoji) se renderizan correctamente con
  ids de tipo string, usando el mismo código que consumiría la API real.
- **Recomendación**: antes de entregar/defender, abrí la app en un navegador
  con acceso real a internet (con `USE_MOCK` desmarcado, que es el estado por
  defecto) y confirmá en la pestaña *Network* que `/auth/register` (o
  `/auth/authenticate`) y los cuatro `/get/*` devuelven `200` con datos
  reales. Si la API cambiara algún nombre de campo respecto a la
  documentación consultada, el único lugar a ajustar es el adaptador en
  `js/common.js` (`adaptTeam`, `adaptStadium`, `adaptGame`, `setGroups`).

## Estructura

```
mundial2026-dashboard/
├── index.html                 Shell: gate de login + sidebar + topbar + contenedor de vistas
├── css/  tokens · layout · components · views · auth (pantalla de login)
└── js/
    ├── config.js              Configuración central (endpoints, backoff, claves)
    ├── mock-data.js           Dataset local (48 equipos, 16 sedes, 104 partidos) + simulador
    ├── storage.js             localStorage: token, identidad de dispositivo, favorito, caché offline
    ├── api.js                 Capa de red: Fetch + JWT + resiliencia (núcleo)
    ├── common.js              Helpers, store normalizado, tematización, banners
    ├── view-login.js          Pantalla de login / re-login (App.auth) — new / returning / expired
    ├── view-inicio.js         Resumen
    ├── view-sedes.js          Apartado 2.1
    ├── view-agenda.js         Apartado 2.2
    ├── view-timeline.js       Apartado 2.3
    ├── view-fanatico.js       Apartado 2.4
    ├── view-matriz.js         Apartado 2.5
    └── app.js                 Router + carga de datos + eventos globales
```

Cada vista lee del **store compartido**; la navegación no vuelve a pedir datos.
La lógica de **fetch (api.js) está separada de la presentación** (vistas).

## Arquitectura de resiliencia (sección 1.5 — aplica a todos los apartados)

1. **JWT** en cada petición (`Authorization: Bearer <token>`).
2. **`async/await` exclusivo** — sin `.then()` ni `.catch()` en el código.
3. **401** → limpia token y vuelve a mostrar la pantalla de login (modo
   "expired") para reautenticar, **sin `window.location.reload()`**.
4. **Backoff exponencial (429/500)** 1s, 2s, 4s, 8s; el 429 muestra un
   **countdown visible**.
5. **Modo offline** con `localStorage`: si una petición falla y hay caché, se
   muestran esos datos con aviso "datos no actualizados".

Prohibiciones respetadas: sin `alert()`, sin `.then()/.catch()`, sin `reload()`.

## Modo demo (defensa técnica)

En la barra superior, *Modo demo* permite activar "Datos locales (mock)"
—desactivado por defecto, ya que por defecto se usa la API real— y forzar
respuestas para reproducir en vivo en DevTools: `401`, `429` (con countdown),
`500`, `500 ×2` (se recupera con backoff) y fallo de red (offline con datos
cacheados). La consola registra el flujo `[resiliencia] …` y la pestaña
Network muestra los reintentos.

Un segundo selector, **"Endpoint afectado"**, acota el fallo a un solo recurso
(`/get/games` por defecto). Esto importa porque 4 de los 5 retos de resiliencia
del enunciado asumen que **solo `/get/games` falla** mientras equipos, sedes y
grupos responden con normalidad (p. ej. "si `/get/games` falla, los botones de
sedes siguen clicables" presupone que `/get/stadiums` sí cargó). Para
reproducir el reto de cada apartado tal como lo describe el enunciado, dejá el
endpoint afectado en "Solo /get/games" (valor por defecto) y elegí el status a
simular.

## Sobre "frameworks de CSS permitidos"

El enunciado permite frameworks de CSS. Se optó por un **sistema de diseño propio
con design tokens** (variables CSS) en lugar de un framework externo: evita una
dependencia por CDN (que rompería el modo offline / doble-clic), reduce el peso y
hace el código más fácil de explicar en la defensa. Todo el sistema se ajusta
desde `css/tokens.css`.

## Accesibilidad

Landmarks semánticos, navegación por teclado con foco visible, `aria-live` en
banners y regiones dinámicas, pantalla de login con `role="dialog"` +
`aria-modal` + `aria-hidden` en el resto del shell mientras está abierta,
estado activo con `aria-pressed` / `aria-current`, contraste AA, modo claro/oscuro
y respeto por `prefers-reduced-motion`.
