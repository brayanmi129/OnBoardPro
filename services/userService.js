const { supabase } = require("../helpers/supabaseHelper.js");
const { errorDeValidacion, detalleDeValidacion } = require("../helpers/validacion.js");
const UserSchema = require("../schemas/userSchemas.js");
const bcrypt = require("bcrypt");
const crypto = require("crypto");

const { porLotes } = require("../helpers/consultas.js");
const { tablaFaltante } = require("../helpers/accesos.js");

const SALT_ROUNDS = 10;

function toUser(row) {
  if (!row) return null;
  const { tenant_id, created_at, debe_cambiar_password, ...rest } = row;
  const user = { ...rest };
  if (tenant_id !== undefined) user.tenantId = tenant_id;
  user.debeCambiarPassword = debe_cambiar_password === true;
  return user;
}

function fromUser(data) {
  const out = { ...data };
  if ("tenantId" in out) {
    out.tenant_id = out.tenantId ?? null;
    delete out.tenantId;
  }
  if ("debeCambiarPassword" in out) {
    out.debe_cambiar_password = out.debeCambiarPassword === true;
    delete out.debeCambiarPassword;
  }
  delete out.createdAt;
  return out;
}

// Mientras no se corra scripts/pendiente.sql la columna no existe y PostgREST
// rechaza la escritura entera. Se reintenta sin ella, para que dar de alta o
// editar usuarios siga funcionando (sin la contraseña temporal) hasta entonces.
const faltaColumnaTemporal = (error) => /debe_cambiar_password/.test(error?.message || "");
let avisoColumna = false;
async function escribirUsuario(fila, escribir) {
  let r = await escribir(fila);
  if (r.error && faltaColumnaTemporal(r.error) && "debe_cambiar_password" in fila) {
    if (!avisoColumna) {
      avisoColumna = true;
      console.warn("[usuarios] Falta la columna users.debe_cambiar_password (scripts/pendiente.sql): no se marca la contraseña temporal.");
    }
    const { debe_cambiar_password: _, ...sinColumna } = fila;
    r = await escribir(sinColumna);
  }
  return r;
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

/**
 * Agrega a cada usuario el último día en que usó la plataforma
 * (`ultimaConexion`, "YYYY-MM-DD" o null si nunca).
 *
 * Sale del registro de accesos (accesos_diarios: una fila por persona y día)
 * y de ultima_actividad (el último día en que ganó XP), el más reciente de
 * los dos. Mientras la tabla de accesos no exista, queda solo
 * ultima_actividad. Una consulta por lote de ids, no una por persona.
 */
async function conUltimaConexion(usuarios) {
  const ultima = new Map();
  const anotar = (id, dia) => {
    if (!dia) return;
    const d = String(dia).slice(0, 10);
    if (!ultima.has(id) || d > ultima.get(id)) ultima.set(id, d);
  };
  for (const u of usuarios) anotar(u.id, u.ultima_actividad);

  try {
    const accesos = await porLotes(usuarios.map((u) => u.id), (lote) => supabase
      .from("accesos_diarios").select("user_id, dia").in("user_id", lote)
      .order("dia", { ascending: false }));
    for (const a of accesos) anotar(a.user_id, a.dia);
  } catch (e) {
    if (!tablaFaltante(e)) throw e;
  }

  return usuarios.map((u) => ({ ...u, ultimaConexion: ultima.get(u.id) ?? null }));
}

class UserService {
  static async _getForAuth(email) {
    // Los correos se guardan en minúsculas: "Ana@Empresa.com" es la misma cuenta.
    const { data } = await supabase.from("users").select("*")
      .eq("email", String(email).trim().toLowerCase()).maybeSingle();
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
    // En minúsculas, como lo buscan el login con contraseña y el de Microsoft:
    // si no, "Sara@Empresa.com" no se encontraba al entrar con Microsoft y se
    // le creaba una segunda cuenta como aprendiz.
    if (typeof userData.email === "string") userData.email = userData.email.trim().toLowerCase();

    // Quien da de alta a otra persona le pone una contraseña que conoce: es
    // temporal y se cambia en el primer ingreso. Sin contraseña (entra con
    // Google o Microsoft, o la define con "olvidé mi contraseña") no hay nada
    // que cambiar. El valor nunca lo decide quien llama.
    userData.debeCambiarPassword = Boolean(userData.password);
    if (userData.password) {
      userData.password = await bcrypt.hash(userData.password, SALT_ROUNDS);
    }

    const validation = UserSchema.schema.safeParse(userData);
    if (!validation.success) {
      throw errorDeValidacion(validation.error);
    }

    const user = validation.data;
    const { error } = await escribirUsuario(fromUser(user), (fila) => supabase.from("users").insert(fila));
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
      usuarios: await conUltimaConexion(await conNombreDeEmpresa(usuarios)),
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

  static async deleteUser(id, tenantId = null, actor = null) {
    // Un superadmin solo lo borra otro superadmin, igual que al editarlo. Sin
    // esto, uno que tuviera empresa quedaba borrable por un admin de ella.
    if (actor && actor.role !== "superadmin") {
      const { data: objetivo } = await supabase.from("users").select("role").eq("id", id).maybeSingle();
      if (objetivo?.role === "superadmin") {
        const err = new Error("Solo un superadmin puede eliminar a otro superadmin.");
        err.status = 403;
        throw err;
      }
    }

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
    // El id tampoco: es la clave a la que apuntan sus grupos, entregas y XP.
    if ("id" in updateData && updateData.id !== id) {
      return { error: "El id de un usuario no se puede cambiar.", status: 400 };
    }
    delete updateData.id;
    if (typeof updateData.email === "string") updateData.email = updateData.email.trim().toLowerCase();

    // El aviso de contraseña temporal no lo fija quien edita desde la API:
    // si un admin le pone una contraseña a otra persona, es temporal; si la
    // cambia la persona misma (perfil o enlace del correo), el servicio que
    // llama sin actor decide.
    if (actor) {
      delete updateData.debeCambiarPassword;
      if (updateData.password && actor.id !== id) updateData.debeCambiarPassword = true;
    }

    if (updateData.password) {
      updateData.password = await bcrypt.hash(updateData.password, SALT_ROUNDS);
    }

    const validation = UserSchema.schema.partial().safeParse(updateData);
    if (!validation.success) {
      return detalleDeValidacion(validation.error);
    }

    const { error } = await escribirUsuario(fromUser(validation.data),
      (fila) => supabase.from("users").update(fila).eq("id", id));
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

    // El hash de la contraseña nunca sale del servidor.
    const { password: _hash, ...updatedData } = validation.data;
    return { message: `Usuario ${id} actualizado correctamente`, updatedData };
  }
}

module.exports = UserService;
