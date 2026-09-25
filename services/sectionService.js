const crypto = require("crypto");
const { supabase } = require("../helpers/supabaseHelper.js");
const { errorDeValidacion } = require("../helpers/validacion.js");
const SectionSchema = require("../schemas/sectionSchema.js");

// La base guarda course_id / tenant_id; la API expone courseId / tenantId.
function aFila(d) {
  const o = { ...d };
  if ("courseId" in o) { o.course_id = o.courseId; delete o.courseId; }
  if ("tenantId" in o) { o.tenant_id = o.tenantId ?? null; delete o.tenantId; }
  return o;
}
function aObjeto(r) {
  if (!r) return null;
  const { course_id, tenant_id, ...resto } = r;
  return { ...resto, courseId: course_id, tenantId: tenant_id ?? null };
}

function fallo(message, status) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function delTenant(query, tenantId) {
  return tenantId ? query.eq("tenant_id", tenantId) : query;
}

class SectionService {
  /** El curso existe y es de la empresa que pregunta; si no, 404. */
  static async _curso(courseId, tenantId) {
    const { data } = await delTenant(
      supabase.from("courses").select("id, tenant_id").eq("id", courseId),
      tenantId
    ).maybeSingle();
    if (!data) throw fallo("Curso no encontrado", 404);
    return data;
  }

  static async _seccion(sectionId, tenantId) {
    const { data } = await delTenant(
      supabase.from("sections").select("*").eq("id", sectionId),
      tenantId
    ).maybeSingle();
    if (!data) throw fallo("Sección no encontrada", 404);
    return data;
  }

  /**
   * Secciones de un curso con sus actividades dentro.
   *
   * `soloConContenido` deja fuera las secciones vacías: al aprendiz no se le
   * muestra un título que no lleva a ninguna parte (criterio 4 de HU-032).
   * Quien edita el curso sí las ve, porque acaba de crearlas.
   */
  static async listar(courseId, tenantId = null, { soloConContenido = false } = {}) {
    await SectionService._curso(courseId, tenantId);

    const { data: secciones, error } = await supabase
      .from("sections")
      .select("*")
      .eq("course_id", courseId)
      .order("orden", { ascending: true });
    if (error) throw new Error(error.message);
    if (!secciones?.length) return [];

    const { data: actividades } = await supabase
      .from("activities")
      .select("id, name, title, type, description, deliverable, mime, orden, section_id")
      .in("section_id", secciones.map((s) => s.id))
      .order("orden", { ascending: true });

    const armadas = secciones.map((s) => ({
      ...aObjeto(s),
      // El adjunto no se firma acá: son N archivos y casi nunca se abren todos.
      // Se pide por actividad con GET /api/activities/{id}/adjunto.
      actividades: (actividades || []).filter((a) => a.section_id === s.id),
    }));

    return soloConContenido ? armadas.filter((s) => s.actividades.length > 0) : armadas;
  }

  static async crear(courseId, tenantId, datos) {
    const curso = await SectionService._curso(courseId, tenantId);

    // Al final de la lista, salvo que pidan una posición concreta.
    const { count } = await supabase
      .from("sections")
      .select("id", { count: "exact", head: true })
      .eq("course_id", courseId);

    const seccion = {
      id: crypto.randomBytes(3).toString("hex"),
      courseId,
      tenantId: curso.tenant_id,
      name: datos?.name,
      orden: Number.isInteger(datos?.orden) ? datos.orden : count ?? 0,
    };

    const validacion = SectionSchema.schema.safeParse(seccion);
    if (!validacion.success) throw errorDeValidacion(validacion.error);

    const { error } = await supabase.from("sections").insert(aFila(validacion.data));
    if (error) throw new Error(error.message);

    return { ...aObjeto(aFila(validacion.data)), actividades: [] };
  }

  static async renombrar(sectionId, tenantId, nombre) {
    await SectionService._seccion(sectionId, tenantId);
    if (!nombre || !String(nombre).trim()) {
      throw fallo("El nombre de la sección no puede estar vacío.", 400);
    }

    const { error } = await supabase
      .from("sections")
      .update({ name: String(nombre).trim().slice(0, 120) })
      .eq("id", sectionId);
    if (error) throw new Error(error.message);

    return { message: "Sección actualizada" };
  }

  /**
   * Borrar una sección con contenido se rechaza a propósito. El material no es
   * recuperable desde la interfaz y borrarlo de arrastre sería una pérdida
   * silenciosa: primero hay que eliminar sus actividades una por una.
   */
  static async eliminar(sectionId, tenantId) {
    await SectionService._seccion(sectionId, tenantId);

    const { count } = await supabase
      .from("activities")
      .select("id", { count: "exact", head: true })
      .eq("section_id", sectionId);

    if (count) {
      throw fallo(
        `La sección tiene ${count} actividad(es). Eliminalas antes de borrar la sección.`,
        409
      );
    }

    const { error } = await supabase.from("sections").delete().eq("id", sectionId);
    if (error) throw new Error(error.message);

    return { message: "Sección eliminada" };
  }

}

module.exports = SectionService;
