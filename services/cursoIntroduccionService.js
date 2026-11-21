// Curso "Introducción a OnBoard Pro": un curso normal de cada organización que
// le enseña al aprendiz a usar la plataforma (primer ingreso, cursos,
// exámenes, entregas, XP, ranking y perfil).
//
// Es un curso más: tiene el tenant de la organización, queda publicado y sin
// asignar a ningún grupo, así que el administrador lo asigna a quien quiera
// como cualquier otro. No tiene instructor: es de solo recursos y un examen
// que se califica solo. Si después se quiere, se le asigna uno desde Cursos.
//
// La definición vive en data/curso-introduccion.json. Cada actividad puede
// traer un video: si quien llama pasa la ruta ya subida al bucket de
// materiales (`videos[nombreDelArchivo]`), se registra como su material; si
// no, la actividad se crea sin material y se le puede subir después.
//
// Es idempotente: si la organización ya tiene un curso con ese nombre, no crea
// otro y devuelve el que hay.
const crypto = require("crypto");
const path = require("path");
const fs = require("fs");
const { supabase } = require("../helpers/supabaseHelper.js");
const ExamenService = require("./examenService.js");
const { columnaFaltante } = require("../helpers/asignacion.js");

const DEFINICION = path.join(__dirname, "..", "data", "curso-introduccion.json");
// Los videos se suben una vez y los comparten todas las organizaciones.
const BUCKET = "materiales";
const CARPETA_VIDEOS = "plataforma/curso-introduccion";
const id = (n = 4) => crypto.randomBytes(n).toString("hex");

function definicion() {
  return JSON.parse(fs.readFileSync(DEFINICION, "utf8"));
}

async function insertar(tabla, filas) {
  if (!filas.length) return;
  const { error } = await supabase.from(tabla).insert(filas);
  if (error) throw new Error(`${tabla}: ${error.message}`);
}

class CursoIntroduccionService {
  static definicion = definicion;

  /**
   * Marca como "para toda la organización" el curso de introducción que ya
   * tiene la organización. Devuelve { marcado, cursoId } o { marcado: false }
   * si no lo tiene. Falla con un mensaje claro si la columna no existe.
   */
  static async marcarParaTodos(tenantId) {
    const ya = await CursoIntroduccionService.existente(tenantId);
    if (!ya) return { marcado: false, motivo: "sin curso" };
    const { error } = await supabase.from("courses").update({ para_todos: true }).eq("id", ya.id);
    if (error) {
      if (columnaFaltante(error)) {
        throw new Error("Falta la columna courses.para_todos: corre scripts/pendiente.sql primero.");
      }
      throw new Error(error.message);
    }
    return { marcado: true, cursoId: ya.id };
  }

  /** El curso de introducción que ya tiene la organización, o null. */
  static async existente(tenantId) {
    const { nombre } = definicion();
    const { data } = await supabase
      .from("courses").select("id, name").eq("tenant_id", tenantId).eq("name", nombre).maybeSingle();
    return data || null;
  }

  /**
   * Los videos del curso que ya están en la carpeta compartida del bucket de
   * materiales: { "archivo.mp4": { ruta, mime, tamano } }. Vacío si no hay
   * o si no se pudo listar (el curso se crea igual, sin material).
   */
  static async videosSubidos() {
    try {
      const { data, error } = await supabase.storage.from(BUCKET).list(CARPETA_VIDEOS, { limit: 100 });
      if (error || !data) return {};
      return Object.fromEntries(data.filter((f) => f.name.endsWith(".mp4")).map((f) => [f.name, {
        ruta: `${CARPETA_VIDEOS}/${f.name}`, mime: "video/mp4", tamano: f.metadata?.size ?? null,
      }]));
    } catch {
      return {};
    }
  }

  /**
   * Lo que se crearía en una organización, sin escribir nada: cuántas
   * secciones, actividades, materiales y preguntas.
   */
  static plan({ videos = {} } = {}) {
    const def = definicion();
    const actividades = def.secciones.flatMap((s) => s.actividades);
    return {
      curso: def.nombre,
      secciones: def.secciones.map((s) => ({
        nombre: s.nombre,
        actividades: s.actividades.map((a) => ({
          tipo: a.tipo, nombre: a.nombre, xp: a.xp,
          video: a.video ? (videos[a.video] ? `${a.video} (se registra)` : `${a.video} (sin subir)`) : null,
          preguntas: a.preguntas?.length ?? 0,
        })),
      })),
      totales: {
        secciones: def.secciones.length,
        actividades: actividades.length,
        materiales: actividades.filter((a) => a.video && videos[a.video]).length,
        preguntas: actividades.reduce((n, a) => n + (a.preguntas?.length ?? 0), 0),
        xp: actividades.reduce((n, a) => n + (a.xp || 0), 0),
      },
    };
  }

