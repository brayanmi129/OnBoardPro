// Sprint 9 · Asignar instructor (HU-030), ver mis cursos (HU-031), tabla de
// niveles (HU-053) y condición de una medalla (HU-060).
const { preparar, estado } = require("../soporte/supabaseFalso.js");
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const AvisoService = require("../../services/avisoService.js");
const CourseService = require("../../services/courseService.js");
const NivelesService = require("../../services/nivelesService.js");
const LogroService = require("../../services/logroService.js");
const DesbloqueoService = require("../../services/desbloqueoService.js");
const { nivelPara, progreso, progresoEn } = require("../../helpers/niveles.js");

AvisoService.instructorAsignado = () => {}; // sin correos

const admin = { id: "u-admin", role: "admin", tenantId: "t1", email: "admin@t1.com" };
const falla = (fn, status, texto) =>
  assert.throws(fn, (e) => e.status === status && (!texto || e.message.includes(texto)));

describe("Asignar instructor a un curso", () => {
  const base = () => preparar({
    tablas: {
      courses: [{ id: "c1", tenant_id: "t1", name: "Inducción", instructor: "inst@t1.com" }],
      users: [
        { id: "u-inst", email: "inst@t1.com", role: "instructor", status: "Active", tenant_id: "t1" },
        { id: "u-nuevo", email: "nuevo@t1.com", role: "instructor", status: "Active", tenant_id: "t1" },
        { id: "u-ap", email: "ap@t1.com", role: "student", status: "Active", tenant_id: "t1" },
        { id: "u-baja", email: "baja@t1.com", role: "instructor", status: "Inactive", tenant_id: "t1" },
        { id: "u-ajeno", email: "ajeno@t2.com", role: "instructor", status: "Active", tenant_id: "t2" },
      ],
    },
  });

  test("S9-34 · HU-030 · el administrador reasigna el curso a otro instructor", async () => {
    base();
    const r = await CourseService.asignarInstructor("c1", admin, "nuevo@t1.com");
    assert.equal(r.anterior, "inst@t1.com");
    assert.equal(estado.tablas.courses[0].instructor, "nuevo@t1.com");
  });

  test("S9-35 · HU-030 · se puede indicar al instructor por su id", async () => {
    base();
    await CourseService.asignarInstructor("c1", admin, "u-nuevo");
    assert.equal(estado.tablas.courses[0].instructor, "nuevo@t1.com");
  });

  test("S9-36 · HU-030 · solo se elige a un instructor de la misma organización", async () => {
    base();
    await assert.rejects(CourseService.asignarInstructor("c1", admin, "ajeno@t2.com"), (e) => e.status === 400);
  });

  test("S9-37 · HU-030 · un aprendiz o una persona desactivada no puede dictar", async () => {
    base();
    await assert.rejects(CourseService.asignarInstructor("c1", admin, "ap@t1.com"), (e) => e.status === 400 && /instructor/.test(e.message));
    await assert.rejects(CourseService.asignarInstructor("c1", admin, "baja@t1.com"), (e) => e.status === 400 && /desactivada/.test(e.message));
  });
});

