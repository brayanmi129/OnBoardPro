# Diagramas de OnBoard Pro: títulos y descripciones

Todos los diagramas se construyeron leyendo el código del backend (`scripts/schema.sql`, `routes/`, `middlewares/`, `controllers/`, `services/`, `helpers/`, `index.js`) y del front (`onboard-pro-refactor/src`). Cada figura tiene su fuente Mermaid (`.mmd`) y su imagen (`.png`) en esta carpeta. La numeración "Figura N" la asigna el documento final; aquí solo se proponen los títulos.

---

## 1. Casos de uso

Los casos de uso se dividieron en tres figuras para que se lean a ancho de página. El sistema aparece como un recuadro con los casos agrupados por módulo, y los actores y sistemas externos quedan fuera. Mermaid no tiene diagrama de casos de uso nativo, así que se usó un *flowchart*: los casos son elipses alargadas, las asociaciones son líneas sólidas que salen del actor y las relaciones «include» son líneas punteadas.

### 1a. `01a-casos-uso-aprendiz.png`
**Título sugerido:** *Diagrama de casos de uso del aprendiz en OnBoard Pro*

El aprendiz inicia sesión con correo y contraseña o con Google o Microsoft. También puede recuperar la contraseña por correo y editar su perfil. Desde los cursos asignados a sus grupos consulta secciones, actividades y material, marca recursos como completados, rinde exámenes o juega concursos y sube entregas de tareas. En el módulo de gamificación consulta su XP, nivel y racha, sus logros, su historial de XP, el ranking (de organización, grupo o curso, por semana, mes o total) y sus pendientes. "Marcar recurso como completado" y "Rendir examen o jugar concurso" incluyen el caso "Acreditar XP, racha y nivel; evaluar logros", que es el núcleo de la gamificación.

### 1b. `01b-casos-uso-instructor.png`
**Título sugerido:** *Diagrama de casos de uso del instructor en OnBoard Pro*

El instructor crea y edita cursos con su portada, los publica, despublica o archiva, organiza las secciones, crea actividades y les asigna XP, sube material de apoyo y configura exámenes y concursos. En el seguimiento revisa entregas (las aprueba o pide que se rehagan), consulta los resultados de los exámenes, los participantes y el ranking del curso, y crea grupos. Al aprobar una entrega se incluye la acreditación de XP al aprendiz. Al crear una actividad se avisa por correo a los aprendices del curso (`AvisoService.actividadNueva`).

### 1c. `01c-casos-uso-administracion.png`
**Título sugerido:** *Diagrama de casos de uso de administración (Administrador y Superadministrador)*

El Administrador gestiona los usuarios de su organización. Puede listarlos, crearlos, editarlos (el cambio de rol queda auditado en `role_changes`), eliminarlos e importarlos de forma masiva desde CSV o Excel, con validación previa y plantilla descargable. También gestiona los grupos y la asignación de cursos a grupos (con aviso por correo), asigna instructores, elimina cursos después de ver su impacto y revisa la bandeja de entregas. En gamificación define la tabla de niveles, gestiona el catálogo de logros, previsualiza cuántas personas cumplirían un logro y cierra el periodo de ranking. Además consulta los pendientes y el tablero de indicadores. El Superadministrador hereda todos esos casos y además gestiona las organizaciones (nombre y dominio), elige sobre qué organización opera, administra los logros genéricos y consulta el tablero de toda la plataforma.

---

## 2. Diagramas de clases

### 2a. `02a-clases-dominio.png`
**Título sugerido:** *Modelo de dominio de OnBoard Pro*

El diagrama muestra las entidades principales con sus nombres reales en la base de datos, sus atributos clave y las cardinalidades que salen de las claves foráneas de `scripts/schema.sql`. La organización (`tenants`) agrupa usuarios, grupos, cursos, tablas de niveles y logros propios; un logro con `tenant_id` nulo es genérico. Las relaciones muchos a muchos usuario–grupo y grupo–curso se resuelven con `users_groups` y `groups_courses`. Un curso se compone de secciones, y las secciones contienen actividades: si se borra la sección, la actividad queda sin sección (agregación). Una actividad tiene material, preguntas con sus opciones, intentos de examen y entregas. `xp_movimientos` es el libro de XP: cada fila viene de una actividad o de un logro. `logros_usuario` registra qué logro ganó cada persona. Para que el diagrama se lea, los valores posibles de los enumerados (`role`, `type`, `estado`) se detallan en los diagramas ER por área, y `password_resets` y `role_changes` aparecen solo en el ER de organización y usuarios.

### 2b. `02b-clases-servicios.png`
**Título sugerido:** *Diagrama de clases de la capa de servicios del backend*

