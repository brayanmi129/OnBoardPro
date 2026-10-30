const crypto = require("crypto");
const { errorDeValidacion, detalleDeValidacion } = require("../helpers/validacion.js");
const { supabase } = require("../helpers/supabaseHelper.js");
const CourseSchema = require("../schemas/courseSchemas.js");
const { subirBanner, borrar, BANNERS, MATERIALES } = require("../helpers/storage.js");
const AvisoService = require("./avisoService.js");


// La base guarda tenant_id; la API expone tenantId, igual que en usuarios.
function aFila(d) {
  const o = { ...d };
  if ("tenantId" in o) { o.tenant_id = o.tenantId ?? null; delete o.tenantId; }
  return o;
}
function aObjeto(r) {
  if (!r) return null;
  const { tenant_id, banner_url, archivado, archivado_at, ...resto } = r;
  return {
    ...resto,
    tenantId: tenant_id ?? null,
    bannerUrl: banner_url ?? null,
    archivado: Boolean(archivado),
    archivadoAt: archivado_at ?? null,
  };
}

function fallo(message, status) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function presentarPersona(p) {
  return { id: p.id, email: p.email, firstname: p.firstname, lastname: p.lastname, role: p.role };
}

// El superadmin pasa null y ve todo; cualquier otro rol llega con el suyo.
function delTenant(query, tenantId) {
  return tenantId ? query.eq("tenant_id", tenantId) : query;
}


/**
 * Ids de las actividades de cada curso, sacados de sus secciones.
 *
 * La columna courses.actividades sigue existiendo por compatibilidad, pero ya
 * no manda: si se dejara como fuente, agregar una actividad a una sección no se
 * reflejaría ahí y las dos versiones se separarían sin que nadie lo note. Se
 * deriva en cada lectura, que es una consulta más y cero riesgo de desfase.
 *
 * Durante la migración las tablas pueden no existir todavía; en ese caso se
 * devuelve null y quien llama se queda con el valor guardado.
 */
async function actividadesPorCurso(courseIds) {
  if (!courseIds.length) return new Map();

  const { data: secciones, error } = await supabase
    .from("sections")
    .select("id, course_id, orden")
    .in("course_id", courseIds)
    .order("orden", { ascending: true });
  if (error) return null; // todavía no se creó la tabla

  const mapa = new Map(courseIds.map((id) => [id, []]));
  if (!secciones?.length) return mapa;

  const { data: actividades } = await supabase
    .from("activities")
    .select("id, section_id, orden")
    .in("section_id", secciones.map((s) => s.id))
    .order("orden", { ascending: true });

  for (const seccion of secciones) {
    const suyas = (actividades || []).filter((a) => a.section_id === seccion.id);
    mapa.get(seccion.course_id)?.push(...suyas.map((a) => a.id));
  }
  return mapa;
}

class CourseService {
  static PAGINA = 50;

  /**
   * Catálogo de cursos (HU-027).
   * `instructor` no es un filtro opcional del cliente: el controlador lo impone
   * cuando quien pregunta es un instructor, para que vea solo lo suyo.
   */
  static async getAll(tenantId = null, opciones = {}) {
    const { buscar, estado, instructor, archivados } = opciones;
    const porPagina = Math.min(Number(opciones.porPagina) || CourseService.PAGINA, 200);
    const pagina = Math.max(Number(opciones.pagina) || 1, 1);
    const desde = (pagina - 1) * porPagina;

    let query = supabase.from("courses").select("*", { count: "exact" });
    if (tenantId) query = query.eq("tenant_id", tenantId);
    if (instructor) query = query.eq("instructor", instructor);
    if (estado) query = query.eq("status", estado);
    // Los archivados salen del catálogo; se piden aparte para poder
    // desarchivarlos. `incluir` trae todo y `solo` únicamente los archivados.
    if (archivados === "solo") query = query.eq("archivado", true);
    else if (archivados !== "incluir") query = query.eq("archivado", false);
    if (buscar) query = query.ilike("name", `%${String(buscar).trim()}%`);

    const { data, error, count } = await query
      .order("name", { ascending: true })
      .range(desde, desde + porPagina - 1);
    if (error) throw new Error(error.message);

    const cursos = (data || []).map(aObjeto);

    const mapa = await actividadesPorCurso(cursos.map((c) => c.id));
    if (mapa) for (const c of cursos) c.actividades = mapa.get(c.id) || [];

    // El superadmin ve cursos de varias organizaciones mezclados y necesita
    // distinguirlas. Con el id solo (`tenant-uc`) no se puede mostrar nada
    // legible, así que se resuelve el nombre acá y no en cada cliente.
    const tenantIds = [...new Set(cursos.map((c) => c.tenantId).filter(Boolean))];
    if (tenantIds.length) {
      const { data: organizaciones } = await supabase
        .from("tenants").select("id, name").in("id", tenantIds);
      const porId = new Map((organizaciones || []).map((o) => [o.id, o.name]));
      for (const c of cursos) c.tenantName = porId.get(c.tenantId) ?? null;
    }

    return {
      cursos,
      total: count ?? cursos.length,
      pagina,
      porPagina,
      paginas: Math.max(Math.ceil((count ?? cursos.length) / porPagina), 1),
    };
  }

