# Guía de login — cómo funciona en este entorno

El acceso tiene **dos capas**, ambas obligatorias antes de ver un solo dato
(detalle completo en [ARCHITECTURE.md](ARCHITECTURE.md)):

1. **Login local**: usuario y contraseña que vos elegís, para proteger el
   dashboard en este navegador (hash SHA-256 en `localStorage`, sin servidor
   de por medio).
2. **Identidad de dispositivo**: cada navegador se registra a sí mismo una
   única vez ante la API real (`worldcup26.ir`) con una identidad generada
   localmente, y la reutiliza en cada visita. No hay ningún dato personal
   real involucrado — es una identidad de dispositivo, no de persona.

Esta sección se enfoca en la capa 2 (la que depende de la API real).

## TL;DR — para que el login funcione, usá `npm start`

```bash
npm start        # → http://localhost:8099
```

`npm start` levanta [`server.js`](../server.js), un servidor Node (sin
dependencias) que **reenvía `/auth/*` y `/get/*` a `worldcup26.ir` del lado
servidor**. Eso esquiva el bloqueo CORS explicado abajo y hace que el login
funcione con **datos reales y en vivo**. Con cualquier otro servidor estático
la app arranca igual, pero cae a datos locales de demostración.

## ⚠️ Causa confirmada: CORS del proveedor bloquea el login en TODO navegador

`worldcup26.ir` **no envía el header `Access-Control-Allow-Origin` en
`/auth/register` ni en `/auth/authenticate`** (sí lo hace, con `*`, en todos
los `/get/*`). Comparación directa:

```bash
# Preflight real de /auth/register — SIN Access-Control-Allow-Origin:
curl -sD - -o /dev/null -X OPTIONS https://worldcup26.ir/auth/register \
  -H "Origin: http://localhost:8099" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: content-type"
# → Access-Control-Allow-Methods, Access-Control-Allow-Headers... pero NO
#   Access-Control-Allow-Origin.

# GET, en cambio, sí lo trae:
curl -sI https://worldcup26.ir/get/teams | grep -i access-control
# → Access-Control-Allow-Origin: *
```

**Consecuencia**: cualquier navegador real, desde cualquier origen que no sea
el propio del proveedor (probablemente su frontend oficial), bloquea el login
por política CORS con exactamente este error en la consola:

```
Access to fetch at 'https://worldcup26.ir/auth/register' from origin
'http://localhost:8099' has been blocked by CORS policy: Response to
preflight request doesn't pass access control check: No
'Access-Control-Allow-Origin' header is present on the requested resource.
```

Esto **no es un bug de este proyecto ni de tu conexión** — es una
configuración del servidor de la API que no se puede arreglar desde el
cliente (`fetch()` no tiene forma de saltarse CORS, por diseño de seguridad
del navegador). `curl` no lo muestra porque CORS es una política que solo
aplican los navegadores, nunca herramientas de línea de comandos.

**Por eso la app nunca se queda bloqueada**: si el intento contra la API real
falla (por este CORS o por cualquier otra razón de red), el login cae solo a
**modo local** (mismo dataset que "Modo demo") después de agotar los
reintentos, con un aviso visible pero sin interrumpir el acceso al dashboard
— ver `js/view-login.js` → `handleSubmit`.

## No la abras con doble clic (`file://`)

Abrir `index.html` directamente desde el explorador (`file:///...`) suma
restricciones extra de `fetch()` en varios navegadores. Servila siempre desde
`http://localhost`. La forma recomendada es `npm start` (arriba), que además
resuelve el CORS. Otros servidores estáticos (`npx http-server`, etc.)
sirven la página pero **no** el login real: la app caerá a datos locales.

## Los tres estados de la pantalla

La misma tarjeta cambia de contenido según el momento de la sesión (ver
`js/view-login.js` → `App.auth`):

| Estado | Cuándo aparece | Qué dispara |
|---|---|---|
| `new` | Primera vez en este navegador (no hay identidad guardada) | `POST /auth/register` con nombre a elección |
| `returning` | Ya existe identidad guardada, pero no hay token válido (p. ej. tras cerrar y volver a abrir) | `POST /auth/authenticate` con el correo/clave guardados |
| `expired` | Un `401` real (o simulado desde "Modo demo") invalidó el token en curso | El mismo `POST /auth/authenticate`, sin perder la vista activa ni el equipo favorito |

## Qué se guarda en `localStorage`

| Clave | Contenido |
|---|---|
| `wc26.jwt` | Token JWT vigente (84 días según la API) |
| `wc26.deviceEmail` / `wc26.devicePassword` | Identidad de dispositivo generada, para reautenticar sin volver a registrar |
| `wc26.favoriteTeam` | Equipo favorito elegido, sobrevive a un refresco completo |
| `wc26.lastView` | Última vista visitada, para restaurarla tras F5 |
| `wc26.cache.<endpoint>` | Última respuesta buena de cada endpoint, para el modo offline |

## Reintentos automáticos

Si la API responde `429` (límite de tasa) o `5xx` durante el login, la
tarjeta reintenta sola con backoff exponencial (1 s, 2 s, 4 s, 8 s) y muestra
el progreso ("Reintentando… intento 2"), igual que el resto de los endpoints
de la app. Un bloqueo CORS (ver arriba) también dispara estos reintentos —
fallan los 5 por igual, ya que CORS es determinístico y no se resuelve solo—,
y recién ahí la app cae a modo local en vez de mostrar un error definitivo.

## Probar los distintos casos sin depender de la API real

En **Modo demo** (barra superior) → activar **"Datos locales"** para dejar de
llamar a la API real y poder forzar cualquier respuesta desde el selector
**"Simular respuesta"**:

- `401 · Sesión expirada` → dispara el estado `expired` sin tocar el backend.
- `429 · Límite de tasa` → muestra el countdown de reintento.
- `500` / `500 ×2 y se recupera` → prueba el backoff exponencial.
- `Fallo de red` → simula estar offline.

Esto permite ensayar el flujo completo de login/resiliencia sin depender de
la disponibilidad ni del límite de tasa (120 req/min) de la API pública.

## Reset manual

Para forzar la pantalla de "primera vez" (`new`) durante pruebas, basta con
borrar el `localStorage` del sitio (DevTools → Application → Local Storage
→ clic derecho → Clear) y recargar.
