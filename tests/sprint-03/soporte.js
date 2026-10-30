// Soporte propio de las pruebas del Sprint 3.
//
// Parte del Supabase falso compartido (tests/soporte/supabaseFalso.js), que ya
// se instala en la caché de require, y le agrega lo que estas historias usan y
// el compartido no tiene: ilike, range, lt, upsert, el conteo exacto y el
// `.select().maybeSingle()` que sigue a un delete o update. No se edita el
// archivo compartido: se reemplaza `supabase.from` en este proceso (node --test
// corre cada archivo en su propio proceso, así que no afecta a otras suites).
//
// También reemplaza el mailer: los correos quedan en `correos` en vez de salir.
process.env.JWT_SECRET = process.env.JWT_SECRET || "secreto-de-prueba-sprint-3";
process.env.MAIL_PROVIDER = "consola";
process.env.URL_FRONT = "http://front.prueba";

const path = require("node:path");
const compartido = require("../soporte/supabaseFalso.js");
const { supabase, estado, preparar } = compartido;

function consulta(nombre) {
  const filtros = [];
  let operacion = "select";
  let valores = null;
  let unico = null;
  let rango = null;
  let devolver = false; // .select() después de una escritura

  const filas = () => (estado.tablas[nombre] || []).filter((f) => filtros.every((c) => c(f)));
  const comoLike = (patron) =>
    new RegExp("^" + String(patron).replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*") + "$", "i");

  const forma = (data) => {
    if (unico === "single") {
      return data.length === 1 ? { data: data[0], error: null } : { data: null, error: { message: "no rows" } };
    }
    if (unico === "maybe") return { data: data[0] ?? null, error: null };
    return { data, error: null, count: data.length };
  };

  const ejecutar = () => {
    if (operacion === "insert" || operacion === "upsert") {
      estado.escrituras.push({ tabla: nombre, operacion, valores });
      const lista = Array.isArray(valores) ? valores : [valores];
      estado.tablas[nombre] = [...(estado.tablas[nombre] || []), ...lista.map((v) => ({ ...v }))];
      return forma(lista);
    }
    if (operacion === "update") {
      const afectadas = filas();
      afectadas.forEach((f) => Object.assign(f, valores));
      estado.escrituras.push({ tabla: nombre, operacion, valores, filas: afectadas.length });
      return devolver ? forma(afectadas) : { data: afectadas, error: null };
    }
    if (operacion === "delete") {
      const borrar = filas();
      const set = new Set(borrar);
      estado.tablas[nombre] = (estado.tablas[nombre] || []).filter((f) => !set.has(f));
      estado.escrituras.push({ tabla: nombre, operacion, filas: borrar.length });
      return devolver ? forma(borrar) : { data: borrar, error: null };
    }
    let data = filas();
    const total = data.length;
    if (rango) data = data.slice(rango[0], rango[1] + 1);
    const r = forma(data);
    if (!unico) r.count = total;
    return r;
  };

  const q = {
    select: () => { if (operacion !== "select") devolver = true; return q; },
    insert: (v) => { operacion = "insert"; valores = v; return q; },
    upsert: (v) => { operacion = "upsert"; valores = v; return q; },
    update: (v) => { operacion = "update"; valores = v; return q; },
    delete: () => { operacion = "delete"; return q; },
    eq: (c, v) => { filtros.push((f) => f[c] === v); return q; },
    neq: (c, v) => { filtros.push((f) => f[c] !== v); return q; },
    in: (c, vs) => { filtros.push((f) => vs.includes(f[c])); return q; },
    gte: (c, v) => { filtros.push((f) => f[c] >= v); return q; },
    lt: (c, v) => { filtros.push((f) => f[c] < v); return q; },
    is: (c, v) => { filtros.push((f) => (f[c] ?? null) === v); return q; },
    not: (c, op, v) => { filtros.push((f) => !(op === "is" && (f[c] ?? null) === v)); return q; },
    ilike: (c, p) => { const re = comoLike(p); filtros.push((f) => re.test(String(f[c] ?? ""))); return q; },
    or: () => q,
    order: () => q,
    limit: () => q,
    range: (a, b) => { rango = [a, b]; return q; },
    maybeSingle: () => { unico = "maybe"; return q; },
    single: () => { unico = "single"; return q; },
    then: (ok, mal) => Promise.resolve(ejecutar()).then(ok, mal),
  };
  return q;
}

supabase.from = (nombre) => consulta(nombre);

// Mailer falso: guarda lo que se habría enviado.
const correos = [];
const rutaMailer = path.resolve(__dirname, "../../helpers/mailer.js");
require.cache[rutaMailer] = {
  id: rutaMailer,
  filename: rutaMailer,
  loaded: true,
  exports: {
    PROVEEDOR: "consola",
    enviarCorreo: async (m) => { correos.push(m); return { enviado: false, proveedor: "prueba" }; },
  },
};

/** Respuesta HTTP mínima para probar controladores y middlewares sin Express. */
function respuesta() {
  const res = {
    statusCode: 200,
    cuerpo: undefined,
    cabeceras: {},
    locals: {},
    status(c) { res.statusCode = c; return res; },
    json(b) { res.cuerpo = b; return res; },
    send(b) { res.cuerpo = b; return res; },
    set(k, v) {
      if (typeof k === "object") Object.assign(res.cabeceras, k);
      else res.cabeceras[k] = v;
      return res;
    },
  };
  return res;
}

/** Pasa una petición por una cadena de middlewares como lo haría Express. */
async function pasarPor(cadena, req, res = respuesta()) {
  for (const mw of cadena) {
    let siguio = false;
    await mw(req, res, () => { siguio = true; });
    if (!siguio) break;
  }
  return res;
}

/** Ejecuta fn con console silenciado (los servicios registran mucho). */
async function enSilencio(fn) {
  const orig = { log: console.log, warn: console.warn, error: console.error };
  console.log = console.warn = console.error = () => {};
  try { return await fn(); } finally { Object.assign(console, orig); }
}

module.exports = { supabase, estado, preparar, correos, respuesta, pasarPor, enSilencio };
