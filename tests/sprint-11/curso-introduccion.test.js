// Sprint 11 · Curso "Introducción a OnBoard Pro": se crea como un curso normal
// de cada organización (data/curso-introduccion.json), también al crear una
// organización nueva. La base es la falsa.
const { preparar, estado } = require("../soporte/supabaseFalso.js");
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const CursoIntroduccionService = require("../../services/cursoIntroduccionService.js");
const TenantService = require("../../services/tenantService.js");
const { borrar, MATERIALES } = require("../../helpers/storage.js");

const DEF = CursoIntroduccionService.definicion();
const ACTIVIDADES = DEF.secciones.flatMap((s) => s.actividades);
const EXAMENES = ACTIVIDADES.filter((a) => a.tipo === "Examen");

function conRpc() {
  const llamadas = [];
  preparar({
    tablas: { tenants: [{ id: "t1", name: "Acme", domain: "acme.com", active: true }], courses: [], sections: [], activities: [] },
    rpc: (fn, args) => { llamadas.push({ fn, args }); return { data: null, error: null }; },
  });
  return llamadas;
}

describe("Curso de introducción a OnBoard Pro", () => {
  test("S11-60 · HU-026 · crearEn arma el curso completo en la organización indicada, publicado y sin grupos", async () => {
    const llamadas = conRpc();
    const videos = Object.fromEntries(ACTIVIDADES.filter((a) => a.video)
      .map((a) => [a.video, { ruta: `plataforma/curso-introduccion/${a.video}`, mime: "video/mp4", tamano: 10 }]));

    const r = await CursoIntroduccionService.crearEn("t1", { videos });

    assert.equal(r.creado, true);
    const [curso] = estado.tablas.courses;
    assert.equal(curso.name, "Introducción a OnBoard Pro");
    assert.equal(curso.tenant_id, "t1");
    assert.equal(curso.status, "Abierto");
    assert.equal((estado.tablas.groups_courses || []).length, 0, "no se asigna a ningún grupo");

    assert.equal(estado.tablas.sections.length, DEF.secciones.length);
    assert.ok(estado.tablas.sections.every((s) => s.course_id === curso.id && s.tenant_id === "t1"));
    assert.equal(estado.tablas.activities.length, ACTIVIDADES.length);
    assert.ok(estado.tablas.activities.every((a) => a.tenant_id === "t1"));
    assert.ok(estado.tablas.activities.every((a) => a.type !== "Tarea"), "sin tareas: no hay quien las califique");

    const materiales = estado.tablas.materiales;
    assert.equal(materiales.length, Object.keys(videos).length);
    assert.ok(materiales.every((m) => m.tenant_id === "t1" && m.ruta.startsWith("plataforma/")));

    // El examen se guarda por el mismo camino que el editor, con sus preguntas.
    const ex = llamadas.filter((l) => l.fn === "guardar_examen");
    assert.equal(ex.length, EXAMENES.length);
    assert.equal(ex[0].args.p_tenant, "t1");
    assert.equal(ex[0].args.p_preguntas.length, EXAMENES[0].preguntas.length);
    assert.ok(ex[0].args.p_preguntas.every((p) => p.opciones.filter((o) => o.esCorrecta).length === 1));
  });

  test("S11-61 · HU-026 · crearEn es idempotente y sin videos crea las actividades sin material", async () => {
    conRpc();
    const primera = await CursoIntroduccionService.crearEn("t1");
    const segunda = await CursoIntroduccionService.crearEn("t1");

    assert.equal(primera.creado, true);
    assert.equal(primera.materiales, 0);
    assert.deepEqual(segunda, { creado: false, cursoId: primera.cursoId });
    assert.equal(estado.tablas.courses.length, 1);
    assert.equal(estado.tablas.activities.length, ACTIVIDADES.length);
  });

  test("S11-62 · HU-001 · crear una organización le crea el curso, y si la copia falla la organización igual queda creada", async (t) => {
    conRpc();
    const org = await TenantService.create({ name: "Nueva", domain: "nueva.com" });
    const curso = estado.tablas.courses.find((c) => c.tenant_id === org.id);
    assert.ok(curso, "la organización nueva tiene el curso");
    assert.equal(curso.name, "Introducción a OnBoard Pro");

    t.mock.method(CursoIntroduccionService, "crearEn", async () => { throw new Error("Storage caído"); });
    t.mock.method(console, "error", () => {});
    const otra = await TenantService.create({ name: "Otra", domain: "otra.com" });
    assert.ok(estado.tablas.tenants.some((x) => x.id === otra.id));
  });

  test("S11-63 · HU-039 · los archivos compartidos de la plataforma no se borran de Storage", async () => {
    preparar({});
    await borrar(MATERIALES, "plataforma/curso-introduccion/01-primer-ingreso.mp4");
    await borrar(MATERIALES, "t1/abc-manual.pdf");
    const borrados = estado.escrituras.filter((e) => e.operacion === "remove").flatMap((e) => e.rutas);
    assert.deepEqual(borrados, ["t1/abc-manual.pdf"]);
  });
});
