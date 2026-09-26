const crypto = require("crypto");
const { supabase } = require("../helpers/supabaseHelper.js");
const { nivelPara, progreso } = require("../helpers/niveles.js");

function fallo(message, status) {
  const err = new Error(message);
  err.status = status;
  return err;
}

class GamificationService {
  static async getRanking(tenantId = null) {
    // Sin este filtro el ranking mezclaba a los aprendices de todas las
    // empresas: un cliente veía los nombres de los empleados de otro.
    let consulta = supabase
      .from("users")
      .select("id, firstname, lastname, level, xp")
      .not("role", "in", "(admin,superadmin,instructor)");
    if (tenantId) consulta = consulta.eq("tenant_id", tenantId);

    // Se ordena por XP y no por nivel: dentro de un mismo nivel el XP es lo que
    // distingue a quien va adelante. Ordenar por nivel dejaba empates masivos.
    const { data, error } = await consulta
      .order("xp", { ascending: false })
      .order("firstname", { ascending: true });
    if (error) throw new Error(error.message);

    return (data || []).map((u, i) => ({ ...u, posicion: i + 1 }));
  }

  /**
   * Marca una actividad como completada y acredita su XP (HU-052).
   *
   * El registro del movimiento es lo que define "completado": no hay otra
   * tabla. Y la restricción UNIQUE de la base es la que impide cobrar dos
   * veces, no un `if` acá: si llegan dos peticiones a la vez, una falla en la
   * base en vez de acreditar el doble.
   */
  static async completarActividad(userId, actividadId, tenantId = null) {
    let consulta = supabase
      .from("activities")
      .select("id, title, xp, tenant_id")
      .eq("id", actividadId);
    if (tenantId) consulta = consulta.eq("tenant_id", tenantId);

    const { data: actividad } = await consulta.maybeSingle();
    if (!actividad) throw fallo("Actividad no encontrada", 404);

    const { error } = await supabase.from("xp_movimientos").insert({
      id: crypto.randomBytes(8).toString("hex"),
      user_id: userId,
      tenant_id: actividad.tenant_id,
      activity_id: actividad.id,
      xp: actividad.xp ?? 0,
      motivo: "actividad_completada",
    });

    if (error) {
      // 23505 es la violación de UNIQUE: ya la había completado.
      if (error.code === "23505" || /duplicate|unique/i.test(error.message)) {
        throw fallo("Ya habías completado esta actividad.", 409);
      }
      throw new Error(error.message);
    }

    const resumen = await GamificationService.recalcular(userId);
    return {
      message: `Actividad completada. +${actividad.xp ?? 0} XP`,
      xpGanado: actividad.xp ?? 0,
      ...resumen,
    };
  }

  /**
   * Vuelve a sumar el historial y guarda el total en users.
   *
   * Se recalcula desde el libro de movimientos en vez de hacer `xp = xp + n`:
   * así un movimiento borrado o corregido se refleja solo, y el total nunca
   * queda a la deriva respecto de su historial.
   */
  static async recalcular(userId) {
    const { data: movimientos, error } = await supabase
      .from("xp_movimientos")
      .select("xp")
      .eq("user_id", userId);
    if (error) throw new Error(error.message);

    const xp = (movimientos || []).reduce((a, m) => a + (m.xp || 0), 0);

    const { data: antes } = await supabase
      .from("users").select("level").eq("id", userId).maybeSingle();

    // El nivel nunca baja, aunque el XP se corrija hacia abajo: quitarle un
    // nivel a alguien que ya lo vio es peor que dejarlo un escalón arriba.
    const nivelCalculado = nivelPara(xp);
    const nivel = Math.max(nivelCalculado, antes?.level ?? 0);

    await supabase.from("users").update({ xp, level: nivel }).eq("id", userId);

    return {
      ...progreso(xp),
      nivel,
      subioDeNivel: nivel > (antes?.level ?? 0),
    };
  }

  /** Mi XP, mi nivel y cuánto me falta para el siguiente (HU-056). */
  static async miProgreso(userId) {
    const { data: usuario } = await supabase
      .from("users").select("xp, level").eq("id", userId).maybeSingle();
    if (!usuario) throw fallo("Usuario no encontrado", 404);

    const { count } = await supabase
      .from("xp_movimientos")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);

    return {
      ...progreso(usuario.xp || 0),
      nivel: Math.max(usuario.level || 0, nivelPara(usuario.xp || 0)),
      actividadesCompletadas: count ?? 0,
    };
  }

  /** Ids de las actividades que esta persona ya completó, para marcarlas en la interfaz. */
  static async completadasDe(userId) {
    const { data } = await supabase
      .from("xp_movimientos").select("activity_id").eq("user_id", userId);
    return new Set((data || []).map((m) => m.activity_id).filter(Boolean));
  }
}

module.exports = GamificationService;
