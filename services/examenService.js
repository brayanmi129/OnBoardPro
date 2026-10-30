const crypto = require("crypto");
const { supabase } = require("../helpers/supabaseHelper.js");
const { asegurarPublicado } = require("../helpers/cursoDeActividad.js");
const GamificationService = require("./gamificationService.js");

function fallo(message, status) {
  const err = new Error(message);
  err.status = status;
  return err;
}

const id = () => crypto.randomBytes(5).toString("hex");

// Margen por la latencia de la red: quien envía en el último segundo no
// debería perder el intento porque la petición tardó en llegar.
const GRACIA_MS = 60 * 1000;

// Aprobar en el primer intento paga el XP completo; en un reintento, esta
// fracción (HU-055). Si no, reprobar a propósito para ver las respuestas y
// aprobar después costaría lo mismo que saberlo de entrada.
const FACTOR_REINTENTO = 0.5;

const esConcurso = (actividad) => actividad.type === "Concurso";
const nombreDe = (actividad) => (esConcurso(actividad) ? "concurso" : "examen");

/**
 * Hasta cuándo se puede enviar un intento. Null si no tiene tiempo límite.
 *
 * El examen tiene un tiempo total; el concurso, un tiempo por pregunta, así
 * que su límite depende de cuántas preguntas le tocaron en la partida.
 */
function venceEn(intento, actividad) {
  const desde = new Date(intento.iniciado_at).getTime();
  if (esConcurso(actividad)) {
    const n = Array.isArray(intento.preguntas) ? intento.preguntas.length : 0;
    if (!actividad.tiempo_por_pregunta || !n) return null;
    return new Date(desde + actividad.tiempo_por_pregunta * n * 1000);
  }
  if (!actividad.tiempo_limite) return null;
  return new Date(desde + actividad.tiempo_limite * 60000);
}

/**
 * El XP que paga un intento aprobado (HU-045 y HU-055): proporcional a la
 * nota, y la mitad si no fue el primer intento.
 */
function xpDelIntento(actividad, intento) {
  const base = actividad.xp ?? 0;
  const proporcional = (base * (intento.porcentaje ?? 0)) / 100;
  const factor = intento.numero > 1 ? FACTOR_REINTENTO : 1;
  return Math.round(proporcional * factor);
}

