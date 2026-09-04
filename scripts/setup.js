/**
 * Setup completo de OnBoardPro sobre Supabase.
 *
 * Borra TODA la data existente y recrea el set de prueba:
 * 2 tenants, 17 usuarios, 4 grupos, 6 cursos, 14 actividades y sus relaciones.
 *
 * Uso:
 *   node scripts/setup.js          → borra y recrea todo
 *   node scripts/setup.js --keep   → solo inserta lo que falte (no borra)
 *
 * Requiere en .env: SUPABASE_URL y SUPABASE_SECRET_KEY
 */
require("dotenv").config();
const { supabase } = require("../helpers/supabaseHelper.js");
const bcrypt = require("bcrypt");
const fs = require("fs");
const path = require("path");

const DEFAULT_PASSWORD = "Test1234!";
const KEEP = process.argv.includes("--keep");

// ─── IDs fijos para reproducibilidad ─────────────────────────────────────────
const IDS = {
  tenants: { uc: "tenant-uc", un: "tenant-un" },
  users: {
    superadmin: "u-super",
    adminUc: "u-adm-uc",
    adminUn: "u-adm-un",
    instrUc1: "u-ins-uc1",
    instrUc2: "u-ins-uc2",
    instrUn1: "u-ins-un1",
    instrUn2: "u-ins-un2",
    studUc1: "u-stu-uc1",
    studUc2: "u-stu-uc2",
    studUc3: "u-stu-uc3",
    studUc4: "u-stu-uc4",
    studUc5: "u-stu-uc5",
    studUn1: "u-stu-un1",
    studUn2: "u-stu-un2",
    studUn3: "u-stu-un3",
    studUn4: "u-stu-un4",
    studUn5: "u-stu-un5",
  },
  groups: { ucA: "grp-uc-a", ucB: "grp-uc-b", unA: "grp-un-a", unB: "grp-un-b" },
  courses: {
    poo: "crs-poo",
    bd: "crs-bd",
    redes: "crs-redes",
    calc: "crs-calc",
    fisica: "crs-fisica",
    quim: "crs-quim",
  },
  activities: {
    poo1: "act-poo1", poo2: "act-poo2", poo3: "act-poo3",
    bd1: "act-bd1", bd2: "act-bd2",
    red1: "act-red1", red2: "act-red2",
    cal1: "act-cal1", cal2: "act-cal2", cal3: "act-cal3",
    fis1: "act-fis1", fis2: "act-fis2",
    qui1: "act-qui1", qui2: "act-qui2",
  },
};

// Orden inverso de dependencias: primero las tablas que apuntan a otras.
const DELETE_ORDER = [
  "groups_courses",
  "users_groups",
  "activities",
  "courses",
  "groups",
  "users",
  "tenants",
];

// ─── Datos ────────────────────────────────────────────────────────────────────

function buildTenants() {
  const now = new Date().toISOString();
  return [
    { id: IDS.tenants.uc, name: "Universidad Central", domain: "ucentral.edu.co", active: true, created_at: now },
    { id: IDS.tenants.un, name: "Universidad Nacional", domain: "unal.edu.co", active: true, created_at: now },
  ];
}

function makeUser({ id, tenant_id = null, firstname, lastname, email, role, phonumber = "", xp = 0, level = 0, streak = 0, average = 0, missions = "0/0" }, hash) {
  return { id, tenant_id, firstname, lastname, email, password: hash, role, status: "Active", phonumber, xp, level, streak, average, missions };
}

