// Sprint 7: perfil propio (HU-070), cursos de un grupo (HU-024), material de
// apoyo (HU-037, HU-039), revisión de entregas (HU-048), completar un recurso
// (HU-040) y creación de logros (HU-059).
//
// El soporte va primero: reemplaza Supabase, Storage y los avisos por correo
// antes de que algún servicio los pida.
const { estado, preparar, fallarEn, storage, avisos, archivo, rechaza } = require("./soporte.js");
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");

const AuthService = require("../../services/authService.js");
const GroupService = require("../../services/groupService.js");
const MaterialService = require("../../services/materialService.js");
const EntregaService = require("../../services/entregaService.js");
const GamificationService = require("../../services/gamificationService.js");
const DesbloqueoService = require("../../services/desbloqueoService.js");
const LogroService = require("../../services/logroService.js");

// ── Personas ────────────────────────────────────────────────────────────
const admin = { id: "adm1", role: "admin", tenantId: "t1", email: "admin@empresa.com" };
const adminAjeno = { id: "adm2", role: "admin", tenantId: "t2", email: "admin@otra.com" };
const superadmin = { id: "sa", role: "superadmin", tenantId: null, email: "root@onboardpro.com" };
const instructor = { id: "ins1", role: "instructor", tenantId: "t1", email: "ana@empresa.com" };
const instructorAjeno = { id: "ins2", role: "instructor", tenantId: "t1", email: "otro@empresa.com" };

// ── Dos organizaciones, con cursos, grupos y actividades ────────────────
const base = () => ({
  tenants: [
    { id: "t1", name: "Empresa", domain: "empresa.com", active: true },
    { id: "t2", name: "Otra", domain: "otra.com", active: true },
  ],
  users: [
    { id: "u1", email: "luis@empresa.com", firstname: "Luis", lastname: "Gómez", phonumber: "", role: "student", tenant_id: "t1", xp: 120, level: 1, password: null },
  ],
  courses: [
    { id: "c1", name: "Inducción", instructor: "ana@empresa.com", status: "Abierto", archivado: false, tenant_id: "t1" },
    { id: "c3", name: "Seguridad", instructor: "ana@empresa.com", status: "Abierto", archivado: false, tenant_id: "t1" },
    { id: "c2", name: "Ajeno", instructor: "x@otra.com", status: "Abierto", archivado: false, tenant_id: "t2" },
  ],
  sections: [{ id: "s1", name: "Semana 1", course_id: "c1", tenant_id: "t1" }],
  activities: [
    { id: "rec1", name: "Manual", title: "Manual", type: "Recurso", deliverable: false, xp: 10, section_id: "s1", tenant_id: "t1", adjunto: null },
    { id: "tar1", name: "Informe", title: "Informe", type: "Tarea", deliverable: true, xp: 30, section_id: "s1", tenant_id: "t1" },
    { id: "ex1", name: "Examen", title: "Examen", type: "Examen", deliverable: false, xp: 50, section_id: "s1", tenant_id: "t1" },
  ],
  groups: [
    { id: "g1", name: "Ventas", tenant_id: "t1" },
    { id: "g2", name: "Ajeno", tenant_id: "t2" },
  ],
  users_groups: [{ id_user: "u1", id_group: "g1" }],
  groups_courses: [{ id_group: "g1", id_course: "c1" }],
  materiales: [],
  entregas: [],
  logros: [],
  niveles: [],
});

const actividad = (id) => estado.tablas.activities.find((a) => a.id === id);
const usuario = (id) => estado.tablas.users.find((u) => u.id === id);