  static async getById(id, tenantId = null) {
    const { data } = await delTenant(
      supabase.from("courses").select("*").eq("id", id),
      tenantId
    ).maybeSingle();
    const curso = aObjeto(data);
    if (!curso) return curso;

    const mapa = await actividadesPorCurso([curso.id]);
    if (mapa) curso.actividades = mapa.get(curso.id) || [];

    return curso;
  }

  static async createCourse(courseData) {
    const customId = crypto.randomBytes(3).toString("hex");
    courseData.id = customId;

    const validation = CourseSchema.schema.safeParse(courseData);
    if (!validation.success) {
      throw errorDeValidacion(validation.error);
    }

    const course = validation.data;
    const { error } = await supabase.from("courses").insert(aFila(course));
    if (error) throw new Error(error.message);
    return course;
  }

  /**
   * El curso, si quien pregunta puede modificarlo. Un instructor solo toca los
   * que dicta: la misma regla que ya rige para sus actividades y exámenes.
   */
  static async _editable(id, actor) {
    const tenantId = actor.role === "superadmin" ? null : actor.tenantId;
    const { data: curso } = await delTenant(
      supabase.from("courses").select("*").eq("id", id),
      tenantId
    ).maybeSingle();
    if (!curso) throw fallo("Curso no encontrado", 404);

    if (actor.role === "instructor" && curso.instructor !== actor.email) {
      throw fallo("Este curso no lo dictás vos.", 403);
    }
    return curso;
  }

  /**
   * Edita un curso (HU-028). Solo cambia lo que se envía.
   *
   * La empresa nunca se edita: mover un curso de organización arrastraría sus
   * secciones, entregas y XP a otra empresa. El instructor tampoco se cambia a
   * sí mismo de curso; reasignarlo es tarea de un administrador.
   */
  static async actualizar(id, actor, datos) {
    const curso = await CourseService._editable(id, actor);

    const validacion = CourseSchema.actualizacion.safeParse(datos || {});
    if (!validacion.success) throw errorDeValidacion(validacion.error);
    const cambios = Object.fromEntries(
      Object.entries(validacion.data).filter(([, v]) => v !== undefined)
    );
    if (!Object.keys(cambios).length) throw fallo("No enviaste nada que cambiar.", 400);

    let nuevoInstructor = null;
    if (cambios.instructor && cambios.instructor !== curso.instructor) {
      if (actor.role === "instructor") {
        throw fallo("Solo un administrador puede reasignar el instructor de un curso.", 403);
      }
      nuevoInstructor = await CourseService._instructorValido(curso, cambios.instructor);
      // Se guarda el correo tal como está en usuarios: el permiso de editar se
      // compara contra ese valor y una mayúscula de más lo rompería.
      cambios.instructor = nuevoInstructor.email;
    }

    if (cambios.status === "Abierto" && curso.status !== "Abierto") {
      await CourseService._asegurarContenido(id);
    }

    const { error } = await supabase.from("courses").update(cambios).eq("id", id);
    if (error) throw new Error(error.message);

    if (nuevoInstructor) {
      AvisoService.instructorAsignado({ persona: nuevoInstructor, curso: { ...curso, ...cambios } });
    }

    return { message: "Curso actualizado", curso: await CourseService.getById(id, curso.tenant_id) };
  }

