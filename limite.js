// Rate-limit en memoria por clave (IP, o IP+recurso).
//
// A diferencia del patrón de tarjetas-lealtad, este PODA las llaves vencidas: un
// Map que solo crece es una fuga de memoria lenta en un proceso que vive meses.
// La poda es perezosa (cada PODA_CADA llamadas) para no pagar un barrido por request.
//
// ponytail: memoria de un solo proceso. Si algún día corren PM2 en modo cluster
// o varias réplicas, cada una tendrá su propio contador y el límite real se
// multiplica por el número de procesos. Ahí sí toca un store compartido.

const PODA_CADA = 500;

function limitador({ max, ventanaMs }) {
  const hits = new Map(); // clave -> [timestamps]
  let llamadas = 0;

  function podar(ahora) {
    for (const [clave, ts] of hits) {
      const vivos = ts.filter(t => ahora - t < ventanaMs);
      if (vivos.length) hits.set(clave, vivos);
      else hits.delete(clave);
    }
  }

  /** Devuelve true si la petición se debe RECHAZAR por exceso. */
  return function excedido(clave) {
    const ahora = Date.now();
    if (++llamadas % PODA_CADA === 0) podar(ahora);

    const vivos = (hits.get(clave) || []).filter(t => ahora - t < ventanaMs);
    if (vivos.length >= max) {
      hits.set(clave, vivos);
      return true;
    }
    vivos.push(ahora);
    hits.set(clave, vivos);
    return false;
  };
}

module.exports = { limitador };
