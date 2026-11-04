const crypto = require("crypto");
const { supabase } = require("../helpers/supabaseHelper.js");
const { CONDICIONES, iconoDe } = require("./logroService.js");

/**
 * Desbloqueo de logros (HU-061) y "mis logros" (HU-062).
 *
 * El catálogo (logroService) dice qué se puede ganar; acá se decide quién lo
 * ganó. No hay contadores guardados: cada condición se mide contra lo que ya
 * registra el sistema —el libro de XP, las entregas, los intentos de examen—.
 * Un contador aparte se desincroniza la primera vez que algo se corrige a mano.
 */

const nuevoId = () => crypto.randomBytes(8).toString("hex");

// Un logro puede pagar XP, ese XP subir de nivel y el nivel desbloquear otro
// logro. Se repite hasta que no cambie nada, con tope para no girar sin fin.
const VUELTAS_MAXIMAS = 3;

// Cuándo se evalúan los logros (HU-061). Solo en estos cinco momentos, nunca
// de forma continua ni al consultar:
//
//   1. completar un recurso            -> evaluar(), desde la acreditación de XP
//   2. aprobar una entrega             -> idem
//   3. aprobar un examen               -> idem
//   4. aprobar un concurso             -> idem (subir de nivel ocurre en esa
//                                         misma operación, y se evalúa ahí)
//   5. el cierre del periodo de ranking -> cerrarPeriodoRanking()
//
// Las medallas de ranking quedan afuera de 1 a 4: un puesto cambia cada vez
// que otro suma puntos, y darla en tiempo real premiaría a quien iba primero
// a las 10 de la mañana. Se otorgan al cerrar el periodo.
const RANKING = "posicion_ranking";

/** Lo que completó la persona, separado por el camino por el que lo hizo. */
async function completadoPor(userId) {
  const [mov, ent, exa] = await Promise.all([
    supabase.from("xp_movimientos").select("activity_id")
      .eq("user_id", userId).not("activity_id", "is", null),
    supabase.from("entregas").select("activity_id")
      .eq("user_id", userId).eq("estado", "aprobada"),
    supabase.from("intentos_examen").select("activity_id")
      .eq("user_id", userId).eq("aprobado", true),
  ]);
  const ids = (r) => new Set((r.data || []).map((x) => x.activity_id));
  const entregas = ids(ent);
  const aprobados = ids(exa);

  // Exámenes y concursos comparten la tabla de intentos: se separan por el
  // tipo de la actividad. Un concurso es un juego, no un examen aprobado.
  const { data: tipos } = aprobados.size
    ? await supabase.from("activities").select("id, type").in("id", [...aprobados])
    : { data: [] };
  const deTipo = (t) => new Set((tipos || []).filter((a) => a.type === t).map((a) => a.id));
  const examenes = deTipo("Examen");
  const juegos = deTipo("Concurso");

  // Una entrega aprobada con 0 XP de una versión anterior puede no tener
  // movimiento: se unen los tres caminos para no perderla.
  const todas = new Set([...ids(mov), ...entregas, ...aprobados]);
  return { todas, entregas, examenes, juegos };
}

/**
 * La estructura de los cursos que importan: los asignados a la persona por sus
 * grupos más los que nombre algún logro. Curso -> secciones -> actividades.
 */
async function estructura(userId, cursosExtra) {
  const { data: grupos } = await supabase
    .from("users_groups").select("id_group").eq("id_user", userId);
  const { data: asignados } = grupos?.length
    ? await supabase.from("groups_courses").select("id_course")
        .in("id_group", grupos.map((g) => g.id_group))
    : { data: [] };

  const propios = new Set((asignados || []).map((a) => a.id_course));
  const cursos = [...new Set([...propios, ...cursosExtra])];
  const mapa = new Map(cursos.map((c) => [c, []]));
  if (!cursos.length) return { mapa, propios };

  const { data: secciones } = await supabase
    .from("sections").select("id, course_id").in("course_id", cursos);
  if (!secciones?.length) return { mapa, propios };

  const { data: actividades } = await supabase
    .from("activities").select("id, section_id")
    .in("section_id", secciones.map((s) => s.id));

  for (const s of secciones) {
    mapa.get(s.course_id).push({
      id: s.id,
      actividades: (actividades || []).filter((a) => a.section_id === s.id).map((a) => a.id),
    });
  }
  return { mapa, propios };
}

