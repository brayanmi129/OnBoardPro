const { supabase } = require("../helpers/supabaseHelper.js");
const { todasLasFilas, porLotes } = require("../helpers/consultas.js");
const { diaColombia, DIA_MS } = require("../helpers/periodo.js");

function fallo(message, status) {
  const err = new Error(message);
  err.status = status;
  return err;
}

/**
 * El tablero de la administración.
 *
 *   superadmin sin tenantId   la plataforma entera, con una fila por organización
 *   admin, o superadmin con   una organización, con el detalle de sus cursos y
 *   tenantId                  de quién se está quedando atrás
 *
 * Todo sale de lo que ya registra el sistema: no hay tabla de métricas. "Activa"
 * es la persona que tuvo algún movimiento de XP en el periodo, porque ganar XP
 * es la única huella que deja hacer algo (completar, aprobar, rendir).
 *
 * Rendimiento: se lee todo en cuatro tandas de consultas en paralelo, sin una
 * consulta por persona ni por curso, y paginando lo que puede pasar de 1000
 * filas (helpers/consultas.js).
 */

const ROLES = ["student", "instructor", "admin"];
const DIAS_SIN_ACTIVIDAD = 7;
const MAX_SIN_ACTIVIDAD = 20;

const porcentaje = (parte, total) => (total > 0 ? Math.round((parte * 1000) / total) / 10 : 0);
// Postgres devuelve las fechas con o sin fracción de segundo y con +00:00;
// compararlas como texto falla en los bordes. Se comparan en milisegundos.
const ms = (f) => new Date(f).getTime();
const publicado = (c) => c.status === "Abierto" && !c.archivado;
const esAprendiz = (u) => u.role === "student" && u.status !== "Inactive";

function validarDias(dias) {
  if (dias === undefined || dias === null || dias === "") return 30;
  const n = Number(dias);
  if (!Number.isInteger(n) || n < 7 || n > 90) throw fallo("dias tiene que ser un entero entre 7 y 90.", 400);
  return n;
}

/** Lee todo lo que hace falta, de una organización (tenantId) o de todas (null). */
async function cargar(tenantId, desdeAnterior) {
  const deOrg = (q) => (tenantId ? q.eq("tenant_id", tenantId) : q);

  // Tanda 1: lo que no depende de nada.
  const [usuarios, cursos, tenants, porRevisar] = await Promise.all([
    todasLasFilas(() => deOrg(supabase.from("users")
      .select("id, firstname, lastname, role, status, tenant_id, xp, ultima_actividad"))
      .neq("role", "superadmin").order("id", { ascending: true })),
    todasLasFilas(() => deOrg(supabase.from("courses")
      .select("id, name, tenant_id, status, archivado")).order("id", { ascending: true })),
    tenantId
      ? supabase.from("tenants").select("id, name, active").eq("id", tenantId).then((r) => r.data || [])
      : todasLasFilas(() => supabase.from("tenants").select("id, name, active").order("id", { ascending: true })),
    tenantId
      ? supabase.from("entregas").select("id", { count: "exact", head: true })
          .eq("tenant_id", tenantId).eq("estado", "entregado").then((r) => r.count ?? 0)
      : 0,
  ]);

  // Tanda 2: movimientos de la ventana (periodo actual + anterior), secciones
  // y grupos de los cursos. En una organización los movimientos se piden por
  // sus personas: así no entra nada de otra aunque el movimiento tenga
  // tenant_id en NULL.
  const cursoIds = cursos.map((c) => c.id);
  const [ventana, secciones, gruposCursos] = await Promise.all([
    tenantId
      ? porLotes(usuarios.map((u) => u.id), (lote) => supabase.from("xp_movimientos")
          .select("id, user_id, xp, activity_id, created_at")
          .in("user_id", lote).gte("created_at", desdeAnterior).order("id", { ascending: true }))
      : todasLasFilas(() => supabase.from("xp_movimientos")
          .select("id, user_id, xp, activity_id, created_at")
          .gte("created_at", desdeAnterior).order("id", { ascending: true })),
    porLotes(cursoIds, (lote) => supabase.from("sections")
      .select("id, course_id").in("course_id", lote).order("id", { ascending: true })),
    porLotes(cursoIds, (lote) => supabase.from("groups_courses")
      .select("id, id_group, id_course").in("id_course", lote).order("id", { ascending: true })),
  ]);

  // Tanda 3: actividades de esas secciones e integrantes de esos grupos.
  const [actividades, integrantes] = await Promise.all([
    porLotes(secciones.map((s) => s.id), (lote) => supabase.from("activities")
      .select("id, section_id").in("section_id", lote).order("id", { ascending: true })),
    porLotes(gruposCursos.map((g) => g.id_group), (lote) => supabase.from("users_groups")
      .select("id, id_user, id_group").in("id_group", lote).order("id", { ascending: true })),
  ]);

  // Tanda 4: lo completado de los cursos publicados, de cualquier fecha (la
  // tasa de finalización es acumulada, no del periodo).
  const cursoDeSeccion = new Map(secciones.map((s) => [s.id, s.course_id]));
  const cursoPorId = new Map(cursos.map((c) => [c.id, c]));
  const actividadesPorCurso = new Map();
  for (const a of actividades) {
    const c = cursoDeSeccion.get(a.section_id);
    if (!actividadesPorCurso.has(c)) actividadesPorCurso.set(c, []);
    actividadesPorCurso.get(c).push(a.id);
  }
  const deCursosPublicados = actividades
    .filter((a) => publicado(cursoPorId.get(cursoDeSeccion.get(a.section_id)) || {}))
    .map((a) => a.id);
  const completadas = await porLotes(deCursosPublicados, (lote) => supabase.from("xp_movimientos")
    .select("id, user_id, activity_id, created_at").in("activity_id", lote).order("id", { ascending: true }));

  return { usuarios, cursos, tenants, porRevisar, ventana, gruposCursos, integrantes, actividadesPorCurso, completadas };
}

