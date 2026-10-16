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


-- ── Auditoría de cambios de rol (HU-018) ────────────────────────────────────
-- Quién cambió el rol de quién, cuándo y desde qué valor. Un cambio de rol
-- reparte permisos, así que tiene que quedar rastro.
--
-- autor_email se guarda copiado y no solo por referencia: si esa persona se
-- elimina de la plataforma, el registro debe seguir diciendo quién lo hizo.
-- Por eso autor_id es SET NULL y el correo queda escrito.
CREATE TABLE IF NOT EXISTS role_changes (
  id           VARCHAR(50) PRIMARY KEY,
  user_id      VARCHAR(50) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id    VARCHAR(50) REFERENCES tenants(id) ON DELETE SET NULL,
  rol_anterior VARCHAR(20),
  rol_nuevo    VARCHAR(20) NOT NULL,
  autor_id     VARCHAR(50) REFERENCES users(id) ON DELETE SET NULL,
  autor_email  VARCHAR(255),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_role_changes_user ON role_changes(user_id, created_at DESC);

-- ── Entregas (HU-046, HU-048, HU-050) ─────────────────────────────
-- Esto es onboarding, no un curso con notas: a nadie se le pone un 85. Se
-- revisa el trabajo y se decide si está bien o si hay que rehacerlo.
--
--   entregado  esperando revisión           el aprendiz puede reemplazarla
--   rehacer    el instructor pidió cambios  el aprendiz puede reemplazarla
--   aprobada   lista                        se acredita el XP, ya no se toca
--
-- El estado "rehacer" es lo que resuelve HU-050 (permitir reenvío) sin tener
-- que guardar un historial de intentos.
CREATE TABLE IF NOT EXISTS entregas (
  id            VARCHAR(50) PRIMARY KEY,
  activity_id   VARCHAR(50) NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  user_id       VARCHAR(50) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id     VARCHAR(50) REFERENCES tenants(id) ON DELETE CASCADE,
  archivo       TEXT,
  mime          VARCHAR(100),
  comentario    TEXT,
  estado        VARCHAR(20) NOT NULL DEFAULT 'entregado'
                CHECK (estado IN ('entregado', 'aprobada', 'rehacer')),
  entregado_at  TIMESTAMPTZ DEFAULT NOW(),
  feedback      TEXT,
  revisado_por  VARCHAR(50) REFERENCES users(id) ON DELETE SET NULL,
  revisado_at   TIMESTAMPTZ,

  CONSTRAINT una_entrega_por_actividad UNIQUE (activity_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_entregas_actividad ON entregas(activity_id, estado);
CREATE INDEX IF NOT EXISTS idx_entregas_user ON entregas(user_id);

-- ── Exámenes (HU-041) ───────────────────────────────────────────────────────
-- Un examen no es una entidad aparte: es una actividad de tipo 'Examen' con
-- preguntas colgando. Así hereda sección, curso, empresa y XP sin duplicar nada.
--
-- El puntaje total NO se guarda: se calcula sumando el de sus preguntas. Si se
-- guardara aparte, agregar una pregunta lo dejaría desactualizado y tendríamos
-- dos números que se contradicen.
ALTER TABLE activities ADD COLUMN IF NOT EXISTS tiempo_limite INTEGER;
ALTER TABLE activities ADD COLUMN IF NOT EXISTS intentos_permitidos INTEGER NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS preguntas (
  id          VARCHAR(50) PRIMARY KEY,
  activity_id VARCHAR(50) NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  tenant_id   VARCHAR(50) REFERENCES tenants(id) ON DELETE CASCADE,
  enunciado   TEXT NOT NULL,
  puntaje     INTEGER NOT NULL DEFAULT 1,
  orden       INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Las opciones se borran con su pregunta: solas no significan nada.
CREATE TABLE IF NOT EXISTS opciones (
  id          VARCHAR(50) PRIMARY KEY,
  pregunta_id VARCHAR(50) NOT NULL REFERENCES preguntas(id) ON DELETE CASCADE,
  texto       TEXT NOT NULL,
  es_correcta BOOLEAN NOT NULL DEFAULT FALSE,
  orden       INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_preguntas_actividad ON preguntas(activity_id, orden);
CREATE INDEX IF NOT EXISTS idx_opciones_pregunta ON opciones(pregunta_id, orden);


-- ---------------------------------------------------------------- HU-058
-- La columna `streak` ya existía en users, pero nada la actualizaba porque no
-- había dónde guardar el último día activo: sin esa fecha no se puede saber si
-- la racha sigue o se cortó.
ALTER TABLE users ADD COLUMN IF NOT EXISTS ultima_actividad DATE;

-- La racha máxima se guarda aparte porque la actual se pierde al cortarse, y
-- los logros de constancia preguntan si alguna vez se llegó a N días.
ALTER TABLE users ADD COLUMN IF NOT EXISTS racha_maxima INTEGER DEFAULT 0;


-- ---------------------------------------------------------------- HU-059
-- Un logro es la definición de una meta, no el hecho de haberla conseguido.
-- Quién lo desbloqueó se guardará aparte cuando se implemente HU-061.
CREATE TABLE IF NOT EXISTS logros (
  id             VARCHAR(50) PRIMARY KEY,
  tenant_id      VARCHAR(50) REFERENCES tenants(id) ON DELETE CASCADE,
  nombre         VARCHAR(100) NOT NULL,
  descripcion    TEXT,
  categoria      VARCHAR(30) NOT NULL
                 CHECK (categoria IN ('Progreso', 'Constancia', 'Nivel', 'Ranking', 'Entregas', 'Juegos')),

  -- Qué se mide. La lista sale de la hoja "Condiciones y disparadores" del
  -- backlog, menos las condiciones de nota: en onboarding no hay calificación,
  -- la entrega se aprueba o se pide rehacer.
  tipo_condicion VARCHAR(40) NOT NULL
                 CHECK (tipo_condicion IN (
                   'actividades_completadas',
                   'secciones_completadas',
                   'cursos_completados',
                   'racha_dias',
                   'nivel_alcanzado',
                   'entregas_aprobadas',
                   'posicion_ranking',
                   'juegos_completados'
                 )),

  -- Cuánto hace falta: 10 actividades, 7 días, nivel 5, puesto 1.
  meta           INTEGER NOT NULL CHECK (meta > 0),

  -- XP que paga el logro al desbloquearse. Puede ser 0: hay logros que valen
  -- por la insignia y no por los puntos.
  xp_recompensa  INTEGER NOT NULL DEFAULT 0 CHECK (xp_recompensa >= 0),

  activo         BOOLEAN DEFAULT TRUE,
  creado_por     VARCHAR(50) REFERENCES users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- Dos logros con el mismo nombre en una organización serían indistinguibles en
-- la interfaz. Se compara en minúsculas para que "Primer paso" y "primer paso"
-- choquen.
CREATE UNIQUE INDEX IF NOT EXISTS logros_nombre_unico
  ON logros (tenant_id, lower(nombre));

CREATE INDEX IF NOT EXISTS logros_tenant ON logros (tenant_id);
