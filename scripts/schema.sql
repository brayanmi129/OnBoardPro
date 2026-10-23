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


-- HU-037, HU-038 y HU-039: material de apoyo.
--
-- Las tres historias hablan de "archivos" en plural, pero la actividad tenia
-- una sola columna `adjunto`: subir otro reemplazaba al anterior. Los
-- materiales pasan a una tabla propia, uno por fila.
CREATE TABLE IF NOT EXISTS materiales (
  id          VARCHAR(50) PRIMARY KEY,
  activity_id VARCHAR(50) NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  tenant_id   VARCHAR(50) REFERENCES tenants(id) ON DELETE CASCADE,
  -- El nombre con el que se subio, para mostrarlo. La ruta del bucket lleva un
  -- identificador aleatorio y no sirve para que una persona lo reconozca.
  nombre      TEXT NOT NULL,
  ruta        TEXT NOT NULL,
  mime        VARCHAR(100),
  tamano      INTEGER,
  orden       INTEGER NOT NULL DEFAULT 0,
  subido_por  VARCHAR(50) REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_materiales_actividad ON materiales(activity_id, orden);

-- Los adjuntos que ya estaban cargados pasan a ser el primer material de su
-- actividad. El NOT EXISTS deja volver a ejecutar esto sin duplicar nada.
INSERT INTO materiales (id, activity_id, tenant_id, nombre, ruta, mime, orden)
SELECT substr(md5(random()::text || a.id), 1, 16),
       a.id, a.tenant_id, regexp_replace(a.adjunto, '^.*/', ''), a.adjunto, a.mime, 0
FROM activities a
WHERE a.adjunto IS NOT NULL
  AND a.adjunto <> ''
  AND NOT EXISTS (SELECT 1 FROM materiales m WHERE m.activity_id = a.id);

-- Una actividad puede no tener material, y desde ahora los archivos viven en
-- `materiales`. La columna queda por compatibilidad con lo ya desplegado.
ALTER TABLE activities ALTER COLUMN adjunto DROP NOT NULL;


-- Un logro vive en uno de tres alcances, de mas general a mas concreto:
--
--   tenant_id NULL, course_id NULL  -> generico: lo crea el superadmin y vale
--                                      para todas las organizaciones
--                                      ("Completa tu primer curso")
--   tenant_id = X,  course_id NULL  -> de esa empresa, para todos sus cursos
--   tenant_id = X,  course_id = Y   -> de ese curso concreto
--                                      ("Terminaste Onboarding General")
ALTER TABLE logros ADD COLUMN IF NOT EXISTS course_id VARCHAR(50)
  REFERENCES courses(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS logros_curso ON logros (course_id);

-- Postgres considera distintos dos NULL, asi que el indice unico por empresa
-- no impide dos genericos con el mismo nombre. Hace falta uno aparte.
CREATE UNIQUE INDEX IF NOT EXISTS logros_nombre_generico
  ON logros (lower(nombre)) WHERE tenant_id IS NULL;

-- Aprobar un examen no estaba entre las condiciones y es de las mas naturales
-- en onboarding ("Aprobaste la evaluacion de seguridad").
ALTER TABLE logros DROP CONSTRAINT IF EXISTS logros_tipo_condicion_check;
ALTER TABLE logros ADD CONSTRAINT logros_tipo_condicion_check
  CHECK (tipo_condicion IN (
    'actividades_completadas',
    'secciones_completadas',
    'cursos_completados',
    'examenes_aprobados',
    'racha_dias',
    'nivel_alcanzado',
    'entregas_aprobadas',
    'posicion_ranking',
    'juegos_completados'
  ));


-- ---------------------------------------------------------------- Sprint 8
-- 4) Rendir el examen (HU-044, HU-045)
--
-- Qué porcentaje del puntaje hace falta para aprobar. No es una nota: en
-- onboarding el examen se aprueba o no, y aprobarlo es lo que paga el XP.
ALTER TABLE activities ADD COLUMN IF NOT EXISTS porcentaje_aprobacion INTEGER NOT NULL DEFAULT 70
  CHECK (porcentaje_aprobacion BETWEEN 1 AND 100);

-- Cada vez que alguien abre el examen es un intento. Se guarda al abrirlo, y
-- no al enviarlo, porque el tiempo límite se mide desde ahí: si se registrara
-- recién al enviar, cualquiera podría tomarse todo el tiempo que quisiera.
--
-- Las respuestas van en JSONB con la corrección ya hecha. Una tabla aparte por
-- respuesta no aporta nada: nunca se consultan sueltas, siempre con su intento.
CREATE TABLE IF NOT EXISTS intentos_examen (
  id             VARCHAR(50) PRIMARY KEY,
  activity_id    VARCHAR(50) NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  user_id        VARCHAR(50) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id      VARCHAR(50) REFERENCES tenants(id) ON DELETE CASCADE,
  numero         INTEGER NOT NULL,
  estado         VARCHAR(20) NOT NULL DEFAULT 'en_curso'
                 CHECK (estado IN ('en_curso', 'finalizado')),
  iniciado_at    TIMESTAMPTZ DEFAULT NOW(),
  finalizado_at  TIMESTAMPTZ,
  respuestas     JSONB,
  puntaje        INTEGER,
  puntaje_total  INTEGER,
  porcentaje     INTEGER,
  aprobado       BOOLEAN,

  -- Dos peticiones simultáneas no pueden abrir el mismo número de intento: es
  -- la base la que frena el doble clic, igual que con el XP.
  CONSTRAINT un_numero_por_intento UNIQUE (activity_id, user_id, numero)
);

CREATE INDEX IF NOT EXISTS idx_intentos_actividad ON intentos_examen(activity_id, user_id);
CREATE INDEX IF NOT EXISTS idx_intentos_aprobados ON intentos_examen(user_id) WHERE aprobado;

-- 5) Logros desbloqueados (HU-061, HU-062)
--
-- El catálogo dice qué se puede ganar; esta tabla dice quién lo ganó y cuándo.
-- El UNIQUE hace que un logro se gane una sola vez aunque dos acreditaciones
-- disparen la evaluación al mismo tiempo.
CREATE TABLE IF NOT EXISTS logros_usuario (
  id              VARCHAR(50) PRIMARY KEY,
  logro_id        VARCHAR(50) NOT NULL REFERENCES logros(id) ON DELETE CASCADE,
  user_id         VARCHAR(50) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id       VARCHAR(50) REFERENCES tenants(id) ON DELETE CASCADE,
  xp_otorgado     INTEGER NOT NULL DEFAULT 0,
  desbloqueado_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT un_logro_por_persona UNIQUE (logro_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_logros_usuario ON logros_usuario(user_id);

-- La recompensa de un logro entra al libro de XP como cualquier otro
-- movimiento, pero no viene de una actividad: se identifica por el logro. El
-- UNIQUE (user_id, activity_id) no la frena porque activity_id va en NULL.
ALTER TABLE xp_movimientos ADD COLUMN IF NOT EXISTS logro_id VARCHAR(50)
  REFERENCES logros(id) ON DELETE SET NULL;


-- ---------------------------------------------------------------- Logros transversales e íconos

-- 1) Ícono de los logros
--
-- Un emoji o el nombre de un ícono que entienda el front. Es opcional: si un
-- logro no tiene, la API devuelve uno genérico según su categoría.
ALTER TABLE logros ADD COLUMN IF NOT EXISTS icono VARCHAR(100);

-- 2) Catálogo transversal
--
-- Logros genéricos (tenant_id NULL): valen para todas las organizaciones y
-- solo el superadmin los edita. Cada empresa puede sumar los suyos encima.
--
-- Se insertan solo si no existe ya un genérico con ese nombre, así correr el
-- script dos veces no los duplica ni pisa los cambios que se les hayan hecho.
INSERT INTO logros (id, tenant_id, course_id, nombre, descripcion, categoria, tipo_condicion, meta, xp_recompensa, icono, activo)
SELECT v.id, NULL, NULL, v.nombre, v.descripcion, v.categoria, v.tipo_condicion, v.meta, v.xp_recompensa, v.icono, TRUE
FROM (VALUES
  ('logro-primer-paso',      'Primer paso',      'Completaste tu primera actividad.',              'Progreso',   'actividades_completadas', 1, 10,  '🚀'),
  ('logro-primer-examen',    'Primer examen',    'Aprobaste tu primer examen.',                    'Progreso',   'examenes_aprobados',      1, 20,  '📝'),
  ('logro-primera-entrega',  'Primera entrega',  'Te aprobaron tu primera entrega.',               'Entregas',   'entregas_aprobadas',      1, 20,  '📦'),
  ('logro-curso-terminado',  'Curso terminado',  'Completaste un curso al 100%.',                  'Progreso',   'cursos_completados',      1, 50,  '🎓'),
  ('logro-constante',        'Constante',        'Tuviste actividad 3 días seguidos.',             'Constancia', 'racha_dias',              3, 15,  '🔥'),
  ('logro-imparable',        'Imparable',        'Tuviste actividad 7 días seguidos.',             'Constancia', 'racha_dias',              7, 40,  '⚡'),
  ('logro-nivel-5',          'Nivel 5',          'Llegaste al nivel 5.',                           'Nivel',      'nivel_alcanzado',         5, 30,  '⭐'),
  ('logro-top-3',            'Top 3',            'Quedaste entre los 3 primeros del ranking.',     'Ranking',    'posicion_ranking',        3, 50,  '🏆')
) AS v(id, nombre, descripcion, categoria, tipo_condicion, meta, xp_recompensa, icono)
WHERE NOT EXISTS (
  SELECT 1 FROM logros l WHERE l.tenant_id IS NULL AND lower(l.nombre) = lower(v.nombre)
);

