const { supabase } = require("../helpers/supabaseHelper.js");
const { errorDeValidacion, detalleDeValidacion } = require("../helpers/validacion.js");
const GroupSchema = require("../schemas/groupSchema.js");
const AvisoService = require("./avisoService.js");
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

    // Antes de crear nada: sin esta comprobación se podía crear un grupo con
    // personas de otra empresa, y después leer sus nombres y correos en el
    // detalle del grupo. Es la misma regla que al agregar integrantes.
    const integrantes = Array.isArray(userIds) && userIds.length
      ? await GroupService._integrantesValidos(userIds, group.tenantId ?? null)
      : [];

    const { error } = await supabase.from("groups").insert(aFila(group));
    if (error) throw new Error(error.message);

    if (integrantes.length) {
      const records = integrantes.map((userId) => ({ id_user: userId, id_group: group.id }));
      const { error: e2 } = await supabase.from("users_groups").insert(records);
      if (e2) {
        // Un grupo creado sin las personas que se pidieron confunde más que
        // un error: se deshace.
        await supabase.from("groups").delete().eq("id", group.id);
        throw new Error(e2.message);
      }
    }

    return group;
  }

  /**
   * Los ids que pueden entrar a un grupo de esta empresa, o 400 si alguno no.
   *
   * Un grupo es de una sola empresa y sus integrantes también. No distingue
   * "no existe" de "es de otra empresa": ambas respuestas son la misma para
   * quien pregunta, y sumadas delatarían quién hay en las otras organizaciones.
   */
  static async _integrantesValidos(userIds, tenantId) {
    let q = supabase.from("users").select("id").in("id", userIds);
    q = tenantId ? q.eq("tenant_id", tenantId) : q.is("tenant_id", null);
    const { data: validos } = await q;

    const permitidos = new Set((validos || []).map((u) => u.id));
    const rechazados = [...new Set(userIds)].filter((id) => !permitidos.has(id));
    if (rechazados.length) {
      const err = new Error(
        `Estos usuarios no pertenecen a la organización del grupo: ${rechazados.join(", ")}`
      );
      err.status = 400;
      throw err;
    }
    return [...permitidos];
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
    if (!Array.isArray(userIds) || userIds.length === 0) {
      const err = new Error("Debe enviar al menos un usuario.");
      err.status = 400;
      throw err;
    }

    const { data: grupo } = await delTenant(
      supabase.from("groups").select("id, tenant_id").eq("id", groupId),
      tenantId
    ).maybeSingle();
    // Un grupo de otra empresa se responde igual que uno inexistente: decir
    // "existe pero no es tuyo" ya revelaría que existe.
    if (!grupo) {
      const err = new Error("Grupo no encontrado");
      err.status = 404;
      throw err;
    }

    // La empresa se toma del GRUPO y no de quien llama, para que la regla siga
    // valiendo cuando opera un superadmin, que no tiene empresa propia.
    const permitidos = await GroupService._integrantesValidos(userIds, grupo.tenant_id);

    // upsert con onConflict: agregar a alguien que ya está no duplica ni falla.
    const records = permitidos.map((userId) => ({ id_user: userId, id_group: groupId }));
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
    if (!existe) {
      const err = new Error("Grupo no encontrado");
      err.status = 404;
      throw err;
    }

    const { error } = await supabase
      .from("users_groups")
      .delete()
      .eq("id_group", groupId)
      .in("id_user", userIds);
    if (error) throw new Error(error.message);
    return { message: "Usuarios eliminados del grupo correctamente" };
  }

  /**
   * Asigna cursos a un equipo (HU-024).
   *
   * No hace falta tocar nada más para que los integrantes lo vean: el curso
   * les llega siguiendo la cadena usuario → equipo → curso, así que la fila
   * nueva ya alcanza.
   */
  static async addCoursesToGroup(groupId, courseIds, tenantId = null) {
    if (!Array.isArray(courseIds) || courseIds.length === 0) {
      const err = new Error("Debe enviar al menos un curso.");
      err.status = 400;
      throw err;
    }

    const { data: grupo } = await delTenant(
      supabase.from("groups").select("id, tenant_id").eq("id", groupId),
      tenantId
    ).maybeSingle();
    if (!grupo) {
      const err = new Error("Grupo no encontrado");
      err.status = 404;
      throw err;
    }

    // La empresa sale del GRUPO, no de quien llama, para que la regla valga
    // también cuando opera un superadmin.
    const { data: validos } = await supabase
      .from("courses").select("id").in("id", courseIds).eq("tenant_id", grupo.tenant_id);

    const permitidos = new Set((validos || []).map((c) => c.id));
    const rechazados = [...new Set(courseIds)].filter((id) => !permitidos.has(id));
    if (rechazados.length) {
      const err = new Error(
        `Estos cursos no pertenecen a la organización del equipo: ${rechazados.join(", ")}`
      );
      err.status = 400;
      throw err;
    }

    // UNIQUE(id_group, id_course) en la base: asignar dos veces el mismo curso
    // no duplica ni falla.
    const filas = [...permitidos].map((id) => ({ id_group: groupId, id_course: id }));
    const { error } = await supabase
      .from("groups_courses")
      .upsert(filas, { onConflict: "id_group,id_course" });
    if (error) throw new Error(error.message);

    // Sin await: el curso ya quedó asignado y quien lo asigna no tiene por qué
    // esperar a que salgan los correos.
    AvisoService.cursoAsignado({ courseIds: [...permitidos], groupIds: [groupId] });

    return { message: "Cursos asignados al equipo correctamente" };
  }

  /**
   * Quita cursos del equipo. Solo desaparece el acceso: el progreso de cada
   * persona vive en xp_movimientos y no se toca, así que volver a asignarlo
   * devuelve el curso con lo ya avanzado.
   */
  static async removeCoursesFromGroup(groupId, courseIds, tenantId = null) {
    if (!Array.isArray(courseIds) || courseIds.length === 0) {
      const err = new Error("Debe enviar al menos un curso.");
      err.status = 400;
      throw err;
    }

    const { data: existe } = await delTenant(
      supabase.from("groups").select("id").eq("id", groupId),
      tenantId
    ).maybeSingle();
    if (!existe) {
      const err = new Error("Grupo no encontrado");
      err.status = 404;
      throw err;
    }

    const { error } = await supabase
      .from("groups_courses").delete().eq("id_group", groupId).in("id_course", courseIds);
    if (error) throw new Error(error.message);

    return { message: "Cursos retirados del equipo correctamente" };
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
    if (!existing) {
      const err = new Error("Grupo no encontrado");
      err.status = 404;
      throw err;
    }

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
