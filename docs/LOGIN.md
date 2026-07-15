# Guía de login — cómo funciona en este entorno

El login no usa usuario/contraseña de curso: cada **navegador** se registra a
sí mismo una única vez ante la API real (`worldcup26.ir`) con una identidad
generada localmente, y la reutiliza en cada visita. No hay ningún dato
personal real involucrado — es una identidad de dispositivo, no de persona.

## Requisito: servir la página, no abrirla con doble clic

La causa más común de "no funciona el login" es abrir `index.html`
directamente desde el explorador de archivos (`file:///...`). Varios
navegadores bloquean o restringen `fetch()` hacia `https://` desde el origen
`file://`, y el error que se ve en la tarjeta de login es simplemente *"No se
pudo conectar con la API"*.

Solución: servir la carpeta con cualquier servidor estático antes de abrirla.

```bash
npx http-server . -p 8099
# o
python -m http.server 8099
```

Y abrir `http://localhost:8099`, no el archivo directamente.

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
de la app. Solo se muestra un error definitivo si se agotan los 5 intentos.

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
