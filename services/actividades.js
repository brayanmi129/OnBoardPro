const crypto = require("crypto");
const { errorDeValidacion, detalleDeValidacion } = require("../helpers/validacion.js");
const { supabase } = require("../helpers/supabaseHelper.js");
const { subirMaterial, urlFirmada, borrar, MATERIALES } = require("../helpers/storage.js");
const activitieSchema = require("../schemas/activitieSchema.js");

// La base guarda tenant_id; la API expone tenantId, igual que en el resto.
function aFila(d) {
  const o = { ...d };
  if ("tenantId" in o) { o.tenant_id = o.tenantId ?? null; delete o.tenantId; }
  if ("sectionId" in o) { o.section_id = o.sectionId ?? null; delete o.sectionId; }
  return o;
}
function aObjeto(r) {
  if (!r) return null;
  const { tenant_id, section_id, ...resto } = r;
  return { ...resto, tenantId: tenant_id ?? null, sectionId: section_id ?? null };
}
function delTenant(query, tenantId) {
  return tenantId ? query.eq("tenant_id", tenantId) : query;
}

class ActivitiesService {
  static async getAll(tenantId = null) {
    const { data, error } = await delTenant(supabase.from("activities").select("*"), tenantId);
    if (error) throw new Error(error.message);
    // No se devuelve el adjunto firmado en el listado: firmar N archivos en
    // cada consulta es caro y casi nunca se abren todos. Se pide por actividad.
    return (data || []).map(aObjeto);
  }

  static async create(data, file) {
    const actividad = { ...data, id: crypto.randomBytes(3).toString("hex") };

    // Se comprueba antes de subir nada: si la sección no sirve, no tiene
    // sentido dejar un archivo huérfano en Storage para después borrarlo.
    if (actividad.sectionId) {
      const { data: seccion } = await supabase
        .from("sections")
        .select("id, tenant_id")
        .eq("id", actividad.sectionId)
        .maybeSingle();
      // Una sección de otra empresa se responde igual que una inexistente.
      if (!seccion || (data.tenantId && seccion.tenant_id !== data.tenantId)) {
        const err = new Error("Sección no encontrada");
        err.status = 404;
        throw err;
      }
      // Al final de su sección.
      const { count } = await supabase
        .from("activities")
        .select("id", { count: "exact", head: true })
        .eq("section_id", actividad.sectionId);
      actividad.orden = count ?? 0;
    }

    // El archivo va primero: si Storage falla, no queda una fila apuntando a
    // un adjunto que no existe.
    let rutaSubida = null;
    if (file) {
      const { ruta } = await subirMaterial({
        tenantId: data.tenantId,
        buffer: file.buffer,
        nombreOriginal: file.originalname,
        mime: file.mimetype,
      });
      rutaSubida = ruta;
      actividad.adjunto = ruta;
      actividad.mime = file.mimetype;
    }

    const validation = activitieSchema.schema.safeParse(actividad);
    if (!validation.success) {
      if (rutaSubida) await borrar(MATERIALES, rutaSubida);
      throw errorDeValidacion(validation.error);
    }

    const { error } = await supabase.from("activities").insert(aFila(validation.data));
    if (error) {
      if (rutaSubida) await borrar(MATERIALES, rutaSubida);
      throw new Error(error.message);
    }

    return validation.data;
  }

  /**
   * Elimina la actividad y su archivo. Se borra primero la fila: si fallara el
   * archivo quedaría un huérfano en Storage, molesto pero inofensivo; al revés
   * quedaría una actividad apuntando a un adjunto que ya no existe.
   */
  static async eliminar(id, tenantId = null) {
    const { data } = await delTenant(
      supabase.from("activities").select("id, adjunto").eq("id", id),
      tenantId
    ).maybeSingle();
    if (!data) {
      const err = new Error("Actividad no encontrada");
      err.status = 404;
      throw err;
    }

    const { error } = await supabase.from("activities").delete().eq("id", id);
    if (error) throw new Error(error.message);

    await borrar(MATERIALES, data.adjunto);
    return { message: "Actividad eliminada" };
  }

  /** URL temporal del adjunto, solo si la actividad es de la empresa que pregunta. */
  static async urlAdjunto(id, tenantId = null) {
    const { data } = await delTenant(
      supabase.from("activities").select("adjunto").eq("id", id),
      tenantId
    ).maybeSingle();
    if (!data?.adjunto) return null;
    return urlFirmada(data.adjunto);
  }
}

module.exports = ActivitiesService;
