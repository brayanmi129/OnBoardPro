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


/**
 * Agrega el nombre de la empresa a una lista de usuarios.
 *
 * La API ya devolvía tenantId, pero un id como "tenant-uc" no le dice nada a
 * quien mira la pantalla. Para un admin da igual —todos son de su empresa—,
 * pero un superadmin ve la lista mezclada y necesita distinguirlas.
 *
 * Se resuelve con una sola consulta para todos los ids presentes, no una por
 * usuario.
 */
async function conNombreDeEmpresa(usuarios) {
  const ids = [...new Set(usuarios.map((u) => u.tenantId).filter(Boolean))];
  if (!ids.length) return usuarios.map((u) => ({ ...u, tenantName: null }));

  const { data: empresas } = await supabase.from("tenants").select("id, name").in("id", ids);
  const nombres = new Map((empresas || []).map((t) => [t.id, t.name]));

  return usuarios.map((u) => ({ ...u, tenantName: u.tenantId ? nombres.get(u.tenantId) ?? null : null }));
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
      usuarios: await conNombreDeEmpresa(usuarios),
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

  static async deleteUser(id, tenantId = null) {
    let consulta = supabase.from("users").delete().eq("id", id);
    if (tenantId) consulta = consulta.eq("tenant_id", tenantId);
    const { data } = await consulta.select("id").maybeSingle();
    if (!data) {
      const err = new Error("Usuario no encontrado");
      err.status = 404; // antes salía como 500, que sugería un fallo del servidor
      throw err;
    }
    return id;
  }

  /**
   * @param actor Quién hace el cambio: { id, email, role }. Hace falta para
   *   decidir si puede tocar a este usuario y para firmar la auditoría.
   */
  static async updateUser(id, updateData, tenantId = null, actor = null) {
    // Sin este filtro un admin podía editar usuarios de otra empresa: lo
    // comprobamos y funcionaba. El tenant llega del JWT, nunca del cuerpo.
    let consulta = supabase.from("users").select("id, role, tenant_id").eq("id", id);
    if (tenantId) consulta = consulta.eq("tenant_id", tenantId);
    const { data: existing } = await consulta.maybeSingle();
    // Un usuario de otra empresa se responde igual que uno inexistente.
    if (!existing) return { error: "Usuario no encontrado", status: 404 };

    // Un superadmin solo lo toca otro superadmin. Hoy quedan protegidos de
    // rebote porque no tienen empresa y el filtro de arriba los descarta, pero
    // eso se caería el día que alguno tenga tenant_id. Acá es explícito.
    if (existing.role === "superadmin" && actor && actor.role !== "superadmin") {
      return { error: "Solo un superadmin puede modificar a otro superadmin.", status: 403 };
    }

    // La empresa no se cambia por esta vía: permitirlo dejaría mover a una
    // persona de un cliente a otro con solo mandar un campo más.
    if (tenantId) delete updateData.tenantId;

    if (updateData.password) {
      updateData.password = await bcrypt.hash(updateData.password, SALT_ROUNDS);
    }

    const validation = UserSchema.schema.partial().safeParse(updateData);
    if (!validation.success) {
      return detalleDeValidacion(validation.error);
    }

    const { error } = await supabase.from("users").update(fromUser(validation.data)).eq("id", id);
    if (error) return { error: error.message };

    // Criterio 3 de HU-018: el cambio de rol queda auditado con autor y fecha.
    // Se registra después de que la escritura tuvo éxito, para no dejar
    // constancia de algo que no ocurrió.
    const rolNuevo = validation.data.role;
    if (rolNuevo && rolNuevo !== existing.role) {
      const { error: errAudit } = await supabase.from("role_changes").insert({
        id: crypto.randomBytes(8).toString("hex"),
        user_id: id,
        tenant_id: existing.tenant_id ?? null,
        rol_anterior: existing.role,
        rol_nuevo: rolNuevo,
        autor_id: actor?.id ?? null,
        autor_email: actor?.email ?? null,
      });
      // Un fallo al auditar no deshace el cambio, pero no puede pasar callado.
      if (errAudit) console.error("[auditoria] no se registró el cambio de rol:", errAudit.message);
      else console.log(`[auditoria] ${actor?.email ?? "?"} cambió el rol de ${id}: ${existing.role} → ${rolNuevo}`);
    }

    return { message: `Usuario ${id} actualizado correctamente`, updatedData: validation.data };
  }
}

module.exports = UserService;
