# OnBoardPro — Informe de KPIs y avance de sprints

**Corte:** 17 de octubre de 2026, al cierre del sprint 6
**Equipo:** Sergio Angel, Brayan Miranda
**Producto:** plataforma de onboarding corporativo multiempresa (cada organización ve únicamente sus propios datos)

## 1. Resumen

Seis sprints cerrados, 32 de 34 historias entregadas y 103 de los 226 puntos del MVP completados. El equipo sostiene una velocidad de 17 puntos por sprint y un 94% del pronóstico cumplido, con cinco de los seis sprints cerrados al 100%.

## 2. KPIs del proyecto

| Indicador | Valor |
|---|---|
| Sprints cerrados | 6 |
| Avance del MVP | 103 de 226 SP · **46%** |
| Historias entregadas | 32 de 34 comprometidas · 94% |
| Velocidad promedio | 17,2 SP por sprint |
| Alcance total del MVP | 226 SP en 11 sprints |
| Velocidad de los últimos 3 sprints | 19,7 SP por sprint |
| Pronóstico cumplido | 94% (103 de 109 SP) |
| Sprints cerrados al 100% | 5 de 6 · 83% |
| Mejor sprint | Sprint 6 · 29 SP |
| Puntos restantes del MVP | 123 SP en 5 sprints |

La velocidad se usa aquí como herramienta de planeación, no como medida de desempeño del equipo: sirve para pronosticar cuánto cabe en el próximo sprint. Del mismo modo, el Sprint Backlog es un pronóstico y no un compromiso, por eso la columna se llama «pronóstico cumplido».

Las gráficas de este informe salen de la hoja **Métricas por sprint** del archivo `OnBoardPro-Backlog.xlsx`, donde están también en formato editable.

## 3. Avance por sprint

| Sprint | Fechas | Historias | Comprometidos | Completados | % | Acumulado | Bugs |
|---|---|---|---|---|---|---|---|
| 1 | 28/8 – 4/9 | 5 / 5 | 11 | 11 | 100% | 11 | 0 |
| 2 | 4/9 – 11/9 | 3 / 3 | 8 | 8 | 100% | 19 | 1 |
| 3 | 11/9 – 18/9 | 6 / 6 | 25 | 25 | 100% | 44 | 2 |
| 4 | 18/9 – 25/9 | 4 / 4 | 17 | 17 | 100% | 61 | 2 |
| 5 | 25/9 – 2/10 | 5 / 7 | 19 | 13 | 68% | 74 | 3 |
| 6 | 12/10 – 17/10 | 9 / 9 | 29 | 29 | 100% | 103 | 4 |
| **Total** | | **32 / 34** | **109** | **103** | **94%** | | **12** |

![Velocidad por sprint: puntos pronosticados contra completados.](img/g1-velocidad.png)

![Burn-up: avance acumulado contra el alcance total del MVP.](img/g2-burnup.png)

El sprint 5 es el único que no cerró al 100%: seis puntos quedaron sin completar por el bloqueo en el envío de archivos al backend.

## 4. KPIs de calidad

| Indicador | Valor |
|---|---|
| Defectos detectados | 12 |
| Defectos resueltos | 11 · **92%** |
| Defectos mitigados pendientes de cierre | 1 |
| Defectos abiertos | 0 |
| Densidad de defectos | 0,12 por punto entregado |
| Defectos de seguridad | 5 de 12 · 42% |
| Sprint con más defectos | Sprint 6 · 4 |
| Defectos resueltos dentro del mismo sprint | 11 de 12 · 92% |

![Defectos detectados en cada sprint.](img/g3-bugs.png)

Los defectos de seguridad siguen un patrón que vale la pena nombrar, porque se repite: **el código hace lo que se le pidió, pero no comprueba quién tiene derecho a pedirlo.** Los cinco casos fueron de ese tipo y todos están cerrados.

## 5. Bitácora de bugs

| # | Sprint | Defecto | Estado |
|---|---|---|---|
| B-01 | 2 | Los errores de validación se devolvían como 500 «Required» en lugar de 400 indicando el campo. | Resuelto |
| B-02 | 3 | Varios endpoints no filtraban por organización: se podían consultar datos de otra empresa. | Resuelto |
| B-03 | 3 | Rutas de grupos sin verificación de sesión. | Resuelto |
| B-04 | 4 | Un administrador podía cambiar el rol de un superadministrador y el de usuarios de otra organización. | Resuelto |
| B-05 | 4 | CORS rechazaba localhost y bloqueaba el desarrollo del frontend. | Resuelto |
| B-06 | 5 | `PayloadTooLargeError` al subir archivos: el frontend los enviaba en base64 dentro de un JSON. | Resuelto |
| B-07 | 5 | `deliverable: Expected boolean, received string` al crear actividades por multipart. | Resuelto |
| B-08 | 5 | TanStack en una versión con vulnerabilidad conocida. | **Mitigado**, falta bajar versión |
| B-09 | 6 | Un examen devolvía las respuestas correctas al aprendiz que lo iba a rendir. | Resuelto |
| B-10 | 6 | El XP se acreditaba al subir la entrega y no al aprobarla, y volver a aprobar duplicaba los puntos. | Resuelto |
| B-11 | 6 | Actividades y exámenes editables por un instructor que no dictaba ese curso. | Resuelto |
| B-12 | 6 | El límite del cuerpo JSON cortaba las entregas con comentarios largos. | Resuelto |

