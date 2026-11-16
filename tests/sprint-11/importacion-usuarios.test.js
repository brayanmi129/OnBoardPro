// Sprint 11 · Carga masiva de usuarios desde archivo (HU-019).
const { preparar, estado } = require("../soporte/supabaseFalso.js");
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const ExcelJS = require("exceljs");
const ImportacionService = require("../../services/importacionService.js");

const admin = { id: "adm", role: "admin", tenantId: "t1" };
const csv = (texto) => ({ originalname: "usuarios.csv", buffer: Buffer.from(texto, "utf8") });

const base = () => preparar({
  tablas: {
    tenants: [{ id: "t1", name: "Acme" }, { id: "t2", name: "Otra" }],
    groups: [{ id: "g1", name: "Comercial", tenant_id: "t1" }, { id: "gx", name: "Bodega", tenant_id: "t2" }],
    users: [{ id: "x1", email: "ya@otra.com", tenant_id: "t2" }],
    users_groups: [],
  },
});

const ARCHIVO = [
  "nombre,apellido,correo,rol,telefono,grupo",
  "Ana,Martínez,ana@acme.com,aprendiz,300,comercial",
  ",Sin nombre,sin@acme.com,,,",
  "Beto,Rojas,no-es-correo,instructor,,",
  "Caro,Díaz,ya@otra.com,,,",
  "Dani,Paz,ana@acme.com,,,",
  "Eva,Gil,eva@acme.com,admin,,Bodega",
  '"Fer, hijo","De la ""Torre""",fer@acme.com,Instructor,,',
].join("\r\n");

describe("Carga masiva de usuarios", () => {
  test("S11-14 · HU-019 · la plantilla es un CSV con BOM, las columnas esperadas y dos ejemplos", () => {
    const p = ImportacionService.plantilla();
    assert.ok(p.startsWith("﻿"));
    const lineas = p.replace("﻿", "").trim().split("\r\n");
    assert.equal(lineas[0], "nombre,apellido,correo,rol,telefono,grupo");
    assert.equal(lineas.length, 3);
  });

  test("S11-15 · HU-019 · la vista previa marca errores por fila con el número de fila del archivo", async () => {
    base();
    const r = await ImportacionService.previsualizar(csv(ARCHIVO), admin);
    const porFila = new Map(r.filas.map((f) => [f.fila, f]));
    assert.deepEqual(porFila.get(2).errores, []);
    assert.equal(porFila.get(2).datos.role, "student");
    assert.ok(porFila.get(3).errores.some((e) => /nombre/.test(e)));
    assert.ok(porFila.get(4).errores.some((e) => /no es válido/.test(e)));
    // Un grupo de otra organización no cuenta como existente; admin no es un rol permitido.
    assert.ok(porFila.get(7).errores.includes("El grupo Bodega no existe"));
    assert.ok(porFila.get(7).errores.some((e) => /rol admin/.test(e)));
    // Comillas con comas y comillas dobladas.
    assert.deepEqual([porFila.get(8).datos.firstname, porFila.get(8).datos.lastname, porFila.get(8).datos.role], ["Fer, hijo", 'De la "Torre"', "instructor"]);
    assert.equal(estado.escrituras.length, 0, "la vista previa no guarda nada");
  });

  test("S11-16 · HU-019 · los duplicados se marcan: ya registrado en cualquier organización o repetido en el archivo", async () => {
    base();
    const r = await ImportacionService.previsualizar(csv(ARCHIVO), admin);
    const dup = r.filas.filter((f) => f.duplicado).map((f) => f.fila);
    assert.deepEqual(dup, [5, 6]);
    assert.deepEqual(r.resumen, { total: 7, validas: 2, conErrores: 3, duplicadas: 2 });
  });

  test("S11-17 · HU-019 · importar crea solo las válidas, en la organización del admin, con su grupo, y reporta las omitidas", async () => {
    base();
    const r = await ImportacionService.importar(csv(ARCHIVO), admin);
    assert.equal(r.creados, 2);
    assert.equal(r.conGrupo, 1);
    assert.deepEqual(r.omitidas.map((o) => o.fila), [3, 4, 5, 6, 7]);
    assert.equal(r.omitidas.find((o) => o.fila === 5).motivo, "El correo ya está registrado.");
    assert.equal(r.omitidas.find((o) => o.fila === 6).motivo, "El correo se repite en el archivo.");
    const nuevos = estado.tablas.users.filter((u) => u.tenant_id === "t1");
    assert.deepEqual(nuevos.map((u) => [u.email, u.role, u.status]).sort(), [["ana@acme.com", "student", "Active"], ["fer@acme.com", "instructor", "Active"]]);
    assert.ok(nuevos.every((u) => !u.password));
    const ana = nuevos.find((u) => u.email === "ana@acme.com");
    assert.deepEqual(estado.tablas.users_groups, [{ id_user: ana.id, id_group: "g1" }]);
  });

  test("S11-18 · HU-019 · errores de archivo: tipo, vacío, sin columnas obligatorias o más de 1000 filas → 400", async () => {
    base();
    const err400 = (e) => e.status === 400;
    await assert.rejects(ImportacionService.previsualizar(null, admin), err400);
    await assert.rejects(ImportacionService.previsualizar({ originalname: "a.txt", buffer: Buffer.from("x") }, admin), err400);
    await assert.rejects(ImportacionService.previsualizar(csv("﻿\r\n\r\n"), admin), err400);
    await assert.rejects(ImportacionService.previsualizar(csv("nombre,apellido\nAna,Ruiz"), admin), /correo/);
    const muchas = ["nombre,correo", ...Array.from({ length: 1001 }, (_, i) => `P${i},p${i}@acme.com`)].join("\n");
    await assert.rejects(ImportacionService.previsualizar(csv(muchas), admin), /1000/);
  });

  test("S11-19 · HU-019 · el superadmin elige la organización con tenantId; sin él, 400, y una inexistente, 404", async () => {
    base();
    const sa = { id: "sa", role: "superadmin", tenantId: null };
    await assert.rejects(ImportacionService.previsualizar(csv(ARCHIVO), sa), (e) => e.status === 400);
    await assert.rejects(ImportacionService.previsualizar(csv(ARCHIVO), sa, "t9"), (e) => e.status === 404);
    const r = await ImportacionService.previsualizar(csv("nombre,correo,grupo\nZoe,zoe@x.com,Bodega"), sa, "t2");
    assert.deepEqual(r.filas[0].errores, []);
  });

  test("S11-20 · HU-019 · también lee .xlsx y separador punto y coma", async () => {
    base();
    const libro = new ExcelJS.Workbook();
    const hoja = libro.addWorksheet("Usuarios");
    hoja.addRow(["Nombre", "Apellido", "Correo electrónico", "Rol"]);
    hoja.addRow(["Gina", "Mora", { text: "Gina@Acme.com", hyperlink: "mailto:gina@acme.com" }, "Aprendiz"]);
    const buffer = Buffer.from(await libro.xlsx.writeBuffer());
    const r = await ImportacionService.previsualizar({ originalname: "u.XLSX", buffer }, admin);
    assert.deepEqual(r.filas.map((f) => [f.fila, f.datos.email, f.errores.length]), [[2, "gina@acme.com", 0]]);

    const r2 = await ImportacionService.previsualizar(csv("nombre;correo\nHugo;hugo@acme.com"), admin);
    assert.equal(r2.filas[0].datos.email, "hugo@acme.com");
  });
});
