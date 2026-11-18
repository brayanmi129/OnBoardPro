# OnBoard Pro — Tablero de KPIs del proyecto

## 1. Ficha

| Campo | Valor |
|---|---|
| Producto | Plataforma de onboarding corporativo multiempresa |
| Equipo | Sergio Angel, Brayan Miranda |
| Sprints | 11 · semanales, de viernes a viernes |
| Inicio | 28/8/2026 |
| Entrega | 20/11/2026 |
| Alcance del MVP | 211 SP · 61 historias |
| Suma de los pronósticos por sprint | 225 SP · 65 historias |
| Diferencia | HU-034 y HU-036 (6 SP) se pronosticaron en los sprints 5 y 6, y HU-058 (3 SP) en los sprints 7 y 8, porque no cerraron en el primero |
| Post-MVP en backlog | 81 SP · 32 historias (incluye HU-043, que salió del Sprint 11) |
| Fuera del MVP | Concurso de preguntas (HU-065) y jugar y ganar puntos (HU-067), 10 SP: salen del alcance el 6/11/2026 y pasan al backlog con el resto de la épica de juegos |
| Último sprint cerrado | Sprint 11 · 6/11 – 13/11 |
| Sprint en curso | Ninguno: semana de estabilización y entrega (13/11 – 20/11) |
| Estabilización y entrega | 13/11 – 20/11 |

## 2. KPIs del proyecto

| Indicador | Valor | Se actualiza |
|---|---|---|
| Sprints cerrados | 11 de 11 | Cada sprint |
| Avance del MVP | 211 de 211 SP · 100% | Cada sprint |
| Historias entregadas | 61 de 65 comprometidas · 94% | Cada sprint |
| Velocidad promedio | 19,2 SP | Cada sprint |
| Velocidad últimos 3 sprints | 19,0 SP | Cada sprint |
| Pronóstico cumplido | 94% · 211 de 225 SP | Cada sprint |
| Sprints al 100% | 8 de 11 · 73% | Cada sprint |
| Mejor sprint | Sprint 6 · 29 SP | Cada sprint |
| SP restantes | 0 | Cada sprint |

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
| 8 | 16/10 – 23/10 | Cerrado | 7 / 6 | 29 | 24 | 83% | 154 | 4 |
| 9 | 23/10 – 30/10 | Cerrado | 6 / 6 | 26 | 26 | 100% | 180 | 6 |
| 10 | 30/10 – 6/11 | Cerrado | 6 / 6 | 19 | 19 | 100% | 199 | 5 |
| 11 | 6/11 – 13/11 | Cerrado | 4 / 4 | 12 | 12 | 100% | 211 | 8 |
| **Cerrados (1–11)** |  |  | **65 / 61** | **225** | **211** | **94%** | **211** | **38** |
| **Todos (1–11)** |  |  | **65 / 61** | **225** | **211** | **94%** | **211** | **38** |

![Velocidad por sprint: puntos pronosticados contra completados.](imagenes/g1-velocidad.png)

![Burn-up: avance acumulado contra el alcance total del MVP.](imagenes/g2-burnup.png)

## 4. KPIs de calidad

| Indicador | Valor |
|---|---|
| Defectos detectados | 38 |
| Defectos resueltos | 36 · 95% |
| Defectos mitigados | 2 |
| Defectos abiertos | 0 |
| Densidad | 0,18 por SP entregado |
| Defectos de integración (merge) | 4 de 38 · 11% |
| Defectos de seguridad | 15 de 38 · 39% |
| Sprint con más defectos | Sprint 11 · 8 (semana de estabilización) |
| Resueltos en el mismo sprint | 36 de 38 · 95% |

