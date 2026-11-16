-- Pendiente de correr en Supabase (SQL Editor). Generado el 2026-11-16.

-- ── Accesos por día (tablero: usuarios activos por día) ─────────────────────
-- Una fila por persona y día (hora de Colombia) en que usó la plataforma. La
-- escribe la API en la primera petición autenticada del día (helpers/accesos.js).
CREATE TABLE IF NOT EXISTS accesos_diarios (
  user_id        VARCHAR(50) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id      VARCHAR(50) REFERENCES tenants(id) ON DELETE CASCADE,
  dia            DATE NOT NULL,
  primer_acceso  TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, dia)
);
CREATE INDEX IF NOT EXISTS idx_accesos_tenant_dia ON accesos_diarios(tenant_id, dia);
CREATE INDEX IF NOT EXISTS idx_accesos_dia ON accesos_diarios(dia);

-- Relleno: los días anteriores a esta tabla se reconstruyen con lo que la
-- gente hizo (XP, entregas, exámenes). Se puede correr de nuevo sin duplicar.
INSERT INTO accesos_diarios (user_id, tenant_id, dia, primer_acceso)
SELECT a.user_id, u.tenant_id, (a.momento AT TIME ZONE 'America/Bogota')::date, MIN(a.momento)
FROM (
  SELECT user_id, created_at   AS momento FROM xp_movimientos
  UNION ALL SELECT user_id, entregado_at FROM entregas WHERE entregado_at IS NOT NULL
  UNION ALL SELECT user_id, iniciado_at  FROM intentos_examen WHERE iniciado_at IS NOT NULL
) a
JOIN users u ON u.id = a.user_id AND u.role <> 'superadmin'
GROUP BY a.user_id, u.tenant_id, (a.momento AT TIME ZONE 'America/Bogota')::date
ON CONFLICT (user_id, dia) DO NOTHING;

-- ── Contraseña temporal ─────────────────────────────────────────────────────
-- TRUE cuando la contraseña la puso otra persona (alta con contraseña o un
-- admin que se la cambia): en su primer ingreso tiene que cambiarla. Las
-- cuentas que ya existen quedan en FALSE.
ALTER TABLE users ADD COLUMN IF NOT EXISTS debe_cambiar_password BOOLEAN NOT NULL DEFAULT FALSE;