/** Puesto de la persona en el ranking de su organización o de un curso. Null si no figura. */
async function posicion(usuario, cursoId) {
  const GamificationService = require("./gamificationService.js");
  const ranking = cursoId
    ? await GamificationService.rankingDeCurso(cursoId, { role: "superadmin" }, { limite: 10000 })
    : await GamificationService.getRanking(usuario.tenant_id);
  const fila = ranking.find((r) => r.id === usuario.id);
  // Con 0 XP todos empatan en el primer puesto de una organización vacía:
  // eso no es un logro.
  return fila && fila.xp > 0 ? fila.posicion : null;
}

/**
 * Cuánto lleva la persona en cada logro: { actual, cumple }.
 *
 * Los logros de un curso se miden solo con lo de ese curso; los generales, con
 * todo lo que tenga asignado.
 */
async function medir(usuario, logros) {
  // Las dos lecturas no dependen una de otra: en paralelo se ahorra una ida
  // y vuelta completa a la base en cada acreditación.
  const [hecho, { mapa, propios }] = await Promise.all([
    completadoPor(usuario.id),
    estructura(usuario.id, logros.map((l) => l.course_id).filter(Boolean)),
  ]);

  const cursosDe = (cursoId) => (cursoId ? [cursoId] : [...propios]);
  const actividadesDe = (cursoId) =>
    new Set(cursosDe(cursoId).flatMap((c) => (mapa.get(c) || []).flatMap((s) => s.actividades)));
  const contar = (conjunto, cursoId) => {
    if (!cursoId) return conjunto.size;
    const delCurso = actividadesDe(cursoId);
    return [...conjunto].filter((a) => delCurso.has(a)).length;
  };
  const terminada = (ids) => ids.length > 0 && ids.every((a) => hecho.todas.has(a));

  const posiciones = new Map();
  const medidas = new Map();

  for (const l of logros) {
    const c = l.course_id || null;
    let actual = 0;
    let cumple;

    switch (l.tipo_condicion) {
      case "actividades_completadas": actual = contar(hecho.todas, c); break;
      case "entregas_aprobadas": actual = contar(hecho.entregas, c); break;
      case "examenes_aprobados": actual = contar(hecho.examenes, c); break;
      case "secciones_completadas":
        actual = cursosDe(c).flatMap((cid) => mapa.get(cid) || [])
          .filter((s) => terminada(s.actividades)).length;
        break;
      case "cursos_completados":
        actual = cursosDe(c).filter((cid) =>
          terminada((mapa.get(cid) || []).flatMap((s) => s.actividades))).length;
        break;
      case "racha_dias":
        actual = Math.max(usuario.racha_maxima || 0, usuario.streak || 0);
        break;
      case "nivel_alcanzado": actual = usuario.level || 0; break;
      case "posicion_ranking": {
        // Acá la meta es un techo y no un piso: puesto 3 "o mejor".
        if (!posiciones.has(c)) posiciones.set(c, await posicion(usuario, c));
        actual = posiciones.get(c);
        cumple = actual !== null && actual <= l.meta;
        break;
      }
      // Un concurso de preguntas aprobado cuenta como un juego completado.
      case "juegos_completados": actual = contar(hecho.juegos, c); break;
      default: actual = 0;
    }

    medidas.set(l.id, { actual, cumple: cumple ?? actual >= l.meta });
  }
  return medidas;
}

async function usuarioDe(userId) {
  const { data } = await supabase
    .from("users").select("id, tenant_id, role, level, streak, racha_maxima")
    .eq("id", userId).maybeSingle();
  return data;
}

