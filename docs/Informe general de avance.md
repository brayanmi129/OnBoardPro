# OnBoard Pro — Tablero de KPIs del proyecto

## 1. Ficha

| Campo | Valor |
|---|---|
| Producto | Plataforma de onboarding corporativo multiempresa |
| Equipo | Sergio Angel, Brayan Miranda |
| Sprints | 11 · semanales, de viernes a viernes |
| Inicio | 28/8/2026 |
| Entrega | 20/11/2026 |
| Alcance del MVP | 226 SP · 64 historias |
| Suma de los pronósticos por sprint | 232 SP · 66 historias |
| Diferencia | HU-034 y HU-036 (6 SP) se pronosticaron en el sprint 5 y, al no cerrar, otra vez en el 6 |
| Post-MVP en backlog | 66 SP · 29 historias |
| Último sprint cerrado | Sprint 7 · 9/10 – 16/10 |
| Sprint en curso | Sprint 8 · 16/10 – 23/10 |
| Estabilización y entrega | 13/11 – 20/11 |

## 2. KPIs del proyecto

| Indicador | Valor | Se actualiza |
|---|---|---|
| Sprints cerrados | 7 de 11 | Cada sprint |
| Avance del MVP | 130 de 226 SP · 58% | Cada sprint |
| Historias entregadas | 39 de 42 comprometidas · 93% | Cada sprint |
| Velocidad promedio | 18,6 SP | Cada sprint |
| Velocidad últimos 3 sprints | 23,0 SP | Cada sprint |
| Pronóstico cumplido | 94% · 130 de 139 SP | Cada sprint |
| Sprints al 100% | 5 de 7 · 71% | Cada sprint |
| Mejor sprint | Sprint 7 · 30 SP | Cada sprint |
| SP restantes | 96 en 4 sprints | Cada sprint |

## 3. Avance por sprint

| Sprint | Fechas | Estado | Historias plan / hechas | SP pronosticados | SP completados | % | Acumulado | Bugs |
|---|---|---|---|---|---|---|---|---|
| 1 | 28/8 – 4/9 | Cerrado | 5 / 5 | 11 | 11 | 100% | 11 | 0 |
| 2 | 4/9 – 11/9 | Cerrado | 3 / 3 | 8 | 8 | 100% | 19 | 1 |
| 3 | 11/9 – 18/9 | Cerrado | 6 / 6 | 25 | 25 | 100% | 44 | 2 |
| 4 | 18/9 – 25/9 | Cerrado | 4 / 4 | 17 | 17 | 100% | 61 | 2 |
| 5 | 25/9 – 2/10 | Cerrado | 7 / 5 | 19 | 13 | 68% | 74 | 3 |
| 6 | 2/10 – 9/10 | Cerrado | 9 / 9 | 29 | 29 | 100% | 103 | 4 |
| 7 | 9/10 – 16/10 | Cerrado | 8 / 7 | 30 | 27 | 90% | 130 | 3 |
| 8 | 16/10 – 23/10 | En curso | 6 / — | 26 | — | — | — | — |
| 9 | 23/10 – 30/10 | Planificado | 6 / — | 26 | — | — | — | — |
| 10 | 30/10 – 6/11 | Planificado | 7 / — | 24 | — | — | — | — |
| 11 | 6/11 – 13/11 | Planificado | 5 / — | 17 | — | — | — | — |
| **Cerrados (1–7)** | | | **42 / 39** | **139** | **130** | **94%** | **130** | **15** |
| **Todos (1–11)** | | | **66 / 39** | **232** | **130** | **56%** | **130** | **15** |

![Velocidad por sprint: puntos pronosticados contra completados.](img/g1-velocidad.png)

![Burn-up: avance acumulado contra el alcance total del MVP.](img/g2-burnup.png)

## 4. KPIs de calidad

| Indicador | Valor |
|---|---|
| Defectos detectados | 15 |
| Defectos resueltos | 14 · 93% |
| Defectos mitigados | 1 |
| Defectos abiertos | 0 |
| Densidad | 0,11 por SP entregado |
| Defectos de integración (merge) | 3 de 15 · 20% |
| Defectos de seguridad | 5 de 15 · 33% |
| Sprint con más defectos | Sprint 6 · 4 |
| Resueltos en el mismo sprint | 14 de 15 · 93% |