-- 3) Un logro genérico no puede estar atado a un curso
--
-- Un curso es de una sola empresa: un genérico atado a él solo lo podría ganar
-- esa empresa, y entonces no es genérico. El logro "Test" quedó así; se suelta
-- del curso antes de poner la regla, para que la restricción no falle.
UPDATE logros SET course_id = NULL WHERE tenant_id IS NULL AND course_id IS NOT NULL;

ALTER TABLE logros DROP CONSTRAINT IF EXISTS logros_generico_sin_curso;
ALTER TABLE logros ADD CONSTRAINT logros_generico_sin_curso
  CHECK (tenant_id IS NOT NULL OR course_id IS NULL);

-- El logro "Test" se puede borrar si ya no sirve. Quien lo ganó conserva el XP:
-- el movimiento pierde la referencia al logro pero sigue sumando.
-- DELETE FROM logros WHERE tenant_id IS NULL AND nombre = 'Test';


-- ---------------------------------------------------------------- Operaciones atómicas e índices
-- Se puede ejecutar más de una vez: todo es CREATE OR REPLACE / IF NOT EXISTS.
--
-- IMPORTANTE: aplicarlo ANTES de desplegar el backend que lo usa. El código
-- llama a estas funciones con supabase.rpc(); sin ellas, acreditar XP, guardar
-- un examen y el ranking por curso fallan.
--
-- Por qué funciones en la base: supabase-js no tiene transacciones. Cada
-- función de Postgres corre entera en una sola transacción, así que lo que
-- hace es todo o nada, y los FOR UPDATE ordenan las escrituras que compiten.