/** Mezcla una lista sin tocar la original (Fisher-Yates). */
function mezclar(lista) {
  const copia = [...lista];
  for (let i = copia.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}

/**
 * Las preguntas de una partida de concurso: sorteadas si se juega con menos
 * de las que hay, y de la más fácil a la más difícil si así se configuró.
 * Dentro de una misma dificultad el orden es al azar, para que dos partidas
 * no sean iguales.
 */
function armarPartida(preguntas, actividad) {
  let elegidas = mezclar(preguntas);
  const cuantas = actividad.preguntas_por_partida;
  if (cuantas && cuantas < elegidas.length) elegidas = elegidas.slice(0, cuantas);
  if (actividad.dificultad_creciente) {
    elegidas.sort((a, b) => (a.dificultad ?? 1) - (b.dificultad ?? 1));
  }
  return elegidas;
}

/** Deja solo las preguntas de la partida, en el orden en que le tocaron. */
function soloDeLaPartida(examen, intento) {
  if (!Array.isArray(intento?.preguntas)) return examen;
  const porId = new Map(examen.preguntas.map((p) => [p.id, p]));
  const preguntas = intento.preguntas.map((pid) => porId.get(pid)).filter(Boolean);
  return {
    ...examen,
    preguntas,
    puntajeTotal: preguntas.reduce((a, p) => a + p.puntaje, 0),
  };
}

function presentarIntento(i, vence = null) {
  return {
    id: i.id,
    numero: i.numero,
    estado: i.estado,
    iniciadoAt: i.iniciado_at,
    venceAt: vence ? vence.toISOString() : null,
    finalizadoAt: i.finalizado_at ?? null,
    puntaje: i.puntaje ?? null,
    puntajeTotal: i.puntaje_total ?? null,
    porcentaje: i.porcentaje ?? null,
    aprobado: i.aprobado ?? null,
  };
}

const CAMPOS_ACTIVIDAD =
  "id, title, type, xp, tenant_id, section_id, tiempo_limite, intentos_permitidos, porcentaje_aprobacion, " +
  "mostrar_respuestas, tiempo_por_pregunta, preguntas_por_partida, dificultad_creciente";

/**
 * Exámenes (HU-041) y concursos de preguntas (HU-065).
 *
 * Un examen no es una entidad aparte: es una actividad de tipo 'Examen' con
 * preguntas colgando. Así hereda sección, curso, empresa y XP sin duplicar
 * nada, y todo lo que ya sabe el sistema sobre actividades sigue valiendo.
 *
 * El concurso usa el mismo motor —preguntas, intentos, corrección— y cambia la
 * piel: tiempo por pregunta, preguntas sorteadas por partida, dificultad en
 * aumento y partidas ilimitadas. El XP se gana una sola vez.
 */
class ExamenService {
  /** La actividad existe, es un examen o un concurso, y quien pregunta puede tocarla. */
  static async _examen(actividadId, actor, { soloLectura = false } = {}) {
    let q = supabase.from("activities").select(CAMPOS_ACTIVIDAD).eq("id", actividadId);
    if (actor.role !== "superadmin") q = q.eq("tenant_id", actor.tenantId);

    const { data: actividad, error } = await q.maybeSingle();
    if (error) throw new Error(error.message);
    if (!actividad) throw fallo("Actividad no encontrada", 404);
    if (actividad.type !== "Examen" && actividad.type !== "Concurso") {
      throw fallo("Esta actividad no es un examen ni un concurso.", 409);
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
   * Valida una pregunta tal como llega del cliente y la devuelve limpia.
   *
   * Una pregunta de opción múltiple sin respuesta correcta no se puede
   * calificar, y con dos correctas tampoco —todavía no hay selección
   * múltiple—. `parcial` deja pasar lo que no se envió, para editar un solo
   * campo; `n` es el número de pregunta, para que el error diga cuál falló.
   */
  static _validarPregunta(datos, { parcial = false, n = null } = {}) {
    const donde = n ? `Pregunta ${n}: ` : "";
    const limpio = {};

    if (datos?.enunciado !== undefined || !parcial) {
      if (!String(datos?.enunciado ?? "").trim()) throw fallo(`${donde}falta el enunciado.`, 400);
      limpio.enunciado = String(datos.enunciado).trim();
    }
    if (datos?.puntaje !== undefined) {
      const v = Number(datos.puntaje);
      if (!Number.isInteger(v) || v < 1) throw fallo(`${donde}el puntaje debe ser un entero positivo.`, 400);
      limpio.puntaje = v;
    } else if (!parcial) {
      limpio.puntaje = 1;
    }
    // Solo la usa el concurso para ordenar; en un examen se guarda y no molesta.
    if (datos?.dificultad !== undefined) {
      const v = Number(datos.dificultad);
      if (![1, 2, 3].includes(v)) throw fallo(`${donde}la dificultad es 1 (fácil), 2 (media) o 3 (difícil).`, 400);
      limpio.dificultad = v;
    } else if (!parcial) {
      limpio.dificultad = 1;
    }

    if (datos?.opciones !== undefined || !parcial) {
      const opciones = datos?.opciones;
      if (!Array.isArray(opciones) || opciones.length < 2) {
        throw fallo(`${donde}necesita al menos dos opciones.`, 400);
      }
      const correctas = opciones.filter((o) => o?.esCorrecta === true).length;
      if (correctas !== 1) {
        throw fallo(
          correctas === 0
            ? `${donde}marcá cuál es la opción correcta.`
            : `${donde}solo puede haber una opción correcta.`,
          400
        );
      }
      if (opciones.some((o) => !String(o?.texto ?? "").trim())) {
        throw fallo(`${donde}ninguna opción puede quedar vacía.`, 400);
      }
      limpio.opciones = opciones.map((o) => ({ texto: String(o.texto).trim(), esCorrecta: o.esCorrecta === true }));
    }
    return limpio;
  }

  /**
   * La configuración, validada. Solo lo que se envió.
   *
   * El examen tiene tiempo total e intentos; el concurso, tiempo por pregunta,
   * preguntas por partida y dificultad en aumento. Lo de uno no vale en el otro.
   */
  static _validarConfig(datos, actividad) {
    const {
      tiempoLimite, intentosPermitidos, porcentajeAprobacion, mostrarRespuestas,
      tiempoPorPregunta, preguntasPorPartida, dificultadCreciente,
    } = datos;
    const concurso = esConcurso(actividad);
    const soloDe = (campo, deConcurso) => {
      if (datos[campo] !== undefined && deConcurso !== concurso) {
        throw fallo(`\`${campo}\` solo se usa en ${deConcurso ? "un concurso" : "un examen"}.`, 400);
      }
    };
    soloDe("tiempoLimite", false);
    soloDe("intentosPermitidos", false);
    soloDe("tiempoPorPregunta", true);
    soloDe("preguntasPorPartida", true);
    soloDe("dificultadCreciente", true);

    const cambios = {};
    if (mostrarRespuestas !== undefined) {
      if (typeof mostrarRespuestas !== "boolean") throw fallo("`mostrarRespuestas` es true o false.", 400);
      cambios.mostrar_respuestas = mostrarRespuestas;
    }
    if (tiempoPorPregunta !== undefined) {
      const v = tiempoPorPregunta === null || tiempoPorPregunta === "" ? null : Number(tiempoPorPregunta);
      if (v !== null && (!Number.isInteger(v) || v < 5 || v > 300)) {
        throw fallo("El tiempo por pregunta debe estar entre 5 y 300 segundos, o vacío para no limitar.", 400);
      }
      cambios.tiempo_por_pregunta = v;
    }
    if (preguntasPorPartida !== undefined) {
      const v = preguntasPorPartida === null || preguntasPorPartida === "" ? null : Number(preguntasPorPartida);
      if (v !== null && (!Number.isInteger(v) || v < 1 || v > 100)) {
        throw fallo("Las preguntas por partida deben estar entre 1 y 100, o vacío para usar todas.", 400);
      }
      cambios.preguntas_por_partida = v;
    }
    if (dificultadCreciente !== undefined) {
      if (typeof dificultadCreciente !== "boolean") throw fallo("`dificultadCreciente` es true o false.", 400);
      cambios.dificultad_creciente = dificultadCreciente;
    }
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
    if (porcentajeAprobacion !== undefined) {
      const v = Number(porcentajeAprobacion);
      if (!Number.isInteger(v) || v < 1 || v > 100) {
        throw fallo("El porcentaje para aprobar debe estar entre 1 y 100.", 400);
      }
      cambios.porcentaje_aprobacion = v;
    }
    return cambios;
  }

  /**
   * Las preguntas no se tocan si alguien ya rindió el examen.
   *
   * Cambiar la respuesta correcta, o agregar y quitar preguntas, dejaría a
   * quien ya lo rindió con un resultado que no corresponde al examen que hay
   * ahora, y sus respuestas guardadas apuntarían a opciones que ya no existen.
   * La configuración sí se puede seguir ajustando.
   */
  static async _asegurarSinIntentos(actividadId) {
    const { count } = await supabase
      .from("intentos_examen").select("id", { count: "exact", head: true })
      .eq("activity_id", actividadId);
    if (count) {
      throw fallo(
        `${count === 1 ? "Ya hay 1 intento" : `Ya hay ${count} intentos`} registrados: ` +
          "las preguntas ya no se pueden cambiar. Creá una actividad nueva si hace falta otra.",
        409
      );
    }
  }

  /** Opciones listas para la base, con su id ya generado. */
  static _opcionesConId(opciones) {
    return opciones.map((o) => ({ id: id(), texto: o.texto, esCorrecta: o.esCorrecta }));
  }

  /**
   * Guarda el examen completo de una vez: configuración y preguntas.
   *
   * Es lo que manda el editor al pulsar "Guardar". `preguntas` es la lista
   * entera y en orden:
   *
   *   con id    -> se edita esa pregunta
   *   sin id    -> se crea
   *   no vino   -> se borra
   *
   * Todo se valida antes de escribir: si la pregunta 7 está mal no se guarda
   * nada, en vez de dejar el examen a medias. Lo que no se envía no se toca:
   * mandar solo la configuración no borra las preguntas.
   */
  static async guardar(actividadId, actor, datos = {}) {
    const actividad = await ExamenService._examen(actividadId, actor);

    const config = ExamenService._validarConfig(datos, actividad);
    const { preguntas } = datos;
    if (!Object.keys(config).length && preguntas === undefined) {
      throw fallo("No enviaste nada que guardar.", 400);
    }

    let nuevas = null;
    if (preguntas !== undefined) {
      if (!Array.isArray(preguntas)) throw fallo("`preguntas` tiene que ser una lista.", 400);
      nuevas = preguntas.map((p, i) => ({
        id: p?.id ? String(p.id) : null,
        ...ExamenService._validarPregunta(p, { n: i + 1 }),
      }));

      const { data: actuales } = await supabase
        .from("preguntas").select("id").eq("activity_id", actividadId);
      const existentes = new Set((actuales || []).map((p) => p.id));
      const conId = nuevas.filter((p) => p.id).map((p) => p.id);
      if (new Set(conId).size !== conId.length) throw fallo("Hay preguntas repetidas en la lista.", 400);
      const ajena = conId.find((pid) => !existentes.has(pid));
      if (ajena) throw fallo(`La pregunta ${ajena} no es de este examen.`, 400);

      await ExamenService._asegurarSinIntentos(actividadId);
    }

    // Todo lo que sigue lo escribe una sola función de la base
    // (guardar_examen), en una transacción: o se guarda el examen entero o no
    // cambia nada. Hecho paso a paso desde acá, un fallo a mitad de camino
    // dejaba preguntas borradas o sin opciones.
    const { error } = await supabase.rpc("guardar_examen", {
      p_activity: actividadId,
      p_tenant: actividad.tenant_id,
      p_config: config,
      p_preguntas: nuevas
        ? nuevas.map((p) => ({
            id: p.id,
            nuevoId: p.id ? null : id(),
            enunciado: p.enunciado,
            puntaje: p.puntaje,
            dificultad: p.dificultad,
            opciones: ExamenService._opcionesConId(p.opciones),
          }))
        : null,
    });
    if (error) throw new Error(error.message);

    return {
      message: esConcurso(actividad) ? "Concurso guardado" : "Examen guardado",
      examen: await ExamenService.obtener(actividadId, actor),
    };
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
      dificultad: p.dificultad ?? 1,
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

    const concurso = esConcurso(actividad);
    return {
      actividadId: actividad.id,
      tipo: actividad.type,
      titulo: actividad.title,
      xp: actividad.xp,
      tiempoLimite: concurso ? null : actividad.tiempo_limite ?? null,
      // El concurso se juega las veces que se quiera: null es "sin límite".
      intentosPermitidos: concurso ? null : actividad.intentos_permitidos ?? 1,
      porcentajeAprobacion: actividad.porcentaje_aprobacion ?? 70,
      mostrarRespuestas: actividad.mostrar_respuestas !== false,
      ...(concurso
        ? {
            tiempoPorPregunta: actividad.tiempo_por_pregunta ?? null,
            preguntasPorPartida: actividad.preguntas_por_partida ?? null,
            dificultadCreciente: actividad.dificultad_creciente === true,
          }
        : {}),
      // Calculado, nunca guardado: agregar una pregunta lo actualiza solo.
      puntajeTotal: armadas.reduce((a, p) => a + p.puntaje, 0),
      preguntas: armadas,
      // Un examen sin preguntas no se puede rendir; que se vea de entrada.
      listoParaPublicar: armadas.length > 0,
    };
  }

  /**
   * La pregunta, comprobando que sea de ese examen. El id de la pregunta ya es
   * único, pero exigir también el del examen evita editar por error una
   * pregunta de otro examen con un id copiado de otra pantalla.
   */
  static async _pregunta(actividadId, preguntaId, actor) {
    await ExamenService._examen(actividadId, actor);
    const { data: pregunta } = await supabase
      .from("preguntas").select("*")
      .eq("id", preguntaId).eq("activity_id", actividadId).maybeSingle();
    if (!pregunta) throw fallo("Esa pregunta no existe en este examen.", 404);
    return pregunta;
  }

  /**
   * Edita una pregunta. Solo cambia lo que se envía; las opciones, si vienen,
   * se reemplazan enteras: editarlas una por una obligaría a llevar la cuenta
   * de cuál se borró, y el conjunto tiene que seguir teniendo una sola correcta.
   */
  static async editarPregunta(actividadId, preguntaId, actor, datos) {
    await ExamenService._pregunta(actividadId, preguntaId, actor);

    const { opciones, ...cambios } = ExamenService._validarPregunta(datos, { parcial: true });
    if (!Object.keys(cambios).length && !opciones) throw fallo("No enviaste nada que cambiar.", 400);
    await ExamenService._asegurarSinIntentos(actividadId);

    // En una sola transacción (editar_pregunta): reemplazar las opciones es
    // borrar e insertar, y si el insert fallaba la pregunta quedaba sin opciones.
    const { error } = await supabase.rpc("editar_pregunta", {
      p_pregunta: preguntaId,
      p_enunciado: cambios.enunciado ?? null,
      p_puntaje: cambios.puntaje ?? null,
      p_opciones: opciones ? ExamenService._opcionesConId(opciones) : null,
      p_dificultad: cambios.dificultad ?? null,
    });
    if (error) throw new Error(error.message);

    return { message: "Pregunta actualizada" };
  }

  static async eliminarPregunta(actividadId, preguntaId, actor) {
    await ExamenService._pregunta(actividadId, preguntaId, actor);
    await ExamenService._asegurarSinIntentos(actividadId);

    // Las opciones se van con ella por ON DELETE CASCADE.
    const { error } = await supabase.from("preguntas").delete().eq("id", preguntaId);
    if (error) throw new Error(error.message);

    return { message: "Pregunta eliminada" };
  }

  /**
   * Si el examen está aprobado pero su XP no entró (falló la acreditación al
   * enviarlo), lo acredita ahora con lo que pagaba ese intento. Nunca rompe
   * la consulta que lo llama.
   */
  static async _repararXp(actividad, userId, intentos) {
    const aprobado = intentos.find((i) => i.aprobado);
    if (!aprobado) return;
    try {
      await GamificationService.asegurarAcreditado({
        userId,
        actividadId: actividad.id,
        tenantId: actividad.tenant_id,
        puntos: xpDelIntento(actividad, aprobado),
        motivo: esConcurso(actividad) ? "concurso_aprobado" : "examen_aprobado",
      });
    } catch (err) {
      console.error(`[${nombreDe(actividad)}] no se pudo reparar el XP:`, err.message);
    }
  }

  /** Los intentos de una persona en un examen, del primero al último. */
  static async _intentosDe(actividadId, userId) {
    const { data, error } = await supabase
      .from("intentos_examen").select("*")
      .eq("activity_id", actividadId).eq("user_id", userId)
      .order("numero", { ascending: true });
    if (error) throw new Error(error.message);
    return data || [];
  }

  /** Cierra un intento que se quedó sin tiempo. Cuenta como no aprobado. */
  static async _cerrarVencido(intento, puntajeTotal) {
    await supabase.from("intentos_examen").update({
      estado: "finalizado",
      finalizado_at: new Date().toISOString(),
      respuestas: [],
      puntaje: 0,
      puntaje_total: puntajeTotal,
      porcentaje: 0,
      aprobado: false,
    }).eq("id", intento.id).eq("estado", "en_curso");
  }

  /**
   * Abre un intento y devuelve el examen para resolver (HU-044).
   *
   * El intento se registra al abrir y no al enviar: el tiempo límite se mide
   * desde acá. Si ya había uno abierto y sigue en tiempo, se retoma en vez de
   * gastar otro: cerrar la pestaña por error no debería costar un intento.
   *
   * En un concurso cada intento es una partida: se sortean sus preguntas, no
   * hay límite de partidas y se puede seguir jugando después de aprobar.
   */
  static async iniciar(actividadId, actor) {
    const actividad = await ExamenService._examen(actividadId, actor, { soloLectura: true });
    await asegurarPublicado(actividadId, actor);
    const concurso = esConcurso(actividad);

    const examen = await ExamenService.obtener(actividadId, actor, { paraResolver: true });
    if (!examen.preguntas.length) throw fallo(`Este ${nombreDe(actividad)} todavía no tiene preguntas.`, 409);

    const intentos = await ExamenService._intentosDe(actividadId, actor.id);
    const yaAprobo = intentos.some((i) => i.aprobado);
    if (yaAprobo) await ExamenService._repararXp(actividad, actor.id, intentos);
    if (yaAprobo && !concurso) throw fallo("Ya aprobaste este examen.", 409);

    // El concurso no tiene límite de partidas: null es "sin límite".
    const permitidos = concurso ? null : actividad.intentos_permitidos ?? 1;
    const restantesTras = (usados) => (permitidos === null ? null : permitidos - usados);

    const abierto = intentos.find((i) => i.estado === "en_curso");
    if (abierto) {
      const vence = venceEn(abierto, actividad);
      if (!vence || Date.now() <= vence.getTime() + GRACIA_MS) {
        return {
          message: concurso ? "Retomás la partida que tenías abierta." : "Retomás el intento que tenías abierto.",
          intento: presentarIntento(abierto, vence),
          intentosRestantes: restantesTras(intentos.length),
          examen: soloDeLaPartida(examen, abierto),
        };
      }
      await ExamenService._cerrarVencido(abierto, soloDeLaPartida(examen, abierto).puntajeTotal);
    }

    if (permitidos !== null && intentos.length >= permitidos) {
      throw fallo(
        permitidos === 1
          ? "Ya usaste el único intento de este examen."
          : `Ya usaste los ${permitidos} intentos de este examen.`,
        409
      );
    }

    const fila = {
      id: id(),
      activity_id: actividadId,
      user_id: actor.id,
      tenant_id: actividad.tenant_id,
      numero: intentos.length + 1,
      estado: "en_curso",
      iniciado_at: new Date().toISOString(),
      preguntas: concurso ? armarPartida(examen.preguntas, actividad).map((p) => p.id) : null,
    };
    const { error } = await supabase.from("intentos_examen").insert(fila);
    if (error) {
      // 23505: otra petición abrió este mismo número de intento un instante antes.
      if (error.code === "23505" || /duplicate|unique/i.test(error.message)) {
        throw fallo(`Ya tenés un intento abriéndose. Volvé a cargar el ${nombreDe(actividad)}.`, 409);
      }
      throw new Error(error.message);
    }

    return {
      message: concurso
        ? `Partida ${fila.numero}.${yaAprobo ? " Ya ganaste el XP de este concurso: esta partida es de práctica." : ""}`
        : `Intento ${fila.numero} de ${permitidos}.`,
      intento: presentarIntento(fila, venceEn(fila, actividad)),
      intentosRestantes: restantesTras(fila.numero),
      examen: soloDeLaPartida(examen, fila),
    };
  }

  /**
   * Una partida de muestra del concurso, con las respuestas (HU-065).
   *
   * Es lo que ve quien lo arma antes de publicarlo: cada llamada sortea una
   * partida nueva, así que "volver a generar" es pedirla otra vez. No abre
   * ningún intento ni cuenta para nadie.
   */
  static async vistaPrevia(actividadId, actor) {
    const actividad = await ExamenService._examen(actividadId, actor);
    if (!esConcurso(actividad)) throw fallo("La vista previa por partida es solo para concursos.", 409);

    const concurso = await ExamenService.obtener(actividadId, actor);
    if (!concurso.preguntas.length) throw fallo("Este concurso todavía no tiene preguntas.", 409);

    const preguntas = armarPartida(concurso.preguntas, actividad);
    return {
      ...concurso,
      preguntas,
      puntajeTotal: preguntas.reduce((a, p) => a + p.puntaje, 0),
      tiempoTotalSegundos: actividad.tiempo_por_pregunta
        ? actividad.tiempo_por_pregunta * preguntas.length
        : null,
      preguntasDisponibles: concurso.preguntas.length,
    };
  }

  /**
   * Envía las respuestas, corrige y acredita el XP si aprueba (HU-044, HU-045).
   *
   * La corrección sale siempre de la base, nunca de lo que diga el cliente. Una
   * pregunta sin responder cuenta como incorrecta.
   *
   * El XP es proporcional a la nota y la mitad si se aprobó en un reintento
   * (HU-055). Cuando no suma todo, `avisoXp` dice por qué.
   *
   * Qué acertó y qué falló se muestra solo si quien lo armó lo habilitó. La
   * opción correcta, además, solo si aprobó o ya no le quedan intentos:
   * revelarla antes sería regalar el siguiente intento.
   */
  static async responder(actividadId, actor, { respuestas } = {}) {
    const actividad = await ExamenService._examen(actividadId, actor, { soloLectura: true });
    await asegurarPublicado(actividadId, actor);
    const concurso = esConcurso(actividad);
    if (!Array.isArray(respuestas)) {
      throw fallo("Enviá las respuestas como una lista de { preguntaId, opcionId }.", 400);
    }

    const intentos = await ExamenService._intentosDe(actividadId, actor.id);
    const intento = intentos.find((i) => i.estado === "en_curso");
    if (!intento) throw fallo(`No tenés un intento abierto. Iniciá el ${nombreDe(actividad)} primero.`, 409);

    const completo = soloDeLaPartida(
      await ExamenService.obtener(actividadId, actor, { paraResolver: false }),
      intento
    );

    const vence = venceEn(intento, actividad);
    if (vence && Date.now() > vence.getTime() + GRACIA_MS) {
      await ExamenService._cerrarVencido(intento, completo.puntajeTotal);
      throw fallo("Se acabó el tiempo de este intento.", 409);
    }

    // Si una pregunta llega dos veces vale la primera respuesta.
    const elegidas = new Map();
    for (const r of respuestas) {
      const preguntaId = r?.preguntaId ? String(r.preguntaId) : null;
      if (preguntaId && !elegidas.has(preguntaId)) {
        elegidas.set(preguntaId, r.opcionId ? String(r.opcionId) : null);
      }
    }
    if ([...elegidas.keys()].some((pid) => !completo.preguntas.some((p) => p.id === pid))) {
      throw fallo(`Hay respuestas a preguntas que no son ${concurso ? "de esta partida" : "de este examen"}.`, 400);
    }

    let puntaje = 0;
    const corregidas = completo.preguntas.map((p) => {
      const opcionId = elegidas.get(p.id) ?? null;
      if (opcionId && !p.opciones.some((o) => o.id === opcionId)) {
        throw fallo("Una de las opciones elegidas no corresponde a su pregunta.", 400);
      }
      const correcta = p.opciones.find((o) => o.esCorrecta)?.id ?? null;
      const acerto = opcionId !== null && opcionId === correcta;
      if (acerto) puntaje += p.puntaje;
      return {
        preguntaId: p.id,
        opcionId,
        correcta: acerto,
        puntaje: acerto ? p.puntaje : 0,
        opcionCorrecta: correcta,
      };
    });

    const total = completo.puntajeTotal;
    const porcentaje = total > 0 ? Math.round((puntaje * 100) / total) : 0;
    const minimo = actividad.porcentaje_aprobacion ?? 70;
    const aprobado = porcentaje >= minimo;

    // Solo se cierra si sigue abierto: de dos envíos simultáneos, uno solo se
    // corrige. El otro no encuentra la fila y recibe 409.
    const { data: cerrado, error } = await supabase.from("intentos_examen").update({
      estado: "finalizado",
      finalizado_at: new Date().toISOString(),
      respuestas: corregidas,
      puntaje,
      puntaje_total: total,
      porcentaje,
      aprobado,
    }).eq("id", intento.id).eq("estado", "en_curso").select("id");
    if (error) throw new Error(error.message);
    if (!cerrado?.length) throw fallo("Este intento ya se había enviado.", 409);

    const { xp, xpBase, avisoXp, xpPendiente } = aprobado
      ? await ExamenService._acreditarAprobado(actividad, actor, { ...intento, porcentaje }, intentos)
      : { xp: null, xpBase: 0, avisoXp: null, xpPendiente: false };

    const restantes = concurso
      ? null
      : Math.max((actividad.intentos_permitidos ?? 1) - intentos.length, 0);
    const mostrar = actividad.mostrar_respuestas !== false;
    const revelar = aprobado || restantes === 0;

    return {
      message: aprobado
        ? `Aprobaste con ${porcentaje}%.`
        : `Obtuviste ${porcentaje}% y hacía falta ${minimo}%.`,
      aprobado,
      puntaje,
      puntajeTotal: total,
      porcentaje,
      porcentajeAprobacion: minimo,
      intentosRestantes: aprobado && !concurso ? 0 : restantes,
      xpAcreditado: xp?.xpGanado ?? 0,
      xpBase,
      avisoXp,
      xpPendiente,
      nivel: xp?.nivel,
      subioDeNivel: xp?.subioDeNivel ?? false,
      logrosDesbloqueados: xp?.logrosDesbloqueados ?? [],
      mostrarRespuestas: mostrar,
      // Null si quien lo armó no quiere mostrar qué acertó cada uno.
      detalle: mostrar
        ? corregidas.map(({ opcionCorrecta, ...c }) => (revelar ? { ...c, opcionCorrecta } : c))
        : null,
    };
  }

  /**
   * Acredita un intento aprobado y arma el aviso de por qué no sumó todo,
   * si es el caso: reintento, ya cobrado (concurso rejugado) o tope diario.
   *
   * Aprobar es lo que completa la actividad. Se acredita aunque valga 0 XP: el
   * movimiento es lo que la marca como hecha y dispara los logros.
   */
  static async _acreditarAprobado(actividad, actor, intento, intentos) {
    const xpBase = xpDelIntento(actividad, intento);
    const avisos = [];
    if (intento.numero > 1 && (actividad.xp ?? 0) > 0 && !intentos.some((i) => i.aprobado)) {
      avisos.push("Aprobaste en un reintento: el XP se reduce a la mitad.");
    }

    // Un concurso rejugado después de aprobarlo ya no paga: se avisa sin ir a
    // la base, que igual lo rechazaría.
    if (intentos.some((i) => i.aprobado)) {
      return {
        xp: null,
        xpBase: 0,
        avisoXp: `Ya habías ganado el XP de este ${nombreDe(actividad)}: esta partida no suma.`,
        xpPendiente: false,
      };
    }

    try {
      const xp = await GamificationService.acreditar({
        userId: actor.id,
        actividadId: actividad.id,
        tenantId: actividad.tenant_id,
        puntos: xpBase,
        motivo: esConcurso(actividad) ? "concurso_aprobado" : "examen_aprobado",
        siRepite: `Este ${nombreDe(actividad)} ya había otorgado su XP.`,
      });
      if (xp.avisoXp) avisos.push(xp.avisoXp);
      return { xp, xpBase, avisoXp: avisos.join(" ") || null, xpPendiente: false };
    } catch (err) {
      if (err.status === 409) {
        return { xp: null, xpBase, avisoXp: err.message, xpPendiente: false };
      }
      // El intento ya quedó aprobado. Si el XP no entró, se completa la
      // próxima vez que la persona consulte sus intentos o vuelva: ver _repararXp.
      console.error(`[${nombreDe(actividad)}] no se acreditó XP, queda pendiente:`, err.message);
      return { xp: null, xpBase, avisoXp: avisos.join(" ") || null, xpPendiente: true };
    }
  }

  /** Mis intentos en un examen y cuántos me quedan. */
  static async misIntentos(actividadId, actor) {
    const actividad = await ExamenService._examen(actividadId, actor, { soloLectura: true });
    const intentos = await ExamenService._intentosDe(actividadId, actor.id);
    // El concurso no tiene límite de partidas: null es "sin límite".
    const permitidos = esConcurso(actividad) ? null : actividad.intentos_permitidos ?? 1;
    const finalizados = intentos.filter((i) => i.estado === "finalizado");
    await ExamenService._repararXp(actividad, actor.id, intentos);

    return {
      tipo: actividad.type,
      intentosPermitidos: permitidos,
      intentosUsados: intentos.length,
      intentosRestantes: permitidos === null ? null : Math.max(permitidos - intentos.length, 0),
      aprobado: intentos.some((i) => i.aprobado),
      mejorPorcentaje: finalizados.length ? Math.max(...finalizados.map((i) => i.porcentaje ?? 0)) : null,
      porcentajeAprobacion: actividad.porcentaje_aprobacion ?? 70,
      intentos: intentos.map((i) => presentarIntento(i, venceEn(i, actividad))),
    };
  }

  /**
   * Cómo le fue a cada aprendiz del curso en el examen (HU-045).
   *
   * Incluye a quien todavía no lo rindió: para quien dicta, saber quién falta
   * vale tanto como ver los resultados. La corrección es automática, así que
   * acá no se califica nada a mano: se consulta.
   */
  static async resultados(actividadId, actor) {
    const actividad = await ExamenService._examen(actividadId, actor);
    // Se pide acá y no arriba para no cargar el servicio de entregas en cada examen.
    const EntregaService = require("./entregaService.js");

    const [{ data: intentos, error }, aprendices] = await Promise.all([
      supabase.from("intentos_examen").select("*").eq("activity_id", actividadId)
        .order("numero", { ascending: true }),
      EntregaService._aQuienLeToca(actividadId),
    ]);
    if (error) throw new Error(error.message);

    const porPersona = new Map();
    for (const i of intentos || []) {
      if (!porPersona.has(i.user_id)) porPersona.set(i.user_id, []);
      porPersona.get(i.user_id).push(i);
    }

    // Quien lo rindió pero ya no está en ningún grupo del curso igual aparece.
    const personas = new Map(aprendices.map((u) => [u.id, u]));
    const sueltos = [...porPersona.keys()].filter((uid) => !personas.has(uid));
    if (sueltos.length) {
      const { data } = await supabase
        .from("users").select("id, firstname, lastname, email").in("id", sueltos);
      for (const u of data || []) personas.set(u.id, u);
    }

    const filas = [...personas.values()].map((u) => {
      const suyos = porPersona.get(u.id) || [];
      const finalizados = suyos.filter((i) => i.estado === "finalizado");
      const ultimo = suyos[suyos.length - 1];
      let estado = "sin_rendir";
      if (suyos.some((i) => i.aprobado)) estado = "aprobado";
      else if (suyos.some((i) => i.estado === "en_curso")) estado = "en_curso";
      else if (finalizados.length) estado = "no_aprobado";
      return {
        aprendiz: { id: u.id, firstname: u.firstname, lastname: u.lastname, email: u.email },
        estado,
        intentosUsados: suyos.length,
        mejorPorcentaje: finalizados.length ? Math.max(...finalizados.map((i) => i.porcentaje ?? 0)) : null,
        ultimoIntentoAt: ultimo ? ultimo.finalizado_at || ultimo.iniciado_at : null,
      };
    });

    const rindieron = filas.filter((f) => f.mejorPorcentaje !== null);
    return {
      actividadId: actividad.id,
      titulo: actividad.title,
      tipo: actividad.type,
      porcentajeAprobacion: actividad.porcentaje_aprobacion ?? 70,
      intentosPermitidos: esConcurso(actividad) ? null : actividad.intentos_permitidos ?? 1,
      resumen: {
        aprendices: filas.length,
        aprobados: filas.filter((f) => f.estado === "aprobado").length,
        sinRendir: filas.filter((f) => f.estado === "sin_rendir").length,
        promedioMejorPorcentaje: rindieron.length
          ? Math.round(rindieron.reduce((a, f) => a + f.mejorPorcentaje, 0) / rindieron.length)
          : null,
      },
      aprendices: filas.sort((a, b) =>
        String(a.aprendiz.lastname || "").localeCompare(String(b.aprendiz.lastname || ""))),
    };
  }
}

module.exports = ExamenService;
// Las reglas puras del motor, expuestas solo para las pruebas unitarias.
module.exports._reglas = { xpDelIntento, armarPartida, venceEn, soloDeLaPartida, FACTOR_REINTENTO };
