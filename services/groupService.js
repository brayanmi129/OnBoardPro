const { supabase } = require("../helpers/supabaseHelper.js");
const { errorDeValidacion, detalleDeValidacion } = require("../helpers/validacion.js");
const GroupSchema = require("../schemas/groupSchema.js");
const crypto = require("crypto");


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

// Ninguna consulta pisa datos de otra empresa: el superadmin pasa tenantId null
// y ve todo; cualquier otro rol llega siempre con el suyo desde el JWT.
function delTenant(query, tenantId) {
  return tenantId ? query.eq("tenant_id", tenantId) : query;
}

class GroupService {
  static async create(groupData) {
    // userIds no es una columna de groups: son las personas que se agregan a la
    // tabla users_groups más abajo. Hay que sacarlo antes de validar porque el
    // schema es .strict() y rechazaría el objeto entero por esa clave, que es
    // justo lo que la documentación del endpoint pedía mandar.
    const { userIds, ...datos } = groupData;
    const customId = crypto.randomBytes(3).toString("hex");
    datos.id = customId;

    const validation = GroupSchema.schema.safeParse(datos);
    if (!validation.success) {
      throw errorDeValidacion(validation.error);
    }

    const group = validation.data;
    const { error } = await supabase.from("groups").insert(aFila(group));
    if (error) throw new Error(error.message);

    if (Array.isArray(userIds) && userIds.length > 0) {
      const records = userIds.map((userId) => ({ id_user: userId, id_group: group.id }));
      await supabase.from("users_groups").insert(records);
    }

    return group;
  }

  static async getAll(tenantId = null) {
    const { data: groups, error } = await delTenant(
      supabase.from("groups").select("*"),
      tenantId
    );
    if (error) throw new Error(error.message);
    if (!groups?.length) return [];

    const groupIds = groups.map((g) => g.id);

    const [{ data: userGroups }, { data: groupCourses }] = await Promise.all([
      supabase.from("users_groups").select("id_group, id_user").in("id_group", groupIds),
      supabase.from("groups_courses").select("id_group, id_course").in("id_group", groupIds),
    ]);

    const userIds = [...new Set((userGroups || []).map((ug) => ug.id_user))];
    const courseIds = [...new Set((groupCourses || []).map((gc) => gc.id_course))];

    const [{ data: users }, { data: courses }] = await Promise.all([
      userIds.length
        ? supabase.from("users").select("id, firstname, lastname, email, role").in("id", userIds)
        : Promise.resolve({ data: [] }),
      courseIds.length
        ? supabase.from("courses").select("*").in("id", courseIds)
        : Promise.resolve({ data: [] }),
    ]);

    return groups.map((group) => ({
      ...aObjeto(group),
      users: (userGroups || [])
        .filter((ug) => ug.id_group === group.id)
        .map((ug) => (users || []).find((u) => u.id === ug.id_user))
        .filter(Boolean),
      courses: (groupCourses || [])
        .filter((gc) => gc.id_group === group.id)
        .map((gc) => (courses || []).find((c) => c.id === gc.id_course))
        .filter(Boolean),
    }));
  }

  static async getById(id, tenantId = null) {
    const { data: group } = await delTenant(
      supabase.from("groups").select("*").eq("id", id),
      tenantId
    ).maybeSingle();
    if (!group) return null;

    const [{ data: userGroups }, { data: groupCourses }] = await Promise.all([
      supabase.from("users_groups").select("id_user").eq("id_group", id),
      supabase.from("groups_courses").select("id_course").eq("id_group", id),
    ]);

    const userIds = (userGroups || []).map((ug) => ug.id_user);
    const courseIds = (groupCourses || []).map((gc) => gc.id_course);

    const [{ data: users }, { data: courses }] = await Promise.all([
      userIds.length
        ? supabase.from("users").select("id, firstname, lastname, email, role").in("id", userIds)
        : Promise.resolve({ data: [] }),
      courseIds.length
        ? supabase.from("courses").select("*").in("id", courseIds)
        : Promise.resolve({ data: [] }),
    ]);

    return { ...aObjeto(group), users: users || [], courses: courses || [] };
  }

  static async addUsersToGroup(groupId, userIds, tenantId = null) {
    const { data: groupCheck } = await delTenant(
      supabase.from("groups").select("id").eq("id", groupId),
      tenantId
    ).maybeSingle();
    // Un grupo de otra empresa se responde igual que uno inexistente: decir
    // "existe pero no es tuyo" ya revelaría que existe.
    if (!groupCheck) throw new Error("Grupo no encontrado");

    const records = userIds.map((userId) => ({ id_user: userId, id_group: groupId }));
    const { error } = await supabase
      .from("users_groups")
      .upsert(records, { onConflict: "id_user,id_group" });
    if (error) throw new Error(error.message);

    return { message: "Usuarios agregados al grupo correctamente" };
  }

  static async removeUsersFromGroup(groupId, userIds, tenantId = null) {
    const { data: existe } = await delTenant(
      supabase.from("groups").select("id").eq("id", groupId),
      tenantId
    ).maybeSingle();
    if (!existe) throw new Error("Grupo no encontrado");

    const { error } = await supabase
      .from("users_groups")
      .delete()
      .eq("id_group", groupId)
      .in("id_user", userIds);
    if (error) throw new Error(error.message);
    return { message: "Usuarios eliminados del grupo correctamente" };
  }

  static async updateGroup(id, updateData, tenantId = null) {
    const { data: existing } = await delTenant(
      supabase.from("groups").select("id").eq("id", id),
      tenantId
    ).maybeSingle();
    if (!existing) return { error: "Grupo no encontrado" };

    // El dueño no se cambia por la API: vendría del cliente.
    delete updateData.tenantId;

    const validation = GroupSchema.schema.partial().safeParse(updateData);
    if (!validation.success) {
      return detalleDeValidacion(validation.error);
    }

    const { error } = await supabase.from("groups").update(validation.data).eq("id", id);
    if (error) return { error: error.message };

    return { message: `Grupo ${id} actualizado correctamente`, updatedData: validation.data };
  }

  static async deleteGroup(id, tenantId = null) {
    const { data: existing } = await delTenant(
      supabase.from("groups").select("id").eq("id", id),
      tenantId
    ).maybeSingle();
    if (!existing) throw new Error("Grupo no encontrado");

    // ON DELETE CASCADE elimina users_groups y groups_courses automáticamente
    const { error } = await supabase.from("groups").delete().eq("id", id);
    if (error) throw new Error(error.message);

    return { message: `Grupo ${id} eliminado correctamente` };
  }

  static async getByUser(userId) {
    const { data: userGroups } = await supabase
      .from("users_groups")
      .select("id_group")
      .eq("id_user", userId);

    if (!userGroups?.length) return [];

    const groupIds = userGroups.map((ug) => ug.id_group);
    const { data: groups } = await supabase.from("groups").select("*").in("id", groupIds);

    return (groups || []).map(aObjeto);
  }
}

module.exports = GroupService;