-- 1) XP total de una persona, sin carreras
--
-- Antes: leer la suma, calcular en Node y escribir. Dos acreditaciones a la
-- vez podían pisarse y la última en escribir dejaba un total viejo. Acá se
-- bloquea la fila del usuario mientras se suma y se escribe.
CREATE OR REPLACE FUNCTION recalcular_xp(p_user VARCHAR)
RETURNS INTEGER
LANGUAGE plpgsql AS $$
DECLARE
  total INTEGER;
BEGIN
  PERFORM 1 FROM users WHERE id = p_user FOR UPDATE;
  SELECT COALESCE(SUM(xp), 0) INTO total FROM xp_movimientos WHERE user_id = p_user;
  UPDATE users SET xp = total WHERE id = p_user;
  RETURN total;
END $$;

-- El nivel nunca baja. La curva vive en Node (helpers/niveles.js); acá solo se
-- garantiza que dos escrituras simultáneas no lo hagan retroceder.
CREATE OR REPLACE FUNCTION subir_nivel(p_user VARCHAR, p_nivel INTEGER)
RETURNS TABLE (antes INTEGER, despues INTEGER)
LANGUAGE plpgsql AS $$
DECLARE
  previo INTEGER;
BEGIN
  SELECT COALESCE(level, 0) INTO previo FROM users WHERE id = p_user FOR UPDATE;
  UPDATE users SET level = GREATEST(previo, p_nivel) WHERE id = p_user;
  RETURN QUERY SELECT previo, GREATEST(previo, p_nivel);
