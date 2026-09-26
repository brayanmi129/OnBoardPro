-- OnBoardPro — Schema PostgreSQL para Supabase
-- Ejecutar en: Supabase Dashboard → SQL Editor

CREATE TABLE IF NOT EXISTS tenants (
  id          VARCHAR(50) PRIMARY KEY,
  name        VARCHAR(100) NOT NULL,
  domain      VARCHAR(100) NOT NULL UNIQUE,
  active      BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id          VARCHAR(50) PRIMARY KEY,
  tenant_id   VARCHAR(50) REFERENCES tenants(id) ON DELETE SET NULL,
  email       VARCHAR(255) NOT NULL UNIQUE,
  password    VARCHAR(255),
  firstname   VARCHAR(100),
  lastname    VARCHAR(255),
  phonumber   VARCHAR(30),
  role        VARCHAR(20) DEFAULT 'student' CHECK (role IN ('student', 'instructor', 'admin', 'superadmin')),
  status      VARCHAR(20) DEFAULT 'Active' CHECK (status IN ('Active', 'Inactive')),
  level       INTEGER DEFAULT 0,
  xp          INTEGER DEFAULT 0,
  streak      INTEGER DEFAULT 0,
  average     DECIMAL(5,2) DEFAULT 0,
  missions    VARCHAR(50) DEFAULT '0/0',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS groups (
  id          VARCHAR(50) PRIMARY KEY,
  tenant_id   VARCHAR(50) REFERENCES tenants(id) ON DELETE CASCADE,
  name        VARCHAR(100) NOT NULL,
  description TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS courses (
  id          VARCHAR(50) PRIMARY KEY,
  tenant_id   VARCHAR(50) REFERENCES tenants(id) ON DELETE CASCADE,
  name        VARCHAR(100) NOT NULL,
  instructor  VARCHAR(255),
  grupo       VARCHAR(50),
  status      VARCHAR(20) DEFAULT 'Abierto' CHECK (status IN ('Abierto', 'Cerrado')),
  actividades TEXT[] DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS activities (
  id          VARCHAR(50) PRIMARY KEY,
  name        VARCHAR(100) NOT NULL,
  type        VARCHAR(20) DEFAULT 'Recurso' CHECK (type IN ('Tarea', 'Recurso', 'Examen')),
  title       VARCHAR(255) NOT NULL,
  description TEXT,
  adjunto     TEXT NOT NULL,
  deliverable BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users_groups (
  id          SERIAL PRIMARY KEY,
  id_user     VARCHAR(50) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  id_group    VARCHAR(50) NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(id_user, id_group)
);

CREATE TABLE IF NOT EXISTS groups_courses (
  id          SERIAL PRIMARY KEY,
  id_group    VARCHAR(50) NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  id_course   VARCHAR(50) NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(id_group, id_course)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_users_tenant    ON users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_users_email     ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role      ON users(role);
CREATE INDEX IF NOT EXISTS idx_groups_tenant   ON groups(tenant_id);
CREATE INDEX IF NOT EXISTS idx_courses_tenant  ON courses(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ug_user         ON users_groups(id_user);
CREATE INDEX IF NOT EXISTS idx_ug_group        ON users_groups(id_group);
CREATE INDEX IF NOT EXISTS idx_gc_group        ON groups_courses(id_group);
CREATE INDEX IF NOT EXISTS idx_gc_course       ON groups_courses(id_course);

-- Enlaces de recuperación de contraseña (HU-010).
-- Tabla aparte y no columnas en users: así se puede expirar, auditar quién
-- pidió cuántos y limpiar los vencidos sin tocar al usuario.
-- token_hash guarda el SHA-256 del token, nunca el token: si alguien lee la
-- base no puede restablecer contraseñas ajenas.
CREATE TABLE IF NOT EXISTS password_resets (
  id          VARCHAR(50) PRIMARY KEY,
  user_id     VARCHAR(50) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  VARCHAR(64) NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_password_resets_user ON password_resets(user_id);

-- Portada del curso y empresa dueña de la actividad.
-- banner_url guarda la URL pública de Supabase Storage (bucket "banners").
-- activities.tenant_id faltaba: sin él las actividades no se pueden aislar
-- por empresa como el resto (HU-006).
ALTER TABLE courses    ADD COLUMN IF NOT EXISTS banner_url TEXT;
ALTER TABLE activities ADD COLUMN IF NOT EXISTS tenant_id  VARCHAR(50) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE activities ADD COLUMN IF NOT EXISTS mime       VARCHAR(100);

CREATE INDEX IF NOT EXISTS idx_activities_tenant ON activities(tenant_id);

-- ── Secciones del curso (HU-032) ────────────────────────────────────────────
-- Un curso se divide en secciones ordenadas, y cada sección agrupa actividades
-- (recursos, tareas, exámenes y juegos). Reemplaza a courses.actividades, que
-- era un array de ids sin orden ni agrupación posible.
--
-- tenant_id se repite acá aunque se pueda deducir del curso: así el filtro de
-- aislamiento es una sola condición y no un join en cada consulta.
CREATE TABLE IF NOT EXISTS sections (
  id          VARCHAR(50) PRIMARY KEY,
  course_id   VARCHAR(50) NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  tenant_id   VARCHAR(50) REFERENCES tenants(id) ON DELETE CASCADE,
  name        VARCHAR(120) NOT NULL,
  orden       INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sections_course ON sections(course_id, orden);

-- ON DELETE SET NULL y no CASCADE: borrar una sección no debe borrar el
-- material que hay dentro. La actividad queda sin sección y se puede reubicar.
ALTER TABLE activities ADD COLUMN IF NOT EXISTS section_id VARCHAR(50) REFERENCES sections(id) ON DELETE SET NULL;
ALTER TABLE activities ADD COLUMN IF NOT EXISTS orden      INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_activities_section ON activities(section_id, orden);

-- ── XP y niveles (HU-051, HU-052, HU-054) ───────────────────────────────────
-- Cuánto XP otorga cada actividad. 0 = no otorga nada.
ALTER TABLE activities ADD COLUMN IF NOT EXISTS xp INTEGER NOT NULL DEFAULT 0;

-- Libro de movimientos de XP. Dos funciones en una sola tabla:
--   1. registra qué completó cada persona (no hay otra tabla de "completado")
--   2. deja auditable de dónde salió cada punto
--
-- users.xp es la suma de estas filas. Guardarlo además en users es
-- desnormalizar a propósito: el ranking y el perfil lo leen en cada carga y
-- sumar el historial cada vez sería caro. La fuente de verdad es esta tabla.
CREATE TABLE IF NOT EXISTS xp_movimientos (
  id          VARCHAR(50) PRIMARY KEY,
  user_id     VARCHAR(50) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id   VARCHAR(50) REFERENCES tenants(id) ON DELETE CASCADE,
  activity_id VARCHAR(50) REFERENCES activities(id) ON DELETE SET NULL,
  xp          INTEGER NOT NULL,
  motivo      VARCHAR(40) NOT NULL DEFAULT 'actividad_completada',
  created_at  TIMESTAMPTZ DEFAULT NOW(),

  -- La misma persona no puede cobrar dos veces la misma actividad. Es la base
  -- la que lo impide, no el código: si dos peticiones llegan a la vez, una
  -- falla por la restricción en vez de acreditar doble.
  CONSTRAINT xp_una_vez_por_actividad UNIQUE (user_id, activity_id)
);

CREATE INDEX IF NOT EXISTS idx_xp_user ON xp_movimientos(user_id);
