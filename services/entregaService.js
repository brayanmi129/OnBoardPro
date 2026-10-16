const crypto = require("crypto");
const { supabase } = require("../helpers/supabaseHelper.js");
const { subirMaterial, urlFirmada, borrar, MATERIALES } = require("../helpers/storage.js");
const GamificationService = require("./gamificationService.js");

function fallo(message, status) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function aObjeto(r) {
  if (!r) return null;
  const { tenant_id, activity_id, user_id, entregado_at, revisado_por, revisado_at, ...resto } = r;
  return {
    ...resto,
    tenantId: tenant_id ?? null,
    activityId: activity_id,
    userId: user_id,
    entregadoAt: entregado_at,
    revisadoPor: revisado_por ?? null,
    revisadoAt: revisado_at ?? null,
  };
}

class EntregaService {
  /** La actividad existe, es de la empresa de quien pregunta y admite entregas. */
  static async _actividadEntregable(actividadId, actor) {
    let q = supabase.from("activities").select("*").eq("id", actividadId);
    if (actor.role !== "superadmin") q = q.eq("tenant_id", actor.tenantId);
    const { data: actividad } = await q.maybeSingle();
    if (!actividad) throw fallo("Actividad no encontrada", 404);

    // Criterio 1 de HU-046. Hasta ahora `deliverable` era una bandera que nadie
    // miraba; este es el primer sitio donde decide algo.
    if (!actividad.deliverable) {
      throw fallo("Esta actividad no admite entregas.", 409);
    }
    return actividad;
  }

  /**
   * Crea o reemplaza la entrega de una persona (HU-046).
   *
   * La restricción UNIQUE (activity_id, user_id) hace que reemplazar sea
   * sobrescribir la misma fila en vez de acumular intentos: el historial de
   * borradores no aporta nada y multiplicaría los archivos guardados.
   */
  static async entregar(actividadId, actor, { archivo, comentario }) {
    const actividad = await EntregaService._actividadEntregable(actividadId, actor);

    const { data: previa } = await supabase
      .from("entregas").select("*")
      .eq("activity_id", actividadId).eq("user_id", actor.id).maybeSingle();

    // Se puede reemplazar mientras no esté aprobada. Si el instructor pidió
    // cambios (estado "rehacer"), reemplazarla es exactamente lo que toca:
    // eso es HU-050 sin necesidad de guardar un historial de intentos.
    if (previa?.estado === "aprobada") {
      throw fallo("Tu entrega ya fue aprobada: no hace falta reemplazarla.", 409);
    }

    if (!archivo && !comentario?.trim() && !previa) {
      throw fallo("Enviá un archivo o un comentario.", 400);
    }

    let rutaNueva = null;
    if (archivo) {
      const { ruta } = await subirMaterial({
        tenantId: actividad.tenant_id,
        buffer: archivo.buffer,
        nombreOriginal: archivo.originalname,
        mime: archivo.mimetype,
      });
      rutaNueva = ruta;
    }

    const fila = {
      activity_id: actividadId,
      user_id: actor.id,
      tenant_id: actividad.tenant_id,
      estado: "entregado",
      entregado_at: new Date().toISOString(),
      comentario: comentario?.trim() || previa?.comentario || null,
      ...(rutaNueva ? { archivo: rutaNueva, mime: archivo.mimetype } : {}),
    };

    let error;
    if (previa) {
      ({ error } = await supabase.from("entregas").update(fila).eq("id", previa.id));
    } else {
      ({ error } = await supabase
        .from("entregas").insert({ id: crypto.randomBytes(8).toString("hex"), ...fila }));
    }
    if (error) {
      if (rutaNueva) await borrar(MATERIALES, rutaNueva);
      throw new Error(error.message);
    }

    // Recién ahora: si la escritura falla, el archivo viejo sigue siendo válido.
    if (rutaNueva && previa?.archivo) await borrar(MATERIALES, previa.archivo);

    const { data } = await supabase
      .from("entregas").select("*")
      .eq("activity_id", actividadId).eq("user_id", actor.id).maybeSingle();

    return {
      message: previa ? "Entrega reemplazada." : "Entrega registrada.",
      entrega: aObjeto(data),
    };
  }

  /** Mi entrega de una actividad. Null si todavía no entregué. */
  static async miEntrega(actividadId, actor) {
    const { data } = await supabase
      .from("entregas").select("*")
      .eq("activity_id", actividadId).eq("user_id", actor.id).maybeSingle();
    return aObjeto(data);
  }

