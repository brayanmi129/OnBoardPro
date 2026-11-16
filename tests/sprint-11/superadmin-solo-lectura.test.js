// Sprint 11 · El superadmin consulta las organizaciones pero no las gestiona:
// solo puede dar de alta a su administrador y manejar lo que es de la
// plataforma (organizaciones y logros genéricos). La base es la falsa.
const { preparar } = require("../soporte/supabaseFalso.js");
const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const jwt = require("jsonwebtoken");
const { MENSAJE } = require("../../middlewares/soloLectura.js");
const LogroService = require("../../services/logroService.js");

process.env.JWT_SECRET = process.env.JWT_SECRET || "secreto-de-prueba";

const token = (u) => `Bearer ${jwt.sign(u, process.env.JWT_SECRET)}`;
const superadmin = token({ id: "sa", role: "superadmin", tenantId: null, email: "root@onboardpro.com" });
const admin = token({ id: "adm", role: "admin", tenantId: "t1", email: "adm@acme.com" });

const ARCHIVOS = {
  users: "../../routes/userRoutes.js",
  courses: "../../routes/coursesRoutes.js",
  activities: "../../routes/activitiesRoutes.js",
  groups: "../../routes/groupsRoutes.js",
  tenants: "../../routes/tenantRoutes.js",
  logros: "../../routes/logrosRoutes.js",
  niveles: "../../routes/nivelesRoutes.js",
  sections: "../../routes/sectionsRoutes.js",
  entregas: "../../routes/entregasRoutes.js",
  examenes: "../../routes/examenesRoutes.js",
  materiales: "../../routes/materialesRoutes.js",
};

let servidor;
let url;

before(async () => {
  const app = express();
  app.use(express.json());
  app.use("/api/users", require(ARCHIVOS.users));
  app.use("/api/courses", require(ARCHIVOS.courses));
  app.use("/api/groups", require(ARCHIVOS.groups));
  app.use("/api/gamification", require(ARCHIVOS.logros));
  await new Promise((ok) => { servidor = app.listen(0, "127.0.0.1", ok); });
  url = `http://127.0.0.1:${servidor.address().port}/api`;
});
after(() => servidor.close());

const pedir = (metodo, ruta, auth, cuerpo) => fetch(`${url}${ruta}`, {
  method: metodo,
  headers: { Authorization: auth, "Content-Type": "application/json" },
  body: cuerpo ? JSON.stringify(cuerpo) : undefined,
});

/** Los nombres de los middlewares de cada ruta de escritura de un router. */
function escrituras(router) {
  return router.stack
    .filter((capa) => capa.route)
    .flatMap((capa) => Object.keys(capa.route.methods)
      .filter((m) => m !== "get")
      .map((m) => ({ ruta: `${m.toUpperCase()} ${capa.route.path}`, pasos: capa.route.stack.map((s) => s.name) })));
}

// Escrituras que no son del superadmin por ser de otro rol: entregar,
// completar o rendir es del aprendiz, y la sesión propia (auth) es de todos.
const DE_OTRO_ROL = new Set([
  "POST /activities/:id/entrega",
  "POST /activities/:id/examen/iniciar",
  "POST /activities/:id/examen/responder",
  // Editar o borrar un logro depende de si es genérico, cosa que solo se sabe
  // leyéndolo: lo controla el servicio (S11-40).
  "PUT /logros/:id",
  "DELETE /logros/:id",
]);
const GUARDIANES = new Set(["soloLectura", "soloCreaAdministradores", "soloLogrosGenericos", "soloVistaPreviaGenerica"]);