describe("Editar mi perfil", () => {
  test("S7-01 · HU-070 · se cambian nombre, apellido y teléfono (sin espacios de más) y el resto del perfil queda igual", async () => {
    preparar({ tablas: base() });
    const r = await AuthService.editarPerfil("u1", { firstname: "  Luis Fernando ", lastname: "Pérez", phonumber: " 3001234567 " });

    assert.equal(r.estado, 200);
    assert.equal(r.userData.firstname, "Luis Fernando");
    assert.equal(r.userData.phonumber, "3001234567");
    assert.equal(r.userData.tenantName, "Empresa");
    assert.equal("password" in r.userData, false);
    // Ni el XP ni el nivel se tocan al editar el perfil.
    assert.equal(usuario("u1").xp, 120);
    assert.equal(usuario("u1").level, 1);
    assert.equal(usuario("u1").role, "student");
  });

  test("S7-02 · HU-070 · el rol, el XP, la organización o el correo no se editan desde el perfil (403)", async () => {
    preparar({ tablas: base() });
    for (const intento of [{ role: "admin" }, { xp: 9999 }, { tenantId: "t2" }, { firstname: "Ok", level: 50 }]) {
      const r = await AuthService.editarPerfil("u1", intento);
      assert.equal(r.estado, 403);
    }
    const correo = await AuthService.editarPerfil("u1", { email: "otro@empresa.com" });
    assert.equal(correo.estado, 403);
    assert.match(correo.message, /correo/);

    const u = usuario("u1");
    assert.deepEqual([u.role, u.xp, u.tenant_id, u.firstname, u.email], ["student", 120, "t1", "Luis", "luis@empresa.com"]);
  });

  test("S7-03 · HU-070 · una edición vacía, un nombre en blanco o de más de 50 caracteres responden 400", async () => {
    preparar({ tablas: base() });
    assert.equal((await AuthService.editarPerfil("u1", {})).estado, 400);
    assert.equal((await AuthService.editarPerfil("u1", null)).estado, 400);
    assert.equal((await AuthService.editarPerfil("u1", { firstname: "   " })).estado, 400);
    assert.equal((await AuthService.editarPerfil("u1", { firstname: "x".repeat(51) })).estado, 400);
    assert.equal(usuario("u1").firstname, "Luis");
  });
});

describe("Asignar cursos a un grupo", () => {
  test("S7-04 · HU-024 · se asignan cursos de la organización sin duplicar los que ya tenía, y se avisa a los integrantes", async () => {
    preparar({ tablas: base() });
    const r = await GroupService.addCoursesToGroup("g1", ["c1", "c3"], "t1");

    assert.match(r.message, /asignados/);
    const delGrupo = estado.tablas.groups_courses.filter((gc) => gc.id_group === "g1").map((gc) => gc.id_course);
    assert.deepEqual(delGrupo.sort(), ["c1", "c3"]);
    assert.equal(avisos.length, 1);
    assert.equal(avisos[0].tipo, "cursoAsignado");
    assert.deepEqual(avisos[0].groupIds, ["g1"]);
  });

  test("S7-05 · HU-024 · un curso de otra organización rechaza toda la asignación (400) y no avisa a nadie", async () => {
    preparar({ tablas: base() });
    await rechaza(GroupService.addCoursesToGroup("g1", ["c3", "c2"], "t1"), 400, "c2");
    assert.equal(estado.tablas.groups_courses.length, 1);
    assert.equal(avisos.length, 0);
  });

  test("S7-06 · HU-024 · un grupo de otra organización responde 404 y una lista vacía 400; el superadmin opera con la organización del grupo", async () => {
    preparar({ tablas: base() });
    await rechaza(GroupService.addCoursesToGroup("g2", ["c2"], "t1"), 404);
    await rechaza(GroupService.addCoursesToGroup("g1", [], "t1"), 400);

    await GroupService.addCoursesToGroup("g2", ["c2"], null);
    assert.ok(estado.tablas.groups_courses.some((gc) => gc.id_group === "g2" && gc.id_course === "c2"));
    await rechaza(GroupService.addCoursesToGroup("g2", ["c1"], null), 400, "c1");
  });
});