## 6. Alcance entregado

| Módulo | Estado |
|---|---|
| Autenticación (correo, Google, Microsoft) y perfil | Completo |
| Recuperación y cambio de contraseña, límite de intentos | Completo |
| Organizaciones: crear, editar, activar y eliminar | Completo |
| Usuarios: alta, consulta con filtros, edición, roles | Completo |
| Aislamiento de datos entre organizaciones | Completo |
| Grupos e integrantes | Completo |
| Cursos y secciones | Parcial · falta editar, archivar y publicar |
| Actividades, material y exámenes | Parcial · falta responder la evaluación |
| Entregas y revisión | Completo |
| Gamificación (XP y niveles) | Parcial · falta rachas, logros y tabla de posiciones |

## 7. Artefactos y eventos del marco

Todos los documentos viven en la carpeta `docs/` del repositorio. Las rutas de esta tabla son relativas a la raíz del proyecto.

| Elemento del marco | Dónde está |
|---|---|
| Product Backlog priorizado | `docs/tecnico/OnBoardPro-Backlog.xlsx` · hoja **Backlog**, sincronizada con Jira |
| Plan de sprints | `docs/tecnico/OnBoardPro-Backlog.xlsx` · hoja **Plan de Sprints** (11 sprints, 226 SP) |
| Definición de Hecho | `docs/tecnico/OnBoardPro-Backlog.xlsx` · hoja **Definición de Hecho** (8 criterios) |
| Métricas y gráficas editables | `docs/tecnico/OnBoardPro-Backlog.xlsx` · hoja **Métricas por sprint** |
| Registro de defectos | `docs/tecnico/OnBoardPro-Backlog.xlsx` · hoja **Bugs**, y la sección 5 de este informe |
| Sprint Review | `docs/sprints/Sprint Review (SP1..SP6).docx` |
| Plantilla de Sprint Review | `docs/sprints/Sprint Review (Plantilla).docx` |
| Tablero y seguimiento diario | Proyecto **OBP** en Jira |

### Índice de documentos

| Carpeta | Archivo | Contenido |
|---|---|---|
| `docs/` | `Informe general de avance.docx` | Este informe |
| `docs/` | `Informe general de avance.md` | La fuente del informe, para regenerarlo |
| `docs/img/` | `g1-velocidad.png`, `g2-burnup.png`, `g3-bugs.png` | Las tres gráficas de este informe |
| `docs/sprints/` | `Sprint Review (SP1).docx` | Sprint 1 · 28/8 – 4/9 · 11 SP |
| `docs/sprints/` | `Sprint Review (SP2).docx` | Sprint 2 · 4/9 – 11/9 · 8 SP |
| `docs/sprints/` | `Sprint Review (SP3).docx` | Sprint 3 · 11/9 – 18/9 · 25 SP |
| `docs/sprints/` | `Sprint Review (SP4).docx` | Sprint 4 · 18/9 – 25/9 · 17 SP |
| `docs/sprints/` | `Sprint Review (SP5).docx` | Sprint 5 · 25/9 – 2/10 · 13 SP |
| `docs/sprints/` | `Sprint Review (SP6).docx` | Sprint 6 · 12/10 – 17/10 · 29 SP |
| `docs/tecnico/` | `OnBoardPro-Backlog.xlsx` | Backlog, plan, Definición de Hecho, métricas, gráficas y bugs |
| `docs/tecnico/` | `openapi.json` | Especificación de la API |
| `docs/tecnico/` | `OnBoardPro.postman_collection.json` | Colección de pruebas de la API |
| `docs/tecnico/` | `requerimientos.html` | Requerimientos del producto |
| `docs/tecnico/` | `jira-import.csv`, `backlog.data.json` | Fuentes de la carga inicial a Jira |

### Cumplimiento de la Definición de Hecho

De los ocho criterios, siete se cumplen de forma sostenida. El **criterio 4, pruebas automatizadas de camino feliz y de acceso denegado**, no se está cumpliendo: las historias del sprint 6 pasaron a «Finalizado» por decisión del equipo y no por evidencia de pruebas. Es la mejora principal pendiente para el sprint 7.
