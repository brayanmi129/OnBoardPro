// Pruebas de integración contra la base real.
//
//   node scripts/pruebas-integracion.js
//
// Las pruebas unitarias (tests/sprint-*) corren contra un Supabase falso en
// memoria: prueban la lógica, pero no lo que solo la base garantiza (el UNIQUE
// que impide cobrar dos veces, las funciones acreditar_xp, recalcular_xp,
// subir_nivel y otorgar_logro, la paginación real de PostgREST). Esto sí.
//
// Trabaja en la organización "Test" (tenants.name = 'Test'). Crea todo lo que
// necesita con un prefijo único —personas, grupo, cursos, actividades, un
// logro y, para probar el aislamiento, una segunda organización temporal— y
// lo borra SIEMPRE al final, falle lo que falle (try/finally).
//
// Deja los resultados en docs/pruebas/integracion/resultados.json y .md. Un
// caso que falla se reporta tal cual: este informe es evidencia, no adorno.
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { supabase } = require("../helpers/supabaseHelper.js");
const GamificationService = require("../services/gamificationService.js");
const ExamenService = require("../services/examenService.js");
const CourseService = require("../services/courseService.js");
const SectionService = require("../services/sectionService.js");
const MaterialService = require("../services/materialService.js");
const EntregaService = require("../services/entregaService.js");
const UserService = require("../services/userService.js");
const DashboardService = require("../services/dashboardService.js");
const NivelesService = require("../services/nivelesService.js");
const { umbralDe } = require("../helpers/niveles.js");

const SALIDA = path.join(__dirname, "..", "docs", "pruebas", "integracion");
const PREFIJO = `itest${Date.now().toString(36)}${crypto.randomBytes(2).toString("hex")}`;
const id = (sufijo) => `${PREFIJO}-${sufijo}`;

const casos = [];
const creado = {
  tenants: [], users: [], groups: [], courses: [], sections: [], activities: [],
  preguntas: [], opciones: [], materiales: [], entregas: [], logros: [],
};

function registrar({ id: casoId, grupo, que, esperado, obtenido, pasa, detalle }) {
  casos.push({ id: casoId, grupo, que, esperado, obtenido, pasa: Boolean(pasa), detalle: detalle ?? null });
  console.log(`${pasa ? "PASA   " : "NO PASA"}  ${casoId}  ${que}`);
}

/** Corre un caso; si revienta, queda registrado como "no pasa" con el error. */
async function caso(meta, fn) {
  try {
    const r = await fn();
    registrar({ ...meta, ...r });
  } catch (err) {
    registrar({ ...meta, obtenido: `Error: ${err.message}`, pasa: false });
  }
}

async function insertar(tabla, filas, lista) {
  const { error } = await supabase.from(tabla).insert(filas);
  if (error) throw new Error(`insert ${tabla}: ${error.message}`);
  if (lista) (Array.isArray(filas) ? filas : [filas]).forEach((f) => lista.push(f.id));
}

/** Espera un 404: el servicio lanza status 404 o devuelve null/{status:404}. */
async function es404(fn) {
  try {
    const r = await fn();
    if (r === null || r === undefined) return { ok: true, obtenido: "null (no encontrado)" };
    if (r?.status === 404) return { ok: true, obtenido: "404" };
    return { ok: false, obtenido: `devolvió datos: ${JSON.stringify(r).slice(0, 120)}` };
  } catch (err) {
    return { ok: err.status === 404, obtenido: `${err.status ?? "sin status"} ${err.message}` };
  }
}

async function contar(tabla, filtros) {
  let q = supabase.from(tabla).select("id", { count: "exact", head: true });
  for (const [c, v] of Object.entries(filtros)) q = q.eq(c, v);
  const { count, error } = await q;
  if (error) throw new Error(`count ${tabla}: ${error.message}`);
  return count ?? 0;
}

async function sumaXp(userId, soloActividades = false) {
  let q = supabase.from("xp_movimientos").select("xp, activity_id, logro_id").eq("user_id", userId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data || [])
    .filter((m) => !soloActividades || m.activity_id)
    .reduce((a, m) => a + (Number(m.xp) || 0), 0);
}

// ------------------------------------------------------------------ datos