Cada servicio es una clase de `services/` y la mayoría expone métodos estáticos (subrayados). Los parámetros se abreviaron. Las flechas punteadas son dependencias reales (`require`). `ExamenService` y `EntregaService` acreditan XP a través de `GamificationService.acreditar`. Este, a su vez, usa `NivelesService.tablaDe` y `DesbloqueoService.evaluar`, que vuelve a llamar a `recalcular` cuando un logro paga XP. `GroupService`, `ActivitiesService` y `CourseService` envían avisos por correo mediante `AvisoService`. `ImportacionService` crea usuarios a través de `UserService`.

---

## 3. `03-secuencia-completar-actividad.png`
**Título sugerido:** *Diagrama de secuencia del flujo "Marcar como completada" y la acreditación de XP*

El aprendiz pulsa el botón y el hook `useCompleteActivity` hace primero una actualización optimista. Luego envía `POST /api/gamification/activities/:id/completar` con el JWT. `verifyJWT` fija `req.user` y el controlador obtiene el `tenantId` del token. `GamificationService.completarActividad` consulta en paralelo (Promise.all) la actividad filtrada por organización y `asegurarPublicado`, que a su vez consulta en paralelo el curso de la actividad y los cursos asignados a los grupos del aprendiz. Las respuestas posibles son 404 (no existe o es de otra organización, o curso no asignado) y 409 (curso cerrado o archivado, o tipo distinto de Recurso). Después se llama a la RPC `acreditar_xp`, que es atómica, aplica el tope diario y respeta el UNIQUE (user_id, activity_id): la segunda vez responde 409. En paralelo se registra el día activo (racha) y se recalcula el XP (RPC `recalcular_xp` junto con la tabla de niveles y después `subir_nivel`). Luego `DesbloqueoService.evaluar` otorga logros con la RPC `otorgar_logro`, en hasta tres vueltas si algún logro paga XP. La respuesta trae `xpGanado`, `nivel`, `subioDeNivel`, `racha` y `logrosDesbloqueados`, y el front la celebra (`celebrar`).

---

## 4. `04-arquitectura-componentes.png`
**Título sugerido:** *Arquitectura de componentes de OnBoard Pro*

El navegador usa el front React 19 + TanStack Start/Router/Query, desplegado en Vercel, que llama a la API REST con `Authorization: Bearer <JWT>` (el token se guarda en la cookie `session_token`). La API Express, desplegada en Render, está organizada en capas: `index.js` (CORS con lista de orígenes, `express.json` de 1 MB, sesión solo para el *state* de OAuth y Passport), luego routes (14 routers), middlewares (`verifyJWT`, `requireRole`, `subida` con multer en memoria e `intentos` como freno de fuerza bruta), controllers, services y helpers. La persistencia es Supabase: PostgreSQL vía PostgREST con la clave secreta del servidor, más funciones RPC atómicas, y Storage con un bucket público `banners` y un bucket privado `materiales` que se lee con URL firmada. Los servicios externos son Google OAuth, Microsoft OAuth y Brevo (API HTTP de correo; sin clave, el backend funciona en "modo consola"). La documentación OpenAPI se sirve en `/api-docs`. El aislamiento multiempresa se aplica en controllers y services.

## 5. `05-despliegue.png`
**Título sugerido:** *Diagrama de despliegue de OnBoard Pro*

El diagrama muestra los nodos reales y sus protocolos. El navegador se conecta por HTTPS al front en Vercel (`onboard-pro-refactor.vercel.app`) y a la API en Render (`onboardpro.onrender.com`) por HTTPS/REST con JWT Bearer. El front también llama a la API cuando renderiza en el servidor. Desde Render, la API usa HTTPS hacia Supabase (PostgREST y Storage), hacia Google y Microsoft (OAuth 2.0) y hacia Brevo. En GitHub existe un workflow de GitHub Actions que despliega a Azure App Service. Ese despliegue es heredado y no está vigente. Ver la sección "Despliegue real".

## 6. Modelo relacional (ER)

### 6a. `06a-er-general.png`
**Título sugerido:** *Modelo entidad-relación general (claves primarias y foráneas)*

Muestra las 19 tablas de `scripts/schema.sql` con sus PK y FK y la cardinalidad en notación pata de gallo. Para que se pueda leer, faltan las líneas de tres FK de auditoría hacia `users` (`materiales.subido_por`, `entregas.revisado_por`, `role_changes.autor_id`) y las líneas `tenant_id` de las tablas hijas. Esas FK sí figuran como atributo y aparecen dibujadas en los ER por área.

### 6b. `06b-er-organizacion-usuarios.png`
**Título sugerido:** *Modelo ER del área de organización y usuarios*

### 6c. `06c-er-cursos-contenidos.png`
**Título sugerido:** *Modelo ER del área de cursos y contenidos*

