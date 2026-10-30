// Sprint 6: actividades (HU-034, HU-036, HU-051), organizaciones (HU-003,
// HU-004, HU-005), mis grupos (HU-025), exámenes (HU-041) y entregas (HU-046).
//
// El soporte va primero: reemplaza Supabase, Storage y los avisos por correo
// antes de que algún servicio los pida.
const { estado, preparar, storage, avisos, archivo, rechaza } = require("./soporte.js");
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcrypt");

const ActivitiesService = require("../../services/actividades.js");
const TenantService = require("../../services/tenantService.js");
const GroupService = require("../../services/groupService.js");
const ExamenService = require("../../services/examenService.js");
const EntregaService = require("../../services/entregaService.js");
const AuthService = require("../../services/authService.js");

// ── Personas ────────────────────────────────────────────────────────────
const admin = { id: "adm1", role: "admin", tenantId: "t1", email: "admin@empresa.com" };
const adminAjeno = { id: "adm2", role: "admin", tenantId: "t2", email: "admin@otra.com" };
const instructor = { id: "ins1", role: "instructor", tenantId: "t1", email: "ana@empresa.com" };
const instructorAjeno = { id: "ins2", role: "instructor", tenantId: "t1", email: "otro@empresa.com" };
const aprendiz = { id: "u1", role: "student", tenantId: "t1", email: "luis@empresa.com" };

// ── Una organización con un curso, su sección y sus actividades ─────────
const base = () => ({
  tenants: [
    { id: "t1", name: "Empresa", domain: "empresa.com", active: true, created_at: "2026-01-01" },
    { id: "t2", name: "Otra", domain: "otra.com", active: true, created_at: "2026-01-01" },
  ],
  courses: [
    { id: "c1", name: "Inducción", instructor: "ana@empresa.com", status: "Abierto", archivado: false, tenant_id: "t1" },
    { id: "c2", name: "Ajeno", instructor: "x@otra.com", status: "Abierto", archivado: false, tenant_id: "t2" },
  ],
  sections: [
    { id: "s1", name: "Semana 1", course_id: "c1", tenant_id: "t1" },
    { id: "s2", name: "Ajena", course_id: "c2", tenant_id: "t2" },
  ],
  activities: [
    { id: "tar1", name: "Informe", title: "Informe", type: "Tarea", deliverable: true, xp: 30, section_id: "s1", tenant_id: "t1", adjunto: "t1/enunciado.pdf" },
    { id: "rec1", name: "Manual", title: "Manual", type: "Recurso", deliverable: false, xp: 10, section_id: "s1", tenant_id: "t1" },
    { id: "ex1", name: "Examen", title: "Examen final", type: "Examen", deliverable: false, xp: 50, section_id: "s1", tenant_id: "t1", intentos_permitidos: 2 },
  ],
  preguntas: [{ id: "p1", activity_id: "ex1", enunciado: "¿Ok?", puntaje: 2, dificultad: 1, orden: 0 }],
  opciones: [
    { id: "o1", pregunta_id: "p1", texto: "Sí", es_correcta: true, orden: 0 },
    { id: "o2", pregunta_id: "p1", texto: "No", es_correcta: false, orden: 1 },
  ],
  materiales: [],
  entregas: [],
  intentos_examen: [],
});

const opciones = [{ texto: "Sí", esCorrecta: true }, { texto: "No", esCorrecta: false }];
const actividad = (id) => estado.tablas.activities.find((a) => a.id === id);

