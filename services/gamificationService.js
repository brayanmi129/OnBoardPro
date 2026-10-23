const crypto = require("crypto");
const { supabase } = require("../helpers/supabaseHelper.js");
const { nivelPara, progreso } = require("../helpers/niveles.js");
const { siguienteRacha } = require("../helpers/racha.js");
const { asegurarPublicado } = require("../helpers/cursoDeActividad.js");

function fallo(message, status) {
  const err = new Error(message);
  err.status = status;
  return err;
}

class GamificationService {
  static async getRanking(tenantId = null) {
    // Sin este filtro el ranking mezclaba a los aprendices de todas las
    // empresas: un cliente veía los nombres de los empleados de otro.
    let consulta = supabase
      .from("users")
      .select("id, firstname, lastname, level, xp")
      .not("role", "in", "(admin,superadmin,instructor)");
    if (tenantId) consulta = consulta.eq("tenant_id", tenantId);

    // Se ordena por XP y no por nivel: dentro de un mismo nivel el XP es lo que
    // distingue a quien va adelante. Ordenar por nivel dejaba empates masivos.
    const { data, error } = await consulta
      .order("xp", { ascending: false })
      .order("firstname", { ascending: true });
    if (error) throw new Error(error.message);

    return (data || []).map((u, i) => ({ ...u, posicion: i + 1 }));
  }

  /**
   * Los que mas XP llevan dentro de un curso.
   *
   * El ranking general es de toda la organizacion y no sirve para saber como
   * va un curso concreto. Acá se suma solo el XP que salio de las actividades
   * de ese curso, siguiendo el rastro que deja cada movimiento:
   * movimiento -> actividad -> seccion -> curso.
   */
  static async rankingDeCurso(courseId, actor, { limite = 3 } = {}) {
    const tenantId = actor?.role === "superadmin" ? null : actor?.tenantId;

    let q = supabase.from("courses").select("id, instructor").eq("id", courseId);
    if (tenantId) q = q.eq("tenant_id", tenantId);
    const { data: curso } = await q.maybeSingle();
    if (!curso) throw fallo("Curso no encontrado", 404);

    const { data: secciones } = await supabase
      .from("sections").select("id").eq("course_id", courseId);
    if (!secciones?.length) return [];

    const { data: actividades } = await supabase
      .from("activities").select("id")
      .in("section_id", secciones.map((s) => s.id));
    if (!actividades?.length) return [];

    const { data: movimientos } = await supabase
      .from("xp_movimientos").select("user_id, xp")
      .in("activity_id", actividades.map((a) => a.id));
    if (!movimientos?.length) return [];

    const porPersona = new Map();
    for (const m of movimientos) {
      porPersona.set(m.user_id, (porPersona.get(m.user_id) || 0) + (m.xp || 0));
    }

    const { data: personas } = await supabase
      .from("users").select("id, firstname, lastname, level, role")
      .in("id", [...porPersona.keys()]);

    return (personas || [])
      // El instructor y los administradores no compiten con sus aprendices.
      .filter((u) => u.role === "student")
      .map((u) => ({
        id: u.id,
        firstname: u.firstname,
        lastname: u.lastname,
        level: u.level,
        xp: porPersona.get(u.id) || 0,
      }))
      .sort((a, b) => b.xp - a.xp || a.firstname.localeCompare(b.firstname))
      .slice(0, Math.max(Number(limite) || 3, 1))
      .map((u, i) => ({ ...u, posicion: i + 1 }));
  }

