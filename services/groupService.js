const { supabase } = require("../helpers/supabaseHelper.js");
const GroupSchema = require("../schemas/groupSchema.js");
const crypto = require("crypto");

class GroupService {
  static async create(groupData) {
    const customId = crypto.randomBytes(3).toString("hex");
    groupData.id = customId;

    const validation = GroupSchema.schema.safeParse(groupData);
    if (!validation.success) {
      throw new Error(validation.error.errors.map((err) => err.message).join(", "));
    }

    const group = validation.data;
    const { error } = await supabase.from("groups").insert(group);
    if (error) throw new Error(error.message);

    if (Array.isArray(groupData.userIds) && groupData.userIds.length > 0) {
      const records = groupData.userIds.map((userId) => ({ id_user: userId, id_group: group.id }));
      await supabase.from("users_groups").insert(records);
    }

    return group;
  }

  static async getAll() {
    const { data: groups, error } = await supabase.from("groups").select("*");
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
      ...group,
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

  static async getById(id) {
    const { data: group } = await supabase.from("groups").select("*").eq("id", id).maybeSingle();
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

    return { ...group, users: users || [], courses: courses || [] };
  }

  static async addUsersToGroup(groupId, userIds) {
    const { data: groupCheck } = await supabase
      .from("groups")
      .select("id")
      .eq("id", groupId)
      .maybeSingle();
    if (!groupCheck) throw new Error("Grupo no encontrado");

    const records = userIds.map((userId) => ({ id_user: userId, id_group: groupId }));
    const { error } = await supabase
      .from("users_groups")
      .upsert(records, { onConflict: "id_user,id_group" });
    if (error) throw new Error(error.message);

    return { message: "Usuarios agregados al grupo correctamente" };
  }

  static async removeUsersFromGroup(groupId, userIds) {
    const { error } = await supabase
      .from("users_groups")
      .delete()
      .eq("id_group", groupId)
      .in("id_user", userIds);
    if (error) throw new Error(error.message);
    return { message: "Usuarios eliminados del grupo correctamente" };
  }

  static async updateGroup(id, updateData) {
    const { data: existing } = await supabase
      .from("groups")
      .select("id")
      .eq("id", id)
      .maybeSingle();
    if (!existing) return { error: "Grupo no encontrado" };

    const validation = GroupSchema.schema.partial().safeParse(updateData);
    if (!validation.success) {
      return { error: "Datos inválidos", details: validation.error.errors.map((e) => e.message) };
    }

    const { error } = await supabase.from("groups").update(validation.data).eq("id", id);
    if (error) return { error: error.message };

    return { message: `Grupo ${id} actualizado correctamente`, updatedData: validation.data };
  }

  static async deleteGroup(id) {
    const { data: existing } = await supabase
      .from("groups")
      .select("id")
      .eq("id", id)
      .maybeSingle();
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

    return groups || [];
  }
}

module.exports = GroupService;
