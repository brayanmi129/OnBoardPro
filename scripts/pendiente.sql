-- Lo que falta aplicar en Supabase. Se puede ejecutar más de una vez.


-- ---------------------------------------------------------------- Tope diario de XP (HU-055)
--
-- Cada organización puede limitar cuánto XP de actividades gana una persona
-- por día. NULL = sin tope. Los premios de logros no cuentan para el tope:
-- son pocos y ya tienen su propio límite (se ganan una vez).
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS xp_tope_diario INTEGER
  CHECK (xp_tope_diario IS NULL OR xp_tope_diario > 0);

-- Lo que la actividad habría dado sin recortes (reintento, tope diario). Con
-- `xp` al lado se ve cuánto se recortó y por qué se lo avisa al aprendiz.
ALTER TABLE xp_movimientos ADD COLUMN IF NOT EXISTS xp_base INTEGER;

-- Acredita una actividad aplicando el tope diario, todo junto y sin carreras.
--
-- Bloquea la fila del usuario mientras suma lo ganado hoy: dos acreditaciones
-- simultáneas no pueden pasarse del tope entre las dos. "Hoy" es el día en
-- hora de Colombia, igual que la racha.
--
-- Devuelve el XP que realmente se otorgó (puede ser menos que p_xp, o 0). Si
-- la persona ya había cobrado la actividad, falla con unique_violation, que
-- es lo que el servicio traduce a "ya lo ganaste".
CREATE OR REPLACE FUNCTION acreditar_xp(
  p_id VARCHAR, p_user VARCHAR, p_tenant VARCHAR, p_activity VARCHAR,
  p_xp INTEGER, p_motivo VARCHAR
)
RETURNS INTEGER
LANGUAGE plpgsql AS $$
DECLARE
  tope INTEGER;
  ganado_hoy INTEGER;
  otorgado INTEGER := GREATEST(COALESCE(p_xp, 0), 0);
BEGIN
  PERFORM 1 FROM users WHERE id = p_user FOR UPDATE;

  SELECT xp_tope_diario INTO tope FROM tenants WHERE id = p_tenant;
  IF tope IS NOT NULL THEN
    SELECT COALESCE(SUM(xp), 0) INTO ganado_hoy
    FROM xp_movimientos
    WHERE user_id = p_user
      AND activity_id IS NOT NULL
      AND (created_at AT TIME ZONE 'America/Bogota')::DATE = (NOW() AT TIME ZONE 'America/Bogota')::DATE;
    otorgado := LEAST(otorgado, GREATEST(tope - ganado_hoy, 0));
  END IF;

  INSERT INTO xp_movimientos (id, user_id, tenant_id, activity_id, xp, xp_base, motivo)
  VALUES (p_id, p_user, p_tenant, p_activity, otorgado, p_xp, COALESCE(p_motivo, 'actividad_completada'));

  RETURN otorgado;
END $$;


-- ---------------------------------------------------------------- Ver aciertos (HU-045)
--
-- Quien arma el examen decide si el aprendiz ve qué acertó y qué falló. Por
-- defecto sí, que es como funcionaba hasta ahora.
ALTER TABLE activities ADD COLUMN IF NOT EXISTS mostrar_respuestas BOOLEAN NOT NULL DEFAULT TRUE;


