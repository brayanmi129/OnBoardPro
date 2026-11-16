// Lecturas que no caben en una sola respuesta de PostgREST.
//
// PostgREST corta cada respuesta en 1000 filas y no avisa: la consulta "sale
// bien" con la mitad de los datos. Ya nos pasó con el ranking de un curso. Lo
// que suma movimientos o recorre a toda una organización pasa por acá.
//
// Y una lista larga de ids en un .in() viaja en la URL: con cientos de ids la
// petición la rechaza el proxy antes de llegar a la base. Por eso se parte en
// lotes.

const PAGINA = 1000;
const LOTE = 150;

/**
 * Trae todas las filas de una consulta, de a 1000.
 *
 * `armar` devuelve una consulta nueva en cada llamada: un builder de Supabase
 * no se puede reusar después de ejecutarlo. Conviene que la consulta tenga un
 * .order() estable para que las páginas no se pisen.
 */
async function todasLasFilas(armar) {
  const filas = [];
  for (let desde = 0; ; desde += PAGINA) {
    const { data, error } = await armar().range(desde, desde + PAGINA - 1);
    if (error) throw new Error(error.message);
    filas.push(...(data || []));
    if (!data || data.length < PAGINA) return filas;
  }
}

/**
 * Igual que todasLasFilas, con un .in() sobre muchos ids partido en lotes.
 * `armar(lote)` recibe los ids del lote. Los lotes van en paralelo.
 */
async function porLotes(ids, armar) {
  const unicos = [...new Set(ids)].filter((x) => x != null);
  if (!unicos.length) return [];
  const lotes = [];
  for (let i = 0; i < unicos.length; i += LOTE) lotes.push(unicos.slice(i, i + LOTE));
  const partes = await Promise.all(lotes.map((lote) => todasLasFilas(() => armar(lote))));
  return partes.flat();
}

module.exports = { todasLasFilas, porLotes };
