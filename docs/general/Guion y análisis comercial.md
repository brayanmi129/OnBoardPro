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
| Inicial | Empresas que incorporan pocas personas | Tarifa mensual reducida | Hasta 15 personas activas, cursos ilimitados con su propio material, panel de uso |
| Pyme | 10 a 50 ingresos al año | Tarifa fija mensual por debajo de TalentLMS Core (USD 119/mes) | Todo el producto, carga masiva, panel de uso |
| Crecimiento | Más de 50 ingresos al año | Por persona activa al mes, por debajo de iSpring (USD 6,91) | Lo anterior, para organizaciones más grandes |

Palancas comerciales:
- **Vendemos la plataforma, no los cursos.** Cada empresa crea y alimenta sus cursos con su propio material (documentos, videos, tareas y exámenes). Lo único que trae la plataforma es un curso transversal, «Introducción a OnBoard Pro», para que cada persona aprenda a usarla.
- **Canal:** cajas de compensación, ARL y consultoras de SST, que ya hablan con las pymes de inducción y cumplimiento.

Proyección ilustrativa (no es una promesa): si el 1 % de las ≈ 32.000 pymes pagara una suscripción de $250.000 COP al mes, serían ≈ 320 clientes y ≈ $80 millones COP mensuales. Sirve solo para mostrar el orden de magnitud.

## 5. Estructura sugerida del pitch (12–15 minutos)

| Min. | Bloque | Quién | Qué decir / mostrar |
|---|---|---|---|
| 0–1 | Gancho | A | "Cada persona que contratan les cuesta al menos 6 millones antes de rendir… y 1 de cada 5 se va." |
| 1–3 | Problema | A | Rotación 22,1 %, 77,3 % no mide el costo, solo 12 % hace bien el onboarding, obligación de SST. |
| 3–4 | Solución | B | La frase del producto y los 3 roles: la empresa, el instructor, el nuevo empleado. |
| 4–9 | Demo | B (y A narra) | Recorrido por roles: el administrador registra a los nuevos → el nuevo empleado completa una actividad, sube de nivel y ve su ranking del curso → el instructor califica una entrega → panel de uso de la organización → el operador ve qué empresas usan la plataforma. |
| 9–11 | Diferenciadores y competencia | A | Tabla corta: foco, gamificación incluida, evidencia SST, precio. |
| 11–12 | Cómo lo construimos | B | Scrum, 11 sprints, 61 historias, 211 puntos, velocidad 19,2; 306 pruebas automatizadas y 24 de integración; 38 defectos registrados, 36 resueltos. |
| 12–15 | Modelo de negocio y cierre | A | Planes, la plataforma como producto (los cursos los pone la empresa) y canal; cerrar con la frase del producto. |

## 6. Consejos de speech

- **Una historia, no una lista de funciones.** Presenten la demo como el recorrido de una persona que entra a la empresa. Las funciones aparecen solas dentro de la historia.
- **Empiecen por el dolor del cliente**, no por la tecnología. React, Express o Supabase solo si preguntan.
- **Números redondos y pocos.** "6 millones", "1 de cada 5", "12 %". Los detalles van en el documento.
- **Hablen de "ustedes" y de la empresa**, como si la profesora fuera la jefa de gestión humana que va a comprar.
- **Repartan los roles**: uno vende (problema, negocio, cierre), el otro demuestra (demo y cómo se construyó). Las transiciones ensayadas ("Ahora les mostramos cómo lo vive un nuevo empleado").
- **Preguntas difíciles, respuestas cortas:**
  - *¿Por qué no usar TalentLMS?* "Es buena, pero es formación general, en inglés de origen, y la gamificación y el onboarding cuestan aparte o requieren configurarlos. Nosotros nacimos para la inducción de la pyme colombiana."
  - *¿Es seguro tener a varias empresas en la misma plataforma?* "Cada consulta filtra por organización y lo probamos contra la base real: 24 de 24 casos, ninguno ve datos ajenos. Además el operador de la plataforma solo puede consultar."
  - *¿Cómo saben que reduce el tiempo de inducción?* "No lo afirmamos todavía. Lo que sí damos es la medición que la empresa no tenía: quién avanza, quién terminó y cuánto se usa la plataforma."
  - *¿Cuánto cuesta?* "Menos que las alternativas internacionales: una tarifa fija para la pyme y otra por persona activa para quien contrata más."
- **Cierren con la frase del producto**, no con "gracias, ¿preguntas?": "OnBoard Pro, la inducción que tus nuevos empleados sí terminan".

## 7. Lista de verificación antes de presentar

- [ ] Confirmar y desplegar los cambios del Sprint 11 (front en Vercel y backend en Render): la versión publicada todavía no los tiene.
- [ ] Correr `scripts/pendiente.sql` en Supabase (tabla de accesos y contraseña temporal).
- [ ] Volver a crear la demo el día anterior: `node scripts/seed-demo.js borrar` y luego `crear`, para que las rachas y el ranking semanal estén al día.
- [ ] Abrir la aplicación desplegada 10 minutos antes: Render tarda en arrancar tras un rato sin uso y Supabase se pausa tras días sin actividad.
- [ ] Tener un video de respaldo de la demo por si falla la conexión.
- [ ] Sesiones abiertas de antemano en ventanas separadas: superadmin, administrador, instructor y nuevo empleado de la empresa de demostración (cuentas en `CREDENCIALES.local.md`).
- [ ] Ensayar con cronómetro al menos dos veces completas.