![Defectos detectados en cada sprint.](imagenes/g3-bugs.png)

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
| B-16 | 8 | El inicio de sesión con Microsoft aceptaba el campo «mail», que la persona puede cambiar: se podía entrar con la cuenta de otra. | Seguridad | Resuelto |
| B-17 | 8 | Consultar un usuario por su id devolvía usuarios de otras organizaciones. | Seguridad | Resuelto |
| B-18 | 8 | Una entrega aprobada podía volver a «rehacer», y enviarla dos veces respondía 500. | Funcional | Resuelto |
| B-19 | 8 | El progreso de nivel mostraba datos de otro nivel («Nivel 3 · te faltan 55 para el nivel 4» con el XP del nivel 2). | Funcional | Resuelto |
| B-20 | 9 | Al entrar con Microsoft, un correo registrado con mayúsculas no se encontraba y se creaba una segunda cuenta. | Funcional | Resuelto |
| B-21 | 9 | Editar un usuario permitía cambiar su id, la clave primaria, y dejaba sueltos sus grupos y su XP. | Seguridad | Resuelto |
| B-22 | 9 | Editar un usuario devolvía en la respuesta su contraseña cifrada. | Seguridad | Resuelto |
| B-23 | 9 | Un administrador podía borrar a un superadministrador asociado a su organización. | Seguridad | Resuelto |
| B-24 | 9 | El inicio de sesión con contraseña no bloqueaba a las personas de una organización desactivada. | Seguridad | Resuelto |
| B-25 | 9 | Un logro podía asociarse a un curso de otra organización. | Seguridad | Resuelto |
| B-26 | 10 | El resultado de un examen no se mostraba cuando el instructor ocultaba las respuestas. | Funcional | Resuelto |
| B-27 | 10 | El ranking del curso incluía a aprendices que ya no estaban en el grupo asignado. | Funcional | Resuelto |
| B-28 | 10 | La celebración de subida de nivel no aparecía si la sección se plegaba al completar la actividad. | Funcional | Resuelto |
| B-29 | 10 | Al integrar la rama development, las portadas de «Mis cursos» dejaron de verse por un campo renombrado. | Merge | Resuelto |
| B-30 | 10 | Completar una actividad tardaba más de 7 segundos por consultas en serie a la base. | Rendimiento | Mitigado |
| B-31 | 11 | El ranking incluía a personas desactivadas en la organización. | Funcional | Resuelto |
| B-32 | 11 | El superadministrador podía crear, editar y borrar contenido dentro de las organizaciones y cerrar sus periodos de ranking. | Seguridad | Resuelto |
| B-33 | 11 | Al crear o editar un usuario se podían fijar a mano su XP, nivel, racha y promedio. | Seguridad | Resuelto |
| B-34 | 11 | El administrador de la organización podía revisar entregas, tarea exclusiva del instructor del curso. | Seguridad | Resuelto |
| B-35 | 11 | El listado de usuarios mostraba solo las primeras 50 personas de la organización. | Funcional | Resuelto |
| B-36 | 11 | El formulario de usuario ofrecía los estados Pendiente y Suspendido, que el servidor rechaza. | Funcional | Resuelto |
| B-37 | 11 | En el inicio del aprendiz, la tarjeta de logros se estiraba y montaba las últimas acreditaciones sobre los cursos. | Funcional | Resuelto |
| B-38 | 11 | El detalle de los avisos de error era ilegible cuando el sistema operativo estaba en modo oscuro. | Funcional | Resuelto |

## 6. Alcance por módulo

| Módulo | Estado | Falta |
|---|---|---|
| Autenticación y perfil | Completo | — |
| Contraseñas y límite de intentos | Completo | — |
| Organizaciones | Completo | — |
| Usuarios y roles | Completo | — |
| Aislamiento entre organizaciones | Completo | — |
| Grupos e integrantes | Completo | — |
| Cursos y secciones | Completo | — |
| Actividades y material | Completo | — |
| Exámenes | Completo | Banco de preguntas (HU-043), fuera del MVP |
| Entregas y revisión | Completo | — |
| XP, niveles y ranking | Completo | — |
| Racha de días activos | Completo | — |
| Logros | Completo | — |
| Juegos | Fuera del MVP | Concursos (HU-065, HU-067) y demás juegos (HU-063, HU-064, HU-066, HU-068), para una etapa posterior |

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
