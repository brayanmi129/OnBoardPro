const crypto = require("crypto");
const { errorDeValidacion, detalleDeValidacion } = require("../helpers/validacion.js");
const { supabase } = require("../helpers/supabaseHelper.js");
const { subirMaterial, urlFirmada, borrar, MATERIALES } = require("../helpers/storage.js");
const activitieSchema = require("../schemas/activitieSchema.js");
const { xpDeActividad } = require("../helpers/niveles.js");
const AvisoService = require("./avisoService.js");

// La base guarda tenant_id; la API expone tenantId, igual que en el resto.
function aFila(d) {
  const o = { ...d };
  if ("tenantId" in o) { o.tenant_id = o.tenantId ?? null; delete o.tenantId; }
  if ("sectionId" in o) { o.section_id = o.sectionId ?? null; delete o.sectionId; }
  return o;
}
function aObjeto(r) {
  if (!r) return null;
  const { tenant_id, section_id, ...resto } = r;
  return { ...resto, tenantId: tenant_id ?? null, sectionId: section_id ?? null };
}
function delTenant(query, tenantId) {
  return tenantId ? query.eq("tenant_id", tenantId) : query;
}

/**
 * Un recurso no pide entrega.
 *
 * Un recurso es material que se consume —un PDF, un video— y se da por visto
 * marcandolo como completado. Pedirle una entrega dejaba actividades que el
 * aprendiz no podia cerrar por ningun camino: ni subiendo archivo, porque el
 * boton de completar solo acepta recursos, ni marcandolas, porque esperaban
 * una entrega que nadie iba a revisar.
 */
function comprobarEntregable(type, deliverable) {
  if (type === "Recurso" && deliverable === true) {
    const err = new Error(
      "Un recurso no puede pedir entrega: solo las tareas y los exámenes."
    );
    err.status = 400;
    throw err;
  }
}

class ActivitiesService {
  static async getAll(tenantId = null) {
    const { data, error } = await delTenant(supabase.from("activities").select("*"), tenantId);
    if (error) throw new Error(error.message);

    // No se devuelve el adjunto firmado en el listado: firmar N archivos en
    // cada consulta es caro y casi nunca se abren todos. Se pide por actividad.
    const actividades = (data || []).map(aObjeto);

    // Sin esto el cliente recibe un sectionId suelto y no puede decir a qué
    // sección ni a qué curso pertenece la actividad sin pedir el árbol entero.
    const seccionIds = [...new Set(actividades.map((a) => a.sectionId).filter(Boolean))];
    if (!seccionIds.length) return actividades;

    const { data: secciones } = await supabase
      .from("sections").select("id, name, course_id").in("id", seccionIds);
    const cursoIds = [...new Set((secciones || []).map((x) => x.course_id))];
    const { data: cursos } = cursoIds.length
      ? await supabase.from("courses").select("id, name").in("id", cursoIds)
      : { data: [] };

    const porSeccion = new Map((secciones || []).map((x) => [x.id, x]));
    const porCurso = new Map((cursos || []).map((c) => [c.id, c.name]));

    return actividades.map((a) => {
      const sec = a.sectionId ? porSeccion.get(a.sectionId) : null;
      return {
        ...a,
        sectionName: sec?.name ?? null,
        courseId: sec?.course_id ?? null,
        courseName: sec ? porCurso.get(sec.course_id) ?? null : null,
      };
    });
  }

