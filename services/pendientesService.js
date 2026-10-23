const { supabase } = require("../helpers/supabaseHelper.js");
const { progresoEn, nivelPara } = require("../helpers/niveles.js");
const NivelesService = require("./nivelesService.js");

/**
 * Qué tiene pendiente cada persona al entrar.
 *
 * Todo se calcula con los datos que ya existen: no hay tabla de pendientes ni
 * de notificaciones. Esa es la idea. Una lista guardada se desincroniza —se
 * marca algo como hecho y el pendiente sigue ahí, o al revés— mientras que una
 * calculada no puede mentir: si la entrega está sin calificar, aparece; si la
 * calificaron, deja de aparecer, sin que nadie tenga que acordarse de borrarla.
 *
 * Lo que esto NO es: un centro de notificaciones (HU-073). No guarda leído /
 * no leído ni avisa de cosas pasadas. Responde "qué me falta ahora".
 */
class PendientesService {
  static async de(actor) {
    if (actor.role === "student") return PendientesService._aprendiz(actor);
    if (actor.role === "instructor") return PendientesService._instructor(actor);
    return PendientesService._administracion(actor);
  }

  /** Cursos a los que llega esta persona por sus equipos. */
  static async _misCursos(userId) {
    const { data: misGrupos } = await supabase
      .from("users_groups").select("id_group").eq("id_user", userId);
    if (!misGrupos?.length) return [];

    const { data: gc } = await supabase
      .from("groups_courses").select("id_course")
      .in("id_group", misGrupos.map((g) => g.id_group));
    if (!gc?.length) return [];

    const ids = [...new Set(gc.map((x) => x.id_course))];
    // Un curso despublicado no le muestra nada al aprendiz: tampoco pendientes.
    const { data } = await supabase.from("courses").select("id, name")
      .in("id", ids).eq("status", "Abierto").eq("archivado", false);
    return data || [];
  }

  static async _aprendiz(actor) {
    const cursos = await PendientesService._misCursos(actor.id);

    // Actividades de esos cursos, siguiendo curso → secciones → actividades.
    let actividades = [];
    if (cursos.length) {
      const { data: secciones } = await supabase
        .from("sections").select("id, name, course_id, orden")
        .in("course_id", cursos.map((c) => c.id));

      if (secciones?.length) {
        const { data } = await supabase
          .from("activities")
          .select("id, title, description, type, xp, deliverable, section_id, orden")
          .in("section_id", secciones.map((s) => s.id));
        const porSeccion = new Map(secciones.map((s) => [s.id, s]));
        const porCurso = new Map(cursos.map((c) => [c.id, c.name]));
        actividades = (data || []).map((a) => {
          const sec = porSeccion.get(a.section_id);
          return {
            ...a,
            seccion: sec?.name ?? null,
            curso: sec ? porCurso.get(sec.course_id) : null,
            courseId: sec?.course_id ?? null,
            ordenSeccion: sec?.orden ?? 0,
          };
        });
      }
    }

    // Lo ya cobrado define qué queda pendiente: una actividad paga una sola
    // vez, así que tener su movimiento equivale a haberla terminado.
    const { data: movimientos } = await supabase
      .from("xp_movimientos").select("activity_id").eq("user_id", actor.id);
    const hechas = new Set((movimientos || []).map((m) => m.activity_id));

    // En el orden en que el curso las presenta: sección y después actividad.
    // Así lo primero de la lista es lo siguiente que le toca hacer.
    const pendientes = actividades
      .filter((a) => !hechas.has(a.id))
      .sort((a, b) =>
        String(a.curso).localeCompare(String(b.curso)) ||
        a.ordenSeccion - b.ordenSeccion ||
        (a.orden ?? 0) - (b.orden ?? 0));

    // Entregas ya revisadas: es lo que el aprendiz querría ver al entrar.
    // Antes se buscaban columnas de un modelo con nota (`nota`,
    // `calificado_at`, estado "calificada") que no existen: la consulta fallaba
    // en silencio y esta lista salía siempre vacía. En onboarding no hay nota:
    // la entrega queda aprobada o se pide rehacerla.
    const { data: entregas, error: eEntregas } = await supabase
      .from("entregas")
      .select("id, activity_id, estado, feedback, revisado_at")
      .eq("user_id", actor.id).in("estado", ["aprobada", "rehacer"])
      .order("revisado_at", { ascending: false }).limit(10);
    if (eEntregas) console.warn("[pendientes] no se leyeron las entregas revisadas:", eEntregas.message);

    // Los títulos de lo calificado se buscan aparte: una entrega puede ser de
    // un curso al que la persona ya no pertenece, y entonces no está en la
    // lista de pendientes. Buscarlos ahí mostraba el id en crudo.
    const { data: actCalificadas } = entregas?.length
      ? await supabase.from("activities").select("id, title")
          .in("id", entregas.map((e) => e.activity_id))
      : { data: [] };
    const titulos = new Map((actCalificadas || []).map((a) => [a.id, a.title]));

    const { data: usuario } = await supabase
      .from("users").select("xp, level, tenant_id").eq("id", actor.id).maybeSingle();
    const tabla = await NivelesService.tablaDe(usuario?.tenant_id);
    const nivel = Math.max(usuario?.level || 0, nivelPara(usuario?.xp || 0, tabla));

    return {
      rol: "student",
      resumen: {
        cursos: cursos.length,
        actividadesPendientes: pendientes.length,
        xpPorGanar: pendientes.reduce((a, x) => a + (x.xp || 0), 0),
      },
      progreso: progresoEn(nivel, usuario?.xp || 0, tabla),
      actividadesPendientes: pendientes.slice(0, 20).map((a) => ({
        id: a.id, titulo: a.title, descripcion: a.description ?? null, tipo: a.type, xp: a.xp,
        esEntregable: a.deliverable, curso: a.curso, courseId: a.courseId, seccion: a.seccion,
      })),
      calificacionesRecientes: (entregas || []).map((e) => ({
        entregaId: e.id,
        actividad: titulos.get(e.activity_id) ?? e.activity_id,
        estado: e.estado, feedback: e.feedback, calificadaEl: e.revisado_at,
      })),
    };
  }