  /**
   * Marca una actividad como completada y acredita su XP (HU-052).
   *
   * El registro del movimiento es lo que define "completado": no hay otra
   * tabla. Y la restricción UNIQUE de la base es la que impide cobrar dos
   * veces, no un `if` acá: si llegan dos peticiones a la vez, una falla en la
   * base en vez de acreditar el doble.
   */
  static async completarActividad(userId, actividadId, tenantId = null) {
    let consulta = supabase
      .from("activities")
      .select("id, title, type, xp, tenant_id")
      .eq("id", actividadId);
    if (tenantId) consulta = consulta.eq("tenant_id", tenantId);

    const { data: actividad } = await consulta.maybeSingle();
    if (!actividad) throw fallo("Actividad no encontrada", 404);
    await asegurarPublicado(actividad.id, { role: "student" });

    // Criterio 1 de HU-040: marcarse algo como hecho solo vale para material
    // que se consume —un PDF, un video—. Sin esto el botón era una máquina de
    // puntos gratis: comprobamos que un aprendiz podía cobrar un examen sin
    // rendirlo y una tarea sin entregar nada. Esas dos pagan por su propio
    // camino: la tarea al calificarse, el examen al resolverse.
    if (actividad.type !== "Recurso") {
      throw fallo(
        actividad.type === "Tarea"
          ? "Las tareas se completan entregando el trabajo."
          : "Los exámenes se completan resolviéndolos.",
        409
      );
    }

    const resumen = await GamificationService.acreditar({
      userId,
      actividadId: actividad.id,
      tenantId: actividad.tenant_id,
      puntos: actividad.xp ?? 0,
      motivo: "actividad_completada",
      siRepite: "Ya habías completado esta actividad.",
    });

    return { message: `Actividad completada. +${actividad.xp ?? 0} XP`, ...resumen };
  }

  /**
   * Escribe un movimiento de XP y recalcula el total.
   *
   * Lo usan tanto "marcar completada" como la calificación de una entrega. El
   * UNIQUE (user_id, activity_id) garantiza que una actividad pague una sola
   * vez, sin importar por cuál de los dos caminos llegue.
   */
  static async acreditar({ userId, actividadId, tenantId, puntos, motivo, siRepite }) {
    const { error } = await supabase.from("xp_movimientos").insert({
      id: crypto.randomBytes(8).toString("hex"),
      user_id: userId,
      tenant_id: tenantId ?? null,
      activity_id: actividadId,
      xp: puntos ?? 0,
      motivo: motivo || "actividad_completada",
    });

    if (error) {
      // 23505 es la violación de UNIQUE: ya había cobrado esta actividad.
      if (error.code === "23505" || /duplicate|unique/i.test(error.message)) {
        throw fallo(siRepite || "Esta actividad ya otorgó su XP.", 409);
      }
      throw new Error(error.message);
    }

    // La racha se mueve acá y no al iniciar sesión: entrar no es estar activo.
    // Cuenta el día en que se hizo algo que otorgó puntos.
    const racha = await GamificationService.registrarDiaActivo(userId);

    let resumen = await GamificationService.recalcular(userId);

    // Ganar XP es lo único que mueve las condiciones de un logro (HU-061), así
    // que acá se evalúan. Si falla, los puntos ya quedaron: no se deshace nada.
    let logrosDesbloqueados = [];
    try {
      const DesbloqueoService = require("./desbloqueoService.js");
      const r = await DesbloqueoService.evaluar(userId);
      logrosDesbloqueados = r.logros;
      // Si algún logro pagó XP, el nivel ya no es el de recién.
      if (r.resumen) resumen = { ...r.resumen, subioDeNivel: resumen.subioDeNivel || r.resumen.subioDeNivel };
    } catch (err) {
      console.warn("[logros] no se pudieron evaluar:", err.message);
    }

    return { xpGanado: puntos ?? 0, ...resumen, racha, logrosDesbloqueados };
  }