describe("Subir material de apoyo", () => {
  test("S7-07 · HU-037 · el material se sube, queda en orden y la actividad apunta al primero", async () => {
    preparar({ tablas: base() });
    const primero = await MaterialService.agregar("rec1", instructor, archivo("guia.pdf"));
    const segundo = await MaterialService.agregar("rec1", instructor, archivo("video.mp4", "video/mp4"));

    const filas = estado.tablas.materiales;
    assert.equal(filas.length, 2);
    assert.deepEqual(filas.map((m) => [m.id, m.orden, m.nombre]), [
      [primero.materialId, 0, "guia.pdf"],
      [segundo.materialId, 1, "video.mp4"],
    ]);
    assert.equal(filas[0].tenant_id, "t1");
    assert.equal(filas[0].subido_por, "ins1");
    assert.equal(actividad("rec1").adjunto, filas[0].ruta);
    assert.equal(actividad("rec1").mime, "application/pdf");
  });

  test("S7-08 · HU-037 · sin archivo (400), instructor que no dicta el curso (403) u otra organización (404): no se sube nada", async () => {
    preparar({ tablas: base() });
    await rechaza(MaterialService.agregar("rec1", instructor, null), 400);
    await rechaza(MaterialService.agregar("rec1", instructorAjeno, archivo()), 403);
    await rechaza(MaterialService.agregar("rec1", adminAjeno, archivo()), 404);
    assert.equal(storage.subidos.length, 0);
    assert.equal(estado.tablas.materiales.length, 0);
  });

  test("S7-09 · HU-037 · si la base no registra el material, el archivo recién subido se borra del almacenamiento", async () => {
    preparar({ tablas: base() });
    fallarEn("materiales", "insert", { message: "fallo de la base" });
    await assert.rejects(MaterialService.agregar("rec1", admin, archivo()), /fallo de la base/);
    assert.equal(storage.subidos.length, 1);
    assert.deepEqual(storage.borrados, storage.subidos);
    assert.equal(actividad("rec1").adjunto, null);
  });
});

describe("Eliminar material de apoyo", () => {
  const conMateriales = () => {
    const tablas = base();
    tablas.materiales = [
      { id: "m1", activity_id: "rec1", tenant_id: "t1", nombre: "a.pdf", ruta: "t1/a.pdf", mime: "application/pdf", orden: 0 },
      { id: "m2", activity_id: "rec1", tenant_id: "t1", nombre: "b.mp4", ruta: "t1/b.mp4", mime: "video/mp4", orden: 1 },
    ];
    tablas.activities[0].adjunto = "t1/a.pdf";
    tablas.activities[0].mime = "application/pdf";
    return tablas;
  };

  test("S7-10 · HU-039 · quitar material lo borra también del almacenamiento y la actividad pasa a apuntar al siguiente", async () => {
    preparar({ tablas: conMateriales() });

    const r = await MaterialService.quitar("m1", instructor);
    assert.equal(r.nombre, "a.pdf");
    assert.deepEqual(storage.borrados, ["t1/a.pdf"]);
    assert.deepEqual(estado.tablas.materiales.map((m) => m.id), ["m2"]);
    assert.equal(actividad("rec1").adjunto, "t1/b.mp4");
    assert.equal(actividad("rec1").mime, "video/mp4");

    await MaterialService.quitar("m2", instructor);
    assert.equal(actividad("rec1").adjunto, null);
    assert.equal(actividad("rec1").mime, null);
  });

  test("S7-11 · HU-039 · material inexistente (404), instructor que no dicta el curso (403) u otra organización (404): no se borra nada", async () => {
    preparar({ tablas: conMateriales() });
    await rechaza(MaterialService.quitar("no-existe", admin), 404);
    await rechaza(MaterialService.quitar("m1", instructorAjeno), 403);
    await rechaza(MaterialService.quitar("m1", adminAjeno), 404);
    assert.equal(storage.borrados.length, 0);
    assert.equal(estado.tablas.materiales.length, 2);
  });
});