function buildUsers(hash) {
  const { users: U, tenants: T } = IDS;
  return [
    makeUser({ id: U.superadmin, tenant_id: null, firstname: "Super", lastname: "Admin", email: "super@onboardpro.com", role: "superadmin" }, hash),

    makeUser({ id: U.adminUc, tenant_id: T.uc, firstname: "Carlos", lastname: "Mendoza", email: "admin@ucentral.edu.co", role: "admin" }, hash),
    makeUser({ id: U.adminUn, tenant_id: T.un, firstname: "Laura", lastname: "Torres", email: "admin@unal.edu.co", role: "admin" }, hash),

    makeUser({ id: U.instrUc1, tenant_id: T.uc, firstname: "Andrés", lastname: "García", email: "a.garcia@ucentral.edu.co", role: "instructor", xp: 320, level: 3 }, hash),
    makeUser({ id: U.instrUc2, tenant_id: T.uc, firstname: "Patricia", lastname: "Martínez", email: "p.martinez@ucentral.edu.co", role: "instructor", xp: 210, level: 2 }, hash),
    makeUser({ id: U.instrUn1, tenant_id: T.un, firstname: "Jorge", lastname: "Rodríguez", email: "j.rodriguez@unal.edu.co", role: "instructor", xp: 450, level: 4 }, hash),
    makeUser({ id: U.instrUn2, tenant_id: T.un, firstname: "Mónica", lastname: "Vargas", email: "m.vargas@unal.edu.co", role: "instructor", xp: 180, level: 2 }, hash),

    makeUser({ id: U.studUc1, tenant_id: T.uc, firstname: "Juliana", lastname: "López", email: "j.lopez@ucentral.edu.co", role: "student", xp: 150, level: 1, streak: 3, average: 4.2, missions: "3/5" }, hash),
    makeUser({ id: U.studUc2, tenant_id: T.uc, firstname: "Diego", lastname: "Pérez", email: "d.perez@ucentral.edu.co", role: "student", xp: 90, level: 1, streak: 1, average: 3.8, missions: "2/5" }, hash),
    makeUser({ id: U.studUc3, tenant_id: T.uc, firstname: "Valentina", lastname: "Ríos", email: "v.rios@ucentral.edu.co", role: "student", xp: 230, level: 2, streak: 7, average: 4.7, missions: "4/5" }, hash),
    makeUser({ id: U.studUc4, tenant_id: T.uc, firstname: "Sebastián", lastname: "Cárdenas", email: "s.cardenas@ucentral.edu.co", role: "student", xp: 60, level: 0, streak: 0, average: 3.1, missions: "1/5" }, hash),
    makeUser({ id: U.studUc5, tenant_id: T.uc, firstname: "Natalia", lastname: "Herrera", email: "n.herrera@ucentral.edu.co", role: "student", xp: 310, level: 3, streak: 12, average: 4.9, missions: "5/5" }, hash),

    makeUser({ id: U.studUn1, tenant_id: T.un, firstname: "Miguel", lastname: "Castro", email: "m.castro@unal.edu.co", role: "student", xp: 100, level: 1, streak: 2, average: 3.5, missions: "2/5" }, hash),
    makeUser({ id: U.studUn2, tenant_id: T.un, firstname: "Sara", lastname: "Morales", email: "s.morales@unal.edu.co", role: "student", xp: 270, level: 2, streak: 9, average: 4.5, missions: "4/5" }, hash),
    makeUser({ id: U.studUn3, tenant_id: T.un, firstname: "Camilo", lastname: "Suárez", email: "c.suarez@unal.edu.co", role: "student", xp: 40, level: 0, streak: 0, average: 2.9, missions: "1/5" }, hash),
    makeUser({ id: U.studUn4, tenant_id: T.un, firstname: "Isabella", lastname: "Ramírez", email: "i.ramirez@unal.edu.co", role: "student", xp: 190, level: 1, streak: 5, average: 4.0, missions: "3/5" }, hash),
    makeUser({ id: U.studUn5, tenant_id: T.un, firstname: "Felipe", lastname: "Guerrero", email: "f.guerrero@unal.edu.co", role: "student", xp: 380, level: 3, streak: 15, average: 4.8, missions: "5/5" }, hash),
  ];
}

function buildGroups() {
  const { groups: G, tenants: T } = IDS;
  return [
    { id: G.ucA, tenant_id: T.uc, name: "Ingeniería de Sistemas", description: "Grupo principal de Ing. de Sistemas - UC" },
    { id: G.ucB, tenant_id: T.uc, name: "Administración de Empresas", description: "Grupo de Administración - UC" },
    { id: G.unA, tenant_id: T.un, name: "Ciencias Básicas", description: "Grupo de Ciencias Básicas - UN" },
    { id: G.unB, tenant_id: T.un, name: "Ingeniería Civil", description: "Grupo de Ing. Civil - UN" },
  ];
}