  static async create(data, file) {
    const actividad = { ...data, id: crypto.randomBytes(3).toString("hex") };

    // Si no se indica, el XP sale del tipo. Así una actividad recién creada ya
    // otorga puntos sin que nadie tenga que configurarla.
    actividad.xp = xpDeActividad(actividad);

    // Se comprueba antes de subir nada: si la sección no sirve, no tiene
    // sentido dejar un archivo huérfano en Storage para después borrarlo.
    if (actividad.sectionId) {
      const { data: seccion } = await supabase
        .from("sections")
        .select("id, tenant_id")
        .eq("id", actividad.sectionId)
        .maybeSingle();
      // Una sección de otra empresa se responde igual que una inexistente.
      if (!seccion || (data.tenantId && seccion.tenant_id !== data.tenantId)) {
        const err = new Error("Sección no encontrada");
        err.status = 404;
        throw err;
      }
      // Al final de su sección.
      const { count } = await supabase
        .from("activities")
        .select("id", { count: "exact", head: true })
        .eq("section_id", actividad.sectionId);
      actividad.orden = count ?? 0;
    }

    // El archivo va primero: si Storage falla, no queda una fila apuntando a
    // un adjunto que no existe.
    let rutaSubida = null;
    if (file) {
      const { ruta } = await subirMaterial({
        tenantId: data.tenantId,
        buffer: file.buffer,
        nombreOriginal: file.originalname,
        mime: file.mimetype,
      });
      rutaSubida = ruta;
      actividad.adjunto = ruta;
      actividad.mime = file.mimetype;
    }

    comprobarEntregable(actividad.type ?? "Recurso", actividad.deliverable);

    const validation = activitieSchema.schema.safeParse(actividad);
    if (!validation.success) {
      if (rutaSubida) await borrar(MATERIALES, rutaSubida);
      throw errorDeValidacion(validation.error);
    }

    const { error } = await supabase.from("activities").insert(aFila(validation.data));
    if (error) {
      if (rutaSubida) await borrar(MATERIALES, rutaSubida);
      throw new Error(error.message);
    }

    // El archivo que vino con la actividad entra también en `materiales`, que
    // es donde vive el material desde HU-037. Sin esto la actividad se crea
    // con adjunto pero su detalle aparece sin nada.
    if (rutaSubida) {
      await supabase.from("materiales").insert({
        id: crypto.randomBytes(8).toString("hex"),
        activity_id: validation.data.id,
        tenant_id: validation.data.tenantId ?? null,
        nombre: file.originalname,
        ruta: rutaSubida,
        mime: file.mimetype,
        tamano: file.size ?? null,
        orden: 0,
      });
    }

    // Sin await: quien crea la actividad no tiene por qué esperar a que salgan
    // los correos, y que el envío falle no debe hacer fallar la creación.
    AvisoService.actividadNueva({
      actividad: validation.data,
      sectionId: validation.data.sectionId,
    });

    return validation.data;
  }

  /**
   * Busca una actividad comprobando que quien pregunta pueda tocarla.
   *
   * Criterio 1 de HU-036: un instructor solo alcanza las actividades de los
   * cursos que dicta. El vínculo no es directo —la actividad cuelga de una
   * sección y la sección de un curso— así que hay que recorrerlo.
   * Un admin o un superadmin no tienen esa restricción dentro de su alcance.
   */
  static async _alAlcanceDe(id, actor) {
    const tenantId = actor?.role === "superadmin" ? null : actor?.tenantId;
    const { data: actividad } = await delTenant(
      supabase.from("activities").select("*").eq("id", id),
      tenantId
    ).maybeSingle();
    if (!actividad) {
      const err = new Error("Actividad no encontrada");
      err.status = 404;
      throw err;
    }

    if (actor?.role !== "instructor") return actividad;

    // Sin sección no pertenece a ningún curso, así que ningún instructor la
    // tiene asignada.
    if (!actividad.section_id) {
      const err = new Error("Esta actividad no pertenece a un curso que dictes.");
      err.status = 403;
      throw err;
    }

    const { data: seccion } = await supabase
      .from("sections").select("course_id").eq("id", actividad.section_id).maybeSingle();
    const { data: curso } = seccion
      ? await supabase.from("courses").select("instructor").eq("id", seccion.course_id).maybeSingle()
      : { data: null };

    if (!curso || curso.instructor !== actor.email) {
      const err = new Error("Esta actividad no pertenece a un curso que dictes.");
      err.status = 403;
      throw err;
    }
    return actividad;
  }

