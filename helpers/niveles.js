// Tabla de niveles (HU-054).
//
// Hasta ahora la "fórmula" vivía escrita a mano en el panel —(level + 1) * 100—
// y el backend nunca calculaba un nivel. Acá queda en un solo lugar, del lado
// del servidor, que es quien acredita el XP y por lo tanto el único que puede
// decidir el nivel sin que dos clientes muestren números distintos.
//
// La curva es cuadrática: cada nivel cuesta 50 XP más que el anterior.
//
//   umbral(n) = 25 * n * (n + 3)
//
//   nivel 1 →  100      nivel 4 →  700      nivel 7 → 1750
//   nivel 2 →  250      nivel 5 → 1000      nivel 8 → 2200
//   nivel 3 →  450      nivel 6 → 1350      nivel 9 → 2700
//
// Empieza barata para que las primeras actividades se sientan, y se estira
// después para que llegar a los niveles altos siga significando algo.
const umbral = (nivel) => (nivel <= 0 ? 0 : 25 * nivel * (nivel + 3));

// Tope de seguridad: sin él, un XP corrupto haría girar el bucle sin fin.
const NIVEL_MAXIMO = 100;

// ── Tabla propia de una organización (HU-053) ────────────────────────────
//
// Todas las funciones de abajo reciben `tabla` opcional: la de la empresa,
// como [{ numero, xp_minimo, nombre }] ordenada por número y sin saltos
// (1, 2, 3...). Sin tabla se usa la curva por defecto de arriba, así una
// empresa que nunca configuró nada sigue funcionando igual que antes.

/** XP que pide un nivel. Null si la tabla no llega a ese nivel. */
function umbralDe(nivel, tabla = null) {
  if (nivel <= 0) return 0;
  if (!tabla) return nivel > NIVEL_MAXIMO ? null : umbral(nivel);
  return tabla[nivel - 1]?.xp_minimo ?? null;
}

/** El nivel más alto que se puede alcanzar. */
const maximoDe = (tabla = null) => (tabla ? tabla.length : NIVEL_MAXIMO);

/** El nombre de un nivel, si la empresa le puso uno. */
const nombreDe = (nivel, tabla = null) => (tabla && nivel > 0 ? tabla[nivel - 1]?.nombre ?? null : null);

/** Nivel que corresponde a una cantidad de XP. */
function nivelPara(xp, tabla = null) {
  const puntos = Math.max(Number(xp) || 0, 0);
  const maximo = maximoDe(tabla);
  let nivel = 0;
  while (nivel < maximo && puntos >= umbralDe(nivel + 1, tabla)) nivel += 1;
  return nivel;
}

/**
 * La barra hacia el siguiente nivel, partiendo de `nivel`.
 *
 * Normalmente `nivel` es el que da el XP, pero puede ser más alto: el nivel
 * nunca baja con el uso, y entonces la barra se arma desde el que se muestra
 * para que el número y el "te faltan" no se contradigan.
 */
function progresoEn(nivel, xp, tabla = null) {
  const puntos = Math.max(Number(xp) || 0, 0);
  const base = umbralDe(nivel, tabla) ?? 0;
  const siguiente = nivel >= maximoDe(tabla) ? null : umbralDe(nivel + 1, tabla);
  const nombres = { nombreNivel: nombreDe(nivel, tabla), nombreSiguiente: siguiente === null ? null : nombreDe(nivel + 1, tabla) };

  if (siguiente === null) {
    return { xp: puntos, nivel, xpNivelActual: base, xpSiguienteNivel: null, porcentaje: 100, faltan: 0, ...nombres };
  }

  return {
    xp: puntos,
    nivel,
    xpNivelActual: base,
    xpSiguienteNivel: siguiente,
    porcentaje: Math.min(Math.max(Math.round(((puntos - base) / (siguiente - base)) * 100), 0), 100),
    faltan: Math.max(siguiente - puntos, 0),
    ...nombres,
  };
}

/**
 * Todo lo que hace falta para pintar una barra de progreso, calculado acá y no
 * en el cliente: así el panel, la app y cualquier otro consumidor muestran
 * exactamente lo mismo.
 */
function progreso(xp, tabla = null) {
  return progresoEn(nivelPara(xp, tabla), xp, tabla);
}


// Cuánto XP otorga cada tipo de actividad cuando no se indica otra cosa.
//
// Antes el valor por defecto era 0, así que una actividad creada sin tocar ese
// campo no daba puntos: 11 de las 13 que existían valían 0 y la gamificación
// no hacía nada. Ahora el tipo alcanza para que funcione, y quien quiera
// afinar un caso concreto sigue pudiendo poner su propio valor.
//
// La escala sigue el esfuerzo: mirar un material cuesta menos que resolver una
// tarea, y eso menos que un examen.
const XP_POR_TIPO = {
  Recurso: 10, // leer un PDF, ver un video
  Tarea: 30,   // entregar un trabajo, que además alguien corrige
  Examen: 50,  // la evaluación del curso
  Concurso: 30, // un juego de preguntas: se puede rejugar, pero paga una vez
};

/** XP que corresponde a una actividad: el suyo si lo tiene, el de su tipo si no. */
function xpDeActividad({ xp, type }) {
  if (xp !== undefined && xp !== null && xp !== "") return Number(xp);
  return XP_POR_TIPO[type] ?? XP_POR_TIPO.Recurso;
}

module.exports = {
  umbral, umbralDe, maximoDe, nombreDe, nivelPara, progreso, progresoEn,
  NIVEL_MAXIMO, XP_POR_TIPO, xpDeActividad,
};