/** Los logros activos que le corresponden: los de su organización más los genéricos. */
async function logrosPara(usuario) {
  let q = supabase.from("logros")
    .select("id, tenant_id, course_id, nombre, descripcion, categoria, tipo_condicion, meta, xp_recompensa, icono")
    .eq("activo", true);
  q = usuario.tenant_id
    ? q.or(`tenant_id.eq.${usuario.tenant_id},tenant_id.is.null`)
    : q.is("tenant_id", null);
  const { data, error } = await q.order("categoria").order("meta");
  if (error) throw new Error(error.message);
  return data || [];
}

function presentar(l, extra = {}) {
  const cond = CONDICIONES[l.tipo_condicion];
  return {
    id: l.id,
    nombre: l.nombre,
    descripcion: l.descripcion || null,
    categoria: l.categoria,
    icono: iconoDe(l),
    condicion: {
      tipo: l.tipo_condicion,
      meta: l.meta,
      unidad: cond?.unidad ?? null,
      descripcion: cond ? cond.texto(l.meta) : null,
    },
    cursoId: l.course_id || null,
    xpRecompensa: l.xp_recompensa,
    ...extra,
  };
}

/** Una pasada: mide lo pendiente y registra lo que ya se cumple. */
async function unaVuelta(usuario) {
  const [todos, { data: ganados }] = await Promise.all([
    logrosPara(usuario),
    supabase.from("logros_usuario").select("logro_id").eq("user_id", usuario.id),
  ]);
  const logros = todos.filter((l) => l.tipo_condicion !== RANKING);
  if (!logros.length) return [];
  const ya = new Set((ganados || []).map((g) => g.logro_id));
  const pendientes = logros.filter((l) => !ya.has(l.id));
  if (!pendientes.length) return [];

  const medidas = await medir(usuario, pendientes);
  const nuevos = [];

  for (const l of pendientes) {
    if (!medidas.get(l.id)?.cumple) continue;

    // El logro y su premio de XP se escriben juntos en la base (otorgar_logro):
    // o quedan los dos o ninguno. Como dos inserts sueltos, si fallaba el
    // segundo el logro quedaba ganado sin su XP y nunca se reintentaba.
    // Devuelve false si otra evaluación simultánea ya lo había otorgado.
    const { data: otorgado, error } = await supabase.rpc("otorgar_logro", {
      p_logro: l.id,
      p_user: usuario.id,
      p_tenant: usuario.tenant_id,
      p_xp: l.xp_recompensa || 0,
      p_id_logro_usuario: nuevoId(),
      p_id_movimiento: nuevoId(),
    });
    if (error) throw new Error(error.message);
    if (!otorgado) continue;

    nuevos.push(presentar(l, { desbloqueadoAt: new Date().toISOString() }));
  }
  return nuevos;
}

class DesbloqueoService {
  /**
   * Revisa los logros de una persona y desbloquea los que ya cumple, salvo
   * los de ranking, que se dan al cierre del periodo.
   *
   * Se llama cada vez que gana XP (momentos 1 a 4). Devuelve los que se
   * desbloquearon en esta llamada y, si alguno pagó XP, el nivel recalculado.
   */
  static async evaluar(userId) {
    const usuario = await usuarioDe(userId);
    // Solo los aprendices juegan: el ranking ya deja afuera al resto.
    if (!usuario || usuario.role !== "student") return { logros: [], resumen: null };

    const GamificationService = require("./gamificationService.js");
    const logros = [];
    let resumen = null;

    for (let vuelta = 0; vuelta < VUELTAS_MAXIMAS; vuelta++) {
      const actual = vuelta === 0 ? usuario : await usuarioDe(userId);
      const nuevos = await unaVuelta(actual);
      logros.push(...nuevos);
      if (!nuevos.some((l) => l.xpRecompensa > 0)) break;
      resumen = await GamificationService.recalcular(userId);
    }

    return { logros, resumen };
  }