async function preparar() {
  const { data: test, error } = await supabase.from("tenants").select("id, name").eq("name", "Test").maybeSingle();
  if (error) {
    // Sin conexión no hay nada que probar: se dice por qué, con el host, para
    // que no se confunda con un caso que falla.
    const sinRed = /fetch failed|ENOTFOUND|ECONNREFUSED/i.test(error.message);
    throw new Error(`No se pudo leer la base: ${error.message}${sinRed ? ` (no hay conexión con ${process.env.SUPABASE_URL}: revisá que el proyecto de Supabase no esté pausado y que la URL del .env sea la vigente)` : ''}`);
  }
  if (!test) throw new Error('No existe la organización "Test" (tenants.name = \'Test\').');
  const A = test.id;

  // La organización B es temporal: así el aislamiento se prueba sin tocar
  // datos de ningún cliente real.
  const B = id("orgb");
  await insertar("tenants", { id: B, name: `${PREFIJO} B`, domain: `${PREFIJO}.invalid`, active: true }, creado.tenants);

  const persona = (sufijo, tenant, role = "student") => ({
    id: id(sufijo), tenant_id: tenant, email: `${id(sufijo)}@itest.invalid`,
    firstname: `IT ${sufijo}`, lastname: PREFIJO, role, status: "Active", level: 0, xp: 0,
  });
  const u = {
    conc: persona("conc", A), exam: persona("exam", A), exam1: persona("exam1", A),
    nivel: persona("nivel", A), logro: persona("logro", A), aprA: persona("apra", A),
    adminA: persona("adma", A, "admin"),
    aprB: persona("aprb", B), adminB: persona("admb", B, "admin"),
  };
  await insertar("users", Object.values(u), creado.users);

  const curso = (sufijo, tenant) => ({ id: id(sufijo), tenant_id: tenant, name: `${PREFIJO} ${sufijo}`, status: "Abierto", archivado: false });
  const cA = curso("cursoa", A);
  const cB = curso("cursob", B);
  await insertar("courses", [cA, cB], creado.courses);
  const sA = { id: id("seca"), course_id: cA.id, tenant_id: A, name: "Sección A", orden: 0 };
  const sB = { id: id("secb"), course_id: cB.id, tenant_id: B, name: "Sección B", orden: 0 };
  await insertar("sections", [sA, sB], creado.sections);

  const tabla = await NivelesService.tablaDe(A);
  const xpNivel1 = umbralDe(1, tabla) ?? 100;

  const act = (sufijo, tenant, seccion, extra) => ({
    id: id(sufijo), tenant_id: tenant, section_id: seccion, name: sufijo, title: `${PREFIJO} ${sufijo}`,
    adjunto: "", type: "Recurso", deliverable: false, xp: 10, orden: 0,
    // Un insert de varias filas manda null en las columnas que alguna fila no
    // trae, en vez de su DEFAULT: se fijan los mismos valores por defecto.
    tiempo_limite: null, intentos_permitidos: 1, porcentaje_aprobacion: 70, mostrar_respuestas: true,
    ...extra,
  });
  const a = {
    r1: act("r1", A, sA.id),
    r2: act("r2", A, sA.id),
    rNivel: act("rnivel", A, sA.id, { xp: xpNivel1 }),
    ex: act("ex", A, sA.id, {
      type: "Examen", xp: 50, intentos_permitidos: 3, porcentaje_aprobacion: 70,
      tiempo_limite: null, mostrar_respuestas: true,
    }),
    rB: act("rb", B, sB.id),
    tB: act("tb", B, sB.id, { type: "Tarea", deliverable: true }),
  };
  await insertar("activities", Object.values(a), creado.activities);

  // Examen de 5 preguntas de 1 punto: 4 bien = 80%.
  const preguntas = [];
  const opciones = [];
  for (let i = 1; i <= 5; i++) {
    preguntas.push({ id: id(`p${i}`), activity_id: a.ex.id, enunciado: `Pregunta ${i}`, puntaje: 1, orden: i });
    opciones.push({ id: id(`p${i}ok`), pregunta_id: id(`p${i}`), texto: "Correcta", es_correcta: true, orden: 0 });
    opciones.push({ id: id(`p${i}no`), pregunta_id: id(`p${i}`), texto: "Incorrecta", es_correcta: false, orden: 1 });
  }
  await insertar("preguntas", preguntas, creado.preguntas);
  await insertar("opciones", opciones, creado.opciones);

  const gA = { id: id("grupoa"), tenant_id: A, name: `${PREFIJO} grupo A` };
  const gB = { id: id("grupob"), tenant_id: B, name: `${PREFIJO} grupo B` };
  await insertar("groups", [gA, gB], creado.groups);
  await insertar("groups_courses", [{ id_group: gA.id, id_course: cA.id }, { id_group: gB.id, id_course: cB.id }]);
  const deA = ["conc", "exam", "exam1", "nivel", "logro", "aprA"].map((k) => ({ id_user: u[k].id, id_group: gA.id }));
  await insertar("users_groups", [...deA, { id_user: u.aprB.id, id_group: gB.id }]);

  // Material y entrega de B, para intentar leerlos desde A.
  await insertar("materiales", {
    id: id("matb"), activity_id: a.rB.id, tenant_id: B, nombre: "manual.pdf",
    ruta: `${B}/${PREFIJO}-no-existe.pdf`, mime: "application/pdf", orden: 0,
  }, creado.materiales);
  await insertar("entregas", {
    id: id("entb"), activity_id: a.tB.id, user_id: u.aprB.id, tenant_id: B,
    estado: "entregado", comentario: "Entrega de B",
  }, creado.entregas);

  // Un logro de la organización A: se gana con 1 actividad completada.
  const logro = {
    id: id("logro"), tenant_id: A, nombre: `${PREFIJO} primera actividad`, descripcion: "Prueba de integración",
    categoria: "Progreso", tipo_condicion: "actividades_completadas", meta: 1, xp_recompensa: 5, activo: true,
  };
  await insertar("logros", logro, creado.logros);

  return { A, B, u, cA, cB, sA, sB, a, gA, logro, xpNivel1 };
}

