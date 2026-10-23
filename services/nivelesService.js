const crypto = require("crypto");
const { supabase } = require("../helpers/supabaseHelper.js");
const { umbral } = require("../helpers/niveles.js");

function fallo(message, status) {
  const err = new Error(message);
  err.status = status;
  return err;
}

// Cuántos niveles se muestran de la curva por defecto. La curva sigue hasta
// 100, pero nadie configura 100 filas: diez alcanzan para ver la forma.
const NIVELES_POR_DEFECTO = 10;
const MAXIMO_NIVELES = 50;

/**
 * Tabla de niveles por organización (HU-053).
 *
 * Una empresa puede definir cuánto XP pide cada nivel y cómo se llama. Si no
 * define nada se usa la curva por defecto (helpers/niveles.js), así ninguna
 * organización queda sin niveles.
 */
class NivelesService {
  /**
   * La tabla propia de una organización, o null si usa la curva por defecto.
   * Es lo que reciben las funciones de helpers/niveles.js.
   */
  static async tablaDe(tenantId) {
    if (!tenantId) return null;
    const { data, error } = await supabase
      .from("niveles").select("numero, xp_minimo, nombre")
      .eq("tenant_id", tenantId).order("numero", { ascending: true });
    if (error) {
      // Si la tabla todavía no se creó (el backend se desplegó antes que el
      // SQL), se usa la curva por defecto: el nivel es secundario, y sin esto
      // dejaría de funcionar acreditar XP y ver el progreso.
      if (error.code === "42P01" || /does not exist|could not find the table/i.test(error.message)) {
        console.warn("[niveles] falta la tabla `niveles`; se usa la curva por defecto.");
        return null;
      }
      throw new Error(error.message);
    }
    return data?.length ? data : null;
  }

  /** De qué organización se habla: la del token, salvo el superadmin, que la elige. */
  static _organizacion(actor, tenantId) {
    const org = actor.role === "superadmin" ? tenantId : actor.tenantId;
    if (!org) throw fallo("Indicá la organización (tenantId).", 400);
    if (!/^[\w-]+$/.test(String(org))) throw fallo("tenantId inválido.", 400);
    return org;
  }

  /** La tabla para mostrar: la propia, o la curva por defecto marcada como tal. */
  static async obtener(actor, tenantId) {
    const org = NivelesService._organizacion(actor, tenantId);
    const tabla = await NivelesService.tablaDe(org);
    if (tabla) {
      return {
        personalizada: true,
        niveles: tabla.map((n) => ({ numero: n.numero, xpMinimo: n.xp_minimo, nombre: n.nombre })),
      };
    }
    return {
      personalizada: false,
      niveles: Array.from({ length: NIVELES_POR_DEFECTO }, (_, i) => ({
        numero: i + 1,
        xpMinimo: umbral(i + 1),
        nombre: null,
      })),
    };
  }

  /**
   * Valida la tabla tal como llega del cliente. El orden de la lista es el
   * número de nivel: así no hay forma de dejar huecos ni repetidos.
   */
  static _validar(niveles) {
    if (!Array.isArray(niveles) || niveles.length === 0) {
      throw fallo("Enviá al menos un nivel.", 400);
    }
    if (niveles.length > MAXIMO_NIVELES) {
      throw fallo(`No puede haber más de ${MAXIMO_NIVELES} niveles.`, 400);
    }
    let anterior = 0;
    return niveles.map((n, i) => {
      const numero = i + 1;
      const xp = Number(n?.xpMinimo);
      if (!Number.isInteger(xp) || xp <= 0) {
        throw fallo(`Nivel ${numero}: el XP tiene que ser un entero mayor que cero.`, 400);
      }
      if (xp <= anterior) {
        throw fallo(`Nivel ${numero}: tiene que pedir más XP que el nivel ${numero - 1} (${anterior}).`, 400);
      }
      anterior = xp;
      const nombre = n?.nombre ? String(n.nombre).trim() : "";
      if (nombre.length > 40) throw fallo(`Nivel ${numero}: el nombre no puede pasar de 40 caracteres.`, 400);
      return { id: crypto.randomBytes(8).toString("hex"), numero, xpMinimo: xp, nombre };
    });
  }

  /**
   * Guarda la tabla de la organización y recalcula el nivel de toda su gente
   * (criterio 2). Las dos cosas van en una sola transacción en la base.
   *
   * Acá el nivel se recalcula exacto y puede bajar: si la empresa sube los
   * umbrales, quien estaba en 4 puede quedar en 3. En el uso normal (ganar
   * XP) el nivel sigue sin bajar nunca.
   */
  static async guardar(actor, { niveles, tenantId } = {}) {
    const org = NivelesService._organizacion(actor, tenantId);
    const limpios = NivelesService._validar(niveles);

    const { data: cambiaron, error } = await supabase.rpc("guardar_niveles", {
      p_tenant: org,
      p_niveles: limpios,
    });
    if (error) throw new Error(error.message);

    return {
      message: "Tabla de niveles guardada.",
      personasConNivelNuevo: cambiaron ?? 0,
      ...(await NivelesService.obtener(actor, org)),
    };
  }

  /** Vuelve a la curva por defecto y recalcula. */
  static async restaurar(actor, tenantId) {
    const org = NivelesService._organizacion(actor, tenantId);
    const { data: cambiaron, error } = await supabase.rpc("guardar_niveles", {
      p_tenant: org,
      p_niveles: null,
    });
    if (error) throw new Error(error.message);

    return {
      message: "Se volvió a la tabla de niveles por defecto.",
      personasConNivelNuevo: cambiaron ?? 0,
      ...(await NivelesService.obtener(actor, org)),
    };
  }
}

module.exports = NivelesService;
