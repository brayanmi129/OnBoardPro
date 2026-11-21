// Quién tiene asignado qué curso.
//
// Un curso llega a un aprendiz por dos caminos:
//   - por grupo: el curso está en groups_courses y la persona en users_groups;
//   - por organización: el curso tiene para_todos = true y la persona es un
//     aprendiz activo de esa misma organización (también los que se registren
//     después, porque no se guarda una fila por persona).
//
// Todo lo que pregunta "¿esta persona tiene este curso?" o "¿quiénes tienen
// este curso?" pasa por acá, para que el acceso, Mis cursos, los pendientes,
// el ranking, los participantes y el panel cuenten a la misma gente.
//
// Mientras no se haya corrido scripts/pendiente.sql la columna para_todos no
// existe: se toma como si ningún curso fuera para toda la organización.
const { supabase } = require("./supabaseHelper.js");
const { porLotes } = require("./consultas.js");

function columnaFaltante(error) {
  if (!error) return false;
  return ["42703", "PGRST204"].includes(error.code) || /para_todos/.test(error.message || "");
}

/** Ids de los cursos para toda la organización de una organización (o de una lista de cursos). */
async function cursosParaTodos({ tenantId = null, cursoIds = null } = {}) {
  try {
    let filas;
    if (cursoIds) {
      if (!cursoIds.length) return new Set();
      filas = await porLotes(cursoIds, (lote) => supabase.from("courses")
        .select("id").in("id", lote).eq("para_todos", true).order("id", { ascending: true }));
    } else {
      if (!tenantId) return new Set();
      const { data, error } = await supabase.from("courses")
        .select("id").eq("tenant_id", tenantId).eq("para_todos", true);
      if (error) {
        if (columnaFaltante(error)) return new Set();
        throw new Error(error.message);
      }
      filas = data || [];
    }
    return new Set(filas.map((c) => c.id));
  } catch (e) {
    if (columnaFaltante(e)) return new Set();
    throw e;
  }
}

/** Si un curso es para toda la organización. */
async function esParaTodos(courseId) {
  return (await cursosParaTodos({ cursoIds: [courseId] })).has(courseId);
}

/**
 * Los cursos asignados a una persona: los de sus grupos y, si es un aprendiz
 * activo, los de su organización marcados para todos.
 */
async function cursosAsignados(userId) {
  const [{ data: grupos }, { data: persona }] = await Promise.all([
    supabase.from("users_groups").select("id_group").eq("id_user", userId),
    supabase.from("users").select("tenant_id, role, status").eq("id", userId).maybeSingle(),
  ]);
  const asignados = new Set();
  if (grupos?.length) {
    const { data: enlaces } = await supabase
      .from("groups_courses").select("id_course")
      .in("id_group", grupos.map((g) => g.id_group));
    for (const e of enlaces || []) asignados.add(e.id_course);
  }
  if (persona?.tenant_id && persona.role === "student" && persona.status !== "Inactive") {
    for (const id of await cursosParaTodos({ tenantId: persona.tenant_id })) asignados.add(id);
  }
  return asignados;
}

/** Aprendices activos de una organización. */
async function aprendicesDeOrganizacion(tenantId) {
  if (!tenantId) return [];
  const { data } = await supabase.from("users")
    .select("id, status").eq("tenant_id", tenantId).eq("role", "student");
  return (data || []).filter((u) => u.status !== "Inactive").map((u) => u.id);
}

/**
 * Quiénes tienen asignado un curso: los integrantes de sus grupos y, si es
 * para toda la organización, todos los aprendices activos de ella. Devuelve
 * ids sin repetir (el filtro por rol y estado lo hace quien llama, como antes).
 * `curso` necesita { id, tenant_id }.
 */
async function personasDeCurso(curso) {
  const { data: enlaces } = await supabase
    .from("groups_courses").select("id_group").eq("id_course", curso.id);
  const grupoIds = [...new Set((enlaces || []).map((e) => e.id_group))];
  const ids = new Set();
  if (grupoIds.length) {
    const { data: miembros } = await supabase
      .from("users_groups").select("id_user").in("id_group", grupoIds);
    for (const m of miembros || []) ids.add(m.id_user);
  }
  const paraTodos = await esParaTodos(curso.id);
  if (paraTodos) {
    let tenantId = curso.tenant_id;
    if (tenantId === undefined) {
      const { data } = await supabase.from("courses").select("tenant_id").eq("id", curso.id).maybeSingle();
      tenantId = data?.tenant_id;
    }
    for (const id of await aprendicesDeOrganizacion(tenantId)) ids.add(id);
  }
  return { ids: [...ids], grupoIds, paraTodos };
}

module.exports = {
  columnaFaltante, cursosParaTodos, esParaTodos, cursosAsignados, aprendicesDeOrganizacion, personasDeCurso,
};
