-- Lo que falta aplicar en Supabase. Se puede ejecutar más de una vez.

-- Tabla de niveles por organización (HU-053)
--
-- Cada empresa puede definir cuánto XP pide cada nivel y cómo se llama. Si no
-- define nada, se usa la curva por defecto (helpers/niveles.js:
-- umbral(n) = 25·n·(n+3), o sea 100, 250, 450, 700...).
--
-- Los niveles van de 1 a N sin saltos y el XP sube estrictamente: lo valida
-- el backend antes de guardar, y los UNIQUE son la segunda barrera.
CREATE TABLE IF NOT EXISTS niveles (
  id          VARCHAR(50) PRIMARY KEY,
  tenant_id   VARCHAR(50) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  numero      INTEGER NOT NULL CHECK (numero >= 1),
  xp_minimo   INTEGER NOT NULL CHECK (xp_minimo > 0),
  nombre      VARCHAR(40),
  created_at  TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT nivel_unico_por_empresa UNIQUE (tenant_id, numero),
  CONSTRAINT xp_unico_por_empresa UNIQUE (tenant_id, xp_minimo)
);

CREATE INDEX IF NOT EXISTS idx_niveles_tenant ON niveles(tenant_id, numero);

-- Reemplaza la tabla de una organización y recalcula el nivel de toda su
-- gente, todo junto en una transacción (criterio 2 de HU-053).
--
-- p_niveles: [{ id, numero, xpMinimo, nombre }] ya validado en Node, o NULL
-- para volver a la curva por defecto.
--
-- Acá el nivel se recalcula EXACTO, y puede bajar: si la empresa sube los
-- umbrales, alguien que estaba en 4 puede quedar en 3. Es lo que pide la
-- historia. En el uso normal (ganar XP) el nivel sigue sin bajar nunca.
--
-- Devuelve cuántas personas cambiaron de nivel.
CREATE OR REPLACE FUNCTION guardar_niveles(p_tenant VARCHAR, p_niveles JSONB)
RETURNS INTEGER
LANGUAGE plpgsql AS $$
DECLARE
  cambiaron INTEGER;
BEGIN
  DELETE FROM niveles WHERE tenant_id = p_tenant;

  IF p_niveles IS NOT NULL THEN
    INSERT INTO niveles (id, tenant_id, numero, xp_minimo, nombre)
    SELECT n->>'id', p_tenant, (n->>'numero')::INTEGER, (n->>'xpMinimo')::INTEGER, NULLIF(n->>'nombre', '')
    FROM jsonb_array_elements(p_niveles) n;
  END IF;

  WITH calculado AS (
    SELECT u.id,
      CASE WHEN p_niveles IS NULL THEN
        -- La inversa de 25·n·(n+3) <= xp, con tope 100 como en Node.
        LEAST(100, GREATEST(0, FLOOR((-3 + SQRT(9 + 4.0 * COALESCE(u.xp, 0) / 25)) / 2)))::INTEGER
      ELSE
        COALESCE((SELECT MAX(n.numero) FROM niveles n
                  WHERE n.tenant_id = p_tenant AND n.xp_minimo <= COALESCE(u.xp, 0)), 0)
      END AS nivel
    FROM users u
    WHERE u.tenant_id = p_tenant
  )
  UPDATE users u SET level = c.nivel
  FROM calculado c
  WHERE u.id = c.id AND u.level IS DISTINCT FROM c.nivel;

  GET DIAGNOSTICS cambiaron = ROW_COUNT;
  RETURN cambiaron;
END $$;
