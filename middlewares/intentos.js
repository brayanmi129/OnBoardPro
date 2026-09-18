// Freno contra fuerza bruta (HU-013).
//
// Los primeros 5 intentos fallidos son gratis. A partir de ahí hay que esperar,
// y la espera se duplica con cada fallo nuevo: 1, 2, 4, 8 y hasta 15 minutos.
// Entrar bien borra el contador.
//
// Se cuenta por cuenta y por IP, pero con umbrales muy distintos a propósito:
//
//   por cuenta:  5 fallos. Es el ataque que importa, adivinar una contraseña.
//   por IP:     20 fallos. Un cliente es una empresa entera saliendo por una
//               sola IP; con el mismo umbral que la cuenta, un empleado
//               distraído dejaría a todos sus compañeros sin poder entrar.
//
// El contador vive en memoria. Alcanza para la instancia única de Render; si
// algún día se corre en varias, cada una llevaría la suya.
const intentos = new Map();

const TOPE_MINUTOS = 15;

// Con gratis=5: el 5.º fallo bloquea 1 minuto, el 6.º 2, el 7.º 4, el 8.º 8 y
// de ahí en más el tope. O sea, el 6.º intento es el primero rechazado.
const espera = (fallos, gratis) =>
  fallos < gratis ? 0 : Math.min(2 ** (fallos - gratis), TOPE_MINUTOS);

// Limpieza cada 10 minutos para que el Map no crezca sin límite.
// unref() evita que el temporizador mantenga vivo el proceso.
setInterval(() => {
  const viejo = Date.now() - 60 * 60 * 1000;
  for (const [clave, r] of intentos) if (r.visto < viejo) intentos.delete(clave);
}, 10 * 60 * 1000).unref();

// `claves(req)` devuelve entradas { k, gratis }: qué vigilar y con qué margen.
function frenarFallos({ nombre, claves, codigosFallo = [401, 404] }) {
  return (req, res, next) => {
    const misClaves = claves(req)
      .filter((e) => e && e.k)
      .map((e) => ({ clave: `${nombre}:${e.k}`, gratis: e.gratis }));
    const ahora = Date.now();

    const bloqueada = misClaves.find((e) => (intentos.get(e.clave)?.hasta ?? 0) > ahora);
    if (bloqueada) {
      const seg = Math.ceil((intentos.get(bloqueada.clave).hasta - ahora) / 1000);
      res.set("Retry-After", String(seg));
      return res.status(429).json({
        message: `Demasiados intentos fallidos. Probá de nuevo en ${
          seg < 60 ? `${seg} segundos` : `${Math.ceil(seg / 60)} minutos`
        }.`,
      });
    }

    // El resultado solo se sabe cuando el controlador responde, así que se
    // envuelve res.json en vez de tocar la lógica de autenticación.
    const responder = res.json.bind(res);
    res.json = (cuerpo) => {
      if (res.statusCode < 300) {
        misClaves.forEach((e) => intentos.delete(e.clave)); // entrar bien reinicia
      } else if (codigosFallo.includes(res.statusCode)) {
        for (const { clave, gratis } of misClaves) {
          const r = intentos.get(clave) ?? { fallos: 0, hasta: 0 };
          r.fallos += 1;
          r.visto = Date.now();
          const min = espera(r.fallos, gratis);
          if (min > 0) {
            r.hasta = Date.now() + min * 60 * 1000;
            console.warn(`[seguridad] ${clave} bloqueado ${min} min tras ${r.fallos} fallos`);
          }
          intentos.set(clave, r);
        }
      }
      return responder(cuerpo);
    };

    next();
  };
}

module.exports = { frenarFallos, intentos };
