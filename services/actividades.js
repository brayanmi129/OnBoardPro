const crypto = require("crypto");
const { supabase } = require("../helpers/supabaseHelper.js");
const { subirMaterial, urlFirmada, borrar, MATERIALES } = require("../helpers/storage.js");
const activitieSchema = require("../schemas/activitieSchema.js");

// La base guarda tenant_id; la API expone tenantId, igual que en el resto.
function aFila(d) {
  const o = { ...d };
  if ("tenantId" in o) { o.tenant_id = o.tenantId ?? null; delete o.tenantId; }
  return o;
}
function aObjeto(r) {
  if (!r) return null;
  const { tenant_id, ...resto } = r;
  return { ...resto, tenantId: tenant_id ?? null };
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
      throw new Error(validation.error.errors.map((err) => err.message).join(", "));
    }

    const { error } = await supabase.from("activities").insert(aFila(validation.data));
    if (error) {
      if (rutaSubida) await borrar(MATERIALES, rutaSubida);
      throw new Error(error.message);
    }

    return validation.data;
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