END $$;


-- 2) Otorgar un logro y su XP juntos
--
-- Antes eran dos inserts sueltos: si fallaba el segundo, el logro quedaba
-- ganado sin su XP y nunca se reintentaba. Devuelve true si lo otorgó ahora,
-- false si ya lo tenía.
CREATE OR REPLACE FUNCTION otorgar_logro(
  p_logro VARCHAR, p_user VARCHAR, p_tenant VARCHAR, p_xp INTEGER,
  p_id_logro_usuario VARCHAR, p_id_movimiento VARCHAR
)
RETURNS BOOLEAN
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO logros_usuario (id, logro_id, user_id, tenant_id, xp_otorgado)
  VALUES (p_id_logro_usuario, p_logro, p_user, p_tenant, COALESCE(p_xp, 0))
  ON CONFLICT (logro_id, user_id) DO NOTHING;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  IF COALESCE(p_xp, 0) > 0 THEN
    INSERT INTO xp_movimientos (id, user_id, tenant_id, activity_id, logro_id, xp, motivo)
    VALUES (p_id_movimiento, p_user, p_tenant, NULL, p_logro, p_xp, 'logro_desbloqueado');
  END IF;
  RETURN TRUE;
END $$;


-- 3) Ranking de un curso sumado en la base
--
-- Antes se traían todos los movimientos del curso a Node para sumarlos.
-- PostgREST corta en 1000 filas: con 50 personas y 25 actividades el ranking
-- ya salía incompleto sin avisar, y con él los logros de ranking.
CREATE OR REPLACE FUNCTION ranking_curso(p_course VARCHAR)
RETURNS TABLE (user_id VARCHAR, xp BIGINT)
LANGUAGE sql STABLE AS $$
  SELECT m.user_id, SUM(m.xp) AS xp
  FROM xp_movimientos m
  JOIN activities a ON a.id = m.activity_id
  JOIN sections s ON s.id = a.section_id
  WHERE s.course_id = p_course
  GROUP BY m.user_id;
$$;


-- 4) Guardar el examen completo, todo o nada
--
-- p_config: { tiempo_limite?, intentos_permitidos?, porcentaje_aprobacion? }.
-- Solo cambia las claves que vienen.
-- p_preguntas: lista ya validada en Node, o NULL para no tocar las preguntas.
--   Cada una: { id?, nuevoId, enunciado, puntaje, opciones: [{ id, texto, esCorrecta }] }.
--   Con id se edita, sin id se crea con nuevoId, y la que no viene se borra.
-- Si cualquier paso falla no queda nada a medias: ni preguntas sin opciones
-- ni un examen con la mitad de los cambios.
CREATE OR REPLACE FUNCTION guardar_examen(
  p_activity VARCHAR, p_tenant VARCHAR, p_config JSONB, p_preguntas JSONB
)
RETURNS VOID
LANGUAGE plpgsql AS $$
DECLARE
  p JSONB;
  o JSONB;
  pid VARCHAR;
  i INTEGER := 0;
  j INTEGER;