  /** Todas las entregas de una actividad, para quien la corrige. */
  static async listar(actividadId, actor) {
    let q = supabase.from("activities").select("id, tenant_id").eq("id", actividadId);
    if (actor.role !== "superadmin") q = q.eq("tenant_id", actor.tenantId);
    const { data: actividad } = await q.maybeSingle();
    if (!actividad) throw fallo("Actividad no encontrada", 404);

    const { data: entregas } = await supabase
      .from("entregas").select("*")
      .eq("activity_id", actividadId)
      .order("entregado_at", { ascending: true });

    if (!entregas?.length) return [];

    // Quién entregó, para no mostrar solo ids.
    const { data: personas } = await supabase
      .from("users").select("id, firstname, lastname, email")
      .in("id", entregas.map((e) => e.user_id));
    const porId = new Map((personas || []).map((u) => [u.id, u]));

    return entregas.map((e) => ({ ...aObjeto(e), aprendiz: porId.get(e.user_id) ?? null }));
  }

  /**
   * Revisa una entrega (HU-048).
   *
   * No hay nota: esto es onboarding, no un curso. Quien revisa decide si el
   * trabajo está bien o si hay que rehacerlo, y explica por qué. El comentario
   * es obligatorio en los dos casos: "aprobado" sin decir qué estuvo bien
   * enseña poco, y "rehacelo" sin decir qué corregir no se puede cumplir.
   *
   * El XP se acredita solo al aprobar, y nunca al subir el archivo: entregar
   * cualquier cosa no debería dar puntos.
   */
  static async revisar(entregaId, actor, { aprobada, feedback }) {
    const { data: entrega } = await supabase
      .from("entregas").select("*").eq("id", entregaId).maybeSingle();
    if (!entrega) throw fallo("Entrega no encontrada", 404);

    if (actor.role !== "superadmin" && entrega.tenant_id !== actor.tenantId) {
      throw fallo("Entrega no encontrada", 404);
    }

    const { data: actividad } = await supabase
      .from("activities").select("id, xp, section_id").eq("id", entrega.activity_id).maybeSingle();

    // Un instructor solo revisa lo de los cursos que dicta, igual que al
    // editar una actividad.
    if (actor.role === "instructor") {
      const { data: seccion } = actividad?.section_id
        ? await supabase.from("sections").select("course_id").eq("id", actividad.section_id).maybeSingle()
        : { data: null };
      const { data: curso } = seccion
        ? await supabase.from("courses").select("instructor").eq("id", seccion.course_id).maybeSingle()
        : { data: null };
      if (!curso || curso.instructor !== actor.email) {
        throw fallo("Esta entrega no pertenece a un curso que dictes.", 403);
      }
    }

    if (typeof aprobada !== "boolean") {
      throw fallo("Indicá si la entrega queda aprobada o hay que rehacerla.", 400);
    }
    if (!feedback || !String(feedback).trim()) {
      throw fallo("El comentario es obligatorio.", 400);
    }

    const estado = aprobada ? "aprobada" : "rehacer";
    const { error } = await supabase.from("entregas").update({
      estado,
      feedback: String(feedback).trim(),
      revisado_por: actor.id,
      revisado_at: new Date().toISOString(),
    }).eq("id", entregaId);
    if (error) throw new Error(error.message);

    // Solo al aprobar. Pedir cambios no paga.
    let xp = null;
    if (aprobada && actividad?.xp > 0) {
      try {
        xp = await GamificationService.acreditar({
          userId: entrega.user_id,
          actividadId: entrega.activity_id,
          tenantId: entrega.tenant_id,
          puntos: actividad.xp,
          motivo: "entrega_aprobada",
        });
      } catch (err) {
        // Volver a aprobar no duplica puntos ni rompe la revisión.
        console.warn("[entrega] no se acreditó XP:", err.message);
      }
    }

    return {
      message: aprobada ? "Entrega aprobada." : "Se pidieron cambios.",
      estado,
      xpAcreditado: xp?.xpGanado ?? 0,
      nivel: xp?.nivel,
    };
  }

  /** URL temporal del archivo entregado. */
  static async urlArchivo(entregaId, actor) {
    const { data: entrega } = await supabase
      .from("entregas").select("archivo, user_id, tenant_id").eq("id", entregaId).maybeSingle();
    if (!entrega?.archivo) return null;

    // El aprendiz ve la suya; quien corrige, las de su empresa.
    const esSuya = entrega.user_id === actor.id;
    const puedeCorregir = ["admin", "superadmin", "instructor"].includes(actor.role);
    const mismaEmpresa = actor.role === "superadmin" || entrega.tenant_id === actor.tenantId;
    if (!esSuya && !(puedeCorregir && mismaEmpresa)) return null;

    return urlFirmada(entrega.archivo);
  }
}

module.exports = EntregaService;
