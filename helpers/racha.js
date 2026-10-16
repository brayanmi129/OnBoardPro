// Racha de días activos (HU-058).
//
// La racha cuenta días seguidos con actividad, no actividades: hacer diez
// cosas en un día es un día, no diez.
//
// El cálculo vive acá y no dentro del servicio porque es la parte que se puede
// equivocar en silencio —un día de más o de menos no rompe nada, solo da un
// número mal— y así se puede probar sola.

// Las fechas se resuelven en hora de Colombia y no en UTC. Con UTC la racha
// cambiaba de día a las 7 de la tarde: alguien que estudia de noche cerraba
// dos días distintos en la misma sesión, o perdía la racha sin haber faltado.
const ZONA = "America/Bogota";

/** La fecha de hoy en la zona del producto, como 'AAAA-MM-DD'. */
function hoy(ahora = new Date()) {
  // 'en-CA' formatea como AAAA-MM-DD, que es justo lo que guarda un DATE.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONA, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(ahora);
}

/** Días calendario entre dos fechas 'AAAA-MM-DD'. Negativo si la segunda es anterior. */
function diasEntre(desde, hasta) {
  const aMedianoche = (f) => {
    const [anio, mes, dia] = String(f).slice(0, 10).split("-").map(Number);
    return Date.UTC(anio, mes - 1, dia);
  };
  return Math.round((aMedianoche(hasta) - aMedianoche(desde)) / 86400000);
}

/**
 * La racha después de registrar actividad hoy.
 *
 * Tres casos y nada más:
 *   - ya hubo actividad hoy          -> la racha no se mueve
 *   - la última fue ayer             -> un día más
 *   - no hubo nunca, o hace dos días -> vuelve a empezar en 1
 *
 * Una fecha futura (reloj mal puesto, dato migrado) se trata como "hoy": es
 * preferible no mover la racha a regalarla o a cortarla por un dato corrupto.
 */
function siguienteRacha({ ultimaActividad, racha = 0, rachaMaxima = 0 }, fecha = hoy()) {
  const actual = Math.max(Number(racha) || 0, 0);
  const maxima = Math.max(Number(rachaMaxima) || 0, 0);

  if (!ultimaActividad) {
    return { racha: 1, rachaMaxima: Math.max(maxima, 1), ultimaActividad: fecha, cambio: true };
  }

  const dias = diasEntre(String(ultimaActividad).slice(0, 10), fecha);

  if (dias <= 0) {
    // Ya contaba para hoy. Se devuelve igual, sin escribir en la base.
    return { racha: actual, rachaMaxima: maxima, ultimaActividad, cambio: false };
  }

  const nueva = dias === 1 ? actual + 1 : 1;
  return {
    racha: nueva,
    rachaMaxima: Math.max(maxima, nueva),
    ultimaActividad: fecha,
    cambio: true,
  };
}

module.exports = { ZONA, hoy, diasEntre, siguienteRacha };
