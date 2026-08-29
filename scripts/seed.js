/**
 * Seed completo de OnBoardPro.
 * Borra TODA la data existente y recrea datos de prueba.
 *
 * Uso: node scripts/seed.js
 */
require("dotenv").config();
const { db } = require("../helpers/firebaseHelper.js");
const bcrypt = require("bcrypt");
const fs = require("fs");
const path = require("path");

const DEFAULT_PASSWORD = "Test1234!";

// ─── IDs fijos para reproducibilidad ─────────────────────────────────────────
const IDS = {
  tenants: { uc: "tenant-uc", un: "tenant-un" },
  users: {
    superadmin:   "u-super",
    adminUc:      "u-adm-uc",
    adminUn:      "u-adm-un",
    instrUc1:     "u-ins-uc1",
    instrUc2:     "u-ins-uc2",
    instrUn1:     "u-ins-un1",
    instrUn2:     "u-ins-un2",
    studUc1:      "u-stu-uc1",
    studUc2:      "u-stu-uc2",
    studUc3:      "u-stu-uc3",
    studUc4:      "u-stu-uc4",
    studUc5:      "u-stu-uc5",
    studUn1:      "u-stu-un1",
    studUn2:      "u-stu-un2",
    studUn3:      "u-stu-un3",
    studUn4:      "u-stu-un4",
    studUn5:      "u-stu-un5",
  },
  groups: { ucA: "grp-uc-a", ucB: "grp-uc-b", unA: "grp-un-a", unB: "grp-un-b" },
  courses: {
    poo:   "crs-poo",
    bd:    "crs-bd",
    redes: "crs-redes",
    calc:  "crs-calc",
    fisica:"crs-fisica",
    quim:  "crs-quim",
  },
  activities: {
    poo1: "act-poo1", poo2: "act-poo2", poo3: "act-poo3",
    bd1:  "act-bd1",  bd2:  "act-bd2",
    red1: "act-red1", red2: "act-red2",
    cal1: "act-cal1", cal2: "act-cal2", cal3: "act-cal3",
    fis1: "act-fis1", fis2: "act-fis2",
    qui1: "act-qui1", qui2: "act-qui2",
  },
};