  static async _instructor(actor) {
    const { data: cursos } = await supabase
      .from("courses").select("id, name").eq("instructor", actor.email);
    if (!cursos?.length) {
      return { rol: "instructor", resumen: { cursos: 0, entregasPorCalificar: 0 }, entregasPorCalificar: [], seccionesVacias: [] };
    }

    const { data: secciones } = await supabase
      .from("sections").select("id, name, course_id").in("course_id", cursos.map((c) => c.id));

    const { data: actividades } = secciones?.length
      ? await supabase.from("activities").select("id, title, section_id")
          .in("section_id", secciones.map((s) => s.id))
      : { data: [] };

    // Lo accionable para quien dicta: lo que está esperando corrección.
    const { data: entregas } = actividades?.length
      ? await supabase.from("entregas")
          .select("id, activity_id, user_id, entregado_at")
          .in("activity_id", actividades.map((a) => a.id))
          .eq("estado", "entregado")
          .order("entregado_at", { ascending: true })
      : { data: [] };

    const { data: personas } = entregas?.length
      ? await supabase.from("users").select("id, firstname, lastname, email")
          .in("id", [...new Set(entregas.map((e) => e.user_id))])
      : { data: [] };

    const porId = new Map((personas || []).map((u) => [u.id, u]));
    const titulos = new Map((actividades || []).map((a) => [a.id, a.title]));
    const conActividades = new Set((actividades || []).map((a) => a.section_id));
    const porCurso = new Map(cursos.map((c) => [c.id, c.name]));

    return {
      rol: "instructor",
      resumen: {
        cursos: cursos.length,
        entregasPorCalificar: (entregas || []).length,
        seccionesVacias: (secciones || []).filter((s) => !conActividades.has(s.id)).length,
      },
      entregasPorCalificar: (entregas || []).map((e) => ({
        entregaId: e.id,
        actividad: titulos.get(e.activity_id) ?? e.activity_id,
        aprendiz: porId.get(e.user_id) ?? null,
        entregadaEl: e.entregado_at,
      })),
      // Una sección vacía no la ve el aprendiz: es trabajo a medio hacer.
      seccionesVacias: (secciones || [])
        .filter((s) => !conActividades.has(s.id))
        .map((s) => ({ id: s.id, nombre: s.name, curso: porCurso.get(s.course_id) })),
    };
  }

  static async _administracion(actor) {
    const esSuper = actor.role === "superadmin";
    const porEmpresa = (q) => (esSuper ? q : q.eq("tenant_id", actor.tenantId));

    const [{ data: usuarios }, { data: grupos }, { data: cursos }] = await Promise.all([
      porEmpresa(supabase.from("users").select("id, role, email, status")),
      porEmpresa(supabase.from("groups").select("id, name")),
      porEmpresa(supabase.from("courses").select("id, name, instructor")),
    ]);

    // Solo las relaciones de esta empresa. Antes se leían las tablas enteras,
    // de todas las organizaciones: lento, y con más de mil filas PostgREST
    // corta la respuesta y los conteos de abajo salían mal.
    const idsUsuarios = (usuarios || []).map((u) => u.id);
    const idsGrupos = (grupos || []).map((g) => g.id);
    const [{ data: ug }, { data: gc }] = await Promise.all([
      idsUsuarios.length
        ? supabase.from("users_groups").select("id_user").in("id_user", idsUsuarios)
        : { data: [] },
      idsGrupos.length
        ? supabase.from("groups_courses").select("id_group").in("id_group", idsGrupos)
        : { data: [] },
    ]);
    const conEquipo = new Set((ug || []).map((x) => x.id_user));
    const conCursos = new Set((gc || []).map((x) => x.id_group));

    // Estas tres cosas dejan a alguien sin poder trabajar, por eso son las que
    // se muestran: un aprendiz sin equipo no llega a ningún curso, un equipo
    // sin cursos no sirve de nada, y un curso sin instructor no se corrige.
    // "Sin instructor" incluye al que tiene un correo de alguien que no existe,
    // está desactivado o no puede dictar: en la práctica, tampoco tiene quién lo corrija.
    const puedenDictar = new Set(
      (usuarios || [])
        .filter((u) => ["instructor", "admin"].includes(u.role) && u.status !== "Inactive")
        .map((u) => u.email)
    );
    const sinEquipo = (usuarios || []).filter((u) => u.role === "student" && !conEquipo.has(u.id));
    const equiposSinCursos = (grupos || []).filter((g) => !conCursos.has(g.id));
    const cursosSinInstructor = (cursos || []).filter(
      (c) => !c.instructor || (!esSuper && !puedenDictar.has(c.instructor))
    );

    return {
      rol: actor.role,
      resumen: {
        personas: (usuarios || []).length,
        equipos: (grupos || []).length,
        cursos: (cursos || []).length,
        aprendicesSinEquipo: sinEquipo.length,
        equiposSinCursos: equiposSinCursos.length,
        cursosSinInstructor: cursosSinInstructor.length,
      },
      aprendicesSinEquipo: sinEquipo.map((u) => u.id),
      equiposSinCursos: equiposSinCursos.map((g) => ({ id: g.id, nombre: g.name })),
      cursosSinInstructor: cursosSinInstructor.map((c) => ({ id: c.id, nombre: c.name })),
    };
  }
}

module.exports = PendientesService;
