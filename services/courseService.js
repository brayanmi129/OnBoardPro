const crypto = require("crypto");
const { supabase } = require("../helpers/supabaseHelper.js");
const CourseSchema = require("../schemas/courseSchemas.js");


// La base guarda tenant_id; la API expone tenantId, igual que en usuarios.
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
      throw new Error(validation.error.errors.map((err) => err.message).join(", "));
    }

    const course = validation.data;
    const { error } = await supabase.from("courses").insert(aFila(course));
    if (error) throw new Error(error.message);
    return course;
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