-- ---------------------------------------------------------------- Concurso de preguntas (HU-065)
--
-- Un concurso es una actividad más, que reusa el motor del examen (preguntas,
-- opciones, intentos y corrección). Cambia la piel: tiempo por pregunta,
-- preguntas sorteadas y dificultad en aumento. Se puede jugar las veces que se
-- quiera; el XP se gana una sola vez.
DO $$
DECLARE c RECORD;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'activities'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%type%Examen%'
  LOOP
    EXECUTE format('ALTER TABLE activities DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;
ALTER TABLE activities ADD CONSTRAINT activities_type_check
  CHECK (type IN ('Tarea', 'Recurso', 'Examen', 'Concurso'));

-- Segundos para responder cada pregunta. NULL = sin tiempo.
ALTER TABLE activities ADD COLUMN IF NOT EXISTS tiempo_por_pregunta INTEGER
  CHECK (tiempo_por_pregunta IS NULL OR tiempo_por_pregunta BETWEEN 5 AND 300);
-- Cuántas preguntas se sortean por partida. NULL = todas.
ALTER TABLE activities ADD COLUMN IF NOT EXISTS preguntas_por_partida INTEGER
  CHECK (preguntas_por_partida IS NULL OR preguntas_por_partida > 0);
-- Si las preguntas salen de la más fácil a la más difícil.
ALTER TABLE activities ADD COLUMN IF NOT EXISTS dificultad_creciente BOOLEAN NOT NULL DEFAULT FALSE;

-- 1 fácil, 2 media, 3 difícil. En un examen no se usa.
ALTER TABLE preguntas ADD COLUMN IF NOT EXISTS dificultad SMALLINT NOT NULL DEFAULT 1
  CHECK (dificultad BETWEEN 1 AND 3);

-- Las preguntas que le tocaron en esa partida, en orden. En un examen va NULL:
-- se rinden todas.
ALTER TABLE intentos_examen ADD COLUMN IF NOT EXISTS preguntas JSONB;


-- Guardar el examen o el concurso completo, todo o nada.
--
-- Igual que antes, más las claves nuevas de configuración y la dificultad de
-- cada pregunta. Solo cambia las claves de p_config que vienen.
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
  UPDATE activities SET
    tiempo_limite = CASE WHEN p_config ? 'tiempo_limite'
      THEN (p_config->>'tiempo_limite')::INTEGER ELSE tiempo_limite END,
    intentos_permitidos = CASE WHEN p_config ? 'intentos_permitidos'
      THEN (p_config->>'intentos_permitidos')::INTEGER ELSE intentos_permitidos END,
    porcentaje_aprobacion = CASE WHEN p_config ? 'porcentaje_aprobacion'
      THEN (p_config->>'porcentaje_aprobacion')::INTEGER ELSE porcentaje_aprobacion END,
    mostrar_respuestas = CASE WHEN p_config ? 'mostrar_respuestas'
      THEN (p_config->>'mostrar_respuestas')::BOOLEAN ELSE mostrar_respuestas END,
    tiempo_por_pregunta = CASE WHEN p_config ? 'tiempo_por_pregunta'
      THEN (p_config->>'tiempo_por_pregunta')::INTEGER ELSE tiempo_por_pregunta END,
    preguntas_por_partida = CASE WHEN p_config ? 'preguntas_por_partida'
      THEN (p_config->>'preguntas_por_partida')::INTEGER ELSE preguntas_por_partida END,
    dificultad_creciente = CASE WHEN p_config ? 'dificultad_creciente'
      THEN (p_config->>'dificultad_creciente')::BOOLEAN ELSE dificultad_creciente END
  WHERE id = p_activity;

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
      INSERT INTO preguntas (id, activity_id, tenant_id, enunciado, puntaje, dificultad, orden)
      VALUES (pid, p_activity, p_tenant, p->>'enunciado', (p->>'puntaje')::INTEGER,
              COALESCE((p->>'dificultad')::SMALLINT, 1), i);
    ELSE
      UPDATE preguntas
      SET enunciado = p->>'enunciado', puntaje = (p->>'puntaje')::INTEGER,
          dificultad = COALESCE((p->>'dificultad')::SMALLINT, dificultad), orden = i
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

-- Editar una sola pregunta, ahora también su dificultad. NULL = no se toca.
DROP FUNCTION IF EXISTS editar_pregunta(VARCHAR, TEXT, INTEGER, JSONB);
CREATE OR REPLACE FUNCTION editar_pregunta(
  p_pregunta VARCHAR, p_enunciado TEXT, p_puntaje INTEGER, p_opciones JSONB,
  p_dificultad SMALLINT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql AS $$
DECLARE
  o JSONB;
  j INTEGER := 0;
BEGIN
  UPDATE preguntas
  SET enunciado  = COALESCE(p_enunciado, enunciado),
      puntaje    = COALESCE(p_puntaje, puntaje),
      dificultad = COALESCE(p_dificultad, dificultad)
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

-- PostgREST guarda en caché las firmas de las funciones.
NOTIFY pgrst, 'reload schema';
