// Sprint 10 · El ranking de la organización filtrado por grupo.
const { preparar } = require("../soporte/supabaseFalso.js");
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const GamificationService = require("../../services/gamificationService.js");

const base = () => preparar({
  tablas: {
    groups: [{ id: "g1", tenant_id: "t1" }, { id: "g2", tenant_id: "t1" }, { id: "gx", tenant_id: "t2" }],
    users_groups: [
      { id_user: "u1", id_group: "g1" }, { id_user: "u2", id_group: "g1" },
      { id_user: "u3", id_group: "g2" },
    ],
    users: [
      { id: "u1", firstname: "Ana", role: "student", tenant_id: "t1", xp: 100 },
      { id: "u2", firstname: "Beto", role: "student", tenant_id: "t1", xp: 300 },
      { id: "u3", firstname: "Caro", role: "student", tenant_id: "t1", xp: 200 },
    ],
  },
});
const ana = { id: "u1", role: "student", tenantId: "t1" };

describe("Ranking por grupo", () => {
  test("S10-38 · con grupoId solo aparecen sus integrantes, ordenados por XP", async () => {
    base();
    const r = await GamificationService.getRanking("t1", { grupoId: "g1", actor: ana });
    assert.deepEqual(r.map((u) => [u.firstname, u.posicion]), [["Beto", 1], ["Ana", 2]]);
  });

  test("S10-39 · un aprendiz no ve el ranking de un grupo al que no pertenece", async () => {
    base();
    await assert.rejects(GamificationService.getRanking("t1", { grupoId: "g2", actor: ana }), (e) => e.status === 404);
  });

  test("S10-40 · un grupo de otra organización responde 404, aunque lo pida un admin", async () => {
    base();
    const admin = { id: "a1", role: "admin", tenantId: "t1" };
    await assert.rejects(GamificationService.getRanking("t1", { grupoId: "gx", actor: admin }), (e) => e.status === 404);
    const r = await GamificationService.getRanking("t1", { grupoId: "g2", actor: admin });
    assert.deepEqual(r.map((u) => u.firstname), ["Caro"]);
  });
});
