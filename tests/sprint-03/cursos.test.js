// HU-026 · Crear curso: controlador, esquema zod y permisos de la ruta.
process.env.JWT_SECRET = "secreto-de-prueba-sprint-3";
require("../soporte/supabaseFalso.js");
const { preparar, estado, respuesta, pasarPor, enSilencio } = require("./soporte.js");
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const CourseController = require("../../controllers/courseController.js");
const verifyJWT = require("../../middlewares/jwt.js");
const requireRole = require("../../middlewares/requireRole.js");

const crear = (user, body) =>
  enSilencio(async () => {
    const res = respuesta();
    await CourseController.create({ user, body }, res);
    return res;
  });

const usuarios = [
  { id: "inst1", email: "instructor@acme.com", role: "instructor", status: "Active", tenant_id: "t1" },
  { id: "ext1", email: "instructor@globex.com", role: "instructor", status: "Active", tenant_id: "t2" },
];

describe("Crear curso", () => {
  test("S3-01 · HU-026 · un admin crea el curso en su empresa aunque el cuerpo pida otra, abierto por defecto", async () => {
    preparar({ tablas: { courses: [], users: usuarios } });
    const res = await crear(
      { id: "a1", role: "admin", tenantId: "t1" },
      { name: "Inducción", instructor: "instructor@acme.com", tenantId: "t2" }
    );
    assert.equal(res.statusCode, 201);
    assert.equal(res.cuerpo.tenantId, "t1");
    assert.equal(res.cuerpo.status, "Abierto");
    assert.match(res.cuerpo.id, /^[0-9a-f]{6}$/);
    assert.equal(estado.tablas.courses.length, 1);
    assert.equal(estado.tablas.courses[0].tenant_id, "t1");

    // El superadmin no tiene empresa propia: es el único que la elige.
    const sa = await crear({ id: "s1", role: "superadmin" }, { name: "Global", instructor: "instructor@globex.com", tenantId: "t2" });
    assert.equal(sa.statusCode, 201);
    assert.equal(sa.cuerpo.tenantId, "t2");
  });

  test("S3-02 · HU-026 · sin instructor, con correo inválido, nombre de más de 50 o estado desconocido responde 400 y nombra el campo", async () => {
    preparar({ tablas: { courses: [] } });
    const admin = { id: "a1", role: "admin", tenantId: "t1" };
    const casos = [
      [{ name: "Curso" }, "instructor"],
      [{ name: "Curso", instructor: "no-es-correo" }, "instructor"],
      [{ name: "x".repeat(51), instructor: "a@acme.com" }, "name"],
      [{ name: "", instructor: "a@acme.com" }, "name"],
      [{ name: "Curso", instructor: "a@acme.com", status: "Publicado" }, "status"],
    ];
    for (const [body, campo] of casos) {
      const res = await crear(admin, body);
      assert.equal(res.statusCode, 400, JSON.stringify(body));
      assert.ok(res.cuerpo.campos.some((c) => c.campo === campo), `debería señalar ${campo}`);
    }
    assert.equal(estado.tablas.courses.length, 0, "no se guarda nada inválido");
  });

  test("S3-03 · HU-026 · la ruta exige sesión (401) y rol de admin o instructor: un aprendiz recibe 403", async () => {
    preparar({ tablas: { courses: [] } });
    const cadena = [verifyJWT, requireRole("admin", "superadmin", "instructor"), CourseController.create];
    const body = { name: "Seguridad", instructor: "instructor@acme.com" };
    const token = (role) => jwt.sign({ id: "x", role, tenantId: "t1" }, process.env.JWT_SECRET);

    const sinToken = await pasarPor(cadena, { headers: {}, body });
    assert.equal(sinToken.statusCode, 401);

    const falsificado = jwt.sign({ id: "x", role: "admin", tenantId: "t1" }, "otro-secreto");
    const firmaMala = await pasarPor(cadena, { headers: { authorization: `Bearer ${falsificado}` }, body });
    assert.equal(firmaMala.statusCode, 401);

    const aprendiz = await pasarPor(cadena, { headers: { authorization: `Bearer ${token("student")}` }, body });
    assert.equal(aprendiz.statusCode, 403);
    assert.equal(estado.tablas.courses.length, 0);

    const instructor = await enSilencio(() =>
      pasarPor(cadena, { headers: { authorization: `Bearer ${token("instructor")}` }, body: { ...body } })
    );
    assert.equal(instructor.statusCode, 201);
  });

  test(
    "S3-04 · HU-026 · el instructor indicado al crear debe existir en la organización del curso",
    {
      todo:
        "posible bug: createCourse (services/courseService.js:148) no valida el instructor como sí lo hace " +
        "_instructorValido al editar; acepta correos inexistentes o de otra organización",
    },
    async () => {
      preparar({ tablas: { courses: [], users: usuarios } });
      const admin = { id: "a1", role: "admin", tenantId: "t1" };
      const deOtra = await crear(admin, { name: "Curso", instructor: "instructor@globex.com" });
      assert.equal(deOtra.statusCode, 400);
      const inexistente = await crear(admin, { name: "Curso", instructor: "nadie@acme.com" });
      assert.equal(inexistente.statusCode, 400);
    }
  );
});
