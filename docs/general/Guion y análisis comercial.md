# OnBoard Pro: análisis comercial y guion de la presentación

Notas de trabajo para la sustentación tipo venta. Las cifras de mercado salen del documento final (ver `investigacion-fuentes.md`); las de precio y proyección son **hipótesis del equipo** y así hay que presentarlas.

## 1. El producto en una frase

> OnBoard Pro convierte la inducción de cada nuevo empleado en un recorrido corto, medible y con evidencia, que la persona quiere terminar porque avanza, gana puntos y ve su progreso.

## 2. Por qué hay negocio

| Dato | Cifra | Cómo usarlo en la venta |
|---|---|---|
| Costo mínimo de una inducción de 3 meses con salario mínimo 2026 | ≈ $6.000.000 COP por persona (solo salario y auxilio) | Es el gancho: "cada ingreso le cuesta al menos 6 millones antes de rendir". |
| Rotación promedio en Colombia (ACRIP, 2025) | 22,1 % (19,6 % en 2024) | Cada salida obliga a repetir la inducción. |
| Empresas que no calculan el costo de su rotación | 77,3 % | "No es que no les cueste: es que no lo están viendo." |
| Empleados que dicen que su empresa hace bien el onboarding (Gallup) | 12 % | El problema es generalizado. |
| Pymes en Bogotá y su región (CCB, 2024) | ≈ 32.000 pequeñas y medianas | Mercado inicial concreto y cercano. |
| Obligación legal | Inducción en SST documentada antes de iniciar labores (Decreto 1072 de 2015) | La evidencia de finalización no es un lujo: es cumplimiento. |

## 3. Diferenciadores (qué decir cuando pregunten "¿y por qué no TalentLMS o Crehana?")

1. **Hecho para la inducción, no para "formación en general".** Cursos cortos por secciones, el aprendiz ve qué le falta y la empresa ve quién terminó.
2. **Gamificación con criterio, incluida en el precio.** XP que se paga una sola vez, reintentos que rinden menos, ranking entre pares (curso o grupo), medallas al cierre del periodo. En Docebo la gamificación es un complemento pago; en UBITS no figura.
3. **Evidencia para seguridad y salud en el trabajo.** Con la empresa demo se ve: curso SG-SST con examen obligatorio y registro de quién lo aprobó y cuándo.
4. **Multiempresa y seguro por diseño.** Cada empresa ve solo lo suyo (24 de 24 pruebas de aislamiento y concurrencia contra la base real); el operador de la plataforma solo consulta, no toca el contenido de sus clientes; contraseñas temporales al crear cuentas.
5. **En español, para pymes colombianas y con precio de pyme.**

Honestidad que vende: TalentLMS y Docebo **sí** tienen plantillas de onboarding. La diferencia es foco, gamificación incluida y precio, no "nadie lo hace".

## 4. Cómo podría venderse (propuesta para discutir)

**Modelo:** SaaS por organización, con tarifa según personas activas al mes (lo que la empresa realmente usa).

| Plan (hipótesis) | Para quién | Idea de precio | Qué incluye |
|---|---|---|---|
| Piloto | Cualquier empresa | Gratis 30 días | 1 organización, hasta 15 personas, plantillas de SST y datos personales |
| Pyme | 10 a 50 ingresos al año | Tarifa fija mensual por debajo de TalentLMS Core (USD 119/mes) | Todo el producto, carga masiva, panel de uso |
| Crecimiento | Más de 50 ingresos al año | Por persona activa al mes, por debajo de iSpring (USD 6,91) | Lo anterior + acompañamiento en el diseño de cursos |

Palancas comerciales:
- **Plantillas listas** (SG-SST, Ley 1581 de datos personales, herramientas internas): la empresa arranca el mismo día. Ya existen en la demo de Vialtica.
- **Servicio de implementación** (cobro único): montar la inducción de la empresa en la plataforma.
- **Canal:** cajas de compensación, ARL y consultoras de SST, que ya hablan con las pymes de inducción y cumplimiento.

Proyección ilustrativa (no es una promesa): si el 1 % de las ≈ 32.000 pymes pagara una suscripción de $250.000 COP al mes, serían ≈ 320 clientes y ≈ $80 millones COP mensuales. Sirve para mostrar el orden de magnitud; la tarifa real se valida con la encuesta del Anexo D.

**Lo que falta para venderlo de verdad** (decirlo como hoja de ruta, no como debilidad):
1. Validación con usuarios (SUS ≥ 68 y piloto con una cohorte): está diseñada en el Anexo D.
2. Infraestructura sin pausas (hoy son planes gratuitos) y RLS en la base como segunda barrera.
3. Notificaciones y reportes exportables para recursos humanos.