/**
 * Qué actividades le tocan a cada aprendiz y cuántas completó.
 *
 * Asignado = el curso publicado está en alguno de sus grupos. La tasa es
 * hechas / asignadas sumando a todos; "anterior" cuenta solo lo completado
 * antes del inicio del periodo, con la asignación de hoy.
 */
function avance(datos, desde) {
  const { usuarios, cursos, gruposCursos, integrantes, actividadesPorCurso, completadas } = datos;
  const cursosDeGrupo = new Map();
  for (const g of gruposCursos) {
    if (!cursosDeGrupo.has(g.id_group)) cursosDeGrupo.set(g.id_group, new Set());
    cursosDeGrupo.get(g.id_group).add(g.id_course);
  }
  const publicados = new Set(cursos.filter(publicado).map((c) => c.id));
  const cursosDe = new Map();
  for (const i of integrantes) {
    for (const c of cursosDeGrupo.get(i.id_group) || []) {
      if (!publicados.has(c)) continue;
      if (!cursosDe.has(i.id_user)) cursosDe.set(i.id_user, new Set());
      cursosDe.get(i.id_user).add(c);
    }
  }

  // user -> activity -> fecha en que la completó
  const hechas = new Map();
  for (const m of completadas) {
    if (!hechas.has(m.user_id)) hechas.set(m.user_id, new Map());
    hechas.get(m.user_id).set(m.activity_id, m.created_at);
  }

  const porAprendiz = new Map(); // id -> { asignadas, hechas, hechasAntes, porCurso: Map(curso -> {total, hechas}) }
  for (const u of usuarios.filter(esAprendiz)) {
    const r = { asignadas: 0, hechas: 0, hechasAntes: 0, porCurso: new Map() };
    const suyas = hechas.get(u.id) || new Map();
    for (const c of cursosDe.get(u.id) || []) {
      const acts = actividadesPorCurso.get(c) || [];
      let h = 0;
      for (const a of acts) {
        if (!suyas.has(a)) continue;
        h += 1;
        if (ms(suyas.get(a)) < ms(desde)) r.hechasAntes += 1;
      }
      r.asignadas += acts.length;
      r.hechas += h;
      r.porCurso.set(c, { total: acts.length, hechas: h });
    }
    porAprendiz.set(u.id, r);
  }
  return porAprendiz;
}