### 6d. `06d-er-evaluacion-entregas.png`
**Título sugerido:** *Modelo ER del área de evaluación y entregas*

### 6e. `06e-er-gamificacion.png`
**Título sugerido:** *Modelo ER del área de gamificación*

Los cuatro ER por área incluyen los tipos de dato, las restricciones UNIQUE y CHECK principales y la acción de borrado de las FK cuando no es la habitual (`SET NULL`, `CASCADE`). Además de las tablas, el esquema define funciones PL/pgSQL que se invocan por RPC y garantizan atomicidad: `acreditar_xp`, `recalcular_xp`, `subir_nivel`, `otorgar_logro`, `ranking_curso`, `guardar_examen`, `editar_pregunta` y `guardar_niveles`.

#### Entidades principales

| Tabla | Propósito |
|---|---|
| `tenants` | Organización cliente (empresa). Su `domain` asocia los inicios de sesión con Google o Microsoft y `xp_tope_diario` limita el XP que se puede ganar por día. |
| `users` | Persona con rol `student`, `instructor`, `admin` o `superadmin`. Guarda de forma desnormalizada su XP total, nivel y racha. |
| `password_resets` | Enlaces de recuperación de contraseña. Se guarda solo el hash SHA-256 del token. |
| `role_changes` | Auditoría de los cambios de rol: quién, cuándo, valor anterior y valor nuevo. |
| `groups` | Equipos de la organización. Son la unidad de asignación de cursos. |
| `users_groups` | Relación N:M entre personas y grupos. |
| `courses` | Curso de onboarding: `status` Abierto (publicado) o Cerrado, archivado, portada e instructor (por correo). |
| `groups_courses` | Asignación N:M de cursos a grupos. |
| `sections` | Secciones ordenadas de un curso. |
| `activities` | Recurso, Tarea, Examen o Concurso, con el XP que otorga y la configuración de examen o concurso. |
| `materiales` | Archivos de apoyo de una actividad (ruta en el bucket privado de Storage). |
| `preguntas` / `opciones` | Banco de preguntas de un examen o concurso, con dificultad, y sus opciones de respuesta. |
| `intentos_examen` | Cada intento de examen o partida de concurso, con las respuestas corregidas (JSONB) y el resultado. |
| `entregas` | Entrega de una tarea. Su estado es `entregado`, `aprobada` o `rehacer`, con la retroalimentación del revisor. |
| `xp_movimientos` | Libro de XP y fuente de verdad del puntaje. Su UNIQUE (user_id, activity_id) impide cobrar dos veces la misma actividad. |
| `niveles` | Tabla de niveles propia de una organización. Si no existe, se usa la curva por defecto 25·n·(n+3). |
| `logros` | Catálogo de logros genéricos, de organización o de curso, con su condición, meta y XP de recompensa. |
| `logros_usuario` | Logros desbloqueados por cada persona (UNIQUE logro_id, user_id). |

---

## 7. `07-aislamiento-multiempresa.png`
**Título sugerido:** *Flujo del aislamiento multiempresa desde el token hasta la consulta*

Muestra cómo viaja el `tenantId` desde el inicio de sesión hasta cada consulta. Va dentro del JWT firmado, `verifyJWT` lo fija en `req.user` y el controlador lo toma de ahí. El superadministrador es la excepción: elige la organización por *query* o *body*, o usa null para ver todas. El servicio filtra con `.eq("tenant_id", ...)`. Si la fila no aparece, la API responde 404 igual que si el recurso no existiera.

---

## Mecanismo de aislamiento multiempresa

**Modelo.** Es un modelo de base de datos compartida y esquema compartido con una columna discriminadora `tenant_id`. Las tablas que tienen `tenant_id` son: `users`, `groups`, `courses`, `sections`, `activities`, `materiales`, `preguntas`, `intentos_examen`, `entregas`, `xp_movimientos`, `role_changes`, `logros` (null = logro genérico), `logros_usuario` y `niveles` (NOT NULL). Las que no lo tienen dependen de una tabla padre que sí lo tiene: `users_groups`, `groups_courses`, `password_resets` y `opciones`. El `tenant_id` se repite a propósito en las tablas hijas, por ejemplo en `sections`, para que el filtro de aislamiento sea una sola condición y no un *join* (comentario en `schema.sql`).

**De dónde sale el `tenantId`.** `AuthService` firma un JWT de 3 horas con `{ id, email, tenantId, role }`. En el inicio de sesión local el valor sale de `users.tenant_id`. En el inicio con Google o Microsoft, la organización se resuelve por el dominio del correo (`TenantService.getByDomain`) y, si la persona no existe, se crea como `student` de esa organización. El middleware `verifyJWT` valida la firma con `JWT_SECRET` y fija `req.user`, así que el cliente no puede cambiar su organización sin invalidar el token.

