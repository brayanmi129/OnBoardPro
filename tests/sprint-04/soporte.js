// Extensión del Supabase falso compartido para los sprints 4 y 5.
//
// No toca tests/soporte/supabaseFalso.js (lo usan otras suites): lo carga,
// y envuelve `supabase.from` para sumar lo que estas historias necesitan:
//
//   ilike, or("col.op.valor,..."), order real, range, select con head:true,
//   upsert con onConflict, y que delete/update + maybeSingle devuelvan una
//   sola fila (o null) como hace PostgREST.
//
// Los filtros nuevos se traducen a un `in` sobre una marca oculta de cada fila
// (una propiedad no enumerable con la fila misma), así se reutiliza el motor
// de filtros del fake original sin reescribirlo.
const base = require("../soporte/supabaseFalso.js");
const { supabase, estado } = base;

const FILA = Symbol("fila");
const fromOriginal = supabase.from;

function comoRegex(patron) {
  const escapado = String(patron).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp("^" + escapado.replace(/%/g, ".*").replace(/_/g, ".") + "$", "i");
}

// Interpreta el filtro `or` como lo haría PostgREST: condiciones separadas por
// coma, cada una "columna.operador.valor".
function condicionesDeOr(texto) {
  return String(texto).split(",").map((parte) => {
    const [col, op, ...resto] = parte.split(".");
    const valor = resto.join(".");
    if (op === "ilike") { const re = comoRegex(valor); return (f) => re.test(String(f[col] ?? "")); }
    if (op === "eq") return (f) => String(f[col]) === valor;
    return () => false;
  });
}

function comparar(a, b) {
  if (a === b) return 0;
  if (a === undefined || a === null) return 1;
  if (b === undefined || b === null) return -1;
  return a < b ? -1 : 1;
}

supabase.from = (nombre) => {
  const q = fromOriginal(nombre);
  const orden = [];
  let rango = null;
  let head = false;
  let escritura = null;
  let unico = null;

  const filtrar = (pred) => {
    const filas = estado.tablas[nombre] || [];
    filas.forEach((f) => {
      if (!Object.prototype.hasOwnProperty.call(f, FILA)) {
        Object.defineProperty(f, FILA, { value: f, enumerable: false });
      }
    });
    return q.in(FILA, filas.filter(pred));
  };

  const original = { ...q };

  q.select = (_cols, opciones) => { if (opciones?.head) head = true; return q; };
  q.update = (v) => { escritura = "update"; return original.update(v); };
  q.delete = () => { escritura = "delete"; return original.delete(); };
  q.maybeSingle = () => { unico = "maybe"; return original.maybeSingle(); };
  q.single = () => { unico = "single"; return original.single(); };
  q.ilike = (c, patron) => { const re = comoRegex(patron); return filtrar((f) => re.test(String(f[c] ?? ""))); };
  q.or = (texto) => { const conds = condicionesDeOr(texto); return filtrar((f) => conds.some((c) => c(f))); };
  q.order = (c, { ascending = true } = {}) => { orden.push({ c, ascending }); return q; };
  q.range = (desde, hasta) => { rango = [desde, hasta]; return q; };
  q.upsert = (registros, { onConflict } = {}) => {
    const lista = Array.isArray(registros) ? registros : [registros];
    const claves = onConflict ? onConflict.split(",").map((s) => s.trim()) : ["id"];
    const vistos = [...(estado.tablas[nombre] || [])];
    const nuevos = [];
    for (const r of lista) {
      if (!vistos.some((f) => claves.every((k) => f[k] === r[k]))) { vistos.push(r); nuevos.push(r); }
    }
    return original.insert(nuevos);
  };

  q.then = (ok, mal) =>
    original.then((r) => {
      if (escritura && unico) return { ...r, data: Array.isArray(r.data) ? r.data[0] ?? null : r.data };
      if (escritura || !Array.isArray(r.data)) return r;
      let data = [...r.data];
      for (const { c, ascending } of [...orden].reverse()) {
        data.sort((a, b) => (ascending ? 1 : -1) * comparar(a[c], b[c]));
      }
      const count = r.count ?? data.length;
      if (rango) data = data.slice(rango[0], rango[1] + 1);
      return { ...r, data: head ? null : data, count };
    }).then(ok, mal);

  return q;
};

/** Un `res` de Express mínimo para probar controladores. */
function resFalsa() {
  const r = { statusCode: 200, body: undefined, headers: {} };
  r.status = (c) => { r.statusCode = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  r.send = (b) => { r.body = b; return r; };
  r.set = (h) => { Object.assign(r.headers, h); return r; };
  return r;
}

module.exports = { ...base, resFalsa };