function tasa(aprendices, porAprendiz) {
  let asignadas = 0, hechas = 0, antes = 0;
  for (const u of aprendices) {
    const r = porAprendiz.get(u.id);
    if (!r) continue;
    asignadas += r.asignadas;
    hechas += r.hechas;
    antes += r.hechasAntes;
  }
  return { actual: porcentaje(hechas, asignadas), anterior: porcentaje(antes, asignadas) };
}

/** Lo común a los dos alcances: usuarios, cursos, XP y la serie por día. */
function comunes(datos, { dias, desde, desdeAnterior }) {
  const { usuarios, cursos, ventana } = datos;
  const enScope = new Set(usuarios.map((u) => u.id));
  const movs = ventana.filter((m) => enScope.has(m.user_id));
  const actuales = movs.filter((m) => ms(m.created_at) >= ms(desde));
  const anteriores = movs.filter((m) => ms(m.created_at) >= ms(desdeAnterior) && ms(m.created_at) < ms(desde));
  const suma = (lista) => lista.reduce((a, m) => a + (Number(m.xp) || 0), 0);

  const porRol = Object.fromEntries(ROLES.map((r) => [r, usuarios.filter((u) => u.role === r).length]));

  // Un día por fecha, terminando hoy, aunque no haya pasado nada: la gráfica
  // necesita los ceros para no saltarse días.
  const hoy = Date.now();
  const serie = new Map();
  for (let i = dias - 1; i >= 0; i--) serie.set(diaColombia(hoy - i * DIA_MS), { xp: 0, completadas: 0 });
  for (const m of actuales) {
    const d = serie.get(diaColombia(m.created_at));
    if (!d) continue;
    d.xp += Number(m.xp) || 0;
    if (m.activity_id) d.completadas += 1;
  }

  return {
    actuales,
    usuarios: {
      total: usuarios.length,
      porRol,
      activosPeriodo: new Set(actuales.map((m) => m.user_id)).size,
      activosPeriodoAnterior: new Set(anteriores.map((m) => m.user_id)).size,
    },
    cursos: {
      total: cursos.filter((c) => !c.archivado).length,
      publicados: cursos.filter(publicado).length,
    },
    xp: { otorgadoPeriodo: suma(actuales), otorgadoPeriodoAnterior: suma(anteriores) },
    actividadesCompletadasPeriodo: actuales.filter((m) => m.activity_id).length,
    actividadPorDia: [...serie].map(([fecha, v]) => ({ fecha, ...v })),
  };
}

class DashboardService {
  static async de(actor, { tenantId, dias } = {}) {
    const n = validarDias(dias);
    const ahora = Date.now();
    const rango = {
      dias: n,
      desde: new Date(ahora - n * DIA_MS).toISOString(),
      hasta: new Date(ahora).toISOString(),
      desdeAnterior: new Date(ahora - 2 * n * DIA_MS).toISOString(),
    };

    if (actor.role === "superadmin" && !tenantId) return DashboardService._plataforma(rango);

    // El admin siempre ve la suya, aunque mande otro tenantId.
    const org = actor.role === "superadmin" ? String(tenantId) : actor.tenantId;
    if (!org) throw fallo("Tu usuario no pertenece a ninguna organización.", 400);
    return DashboardService._organizacion(org, rango);
  }

  static _periodo({ dias, desde, hasta }) {
    return { dias, desde, hasta };
  }