  /**
   * La persona que va a dictar el curso, buscada por correo o por id.
   *
   * Antes se aceptaba cualquier correo y un curso podía quedar a cargo de
   * alguien que no existía. Tiene que ser alguien activo de la misma empresa
   * que pueda dictar: un instructor, o un administrador que dicte él mismo.
   */
  static async _instructorValido(curso, valor) {
    const clave = String(valor || "").trim();
    if (!clave) throw fallo("Indicá el correo o el id del instructor.", 400);

    let q = supabase.from("users").select("id, email, firstname, lastname, role, status");
    q = clave.includes("@") ? q.eq("email", clave.toLowerCase()) : q.eq("id", clave);
    if (curso.tenant_id) q = q.eq("tenant_id", curso.tenant_id);
    const { data: persona } = await q.maybeSingle();

    if (!persona) throw fallo("No hay nadie con ese correo o id en la organización del curso.", 400);
    if (!["instructor", "admin"].includes(persona.role)) {
      throw fallo("Solo un instructor o un administrador puede dictar un curso.", 400);
    }
    if (persona.status === "Inactive") {
      throw fallo("Esa persona está desactivada y no puede dictar cursos.", 400);
    }
    return persona;
  }

  /**
   * Cambia quién dicta un curso (HU-030). Solo lo hace un administrador.
   *
   * Lo que el instructor anterior dejó armado (secciones, actividades,
   * exámenes) se queda en el curso: es del curso, no de la persona. Y las
   * entregas pendientes pasan a revisarlas quien llega, porque el permiso de
   * revisar sale de `courses.instructor`.
   */
  static async asignarInstructor(id, actor, valor) {
    const curso = await CourseService._editable(id, actor);
    const persona = await CourseService._instructorValido(curso, valor);

    if (persona.email === curso.instructor) {
      return { message: "Esa persona ya dicta este curso.", instructor: presentarPersona(persona) };
    }

    const { error } = await supabase.from("courses").update({ instructor: persona.email }).eq("id", id);
    if (error) throw new Error(error.message);

    AvisoService.instructorAsignado({ persona, curso });

    return {
      message: "Instructor asignado.",
      anterior: curso.instructor || null,
      instructor: presentarPersona(persona),
    };
  }

  /** Un curso sin ninguna actividad no se publica: el aprendiz entraría a una página vacía. */
  static async _asegurarContenido(id) {
    const mapa = await actividadesPorCurso([id]);
    if (mapa && !(mapa.get(id) || []).length) {
      throw fallo("No se puede publicar un curso sin actividades.", 409);
    }
  }

  /**
   * Publica o despublica un curso (HU-033).
   *
   * Despublicar no borra nada: el aprendiz deja de verlo y de poder rendirlo,
   * pero su progreso y su XP siguen ahí para cuando se vuelva a abrir.
   */
  static async publicar(id, actor, publicado) {
    if (typeof publicado !== "boolean") {
      throw fallo("Indicá con `publicado: true` o `false` si el curso queda visible.", 400);
    }
    const curso = await CourseService._editable(id, actor);
    const status = publicado ? "Abierto" : "Cerrado";

    if (curso.status === status) {
      return { message: publicado ? "El curso ya estaba publicado." : "El curso ya estaba despublicado.", status };
    }
    if (publicado) await CourseService._asegurarContenido(id);

    const { error } = await supabase.from("courses").update({ status }).eq("id", id);
    if (error) throw new Error(error.message);

    return { message: publicado ? "Curso publicado." : "Curso despublicado.", status };
  }

  /** Las actividades del curso, recorriendo sus secciones. */
  static async _actividadesDe(courseId) {
    const { data: secciones } = await supabase
      .from("sections").select("id").eq("course_id", courseId);
    if (!secciones?.length) return [];
    const { data: actividades } = await supabase
      .from("activities").select("id, adjunto")
      .in("section_id", secciones.map((s) => s.id));
    return actividades || [];
  }

