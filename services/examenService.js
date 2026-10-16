const crypto = require("crypto");
const { supabase } = require("../helpers/supabaseHelper.js");

function fallo(message, status) {
  const err = new Error(message);
  err.status = status;
  return err;
}

const id = () => crypto.randomBytes(5).toString("hex");

/**
 * Exámenes (HU-041).
 *
 * Un examen no es una entidad aparte: es una actividad de tipo 'Examen' con
 * preguntas colgando. Así hereda sección, curso, empresa y XP sin duplicar
 * nada, y todo lo que ya sabe el sistema sobre actividades sigue valiendo.
 */
class ExamenService {
  /** La actividad existe, es un examen y quien pregunta puede tocarla. */
  static async _examen(actividadId, actor, { soloLectura = false } = {}) {
    let q = supabase
      .from("activities")
      .select("id, title, type, xp, tenant_id, section_id, tiempo_limite, intentos_permitidos")
      .eq("id", actividadId);
    if (actor.role !== "superadmin") q = q.eq("tenant_id", actor.tenantId);

    const { data: actividad } = await q.maybeSingle();
    if (!actividad) throw fallo("Actividad no encontrada", 404);
    if (actividad.type !== "Examen") {
      throw fallo("Esta actividad no es un examen.", 409);
    }
    if (soloLectura) return actividad;

    // Editar el examen es editar el curso: mismo alcance que el resto.
    if (actor.role === "instructor") {
      const { data: seccion } = actividad.section_id
        ? await supabase.from("sections").select("course_id").eq("id", actividad.section_id).maybeSingle()
        : { data: null };
      const { data: curso } = seccion
        ? await supabase.from("courses").select("instructor").eq("id", seccion.course_id).maybeSingle()
        : { data: null };
      if (!curso || curso.instructor !== actor.email) {
        throw fallo("Este examen no pertenece a un curso que dictes.", 403);
      }
    }
    return actividad;
  }

  /**
   * Agrega una pregunta con sus opciones.
   *
   * Se valida antes de escribir nada: una pregunta de opción múltiple sin
   * respuesta correcta no se puede calificar, y con dos correctas tampoco
   * —todavía no hay selección múltiple—.
   */
  static async agregarPregunta(actividadId, actor, { enunciado, puntaje, opciones }) {
    const actividad = await ExamenService._examen(actividadId, actor);

    if (!enunciado?.trim()) throw fallo("La pregunta necesita un enunciado.", 400);
    if (!Array.isArray(opciones) || opciones.length < 2) {
      throw fallo("Una pregunta necesita al menos dos opciones.", 400);
    }
    const correctas = opciones.filter((o) => o?.esCorrecta === true);
    if (correctas.length !== 1) {
      throw fallo(
        correctas.length === 0
          ? "Marcá cuál es la opción correcta."
          : "Solo puede haber una opción correcta.",
        400
      );
    }
    if (opciones.some((o) => !o?.texto?.trim())) {
      throw fallo("Ninguna opción puede quedar vacía.", 400);
    }

    const { count } = await supabase
      .from("preguntas").select("id", { count: "exact", head: true })
      .eq("activity_id", actividadId);

    const preguntaId = id();
    const { error } = await supabase.from("preguntas").insert({
      id: preguntaId,
      activity_id: actividadId,
      tenant_id: actividad.tenant_id,
      enunciado: enunciado.trim(),
      puntaje: Number(puntaje) > 0 ? Number(puntaje) : 1,
      orden: count ?? 0,
    });
    if (error) throw new Error(error.message);

    const { error: e2 } = await supabase.from("opciones").insert(
      opciones.map((o, i) => ({
        id: id(),
        pregunta_id: preguntaId,
        texto: o.texto.trim(),
        es_correcta: o.esCorrecta === true,
        orden: i,
      }))
    );
    if (e2) {
      // Una pregunta sin opciones no sirve para nada: se deshace.
      await supabase.from("preguntas").delete().eq("id", preguntaId);
      throw new Error(e2.message);
    }

    return { message: "Pregunta agregada", preguntaId };
  }