  /**
   * Edita una actividad. El archivo es opcional: si viene uno nuevo reemplaza
   * al anterior y el viejo se borra del bucket, porque nadie más lo referencia.
   */
  static async actualizar(id, datos, file, actor) {
    const actual = await ActivitiesService._alAlcanceDe(id, actor);

    // Lista blanca: la empresa, la sección y el orden no se cambian por acá.
    // Mover una actividad de sección es otra operación, y la empresa no se
    // toca nunca desde el cliente.
    const EDITABLES = ["name", "title", "type", "description", "deliverable", "xp"];
    const cambios = {};
    for (const campo of EDITABLES) {
      if (datos?.[campo] !== undefined) cambios[campo] = datos[campo];
    }
    // El tipo que vale es el que queda despues del cambio: cambiar una tarea
    // entregable a recurso tiene que fallar igual que marcar entregable un
    // recurso que ya lo era.
    comprobarEntregable(
      cambios.type ?? actual.type,
      cambios.deliverable ?? actual.deliverable
    );

    // Cambiar el tipo de algo que ya se usó lo deja incoherente: un examen
    // rendido que pasa a recurso conserva intentos que nadie puede ver, y una
    // tarea con entregas que pasa a examen deja esas entregas sin dueño.
    if (cambios.type && cambios.type !== actual.type) {
      const [{ count: preguntas }, { count: intentos }, { count: entregas }] = await Promise.all([
        supabase.from("preguntas").select("id", { count: "exact", head: true }).eq("activity_id", id),
        supabase.from("intentos_examen").select("id", { count: "exact", head: true }).eq("activity_id", id),
        supabase.from("entregas").select("id", { count: "exact", head: true }).eq("activity_id", id),
      ]);
      if (preguntas || intentos || entregas) {
        const err = new Error(
          `No se puede cambiar el tipo: esta actividad ya tiene ${
            entregas ? "entregas" : intentos ? "intentos de examen" : "preguntas"
          }. Creá una actividad nueva del otro tipo.`
        );
        err.status = 409;
        throw err;
      }
    }

    let rutaNueva = null;
    if (file) {
      const { ruta } = await subirMaterial({
        tenantId: actual.tenant_id,
        buffer: file.buffer,
        nombreOriginal: file.originalname,
        mime: file.mimetype,
      });
      rutaNueva = ruta;
      cambios.adjunto = ruta;
      cambios.mime = file.mimetype;
    }

    if (!Object.keys(cambios).length) {
      const err = new Error("No enviaste ningún dato para cambiar.");
      err.status = 400;
      throw err;
    }

    const validation = activitieSchema.schema.partial().safeParse(cambios);
    if (!validation.success) {
      if (rutaNueva) await borrar(MATERIALES, rutaNueva);
      throw errorDeValidacion(validation.error);
    }

    const { error } = await supabase
      .from("activities").update(aFila(validation.data)).eq("id", id);
    if (error) {
      if (rutaNueva) await borrar(MATERIALES, rutaNueva);
      throw new Error(error.message);
    }

    // Recién ahora: si la escritura hubiera fallado, el archivo viejo sigue
    // siendo el bueno.
    if (rutaNueva && actual.adjunto && actual.adjunto !== rutaNueva) {
      await borrar(MATERIALES, actual.adjunto);
    }

    return { message: "Actividad actualizada", cambios: validation.data };
  }

  /**
   * Elimina la actividad y su archivo. Se borra primero la fila: si fallara el
   * archivo quedaría un huérfano en Storage, molesto pero inofensivo; al revés
   * quedaría una actividad apuntando a un adjunto que ya no existe.
   */
  static async eliminar(id, actor) {
    // Mismo alcance que editar: un instructor no borra lo de otro curso.
    const data = await ActivitiesService._alAlcanceDe(id, actor);

    // La base borra en cascada las filas que cuelgan de la actividad
    // (materiales, entregas, preguntas, intentos), pero no los archivos de
    // Storage: hay que juntar sus rutas antes, porque después ya no existen.
    const [{ data: materiales }, { data: entregas }] = await Promise.all([
      supabase.from("materiales").select("ruta").eq("activity_id", id),
      supabase.from("entregas").select("archivo").eq("activity_id", id),
    ]);

    const { error } = await supabase.from("activities").delete().eq("id", id);
    if (error) throw new Error(error.message);

    // El XP que ya se ganó con ella se queda: el movimiento pierde la
    // referencia (ON DELETE SET NULL) pero sigue sumando.
    const rutas = [
      data.adjunto,
      ...(materiales || []).map((m) => m.ruta),
      ...(entregas || []).map((e) => e.archivo),
    ].filter(Boolean);
    for (const ruta of rutas) await borrar(MATERIALES, ruta);

    return { message: "Actividad eliminada" };
  }

  /** URL temporal del adjunto, solo si la actividad es de la empresa que pregunta. */
  static async urlAdjunto(id, tenantId = null) {
    const { data } = await delTenant(
      supabase.from("activities").select("adjunto").eq("id", id),
      tenantId
    ).maybeSingle();
    if (!data?.adjunto) return null;
    return urlFirmada(data.adjunto);
  }
}

module.exports = ActivitiesService;
