const { db } = require('./db');
const { esc, layout } = require('./ui');

// Radio por defecto de la geocerca. El GPS de un celular en interiores se va
// fácil 30-50 m, así que este número SE AJUSTA por sucursal, no se hardcodea.
const RADIO_DEFAULT_M = 120;

/** Distancia en metros entre dos coordenadas (haversine). */
function distanciaM(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const rad = g => (g * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * ¿La lectura GPS cae dentro de la geocerca del tag?
 * Devuelve null (desconocido) si falta el dato: sin geocerca configurada o sin
 * permiso de ubicación. null NO bloquea la checada, solo se marca en el reporte.
 */
function evaluarSitio(cfg, lat, lon, precision) {
  if (cfg.lat == null || cfg.lon == null) return null;
  if (lat == null || lon == null) return null;
  const radio = Number(cfg.radio_m) || RADIO_DEFAULT_M;
  // La precisión reportada por el navegador se suma al radio: castigar al
  // empleado por un GPS impreciso genera falsos positivos, no disciplina.
  const holgura = Math.min(Number(precision) || 0, 200);
  return distanciaM(lat, lon, cfg.lat, cfg.lon) <= radio + holgura ? 1 : 0;
}

// Duración máxima plausible de un turno. Pasado esto, una entrada sin salida se
// considera un olvido, no un turno en curso. Se ajusta por si algún cliente tiene
// turnos largos (guardias de 24 h): súbelo antes que perseguir checadas raras.
const HORAS_MAX_TURNO = 16;

/**
 * La siguiente checada alterna: si la última fue entrada, toca salida.
 *
 * Excepción importante: si esa entrada ya lleva más de HORAS_MAX_TURNO abierta,
 * el empleado olvidó checar su salida. Sin esta regla, ese olvido invertiría
 * entrada/salida en TODOS sus días siguientes, de forma permanente.
 * El turno viejo queda abierto a propósito: dos entradas seguidas en el reporte
 * es justo la señal de que faltó una salida.
 */
function siguienteTipo(empleadoId, horasMaxTurno = HORAS_MAX_TURNO) {
  const ultima = db.prepare(`
    SELECT tipo, (julianday('now','localtime') - julianday(created_at)) * 24 AS horas
    FROM checadas WHERE empleado_id = ? ORDER BY id DESC LIMIT 1
  `).get(empleadoId);

  if (!ultima || ultima.tipo === 'salida') return 'entrada';
  return ultima.horas > horasMaxTurno ? 'entrada' : 'salida';
}

function empleadoPorPin(clienteId, pin) {
  return db.prepare(
    'SELECT * FROM empleados WHERE cliente_id = ? AND pin = ? AND activo = 1'
  ).get(clienteId, String(pin || ''));
}

/**
 * Registra la checada. Devuelve { ok, empleado, tipo, en_sitio } o { error }.
 */
function checar({ tag, cfg, pin, lat, lon, precision }) {
  if (!tag.cliente_id) return { error: 'Este tag todavía no está asignado a una empresa' };
  const empleado = empleadoPorPin(tag.cliente_id, pin);
  if (!empleado) return { error: 'PIN no reconocido' };

  const tipo = siguienteTipo(empleado.id);
  const en_sitio = evaluarSitio(cfg, lat, lon, precision);

  const r = db.prepare(`
    INSERT INTO checadas (empleado_id, tag_id, tipo, lat, lon, precision_m, en_sitio)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(empleado.id, tag.id, tipo, lat ?? null, lon ?? null, precision ?? null, en_sitio);

  // Se devuelve la hora que quedó GUARDADA, no la del celular: si el reloj del
  // teléfono está desfasado, el empleado vería una hora y el reporte de nómina
  // otra, y esa discrepancia se descubre hasta la quincena.
  const { created_at } = db.prepare('SELECT created_at FROM checadas WHERE id = ?')
    .get(Number(r.lastInsertRowid));

  return { ok: true, empleado: empleado.nombre, tipo, en_sitio, hora: created_at };
}

// ---------- Página que ve el empleado al acercar el celular ----------
function renderChecador(tag, cfg) {
  const sucursal = cfg.sucursal || tag.etiqueta || 'Entrada principal';
  const body = `
    <div class="card">
      <h1>${esc(tag.cliente_nombre || 'Registro de asistencia')}</h1>
      <p class="muted">${esc(sucursal)}</p>
      <form id="f" autocomplete="off">
        <label for="pin">Tu PIN</label>
        <input id="pin" name="pin" type="text" inputmode="numeric" pattern="[0-9]*"
               maxlength="8" required autofocus autocomplete="off" placeholder="••••"
               style="font-size:1.5rem;letter-spacing:.3em;text-align:center">
        <button id="b" type="submit">Checar</button>
      </form>
      <div id="m" class="msg"></div>
      <p class="muted" style="margin-top:16px">Se registra tu ubicación al momento de checar.</p>
    </div>`;

  const script = `
    const f=document.getElementById('f'),b=document.getElementById('b'),m=document.getElementById('m');
    // Pide ubicación con tope de 8s: si el GPS no responde, la checada igual pasa
    // (marcada como sin ubicación) en vez de dejar al empleado atorado en la puerta.
    function ubicacion(){
      return new Promise(r=>{
        if(!navigator.geolocation) return r({});
        navigator.geolocation.getCurrentPosition(
          p=>r({lat:p.coords.latitude,lon:p.coords.longitude,precision:p.coords.accuracy}),
          ()=>r({}),
          {enableHighAccuracy:true,timeout:8000,maximumAge:0});
      });
    }
    f.addEventListener('submit',async e=>{
      e.preventDefault(); b.disabled=true; b.textContent='Registrando…';
      m.className='msg';
      const geo=await ubicacion();
      try{
        const r=await fetch(location.pathname+'/checar',{method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({pin:document.getElementById('pin').value,...geo})});
        const d=await r.json();
        if(!r.ok) throw new Error(d.error||'Error');
        // d.hora viene del servidor ("YYYY-MM-DD HH:MM:SS"): es la que quedó guardada.
        const hora=(d.hora||'').slice(11,16);
        m.className='msg show ok';
        m.textContent=d.tipo.toUpperCase()+' registrada · '+d.empleado+' · '+hora+
          (d.en_sitio===0?' (fuera del área)':'');
        f.reset();
      }catch(err){
        m.className='msg show bad';
        // "Failed to fetch" no le dice nada a alguien parado en la puerta a las 7am.
        m.textContent=/fetch|network/i.test(err.message)
          ? 'Sin conexión. Revisa tu señal e intenta de nuevo.' : err.message;
      }
      b.disabled=false; b.textContent='Checar';
      // Dispositivo compartido: el siguiente empleado encuentra el teclado listo.
      document.getElementById('pin').focus();
    });`;

  return layout({ titulo: 'Checar — ' + (tag.cliente_nombre || ''), acento: '#1E3A8A', body, script });
}

module.exports = {
  renderChecador, checar, distanciaM, evaluarSitio, siguienteTipo,
  RADIO_DEFAULT_M, HORAS_MAX_TURNO,
};