**Dónde se aplica.** Los controladores toman el `tenantId` de `req.user` y nunca del cuerpo de la petición, con la regla `req.user.role === "superadmin" ? null : req.user.tenantId`. Los servicios lo aplican en cada consulta con `.eq("tenant_id", tenantId)` y, al crear registros, copian el `tenant_id` en la fila nueva. Para el aprendiz se agrega una segunda barrera: el curso tiene que estar asignado a uno de sus grupos (`asegurarAsignado` y `asegurarPublicado` en `helpers/cursoDeActividad.js`).

**Superadministrador.** Con `tenantId = null` las consultas no se filtran y ve todas las organizaciones. Para operar sobre una organización concreta, la indica en el *body* al crear usuarios, grupos, cursos o actividades, al importar usuarios y al cerrar el periodo de ranking, o en la *query* en niveles, logros, bandeja de entregas y tablero.

**Respuesta ante recursos ajenos.** Si se pide un recurso de otra organización, la consulta filtrada no devuelve nada y la API responde 404 "no encontrado", igual que si no existiera. Así no se confirma que el recurso existe. Ejemplos: `UserController.getById`, `GamificationService.completarActividad` y el ranking por grupo.

**Por qué sin RLS.** El backend accede a Supabase con la clave secreta del servidor (`SUPABASE_SECRET_KEY`, rol de servicio), que omite las políticas de Row Level Security. Por eso la base no aplica el aislamiento: depende de que cada consulta de la API incluya el filtro. Hay razones para este diseño: toda la autorización vive en un solo lugar (Node, donde también se validan roles y asignaciones), el front nunca habla directamente con la base y supabase-js no ofrece transacciones, así que las operaciones críticas se resolvieron con funciones RPC.

**Riesgos y mejoras.**
- *Riesgo principal:* basta con una consulta nueva que olvide `.eq("tenant_id", …)` para filtrar datos de otra organización. Lo mitigan la revisión de código y las pruebas, pero la base no lo impide.
- *Funciones RPC:* reciben `p_tenant` o `p_user` desde Node y no validan la pertenencia por sí mismas.
- *Mejoras:* (1) activar RLS en las tablas con `tenant_id` y que el backend use un JWT de Supabase con el `tenant_id` como *claim* (o `SET app.tenant_id` por transacción) en lugar de la clave de servicio; (2) centralizar el filtro en un helper o *query builder* por organización para que no dependa de cada servicio; (3) agregar pruebas automáticas de "acceso cruzado" por endpoint; (4) restringir las funciones RPC con `SECURITY INVOKER` y políticas, o validar `p_tenant` dentro de ellas.

---

## Despliegue real

Esto es lo que se verificó en los repositorios y lo que confirmó la coordinación con las URL públicas:

- **Front-end:** Vercel. `onboard-pro-refactor/vercel.json` declara `"framework": "tanstack-start"`. La URL productiva es `https://onboard-pro-refactor.vercel.app` (responde y redirige a `/auth`). La URL de la API se configura con `VITE_API_URL`.
- **Backend vigente:** Render, `https://onboardpro.onrender.com` (`/api-docs` responde 200). Lo respaldan `.env.example` (URLs de producción y callbacks de OAuth en `onboardpro.onrender.com`), la lista de orígenes CORS en `index.js` y comentarios del código: memoria del freno de intentos "para la instancia única de Render" y "el disco de Render es efímero" en `middlewares/subida.js`. El arranque es `npm start` → `node index.js`. No hay `render.yaml` en el repositorio, así que la configuración del servicio (incluido el despliegue automático desde GitHub) vive en el panel de Render y no se pudo revisar.
- **Pipeline heredado:** `.github/workflows/main_onboardpro-back.yml` ("Deploy to Azure App Service") despliega en cada *push* a `main` hacia el App Service `onboardpro-back` con `azure/webapps-deploy` (OIDC). `web.config` (iisnode) es parte de ese despliegue. Se modificó por última vez el 12-11-2025, y `https://onboardpro-back.azurewebsites.net` responde 500, así que es un despliegue **heredado y no vigente**, aunque el workflow todavía se dispara.
- **Base de datos y archivos:** Supabase (PostgreSQL + PostgREST + Storage).
- **Correo:** Brevo por su API HTTP (`helpers/mailer.js`). No se usa SMTP ni nodemailer. Sin `BREVO_API_KEY`, el backend imprime los correos en el log ("modo consola").
- **Observación:** el `README.md` del backend está desactualizado. Menciona Firebase Firestore, Google Drive y Azure como despliegue, pero el código actual usa Supabase (y `helpers/storage.js` reemplazó a `driveController.js`).
