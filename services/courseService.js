const crypto = require("crypto");
const { errorDeValidacion, detalleDeValidacion } = require("../helpers/validacion.js");
const { supabase } = require("../helpers/supabaseHelper.js");
const CourseSchema = require("../schemas/courseSchemas.js");
const { subirBanner, borrar, BANNERS } = require("../helpers/storage.js");


// La base guarda tenant_id; la API expone tenantId, igual que en usuarios.
function aFila(d) {
  const o = { ...d };
  if ("tenantId" in o) { o.tenant_id = o.tenantId ?? null; delete o.tenantId; }
  return o;
}
function aObjeto(r) {
  if (!r) return null;
  const { tenant_id, banner_url, ...resto } = r;
  return { ...resto, tenantId: tenant_id ?? null, bannerUrl: banner_url ?? null };
}

// El superadmin pasa null y ve todo; cualquier otro rol llega con el suyo.
function delTenant(query, tenantId) {
  return tenantId ? query.eq("tenant_id", tenantId) : query;
}

class CourseService {
  static async getAll(tenantId = null) {
    const { data, error } = await delTenant(supabase.from("courses").select("*"), tenantId);
    if (error) throw new Error(error.message);
    return (data || []).map(aObjeto);
  }

  static async getById(id, tenantId = null) {
    const { data } = await delTenant(
      supabase.from("courses").select("*").eq("id", id),
      tenantId
    ).maybeSingle();
    return aObjeto(data);
  }

  static async createCourse(courseData) {
    const customId = crypto.randomBytes(3).toString("hex");
    courseData.id = customId;

    const validation = CourseSchema.schema.safeParse(courseData);
    if (!validation.success) {
      throw errorDeValidacion(validation.error);
    }

    const course = validation.data;
    const { error } = await supabase.from("courses").insert(aFila(course));
    if (error) throw new Error(error.message);
    return course;
  }

  /**
   * Cambia la portada del curso. Solo se toca la base después de que Storage
   * confirmó la subida: al revés quedaría una URL apuntando a la nada.
   */
  static async guardarBanner(id, tenantId, archivo) {
    const { data: curso } = await delTenant(
      supabase.from("courses").select("id, banner_url").eq("id", id),
      tenantId
    ).maybeSingle();
    if (!curso) return { error: "Curso no encontrado" };

    const { ruta, url } = await subirBanner({
      tenantId,
      buffer: archivo.buffer,
      nombreOriginal: archivo.originalname,
      mime: archivo.mimetype,
    });

    const { error } = await supabase.from("courses").update({ banner_url: url }).eq("id", id);
    if (error) {
      // No dejamos huérfano el archivo si la base falla.
      await borrar(BANNERS, ruta);
      return { error: error.message };
    }

    // La portada anterior ya no la referencia nadie.
    if (curso.banner_url) {
      const vieja = curso.banner_url.split("/banners/")[1];
      if (vieja) await borrar(BANNERS, vieja);
    }

    return { bannerUrl: url };
  }

  static async getByUser(userId) {
    const { data: userGroups } = await supabase
      .from("users_groups")
      .select("id_group")
      .eq("id_user", userId);

    if (!userGroups?.length) return [];

    const groupIds = userGroups.map((ug) => ug.id_group);

    const { data: groupCourses } = await supabase
      .from("groups_courses")
      .select("id_course")
      .in("id_group", groupIds);

    if (!groupCourses?.length) return [];

    const courseIds = [...new Set(groupCourses.map((gc) => gc.id_course))];

    const { data: courses } = await supabase.from("courses").select("*").in("id", courseIds);

    return (courses || []).map(aObjeto);
  }
}

module.exports = CourseService;