  /**
   * Qué se pierde si se borra el curso (criterio 1 de HU-029): se muestra en
   * la confirmación, antes de borrar. Lo más importante es cuántos aprendices
   * lo tienen asignado: borrarle el curso a gente que lo está haciendo no es lo
   * mismo que borrar uno que nadie empezó.
   */
  static async impacto(id, actor) {
    const curso = await CourseService._editable(id, actor);

    const [{ data: grupos }, { count: secciones }, actividades] = await Promise.all([
      supabase.from("groups_courses").select("id_group").eq("id_course", id),
      supabase.from("sections").select("id", { count: "exact", head: true }).eq("course_id", id),
      CourseService._actividadesDe(id),
    ]);

    let aprendices = 0;
    if (grupos?.length) {
      const { data: integrantes } = await supabase
        .from("users_groups").select("id_user").in("id_group", grupos.map((g) => g.id_group));
      const ids = [...new Set((integrantes || []).map((i) => i.id_user))];
      if (ids.length) {
        const { count } = await supabase.from("users").select("id", { count: "exact", head: true })
          .in("id", ids).eq("role", "student");
        aprendices = count ?? 0;
      }
    }

    const actIds = actividades.map((a) => a.id);
    const [{ count: entregas }, { count: intentos }, { count: completadas }] = actIds.length
      ? await Promise.all([
          supabase.from("entregas").select("id", { count: "exact", head: true }).in("activity_id", actIds),
          supabase.from("intentos_examen").select("id", { count: "exact", head: true }).in("activity_id", actIds),
          supabase.from("xp_movimientos").select("id", { count: "exact", head: true }).in("activity_id", actIds),
        ])
      : [{ count: 0 }, { count: 0 }, { count: 0 }];

    return {
      curso: { id: curso.id, nombre: curso.name, archivado: Boolean(curso.archivado) },
      aprendices,
      grupos: grupos?.length ?? 0,
      secciones: secciones ?? 0,
      actividades: actIds.length,
      entregas: entregas ?? 0,
      intentosDeExamen: intentos ?? 0,
      actividadesCompletadas: completadas ?? 0,
    };
  }

  /**
   * Archiva o desarchiva un curso (HU-029).
   *
   * Es lo que se recomienda antes que borrar (criterio 2): el curso deja de
   * verse para los aprendices y sale del catálogo, pero se conserva el
   * histórico de progreso, las entregas y el XP. Se puede deshacer.
   */
  static async archivar(id, actor, archivado) {
    if (typeof archivado !== "boolean") {
      throw fallo("Indicá con `archivado: true` o `false` si el curso queda archivado.", 400);
    }
    const curso = await CourseService._editable(id, actor);
    if (Boolean(curso.archivado) === archivado) {
      return { message: archivado ? "El curso ya estaba archivado." : "El curso no estaba archivado.", archivado };
    }

    const { error } = await supabase.from("courses").update({
      archivado,
      archivado_at: archivado ? new Date().toISOString() : null,
    }).eq("id", id);
    if (error) throw new Error(error.message);

    return { message: archivado ? "Curso archivado." : "Curso desarchivado.", archivado };
  }