// ------------------------------------------------------------------ casos

async function casosConcurrencia({ A, u, a }) {
  await caso({ id: "INT-01", grupo: "a) Concurrencia",
    que: "10 llamadas simultáneas a completarActividad (mismo usuario y actividad)",
    esperado: "1 éxito y 9 respuestas 409" }, async () => {
    const r = await Promise.allSettled(
      Array.from({ length: 10 }, () => GamificationService.completarActividad(u.conc.id, a.r1.id, A))
    );
    const ok = r.filter((x) => x.status === "fulfilled").length;
    const c409 = r.filter((x) => x.status === "rejected" && x.reason?.status === 409).length;
    const otros = r.filter((x) => x.status === "rejected" && x.reason?.status !== 409)
      .map((x) => `${x.reason?.status ?? "?"} ${x.reason?.message}`);
    return {
      obtenido: `${ok} éxito(s), ${c409} respuestas 409${otros.length ? `, otros errores: ${otros.join(" | ")}` : ""}`,
      pasa: ok === 1 && c409 === 9,
    };
  });

  await caso({ id: "INT-02", grupo: "a) Concurrencia",
    que: "Movimientos de XP registrados por esa actividad",
    esperado: "exactamente 1 fila en xp_movimientos" }, async () => {
    const n = await contar("xp_movimientos", { user_id: u.conc.id, activity_id: a.r1.id });
    return { obtenido: `${n} fila(s)`, pasa: n === 1 };
  });

  await caso({ id: "INT-03", grupo: "a) Concurrencia",
    que: "XP del usuario tras las 10 llamadas",
    esperado: `users.xp = suma del libro, y la actividad (${a.r1.xp} XP) sumada una sola vez` }, async () => {
    const { data: usr } = await supabase.from("users").select("xp").eq("id", u.conc.id).maybeSingle();
    const libro = await sumaXp(u.conc.id);
    const deActividades = await sumaXp(u.conc.id, true);
    return {
      obtenido: `users.xp = ${usr?.xp}, suma del libro = ${libro}, XP de actividades = ${deActividades} (el resto son logros)`,
      pasa: usr?.xp === libro && deActividades === a.r1.xp,
    };
  });
}

