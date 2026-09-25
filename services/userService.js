const { supabase } = require("../helpers/supabaseHelper.js");
const { errorDeValidacion, detalleDeValidacion } = require("../helpers/validacion.js");
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

  // Igual que _getForAuth pero por id, porque el JWT lleva el id y no el email.
  // getById no sirve acá: borra el hash antes de devolver el usuario.
  static async _getForAuthById(id) {
    const { data } = await supabase.from("users").select("*").eq("id", id).maybeSingle();
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
      throw errorDeValidacion(validation.error);
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
      throw errorDeValidacion(validation.error);
    }

    const user = validation.data;
    const { error } = await supabase.from("users").insert(fromUser(user));
    if (error) throw new Error(error.message);

    const { password: _, ...safeUser } = user;
    return safeUser;
  }

  // A partir de este tamaño el listado se pagina. Una empresa con cientos de
  // personas no debería mandar todo junto en cada carga de pantalla.
  static PAGINA = 50;

  /**
   * Listado con filtros y paginación (HU-015).
   * Los filtros se aplican en la base y no en memoria: traer todo para
   * descartarlo después anularía el sentido de paginar.
   */
  static async getAll(tenantId = null, opciones = {}) {
    const { rol, estado, buscar } = opciones;
    const porPagina = Math.min(Number(opciones.porPagina) || UserService.PAGINA, 200);
    const pagina = Math.max(Number(opciones.pagina) || 1, 1);
    const desde = (pagina - 1) * porPagina;

    // count: "exact" devuelve el total sin traer las filas, para saber
    // cuántas páginas hay.
    let query = supabase.from("users").select("*", { count: "exact" });
    if (tenantId) query = query.eq("tenant_id", tenantId);
    if (rol) query = query.eq("role", rol);
    if (estado) query = query.eq("status", estado);
    if (buscar) {
      const t = `%${String(buscar).trim()}%`;
      query = query.or(`firstname.ilike.${t},lastname.ilike.${t},email.ilike.${t}`);
    }

    const { data, error, count } = await query
      .order("firstname", { ascending: true })
      .range(desde, desde + porPagina - 1);
    if (error) throw new Error(error.message);

    const usuarios = (data || []).map((row) => {
      const user = toUser(row);
      delete user.password;
      return user;
    });

    return {
      usuarios,
      total: count ?? usuarios.length,
      pagina,
      porPagina,
      paginas: Math.max(Math.ceil((count ?? usuarios.length) / porPagina), 1),
    };
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
      return detalleDeValidacion(validation.error);
    }

    const { error } = await supabase.from("users").update(fromUser(validation.data)).eq("id", id);
    if (error) return { error: error.message };

    return { message: `Usuario ${id} actualizado correctamente`, updatedData: validation.data };
  }
}

module.exports = UserService;