describe("Calificar y retroalimentar entrega", () => {
  const conEntregas = () => {
    const tablas = base();
    tablas.entregas = [
      { id: "e1", activity_id: "tar1", user_id: "u1", tenant_id: "t1", estado: "entregado" },
      { id: "e2", activity_id: "tar1", user_id: "u2", tenant_id: "t1", estado: "aprobada" },
    ];
    return tablas;
  };

  test("S7-12 · HU-048 · aprobar una entrega guarda la revisión y acredita el XP de la actividad", async (t) => {
    preparar({ tablas: conEntregas() });
    const acreditar = t.mock.method(GamificationService, "acreditar",
      async () => ({ xpGanado: 30, nivel: 1, logrosDesbloqueados: [] }));

    const r = await EntregaService.revisar("e1", instructor, { aprobada: true, feedback: "  Muy claro  " });
    assert.equal(r.estado, "aprobada");
    assert.equal(r.xpAcreditado, 30);

    const fila = estado.tablas.entregas.find((e) => e.id === "e1");
    assert.equal(fila.estado, "aprobada");
    assert.equal(fila.feedback, "Muy claro");
    assert.equal(fila.revisado_por, "ins1");
    assert.equal(acreditar.mock.callCount(), 1);
    const datos = acreditar.mock.calls[0].arguments[0];
    assert.deepEqual([datos.userId, datos.actividadId, datos.puntos, datos.motivo], ["u1", "tar1", 30, "entrega_aprobada"]);
  });

  test("S7-13 · HU-048 · pedir cambios exige retroalimentación (400), no paga XP, y una entrega aprobada no vuelve a rehacer (409)", async (t) => {
    preparar({ tablas: conEntregas() });
    const acreditar = t.mock.method(GamificationService, "acreditar", async () => ({ xpGanado: 30 }));

    await rechaza(EntregaService.revisar("e1", admin, { aprobada: false, feedback: "  " }), 400, "corregir");
    await rechaza(EntregaService.revisar("e1", admin, { aprobada: "si", feedback: "x" }), 400);

    const r = await EntregaService.revisar("e1", admin, { aprobada: false, feedback: "Falta la conclusión" });
    assert.equal(r.estado, "rehacer");
    assert.equal(r.xpAcreditado, 0);
    assert.equal(acreditar.mock.callCount(), 0);

    await rechaza(EntregaService.revisar("e2", admin, { aprobada: false, feedback: "Mejor no" }), 409, "aprobada");
    assert.equal(estado.tablas.entregas.find((e) => e.id === "e2").estado, "aprobada");
  });

  test("S7-14 · HU-048 · un instructor que no dicta el curso recibe 403; otra organización o una entrega inexistente, 404", async () => {
    preparar({ tablas: conEntregas() });
    await rechaza(EntregaService.revisar("e1", instructorAjeno, { aprobada: true }), 403);
    await rechaza(EntregaService.revisar("e1", adminAjeno, { aprobada: true }), 404);
    await rechaza(EntregaService.revisar("no-existe", admin, { aprobada: true }), 404);
    assert.equal(estado.tablas.entregas.find((e) => e.id === "e1").estado, "entregado");
  });
});