async function casosAislamiento({ A, B, u, a, cA, cB }) {
  const aprA = { id: u.aprA.id, email: u.aprA.email, role: "student", tenantId: A };
  const adminA = { id: u.adminA.id, email: u.adminA.email, role: "admin", tenantId: A };
  const intentos = [
    ["Curso de B (detalle)", () => CourseService.getById(cB.id, A)],
    ["Curso de B (participantes, aprendiz A)", () => CourseService.participantes(cB.id, aprA)],
    ["Secciones del curso de B (aprendiz A)", () => SectionService.listar(cB.id, A, { soloConContenido: true, aprendizId: aprA.id })],
    ["Secciones del curso de B (admin A)", () => SectionService.listar(cB.id, A)],
    ["Material de una actividad de B (aprendiz A)", () => MaterialService.listar(a.rB.id, aprA, { conUrl: false })],
    ["Material de una actividad de B (admin A)", () => MaterialService.listar(a.rB.id, adminA, { conUrl: false })],
    ["Entregas de una actividad de B (admin A)", () => EntregaService.listar(a.tB.id, adminA)],
    ["Archivo de una entrega de B (admin A)", () => EntregaService.urlArchivo(id("entb"), adminA)],
    // Revisar es solo del instructor: se intenta con un instructor de A.
    ["Revisar una entrega de B (instructor A)", () => EntregaService.revisar(id("entb"), { ...adminA, role: "instructor" }, { aprobada: true })],
    ["Usuario de B por correo (admin A)", () => UserService.getByEmail(u.aprB.email, A)],
    ["Editar un usuario de B (admin A)", () => UserService.updateUser(u.aprB.id, { firstname: "Hackeado" }, A, adminA)],
    ["Completar una actividad de B (aprendiz A)", () => GamificationService.completarActividad(aprA.id, a.rB.id, A)],
  ];
  let n = 4;
  for (const [que, fn] of intentos) {
    await caso({ id: `INT-${String(n++).padStart(2, "0")}`, grupo: "b) Aislamiento", que, esperado: "404 (como si no existiera)" },
      async () => {
        const r = await es404(fn);
        return { obtenido: r.obtenido, pasa: r.ok };
      });
  }

  await caso({ id: `INT-${String(n++).padStart(2, "0")}`, grupo: "b) Aislamiento",
    que: "El usuario de B sigue intacto tras el intento de edición desde A",
    esperado: `firstname = "${u.aprB.firstname}"` }, async () => {
    const { data } = await supabase.from("users").select("firstname").eq("id", u.aprB.id).maybeSingle();
    return { obtenido: `firstname = "${data?.firstname}"`, pasa: data?.firstname === u.aprB.firstname };
  });

  // El aprendiz de B gana XP para que tenga algo que filtrar.
  let dashAntes = null;
  try { dashAntes = await DashboardService.de(adminA, { dias: 7 }); } catch (err) { dashAntes = { error: err.message }; }
  await GamificationService.completarActividad(u.aprB.id, a.rB.id, B).catch(() => {});

  await caso({ id: `INT-${String(n++).padStart(2, "0")}`, grupo: "b) Aislamiento",
    que: "El ranking de A (siempre y semana) no incluye a nadie de B",
    esperado: "ningún id de la organización B" }, async () => {
    const { data: deB } = await supabase.from("users").select("id").eq("tenant_id", B);
    const idsB = new Set((deB || []).map((x) => x.id));
    const r1 = await GamificationService.getRanking(A, { actor: aprA });
    const r2 = await GamificationService.getRanking(A, { actor: aprA, periodo: "semana" });
    const colados = [...r1, ...r2].filter((f) => idsB.has(f.id)).length;
    return { obtenido: `${r1.length} filas (siempre), ${r2.length} (semana); de B: ${colados}`, pasa: colados === 0 && r1.length > 0 };
  });

  await caso({ id: `INT-${String(n++).padStart(2, "0")}`, grupo: "b) Aislamiento",
    que: "El tablero de A no cuenta datos de B",
    esperado: "usuarios = los de A; el XP que ganó B no cambia el XP de A; el curso de B no aparece" }, async () => {
    if (dashAntes?.error) throw new Error(dashAntes.error);
    const despues = await DashboardService.de(adminA, { dias: 7 });
    const { count: usuariosA } = await supabase.from("users").select("id", { count: "exact", head: true })
      .eq("tenant_id", A).neq("role", "superadmin");
    const cursoB = despues.cursosDetalle.some((c) => c.id === cB.id);
    const cursoA = despues.cursosDetalle.some((c) => c.id === cA.id);
    const ok = despues.usuarios.total === usuariosA
      && despues.xp.otorgadoPeriodo === dashAntes.xp.otorgadoPeriodo
      && !cursoB && cursoA;
    return {
      obtenido: `usuarios = ${despues.usuarios.total} (en la base: ${usuariosA}); XP periodo antes/después = ${dashAntes.xp.otorgadoPeriodo}/${despues.xp.otorgadoPeriodo}; curso de B listado: ${cursoB}; curso de A listado: ${cursoA}`,
      pasa: ok,
    };
  });
}