function buildCourses() {
  const { courses: C, groups: G, tenants: T, activities: A } = IDS;
  return [
    { id: C.poo, tenant_id: T.uc, name: "Programación Orientada a Objetos", instructor: "a.garcia@ucentral.edu.co", grupo: G.ucA, status: "Abierto", actividades: [A.poo1, A.poo2, A.poo3] },
    { id: C.bd, tenant_id: T.uc, name: "Bases de Datos", instructor: "p.martinez@ucentral.edu.co", grupo: G.ucA, status: "Abierto", actividades: [A.bd1, A.bd2] },
    { id: C.redes, tenant_id: T.uc, name: "Redes y Comunicaciones", instructor: "a.garcia@ucentral.edu.co", grupo: G.ucB, status: "Cerrado", actividades: [A.red1, A.red2] },
    { id: C.calc, tenant_id: T.un, name: "Cálculo Diferencial", instructor: "j.rodriguez@unal.edu.co", grupo: G.unA, status: "Abierto", actividades: [A.cal1, A.cal2, A.cal3] },
    { id: C.fisica, tenant_id: T.un, name: "Física Mecánica", instructor: "m.vargas@unal.edu.co", grupo: G.unA, status: "Abierto", actividades: [A.fis1, A.fis2] },
    { id: C.quim, tenant_id: T.un, name: "Química General", instructor: "j.rodriguez@unal.edu.co", grupo: G.unB, status: "Cerrado", actividades: [A.qui1, A.qui2] },
  ];
}

function buildActivities() {
  const A = IDS.activities;
  const DRIVE = "https://drive.google.com/file/d/seed-placeholder/view";
  return [
    { id: A.poo1, name: "act-poo1", type: "Recurso", title: "Introducción a la POO", description: "Material de lectura sobre clases y objetos.", adjunto: DRIVE, deliverable: false },
    { id: A.poo2, name: "act-poo2", type: "Tarea", title: "Taller: Herencia y Polimorfismo", description: "Implementa una jerarquía de clases en Java.", adjunto: DRIVE, deliverable: true },
    { id: A.poo3, name: "act-poo3", type: "Examen", title: "Parcial 1 - POO", description: "Evaluación de conceptos de POO.", adjunto: DRIVE, deliverable: true },

    { id: A.bd1, name: "act-bd1", type: "Recurso", title: "Modelo Entidad-Relación", description: "Guía para diseñar diagramas ER.", adjunto: DRIVE, deliverable: false },
    { id: A.bd2, name: "act-bd2", type: "Tarea", title: "Taller: Consultas SQL", description: "Practica SELECT, JOIN y subconsultas.", adjunto: DRIVE, deliverable: true },

    { id: A.red1, name: "act-red1", type: "Recurso", title: "Modelo OSI", description: "Las 7 capas del modelo OSI explicadas.", adjunto: DRIVE, deliverable: false },
    { id: A.red2, name: "act-red2", type: "Tarea", title: "Laboratorio: Configuración TCP/IP", description: "Configura una red básica en Packet Tracer.", adjunto: DRIVE, deliverable: true },

    { id: A.cal1, name: "act-cal1", type: "Recurso", title: "Límites y Continuidad", description: "Teoría y ejemplos resueltos.", adjunto: DRIVE, deliverable: false },
    { id: A.cal2, name: "act-cal2", type: "Tarea", title: "Taller: Derivadas", description: "Ejercicios de derivación usando regla de la cadena.", adjunto: DRIVE, deliverable: true },
    { id: A.cal3, name: "act-cal3", type: "Examen", title: "Parcial 1 - Cálculo", description: "Evaluación de límites y derivadas.", adjunto: DRIVE, deliverable: true },

    { id: A.fis1, name: "act-fis1", type: "Recurso", title: "Cinemática", description: "Movimiento rectilíneo y parabólico.", adjunto: DRIVE, deliverable: false },
    { id: A.fis2, name: "act-fis2", type: "Tarea", title: "Taller: Dinámica", description: "Problemas de fuerza, masa y aceleración.", adjunto: DRIVE, deliverable: true },

    { id: A.qui1, name: "act-qui1", type: "Recurso", title: "Tabla Periódica", description: "Introducción a los elementos y sus propiedades.", adjunto: DRIVE, deliverable: false },
    { id: A.qui2, name: "act-qui2", type: "Tarea", title: "Taller: Estequiometría", description: "Balanceo de ecuaciones químicas.", adjunto: DRIVE, deliverable: true },
  ];
}

