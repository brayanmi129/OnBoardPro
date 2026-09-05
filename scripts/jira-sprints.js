/**
 * Crea los sprints semanales en el tablero de Jira y les asigna las historias.
 *
 * El sprint 1 es la semana que termina el viernes indicado en FIN_SPRINT_1.
 * A partir de ahí, un sprint por semana (lunes a viernes) hasta la entrega.
 *
 * Uso:
 *   node scripts/jira-sprints.js --dry-run   muestra el calendario, no crea nada
 *   node scripts/jira-sprints.js             crea los sprints y asigna las historias
 *   node scripts/jira-sprints.js --activar   además pone en curso el sprint que toca hoy
 *   node scripts/jira-sprints.js --borrar    elimina los sprints (las historias vuelven al backlog)
 */
require("dotenv").config();
const fs = require("node:fs");
const path = require("node:path");

const DRY = process.argv.includes("--dry-run");
const ACTIVAR = process.argv.includes("--activar");
const BORRAR = process.argv.includes("--borrar");
const SOLO_FECHAS = process.argv.includes("--fechas");

const FIN_SPRINT_1 = "2026-09-04"; // viernes en que cierra el sprint 1
const ENTREGA = "2026-11-20";      // viernes de la entrega final

const { JIRA_URL, JIRA_EMAIL, JIRA_API_TOKEN } = process.env;
const PROJECT = process.env.JIRA_PROJECT_KEY || "OBP";
const base = (JIRA_URL || "").replace(/\/+$/, "");
const auth = () => "Basic " + Buffer.from(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`).toString("base64");

async function api(metodo, ruta, cuerpo) {
  const r = await fetch(base + ruta, {
    method: metodo,
    headers: { Authorization: auth(), "Content-Type": "application/json", Accept: "application/json" },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  const t = await r.text();
  let d = null;
  try { d = t ? JSON.parse(t) : null; } catch { d = t; }
  if (!r.ok) {
    const det = d?.errorMessages?.join("; ") || JSON.stringify(d?.errors || d || "").slice(0, 300);
    throw new Error(`${metodo} ${ruta} → ${r.status}: ${det}`);
  }
  return d;
}

const dia = (iso) => new Date(iso + "T00:00:00Z");
const masDias = (d, n) => new Date(d.getTime() + n * 864e5);
const iso = (d) => d.toISOString().slice(0, 10);
const fmt = (d) => `${d.getUTCDate()} ${["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"][d.getUTCMonth()]}`;

// Un sprint por semana: lunes a viernes, desde la semana que cierra el sprint 1.
function calendario() {
  const out = [];
  let fin = dia(FIN_SPRINT_1);
  const tope = dia(ENTREGA);
  let n = 1;
  while (fin <= tope) {
    out.push({ n, ini: masDias(fin, -4), fin });
    fin = masDias(fin, 7);
    n++;
  }
  return out;
}

function backlog() {
  const d = JSON.parse(fs.readFileSync(path.join(__dirname, "../docs/backlog.data.json"), "utf8"));
  const metas = Object.fromEntries((d.meta?.plan?.sprints || []).map((s) => [s.n, s.meta]));

  // Las claves reales de Jira las dejó jira-import.js al crear las incidencias.
  const reg = path.join(__dirname, "jira-creado.json");
  if (!fs.existsSync(reg)) {
    throw new Error("No existe scripts/jira-creado.json. Corré antes: node scripts/jira-import.js");
  }
  const clave = Object.fromEntries(
    JSON.parse(fs.readFileSync(reg, "utf8")).historias.map((x) => [x.id, x.key])
  );

  const hs = d.historias
    .filter((h) => h.epica !== "E15" && h.mvp && h.sprint)
    .map((h) => ({ ...h, jiraKey: clave[h.id] }));

  const sinClave = hs.filter((h) => !h.jiraKey).map((h) => h.id);
  if (sinClave.length) throw new Error("Sin clave de Jira: " + sinClave.join(", "));
  return { historias: hs, metas };
}

async function tablero() {
  const b = await api("GET", `/rest/agile/1.0/board?projectKeyOrId=${PROJECT}`);
  if (!b.values?.length) throw new Error(`El proyecto ${PROJECT} no tiene tablero.`);
  return b.values[0];
}

async function borrarSprints(boardId) {
  const s = await api("GET", `/rest/agile/1.0/board/${boardId}/sprint`);
  if (!s.values?.length) return console.log("   No hay sprints que borrar.\n");
  console.log(`🗑️  Borrando ${s.values.length} sprints (las historias vuelven al backlog)...`);
  for (const x of s.values) {
    try { await api("DELETE", `/rest/agile/1.0/sprint/${x.id}`); console.log(`   ✓ ${x.name}`); }
    catch (e) { console.log(`   ✗ ${x.name}: ${e.message.slice(0, 90)}`); }
  }
  console.log("");
}

async function main() {
  const falta = ["JIRA_URL", "JIRA_EMAIL", "JIRA_API_TOKEN"].filter((k) => !process.env[k]);
  if (falta.length) { console.error(`\n❌ Faltan en el .env: ${falta.join(", ")}\n`); process.exit(1); }

  const b = await tablero();
  console.log(`\n🔌 ${JIRA_URL} · tablero ${b.id} "${b.name}"\n`);

  if (BORRAR) return borrarSprints(b.id);

  const cal = calendario();
  const { historias, metas } = backlog();
  const hoy = new Date();

  // --mover HU-001=2 HU-009=3 …  cambia historias de sprint y ajusta su vencimiento.
  const movs = process.argv.filter((a) => /^HU-\d+=\d+$/.test(a));
  if (movs.length) {
    const sprints = (await api("GET", `/rest/agile/1.0/board/${b.id}/sprint`)).values;
    const idDe = Object.fromEntries(sprints.map((s) => [Number(s.name.replace(/\D/g, "")), s.id]));
    const porId = Object.fromEntries(historias.map((h) => [h.id, h]));
    console.log("🔀 Moviendo historias...\n");
    for (const m of movs) {
      const [hu, destinoStr] = m.split("=");
      const destino = Number(destinoStr);
      const h = porId[hu];
      const s = cal.find((x) => x.n === destino);
      if (!h) { console.log(`   ✗ ${hu}: no está en el MVP`); continue; }
      if (!idDe[destino] || !s) { console.log(`   ✗ ${hu}: no existe el Sprint ${destino}`); continue; }
      try {
        await api("POST", `/rest/agile/1.0/sprint/${idDe[destino]}/issue`, { issues: [h.jiraKey] });
        await api("PUT", `/rest/api/2/issue/${h.jiraKey}`, { fields: { duedate: iso(s.fin) } });
        console.log(`   ✓ ${hu} (${h.jiraKey})  Sprint ${h.sprint} → Sprint ${destino}   vence ${iso(s.fin)}`);
        // Refleja el cambio en el backlog para que Excel y HTML no se desincronicen
        const ruta = path.join(__dirname, "../docs/backlog.data.json");
        const doc = JSON.parse(fs.readFileSync(ruta, "utf8"));
        const t = doc.historias.find((x) => x.id === hu);
        if (t) { t.sprint = destino; fs.writeFileSync(ruta, JSON.stringify(doc, null, 2), "utf8"); }
      } catch (e) { console.log(`   ✗ ${hu}: ${e.message.slice(0, 110)}`); }
    }
    console.log("");
    return;
  }

  // Fecha de vencimiento = viernes de cierre del sprint en que cae la historia.
  if (SOLO_FECHAS) {
    const finDe = Object.fromEntries(cal.map((s) => [s.n, iso(s.fin)]));
    console.log("📆 Poniendo fecha de vencimiento a cada historia...\n");
    let ok = 0; const fallos = [];
    for (const h of historias) {
      const due = finDe[h.sprint];
      if (!due) continue;
      try {
        await api("PUT", `/rest/api/2/issue/${h.jiraKey}`, { fields: { duedate: due } });
        ok++;
      } catch (e) { fallos.push(`${h.jiraKey}: ${e.message.slice(0, 70)}`); }
    }
    const porS = {};
    historias.forEach((h) => (porS[h.sprint] = finDe[h.sprint]));
    for (const s of cal) if (porS[s.n]) console.log(`   Sprint ${String(s.n).padStart(2)}  vence ${porS[s.n]}  ${historias.filter((h) => h.sprint === s.n).length} historias`);
    console.log(`\n   ✅ ${ok}/${historias.length} actualizadas${fallos.length ? `\n   ✗ ${fallos.join("\n   ✗ ")}` : ""}\n`);
    return;
  }

  // Reparto: el plan tiene 11 sprints de contenido; si el calendario da más,
  // los sobrantes quedan libres para estabilización y preparación de la demo.
  const porSprint = {};
  for (const h of historias) (porSprint[h.sprint] ||= []).push(h);

  console.log("📅 Calendario\n");
  for (const s of cal) {
    const hs = porSprint[s.n] || [];
    const sp = hs.reduce((a, h) => a + h.sp, 0);
    const enCurso = hoy >= s.ini && hoy <= masDias(s.fin, 1) ? "  ← en curso" : "";
    const meta = metas[s.n] || "Estabilización, corrección y preparación de la entrega.";
    console.log(`   Sprint ${String(s.n).padStart(2)}  ${fmt(s.ini)} – ${fmt(s.fin)}  ${String(sp).padStart(2)} SP  ${String(hs.length).padStart(2)} HU${enCurso}`);
    console.log(`             ${meta}`);
  }
  const total = historias.reduce((a, h) => a + h.sp, 0);
  console.log(`\n   ${cal.length} sprints · ${historias.length} historias · ${total} SP · ${(total / cal.length).toFixed(1)} SP por sprint\n`);

  if (DRY) { console.log("🔍 --dry-run: no se creó nada.\n"); return; }

  console.log("🏃 Creando sprints...");
  const creados = {};
  for (const s of cal) {
    const cuerpo = {
      name: `Sprint ${s.n}`,
      originBoardId: b.id,
      startDate: s.ini.toISOString(),
      endDate: masDias(s.fin, 1).toISOString(), // cierra al final del viernes
      goal: (metas[s.n] || "Estabilización y preparación de la entrega.").slice(0, 250),
    };
    const r = await api("POST", "/rest/agile/1.0/sprint", cuerpo);
    creados[s.n] = r.id;
    console.log(`   ✓ Sprint ${String(s.n).padStart(2)}  id=${r.id}  ${fmt(s.ini)} – ${fmt(s.fin)}`);
  }

  console.log("\n📥 Asignando historias...");
  for (const s of cal) {
    const hs = porSprint[s.n] || [];
    if (!hs.length) { console.log(`   · Sprint ${String(s.n).padStart(2)}  (sin historias, queda de reserva)`); continue; }
    const claves = hs.map((h) => h.jiraKey).filter(Boolean);
    if (claves.length !== hs.length) throw new Error("Faltan claves de Jira; corré antes jira-import.js");
    // La API acepta como máximo 50 por llamada
    for (let i = 0; i < claves.length; i += 50) {
      await api("POST", `/rest/agile/1.0/sprint/${creados[s.n]}/issue`, { issues: claves.slice(i, i + 50) });
    }
    console.log(`   ✓ Sprint ${String(s.n).padStart(2)}  ${claves.length} historias  (${hs.reduce((a, h) => a + h.sp, 0)} SP)`);
  }

  if (ACTIVAR) {
    const actual = cal.find((s) => hoy >= s.ini && hoy <= masDias(s.fin, 1)) || cal[0];
    console.log(`\n▶️  Poniendo en curso el Sprint ${actual.n}...`);
    try {
      await api("POST", `/rest/agile/1.0/sprint/${creados[actual.n]}`, { state: "active" });
      console.log(`   ✓ Sprint ${actual.n} activo`);
    } catch (e) {
      console.log(`   ⚠ No se pudo activar: ${e.message.slice(0, 140)}`);
      console.log(`     Hacelo a mano desde el backlog con el botón "Iniciar sprint".`);
    }
  }

  console.log(`\n✅ Listo.\n🔗 ${JIRA_URL}/jira/software/projects/${PROJECT}/boards/${b.id}/backlog\n`);
  console.log("ℹ️  Jira no inicia los sprints solo: cada lunes hay que pulsar \"Iniciar sprint\"");
  console.log("   en el backlog, y \"Completar sprint\" el viernes.\n");
}

main().catch((e) => { console.error("\n❌ " + e.message + "\n"); process.exit(1); });