describe("Superadmin en modo consulta", () => {
  test("S11-36 · HU-001 · toda escritura dentro de una organización pasa por un control del superadmin; las de organizaciones no", () => {
    const sinControl = [];
    for (const [nombre, archivo] of Object.entries(ARCHIVOS)) {
      for (const r of escrituras(require(archivo))) {
        const controlado = r.pasos.some((p) => GUARDIANES.has(p));
        if (nombre === "tenants") {
          assert.equal(controlado, false, `${r.ruta} es de la plataforma y debe seguir abierta al superadmin`);
          continue;
        }
        if (DE_OTRO_ROL.has(r.ruta)) continue;
        if (!controlado) sinControl.push(`${nombre}: ${r.ruta}`);
      }
    }
    assert.deepEqual(sinControl, [], "rutas de escritura sin control del superadmin");
  });

  test("S11-37 · HU-001 · el superadmin recibe 403 al crear, editar o borrar en una organización, y puede seguir consultando", async () => {
    preparar({ tablas: { courses: [], groups: [], users: [], tenants: [{ id: "t1", name: "Acme", active: true }] } });
    for (const [metodo, ruta, cuerpo] of [
      ["POST", "/courses/create", { name: "Inducción", tenantId: "t1" }],
      ["PUT", "/courses/c1/publicar", {}],
      ["DELETE", "/courses/delete/c1"],
      ["POST", "/groups/create", { name: "Cohorte", tenantId: "t1" }],
      ["PUT", "/users/update/u1", { firstname: "Ana" }],
      ["DELETE", "/users/delete/u1"],
    ]) {
      const r = await pedir(metodo, ruta, superadmin, cuerpo);
      assert.equal(r.status, 403, `${metodo} ${ruta}`);
      assert.equal((await r.json()).message, MENSAJE);
    }
    const lista = await pedir("GET", "/courses/get/all", superadmin);
    assert.equal(lista.status, 200);
  });

  test("S11-38 · HU-014 · el superadmin solo crea administradores; un aprendiz o un instructor responde 403", async () => {
    preparar({ tablas: { users: [], tenants: [{ id: "t1", name: "Acme", active: true }] } });
    for (const role of ["student", "instructor", undefined]) {
      const r = await pedir("POST", "/users/create", superadmin, { email: `x-${role}@acme.com`, firstname: "X", lastname: "Y", role, tenantId: "t1" });
      assert.equal(r.status, 403, `rol ${role}`);
      assert.match((await r.json()).message, /solo puede crear administradores/);
    }
    const imp = await pedir("POST", "/users/import/preview", superadmin, {});
    assert.equal(imp.status, 403, "la carga masiva tampoco");
    // El control no le cierra el paso al admin de la organización.
    const delAdmin = await pedir("POST", "/users/create", admin, { email: "nuevo@acme.com", role: "student" });
    assert.notEqual(delAdmin.status, 403);
  });

  test("S11-39 · HU-059 · el superadmin no cierra periodos de ranking ni crea logros de una organización; los genéricos sí", async () => {
    preparar({ tablas: { logros: [], courses: [], tenants: [{ id: "t1", name: "Acme", active: true }] } });
    const cierre = await pedir("POST", "/gamification/logros/cierre-ranking", superadmin, { tenantId: "t1" });
    assert.equal(cierre.status, 403);
    const deOrg = await pedir("POST", "/gamification/logros", superadmin, { nombre: "Puntual", tenantId: "t1" });
    assert.equal(deOrg.status, 403);
    const previa = await pedir("POST", "/gamification/logros/vista-previa", superadmin, { tenantId: "t1" });
    assert.equal(previa.status, 403);
    const generico = await pedir("POST", "/gamification/logros", superadmin, { generico: true });
    assert.notEqual(generico.status, 403, "un logro genérico es de la plataforma");
  });

  test("S11-40 · HU-059 · el superadmin edita y borra solo los logros genéricos", async () => {
    const logro = (id, tenant_id) => ({
      id, tenant_id, nombre: id, descripcion: "", categoria: "Progreso", tipo_condicion: "actividades_completadas",
      meta: 1, xp_recompensa: 0, activo: true, course_id: null, icono: null,
    });
    preparar({ tablas: { logros: [logro("l-org", "t1"), logro("l-gen", null)] } });
    const sa = { id: "sa", role: "superadmin", tenantId: null };
    await assert.rejects(LogroService.actualizar("l-org", sa, { nombre: "Otro" }), (e) => e.status === 403 && e.message === MENSAJE);
    await assert.rejects(LogroService.eliminar("l-org", sa), (e) => e.status === 403);
    const r = await LogroService.actualizar("l-gen", sa, { nombre: "Genérico nuevo" });
    assert.equal(r.logro.nombre, "Genérico nuevo");
  });
});

