-- Lo que falta aplicar en Supabase, en este orden.

-- 1) Racha de dias activos (HU-058)
ALTER TABLE users ADD COLUMN IF NOT EXISTS ultima_actividad DATE;

-- La racha máxima se guarda aparte porque la actual se pierde al cortarse, y
-- los logros de constancia preguntan si alguna vez se llegó a N días.
ALTER TABLE users ADD COLUMN IF NOT EXISTS racha_maxima INTEGER DEFAULT 0;

-- 2) Catalogo de logros (HU-059)
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

-- 3) Alcances del logro y condicion de examenes
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
