# Pruebas de integración contra la base real

- **Fecha:** 2026-11-18T20:37:27.231Z (duración 67.1 s)
- **Entorno:** base de desarrollo `dfbeioootnxeomupwdhe.supabase.co`, organización `Test` más una organización temporal para el aislamiento; Node v22.22.2
- **Datos de prueba:** prefijo `itestmwml1lj31bb7`, creados al inicio y borrados al final
- **Comando:** `node scripts/pruebas-integracion.js`
- **Resultado:** 24 de 24 casos pasan

## a) Concurrencia

| Caso | Qué se probó | Esperado | Obtenido | Resultado |
|---|---|---|---|---|
| INT-01 | 10 llamadas simultáneas a completarActividad (mismo usuario y actividad) | 1 éxito y 9 respuestas 409 | 1 éxito(s), 9 respuestas 409 | Pasa |
| INT-02 | Movimientos de XP registrados por esa actividad | exactamente 1 fila en xp_movimientos | 1 fila(s) | Pasa |
| INT-03 | XP del usuario tras las 10 llamadas | users.xp = suma del libro, y la actividad (10 XP) sumada una sola vez | users.xp = 25, suma del libro = 25, XP de actividades = 10 (el resto son logros) | Pasa |

## b) Aislamiento

| Caso | Qué se probó | Esperado | Obtenido | Resultado |
|---|---|---|---|---|
| INT-04 | Curso de B (detalle) | 404 (como si no existiera) | null (no encontrado) | Pasa |
| INT-05 | Curso de B (participantes, aprendiz A) | 404 (como si no existiera) | 404 Curso no encontrado | Pasa |
| INT-06 | Secciones del curso de B (aprendiz A) | 404 (como si no existiera) | 404 Curso no encontrado | Pasa |
| INT-07 | Secciones del curso de B (admin A) | 404 (como si no existiera) | 404 Curso no encontrado | Pasa |
| INT-08 | Material de una actividad de B (aprendiz A) | 404 (como si no existiera) | 404 Actividad no encontrada | Pasa |
| INT-09 | Material de una actividad de B (admin A) | 404 (como si no existiera) | 404 Actividad no encontrada | Pasa |
| INT-10 | Entregas de una actividad de B (admin A) | 404 (como si no existiera) | 404 Actividad no encontrada | Pasa |
| INT-11 | Archivo de una entrega de B (admin A) | 404 (como si no existiera) | null (no encontrado) | Pasa |
| INT-12 | Revisar una entrega de B (instructor A) | 404 (como si no existiera) | 404 Entrega no encontrada | Pasa |
| INT-13 | Usuario de B por correo (admin A) | 404 (como si no existiera) | null (no encontrado) | Pasa |
| INT-14 | Editar un usuario de B (admin A) | 404 (como si no existiera) | 404 | Pasa |
| INT-15 | Completar una actividad de B (aprendiz A) | 404 (como si no existiera) | 404 Actividad no encontrada | Pasa |
| INT-16 | El usuario de B sigue intacto tras el intento de edición desde A | firstname = "IT aprb" | firstname = "IT aprb" | Pasa |
| INT-17 | El ranking de A (siempre y semana) no incluye a nadie de B | ningún id de la organización B | 6 filas (siempre), 6 (semana); de B: 0 | Pasa |
| INT-18 | El tablero de A no cuenta datos de B | usuarios = los de A; el XP que ganó B no cambia el XP de A; el curso de B no aparece | usuarios = 7 (en la base: 7); XP periodo antes/después = 25/25; curso de B listado: false; curso de A listado: true | Pasa |

## c) Reglas de gamificación

| Caso | Qué se probó | Esperado | Obtenido | Resultado |
|---|---|---|---|---|
| INT-19 | Completar el mismo recurso dos veces | 1.ª: +10 XP; 2.ª: 409; 1 movimiento | 1.ª: +10 XP; 2.ª: 409; 1 movimiento(s) | Pasa |
| INT-20 | Examen de 50 XP aprobado con 80% en el 1.er intento | 40 XP (proporcional a la nota) | 80%, aprobado=true, XP acreditado 40, en el libro 40 | Pasa |
| INT-21 | Examen de 50 XP: 1.er intento 40% (reprobado), 2.º intento 80% | 1.º: 0 XP; 2.º: 20 XP (80% de 50, a la mitad por reintento) | 1.º: 40% aprobado=false XP 0; 2.º: 80% aprobado=true XP 20; en el libro 20; aviso: Aprobaste en un reintento: el XP se reduce a la mitad. | Pasa |
| INT-22 | Un examen aprobado no se puede volver a rendir | 409 al iniciar un 3.er intento; sigue 1 movimiento | 409; 1 movimiento(s) | Pasa |
| INT-23 | Subida de nivel en la misma operación (actividad de 100 XP, el umbral del nivel 1) | subioDeNivel = true y users.level >= 1 al terminar la llamada | subioDeNivel=true, nivel en la respuesta=1, en la base level=1, xp=115 | Pasa |
| INT-24 | Logro de la organización (1 actividad completada, +5 XP) otorgado una sola vez | se desbloquea en la 1.ª actividad, no en la 2.ª; 1 fila en logros_usuario y 1 movimiento del logro | 1.ª: desbloqueado; 2.ª: no; logros_usuario=1; movimientos del logro=1 | Pasa |

## Limpieza

Se borró todo lo creado. Restos por tabla: `{"tenants":0,"users":0,"groups":0,"courses":0,"sections":0,"activities":0,"preguntas":0,"opciones":0,"materiales":0,"entregas":0,"logros":0}`
