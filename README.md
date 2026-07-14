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

## Cómo ejecutarla

Abre por **doble clic** en `index.html` (scripts clásicos, sin `type="module"`;
funciona bajo `file://`). Para consumir la **API real** conviene servirla por
HTTP para evitar CORS:

```bash
python3 -m http.server 8099   # → http://localhost:8099/index.html
```

Arranca en **modo mock** (dataset local). Para la API real, desmarcá "Datos
locales (mock)" en *Modo demo* o poné `USE_MOCK:false` en `js/config.js`.

## Estructura

```
mundial2026-dashboard/
├── index.html                 Shell: sidebar + topbar + contenedor de vistas
├── css/  tokens · layout · components · views
└── js/
    ├── config.js              Configuración central (endpoints, backoff, claves)
    ├── mock-data.js           Dataset local (48 equipos, 16 sedes, 104 partidos) + simulador
    ├── storage.js             localStorage: token, favorito, caché offline
    ├── api.js                 Capa de red: Fetch + JWT + resiliencia (núcleo)
    ├── common.js              Helpers, store normalizado, tematización, banners
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
3. **401** → limpia token y muestra modal de sesión expirada con reautenticación,
   **sin `window.location.reload()`**.
4. **Backoff exponencial (429/500)** 1s, 2s, 4s, 8s; el 429 muestra un
   **countdown visible**.
5. **Modo offline** con `localStorage`: si una petición falla y hay caché, se
   muestran esos datos con aviso "datos no actualizados".

Prohibiciones respetadas: sin `alert()`, sin `.then()/.catch()`, sin `reload()`.

## Modo demo (defensa técnica)

En la barra superior, *Modo demo* permite forzar respuestas para reproducir en
vivo en DevTools: `401`, `429` (con countdown), `500`, `500 ×2` (se recupera con
backoff) y fallo de red (offline con datos cacheados). La consola registra el
flujo `[resiliencia] …` y la pestaña Network muestra los reintentos con la API
real.

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
banners y regiones dinámicas, modal 401 con `role="dialog"` + `aria-modal`,
estado activo con `aria-pressed` / `aria-current`, contraste AA, modo claro/oscuro
y respeto por `prefers-reduced-motion`.