describe("Marcar actividad como completada", () => {
  // Racha, nivel y logros tienen sus propias pruebas: acá se aíslan.
  const aislar = (t) => {
    t.mock.method(GamificationService, "registrarDiaActivo", async () => ({ dias: 1, maxima: 1, crecioHoy: true }));
    t.mock.method(GamificationService, "recalcular", async () => ({ nivel: 1, subioDeNivel: false }));
    t.mock.method(DesbloqueoService, "evaluar", async () => ({ logros: [], resumen: null }));
  };

  test("S7-15 · HU-040 · completar un recurso acredita su XP una vez, con el motivo correcto", async (t) => {
    aislar(t);
    let pedido;
    preparar({ tablas: base(), rpc: (fn, a) => { pedido = { fn, ...a }; return { data: a.p_xp, error: null }; } });

    const r = await GamificationService.completarActividad("u1", "rec1", "t1");
    assert.equal(r.xpGanado, 10);
    assert.match(r.message, /\+10 XP/);
    assert.equal(pedido.fn, "acreditar_xp");
    assert.deepEqual([pedido.p_user, pedido.p_activity, pedido.p_tenant, pedido.p_motivo], ["u1", "rec1", "t1", "actividad_completada"]);
  });

  test("S7-16 · HU-040 · una tarea o un examen no se marcan a mano (409): se completan entregando o resolviendo", async (t) => {
    aislar(t);
    let llamadas = 0;
    preparar({ tablas: base(), rpc: () => { llamadas++; return { data: 0, error: null }; } });

    await rechaza(GamificationService.completarActividad("u1", "tar1", "t1"), 409, "entregando");
    await rechaza(GamificationService.completarActividad("u1", "ex1", "t1"), 409, "resolviéndolos");
    assert.equal(llamadas, 0);
  });

  test("S7-17 · HU-040 · completar dos veces el mismo recurso responde 409 sin volver a pagar", async (t) => {
    aislar(t);
    preparar({ tablas: base(), rpc: () => ({ data: null, error: { code: "23505", message: "duplicate key" } }) });
    await rechaza(GamificationService.completarActividad("u1", "rec1", "t1"), 409, "Ya habías completado");
  });

  test("S7-18 · HU-040 · un recurso de un curso no publicado o archivado (409) o de otra organización (404) no se completa", async (t) => {
    aislar(t);
    let llamadas = 0;
    preparar({ tablas: base(), rpc: () => { llamadas++; return { data: 10, error: null }; } });

    await rechaza(GamificationService.completarActividad("u1", "rec1", "t2"), 404);
    estado.tablas.courses[0].status = "Cerrado";
    await rechaza(GamificationService.completarActividad("u1", "rec1", "t1"), 409, "no está publicado");
    estado.tablas.courses[0].status = "Abierto";
    estado.tablas.courses[0].archivado = true;
    await rechaza(GamificationService.completarActividad("u1", "rec1", "t1"), 409, "archivado");
    assert.equal(llamadas, 0);
  });
});

describe("Crear logro", () => {
  const datos = { nombre: "  Primeros pasos ", tipoCondicion: "actividades_completadas", meta: 3 };

  test("S7-19 · HU-059 · un admin crea el logro en su organización, aunque mande otra, con la categoría que sale de la condición", async () => {
    preparar({ tablas: base() });
    const { logro } = await LogroService.crear(admin, { ...datos, categoria: "Ranking", tenantId: "t2" });

    assert.equal(logro.nombre, "Primeros pasos");
    assert.equal(logro.tenantId, "t1");
    assert.equal(logro.generico, false);
    assert.equal(logro.categoria, "Progreso");
    assert.equal(logro.icono, "🎯");
    assert.equal(logro.xpRecompensa, 0);
    assert.equal(logro.activo, true);
    assert.equal(logro.creadoPor, "adm1");
    assert.equal(logro.condicion.descripcion, "Completar 3 actividades");
  });

  test("S7-20 · HU-059 · un nombre repetido en la organización responde 409", async () => {
    preparar({ tablas: base() });
    fallarEn("logros", "insert", { code: "23505", message: "duplicate key value violates unique constraint" });
    await rechaza(LogroService.crear(admin, datos), 409, "Ya existe");
  });

  test("S7-21 · HU-059 · solo el superadmin crea logros para todas las organizaciones (403), y esos no se atan a un curso (400)", async () => {
    preparar({ tablas: base() });
    await rechaza(LogroService.crear(admin, { ...datos, generico: true }), 403);
    await rechaza(LogroService.crear(superadmin, { ...datos, generico: true, cursoId: "c1" }), 400, "curso");
    assert.equal(estado.tablas.logros.length, 0);

    const { logro } = await LogroService.crear(superadmin, { ...datos, generico: true });
    assert.equal(logro.generico, true);
    assert.equal(logro.tenantId, null);
  });

  test("S7-22 · HU-059 · un admin no puede atar un logro a un curso de otra organización",
    { todo: "posible bug: LogroService.crear no comprueba que cursoId sea de la organización del logro; _asegurarAlcance solo frena el caso genérico (services/logroService.js:205 y :261-265; igual en actualizar, :275)" },
    async () => {
      preparar({ tablas: base() });
      await assert.rejects(LogroService.crear(admin, { ...datos, cursoId: "c2" }), (e) => [400, 404].includes(e.status));
      assert.equal(estado.tablas.logros.length, 0);
    });
});