  /**
   * Todos los logros que le corresponden, ganados o no, con el progreso de
   * cada uno (HU-062). Solo consulta: no otorga nada, porque los logros se
   * evalúan en los cinco momentos definidos y no al mirar la pantalla.
   * `nuevo` marca los ganados en las últimas 24 horas.
   */
  static async mios(userId) {
    const hace24h = Date.now() - 24 * 3600 * 1000;

    const usuario = await usuarioDe(userId);
    if (!usuario) return { ganados: 0, total: 0, logros: [] };

    const logros = await logrosPara(usuario);
    const { data: ganados } = await supabase
      .from("logros_usuario").select("logro_id, desbloqueado_at, xp_otorgado")
      .eq("user_id", userId);
    const porLogro = new Map((ganados || []).map((g) => [g.logro_id, g]));

    const pendientes = logros.filter((l) => !porLogro.has(l.id));
    const medidas = pendientes.length ? await medir(usuario, pendientes) : new Map();

    const lista = logros.map((l) => {
      const g = porLogro.get(l.id);
      if (g) {
        return presentar(l, {
          desbloqueado: true,
          desbloqueadoAt: g.desbloqueado_at,
          xpOtorgado: g.xp_otorgado,
          nuevo: new Date(g.desbloqueado_at).getTime() >= hace24h,
          progreso: { actual: l.meta, meta: l.meta, porcentaje: 100 },
        });
      }
      const m = medidas.get(l.id) || { actual: 0 };
      // En el ranking "más es menos": no hay un porcentaje que tenga sentido.
      const porcentaje = l.tipo_condicion === "posicion_ranking"
        ? 0
        : Math.min(Math.round(((m.actual || 0) * 100) / l.meta), 99);
      return presentar(l, {
        desbloqueado: false,
        desbloqueadoAt: null,
        progreso: { actual: m.actual, meta: l.meta, porcentaje },
      });
    });

    // Primero lo ganado, del más reciente al más viejo; después lo que falta,
    // de lo más cerca a lo más lejos.
    lista.sort((a, b) =>
      a.desbloqueado !== b.desbloqueado ? (a.desbloqueado ? -1 : 1)
      : a.desbloqueado ? String(b.desbloqueadoAt).localeCompare(String(a.desbloqueadoAt))
      : b.progreso.porcentaje - a.progreso.porcentaje);

    return {
      ganados: lista.filter((l) => l.desbloqueado).length,
      total: lista.length,
      nuevos: lista.filter((l) => l.nuevo).length,
      logros: lista,
    };
  }
}

/**
 * Cierre del periodo de ranking (HU-061, momento 5): otorga las medallas de
 * ranking a quienes estén en el puesto pedido en ese momento.
 *
 * Lo dispara un administrador (o una tarea programada) al terminar el periodo,
 * por ejemplo cada viernes. Una medalla se da una sola vez y no se pierde, así
 * que cerrar dos veces no duplica nada.
 */
DesbloqueoService.cerrarPeriodoRanking = async function cerrarPeriodoRanking(actor, { tenantId } = {}) {
  const org = actor.role === "superadmin" ? tenantId : actor.tenantId;
  if (!org) {
    const err = new Error("Indicá la organización (tenantId).");
    err.status = 400;
    throw err;
  }
  const GamificationService = require("./gamificationService.js");

  const { data: logros, error } = await supabase.from("logros")
    .select("id, tenant_id, course_id, nombre, descripcion, categoria, tipo_condicion, meta, xp_recompensa, icono")
    .eq("activo", true).eq("tipo_condicion", RANKING)
    .or(`tenant_id.eq.${org},tenant_id.is.null`);
  if (error) throw new Error(error.message);

  const otorgados = [];
  const conXp = new Set();
  // Cada ranking (el de la organización o el de un curso) se calcula una vez.
  const rankings = new Map();
  for (const l of logros || []) {
    const clave = l.course_id || "organizacion";
    if (!rankings.has(clave)) {
      rankings.set(clave, l.course_id
        ? await GamificationService.rankingDeCurso(l.course_id, { role: "superadmin" }, { limite: 10000 })
        : await GamificationService.getRanking(org));
    }
    // Con 0 XP todos empatan arriba: eso no es un logro.
    const ganadores = rankings.get(clave).filter((r) => r.xp > 0 && r.posicion <= l.meta);
    for (const g of ganadores) {
      const { data: otorgado, error: e } = await supabase.rpc("otorgar_logro", {
        p_logro: l.id, p_user: g.id, p_tenant: org, p_xp: l.xp_recompensa || 0,
        p_id_logro_usuario: nuevoId(), p_id_movimiento: nuevoId(),
      });
      if (e) throw new Error(e.message);
      if (!otorgado) continue;
      if (l.xp_recompensa > 0) conXp.add(g.id);
      otorgados.push({ logro: { id: l.id, nombre: l.nombre }, persona: { id: g.id, firstname: g.firstname, lastname: g.lastname }, posicion: g.posicion });
    }
  }
  // El premio pudo subirles el nivel.
  for (const id of conXp) await GamificationService.recalcular(id);

  return {
    message: otorgados.length ? `Se otorgaron ${otorgados.length} medallas de ranking.` : "Nadie ganó medallas nuevas en este cierre.",
    tenantId: org,
    medallasEvaluadas: (logros || []).length,
    otorgados,
  };
};

