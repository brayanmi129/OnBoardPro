// Fechas en hora de Colombia.
//
// Los clientes trabajan en Colombia (UTC-5, sin horario de verano). "Esta
// semana" para alguien en Bogotá empieza el lunes a las 00:00 de allá, no a
// las 00:00 UTC, que son las 7 de la noche del domingo. La racha y el tope
// diario ya cuentan los días así; el ranking y el tablero también.
const DESFASE_MS = 5 * 60 * 60 * 1000;
const DIA_MS = 24 * 60 * 60 * 1000;

const PERIODOS = ["semana", "mes", "siempre"];

/** "YYYY-MM-DD" del día en Colombia al que pertenece un instante. */
function diaColombia(fecha) {
  return new Date(new Date(fecha).getTime() - DESFASE_MS).toISOString().slice(0, 10);
}

/**
 * Desde cuándo cuenta un periodo del ranking, como ISO en UTC.
 *   semana  lunes 00:00 en Colombia
 *   mes     día 1 00:00 en Colombia
 *   siempre null: no hay corte
 */
function inicioDePeriodo(periodo, ahora = new Date()) {
  if (periodo === "siempre") return null;
  // Se corre el reloj a la hora de Colombia y se trabaja con getUTC*: así el
  // resultado no depende de la zona horaria del servidor.
  const local = new Date(ahora.getTime() - DESFASE_MS);
  const y = local.getUTCFullYear();
  const m = local.getUTCMonth();
  const d = local.getUTCDate();
  let inicioLocal;
  if (periodo === "semana") {
    const desdeLunes = (local.getUTCDay() + 6) % 7; // lunes = 0
    inicioLocal = Date.UTC(y, m, d - desdeLunes);
  } else {
    inicioLocal = Date.UTC(y, m, 1);
  }
  return new Date(inicioLocal + DESFASE_MS).toISOString();
}

/** El periodo pedido, o 400 si no es uno de los conocidos. Vacío es "siempre". */
function periodoValido(periodo, fallo) {
  if (periodo === undefined || periodo === null || periodo === "") return "siempre";
  const p = String(periodo).toLowerCase();
  if (!PERIODOS.includes(p)) throw fallo(`periodo tiene que ser uno de: ${PERIODOS.join(", ")}.`, 400);
  return p;
}

module.exports = { diaColombia, inicioDePeriodo, periodoValido, PERIODOS, DIA_MS };