async function casosReglas({ A, u, a, logro, xpNivel1 }) {
  const actor = (k) => ({ id: u[k].id, email: u[k].email, role: "student", tenantId: A });
  const respuestas = (bien) => Array.from({ length: 5 }, (_, i) => ({
    preguntaId: id(`p${i + 1}`), opcionId: id(`p${i + 1}${i < bien ? "ok" : "no"}`),
  }));

  await caso({ id: "INT-19", grupo: "c) Reglas de gamificación",
    que: "Completar el mismo recurso dos veces", esperado: `1.ª: +${a.r2.xp} XP; 2.ª: 409; 1 movimiento` }, async () => {
    const r1 = await GamificationService.completarActividad(u.exam.id, a.r2.id, A);
    let segunda;
    try { await GamificationService.completarActividad(u.exam.id, a.r2.id, A); segunda = "200 (volvió a pagar)"; }
    catch (err) { segunda = String(err.status); }
    const n = await contar("xp_movimientos", { user_id: u.exam.id, activity_id: a.r2.id });
    return { obtenido: `1.ª: +${r1.xpGanado} XP; 2.ª: ${segunda}; ${n} movimiento(s)`, pasa: r1.xpGanado === a.r2.xp && segunda === "409" && n === 1 };
  });

  await caso({ id: "INT-20", grupo: "c) Reglas de gamificación",
    que: "Examen de 50 XP aprobado con 80% en el 1.er intento", esperado: "40 XP (proporcional a la nota)" }, async () => {
    await ExamenService.iniciar(a.ex.id, actor("exam1"));
    const r = await ExamenService.responder(a.ex.id, actor("exam1"), { respuestas: respuestas(4) });
    const { data: m } = await supabase.from("xp_movimientos").select("xp").eq("user_id", u.exam1.id).eq("activity_id", a.ex.id).maybeSingle();
    return { obtenido: `${r.porcentaje}%, aprobado=${r.aprobado}, XP acreditado ${r.xpAcreditado}, en el libro ${m?.xp}`, pasa: r.aprobado && m?.xp === 40 };
  });

  await caso({ id: "INT-21", grupo: "c) Reglas de gamificación",
    que: "Examen de 50 XP: 1.er intento 40% (reprobado), 2.º intento 80%",
    esperado: "1.º: 0 XP; 2.º: 20 XP (80% de 50, a la mitad por reintento)" }, async () => {
    await ExamenService.iniciar(a.ex.id, actor("exam"));
    const r1 = await ExamenService.responder(a.ex.id, actor("exam"), { respuestas: respuestas(2) });
    await ExamenService.iniciar(a.ex.id, actor("exam"));
    const r2 = await ExamenService.responder(a.ex.id, actor("exam"), { respuestas: respuestas(4) });
    const { data: m } = await supabase.from("xp_movimientos").select("xp, xp_base").eq("user_id", u.exam.id).eq("activity_id", a.ex.id).maybeSingle();
    return {
      obtenido: `1.º: ${r1.porcentaje}% aprobado=${r1.aprobado} XP ${r1.xpAcreditado}; 2.º: ${r2.porcentaje}% aprobado=${r2.aprobado} XP ${r2.xpAcreditado}; en el libro ${m?.xp}; aviso: ${r2.avisoXp ?? "-"}`,
      pasa: !r1.aprobado && r1.xpAcreditado === 0 && r2.aprobado && m?.xp === 20,
    };
  });

  await caso({ id: "INT-22", grupo: "c) Reglas de gamificación",
    que: "Un examen aprobado no se puede volver a rendir", esperado: "409 al iniciar un 3.er intento; sigue 1 movimiento" }, async () => {
    let r;
    try { await ExamenService.iniciar(a.ex.id, actor("exam")); r = "200"; } catch (err) { r = String(err.status); }
    const n = await contar("xp_movimientos", { user_id: u.exam.id, activity_id: a.ex.id });
    return { obtenido: `${r}; ${n} movimiento(s)`, pasa: r === "409" && n === 1 };
  });

  await caso({ id: "INT-23", grupo: "c) Reglas de gamificación",
    que: `Subida de nivel en la misma operación (actividad de ${xpNivel1} XP, el umbral del nivel 1)`,
    esperado: "subioDeNivel = true y users.level >= 1 al terminar la llamada" }, async () => {
    const r = await GamificationService.completarActividad(u.nivel.id, a.rNivel.id, A);
    const { data: usr } = await supabase.from("users").select("xp, level").eq("id", u.nivel.id).maybeSingle();
    return {
      obtenido: `subioDeNivel=${r.subioDeNivel}, nivel en la respuesta=${r.nivel}, en la base level=${usr?.level}, xp=${usr?.xp}`,
      pasa: r.subioDeNivel === true && (usr?.level ?? 0) >= 1 && r.nivel >= 1,
    };
  });

  await caso({ id: "INT-24", grupo: "c) Reglas de gamificación",
    que: "Logro de la organización (1 actividad completada, +5 XP) otorgado una sola vez",
    esperado: "se desbloquea en la 1.ª actividad, no en la 2.ª; 1 fila en logros_usuario y 1 movimiento del logro" }, async () => {
    const r1 = await GamificationService.completarActividad(u.logro.id, a.r1.id, A);
    const r2 = await GamificationService.completarActividad(u.logro.id, a.r2.id, A);
    const en1 = r1.logrosDesbloqueados.some((l) => l.id === logro.id);
    const en2 = r2.logrosDesbloqueados.some((l) => l.id === logro.id);
    const filas = await contar("logros_usuario", { user_id: u.logro.id, logro_id: logro.id });
    const movs = await contar("xp_movimientos", { user_id: u.logro.id, logro_id: logro.id });
    return {
      obtenido: `1.ª: ${en1 ? "desbloqueado" : "no"}; 2.ª: ${en2 ? "desbloqueado otra vez" : "no"}; logros_usuario=${filas}; movimientos del logro=${movs}`,
      pasa: en1 && !en2 && filas === 1 && movs === 1,
    };
  });
}