const COLLECTIONS = [
  "tenants",
  "users",
  "groups",
  "courses",
  "activities",
  "users_groups",
  "groups_courses",
  "user_course",
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function deleteCollection(collectionName) {
  const snap = await db.collection(collectionName).get();
  if (snap.empty) return;
  const batch = db.batch();
  snap.docs.forEach((doc) => batch.delete(doc.ref));
  await batch.commit();
}

function makeUser({ id, tenantId = null, firstname, lastname, email, role, phonumber = "", xp = 0, level = 0, streak = 0, average = 0, missions = "0/0" }, hash) {
  return { id, tenantId, firstname, lastname, email, password: hash, role, status: "Active", phonumber, xp, level, streak, average, missions };
}

// ─── Datos de prueba ──────────────────────────────────────────────────────────

function buildTenants() {
  const now = new Date().toISOString();
  return [
    { id: IDS.tenants.uc, name: "Universidad Central", domain: "ucentral.edu.co", active: true, createdAt: now },
    { id: IDS.tenants.un, name: "Universidad Nacional", domain: "unal.edu.co",    active: true, createdAt: now },
  ];
}

function buildUsers(hash) {
  const { users: U, tenants: T } = IDS;
  return [
    makeUser({ id: U.superadmin, tenantId: null,   firstname: "Super",    lastname: "Admin",     email: "super@onboardpro.com",          role: "superadmin" }, hash),

    makeUser({ id: U.adminUc,    tenantId: T.uc,   firstname: "Carlos",   lastname: "Mendoza",   email: "admin@ucentral.edu.co",         role: "admin" }, hash),
    makeUser({ id: U.adminUn,    tenantId: T.un,   firstname: "Laura",    lastname: "Torres",    email: "admin@unal.edu.co",             role: "admin" }, hash),

    makeUser({ id: U.instrUc1,   tenantId: T.uc,   firstname: "Andrés",   lastname: "García",    email: "a.garcia@ucentral.edu.co",      role: "instructor", xp: 320, level: 3 }, hash),
    makeUser({ id: U.instrUc2,   tenantId: T.uc,   firstname: "Patricia", lastname: "Martínez",  email: "p.martinez@ucentral.edu.co",    role: "instructor", xp: 210, level: 2 }, hash),
    makeUser({ id: U.instrUn1,   tenantId: T.un,   firstname: "Jorge",    lastname: "Rodríguez", email: "j.rodriguez@unal.edu.co",       role: "instructor", xp: 450, level: 4 }, hash),
    makeUser({ id: U.instrUn2,   tenantId: T.un,   firstname: "Mónica",   lastname: "Vargas",    email: "m.vargas@unal.edu.co",          role: "instructor", xp: 180, level: 2 }, hash),

    makeUser({ id: U.studUc1,    tenantId: T.uc,   firstname: "Juliana",  lastname: "López",     email: "j.lopez@ucentral.edu.co",       role: "student", xp: 150, level: 1, streak: 3, average: 4.2, missions: "3/5" }, hash),
    makeUser({ id: U.studUc2,    tenantId: T.uc,   firstname: "Diego",    lastname: "Pérez",     email: "d.perez@ucentral.edu.co",       role: "student", xp: 90,  level: 1, streak: 1, average: 3.8, missions: "2/5" }, hash),
    makeUser({ id: U.studUc3,    tenantId: T.uc,   firstname: "Valentina","lastname": "Ríos",    email: "v.rios@ucentral.edu.co",        role: "student", xp: 230, level: 2, streak: 7, average: 4.7, missions: "4/5" }, hash),
    makeUser({ id: U.studUc4,    tenantId: T.uc,   firstname: "Sebastián",lastname: "Cárdenas",  email: "s.cardenas@ucentral.edu.co",    role: "student", xp: 60,  level: 0, streak: 0, average: 3.1, missions: "1/5" }, hash),
    makeUser({ id: U.studUc5,    tenantId: T.uc,   firstname: "Natalia",  lastname: "Herrera",   email: "n.herrera@ucentral.edu.co",     role: "student", xp: 310, level: 3, streak: 12, average: 4.9, missions: "5/5" }, hash),

    makeUser({ id: U.studUn1,    tenantId: T.un,   firstname: "Miguel",   lastname: "Castro",    email: "m.castro@unal.edu.co",          role: "student", xp: 100, level: 1, streak: 2, average: 3.5, missions: "2/5" }, hash),
    makeUser({ id: U.studUn2,    tenantId: T.un,   firstname: "Sara",     lastname: "Morales",   email: "s.morales@unal.edu.co",         role: "student", xp: 270, level: 2, streak: 9, average: 4.5, missions: "4/5" }, hash),
    makeUser({ id: U.studUn3,    tenantId: T.un,   firstname: "Camilo",   lastname: "Suárez",    email: "c.suarez@unal.edu.co",          role: "student", xp: 40,  level: 0, streak: 0, average: 2.9, missions: "1/5" }, hash),
    makeUser({ id: U.studUn4,    tenantId: T.un,   firstname: "Isabella", lastname: "Ramírez",   email: "i.ramirez@unal.edu.co",         role: "student", xp: 190, level: 1, streak: 5, average: 4.0, missions: "3/5" }, hash),
    makeUser({ id: U.studUn5,    tenantId: T.un,   firstname: "Felipe",   lastname: "Guerrero",  email: "f.guerrero@unal.edu.co",        role: "student", xp: 380, level: 3, streak: 15, average: 4.8, missions: "5/5" }, hash),
  ];
}

function buildGroups() {
  return [
    { id: IDS.groups.ucA, name: "Ingeniería de Sistemas",  description: "Grupo principal de Ing. de Sistemas - UC" },
    { id: IDS.groups.ucB, name: "Administración de Empresas", description: "Grupo de Administración - UC" },
    { id: IDS.groups.unA, name: "Ciencias Básicas",         description: "Grupo de Ciencias Básicas - UN" },
    { id: IDS.groups.unB, name: "Ingeniería Civil",          description: "Grupo de Ing. Civil - UN" },
  ];
}

function buildCourses() {
  const { instrUc1: iUC1, instrUc2: iUC2, instrUn1: iUN1, instrUn2: iUN2 } = IDS.users;
  return [
    { id: IDS.courses.poo,    name: "Programación Orientada a Objetos", instructor: "a.garcia@ucentral.edu.co",   grupo: IDS.groups.ucA, status: "Abierto",  actividades: [IDS.activities.poo1, IDS.activities.poo2, IDS.activities.poo3] },
    { id: IDS.courses.bd,     name: "Bases de Datos",                   instructor: "p.martinez@ucentral.edu.co", grupo: IDS.groups.ucA, status: "Abierto",  actividades: [IDS.activities.bd1,  IDS.activities.bd2]  },
    { id: IDS.courses.redes,  name: "Redes y Comunicaciones",           instructor: "a.garcia@ucentral.edu.co",   grupo: IDS.groups.ucB, status: "Cerrado", actividades: [IDS.activities.red1, IDS.activities.red2] },
    { id: IDS.courses.calc,   name: "Cálculo Diferencial",              instructor: "j.rodriguez@unal.edu.co",    grupo: IDS.groups.unA, status: "Abierto",  actividades: [IDS.activities.cal1, IDS.activities.cal2, IDS.activities.cal3] },
    { id: IDS.courses.fisica, name: "Física Mecánica",                  instructor: "m.vargas@unal.edu.co",       grupo: IDS.groups.unA, status: "Abierto",  actividades: [IDS.activities.fis1, IDS.activities.fis2] },
    { id: IDS.courses.quim,   name: "Química General",                  instructor: "j.rodriguez@unal.edu.co",    grupo: IDS.groups.unB, status: "Cerrado", actividades: [IDS.activities.qui1, IDS.activities.qui2] },
  ];
}

function buildActivities() {
  const DRIVE = "https://drive.google.com/file/d/seed-placeholder/view";
  return [
    { id: IDS.activities.poo1, name: "act-poo1", type: "Recurso", title: "Introducción a la POO",            description: "Material de lectura sobre clases y objetos.", adjunto: DRIVE, deliverable: false },
    { id: IDS.activities.poo2, name: "act-poo2", type: "Tarea",   title: "Taller: Herencia y Polimorfismo",  description: "Implementa una jerarquía de clases en Java.",  adjunto: DRIVE, deliverable: true  },
    { id: IDS.activities.poo3, name: "act-poo3", type: "Examen",  title: "Parcial 1 - POO",                  description: "Evaluación de conceptos de POO.",             adjunto: DRIVE, deliverable: true  },

    { id: IDS.activities.bd1,  name: "act-bd1",  type: "Recurso", title: "Modelo Entidad-Relación",          description: "Guía para diseñar diagramas ER.",             adjunto: DRIVE, deliverable: false },
    { id: IDS.activities.bd2,  name: "act-bd2",  type: "Tarea",   title: "Taller: Consultas SQL",            description: "Practica SELECT, JOIN y subconsultas.",       adjunto: DRIVE, deliverable: true  },

    { id: IDS.activities.red1, name: "act-red1", type: "Recurso", title: "Modelo OSI",                       description: "Las 7 capas del modelo OSI explicadas.",      adjunto: DRIVE, deliverable: false },
    { id: IDS.activities.red2, name: "act-red2", type: "Tarea",   title: "Laboratorio: Configuración TCP/IP",description: "Configura una red básica en Packet Tracer.",   adjunto: DRIVE, deliverable: true  },

    { id: IDS.activities.cal1, name: "act-cal1", type: "Recurso", title: "Límites y Continuidad",            description: "Teoría y ejemplos resueltos.",                adjunto: DRIVE, deliverable: false },
    { id: IDS.activities.cal2, name: "act-cal2", type: "Tarea",   title: "Taller: Derivadas",                description: "Ejercicios de derivación usando regla de la cadena.", adjunto: DRIVE, deliverable: true },
    { id: IDS.activities.cal3, name: "act-cal3", type: "Examen",  title: "Parcial 1 - Cálculo",              description: "Evaluación de límites y derivadas.",           adjunto: DRIVE, deliverable: true  },

    { id: IDS.activities.fis1, name: "act-fis1", type: "Recurso", title: "Cinemática",                       description: "Movimiento rectilíneo y parabólico.",         adjunto: DRIVE, deliverable: false },
    { id: IDS.activities.fis2, name: "act-fis2", type: "Tarea",   title: "Taller: Dinámica",                 description: "Problemas de fuerza, masa y aceleración.",    adjunto: DRIVE, deliverable: true  },

    { id: IDS.activities.qui1, name: "act-qui1", type: "Recurso", title: "Tabla Periódica",                  description: "Introducción a los elementos y sus propiedades.", adjunto: DRIVE, deliverable: false },
    { id: IDS.activities.qui2, name: "act-qui2", type: "Tarea",   title: "Taller: Estequiometría",           description: "Balanceo de ecuaciones químicas.",            adjunto: DRIVE, deliverable: true  },
  ];
}

function buildUsersGroups() {
  const { users: U, groups: G } = IDS;
  return [
    // UC - Grupo A (Sistemas): estudiantes 1, 2, 3
    { id_user: U.studUc1, id_group: G.ucA },
    { id_user: U.studUc2, id_group: G.ucA },
    { id_user: U.studUc3, id_group: G.ucA },
    // UC - Grupo B (Admón): estudiantes 3, 4, 5
    { id_user: U.studUc3, id_group: G.ucB },
    { id_user: U.studUc4, id_group: G.ucB },
    { id_user: U.studUc5, id_group: G.ucB },
    // UN - Grupo A (Ciencias): estudiantes 1, 2, 3
    { id_user: U.studUn1, id_group: G.unA },
    { id_user: U.studUn2, id_group: G.unA },
    { id_user: U.studUn3, id_group: G.unA },
    // UN - Grupo B (Civil): estudiantes 3, 4, 5
    { id_user: U.studUn3, id_group: G.unB },
    { id_user: U.studUn4, id_group: G.unB },
    { id_user: U.studUn5, id_group: G.unB },
  ];
}

function buildGroupsCourses() {
  const { groups: G, courses: C } = IDS;
  return [
    { id_group: G.ucA, id_course: C.poo   },
    { id_group: G.ucA, id_course: C.bd    },
    { id_group: G.ucB, id_course: C.redes },
    { id_group: G.unA, id_course: C.calc  },
    { id_group: G.unA, id_course: C.fisica},
    { id_group: G.unB, id_course: C.quim  },
  ];
}

// ─── Seed principal ───────────────────────────────────────────────────────────

async function seed() {
  try {
    console.log("\n🗑️  Borrando colecciones existentes...");
    for (const col of COLLECTIONS) {
      await deleteCollection(col);
      console.log(`   ✓ ${col}`);
    }

    console.log("\n🔑 Hasheando contraseña de prueba...");
    const hash = await bcrypt.hash(DEFAULT_PASSWORD, 10);

    // Tenants
    console.log("\n🏫 Creando tenants...");
    for (const tenant of buildTenants()) {
      await db.collection("tenants").doc(tenant.id).set(tenant);
      console.log(`   ✓ ${tenant.name} (${tenant.domain})`);
    }

    // Users
    console.log("\n👤 Creando usuarios...");
    for (const user of buildUsers(hash)) {
      await db.collection("users").doc(user.id).set(user);
      console.log(`   ✓ [${user.role.padEnd(11)}] ${user.email}`);
    }

    // Groups
    console.log("\n👥 Creando grupos...");
    for (const group of buildGroups()) {
      await db.collection("groups").doc(group.id).set(group);
      console.log(`   ✓ ${group.name}`);
    }

    // Courses
    console.log("\n📚 Creando cursos...");
    for (const course of buildCourses()) {
      await db.collection("courses").doc(course.id).set(course);
      console.log(`   ✓ ${course.name}`);
    }

    // Activities
    console.log("\n📝 Creando actividades...");
    for (const act of buildActivities()) {
      await db.collection("activities").doc(act.id).set(act);
      console.log(`   ✓ [${act.type.padEnd(7)}] ${act.title}`);
    }

    // Junction: users_groups
    console.log("\n🔗 Vinculando usuarios ↔ grupos...");
    const ugBatch = db.batch();
    buildUsersGroups().forEach(({ id_user, id_group }) => {
      const ref = db.collection("users_groups").doc(`${id_user}_${id_group}`);
      ugBatch.set(ref, { id_user, id_group });
    });
    await ugBatch.commit();
    console.log(`   ✓ ${buildUsersGroups().length} relaciones creadas`);

    // Junction: groups_courses
    console.log("\n🔗 Vinculando grupos ↔ cursos...");
    const gcBatch = db.batch();
    buildGroupsCourses().forEach(({ id_group, id_course }) => {
      const ref = db.collection("groups_courses").doc(`${id_group}_${id_course}`);
      gcBatch.set(ref, { id_group, id_course });
    });
    await gcBatch.commit();
    console.log(`   ✓ ${buildGroupsCourses().length} relaciones creadas`);

    // Generar archivo de resumen
    const generatedAt = new Date().toLocaleString("es-CO", { timeZone: "America/Bogota" });
    const users = buildUsers("(hash)");
    const groups = buildGroups();
    const courses = buildCourses();
    const activities = buildActivities();

    const lines = [
      "╔══════════════════════════════════════════════════════════╗",
      "║            ONBOARDPRO — DATOS DE PRUEBA (SEED)           ║",
      "╚══════════════════════════════════════════════════════════╝",
      "",
      `  Generado : ${generatedAt}`,
      `  Proyecto : studifyuc (Firebase)`,
      "",
      "──────────────────────────────────────────────────────────",
      "  CONTRASEÑA ÚNICA PARA TODOS LOS USUARIOS",
      "──────────────────────────────────────────────────────────",
      `  ${DEFAULT_PASSWORD}`,
      "",
      "──────────────────────────────────────────────────────────",
      "  TENANTS",
      "──────────────────────────────────────────────────────────",
      ...buildTenants().map(t =>
        `  [${t.id}]  ${t.name.padEnd(25)} dominio: ${t.domain}`
      ),
      "",
      "──────────────────────────────────────────────────────────",
      "  USUARIOS",
      "──────────────────────────────────────────────────────────",
      `  ${"EMAIL".padEnd(38)} ${"ROL".padEnd(12)} TENANT`,
      ...users.map(u =>
        `  ${u.email.padEnd(38)} ${u.role.padEnd(12)} ${u.tenantId ?? "— (global)"}`
      ),
      "",
      "──────────────────────────────────────────────────────────",
      "  GRUPOS",
      "──────────────────────────────────────────────────────────",
      ...groups.map(g => `  [${g.id}]  ${g.name}`),
      "",
      "──────────────────────────────────────────────────────────",
      "  CURSOS",
      "──────────────────────────────────────────────────────────",
      ...courses.map(c =>
        `  [${c.id}]  ${c.name.padEnd(38)} instructor: ${c.instructor}`
      ),
      "",
      "──────────────────────────────────────────────────────────",
      "  ACTIVIDADES",
      "──────────────────────────────────────────────────────────",
      ...activities.map(a =>
        `  [${a.id.padEnd(12)}]  [${a.type.padEnd(7)}]  ${a.title}`
      ),
      "",
      "──────────────────────────────────────────────────────────",
      "  RELACIONES GRUPOS ↔ CURSOS",
      "──────────────────────────────────────────────────────────",
      ...buildGroupsCourses().map(r => `  ${r.id_group}  →  ${r.id_course}`),
      "",
      "──────────────────────────────────────────────────────────",
      "  RELACIONES USUARIOS ↔ GRUPOS",
      "──────────────────────────────────────────────────────────",
      ...buildUsersGroups().map(r => `  ${r.id_user.padEnd(16)}  →  ${r.id_group}`),
      "",
    ];

    const outputPath = path.join(__dirname, "seed-data.txt");
    fs.writeFileSync(outputPath, lines.join("\n"), "utf8");

    console.log("\n✅ Seed completado con éxito.");
    console.log(`📄 Resumen guardado en: scripts/seed-data.txt\n`);
  } catch (err) {
    console.error("\n❌ Error durante el seed:", err.message);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

seed();