  static async _plataforma(rango) {
    const datos = await cargar(null, rango.desdeAnterior);
    const base = comunes(datos, rango);
    const porAprendiz = avance(datos, rango.desde);
    const activos = new Set(base.actuales.map((m) => m.user_id));
    const tenantDe = new Map(datos.usuarios.map((u) => [u.id, u.tenant_id]));

    const xpPorOrg = new Map();
    for (const m of base.actuales) {
      const t = tenantDe.get(m.user_id);
      xpPorOrg.set(t, (xpPorOrg.get(t) || 0) + (Number(m.xp) || 0));
    }

    const porOrganizacion = datos.tenants.map((t) => {
      const suyos = datos.usuarios.filter((u) => u.tenant_id === t.id);
      const aprendices = suyos.filter(esAprendiz);
      return {
        id: t.id,
        nombre: t.name,
        activa: t.active !== false,
        usuarios: suyos.length,
        aprendicesActivos: aprendices.filter((u) => activos.has(u.id)).length,
        cursosPublicados: datos.cursos.filter((c) => c.tenant_id === t.id && publicado(c)).length,
        tasaFinalizacion: tasa(aprendices, porAprendiz).actual,
        xpPeriodo: xpPorOrg.get(t.id) || 0,
      };
    }).sort((a, b) => String(a.nombre).localeCompare(String(b.nombre)));

    return {
      alcance: "plataforma",
      periodo: DashboardService._periodo(rango),
      organizaciones: {
        total: datos.tenants.length,
        activas: datos.tenants.filter((t) => t.active !== false).length,
      },
      usuarios: base.usuarios,
      cursos: base.cursos,
      xp: base.xp,
      actividadesCompletadasPeriodo: base.actividadesCompletadasPeriodo,
      actividadPorDia: base.actividadPorDia,
      porOrganizacion,
    };
  }

  static async _organizacion(tenantId, rango) {
    const datos = await cargar(tenantId, rango.desdeAnterior);
    const organizacion = datos.tenants[0];
    // Una organización que no existe responde igual que una ajena.
    if (!organizacion) throw fallo("Organización no encontrada", 404);

    const base = comunes(datos, rango);
    const porAprendiz = avance(datos, rango.desde);
    const aprendices = datos.usuarios.filter(esAprendiz);

    const xpPromedio = aprendices.length
      ? Math.round((aprendices.reduce((a, u) => a + (Number(u.xp) || 0), 0) * 10) / aprendices.length) / 10
      : 0;

    // Por curso publicado: cuántos lo tienen, su avance promedio y cuántos lo
    // terminaron. Un curso sin actividades no cuenta como terminado por nadie.
    const cursosDetalle = datos.cursos.filter(publicado).map((c) => {
      const avances = aprendices
        .map((u) => porAprendiz.get(u.id)?.porCurso.get(c.id))
        .filter(Boolean);
      return {
        id: c.id,
        nombre: c.name,
        aprendices: avances.length,
        avancePromedio: avances.length
          ? Math.round(avances.reduce((a, p) => a + porcentaje(p.hechas, p.total), 0) / avances.length)
          : 0,
        completaron: avances.filter((p) => p.total > 0 && p.hechas === p.total).length,
      };
    }).sort((a, b) => String(a.nombre).localeCompare(String(b.nombre)));

    // Sin movimientos en los últimos 7 días. La ventana cargada cubre al menos
    // 14 (dias >= 7, y se carga el doble), así que alcanza para saberlo.
    const corte = Date.now() - DIAS_SIN_ACTIVIDAD * DIA_MS;
    const recientes = new Set(datos.ventana.filter((m) => ms(m.created_at) >= corte).map((m) => m.user_id));
    const aprendicesSinActividad = aprendices
      .filter((u) => !recientes.has(u.id))
      .map((u) => ({ id: u.id, nombre: u.firstname, apellido: u.lastname, ultimaActividad: u.ultima_actividad ?? null }))
      // Primero quien nunca hizo nada, después quien lleva más tiempo quieto.
      .sort((a, b) => {
        if (!a.ultimaActividad && b.ultimaActividad) return -1;
        if (a.ultimaActividad && !b.ultimaActividad) return 1;
        return String(a.ultimaActividad ?? "").localeCompare(String(b.ultimaActividad ?? ""))
          || String(a.nombre ?? "").localeCompare(String(b.nombre ?? ""));
      })
      .slice(0, MAX_SIN_ACTIVIDAD);

    return {
      alcance: "organizacion",
      organizacion: { id: organizacion.id, nombre: organizacion.name },
      periodo: DashboardService._periodo(rango),
      usuarios: base.usuarios,
      cursos: base.cursos,
      tasaFinalizacion: tasa(aprendices, porAprendiz),
      xpPromedio,
      xp: base.xp,
      entregasPorRevisar: datos.porRevisar,
      actividadPorDia: base.actividadPorDia,
      cursosDetalle,
      aprendicesSinActividad,
    };
  }
}

module.exports = DashboardService;
