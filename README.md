# OnBoardPro — Backend API

Plataforma multi-tenant de onboarding y e-learning con gamificación. Permite a múltiples organizaciones (escuelas, empresas) gestionar sus propios cursos, grupos y usuarios de forma aislada.

## Stack tecnológico

| Capa | Tecnología |
|------|-----------|
| Runtime | Node.js + Express 4 |
| Base de datos | Firebase Firestore (NoSQL) |
| Autenticación | JWT + Passport.js (Google OAuth, Microsoft OAuth) |
| Validación | Zod 3 |
| Contraseñas | bcrypt |
| Archivos | Google Drive API |
| Documentación | Swagger / OpenAPI 3 |
| Deploy | Azure App Service + GitHub Actions CI/CD |

---

## Arquitectura

### Multi-tenant

Cada organización es un **tenant** identificado por su dominio de email. Los usuarios cuyo correo pertenece a un dominio registrado pueden iniciar sesión automáticamente via OAuth — si no existen, se crean como `student`.

```
Tenant: { name: "Universidad Central", domain: "ucentral.edu.co" }

@ucentral.edu.co  →  login con Google/Microsoft  →  usuario auto-creado en ese tenant
admin@onboardpro.com  →  login local (email + contraseña)  →  superadmin
```

### Capas

```
Routes → Controllers → Services → Firestore
```

- **Routes**: definen endpoints y aplican middlewares (`verifyJWT`, `requireRole`)
- **Controllers**: reciben `req/res`, delegan al service, manejan errores HTTP
- **Services**: lógica de negocio y consultas a Firestore
- **Schemas**: validación de datos con Zod
- **Middlewares**: JWT y control de roles

### Roles

| Rol | Descripción |
|-----|-------------|
| `superadmin` | Acceso total a todos los tenants. Solo login local. |
| `admin` | Gestiona usuarios, grupos y cursos de su tenant. |
| `instructor` | Crea cursos y actividades dentro de su tenant. |
| `student` | Ve y completa cursos de su tenant. |

---

## Variables de entorno

Crea un archivo `.env` en la raíz:

```env
PORT=3000
NODE_ENV=development

# JWT
JWT_SECRET=tu-secret-muy-largo-y-aleatorio

# Sesión Express
SESSION_SECRET=otro-secret-muy-largo

# Firebase Admin (JSON completo como string)
FIREBASE_CONFIG={"type":"service_account","project_id":"..."}

# OAuth Google
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# OAuth Microsoft
MICROSOFT_CLIENT_ID=
MICROSOFT_CLIENT_SECRET=

# URLs
URL_FRONT=http://localhost:5173
URL_BACKEND=http://localhost:3000

# Google Drive (para subir archivos de actividades)
REFRESH_TOKEN=
```

---

## Instalación y ejecución

```bash
# 1. Instalar dependencias
npm install

# 2. Crear .env con las variables de arriba

# 3. Inicializar la BD (primer tenant + superadmin)
node scripts/seed.js

# 4. Ejecutar en desarrollo
npm run dev
```

| URL | Descripción |
|-----|-------------|
| `http://localhost:3000` | Panel visual de pruebas (HTML) |
| `http://localhost:3000/api-docs` | Documentación Swagger / OpenAPI |

---

## Script de seed

Crea el primer tenant de ejemplo y el superadmin de plataforma con contraseña aleatoria.

```bash
node scripts/seed.js
```

Salida esperada:
```
✅ Tenant creado
   Nombre : Universidad Central
   Dominio: ucentral.edu.co
   ID     : a1b2c3d4

✅ Superadmin creado
   Email     : admin@onboardpro.com
   Contraseña: Xk9mP2qR7nLs4wBv
   ID        : e5f6g7
```

Para agregar más tenants usa `POST /api/tenants/create` con el token del superadmin.

---

## Endpoints principales

La documentación completa está en `/api-docs` (Swagger).

### Auth — `/api/auth`

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| POST | `/localuser` | No | Login email + contraseña |
| GET | `/google` | No | Inicia OAuth Google |
| GET | `/google/callback` | No | Callback OAuth Google |
| GET | `/microsoft` | No | Inicia OAuth Microsoft |
| GET | `/microsoft/callback` | No | Callback OAuth Microsoft |
| GET | `/me` | JWT | Datos del usuario autenticado |

### Tenants — `/api/tenants` *(solo superadmin)*

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/get/all` | Lista todos los tenants |
| GET | `/get/id/:id` | Tenant por ID |
| POST | `/create` | Crear tenant |
| PUT | `/update/:id` | Actualizar tenant |
| DELETE | `/delete/:id` | Eliminar tenant |

**Body para crear tenant:**
```json
{ "name": "Universidad Central", "domain": "ucentral.edu.co" }
```

### Usuarios — `/api/users`

| Método | Ruta | Rol mínimo | Descripción |
|--------|------|-----------|-------------|
| GET | `/get/all` | admin | Usuarios del tenant |
| GET | `/get/id/:id` | JWT | Usuario por ID |
| GET | `/get/email/:email` | admin | Usuario por email |
| GET | `/get/role/:role` | admin | Usuarios por rol |
| POST | `/create` | admin | Crear usuario en el tenant |
| PUT | `/update/:id` | admin | Actualizar usuario |
| DELETE | `/delete/:id` | admin | Eliminar usuario |

### Cursos — `/api/courses`

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| GET | `/get/all` | No | Todos los cursos |
| GET | `/get/id/:id` | No | Curso por ID |
| POST | `/create` | No | Crear curso |
| GET | `/me` | JWT | Cursos del usuario autenticado |

### Actividades — `/api/activities`

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/get/all` | Todas las actividades |
| POST | `/create` | Crear actividad (multipart/form-data con archivo) |

### Grupos — `/api/groups`

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/get/all` | Todos los grupos |
| GET | `/get/id/:id` | Grupo por ID |
| POST | `/create` | Crear grupo |
| PUT | `/update/:id` | Actualizar grupo |
| POST | `/:id/add-users` | Agregar usuarios al grupo |
| DELETE | `/:id/remove-users` | Quitar usuarios del grupo |
| DELETE | `/delete/:id` | Eliminar grupo |

### Gamificación — `/api/gamification`

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/ranking` | Ranking de usuarios por nivel/XP |

---

## Estructura de la base de datos

Ver [`db.diagrama.txt`](./db.diagrama.txt) — compatible con [dbdiagram.io](https://dbdiagram.io).

### Colecciones en Firestore

| Colección | Descripción |
|-----------|-------------|
| `tenants` | Organizaciones registradas en la plataforma |
| `users` | Usuarios (con `tenantId` y `role`) |
| `courses` | Cursos por tenant |
| `groups` | Grupos por tenant |
| `activities` | Actividades de un curso |
| `users_groups` | Relación usuario ↔ grupo |
| `groups_courses` | Relación grupo ↔ curso |

### Colecciones pendientes de implementar

| Colección | Descripción |
|-----------|-------------|
| `assessments` | Evaluaciones de opción múltiple |
| `questions` | Preguntas de una evaluación |
| `options` | Opciones de respuesta |
| `user_answers` | Respuestas de los usuarios |

---

## Pendiente de implementar

- [ ] Sistema de evaluaciones (Assessment / Question / Option / UserAnswer)
- [ ] Tracking de progreso por usuario (actividades completadas)
- [ ] Endpoint para asignar cursos a grupos (`group_course`)
- [ ] Lógica de gamificación: otorgar XP al completar actividades/evaluaciones, subir de nivel
- [ ] Protección de rutas de cursos y grupos con JWT + roles
- [ ] Cambio de contraseña desde el perfil del usuario
