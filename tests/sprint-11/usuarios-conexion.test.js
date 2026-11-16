// Sprint 11 · Listado de usuarios: filtro por rol y última conexión (HU-015).
const { preparar } = require("../soporte/supabaseFalso.js");
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const UserService = require("../../services/userService.js");

const usuarios = () => [
  { id: "u1", tenant_id: "t1", firstname: "Ana", lastname: "Ruiz", email: "ana@acme.com", role: "student", status: "Active", password: "h", ultima_actividad: "2026-11-10" },
  { id: "u2", tenant_id: "t1", firstname: "Beto", lastname: "Paz", email: "beto@acme.com", role: "instructor", status: "Active", password: "h", ultima_actividad: null },
  { id: "u3", tenant_id: "t1", firstname: "Carla", lastname: "Gil", email: "carla@acme.com", role: "admin", status: "Inactive", password: "h", ultima_actividad: null },
  { id: "u4", tenant_id: "t1", firstname: "Dani", lastname: "Sol", email: "dani@acme.com", role: "student", status: "Active", password: "h", ultima_actividad: "2026-11-01" },
];
const tenants = [{ id: "t1", name: "Acme" }];

describe("Listado de usuarios para la administración", () => {
  test("S11-34 · HU-015 · cada usuario trae su última conexión: el día más reciente entre accesos y actividad, o null", async () => {
    preparar({
      tablas: {
        users: usuarios(),
        tenants,
        accesos_diarios: [
          { user_id: "u1", dia: "2026-11-08" },
          { user_id: "u1", dia: "2026-11-09" },
          { user_id: "u2", dia: "2026-11-15" },
          { user_id: "u2", dia: "2026-11-12" },
        ],
      },
    });
    const r = await UserService.getAll("t1");
    const de = (id) => r.usuarios.find((u) => u.id === id).ultimaConexion;
    assert.equal(de("u1"), "2026-11-10", "la actividad es más reciente que el último acceso");
    assert.equal(de("u2"), "2026-11-15", "entró sin ganar XP");
    assert.equal(de("u3"), null, "nunca entró");
    assert.equal(de("u4"), "2026-11-01");
  });

  test("S11-35 · HU-015 · el filtro por rol devuelve solo ese rol, con su última conexión", async () => {
    preparar({ tablas: { users: usuarios(), tenants, accesos_diarios: [{ user_id: "u2", dia: "2026-11-15" }] } });
    const instructores = await UserService.getAll("t1", { rol: "instructor" });
    assert.deepEqual(instructores.usuarios.map((u) => [u.id, u.ultimaConexion]), [["u2", "2026-11-15"]]);
    const aprendices = await UserService.getAll("t1", { rol: "student" });
    assert.deepEqual(aprendices.usuarios.map((u) => u.id).sort(), ["u1", "u4"]);
  });
});
