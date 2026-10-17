const crypto = require("crypto");
const { supabase } = require("../helpers/supabaseHelper.js");

function fallo(message, status) {
  const err = new Error(message);
  err.status = status;
  return err;
}

/**
 * Logros (HU-059).
 *
 * Un logro es la *definición* de una meta: "completar 10 actividades", "llegar
 * al nivel 5". No es el hecho de haberla conseguido; eso llega con HU-061.
 *
 * Por eso acá no hay nada de desbloqueo ni de progreso de una persona: es un
 * catálogo que administra la organización.
 */

// Qué se puede medir, y qué significa la meta en cada caso. El mensaje se usa
// para explicar el error cuando llega un tipo que no existe, y para describir
// la unidad en la respuesta.
const CONDICIONES = {
  actividades_completadas: { unidad: "actividades", texto: (n) => `Completar ${n} actividades` },
  secciones_completadas: { unidad: "secciones", texto: (n) => `Completar ${n} secciones` },
  cursos_completados: { unidad: "cursos", texto: (n) => `Terminar ${n} cursos al 100%` },
  examenes_aprobados: { unidad: "exámenes", texto: (n) => `Aprobar ${n} exámenes` },
  racha_dias: { unidad: "días seguidos", texto: (n) => `Mantener ${n} días seguidos de actividad` },
  nivel_alcanzado: { unidad: "nivel", texto: (n) => `Alcanzar el nivel ${n}` },
  entregas_aprobadas: { unidad: "entregas", texto: (n) => `Tener ${n} entregas aprobadas` },
  posicion_ranking: { unidad: "puesto", texto: (n) => `Quedar en el puesto ${n} o mejor del ranking` },
  juegos_completados: { unidad: "juegos", texto: (n) => `Completar ${n} juegos` },
};

const CATEGORIAS = ["Progreso", "Constancia", "Nivel", "Ranking", "Entregas", "Juegos"];

const CAMPOS = "id, tenant_id, course_id, nombre, descripcion, categoria, tipo_condicion, meta, xp_recompensa, activo, creado_por, created_at";

function presentar(l) {
  const cond = CONDICIONES[l.tipo_condicion];
  return {
    id: l.id,
    nombre: l.nombre,
    descripcion: l.descripcion || null,
    categoria: l.categoria,
    condicion: {
      tipo: l.tipo_condicion,
      meta: l.meta,
      unidad: cond?.unidad ?? null,
      // Texto armado acá para que la interfaz no tenga que reconstruir la
      // frase y todas las pantallas la escriban igual.
      descripcion: cond ? cond.texto(l.meta) : null,
    },
    // Nulo cuando el logro vale para toda la organización.
    cursoId: l.course_id || null,
    // Sin empresa es genérico: lo creó el superadmin y vale para todas.
    generico: !l.tenant_id,
    xpRecompensa: l.xp_recompensa,
    activo: l.activo !== false,
    creadoPor: l.creado_por || null,
    creadoEn: l.created_at,
  };
}

class LogroService {
  /** El logro, comprobando que sea de la organización de quien pregunta. */
  static async _logro(id, actor) {
    let q = supabase.from("logros").select(CAMPOS).eq("id", id);
    if (actor.role !== "superadmin") q = q.eq("tenant_id", actor.tenantId);

    const { data } = await q.maybeSingle();
    if (!data) throw fallo("Logro no encontrado", 404);
    return data;
  }

  /**
   * Valida lo que llega del cliente.
   *
   * `parcial` deja pasar lo que no se envió, para poder editar un solo campo
   * sin tener que mandar el logro entero.
   */
  static _validar(datos, { parcial = false } = {}) {
    const limpio = {};

    if (datos.nombre !== undefined || !parcial) {
      const nombre = String(datos.nombre ?? "").trim();
      if (!nombre) throw fallo("El logro necesita un nombre.", 400);
      if (nombre.length > 100) throw fallo("El nombre no puede pasar de 100 caracteres.", 400);
      limpio.nombre = nombre;
    }

    if (datos.descripcion !== undefined) {
      limpio.descripcion = datos.descripcion ? String(datos.descripcion).trim() : null;
    }

    if (datos.categoria !== undefined || !parcial) {
      if (!CATEGORIAS.includes(datos.categoria)) {
        throw fallo(`La categoría debe ser una de: ${CATEGORIAS.join(", ")}.`, 400);
      }
      limpio.categoria = datos.categoria;
    }

    if (datos.tipoCondicion !== undefined || !parcial) {
      if (!CONDICIONES[datos.tipoCondicion]) {
        throw fallo(
          `El tipo de condición debe ser uno de: ${Object.keys(CONDICIONES).join(", ")}.`,
          400
        );
      }
      limpio.tipo_condicion = datos.tipoCondicion;
    }

    if (datos.meta !== undefined || !parcial) {
      const meta = Number(datos.meta);
      if (!Number.isInteger(meta) || meta < 1) {
        throw fallo("La meta debe ser un número entero mayor que cero.", 400);
      }
      limpio.meta = meta;
    }

    if (datos.xpRecompensa !== undefined) {
      const xp = Number(datos.xpRecompensa);
      if (!Number.isInteger(xp) || xp < 0) {
        throw fallo("El XP de recompensa debe ser un entero de cero o más.", 400);
      }
      limpio.xp_recompensa = xp;
    }

    if (datos.cursoId !== undefined) {
      limpio.course_id = datos.cursoId || null;
    }

    if (datos.activo !== undefined) {
      limpio.activo = datos.activo === true || datos.activo === "true";
    }

    return limpio;
  }