  /**
   * Crea el curso en la organización. `videos` es un mapa
   * { "01-primer-ingreso.mp4": { ruta, mime, tamano } } con lo ya subido al
   * bucket de materiales.
   */
  static async crearEn(tenantId, { videos } = {}) {
    if (!tenantId) throw new Error("Falta la organización (tenantId).");
    const ya = await CursoIntroduccionService.existente(tenantId);
    if (ya) return { creado: false, cursoId: ya.id };
    // Una organización nueva no trae videos: usa los que ya están subidos en
    // la carpeta compartida, si los hay.
    if (!videos) videos = await CursoIntroduccionService.videosSubidos();

    const def = definicion();
    const ahora = new Date().toISOString();
    const cursoId = id(3);

    // Primero todo lo que no es examen; las preguntas van después por
    // ExamenService.guardar, que valida y escribe el examen en una sola
    // transacción (función guardar_examen).
    const secciones = [];
    const actividades = [];
    const materiales = [];
    const examenes = [];

    def.secciones.forEach((s, i) => {
      const seccionId = id();
      secciones.push({ id: seccionId, course_id: cursoId, tenant_id: tenantId, name: s.nombre, orden: i, created_at: ahora });
      s.actividades.forEach((a, j) => {
        const actividadId = id(3);
        const fila = {
          id: actividadId, tenant_id: tenantId, section_id: seccionId, orden: j,
          name: a.nombre, title: a.titulo, description: a.descripcion,
          type: a.tipo, xp: a.xp, deliverable: false, adjunto: null, mime: null, created_at: ahora,
          // Un insert de varias filas manda null en las columnas que alguna
          // fila no trae, en vez de su DEFAULT: se fijan los valores por defecto.
          tiempo_limite: null, intentos_permitidos: 1, porcentaje_aprobacion: 70, mostrar_respuestas: true,
        };
        if (a.tipo === "Examen") {
          Object.assign(fila, {
            tiempo_limite: a.examen.tiempoLimite,
            intentos_permitidos: a.examen.intentosPermitidos,
            porcentaje_aprobacion: a.examen.porcentajeAprobacion,
            mostrar_respuestas: a.examen.mostrarRespuestas,
          });
          examenes.push({ actividadId, examen: a.examen, preguntas: a.preguntas || [] });
        }
        actividades.push(fila);
        const video = a.video && videos[a.video];
        if (video) {
          materiales.push({
            id: id(8), activity_id: actividadId, tenant_id: tenantId, nombre: a.video,
            ruta: video.ruta, mime: video.mime || "video/mp4", tamano: video.tamano ?? null, orden: 0, created_at: ahora,
          });
        }
      });
    });

    const fila = {
      id: cursoId, tenant_id: tenantId, name: def.nombre, instructor: null, grupo: null,
      status: "Abierto", actividades: [], archivado: false, created_at: ahora,
    };
    // Para toda la organización: lo tienen todos sus aprendices sin pasar por
    // grupos. Si la columna todavía no existe (scripts/pendiente.sql), se crea
    // sin ella, como antes, y el administrador lo asigna a sus grupos.
    try {
      await insertar("courses", [{ ...fila, para_todos: true }]);
    } catch (e) {
      if (!columnaFaltante(e)) throw e;
      await insertar("courses", [fila]);
    }
    try {
      await insertar("sections", secciones);
      await insertar("activities", actividades);
      await insertar("materiales", materiales);
      for (const ex of examenes) {
        await ExamenService.guardar(ex.actividadId, { role: "superadmin", tenantId: null }, {
          ...ex.examen,
          preguntas: ex.preguntas.map((p) => ({ enunciado: p.enunciado, opciones: p.opciones })),
        });
      }
    } catch (err) {
      // Sin curso a medias: si algo falla, se borra lo creado (las secciones se
      // van con el curso; las actividades, a mano, y con ellas su material).
      await supabase.from("activities").delete().in("id", actividades.map((a) => a.id));
      await supabase.from("courses").delete().eq("id", cursoId);
      throw err;
    }

    return {
      creado: true,
      cursoId,
      secciones: secciones.length,
      actividades: actividades.length,
      materiales: materiales.length,
      preguntas: examenes.reduce((n, e) => n + e.preguntas.length, 0),
    };
  }
}

module.exports = CursoIntroduccionService;