  /**
   * El examen completo.
   *
   * `paraResolver` decide si se revela cuál es la opción correcta. Con true se
   * devuelve exactamente lo que verá el aprendiz, que es lo que pide el
   * criterio 3: previsualizar antes de publicar. Y es la misma forma que
   * consumirá quien lo rinda, así que no hay dos versiones que mantener.
   */
  static async obtener(actividadId, actor, { paraResolver = false } = {}) {
    const actividad = await ExamenService._examen(actividadId, actor, { soloLectura: true });

    const { data: preguntas } = await supabase
      .from("preguntas").select("*").eq("activity_id", actividadId)
      .order("orden", { ascending: true });

    const { data: opciones } = preguntas?.length
      ? await supabase.from("opciones").select("*")
          .in("pregunta_id", preguntas.map((p) => p.id))
          .order("orden", { ascending: true })
      : { data: [] };

    const armadas = (preguntas || []).map((p) => ({
      id: p.id,
      enunciado: p.enunciado,
      puntaje: p.puntaje,
      orden: p.orden,
      opciones: (opciones || [])
        .filter((o) => o.pregunta_id === p.id)
        .map((o) => ({
          id: o.id,
          texto: o.texto,
          // La respuesta correcta solo viaja cuando no es para resolver.
          ...(paraResolver ? {} : { esCorrecta: o.es_correcta }),
        })),
    }));

    return {
      actividadId: actividad.id,
      titulo: actividad.title,
      xp: actividad.xp,
      tiempoLimite: actividad.tiempo_limite ?? null,
      intentosPermitidos: actividad.intentos_permitidos ?? 1,
      // Calculado, nunca guardado: agregar una pregunta lo actualiza solo.
      puntajeTotal: armadas.reduce((a, p) => a + p.puntaje, 0),
      preguntas: armadas,
      // Un examen sin preguntas no se puede rendir; que se vea de entrada.
      listoParaPublicar: armadas.length > 0,
    };
  }

  /** Tiempo límite e intentos (criterio 2). El puntaje total sale de las preguntas. */
  static async configurar(actividadId, actor, { tiempoLimite, intentosPermitidos }) {
    await ExamenService._examen(actividadId, actor);

    const cambios = {};
    if (tiempoLimite !== undefined) {
      const v = tiempoLimite === null || tiempoLimite === "" ? null : Number(tiempoLimite);
      if (v !== null && (!Number.isInteger(v) || v < 1 || v > 480)) {
        throw fallo("El tiempo límite debe estar entre 1 y 480 minutos, o vacío para no limitar.", 400);
      }
      cambios.tiempo_limite = v;
    }
    if (intentosPermitidos !== undefined) {
      const v = Number(intentosPermitidos);
      if (!Number.isInteger(v) || v < 1 || v > 10) {
        throw fallo("Los intentos permitidos deben estar entre 1 y 10.", 400);
      }
      cambios.intentos_permitidos = v;
    }
    if (!Object.keys(cambios).length) throw fallo("No enviaste nada que cambiar.", 400);

    const { error } = await supabase.from("activities").update(cambios).eq("id", actividadId);
    if (error) throw new Error(error.message);

    return { message: "Examen configurado", ...cambios };
  }

  static async editarPregunta(preguntaId, actor, { enunciado, puntaje, opciones }) {
    const { data: pregunta } = await supabase
      .from("preguntas").select("*").eq("id", preguntaId).maybeSingle();
    if (!pregunta) throw fallo("Pregunta no encontrada", 404);
    await ExamenService._examen(pregunta.activity_id, actor);

    const cambios = {};
    if (enunciado !== undefined) {
      if (!enunciado?.trim()) throw fallo("El enunciado no puede quedar vacío.", 400);
      cambios.enunciado = enunciado.trim();
    }
    if (puntaje !== undefined) {
      const v = Number(puntaje);
      if (!Number.isInteger(v) || v < 1) throw fallo("El puntaje debe ser un entero positivo.", 400);
      cambios.puntaje = v;
    }

    if (Object.keys(cambios).length) {
      const { error } = await supabase.from("preguntas").update(cambios).eq("id", preguntaId);
      if (error) throw new Error(error.message);
    }

    // Las opciones se reemplazan enteras: editarlas una por una obligaría a
    // llevar la cuenta de cuál se borró, y el conjunto tiene que seguir
    // teniendo exactamente una correcta.
    if (opciones !== undefined) {
      if (!Array.isArray(opciones) || opciones.length < 2) {
        throw fallo("Una pregunta necesita al menos dos opciones.", 400);
      }
      if (opciones.filter((o) => o?.esCorrecta === true).length !== 1) {
        throw fallo("Tiene que haber exactamente una opción correcta.", 400);
      }
      await supabase.from("opciones").delete().eq("pregunta_id", preguntaId);
      const { error } = await supabase.from("opciones").insert(
        opciones.map((o, i) => ({
          id: id(), pregunta_id: preguntaId,
          texto: String(o.texto).trim(), es_correcta: o.esCorrecta === true, orden: i,
        }))
      );
      if (error) throw new Error(error.message);
    }

    return { message: "Pregunta actualizada" };
  }

  static async eliminarPregunta(preguntaId, actor) {
    const { data: pregunta } = await supabase
      .from("preguntas").select("activity_id").eq("id", preguntaId).maybeSingle();
    if (!pregunta) throw fallo("Pregunta no encontrada", 404);
    await ExamenService._examen(pregunta.activity_id, actor);

    // Las opciones se van con ella por ON DELETE CASCADE.
    const { error } = await supabase.from("preguntas").delete().eq("id", preguntaId);
    if (error) throw new Error(error.message);

    return { message: "Pregunta eliminada" };
  }
}

module.exports = ExamenService;
