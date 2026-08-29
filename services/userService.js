const { supabase } = require("../helpers/supabaseHelper.js");
const UserSchema = require("../schemas/userSchemas.js");
const bcrypt = require("bcrypt");
const crypto = require("crypto");

const SALT_ROUNDS = 10;

function toUser(row) {
  if (!row) return null;
  const { tenant_id, created_at, ...rest } = row;
  const user = { ...rest };
  if (tenant_id !== undefined) user.tenantId = tenant_id;
  return user;
}

function fromUser(data) {
  const out = { ...data };
  if ("tenantId" in out) {
    out.tenant_id = out.tenantId ?? null;
    delete out.tenantId;
  }
  delete out.createdAt;
  return out;
}

class UserService {
  static async _getForAuth(email) {
    const { data } = await supabase.from("users").select("*").eq("email", email).maybeSingle();
    return toUser(data);
  }

  static async _createOAuthUser({ email, firstname, lastname, tenantId }) {
    const id = crypto.randomBytes(3).toString("hex");
    const raw = {
      id,
      email,
      firstname: firstname || "",
      lastname: lastname || "",
      tenantId: tenantId || null,
      role: "student",
      status: "Active",
      level: 0,
      xp: 0,
      streak: 0,
      average: 0,
      missions: "0/0",
      phonumber: "",
    };

    const validation = UserSchema.schema.safeParse(raw);
    if (!validation.success) {
      throw new Error(validation.error.errors.map((e) => e.message).join(", "));
    }

    const { error } = await supabase.from("users").insert(fromUser(validation.data));
    if (error) throw new Error(error.message);
    return validation.data;
  }

  static async create(userData) {
    const id = crypto.randomBytes(3).toString("hex");
    userData.id = id;

    if (userData.password) {
      userData.password = await bcrypt.hash(userData.password, SALT_ROUNDS);
    }

    const validation = UserSchema.schema.safeParse(userData);
    if (!validation.success) {
      throw new Error(validation.error.errors.map((err) => err.message).join(", "));
    }

    const user = validation.data;
    const { error } = await supabase.from("users").insert(fromUser(user));
    if (error) throw new Error(error.message);

    const { password: _, ...safeUser } = user;
    return safeUser;
  }

  static async getAll(tenantId = null) {
    let query = supabase.from("users").select("*");
    if (tenantId) query = query.eq("tenant_id", tenantId);
    const { data, error } = await query;
    if (error) throw new Error(error.message);

    return (data || []).map((row) => {
      const user = toUser(row);
      delete user.password;
      return user;
    });
  }

  static async getById(id) {
    const { data } = await supabase.from("users").select("*").eq("id", id).maybeSingle();
    if (!data) return null;
    const user = toUser(data);
    delete user.password;
    return user;
  }

  static async getByEmail(email, tenantId = null) {
    let query = supabase.from("users").select("*").eq("email", email);
    if (tenantId) query = query.eq("tenant_id", tenantId);
    const { data } = await query.maybeSingle();
    if (!data) return null;
    const user = toUser(data);
    delete user.password;
    return user;
  }

  static async getByRole(role, tenantId = null) {
    let query = supabase.from("users").select("*").eq("role", role);
    if (tenantId) query = query.eq("tenant_id", tenantId);
    const { data, error } = await query;
    if (error) return [];

    return (data || []).map((row) => {
      const user = toUser(row);
      delete user.password;
      return user;
    });
  }

  static async deleteUser(id) {
    const { data } = await supabase.from("users").delete().eq("id", id).select("id").maybeSingle();
    if (!data) throw new Error("Usuario no encontrado");
    return id;
  }

  static async updateUser(id, updateData) {
    const { data: existing } = await supabase.from("users").select("id").eq("id", id).maybeSingle();
    if (!existing) return { error: "Usuario no encontrado" };

    if (updateData.password) {
      updateData.password = await bcrypt.hash(updateData.password, SALT_ROUNDS);
    }

    const validation = UserSchema.schema.partial().safeParse(updateData);
    if (!validation.success) {
      return { error: "Datos inválidos", details: validation.error.errors.map((e) => e.message) };
    }

    const { error } = await supabase.from("users").update(fromUser(validation.data)).eq("id", id);
    if (error) return { error: error.message };

    return { message: `Usuario ${id} actualizado correctamente`, updatedData: validation.data };
  }
}

module.exports = UserService;