// ------------------------------------------------------------------ limpieza

async function limpiar() {
  const pasos = [];
  const borrar = async (tabla, col, ids) => {
    if (!ids.length) return;
    const { error } = await supabase.from(tabla).delete().in(col, ids);
    pasos.push(error ? `${tabla}: ERROR ${error.message}` : `${tabla}: ok`);
  };
  const users = creado.users;
  const acts = creado.activities;
  // Primero lo que cuelga de las personas y las actividades, después ellas.
  await borrar("intentos_examen", "user_id", users);
  await borrar("logros_usuario", "user_id", users);
  await borrar("xp_movimientos", "user_id", users);
  await borrar("entregas", "user_id", users);
  await borrar("users_groups", "id_user", users);
  await borrar("groups_courses", "id_course", creado.courses);
  await borrar("materiales", "activity_id", acts);
  await borrar("opciones", "id", creado.opciones);
  await borrar("preguntas", "id", creado.preguntas);
  await borrar("activities", "id", acts);
  await borrar("sections", "id", creado.sections);
  await borrar("courses", "id", creado.courses);
  await borrar("groups", "id", creado.groups);
  await borrar("logros", "id", creado.logros);
  await borrar("users", "id", users);
  await borrar("tenants", "id", creado.tenants);

  // Que no quede nada: se vuelve a contar lo creado.
  const restos = {};
  for (const [tabla, ids] of Object.entries(creado)) {
    if (!ids.length) continue;
    const { count, error } = await supabase.from(tabla).select("id", { count: "exact", head: true }).in("id", ids);
    restos[tabla] = error ? `error: ${error.message}` : count ?? 0;
  }
  const limpio = Object.values(restos).every((v) => v === 0);
  return { pasos, restos, limpio };
}