// Con más de esta cantidad de personas la vista previa mide una muestra y
// extrapola: medir de a una es varias consultas por persona.
const MUESTRA_MAXIMA = 200;
const EN_PARALELO = 10;

/**
 * Cuántas personas cumplirían hoy una condición de logro (HU-060).
 *
 * Es lo que ve quien arma el logro antes de activarlo: con la misma medición
 * que el desbloqueo real, sobre los aprendices de la organización, sin
 * escribir nada. Así se ve si la meta es demasiado fácil (la cumplen todos) o
 * imposible (nadie) antes de que cuente.
 */
DesbloqueoService.vistaPrevia = async function vistaPrevia(actor, datos = {}) {
  const LogroService = require("./logroService.js");
  const limpio = LogroService._validar({ ...datos, nombre: datos.nombre || "vista previa" });

  // La organización: la del token, salvo el superadmin, que la elige. Sin
  // organización, el superadmin mide un logro genérico sobre todas.
  const tenantId = actor.role === "superadmin" ? datos.tenantId || null : actor.tenantId;
  if (actor.role !== "superadmin" && !tenantId) {
    const err = new Error("No se pudo determinar la organización.");
    err.status = 400;
    throw err;
  }
  LogroService._asegurarAlcance(tenantId, limpio.course_id ?? null);
  if (tenantId) await LogroService._asegurarCurso(tenantId, limpio.course_id ?? null);

  let q = supabase.from("users")
    .select("id, firstname, lastname, tenant_id, role, level, streak, racha_maxima")
    .eq("role", "student");
  if (tenantId) q = q.eq("tenant_id", tenantId);
  const { data: personas, error } = await q;
  if (error) throw new Error(error.message);

  const total = personas?.length || 0;
  const logro = {
    id: "vista-previa",
    course_id: limpio.course_id ?? null,
    tipo_condicion: limpio.tipo_condicion,
    meta: limpio.meta,
  };
  const cond = CONDICIONES[logro.tipo_condicion];

  const muestra = total > MUESTRA_MAXIMA
    ? [...personas].sort(() => Math.random() - 0.5).slice(0, MUESTRA_MAXIMA)
    : personas || [];

  const cumplen = [];
  for (let i = 0; i < muestra.length; i += EN_PARALELO) {
    const tanda = muestra.slice(i, i + EN_PARALELO);
    const medidas = await Promise.all(tanda.map((u) => medir(u, [logro])));
    tanda.forEach((u, j) => {
      if (medidas[j].get(logro.id)?.cumple) cumplen.push(u);
    });
  }

  const extrapolado = muestra.length < total;
  const cumplirian = extrapolado
    ? Math.round((cumplen.length * total) / muestra.length)
    : cumplen.length;

  return {
    condicion: {
      tipo: logro.tipo_condicion,
      meta: logro.meta,
      descripcion: cond ? cond.texto(logro.meta) : null,
    },
    cursoId: logro.course_id,
    tenantId,
    aprendices: total,
    cumplirian,
    porcentaje: total ? Math.round((cumplirian * 100) / total) : 0,
    // Si se midió una muestra, cumplirian es una estimación.
    estimado: extrapolado,
    ejemplos: cumplen.slice(0, 5).map((u) => ({ id: u.id, firstname: u.firstname, lastname: u.lastname })),
  };
};

module.exports = DesbloqueoService;