describe("Alta y edición de usuarios", () => {
  const UserController = require("../../controllers/userController.js");
  const { estado } = require("../soporte/supabaseFalso.js");
  const actorAdmin = { id: "adm", email: "adm@acme.com", role: "admin", tenantId: "t1" };
  const actorSuper = { id: "sa", email: "root@onboardpro.com", role: "superadmin", tenantId: null };
  const llamar = async (fn, req) => {
    const res = { statusCode: 200, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } };
    await fn(req, res);
    return res;
  };
  const base = () => preparar({
    tablas: {
      tenants: [{ id: "t1", name: "Acme", active: true }],
      users: [{ id: "u1", tenant_id: "t1", email: "ana@acme.com", firstname: "Ana", role: "student", status: "Active", xp: 120, level: 1, streak: 3 }],
    },
  });
  const insertado = () => estado.escrituras.find((e) => e.tabla === "users" && e.operacion === "insert")?.valores;
  const actualizado = () => estado.escrituras.find((e) => e.tabla === "users" && e.operacion === "update")?.valores;

  test("S11-41 · HU-014 · XP, nivel, racha, promedio y misiones no se fijan al crear ni al editar: se ganan usando la plataforma", async () => {
    base();
    const nuevo = await llamar(UserController.create, {
      user: actorAdmin,
      body: { email: "beto@acme.com", firstname: "Beto", role: "student", xp: 900, level: 7, streak: 30, average: 5, missions: "todas" },
    });
    assert.equal(nuevo.statusCode, 201);
    const fila = insertado();
    assert.equal(fila.xp, 0);
    assert.equal(fila.level, 0);
    assert.ok(!fila.streak, "la racha arranca vacía");
    assert.equal(fila.average ?? null, null);

    base();
    const editado = await llamar(UserController.updateUser, {
      user: actorAdmin,
      params: { id: "u1" },
      body: { firstname: "Ana María", xp: 5000, level: 9, streak: 99 },
    });
    assert.equal(editado.statusCode, 200);
    const cambios = actualizado();
    assert.equal(cambios.firstname, "Ana María");
    for (const campo of ["xp", "level", "streak"]) assert.equal(campo in cambios, false, `${campo} no se toca`);
  });

  test("S11-42 · HU-014 · nadie crea ni asciende a superadmin; el superadmin solo crea administradores y con organización", async () => {
    base();
    for (const actor of [actorAdmin, actorSuper]) {
      const alta = await llamar(UserController.create, { user: actor, body: { email: `x${actor.id}@acme.com`, role: "superadmin", tenantId: "t1" } });
      assert.equal(alta.statusCode, 403, `alta por ${actor.role}`);
      const ascenso = await llamar(UserController.updateUser, { user: actor, params: { id: "u1" }, body: { role: "superadmin" } });
      assert.equal(ascenso.statusCode, 403, `ascenso por ${actor.role}`);
    }
    const aprendiz = await llamar(UserController.create, { user: actorSuper, body: { email: "c@acme.com", role: "student", tenantId: "t1" } });
    assert.equal(aprendiz.statusCode, 403);
    const sinOrg = await llamar(UserController.create, { user: actorSuper, body: { email: "d@acme.com", role: "admin" } });
    assert.equal(sinOrg.statusCode, 400);
    const ok = await llamar(UserController.create, { user: actorSuper, body: { email: "e@acme.com", firstname: "Eva", role: "admin", tenantId: "t1" } });
    assert.equal(ok.statusCode, 201);
    assert.equal(ok.body.tenantId, "t1");
    assert.equal(estado.escrituras.filter((e) => e.tabla === "users" && e.operacion === "insert").length, 1);
  });
});