// ------------------------------------------------------------------ informe

function escribir({ inicio, fin, error, limpieza }) {
  fs.mkdirSync(SALIDA, { recursive: true });
  const pasan = casos.filter((c) => c.pasa).length;
  const host = (() => { try { return new URL(process.env.SUPABASE_URL).host; } catch { return "(sin SUPABASE_URL)"; } })();
  const resultado = {
    fecha: inicio.toISOString(),
    duracionMs: fin - inicio,
    entorno: {
      base: host,
      organizacion: "Test",
      node: process.version,
      prefijoDatos: PREFIJO,
    },
    ejecutado: casos.length > 0,
    errorGeneral: error ?? null,
    resumen: { total: casos.length, pasan, noPasan: casos.length - pasan },
    limpieza,
    casos,
  };
  fs.writeFileSync(path.join(SALIDA, "resultados.json"), JSON.stringify(resultado, null, 2) + "\n");

  const fila = (c) => `| ${c.id} | ${c.que.replace(/\|/g, "/")} | ${String(c.esperado).replace(/\|/g, "/")} | ${String(c.obtenido).replace(/\|/g, "/")} | ${c.pasa ? "Pasa" : "**No pasa**"} |`;
  const grupos = [...new Set(casos.map((c) => c.grupo))];
  const md = [
    "# Pruebas de integración contra la base real",
    "",
    `- **Fecha:** ${inicio.toISOString()} (duración ${((fin - inicio) / 1000).toFixed(1)} s)`,
    `- **Entorno:** base de desarrollo \`${host}\`, organización \`Test\` más una organización temporal para el aislamiento; Node ${process.version}`,
    `- **Datos de prueba:** prefijo \`${PREFIJO}\`, creados al inicio y borrados al final`,
    `- **Comando:** \`node scripts/pruebas-integracion.js\``,
    `- **Resultado:** ${pasan} de ${casos.length} casos pasan`,
    "",
    ...(error ? [`> **Error general:** ${error}`, ""] : []),
    ...grupos.flatMap((g) => [
      `## ${g}`, "",
      "| Caso | Qué se probó | Esperado | Obtenido | Resultado |",
      "|---|---|---|---|---|",
      ...casos.filter((c) => c.grupo === g).map(fila),
      "",
    ]),
    "## Limpieza",
    "",
    limpieza && Object.keys(limpieza.restos).length
      ? `${limpieza.limpio ? "Se borró todo lo creado." : "**Quedaron datos sin borrar:**"} Restos por tabla: \`${JSON.stringify(limpieza.restos)}\``
      : "No se llegó a crear nada.",
    "",
  ].join("\n");
  fs.writeFileSync(path.join(SALIDA, "resultados.md"), md);
  return resultado;
}

(async () => {
  const inicio = new Date();
  let errorGeneral = null;
  let limpieza = null;
  console.log(`Pruebas de integración · prefijo ${PREFIJO}\n`);
  try {
    const datos = await preparar();
    await casosConcurrencia(datos);
    await casosAislamiento(datos);
    await casosReglas(datos);
  } catch (err) {
    errorGeneral = err.message + (err.cause ? ` (${err.cause.code || err.cause.message})` : "");
    console.error(`\nError general: ${errorGeneral}`);
  } finally {
    try {
      limpieza = await limpiar();
    } catch (err) {
      limpieza = { pasos: [], restos: {}, limpio: false, error: err.message };
    }
  }

  const r = escribir({ inicio, fin: new Date(), error: errorGeneral, limpieza });
  console.log("");
  console.table(casos.map((c) => ({ caso: c.id, grupo: c.grupo, resultado: c.pasa ? "PASA" : "NO PASA", obtenido: String(c.obtenido).slice(0, 70) })));
  console.log(`\n${r.resumen.pasan}/${r.resumen.total} casos pasan. Limpieza: ${limpieza?.limpio ? "completa" : "INCOMPLETA " + JSON.stringify(limpieza?.restos)}`);
  console.log(`Resultados en ${path.relative(process.cwd(), SALIDA)}/resultados.{json,md}`);
  process.exitCode = errorGeneral || r.resumen.noPasan ? 1 : 0;
})();