describe("Ver mis cursos asignados", () => {
  const base = () => preparar({
    tablas: {
      users_groups: [{ id_user: "u-ap", id_group: "g1" }, { id_user: "u-ap", id_group: "g2" }],
      groups_courses: [
        { id_group: "g1", id_course: "c1" }, { id_group: "g2", id_course: "c1" },
        { id_group: "g2", id_course: "c2" }, { id_group: "g2", id_course: "c3" }, { id_group: "g9", id_course: "c4" },
      ],
      courses: [
        { id: "c1", tenant_id: "t1", name: "Publicado", status: "Abierto", archivado: false },
        { id: "c2", tenant_id: "t1", name: "Borrador", status: "Cerrado", archivado: false },
        { id: "c3", tenant_id: "t1", name: "Archivado", status: "Abierto", archivado: true },
        { id: "c4", tenant_id: "t1", name: "De otro grupo", status: "Abierto", archivado: false },
      ],
      sections: [{ id: "s1", course_id: "c1" }],
      activities: [{ id: "a1", section_id: "s1" }, { id: "a2", section_id: "s1" }],
      xp_movimientos: [{ user_id: "u-ap", activity_id: "a1" }],
    },
  });

  test("S9-38 · HU-031 · ve los cursos de todos sus grupos sin duplicados", async () => {
    base();
    const cursos = await CourseService.getByUser("u-ap", { soloPublicados: true });
    assert.deepEqual(cursos.map((c) => c.id), ["c1"]);
  });

  test("S9-39 · HU-031 · no ve borradores, archivados ni cursos de otros grupos", async () => {
    base();
    const ids = (await CourseService.getByUser("u-ap", { soloPublicados: true })).map((c) => c.id);
    for (const ajeno of ["c2", "c3", "c4"]) assert.ok(!ids.includes(ajeno));
  });

  test("S9-40 · HU-031 · cada curso trae el porcentaje de avance", async () => {
    base();
    const [c] = await CourseService.getByUser("u-ap", { soloPublicados: true });
    assert.deepEqual(c.progreso, { hechas: 1, total: 2, porcentaje: 50 });
  });

  test("S9-41 · HU-031 · sin grupos no tiene cursos", async () => {
    base();
    assert.deepEqual(await CourseService.getByUser("u-sin-grupo"), []);
  });
});

describe("Configurar la tabla de niveles", () => {
  const TABLA = [
    { numero: 1, xp_minimo: 50, nombre: "Novato" }, { numero: 2, xp_minimo: 120, nombre: "Aprendiz" },
    { numero: 3, xp_minimo: 250, nombre: "Experto" }, { numero: 4, xp_minimo: 500, nombre: "Maestro" },
  ];

  test("S9-42 · HU-053 · se definen umbrales y nombres, numerados en orden", () => {
    const t = NivelesService._validar([{ xpMinimo: 50, nombre: " Novato " }, { xpMinimo: 120 }]);
    assert.deepEqual(t.map((n) => [n.numero, n.xpMinimo, n.nombre]), [[1, 50, "Novato"], [2, 120, ""]]);
  });

  test("S9-43 · HU-053 · un nivel que no pide más XP que el anterior responde 400 y dice cuál", () => {
    falla(() => NivelesService._validar([{ xpMinimo: 100 }, { xpMinimo: 100 }]), 400, "Nivel 2");
  });

  test("S9-44 · HU-053 · tabla vacía, más de 50 niveles, XP inválido o nombre largo responden 400", () => {
    falla(() => NivelesService._validar([]), 400);
    falla(() => NivelesService._validar(Array.from({ length: 51 }, (_, i) => ({ xpMinimo: (i + 1) * 10 }))), 400);
    falla(() => NivelesService._validar([{ xpMinimo: 10.5 }]), 400);
    falla(() => NivelesService._validar([{ xpMinimo: 10, nombre: "x".repeat(41) }]), 400);
  });

  test("S9-45 · HU-053 · el nivel y su nombre salen de la tabla de la organización", () => {
    assert.equal(nivelPara(300, TABLA), 3);
    assert.equal(nivelPara(300), 2); // con la curva por defecto
    const p = progreso(300, TABLA);
    assert.deepEqual([p.nombreNivel, p.nombreSiguiente, p.faltan], ["Experto", "Maestro", 200]);
  });

  test("S9-46 · HU-053 · en el último nivel de la tabla la barra queda llena", () => {
    const p = progreso(900, TABLA);
    assert.deepEqual([p.nivel, p.xpSiguienteNivel, p.porcentaje], [4, null, 100]);
  });

  test("S9-47 · HU-053 · un nivel guardado mayor que el del XP no contradice la barra", () => {
    const p = progresoEn(3, 200);
    assert.deepEqual([p.nivel, p.xpSiguienteNivel, p.faltan], [3, 700, 500]);
  });

  test("S9-48 · HU-053 · cada organización configura la suya; el superadmin la elige", () => {
    assert.equal(NivelesService._organizacion({ role: "admin", tenantId: "t1" }, "t2"), "t1");
    assert.equal(NivelesService._organizacion({ role: "superadmin" }, "t2"), "t2");
    falla(() => NivelesService._organizacion({ role: "superadmin" }, null), 400);
  });

  test("S9-49 · HU-053 · guardar llama al recálculo de toda la organización", async () => {
    let llamada;
    preparar({ tablas: { niveles: [] }, rpc: (fn, a) => { llamada = { fn, ...a }; return { data: 3, error: null }; } });
    const r = await NivelesService.guardar(admin, { niveles: [{ xpMinimo: 50 }, { xpMinimo: 120 }] });
    assert.equal(llamada.fn, "guardar_niveles");
    assert.equal(llamada.p_tenant, "t1");
    assert.equal(r.personasConNivelNuevo, 3);
  });

  test("S9-50 · HU-053 · sin tabla propia se muestra la curva por defecto", async () => {
    preparar({ tablas: { niveles: [] } });
    const r = await NivelesService.obtener(admin);
    assert.equal(r.personalizada, false);
    assert.equal(r.niveles[0].xpMinimo, 100);
  });
});