  /**
   * Crea un logro.
   *
   * La organización sale del token y nunca del cuerpo: si viniera del cliente,
   * un administrador podría crear logros dentro de otra empresa.
   */
  static async crear(actor, datos) {
    const limpio = LogroService._validar(datos);

    // Tres alcances. El genérico vale para todas las organizaciones y solo lo
    // crea el superadmin: un admin podría definir insignias para empresas que
    // no son la suya.
    let tenantId;
    if (actor.role === "superadmin") {
      tenantId = datos.generico === true ? null : datos.tenantId || actor.tenantId || null;
    } else {
      if (datos.generico === true) {
        throw fallo("Solo un superadministrador crea logros para todas las organizaciones.", 403);
      }
      tenantId = actor.tenantId;
      if (!tenantId) throw fallo("No se pudo determinar la organización del logro.", 400);
    }

    const id = crypto.randomBytes(8).toString("hex");
    const { error } = await supabase.from("logros").insert({
      id,
      tenant_id: tenantId,
      xp_recompensa: 0,
      activo: true,
      creado_por: actor.id,
      ...limpio,
    });

    if (error) {
      // 23505 es la violación del índice único: ya hay un logro con ese nombre.
      if (error.code === "23505" || /duplicate|unique/i.test(error.message)) {
        throw fallo("Ya existe un logro con ese nombre en esta organización.", 409);
      }
      throw new Error(error.message);
    }

    const { data } = await supabase.from("logros").select(CAMPOS).eq("id", id).maybeSingle();
    return { message: "Logro creado", logro: presentar(data) };
  }

  /** El catálogo de la organización. Lo ve cualquiera que haya iniciado sesión. */
  /**
   * El catálogo que le corresponde a quien pregunta: los de su organización
   * más los genéricos, que valen para todas. El superadmin ve todo.
   */
  static async listar(actor, { categoria, activo, cursoId } = {}) {
    let q = supabase.from("logros").select(CAMPOS);
    if (actor.role !== "superadmin") {
      q = q.or(`tenant_id.eq.${actor.tenantId},tenant_id.is.null`);
    }
    if (categoria) q = q.eq("categoria", categoria);
    // `cursoId=general` trae los que no pertenecen a ningún curso.
    if (cursoId === "general") q = q.is("course_id", null);
    else if (cursoId) q = q.eq("course_id", cursoId);
    if (activo !== undefined) q = q.eq("activo", activo === "true" || activo === true);

    const { data, error } = await q.order("categoria").order("meta");
    if (error) throw new Error(error.message);

    return (data || []).map(presentar);
  }

  static async obtener(id, actor) {
    return presentar(await LogroService._logro(id, actor));
  }

  static async actualizar(id, actor, datos) {
    await LogroService._logro(id, actor);

    const limpio = LogroService._validar(datos, { parcial: true });
    if (!Object.keys(limpio).length) throw fallo("No enviaste nada que cambiar.", 400);

    const { error } = await supabase.from("logros").update(limpio).eq("id", id);
    if (error) {
      if (error.code === "23505" || /duplicate|unique/i.test(error.message)) {
        throw fallo("Ya existe un logro con ese nombre en esta organización.", 409);
      }
      throw new Error(error.message);
    }

    const { data } = await supabase.from("logros").select(CAMPOS).eq("id", id).maybeSingle();
    return { message: "Logro actualizado", logro: presentar(data) };
  }

  static async eliminar(id, actor) {
    await LogroService._logro(id, actor);

    const { error } = await supabase.from("logros").delete().eq("id", id);
    if (error) throw new Error(error.message);

    return { message: "Logro eliminado" };
  }

  /** Lo que la interfaz necesita para armar el formulario de creación. */
  static opciones() {
    return {
      categorias: CATEGORIAS,
      condiciones: Object.entries(CONDICIONES).map(([tipo, c]) => ({
        tipo,
        unidad: c.unidad,
        ejemplo: c.texto(10),
      })),
    };
  }
}

module.exports = LogroService;
module.exports.CONDICIONES = CONDICIONES;
module.exports.CATEGORIAS = CATEGORIAS;