  /**
   * Borra el curso para siempre, con todo su contenido y sus archivos.
   *
   * Las secciones se van solas con el curso (CASCADE), pero las actividades
   * no: su sección pasa a NULL y quedarían huérfanas, con sus entregas y sus
   * archivos. Por eso se borran a mano, y con ellas en cascada sus entregas,
   * preguntas, intentos y material. Los archivos de Storage no los borra la
   * base: se juntan antes, porque después ya no hay de dónde sacar las rutas.
   *
   * El XP que la gente ganó se conserva: el movimiento pierde la referencia a
   * la actividad (SET NULL) pero sigue sumando.
   */
  static async eliminar(id, actor) {
    const curso = await CourseService._editable(id, actor);
    const actividades = await CourseService._actividadesDe(id);
    const actIds = actividades.map((a) => a.id);

    const [{ data: materiales }, { data: entregas }] = actIds.length
      ? await Promise.all([
          supabase.from("materiales").select("ruta").in("activity_id", actIds),
          supabase.from("entregas").select("archivo").in("activity_id", actIds),
        ])
      : [{ data: [] }, { data: [] }];

    const archivos = [...new Set([
      ...actividades.map((a) => a.adjunto),
      ...(materiales || []).map((m) => m.ruta),
      ...(entregas || []).map((e) => e.archivo),
    ].filter((r) => r && !/^https?:\/\//i.test(r)))];

    if (actIds.length) {
      const { error } = await supabase.from("activities").delete().in("id", actIds);
      if (error) throw new Error(error.message);
    }
    const { error } = await supabase.from("courses").delete().eq("id", id);
    if (error) throw new Error(error.message);

    // Recién con la base limpia: si algo de arriba fallaba, los archivos
    // seguían siendo de alguien. Storage acepta varios por llamada.
    let archivosBorrados = 0;
    for (let i = 0; i < archivos.length; i += 100) {
      const lote = archivos.slice(i, i + 100);
      const { error: e } = await supabase.storage.from(MATERIALES).remove(lote);
      if (e) console.warn("[curso] no se borraron archivos del material:", e.message);
      else archivosBorrados += lote.length;
    }
    const portada = curso.banner_url?.split("/banners/")[1];
    if (portada) {
      await borrar(BANNERS, portada);
      archivosBorrados += 1;
    }

    return {
      message: "Curso eliminado.",
      actividades: actIds.length,
      archivosBorrados,
    };
  }

  /**
   * Cambia la portada del curso. Solo se toca la base después de que Storage
   * confirmó la subida: al revés quedaría una URL apuntando a la nada.
   */
  static async guardarBanner(id, tenantId, archivo) {
    const { data: curso } = await delTenant(
      supabase.from("courses").select("id, banner_url").eq("id", id),
      tenantId
    ).maybeSingle();
    if (!curso) return { error: "Curso no encontrado" };

    const { ruta, url } = await subirBanner({
      tenantId,
      buffer: archivo.buffer,
      nombreOriginal: archivo.originalname,
      mime: archivo.mimetype,
    });

    const { error } = await supabase.from("courses").update({ banner_url: url }).eq("id", id);
    if (error) {
      // No dejamos huérfano el archivo si la base falla.
      await borrar(BANNERS, ruta);
      return { error: error.message };
    }

    // La portada anterior ya no la referencia nadie.
    if (curso.banner_url) {
      const vieja = curso.banner_url.split("/banners/")[1];
      if (vieja) await borrar(BANNERS, vieja);
    }

    return { bannerUrl: url };
  }

  /**
   * Los cursos asignados a una persona por sus grupos.
   *
   * `soloPublicados` deja fuera los despublicados (HU-033): el aprendiz no ve
   * un curso cerrado aunque su grupo lo tenga asignado.
   */
  static async getByUser(userId, { soloPublicados = false } = {}) {
    const { data: userGroups } = await supabase
      .from("users_groups")
      .select("id_group")
      .eq("id_user", userId);

    if (!userGroups?.length) return [];

    const groupIds = userGroups.map((ug) => ug.id_group);

    const { data: groupCourses } = await supabase
      .from("groups_courses")
      .select("id_course")
      .in("id_group", groupIds);

    if (!groupCourses?.length) return [];

    const courseIds = [...new Set(groupCourses.map((gc) => gc.id_course))];

    let q = supabase.from("courses").select("*").in("id", courseIds);
    // Un curso archivado ya no se dicta: no aparece en "mis cursos" de nadie.
    q = q.eq("archivado", false);
    if (soloPublicados) q = q.eq("status", "Abierto");
    const { data: courses } = await q;
    if (!courses?.length) return [];

    const progreso = await CourseService._progresoDe(userId, courses.map((c) => c.id));
    return courses.map((c) => ({ ...aObjeto(c), progreso: progreso.get(c.id) }));
  }

  /**
   * Cuánto lleva una persona en cada curso (HU-031): actividades hechas sobre
   * el total. Hecha es la que ya tiene su movimiento en el libro de XP, que
   * es lo mismo que marca "completada" en la pantalla del curso.
   */
  static async _progresoDe(userId, courseIds) {
    const vacio = () => ({ hechas: 0, total: 0, porcentaje: 0 });
    const resultado = new Map(courseIds.map((id) => [id, vacio()]));

    const { data: secciones } = await supabase
      .from("sections").select("id, course_id").in("course_id", courseIds);
    if (!secciones?.length) return resultado;

    const { data: actividades } = await supabase
      .from("activities").select("id, section_id")
      .in("section_id", secciones.map((s) => s.id));
    if (!actividades?.length) return resultado;

    const { data: hechas } = await supabase
      .from("xp_movimientos").select("activity_id")
      .eq("user_id", userId).in("activity_id", actividades.map((a) => a.id));
    const completadas = new Set((hechas || []).map((m) => m.activity_id));

    const cursoDeSeccion = new Map(secciones.map((s) => [s.id, s.course_id]));
    for (const a of actividades) {
      const p = resultado.get(cursoDeSeccion.get(a.section_id));
      if (!p) continue;
      p.total += 1;
      if (completadas.has(a.id)) p.hechas += 1;
    }
    for (const p of resultado.values()) {
      p.porcentaje = p.total ? Math.round((p.hechas * 100) / p.total) : 0;
    }
    return resultado;
  }
}

module.exports = CourseService;