describe("Definir la condición de una medalla", () => {
  const base = { nombre: "Constante", tipoCondicion: "racha_dias", meta: 5 };

  test("S9-51 · HU-060 · el catálogo cerrado tiene nueve condiciones", () => {
    assert.equal(LogroService.opciones().condiciones.length, 9);
  });

  test("S9-52 · HU-060 · una condición fuera del catálogo responde 400", () => {
    falla(() => LogroService._validar({ ...base, tipoCondicion: "hacer_trampa" }), 400, "tipo de condición");
  });

  test("S9-53 · HU-060 · la categoría la decide la condición, no el cliente", () => {
    assert.equal(LogroService._validar({ ...base, categoria: "Progreso" }).categoria, "Constancia");
  });

  test("S9-54 · HU-060 · meta cero o XP de recompensa negativo responden 400", () => {
    falla(() => LogroService._validar({ ...base, meta: 0 }), 400, "meta");
    falla(() => LogroService._validar({ ...base, xpRecompensa: -1 }), 400);
  });

  const conAprendices = () => preparar({
    tablas: {
      users: [
        { id: "a1", firstname: "Ana", role: "student", tenant_id: "t1", level: 1, streak: 1, racha_maxima: 1 },
        { id: "a2", firstname: "Beto", role: "student", tenant_id: "t1", level: 2, streak: 0, racha_maxima: 5 },
        { id: "a3", firstname: "Caro", role: "student", tenant_id: "t1", level: 3, streak: 7, racha_maxima: 7 },
        { id: "x1", firstname: "Ajeno", role: "student", tenant_id: "t2", level: 9, streak: 30, racha_maxima: 30 },
        { id: "i1", firstname: "Inst", role: "instructor", tenant_id: "t1", level: 9, streak: 30, racha_maxima: 30 },
      ],
      xp_movimientos: [], entregas: [], intentos_examen: [], users_groups: [],
    },
  });

  test("S9-55 · HU-060 · antes de activarla se ve cuántas personas la cumplirían hoy", async () => {
    conAprendices();
    const r = await DesbloqueoService.vistaPrevia(admin, { tipoCondicion: "racha_dias", meta: 5 });
    assert.equal(r.aprendices, 3);
    assert.equal(r.cumplirian, 2);
    assert.equal(r.porcentaje, 67);
    assert.deepEqual(r.ejemplos.map((e) => e.firstname).sort(), ["Beto", "Caro"]);
  });

  test("S9-56 · HU-060 · la vista previa mide solo a los aprendices de la organización", async () => {
    conAprendices();
    const r = await DesbloqueoService.vistaPrevia(admin, { tipoCondicion: "nivel_alcanzado", meta: 9 });
    assert.equal(r.cumplirian, 0); // ni el aprendiz ajeno ni el instructor cuentan
  });

  test("S9-57 · HU-060 · la vista previa no guarda nada", async () => {
    conAprendices();
    await DesbloqueoService.vistaPrevia(admin, { tipoCondicion: "racha_dias", meta: 1 });
    assert.equal(estado.escrituras.length, 0);
  });

  test("S9-58 · HU-060 · una condición inválida en la vista previa responde 400", async () => {
    conAprendices();
    await assert.rejects(DesbloqueoService.vistaPrevia(admin, { tipoCondicion: "x", meta: 1 }), (e) => e.status === 400);
  });
});