  /**
   * Suma el día de hoy a la racha de días activos (HU-058).
   *
   * Se llama desde `acreditar`, así que da igual por qué camino se ganaron los
   * puntos: completar un recurso, aprobar una entrega o resolver un examen
   * cuentan todos como actividad del día.
   *
   * Si ya había actividad hoy no escribe nada: la racha cuenta días, no veces.
   */
  static async registrarDiaActivo(userId) {
    const { data: usuario } = await supabase
      .from("users")
      .select("streak, racha_maxima, ultima_actividad")
      .eq("id", userId)
      .maybeSingle();
    if (!usuario) return null;

    const siguiente = siguienteRacha({
      ultimaActividad: usuario.ultima_actividad,
      racha: usuario.streak,
      rachaMaxima: usuario.racha_maxima,
    });

    if (siguiente.cambio) {
      await supabase
        .from("users")
        .update({
          streak: siguiente.racha,
          racha_maxima: siguiente.rachaMaxima,
          ultima_actividad: siguiente.ultimaActividad,
        })
        .eq("id", userId);
    }

    return {
      dias: siguiente.racha,
      maxima: siguiente.rachaMaxima,
      // Para que la interfaz sepa si corresponde celebrar algo o quedarse quieta.
      crecioHoy: siguiente.cambio,
    };
  }

  /**
   * Vuelve a sumar el historial y guarda el total en users.
   *
   * Se recalcula desde el libro de movimientos en vez de hacer `xp = xp + n`:
   * así un movimiento borrado o corregido se refleja solo, y el total nunca
   * queda a la deriva respecto de su historial.
   */
  static async recalcular(userId) {
    const { data: movimientos, error } = await supabase
      .from("xp_movimientos")
      .select("xp")
      .eq("user_id", userId);
    if (error) throw new Error(error.message);

    const xp = (movimientos || []).reduce((a, m) => a + (m.xp || 0), 0);

    const { data: antes } = await supabase
      .from("users").select("level").eq("id", userId).maybeSingle();

    // El nivel nunca baja, aunque el XP se corrija hacia abajo: quitarle un
    // nivel a alguien que ya lo vio es peor que dejarlo un escalón arriba.
    const nivelCalculado = nivelPara(xp);
    const nivel = Math.max(nivelCalculado, antes?.level ?? 0);

    await supabase.from("users").update({ xp, level: nivel }).eq("id", userId);

    return {
      ...progreso(xp),
      nivel,
      subioDeNivel: nivel > (antes?.level ?? 0),
    };
  }

  /** Mi XP, mi nivel y cuánto me falta para el siguiente (HU-056). */
  static async miProgreso(userId) {
    const { data: usuario } = await supabase
      .from("users")
      .select("xp, level, streak, racha_maxima, ultima_actividad")
      .eq("id", userId)
      .maybeSingle();
    if (!usuario) throw fallo("Usuario no encontrado", 404);

    // Los premios de logros también son movimientos, pero no son actividades.
    const { count } = await supabase
      .from("xp_movimientos")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .not("activity_id", "is", null);

    // La racha guardada puede estar vencida: si la última actividad fue hace
    // tres días, en la base sigue diciendo 5 hasta que la persona vuelva. Se
    // recalcula al leerla para no mostrar una racha que ya se cortó.
    const vigente = siguienteRacha({
      ultimaActividad: usuario.ultima_actividad,
      racha: usuario.streak,
      rachaMaxima: usuario.racha_maxima,
    });

    return {
      ...progreso(usuario.xp || 0),
      nivel: Math.max(usuario.level || 0, nivelPara(usuario.xp || 0)),
      actividadesCompletadas: count ?? 0,
      racha: {
        // Si al registrar hoy la racha arrancaría de nuevo en 1, es que se
        // cortó: pasó más de un día sin actividad. Si solo subiría un escalón,
        // sigue viva y lo que vale es lo guardado.
        dias: vigente.cambio && vigente.racha === 1 ? 0 : usuario.streak || 0,
        maxima: usuario.racha_maxima || 0,
        activaHoy: !vigente.cambio,
      },
    };
  }

  /** Ids de las actividades que esta persona ya completó, para marcarlas en la interfaz. */
  static async completadasDe(userId) {
    const { data } = await supabase
      .from("xp_movimientos").select("activity_id").eq("user_id", userId);
    return new Set((data || []).map((m) => m.activity_id).filter(Boolean));
  }
}

module.exports = GamificationService;
