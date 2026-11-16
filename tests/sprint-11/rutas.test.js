// Sprint 11 · Las rutas nuevas de punta a punta por HTTP: permisos, orden de
// las rutas y subida de archivos. La base sigue siendo la falsa.
const { preparar } = require("../soporte/supabaseFalso.js");
const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = process.env.JWT_SECRET || "secreto-de-prueba";

let servidor;
let url;
const token = (u) => `Bearer ${jwt.sign(u, process.env.JWT_SECRET)}`;
const aprendiz = token({ id: "u1", role: "student", tenantId: "t1", email: "u1@acme.com" });
const instructor = token({ id: "i1", role: "instructor", tenantId: "t1", email: "i1@acme.com" });
const admin = token({ id: "adm", role: "admin", tenantId: "t1", email: "adm@acme.com" });

const base = () => preparar({
  tablas: {
    tenants: [{ id: "t1", name: "Acme", active: true }],
    users: [{ id: "u1", firstname: "Ana", role: "student", status: "Active", tenant_id: "t1", xp: 0 }],
    groups: [], users_groups: [], courses: [], sections: [], activities: [],
    entregas: [], xp_movimientos: [],
  },
});

before(async () => {
  const app = express();
  app.use(express.json());
  app.use("/api/users", require("../../routes/userRoutes.js"));
  app.use("/api/gamification", require("../../routes/gamificationRoutes.js"));
  app.use("/api/dashboard", require("../../routes/dashboardRoutes.js"));
  app.use("/api", require("../../routes/entregasRoutes.js"));
  await new Promise((ok) => { servidor = app.listen(0, "127.0.0.1", ok); });
  url = `http://127.0.0.1:${servidor.address().port}/api`;
});
after(() => servidor.close());

const subir = (ruta, nombre, contenido, auth) => {
  const form = new FormData();
  form.append("archivo", new Blob([contenido]), nombre);
  return fetch(`${url}${ruta}`, { method: "POST", body: form, headers: { Authorization: auth } });
};

describe("Rutas nuevas por HTTP", () => {
  test("S11-27 · HU-049 · GET /entregas/mias responde la lista del aprendiz y no choca con la bandeja", async () => {
    base();
    const r = await fetch(`${url}/entregas/mias`, { headers: { Authorization: aprendiz } });
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), []);
    // La bandeja sigue siendo de quien corrige.
    assert.equal((await fetch(`${url}/entregas`, { headers: { Authorization: aprendiz } })).status, 403);
  });

  test("S11-28 · HU-056 · GET /gamification/me/movimientos responde { movimientos }", async () => {
    base();
    const r = await fetch(`${url}/gamification/me/movimientos?limite=500`, { headers: { Authorization: aprendiz } });
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), { movimientos: [] });
  });

  test("S11-29 · HU-057 · GET /gamification/ranking?periodo=anual responde 400", async () => {
    base();
    const r = await fetch(`${url}/gamification/ranking?periodo=anual`, { headers: { Authorization: aprendiz } });
    assert.equal(r.status, 400);
    const ok = await fetch(`${url}/gamification/ranking?periodo=mes`, { headers: { Authorization: aprendiz } });
    assert.equal(ok.status, 200);
  });

  test("S11-30 · HU-019 · la plantilla se descarga como CSV adjunto; instructor y aprendiz reciben 403", async () => {
    base();
    const r = await fetch(`${url}/users/import/plantilla`, { headers: { Authorization: admin } });
    assert.equal(r.status, 200);
    assert.match(r.headers.get("content-type"), /text\/csv/);
    assert.match(r.headers.get("content-disposition"), /attachment; filename="plantilla-usuarios.csv"/);
    const bytes = new Uint8Array(await r.arrayBuffer());
    assert.deepEqual([...bytes.slice(0, 3)], [0xef, 0xbb, 0xbf]);
    assert.equal((await fetch(`${url}/users/import/plantilla`, { headers: { Authorization: instructor } })).status, 403);
    assert.equal((await subir("/users/import/preview", "u.csv", "nombre,correo\nA,a@a.com", aprendiz)).status, 403);
  });

  test("S11-31 · HU-019 · preview e import por multipart; un tipo no permitido o más de 2 MB responde 400", async () => {
    base();
    const p = await subir("/users/import/preview", "u.csv", "nombre,correo\nAna,nueva@acme.com", admin);
    assert.equal(p.status, 200);
    assert.deepEqual((await p.json()).resumen, { total: 1, validas: 1, conErrores: 0, duplicadas: 0 });
    const i = await subir("/users/import", "u.csv", "nombre,correo\nAna,nueva@acme.com", admin);
    assert.equal(i.status, 200);
    assert.equal((await i.json()).creados, 1);
    assert.equal((await subir("/users/import/preview", "u.pdf", "x", admin)).status, 400);
    const grande = await subir("/users/import/preview", "u.csv", "x".repeat(2 * 1024 * 1024 + 10), admin);
    assert.equal(grande.status, 400);
    assert.match((await grande.json()).message, /2 MB/);
  });

  test("S11-32 · HU-078 · GET /dashboard: admin 200, instructor y aprendiz 403", async () => {
    base();
    const r = await fetch(`${url}/dashboard?dias=7`, { headers: { Authorization: admin } });
    assert.equal(r.status, 200);
    assert.equal((await r.json()).alcance, "organizacion");
    assert.equal((await fetch(`${url}/dashboard`, { headers: { Authorization: instructor } })).status, 403);
    assert.equal((await fetch(`${url}/dashboard`, { headers: { Authorization: aprendiz } })).status, 403);
    assert.equal((await fetch(`${url}/dashboard?dias=200`, { headers: { Authorization: admin } })).status, 400);
  });
});