describe("Crear actividad o recurso", () => {
  test("S6-01 · HU-034 · una actividad nueva queda al final de su sección, con el XP de su tipo, y avisa a los aprendices", async () => {
    preparar({ tablas: base() });
    const creada = await ActivitiesService.create(
      { name: "Caso", title: "Resolver el caso", type: "Tarea", sectionId: "s1", tenantId: "t1" }, null);

    assert.equal(creada.orden, 3); // ya había 3 actividades en la sección
    assert.equal(creada.xp, 30);
    const fila = actividad(creada.id);
    assert.equal(fila.section_id, "s1");
    assert.equal(fila.tenant_id, "t1");
    assert.equal(avisos.length, 1);
    assert.equal(avisos[0].tipo, "actividadNueva");
  });

  test("S6-02 · HU-034 · una sección de otra organización responde 404 y no sube ningún archivo", async () => {
    preparar({ tablas: base() });
    await rechaza(ActivitiesService.create(
      { name: "X", title: "X", sectionId: "s2", tenantId: "t1" }, archivo()), 404, "Sección");
    assert.equal(storage.subidos.length, 0);
    assert.equal(estado.tablas.activities.length, 3);
  });

  test("S6-03 · HU-034 · un recurso no puede pedir entrega (400)", async () => {
    preparar({ tablas: base() });
    await rechaza(ActivitiesService.create(
      { name: "PDF", title: "PDF", type: "Recurso", deliverable: true, sectionId: "s1", tenantId: "t1" }, null),
    400, "recurso");
  });

  test("S6-04 · HU-034 · con datos inválidos responde 400 y borra el archivo que ya se había subido", async () => {
    preparar({ tablas: base() });
    await rechaza(ActivitiesService.create(
      { name: "", title: "Sin nombre", type: "Tarea", sectionId: "s1", tenantId: "t1" }, archivo()), 400, "name");
    assert.equal(storage.subidos.length, 1);
    assert.deepEqual(storage.borrados, storage.subidos);
    assert.equal(estado.tablas.activities.length, 3);
    assert.equal(estado.tablas.materiales.length, 0);
  });

  test("S6-05 · HU-034 · un recurso con deliverable \"true\" en texto (multipart) también se rechaza",
    { todo: "posible bug: comprobarEntregable compara deliverable === true antes de que el schema convierta el texto \"true\" (multipart) a booleano, así que el recurso se crea pidiendo entrega (services/actividades.js:35 y :123; lo mismo al editar en :225)" },
    async () => {
      preparar({ tablas: base() });
      await rechaza(ActivitiesService.create(
        { name: "PDF", title: "PDF", type: "Recurso", deliverable: "true", sectionId: "s1", tenantId: "t1" }, null), 400);
    });
});

describe("Definir el XP de una actividad", () => {
  test("S6-06 · HU-051 · el XP indicado se respeta (aunque llegue como texto), sin él sale del tipo, y fuera de 0–1000 responde 400", async () => {
    preparar({ tablas: base() });
    const propia = await ActivitiesService.create({ name: "A", title: "A", type: "Tarea", xp: "75", tenantId: "t1" }, null);
    assert.equal(propia.xp, 75);
    const porTipo = await ActivitiesService.create({ name: "B", title: "B", type: "Examen", tenantId: "t1" }, null);
    assert.equal(porTipo.xp, 50);
    await rechaza(ActivitiesService.create({ name: "C", title: "C", type: "Tarea", xp: 1001, tenantId: "t1" }, null), 400, "xp");
  });

  test("S6-07 · HU-051 · cambiar el XP de una actividad no toca el XP ya acreditado", async () => {
    const tablas = base();
    tablas.xp_movimientos = [{ id: "m1", user_id: "u1", activity_id: "tar1", xp: 30 }];
    preparar({ tablas });

    await ActivitiesService.actualizar("tar1", { xp: 80 }, null, admin);
    assert.equal(actividad("tar1").xp, 80);
    assert.equal(estado.tablas.xp_movimientos[0].xp, 30);

    await rechaza(ActivitiesService.actualizar("tar1", { xp: -5 }, null, admin), 400, "xp");
    assert.equal(actividad("tar1").xp, 80);
  });
});

