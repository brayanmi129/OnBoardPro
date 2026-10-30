// Ayudas de las pruebas de los sprints 1 y 2. Se apoyan en el Supabase falso
// compartido (tests/soporte/supabaseFalso.js) sin modificarlo.
const { before, after } = require("node:test");
const falso = require("../soporte/supabaseFalso.js");

/** Un `res` de Express mínimo que recuerda lo que el código le respondió. */
function respuesta() {
  const res = {
    statusCode: 200,
    body: undefined,
    redirigidoA: null,
    cabeceras: {},
    locals: {},
    status(c) { res.statusCode = c; return res; },
    json(b) { res.body = b; return res; },
    send(b) { res.body = b; return res; },
    set(h) { Object.assign(res.cabeceras, h); return res; },
    redirect(url) { res.statusCode = 302; res.redirigidoA = url; return res; },
  };
  return res;
}

/** Pasa un middleware y dice si llamó a next() y qué respondió. */
function correrMiddleware(mw, req) {
  const res = respuesta();
  let siguio = false;
  mw(req, res, () => { siguio = true; });
  return { res, siguio };
}

/** Calla los console.log/warn/error del código bajo prueba durante el archivo. */
function silenciarConsola() {
  const original = { log: console.log, warn: console.warn, error: console.error };
  before(() => { console.log = console.warn = console.error = () => {}; });
  after(() => Object.assign(console, original));
}

/**
 * Hace que toda consulta a `tabla` devuelva `error`, como cuando la base
 * rechaza una escritura (p. ej. una clave única repetida). Devuelve la
 * función que deja todo como estaba.
 */
function fallarEn(tabla, error) {
  const original = falso.supabase.from;
  falso.supabase.from = (nombre) => {
    const q = original(nombre);
    if (nombre === tabla) {
      q.then = (ok, mal) => Promise.resolve({ data: null, error }).then(ok, mal);
    }
    return q;
  };
  return () => { falso.supabase.from = original; };
}

module.exports = { ...falso, respuesta, correrMiddleware, silenciarConsola, fallarEn };