BEGIN
  IF p_config ? 'tiempo_limite' THEN
    UPDATE activities SET tiempo_limite = (p_config->>'tiempo_limite')::INTEGER WHERE id = p_activity;
  END IF;
  IF p_config ? 'intentos_permitidos' THEN
    UPDATE activities SET intentos_permitidos = (p_config->>'intentos_permitidos')::INTEGER WHERE id = p_activity;
  END IF;
  IF p_config ? 'porcentaje_aprobacion' THEN
    UPDATE activities SET porcentaje_aprobacion = (p_config->>'porcentaje_aprobacion')::INTEGER WHERE id = p_activity;
  END IF;

  IF p_preguntas IS NULL THEN
    RETURN;
  END IF;

  DELETE FROM preguntas
  WHERE activity_id = p_activity
    AND id NOT IN (
      SELECT x->>'id' FROM jsonb_array_elements(p_preguntas) x WHERE x->>'id' IS NOT NULL
    );

  FOR p IN SELECT * FROM jsonb_array_elements(p_preguntas) LOOP
    pid := p->>'id';
    IF pid IS NULL THEN
      pid := p->>'nuevoId';
      INSERT INTO preguntas (id, activity_id, tenant_id, enunciado, puntaje, orden)
      VALUES (pid, p_activity, p_tenant, p->>'enunciado', (p->>'puntaje')::INTEGER, i);
    ELSE
      UPDATE preguntas
      SET enunciado = p->>'enunciado', puntaje = (p->>'puntaje')::INTEGER, orden = i
      WHERE id = pid AND activity_id = p_activity;
    END IF;

    DELETE FROM opciones WHERE pregunta_id = pid;
    j := 0;
    FOR o IN SELECT * FROM jsonb_array_elements(p->'opciones') LOOP
      INSERT INTO opciones (id, pregunta_id, texto, es_correcta, orden)
      VALUES (o->>'id', pid, o->>'texto', (o->>'esCorrecta')::BOOLEAN, j);
      j := j + 1;
    END LOOP;

    i := i + 1;
  END LOOP;
END $$;

-- Editar una sola pregunta, también todo o nada. NULL en un campo = no se toca.
CREATE OR REPLACE FUNCTION editar_pregunta(
  p_pregunta VARCHAR, p_enunciado TEXT, p_puntaje INTEGER, p_opciones JSONB
)
RETURNS VOID
LANGUAGE plpgsql AS $$
DECLARE
  o JSONB;
  j INTEGER := 0;
BEGIN
  UPDATE preguntas
  SET enunciado = COALESCE(p_enunciado, enunciado),
      puntaje   = COALESCE(p_puntaje, puntaje)
  WHERE id = p_pregunta;

  IF p_opciones IS NOT NULL THEN
    DELETE FROM opciones WHERE pregunta_id = p_pregunta;
    FOR o IN SELECT * FROM jsonb_array_elements(p_opciones) LOOP
      INSERT INTO opciones (id, pregunta_id, texto, es_correcta, orden)
      VALUES (o->>'id', p_pregunta, o->>'texto', (o->>'esCorrecta')::BOOLEAN, j);
      j := j + 1;
    END LOOP;
  END IF;
END $$;


-- 5) Índices para las consultas más frecuentes
CREATE INDEX IF NOT EXISTS idx_xp_actividad ON xp_movimientos(activity_id);
CREATE INDEX IF NOT EXISTS idx_cursos_instructor ON courses(instructor);
CREATE INDEX IF NOT EXISTS idx_entregas_user_estado ON entregas(user_id, estado);

-- Un logro paga su XP una sola vez por persona. Hoy lo cuida logros_usuario;
-- esto es la segunda barrera, en el libro de XP mismo.
CREATE UNIQUE INDEX IF NOT EXISTS xp_una_vez_por_logro
  ON xp_movimientos(user_id, logro_id) WHERE logro_id IS NOT NULL;


-- ---------------------------------------------------------------- Archivar cursos (HU-029)
-- Archivar un curso (HU-029)
--
-- Archivar no es despublicar. Despublicar es transitorio ("todavía no está
-- listo", "lo estoy corrigiendo"); archivar es retirarlo del catálogo porque
-- ya no se dicta. Un curso archivado desaparece para los aprendices y de las
-- listas de administración, pero conserva todo: secciones, entregas, intentos y
-- el XP que la gente ganó. Se puede desarchivar.
ALTER TABLE courses ADD COLUMN IF NOT EXISTS archivado BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS archivado_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_cursos_archivado ON courses(tenant_id, archivado);