describe("Editar y eliminar actividad", () => {
  test("S6-08 · HU-036 · un instructor que no dicta el curso recibe 403 y un admin de otra organización 404", async () => {
    preparar({ tablas: base() });
    await rechaza(ActivitiesService.actualizar("tar1", { title: "Hackeada" }, null, instructorAjeno), 403);
    await rechaza(ActivitiesService.eliminar("tar1", instructorAjeno), 403);
    await rechaza(ActivitiesService.actualizar("tar1", { title: "Hackeada" }, null, adminAjeno), 404);
    assert.equal(actividad("tar1").title, "Informe");

    // Quien sí dicta el curso puede editarla.
    await ActivitiesService.actualizar("tar1", { title: "Informe final" }, null, instructor);
    assert.equal(actividad("tar1").title, "Informe final");
  });

  test("S6-09 · HU-036 · no se cambia el tipo de una actividad con entregas (409) ni se acepta una edición vacía (400)", async () => {
    const tablas = base();
    tablas.entregas = [{ id: "e1", activity_id: "tar1", user_id: "u1", tenant_id: "t1", estado: "entregado" }];
    preparar({ tablas });

    await rechaza(ActivitiesService.actualizar("tar1", { type: "Examen", deliverable: false }, null, admin), 409, "entregas");
    await rechaza(ActivitiesService.actualizar("tar1", {}, null, admin), 400);
    assert.equal(actividad("tar1").type, "Tarea");
  });

  test("S6-10 · HU-036 · eliminar borra la actividad y sus archivos (adjunto, material y entregas) del almacenamiento", async () => {
    const tablas = base();
    tablas.materiales = [{ id: "m1", activity_id: "tar1", ruta: "t1/material.pdf" }];
    tablas.entregas = [{ id: "e1", activity_id: "tar1", user_id: "u1", archivo: "t1/entrega.docx" }];
    preparar({ tablas });

    const r = await ActivitiesService.eliminar("tar1", instructor);
    assert.equal(r.message, "Actividad eliminada");
    assert.equal(actividad("tar1"), undefined);
    assert.deepEqual(storage.borrados.sort(), ["t1/entrega.docx", "t1/enunciado.pdf", "t1/material.pdf"]);
  });
});

describe("Editar organización", () => {
  test("S6-11 · HU-003 · se cambian nombre y dominio (en minúsculas) y se ignora lo que no es editable", async () => {
    preparar({ tablas: base() });
    const r = await TenantService.update("t1", { name: "Empresa SAS", domain: "EMPRESA.CO", id: "hack", created_at: "1999" });
    assert.equal(r.name, "Empresa SAS");
    assert.equal(r.domain, "empresa.co");
    assert.equal(r.id, "t1");
    const fila = estado.tablas.tenants.find((t) => t.id === "t1");
    assert.equal(fila.domain, "empresa.co");
    assert.equal(fila.created_at, "2026-01-01");
  });

  test("S6-12 · HU-003 · editar o eliminar una organización que no existe responde 404",
    { todo: "posible bug: TenantService lanza 'Tenant no encontrado' sin status 404 (services/tenantService.js:63 y :78) y el controlador lo devuelve como 400 (controllers/tenantController.js:37 y :46)" },
    async () => {
      preparar({ tablas: base() });
      await rechaza(TenantService.update("no-existe", { name: "X" }), 404);
      await rechaza(TenantService.delete("no-existe"), 404);
    });
});

describe("Activar o desactivar organización", () => {
  test("S6-13 · HU-004 · una organización desactivada deja de resolverse por su dominio y al reactivarla vuelve", async () => {
    preparar({ tablas: base() });
    await TenantService.update("t1", { active: false });
    assert.equal(await TenantService.getByDomain("EMPRESA.COM"), null);
    assert.equal((await TenantService.getById("t1")).active, false);

    // Un texto "true" no es un booleano: no cambia el estado por error.
    await TenantService.update("t1", { active: "true" });
    assert.equal((await TenantService.getById("t1")).active, false);

    await TenantService.update("t1", { active: true });
    assert.equal((await TenantService.getByDomain("empresa.com")).id, "t1");
  });

  test("S6-14 · HU-004 · una persona de una organización desactivada no puede iniciar sesión con contraseña",
    async () => {
      const tablas = base();
      tablas.tenants[0].active = false;
      tablas.users = [{ id: "u1", email: "luis@empresa.com", role: "student", tenant_id: "t1", password: await bcrypt.hash("clave-segura", 4) }];
      preparar({ tablas });
      const res = { codigo: 200, status(c) { this.codigo = c; return this; }, json(b) { this.cuerpo = b; return this; } };
      await AuthService.local({ body: { email: "luis@empresa.com", password: "clave-segura" } }, res);
      assert.equal(res.codigo, 403);
      assert.equal(res.cuerpo.token, undefined);
    });
});

