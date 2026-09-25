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


/**
 * Ids de las actividades de cada curso, sacados de sus secciones.
 *
 * La columna courses.actividades sigue existiendo por compatibilidad, pero ya
 * no manda: si se dejara como fuente, agregar una actividad a una sección no se
 * reflejaría ahí y las dos versiones se separarían sin que nadie lo note. Se
 * deriva en cada lectura, que es una consulta más y cero riesgo de desfase.
 *
 * Durante la migración las tablas pueden no existir todavía; en ese caso se
 * devuelve null y quien llama se queda con el valor guardado.
 */
async function actividadesPorCurso(courseIds) {
  if (!courseIds.length) return new Map();

  const { data: secciones, error } = await supabase
    .from("sections")
    .select("id, course_id, orden")
    .in("course_id", courseIds)
    .order("orden", { ascending: true });
  if (error) return null; // todavía no se creó la tabla

  const mapa = new Map(courseIds.map((id) => [id, []]));
  if (!secciones?.length) return mapa;

  const { data: actividades } = await supabase
    .from("activities")
    .select("id, section_id, orden")
    .in("section_id", secciones.map((s) => s.id))
    .order("orden", { ascending: true });

  for (const seccion of secciones) {
    const suyas = (actividades || []).filter((a) => a.section_id === seccion.id);
    mapa.get(seccion.course_id)?.push(...suyas.map((a) => a.id));
  }
  return mapa;
}

class CourseService {
  static PAGINA = 50;

  /**
   * Catálogo de cursos (HU-027).
   * `instructor` no es un filtro opcional del cliente: el controlador lo impone
   * cuando quien pregunta es un instructor, para que vea solo lo suyo.
   */
  static async getAll(tenantId = null, opciones = {}) {
    const { buscar, estado, instructor } = opciones;
    const porPagina = Math.min(Number(opciones.porPagina) || CourseService.PAGINA, 200);
    const pagina = Math.max(Number(opciones.pagina) || 1, 1);
    const desde = (pagina - 1) * porPagina;

    let query = supabase.from("courses").select("*", { count: "exact" });
    if (tenantId) query = query.eq("tenant_id", tenantId);
    if (instructor) query = query.eq("instructor", instructor);
    if (estado) query = query.eq("status", estado);
    if (buscar) query = query.ilike("name", `%${String(buscar).trim()}%`);

    const { data, error, count } = await query
      .order("name", { ascending: true })
      .range(desde, desde + porPagina - 1);
    if (error) throw new Error(error.message);

    const cursos = (data || []).map(aObjeto);

    const mapa = await actividadesPorCurso(cursos.map((c) => c.id));
    if (mapa) for (const c of cursos) c.actividades = mapa.get(c.id) || [];

    return {
      cursos,
      total: count ?? cursos.length,
      pagina,
      porPagina,
      paginas: Math.max(Math.ceil((count ?? cursos.length) / porPagina), 1),
    };
  }

  static async getById(id, tenantId = null) {
    const { data } = await delTenant(
      supabase.from("courses").select("*").eq("id", id),
      tenantId
    ).maybeSingle();
    const curso = aObjeto(data);
    if (!curso) return curso;

    const mapa = await actividadesPorCurso([curso.id]);
    if (mapa) curso.actividades = mapa.get(curso.id) || [];

    return curso;
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