function buildUsersGroups() {
  const { users: U, groups: G } = IDS;
  return [
    { id_user: U.studUc1, id_group: G.ucA },
    { id_user: U.studUc2, id_group: G.ucA },
    { id_user: U.studUc3, id_group: G.ucA },
    { id_user: U.studUc3, id_group: G.ucB },
    { id_user: U.studUc4, id_group: G.ucB },
    { id_user: U.studUc5, id_group: G.ucB },
    { id_user: U.studUn1, id_group: G.unA },
    { id_user: U.studUn2, id_group: G.unA },
    { id_user: U.studUn3, id_group: G.unA },
    { id_user: U.studUn3, id_group: G.unB },
    { id_user: U.studUn4, id_group: G.unB },
    { id_user: U.studUn5, id_group: G.unB },
  ];
}

function buildGroupsCourses() {
  const { groups: G, courses: C } = IDS;
  return [
    { id_group: G.ucA, id_course: C.poo },
    { id_group: G.ucA, id_course: C.bd },
    { id_group: G.ucB, id_course: C.redes },
    { id_group: G.unA, id_course: C.calc },
    { id_group: G.unA, id_course: C.fisica },
    { id_group: G.unB, id_course: C.quim },
  ];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function preflight() {
  const faltantes = [];
  for (const t of DELETE_ORDER) {
    const { error } = await supabase.from(t).select("*", { head: true, count: "exact" });
    // PGRST205 = la tabla no existe en el schema cache
    if (error && error.code === "PGRST205") faltantes.push(t);
    else if (error) throw new Error(`No pude consultar "${t}": ${error.message}`);
  }
  if (faltantes.length) {
    console.error("\n❌ Faltan tablas en la base:", faltantes.join(", "));
    console.error("\n   Creálas primero: abrí Supabase → SQL Editor → New query,");
    console.error("   pegá el contenido de scripts/schema.sql y dale Run.");
    console.error("   Después volvé a correr este script.\n");
    process.exit(1);
  }
}

async function wipe() {
  for (const t of DELETE_ORDER) {
    // supabase-js exige un filtro en delete(); este matchea todas las filas.
    const { error } = await supabase.from(t).delete().not("id", "is", null);
    if (error) throw new Error(`Borrando "${t}": ${error.message}`);
    console.log(`   ✓ ${t}`);
  }
}

async function insert(tabla, filas, etiqueta) {
  const { error } = await supabase.from(tabla).upsert(filas);
  if (error) throw new Error(`Insertando en "${tabla}": ${error.message}`);
  console.log(`   ✓ ${filas.length} ${etiqueta}`);
}

function escribirResumen({ tenants, users, groups, courses, activities, usersGroups, groupsCourses }) {
  const generatedAt = new Date().toLocaleString("es-CO", { timeZone: "America/Bogota" });
  const lines = [
    "╔══════════════════════════════════════════════════════════╗",
    "║          ONBOARDPRO — DATOS DE PRUEBA (SUPABASE)         ║",
    "╚══════════════════════════════════════════════════════════╝",
    "",
    `  Generado : ${generatedAt}`,
    `  Proyecto : ${process.env.SUPABASE_URL}`,
    "",
    "──────────────────────────────────────────────────────────",
    "  CONTRASEÑA ÚNICA PARA TODOS LOS USUARIOS",
    "──────────────────────────────────────────────────────────",
    `  ${DEFAULT_PASSWORD}`,
    "",
    "──────────────────────────────────────────────────────────",
    "  TENANTS",
    "──────────────────────────────────────────────────────────",
    ...tenants.map((t) => `  [${t.id}]  ${t.name.padEnd(25)} dominio: ${t.domain}`),
    "",
    "──────────────────────────────────────────────────────────",
    "  USUARIOS",
    "──────────────────────────────────────────────────────────",
    `  ${"EMAIL".padEnd(38)} ${"ROL".padEnd(12)} TENANT`,
    ...users.map((u) => `  ${u.email.padEnd(38)} ${u.role.padEnd(12)} ${u.tenant_id ?? "— (global)"}`),
    "",
    "──────────────────────────────────────────────────────────",
    "  GRUPOS",
    "──────────────────────────────────────────────────────────",
    ...groups.map((g) => `  [${g.id}]  ${g.name.padEnd(30)} ${g.tenant_id}`),
    "",
    "──────────────────────────────────────────────────────────",
    "  CURSOS",
    "──────────────────────────────────────────────────────────",
    ...courses.map((c) => `  [${c.id}]  ${c.name.padEnd(38)} instructor: ${c.instructor}`),
    "",
    "──────────────────────────────────────────────────────────",
    "  ACTIVIDADES",
    "──────────────────────────────────────────────────────────",
    ...activities.map((a) => `  [${a.id.padEnd(12)}]  [${a.type.padEnd(7)}]  ${a.title}`),
    "",
    "──────────────────────────────────────────────────────────",
    "  RELACIONES GRUPOS ↔ CURSOS",
    "──────────────────────────────────────────────────────────",
    ...groupsCourses.map((r) => `  ${r.id_group}  →  ${r.id_course}`),
    "",
    "──────────────────────────────────────────────────────────",
    "  RELACIONES USUARIOS ↔ GRUPOS",
    "──────────────────────────────────────────────────────────",
    ...usersGroups.map((r) => `  ${r.id_user.padEnd(16)}  →  ${r.id_group}`),
    "",
  ];
  const outputPath = path.join(__dirname, "seed-data.txt");
  fs.writeFileSync(outputPath, lines.join("\n"), "utf8");
  return outputPath;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) {
    console.error("\n❌ Faltan SUPABASE_URL y/o SUPABASE_SECRET_KEY en el .env\n");
    process.exit(1);
  }

  console.log(`\n🔌 Conectando a ${process.env.SUPABASE_URL}`);
  await preflight();
  console.log("   ✓ las 7 tablas existen");

  if (KEEP) {
    console.log("\n⏭️  --keep: no se borra nada, solo se hace upsert.");
  } else {
    console.log("\n🗑️  Borrando data existente...");
    await wipe();
  }

  console.log("\n🔑 Hasheando la contraseña de prueba...");
  const hash = await bcrypt.hash(DEFAULT_PASSWORD, 10);

  const tenants = buildTenants();
  const users = buildUsers(hash);
  const groups = buildGroups();
  const courses = buildCourses();
  const activities = buildActivities();
  const usersGroups = buildUsersGroups();
  const groupsCourses = buildGroupsCourses();

  console.log("\n📥 Insertando...");
  await insert("tenants", tenants, "tenants");
  await insert("users", users, "usuarios");
  await insert("groups", groups, "grupos");
  await insert("courses", courses, "cursos");
  await insert("activities", activities, "actividades");

  // Las junction tables tienen id SERIAL: se insertan sin id.
  const { error: ugErr } = await supabase
    .from("users_groups")
    .upsert(usersGroups, { onConflict: "id_user,id_group" });
  if (ugErr) throw new Error(`Insertando en "users_groups": ${ugErr.message}`);
  console.log(`   ✓ ${usersGroups.length} relaciones usuario↔grupo`);

  const { error: gcErr } = await supabase
    .from("groups_courses")
    .upsert(groupsCourses, { onConflict: "id_group,id_course" });
  if (gcErr) throw new Error(`Insertando en "groups_courses": ${gcErr.message}`);
  console.log(`   ✓ ${groupsCourses.length} relaciones grupo↔curso`);

  // Verificación real contra la BD, no confiamos en que el insert no haya fallado en silencio.
  console.log("\n🔍 Verificando...");
  const esperado = {
    tenants: tenants.length,
    users: users.length,
    groups: groups.length,
    courses: courses.length,
    activities: activities.length,
    users_groups: usersGroups.length,
    groups_courses: groupsCourses.length,
  };
  let ok = true;
  for (const [tabla, n] of Object.entries(esperado)) {
    const { count, error } = await supabase.from(tabla).select("*", { head: true, count: "exact" });
    if (error) throw new Error(`Verificando "${tabla}": ${error.message}`);
    const marca = count === n ? "✓" : "✗";
    if (count !== n) ok = false;
    console.log(`   ${marca} ${tabla.padEnd(16)} ${count}/${n}`);
  }

  const outputPath = escribirResumen({ tenants, users, groups, courses, activities, usersGroups, groupsCourses });

  console.log(ok ? "\n✅ Setup completado." : "\n⚠️  Setup terminó con diferencias, revisá arriba.");
  console.log(`📄 Resumen en: ${path.relative(process.cwd(), outputPath)}`);
  console.log("\n   Para entrar:");
  console.log(`   superadmin  super@onboardpro.com     ${DEFAULT_PASSWORD}`);
  console.log(`   admin UC    admin@ucentral.edu.co    ${DEFAULT_PASSWORD}`);
  console.log(`   admin UN    admin@unal.edu.co        ${DEFAULT_PASSWORD}`);
  console.log(`   estudiante  j.lopez@ucentral.edu.co  ${DEFAULT_PASSWORD}\n`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\n❌ Error:", err.message, "\n");
    process.exit(1);
  });