describe("Eliminar organización", () => {
  test("S6-15 · HU-005 · eliminar una organización la quita sin tocar las demás", async () => {
    preparar({ tablas: base() });
    assert.equal(await TenantService.delete("t2"), "t2");
    assert.deepEqual(estado.tablas.tenants.map((t) => t.id), ["t1"]);
    await assert.rejects(TenantService.delete("t2"), /no encontrado/);
  });
});

describe("Ver mis grupos", () => {
  test("S6-16 · HU-025 · cada persona ve solo los grupos a los que pertenece, y una sin grupos recibe una lista vacía", async () => {
    preparar({
      tablas: {
        groups: [
          { id: "g1", name: "Ventas", tenant_id: "t1" },
          { id: "g2", name: "Nuevos", tenant_id: "t1" },
          { id: "g3", name: "Soporte", tenant_id: "t1" },
        ],
        users_groups: [
          { id_user: "u1", id_group: "g1" },
          { id_user: "u1", id_group: "g2" },
          { id_user: "u2", id_group: "g3" },
        ],
      },
    });
    const mios = await GroupService.getByUser("u1");
    assert.deepEqual(mios.map((g) => g.id).sort(), ["g1", "g2"]);
    assert.equal(mios[0].tenantId, "t1");
    assert.equal("tenant_id" in mios[0], false);
    assert.deepEqual(await GroupService.getByUser("u9"), []);
  });
});

describe("Crear un examen", () => {
  test("S6-17 · HU-041 · guardar manda configuración y preguntas a la base en una sola operación", async () => {
    let llamada;
    preparar({ tablas: base(), rpc: (fn, args) => { llamada = { fn, args }; return { data: null, error: null }; } });

    const r = await ExamenService.guardar("ex1", instructor, {
      tiempoLimite: 20,
      preguntas: [
        { id: "p1", enunciado: "¿Editada?", opciones },
        { enunciado: "Nueva", opciones, puntaje: 3 },
      ],
    });

    assert.equal(r.message, "Examen guardado");
    assert.equal(r.examen.actividadId, "ex1");
    assert.equal(llamada.fn, "guardar_examen");
    assert.deepEqual(llamada.args.p_config, { tiempo_limite: 20 });
    const [editada, nueva] = llamada.args.p_preguntas;
    assert.equal(editada.id, "p1");
    assert.equal(editada.nuevoId, null);
    assert.equal(nueva.id, null);
    assert.ok(nueva.nuevoId);
    assert.equal(nueva.puntaje, 3);
    assert.ok(nueva.opciones.every((o) => o.id));
  });

  test("S6-18 · HU-041 · con intentos registrados las preguntas ya no se cambian (409), pero la configuración sí", async () => {
    const tablas = base();
    tablas.intentos_examen = [{ id: "i1", activity_id: "ex1", user_id: "u1", numero: 1, estado: "finalizado" }];
    const llamadas = [];
    preparar({ tablas, rpc: (fn, args) => { llamadas.push(args); return { data: null, error: null }; } });

    await rechaza(ExamenService.guardar("ex1", admin, { preguntas: [{ id: "p1", enunciado: "Otra", opciones }] }), 409, "intento");
    assert.equal(llamadas.length, 0);

    await ExamenService.guardar("ex1", admin, { porcentajeAprobacion: 80 });
    assert.equal(llamadas.length, 1);
    assert.equal(llamadas[0].p_preguntas, null);
    assert.deepEqual(llamadas[0].p_config, { porcentaje_aprobacion: 80 });
  });

  test("S6-19 · HU-041 · el aprendiz nunca recibe cuál es la opción correcta", async () => {
    preparar({ tablas: base() });

    const paraQuienLoArma = await ExamenService.obtener("ex1", instructor);
    assert.equal(paraQuienLoArma.preguntas[0].opciones.find((o) => o.id === "o1").esCorrecta, true);

    const vista = await ExamenService.obtener("ex1", aprendiz, { paraResolver: true });
    assert.ok(vista.preguntas[0].opciones.every((o) => !("esCorrecta" in o)));

    const { examen, intento } = await ExamenService.iniciar("ex1", aprendiz);
    assert.equal(intento.numero, 1);
    assert.ok(examen.preguntas.every((p) => p.opciones.every((o) => !("esCorrecta" in o))));
  });

  test("S6-20 · HU-041 · instructor que no dicta el curso (403), pregunta de otro examen (400) u otra organización (404)", async () => {
    let llamadas = 0;
    preparar({ tablas: base(), rpc: () => { llamadas++; return { data: null, error: null }; } });

    await rechaza(ExamenService.guardar("ex1", instructorAjeno, { tiempoLimite: 10 }), 403);
    await rechaza(ExamenService.guardar("ex1", admin, { preguntas: [{ id: "pX", enunciado: "x", opciones }] }), 400, "no es de este examen");
    await rechaza(ExamenService.guardar("ex1", adminAjeno, { tiempoLimite: 10 }), 404);
    await rechaza(ExamenService.guardar("tar1", admin, { tiempoLimite: 10 }), 409, "no es un examen");
    assert.equal(llamadas, 0);
  });
});

