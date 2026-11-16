// Registro de "quién usó la plataforma cada día".
//
// Cada petición autenticada marca a la persona como activa ese día (en hora de
// Colombia). Una fila por persona y día en accesos_diarios: es lo que permite
// graficar usuarios activos por día, cosa que ultima_actividad (una sola fecha
// que se pisa) no puede.
//
// Para no escribir en la base en cada petición, se recuerda en memoria el
// último día registrado de cada persona: la primera petición del día escribe y
// las demás no. Si el proceso se reinicia, la siguiente escritura es un upsert
// que ignora el duplicado.
//
// Nunca bloquea ni rompe la petición: se dispara y se olvida. Si la tabla
// todavía no existe (falta correr scripts/pendiente.sql), avisa una vez y deja
// de intentar.
const { supabase } = require("./supabaseHelper.js");
const { diaColombia } = require("./periodo.js");

const registrados = new Map(); // user_id -> "YYYY-MM-DD"
const MAX_EN_MEMORIA = 50_000;
let deshabilitado = process.env.NODE_ENV === "test";

function tablaFaltante(error) {
  return error && (error.code === "42P01" || error.code === "PGRST205" || /accesos_diarios/.test(error.message || ""));
}

function registrarAcceso(usuario) {
  if (deshabilitado || !usuario?.id || usuario.role === "superadmin") return;
  const dia = diaColombia(Date.now());
  if (registrados.get(usuario.id) === dia) return;
  if (registrados.size >= MAX_EN_MEMORIA) registrados.clear();
  registrados.set(usuario.id, dia);

  try {
    supabase
      .from("accesos_diarios")
      .upsert({ user_id: usuario.id, tenant_id: usuario.tenantId || null, dia }, { onConflict: "user_id,dia", ignoreDuplicates: true })
      .then(({ error }) => {
        if (!error) return;
        registrados.delete(usuario.id);
        if (tablaFaltante(error)) {
          deshabilitado = true;
          console.warn("[accesos] Falta la tabla accesos_diarios (scripts/pendiente.sql): no se registran accesos.");
        } else {
          console.warn("[accesos] No se pudo registrar el acceso:", error.message);
        }
      }, () => registrados.delete(usuario.id));
  } catch {
    registrados.delete(usuario.id);
  }
}

module.exports = { registrarAcceso, tablaFaltante };
