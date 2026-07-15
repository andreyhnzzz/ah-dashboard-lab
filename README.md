<div align="center">
  <img src="assets/emblem.png" width="110" alt="FIFA World Cup 26">

  # Mundial 2026 · Dashboard Integral
  ### Laboratorio 2 · ISW-521 · Categoría B

  Dashboard en **JavaScript Vanilla** para explorar sedes, agenda, calendario, favoritos y resultados del Mundial 2026, consumiendo la API oficial en vivo con una capa de resiliencia (JWT, backoff, offline).

  [![Repo](https://img.shields.io/badge/GitHub-ah--dashboard--lab-181717?style=for-the-badge&logo=github)](https://github.com/andreyhnzzz/ah-dashboard-lab)
  [![API](https://img.shields.io/badge/API-worldcup26.ir-1f3fa6?style=for-the-badge&logo=json&logoColor=white)](https://worldcup26.ir)
  [![No frameworks](https://img.shields.io/badge/JavaScript-Vanilla-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)](js/app.js)
  [![License](https://img.shields.io/badge/License-MIT-34b06a?style=for-the-badge)](LICENSE)

</div>

> Proyecto académico sin fines de lucro (ISW-521). El código es MIT; "FIFA World Cup 26" y su identidad visual son marca de la FIFA, usada solo con fines educativos — ver [LICENSE](LICENSE).

## Índice

[Vistas](#vistas) · [Resiliencia](#resiliencia--sesión) · [Guía de login](docs/LOGIN.md) · [Stack](#stack) · [Arquitectura](#arquitectura) · [Cómo ejecutarlo](#cómo-ejecutarlo)

## Vistas

| | |
|---|---|
| **[Tour de Sedes](js/view-sedes.js)**<br>Las 16 sedes oficiales; clic para saltar a sus partidos. | **[Agenda Simultánea](js/view-agenda.js)**<br>Días con varios partidos en columnas paralelas. |
| **[Timeline Infinito](js/view-timeline.js)**<br>Los 104 partidos, cargados de a 10 con scroll infinito. | **[Dashboard del Fanático](js/view-fanatico.js)**<br>Equipo favorito con tema de color dinámico. |
| **[Matriz de Enfrentamientos](js/view-matriz.js)**<br>Cuadrícula de resultados por grupo, coloreada por grupo. | **[Login de dispositivo](js/view-login.js)**<br>Sesión JWT persistente, sin credenciales de curso. |

## Resiliencia · sesión

- **JWT real**: cada visita registra o reautentica un dispositivo contra `worldcup26.ir` — sin claves hardcodeadas.
- **Backoff exponencial** ante `429`/`5xx`, con countdown visible.
- **Caché offline**: última respuesta buena se sirve marcada como "no actualizada" si la red falla.
- **401 → re-login** en la misma pantalla, sin perder la vista ni el equipo favorito.

Guía completa del login (estados, claves de `localStorage`, cómo probar 401/429/500 y el error más común al abrir el proyecto): **[docs/LOGIN.md](docs/LOGIN.md)**.

## Stack

| Tecnología | Uso |
|---|---|
| [JavaScript](js/app.js) | Router, estado y lógica de negocio (sin frameworks) |
| [CSS](css/tokens.css) | Design tokens, temas y paleta oficial del Mundial |
| JWT + Fetch | Autenticación y consumo de la [API del Mundial 2026](https://worldcup26.ir) |
| LocalStorage | Caché, favorito y sesión de dispositivo |
| IntersectionObserver | Scroll infinito del calendario |

## Arquitectura

```mermaid
flowchart TD
  U[Usuario] --> V[Views · js/view-*.js]
  V --> S[Common Store · js/common.js]
  S --> A[API Layer · js/api.js<br/>JWT + backoff + caché]
  A --> W[(API worldcup26.ir)]
```

## Cómo ejecutarlo

```bash
npx http-server . -p 8099    # o cualquier servidor estático
```

Abrir `http://localhost:8099` — el primer ingreso registra una identidad de dispositivo local y ya se puede navegar con datos reales del torneo.

---

<div align="center">

Proyecto Final ISW-521 · Categoría B · Interfaces Interactivas y DOM Avanzado

</div>