![Defectos detectados en cada sprint.](img/g3-bugs.png)

## 5. Bitácora de defectos

| # | Sprint | Defecto | Tipo | Estado |
|---|---|---|---|---|
| B-01 | 2 | Los errores de validación se devolvían como 500 «Required» en lugar de 400 indicando el campo. | Funcional | Resuelto |
| B-02 | 3 | Varios endpoints no filtraban por organización: se podían consultar datos de otra empresa. | Seguridad | Resuelto |
| B-03 | 3 | Rutas de grupos sin verificación de sesión. | Seguridad | Resuelto |
| B-04 | 4 | Un administrador podía cambiar el rol de un superadministrador y el de usuarios de otra organización. | Seguridad | Resuelto |
| B-05 | 4 | CORS rechazaba localhost y bloqueaba el desarrollo del frontend. | Configuración | Resuelto |
| B-06 | 5 | `PayloadTooLargeError` al subir archivos: el frontend los enviaba en base64 dentro de un JSON. | Funcional | Resuelto |
| B-07 | 5 | `deliverable: Expected boolean, received string` al crear actividades por multipart. | Funcional | Resuelto |
| B-08 | 5 | TanStack en una versión con vulnerabilidad conocida. | Dependencias | Mitigado |
| B-09 | 6 | Un examen devolvía las respuestas correctas al aprendiz que lo iba a rendir. | Seguridad | Resuelto |
| B-10 | 6 | El XP se acreditaba al subir la entrega y no al aprobarla, y volver a aprobar duplicaba los puntos. | Funcional | Resuelto |
| B-11 | 6 | Actividades y exámenes editables por un instructor que no dictaba ese curso. | Seguridad | Resuelto |
| B-12 | 6 | El límite del cuerpo JSON cortaba las entregas con comentarios largos. | Funcional | Resuelto |
| B-13 | 7 | Al mergear las ramas de entregas y de gamificación se perdió el registro de las rutas de entregas y los endpoints respondían 404. | Merge | Resuelto |
| B-14 | 7 | La resolución de un conflicto en el esquema de la base dejó duplicada la definición de logros y el script de creación fallaba. | Merge | Resuelto |
| B-15 | 7 | Un merge en la documentación de la API pisó los endpoints de material de apoyo, que dejaron de aparecer en Swagger. | Merge | Resuelto |

## 6. Alcance por módulo

| Módulo | Estado | Falta |
|---|---|---|
| Autenticación y perfil | Completo | — |
| Contraseñas y límite de intentos | Completo | — |
| Organizaciones | Completo | — |
| Usuarios y roles | Completo | Carga masiva (HU-019) |
| Aislamiento entre organizaciones | Completo | — |
| Grupos e integrantes | Completo | — |
| Cursos y secciones | Parcial | Editar, archivar y publicar (HU-028, HU-029, HU-033) |
| Actividades y material | Completo | — |
| Exámenes | Parcial | Responder y calificar (HU-044, HU-045), banco de preguntas (HU-043) |
| Entregas y revisión | Completo | — |
| XP, niveles y ranking | Completo | Tabla de niveles configurable (HU-053), antiabuso (HU-055) |
| Racha de días activos | Parcial | Se calcula y se guarda (HU-058); falta mostrarla en la interfaz |
| Logros | Parcial | Se crean al dar de alta un curso (HU-059); falta el desbloqueo automático (HU-061) y ver mis logros (HU-062) |
| Juegos | Sin empezar | HU-065, HU-067 |

## 7. Artefactos y rutas

| Elemento | Ubicación |
|---|---|
| Product Backlog | OnBoard Pro Historias de Usuario |
| Plan de sprints | OnBoard Pro Historias de Usuario |
| Definición de Hecho | OnBoard Pro Historias de Usuario |
| Métricas y gráficas editables | OnBoard Pro Historias de Usuario |
| Registro de defectos | OnBoard Pro Historias de Usuario |
| Sprint Review | Sprints |
| Plantilla de Sprint Review | Sprint Review (Plantilla) |
| Este informe | Informe general de avance.docx |
| Tablero | https://onboard-pro.atlassian.net/jira/software/projects/OBP/summary |
