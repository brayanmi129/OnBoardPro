// Regenera CREDENCIALES.local.md leyendo la base.
//
// Las contraseñas no se leen: se guardan como hash bcrypt, que no se puede
// revertir. Lo que hace este script es probar una lista corta de candidatas
// conocidas contra cada hash y anotar cuál abre. Las que no coincidan con
// ninguna quedan marcadas como desconocidas, que es la verdad.
//
// El archivo que genera tiene contraseñas en claro y está en .gitignore.
//
//   node scripts/listar-usuarios.js
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcrypt");
const { supabase } = require("../helpers/supabaseHelper.js");

// Agregá acá cualquier contraseña que uses en pruebas.
const CANDIDATAS = ["Test1234!", "Colombia#123", "Nueva1234!", "admin123", "123456"];

const ROL = {
  superadmin: "Superadmin",
  admin: "Administrador",
  instructor: "Instructor",
  student: "Aprendiz",
};
const ORDEN = { superadmin: 0, admin: 1, instructor: 2, student: 3 };

const DESTINO = path.join(__dirname, "..", "CREDENCIALES.local.md");

(async () => {
  const { data: empresas, error: e1 } = await supabase
    .from("tenants").select("id, name, domain").order("name");
  if (e1) {
    console.error("No se pudieron leer las empresas:", e1.message);
    process.exit(1);
  }
  const porId = new Map((empresas || []).map((t) => [t.id, t]));

  const { data: usuarios, error: e2 } = await supabase
    .from("users").select("id, email, role, status, tenant_id, password");
  if (e2) {
    console.error("No se pudieron leer los usuarios:", e2.message);
    process.exit(1);
  }

  const filas = [];
  for (const u of usuarios || []) {
    let clave;
    if (!u.password) {
      clave = "(sin contraseña: solo OAuth)";
    } else {
      clave = "**desconocida**";
      for (const c of CANDIDATAS) {
        if (await bcrypt.compare(c, u.password)) { clave = "`" + c + "`"; break; }
      }
    }
    filas.push({
      rol: ROL[u.role] || u.role,
      orden: ORDEN[u.role] ?? 9,
      email: u.email,
      clave,
      estado: u.status,
      empresa: u.tenant_id ? porId.get(u.tenant_id)?.name ?? u.tenant_id : "— plataforma",
    });
  }

  filas.sort((a, b) =>
    a.orden - b.orden || a.empresa.localeCompare(b.empresa) || a.email.localeCompare(b.email)
  );

  const hoy = new Date().toISOString().slice(0, 10);
  const lineas = [
    "# Cuentas de prueba — OnBoardPro",
    "",
    `> Generado el ${hoy} leyendo la base y comprobando cada contraseña contra su hash.`,
    "> **Este archivo no se sube al repositorio** (está en .gitignore).",
    "",
    "## Empresas",
    "",
    "| id | nombre | dominio |",
    "|---|---|---|",
    ...(empresas || []).map((t) => `| \`${t.id}\` | ${t.name} | ${t.domain} |`),
    "",
    "## Cuentas",
    "",
    "| Rol | Correo | Contraseña | Empresa | Estado |",
    "|---|---|---|---|---|",
    ...filas.map((f) => `| ${f.rol} | ${f.email} | ${f.clave} | ${f.empresa} | ${f.estado} |`),
    "",
    "## Notas",
    "",
    "- La mayoría usa `Test1234!`, la contraseña que pone el seed (`scripts/setup.js`).",
    "- Las **desconocidas** se cambiaron después del seed. Un hash bcrypt no se revierte:",
    "  para recuperarlas hay que resetearlas.",
    "- Para probar el aislamiento entre empresas, entrá con una cuenta de cada dominio:",
    "  no comparten cursos, equipos, actividades ni ranking.",
    "- El superadmin no pertenece a ninguna empresa: las ve todas.",
    "",
    "## Cómo regenerar este archivo",
    "",
    "```bash",
    "node scripts/listar-usuarios.js",
    "```",
    "",
  ];

  fs.writeFileSync(DESTINO, lineas.join("\n"));

  const conocidas = filas.filter((f) => f.clave.startsWith("`")).length;
  console.log(`CREDENCIALES.local.md actualizado · ${filas.length} cuentas`);
  console.log(`  con contraseña conocida: ${conocidas}`);
  console.log(`  desconocidas           : ${filas.filter((f) => f.clave.includes("desconocida")).length}`);
  console.log(`  solo OAuth             : ${filas.filter((f) => f.clave.includes("OAuth")).length}`);
})();
