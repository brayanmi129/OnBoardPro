const { supabase } = require("./supabaseHelper.js");

function fallo(message, status) {
  const err = new Error(message);
  err.status = status;
  return err;
}

/**
 * El curso del que cuelga una actividad: actividad -> sección -> curso.
 *
 * Varios servicios necesitaban este mismo camino (quién la dicta, si el curso
 * está publicado) y cada uno lo escribía a mano. Null si la actividad no está
 * en ninguna sección, que pasa con las creadas antes de que existieran.
 */
async function cursoDeActividad(actividadId) {
  const { data: actividad } = await supabase
    .from("activities").select("section_id").eq("id", actividadId).maybeSingle();
  if (!actividad?.section_id) return null;

  const { data: seccion } = await supabase
    .from("sections").select("course_id").eq("id", actividad.section_id).maybeSingle();
  if (!seccion?.course_id) return null;

  const { data: curso } = await supabase
    .from("courses").select("id, name, instructor, status, archivado, tenant_id")
    .eq("id", seccion.course_id).maybeSingle();
  return curso || null;
}

/**
 * Frena al aprendiz si el curso no está publicado (HU-033).
 *
 * Solo al aprendiz: quien arma el curso tiene que poder probarlo antes de
 * abrirlo. El estado 'Cerrado' existía desde el principio, pero nada lo miraba
 * y un curso despublicado se podía seguir rindiendo igual.
 */
async function asegurarPublicado(actividadId, actor) {
  if (actor.role !== "student") return;
  // El curso y los cursos asignados a la persona no dependen uno del otro: se
  // piden a la vez para no sumar las dos esperas.
  const [curso, asignados] = await Promise.all([
    cursoDeActividad(actividadId),
    actor.id ? cursosAsignados(actor.id) : null,
  ]);
  if (curso && curso.status === "Cerrado") {
    throw fallo("Este curso no está publicado.", 409);
  }
  if (curso?.archivado) throw fallo("Este curso fue archivado.", 409);
  // Que sea de su empresa no alcanza: el aprendiz solo accede a los cursos
  // asignados a alguno de sus grupos (HU-035, HU-038).
  if (curso && asignados && !asignados.has(curso.id)) {
    throw fallo("Curso no encontrado", 404);
  }
}

/**
 * Los cursos asignados a la persona: por sus grupos o, si es aprendiz, por
 * ser para toda su organización (helpers/asignacion.js).
 */
async function cursosAsignados(userId) {
  return require("./asignacion.js").cursosAsignados(userId);
}

async function cursoAsignado(courseId, userId) {
  return (await cursosAsignados(userId)).has(courseId);
}

/**
 * Frena a un aprendiz que pide algo de un curso que no tiene asignado. Se
 * responde 404, igual que si no existiera: no le confirma que el curso está ahí.
 * Al resto de los roles no los afecta: sus permisos se miran en cada servicio.
 */
async function asegurarAsignado(courseId, actor) {
  if (actor.role !== "student") return;
  if (!(await cursoAsignado(courseId, actor.id))) throw fallo("Curso no encontrado", 404);
}

module.exports = { cursoDeActividad, asegurarPublicado, cursoAsignado, asegurarAsignado };