describe("Subir entrega", () => {
  test("S6-21 · HU-046 · la primera entrega se registra y al reemplazarla se borra el archivo anterior", async () => {
    preparar({ tablas: base() });

    const primera = await EntregaService.entregar("tar1", aprendiz, { archivo: archivo("v1.docx"), comentario: " listo " });
    assert.equal(primera.message, "Entrega registrada.");
    assert.equal(primera.entrega.estado, "entregado");
    assert.equal(primera.entrega.comentario, "listo");
    const rutaVieja = primera.entrega.archivo;

    const segunda = await EntregaService.entregar("tar1", aprendiz, { archivo: archivo("v2.docx") });
    assert.equal(segunda.message, "Entrega reemplazada.");
    assert.notEqual(segunda.entrega.archivo, rutaVieja);
    assert.equal(segunda.entrega.comentario, "listo"); // se conserva si no se manda otro
    assert.deepEqual(storage.borrados, [rutaVieja]);
    assert.equal(estado.tablas.entregas.length, 1);
  });

  test("S6-22 · HU-046 · una entrega aprobada no se puede reemplazar", async () => {
    const tablas = base();
    tablas.entregas = [{ id: "e1", activity_id: "tar1", user_id: "u1", tenant_id: "t1", estado: "aprobada", archivo: "t1/ok.pdf" }];
    preparar({ tablas });

    await rechaza(EntregaService.entregar("tar1", aprendiz, { archivo: archivo() }), 409, "aprobada");
    assert.equal(storage.subidos.length, 0);
    assert.equal(estado.tablas.entregas[0].archivo, "t1/ok.pdf");
  });

  test("S6-23 · HU-046 · no se entrega en una actividad sin entrega (409), vacía (400), de curso no publicado (409) ni de otra organización (404)", async () => {
    preparar({ tablas: base() });
    await rechaza(EntregaService.entregar("rec1", aprendiz, { comentario: "hola" }), 409, "no admite");
    await rechaza(EntregaService.entregar("tar1", aprendiz, { comentario: "   " }), 400);
    await rechaza(EntregaService.entregar("tar1", { ...aprendiz, tenantId: "t2" }, { comentario: "hola" }), 404);

    estado.tablas.courses[0].status = "Cerrado";
    await rechaza(EntregaService.entregar("tar1", aprendiz, { comentario: "hola" }), 409, "no está publicado");
    assert.equal(estado.tablas.entregas.length, 0);
  });
});
