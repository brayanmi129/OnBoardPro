const { supabase } = require("../helpers/supabaseHelper.js");
const { hoy } = require("../helpers/racha.js");

function fallo(message, status) {
  const err = new Error(message);
  err.status = status;
  return err;
}

const TOPE_MAXIMO = 100000;

/**
 * Reglas antiabuso de XP de cada organización (HU-055).
 *
 * Que una actividad pague una sola vez ya lo garantiza la base (UNIQUE en el
 * libro de XP), y los reintentos de examen pagan menos (examenService). Acá
 * vive lo que cada empresa configura: el tope de XP por día.
 */
class ReglasXpService {
  /** El tope diario de una organización, o null si no tiene. */
  static async topeDe(tenantId) {
    if (!tenantId) return null;
    const { data, error } = await supabase
      .from("tenants").select("xp_tope_diario").eq("id", tenantId).maybeSingle();
    // Si la columna todavía no existe (falta el SQL), no hay tope.
    if (error) return null;
    return data?.xp_tope_diario ?? null;
  }

  /**
   * El inicio del día de hoy en Colombia, como instante. Colombia no tiene
   * horario de verano, así que el desfase es siempre -05:00.
   */
  static hoyEnColombia() {
    const fecha = hoy();
    return { fecha, inicio: new Date(`${fecha}T00:00:00-05:00`).toISOString() };
  }

  /** De qué organización se habla: la del token, salvo el superadmin, que la elige. */
  static _organizacion(actor, tenantId) {
    const org = actor.role === "superadmin" ? tenantId : actor.tenantId;
    if (!org) throw fallo("Indicá la organización (tenantId).", 400);
    if (!/^[\w-]+$/.test(String(org))) throw fallo("tenantId inválido.", 400);
    return org;
  }

  static async obtener(actor, tenantId) {
    const org = ReglasXpService._organizacion(actor, tenantId);
    const { data, error } = await supabase
      .from("tenants").select("id, xp_tope_diario").eq("id", org).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw fallo("Organización no encontrada", 404);
    return {
      tenantId: org,
      topeDiario: data.xp_tope_diario ?? null,
      reglas: {
        unaVezPorActividad: true,
        reintentoDeExamen: "Aprobar un examen en el primer intento da el XP completo; en un reintento, la mitad.",
        concursos: "Un concurso se puede rejugar, pero da XP solo la primera vez que se aprueba.",
      },
    };
  }

  /** Define o quita (null) el tope diario. No toca el XP ya ganado. */
  static async guardar(actor, { topeDiario, tenantId } = {}) {
    const org = ReglasXpService._organizacion(actor, tenantId);
    if (topeDiario === undefined) throw fallo("Enviá topeDiario (un número, o null para quitarlo).", 400);

    let tope = null;
    if (topeDiario !== null && topeDiario !== "") {
      tope = Number(topeDiario);
      if (!Number.isInteger(tope) || tope < 1 || tope > TOPE_MAXIMO) {
        throw fallo(`El tope diario tiene que ser un entero entre 1 y ${TOPE_MAXIMO}, o null para no limitar.`, 400);
      }
    }

    const { data, error } = await supabase
      .from("tenants").update({ xp_tope_diario: tope }).eq("id", org).select("id");
    if (error) throw new Error(error.message);
    if (!data?.length) throw fallo("Organización no encontrada", 404);

    return {
      message: tope ? `Tope diario de ${tope} XP guardado.` : "Se quitó el tope diario.",
      ...(await ReglasXpService.obtener(actor, org)),
    };
  }
}

module.exports = ReglasXpService;
