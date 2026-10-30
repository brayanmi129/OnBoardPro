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
 * al nivel 5". No es el hecho de haberla conseguido: eso vive en
 * desbloqueoService (HU-061).
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

// La categoría sale de lo que se mide y no se elige a mano. Elegida a mano
// quedaban combinaciones sin sentido, como una racha en "Progreso".
const CATEGORIA_DE = {
  actividades_completadas: "Progreso",
  secciones_completadas: "Progreso",
  cursos_completados: "Progreso",
  examenes_aprobados: "Progreso",
  racha_dias: "Constancia",
  nivel_alcanzado: "Nivel",
  entregas_aprobadas: "Entregas",
  posicion_ranking: "Ranking",
  juegos_completados: "Juegos",
};

// El ícono es opcional. Sin uno propio, cada logro muestra el de su categoría
// para que la interfaz nunca tenga un hueco.
const ICONO_DE_CATEGORIA = {
  Progreso: "🎯",
  Constancia: "🔥",
  Nivel: "⭐",
  Ranking: "🏆",
  Entregas: "📦",
  Juegos: "🎮",
};
const ICONO_GENERICO = "🏅";

const iconoDe = (l) => l.icono || ICONO_DE_CATEGORIA[l.categoria] || ICONO_GENERICO;

const CAMPOS = "id, tenant_id, course_id, nombre, descripcion, categoria, tipo_condicion, meta, xp_recompensa, icono, activo, creado_por, created_at";

function presentar(l) {
  const cond = CONDICIONES[l.tipo_condicion];
  return {
    id: l.id,
    nombre: l.nombre,
    descripcion: l.descripcion || null,
    categoria: l.categoria,
    icono: iconoDe(l),
    // Para que el editor sepa si se está mostrando el genérico o uno elegido.
    iconoPropio: Boolean(l.icono),
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
    tenantId: l.tenant_id || null,
    xpRecompensa: l.xp_recompensa,
    activo: l.activo !== false,
    creadoPor: l.creado_por || null,
    creadoEn: l.created_at,
  };
}

class LogroService {
  /**
   * El logro, comprobando que sea de la organización de quien pregunta.
   *
   * Los genéricos se pueden leer desde cualquier organización, pero solo los
   * edita el superadmin: son de todas, no de quien los está mirando.
   */
  static async _logro(id, actor, { soloLectura = false } = {}) {
    let q = supabase.from("logros").select(CAMPOS).eq("id", id);
    if (actor.role !== "superadmin") {
      q = soloLectura
        ? q.or(`tenant_id.eq.${actor.tenantId},tenant_id.is.null`)
        : q.eq("tenant_id", actor.tenantId);
    }

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

    if (datos.tipoCondicion !== undefined || !parcial) {
      if (!CONDICIONES[datos.tipoCondicion]) {
        throw fallo(
          `El tipo de condición debe ser uno de: ${Object.keys(CONDICIONES).join(", ")}.`,
          400
        );
      }
      limpio.tipo_condicion = datos.tipoCondicion;
      // Si llega `categoria` se ignora: la decide la condición.
      limpio.categoria = CATEGORIA_DE[datos.tipoCondicion];
    }

    if (datos.icono !== undefined) {
      const icono = datos.icono ? String(datos.icono).trim() : null;
      if (icono && icono.length > 100) throw fallo("El ícono no puede pasar de 100 caracteres.", 400);
      // Vacío o null vuelve al ícono genérico de la categoría.
      limpio.icono = icono || null;
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
    LogroService._asegurarAlcance(tenantId, limpio.course_id);
    await LogroService._asegurarCurso(tenantId, limpio.course_id);

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
  static async listar(actor, { categoria, activo, cursoId, tenantId } = {}) {
    let q = supabase.from("logros").select(CAMPOS);
    // El superadmin puede pararse en una organización y ver lo que vería
    // ella: sus logros más los genéricos. Para el resto la organización es
    // siempre la del token, mande lo que mande.
    const empresa = actor.role === "superadmin" ? tenantId : actor.tenantId;
    if (empresa) {
      if (!/^[\w-]+$/.test(String(empresa))) throw fallo("tenantId inválido.", 400);
      q = q.or(`tenant_id.eq.${empresa},tenant_id.is.null`);
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

  /**
   * Un curso es de una sola empresa: un genérico atado a uno solo lo podría
   * ganar esa empresa, y entonces no sería genérico. La base también lo impide.
   */
  static _asegurarAlcance(tenantId, cursoId) {
    if (!tenantId && cursoId) {
      throw fallo("Un logro para todas las organizaciones no puede estar atado a un curso.", 400);
    }
  }

  /**
   * El curso de un logro tiene que ser de la misma organización que el logro.
   * La clave foránea solo dice que el curso existe: sin esto, un admin podía
   * atar un logro suyo a un curso de otra empresa. Ajeno o inexistente, 404.
   */
  static async _asegurarCurso(tenantId, cursoId) {
    if (!cursoId) return;
    const { data } = await supabase
      .from("courses").select("id").eq("id", cursoId).eq("tenant_id", tenantId).maybeSingle();
    if (!data) throw fallo("Curso no encontrado en la organización del logro.", 404);
  }

  static async obtener(id, actor) {
    return presentar(await LogroService._logro(id, actor, { soloLectura: true }));
  }

  static async actualizar(id, actor, datos) {
    const actual = await LogroService._logro(id, actor);

    const limpio = LogroService._validar(datos, { parcial: true });
    if (limpio.course_id !== undefined) {
      LogroService._asegurarAlcance(actual.tenant_id, limpio.course_id);
      await LogroService._asegurarCurso(actual.tenant_id, limpio.course_id);
    }
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
      categorias: CATEGORIAS.map((c) => ({ nombre: c, icono: ICONO_DE_CATEGORIA[c] })),
      condiciones: Object.entries(CONDICIONES).map(([tipo, c]) => ({
        tipo,
        unidad: c.unidad,
        categoria: CATEGORIA_DE[tipo],
        ejemplo: c.texto(10),
      })),
      iconoGenerico: ICONO_GENERICO,
    };
  }
}

module.exports = LogroService;
module.exports.CONDICIONES = CONDICIONES;
module.exports.CATEGORIAS = CATEGORIAS;
module.exports.iconoDe = iconoDe;
