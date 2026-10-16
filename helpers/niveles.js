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

/** Nivel que corresponde a una cantidad de XP. */
function nivelPara(xp) {
  const puntos = Math.max(Number(xp) || 0, 0);
  let nivel = 0;
  while (nivel < NIVEL_MAXIMO && puntos >= umbral(nivel + 1)) nivel += 1;
  return nivel;
}

/**
 * Todo lo que hace falta para pintar una barra de progreso, calculado acá y no
 * en el cliente: así el panel, la app y cualquier otro consumidor muestran
 * exactamente lo mismo.
 */
function progreso(xp) {
  const puntos = Math.max(Number(xp) || 0, 0);
  const nivel = nivelPara(puntos);
  const base = umbral(nivel);
  const siguiente = nivel >= NIVEL_MAXIMO ? null : umbral(nivel + 1);

  if (siguiente === null) {
    return { xp: puntos, nivel, xpNivelActual: base, xpSiguienteNivel: null, porcentaje: 100, faltan: 0 };
  }

  const ganado = puntos - base;
  const necesario = siguiente - base;
  return {
    xp: puntos,
    nivel,
    xpNivelActual: base,
    xpSiguienteNivel: siguiente,
    porcentaje: Math.min(Math.round((ganado / necesario) * 100), 100),
    faltan: Math.max(siguiente - puntos, 0),
  };
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
};

/** XP que corresponde a una actividad: el suyo si lo tiene, el de su tipo si no. */
function xpDeActividad({ xp, type }) {
  if (xp !== undefined && xp !== null && xp !== "") return Number(xp);
  return XP_POR_TIPO[type] ?? XP_POR_TIPO.Recurso;
}

module.exports = { umbral, nivelPara, progreso, NIVEL_MAXIMO, XP_POR_TIPO, xpDeActividad };