## 5. Estructura sugerida del pitch (12–15 minutos)

| Min. | Bloque | Quién | Qué decir / mostrar |
|---|---|---|---|
| 0–1 | Gancho | A | "Cada persona que contratan les cuesta al menos 6 millones antes de rendir… y 1 de cada 5 se va." |
| 1–3 | Problema | A | Rotación 22,1 %, 77,3 % no mide el costo, solo 12 % hace bien el onboarding, obligación de SST. |
| 3–4 | Solución | B | La frase del producto y los 3 roles: la empresa, el instructor, el nuevo empleado. |
| 4–9 | Demo con Vialtica | B (y A narra) | Historia de un día: Carolina (admin) carga a los nuevos → Julián (aprendiz) completa una actividad, sube de nivel, ve su ranking del curso → Ángela (instructora) califica una entrega → panel de uso de la organización → superadmin ve qué empresas usan la plataforma. |
| 9–11 | Diferenciadores y competencia | A | Tabla corta: foco, gamificación incluida, evidencia SST, precio. |
| 11–12 | Cómo lo construimos | B | Scrum, 11 sprints, 61 historias, 211 puntos, velocidad 19,2; 306 pruebas automatizadas y 24 de integración; 38 defectos registrados, 36 resueltos. |
| 12–14 | Modelo de negocio y hoja de ruta | A | Planes, piloto gratis, plantillas, canal; validación con usuarios como siguiente paso. |
| 14–15 | Cierre | Ambos | Llamado a la acción: "Queremos 3 empresas para el piloto de diciembre." |

## 6. Consejos de speech

- **Una historia, no una lista de funciones.** Presenten la demo como el primer día de Julián en Vialtica. Las funciones aparecen solas dentro de la historia.
- **Empiecen por el dolor del cliente**, no por la tecnología. React, Express o Supabase solo si preguntan.
- **Números redondos y pocos.** "6 millones", "1 de cada 5", "12 %". Los detalles van en el documento.
- **Hablen de "ustedes" y de la empresa**, como si la profesora fuera la jefa de gestión humana que va a comprar.
- **Repartan los roles**: uno vende (problema, negocio, cierre), el otro demuestra (demo y cómo se construyó). Las transiciones ensayadas ("Ahora Brayan les muestra cómo lo vive Julián").
- **Admitan lo que falta antes de que lo pregunten**, y conviértanlo en el siguiente paso ("La validación con usuarios es lo próximo; ya tenemos el instrumento").
- **Preguntas difíciles, respuestas cortas:**
  - *¿Por qué no usar TalentLMS?* "Es buena, pero es formación general, en inglés de origen, y la gamificación y el onboarding cuestan aparte o requieren configurarlos. Nosotros nacimos para la inducción de la pyme colombiana."
  - *¿Es seguro tener a varias empresas en la misma plataforma?* "Cada consulta filtra por organización y lo probamos contra la base real: 24 de 24 casos, ninguno ve datos ajenos. Además el operador de la plataforma solo puede consultar."
  - *¿Cómo saben que reduce el tiempo de inducción?* "Todavía no lo afirmamos: lo vamos a medir con el piloto. Lo que hoy sí damos es la medición que la empresa no tenía."
  - *¿Cuánto cuesta?* "Menos que las alternativas internacionales; la tarifa exacta la estamos validando con empresas. Empezamos con un piloto gratis."
- **Cierren con una petición concreta** (empresas para el piloto, una reunión), no con "gracias, ¿preguntas?".

## 7. Lista de verificación antes de presentar

- [ ] Confirmar y desplegar los cambios del Sprint 11 (front en Vercel y backend en Render): la versión publicada todavía no los tiene.
- [ ] Correr `scripts/pendiente.sql` en Supabase (tabla de accesos y contraseña temporal).
- [ ] Volver a crear la demo el día anterior: `node scripts/seed-demo.js borrar` y luego `crear`, para que las rachas y el ranking semanal estén al día.
- [ ] Abrir la aplicación desplegada 10 minutos antes: Render tarda en arrancar tras un rato sin uso y Supabase se pausa tras días sin actividad.
- [ ] Tener un video de respaldo de la demo por si falla la conexión.
- [ ] Sesiones abiertas de antemano en ventanas separadas: superadmin, Carolina, Ángela y Julián.
- [ ] Ensayar con cronómetro al menos dos veces completas.
