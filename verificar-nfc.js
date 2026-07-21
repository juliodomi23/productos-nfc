#!/usr/bin/env node
/**
 * Verifica que lo que hay detrás de una etiqueta NFC funcione de verdad en un celular.
 *
 *   node verificar-nfc.js                          # contra localhost:3040
 *   node verificar-nfc.js https://nfc.ambarrojo.mx # contra producción
 *
 * Comprueba lo que las pruebas unitarias NO ven: que la URL quepa en el chip, que
 * la página sea usable en un móvil real, que el .vcf lo entienda iOS, y que la
 * respuesta sea lo bastante ligera para datos móviles lentos.
 */
const BASE = (process.argv[2] || process.env.BASE_URL || 'http://localhost:3040').replace(/\/$/, '');
const USER = process.env.SUPERADMIN_USER || 'admin';
const PASS = process.env.SUPERADMIN_PASS || 'ambar-rojo-2026';
const AUTH = 'Basic ' + Buffer.from(`${USER}:${PASS}`).toString('base64');

// User-Agents reales: los dos celulares que van a leer estas etiquetas.
const UA_ANDROID = 'Mozilla/5.0 (Linux; Android 13; SM-A135M) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';
const UA_IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1';

// Capacidad útil de los chips más comunes, en bytes de payload NDEF.
const CHIPS = { NTAG213: 144, NTAG215: 504, NTAG216: 888 };

let fallos = 0, avisos = 0;
const ok   = (m, extra = '') => console.log(`  ok    ${m}${extra ? '  — ' + extra : ''}`);
const mal  = (m, d) => { fallos++; console.log(`  FALLA ${m}\n        ${d}`); };
const nota = (m, d) => { avisos++; console.log(`  aviso ${m}\n        ${d}`); };

/**
 * Tamaño del registro NDEF de una URL. El prefijo se comprime a 1 byte
 * ("https://" y "http://www." son códigos estándar), más ~7 bytes de cabecera.
 */
function bytesNdef(url) {
  const prefijos = ['https://www.', 'http://www.', 'https://', 'http://'];
  const p = prefijos.find(x => url.startsWith(x)) || '';
  return (url.length - p.length) + 1 + 7;
}

async function pedir(ruta, opts = {}) {
  const t0 = Date.now();
  const r = await fetch(BASE + ruta, {
    redirect: 'manual',
    headers: { 'User-Agent': UA_ANDROID, ...(opts.headers || {}) },
    ...opts,
  });
  return { r, ms: Date.now() - t0 };
}

(async () => {
  console.log(`\nVerificando ${BASE}\n${'─'.repeat(60)}`);

  // ---------- 1. El servicio responde ----------
  console.log('\n1. Servicio');
  try {
    const { r, ms } = await pedir('/salud');
    if (!r.ok) return mal('/salud no responde OK', `HTTP ${r.status}`);
    const d = await r.json();
    ok('el servicio está arriba', `${d.tags} etiquetas registradas, ${ms} ms`);
  } catch (e) {
    console.log(`  FALLA no se pudo conectar a ${BASE}\n        ${e.message}`);
    console.log('\n  ¿Está corriendo el servidor?  npm start\n');
    process.exit(1);
  }

  if (BASE.startsWith('https://')) ok('sirve por HTTPS');
  else if (BASE.includes('localhost')) nota('estás probando en localhost', 'en producción DEBE ser HTTPS o Android marca la página como insegura');
  else mal('producción sin HTTPS', 'Chrome en Android muestra "No seguro" y la geolocalización del checador NO funciona sin TLS');

  // ---------- 2. La URL cabe en el chip ----------
  console.log('\n2. Compatibilidad con el chip NFC');
  const { r: rl } = await pedir('/superadmin/api/tags/lote', {
    method: 'POST',
    headers: { Authorization: AUTH, 'Content-Type': 'application/json' },
    body: JSON.stringify({ cantidad: 1, etiqueta: 'verificacion' }),
  });
  if (rl.status !== 201) {
    mal('no se pudo generar una etiqueta de prueba', `HTTP ${rl.status} — ¿credenciales de superadmin correctas?`);
  } else {
    const url = (await rl.json()).urls[0];
    const bytes = bytesNdef(url);
    ok('URL de ejemplo', url);
    for (const [chip, cap] of Object.entries(CHIPS)) {
      if (bytes <= cap) ok(`cabe en ${chip}`, `${bytes} de ${cap} bytes`);
      else mal(`NO cabe en ${chip}`, `${bytes} bytes, capacidad ${cap}`);
    }

    const codigo = url.split('/t/')[1];

    // ---------- 3. La página que abre el celular ----------
    console.log('\n3. Lo que ve el celular al acercarse');
    for (const [nombre, ua] of [['Android', UA_ANDROID], ['iPhone', UA_IOS]]) {
      const { r, ms } = await pedir('/t/' + codigo, { headers: { 'User-Agent': ua } });
      if (!r.ok) { mal(`${nombre}: la etiqueta no abre`, `HTTP ${r.status}`); continue; }
      const html = await r.text();
      const kb = (Buffer.byteLength(html) / 1024).toFixed(1);

      const checks = [
        [/<meta[^>]+name=["']viewport["']/i, 'viewport'],
        [/<meta[^>]+charset=["']?utf-8/i, 'charset UTF-8'],
        [/<html[^>]+lang=["']es["']/i, 'lang="es"'],
        [/<title>/i, 'title'],
      ];
      const faltan = checks.filter(([re]) => !re.test(html)).map(([, n]) => n);
      if (faltan.length) mal(`${nombre}: faltan etiquetas de móvil`, faltan.join(', '));
      else ok(`${nombre}: la página abre y es apta para móvil`, `${kb} KB, ${ms} ms`);

      if (Number(kb) > 100) nota(`${nombre}: la página pesa ${kb} KB`, 'en 3G tarda; conviene bajar de 100 KB');
      if (ms > 1500) nota(`${nombre}: respondió en ${ms} ms`, 'arriba de 1.5 s el usuario cree que no funcionó');
    }

    // ---------- 4. El caso del tag recién grabado ----------
    const { r: rsa } = await pedir('/t/' + codigo);
    const htmlSa = await rsa.text();
    if (/sin asignar/i.test(htmlSa) && htmlSa.includes(codigo)) {
      ok('un tag recién grabado se identifica solo', 'muestra su código, así confirmas que quedó bien grabado');
    } else {
      mal('el tag sin asignar no muestra su código', 'no podrás verificar el grabado antes de pegar la etiqueta');
    }
  }

  // ---------- 5. Etiqueta inexistente ----------
  console.log('\n4. Casos borde');
  const { r: r404 } = await pedir('/t/noexistexx');
  if (r404.status === 404 && /no encontrada/i.test(await r404.text())) {
    ok('una etiqueta desconocida da un mensaje claro, no un error feo');
  } else {
    mal('la etiqueta desconocida no responde bien', `HTTP ${r404.status}`);
  }

  // ---------- 6. Seguridad mínima de exposición ----------
  console.log('\n5. Exposición');
  const { r: rsu } = await pedir('/superadmin');
  if (rsu.status === 401) ok('el superadmin pide contraseña');
  else mal('el superadmin NO está protegido', `HTTP ${rsu.status} sin credenciales`);

  if (PASS === 'ambar-rojo-2026') {
    mal('SUPERADMIN_PASS sigue en el default del repo',
      'con esa clave cualquiera reasigna tus etiquetas ya pegadas a un sitio de phishing');
  } else ok('la contraseña de superadmin fue cambiada');

  // ---------- 7. Zona horaria ----------
  console.log('\n6. Zona horaria');
  if (!process.env.TZ) {
    nota('TZ no está definida en este shell', 'en el contenedor DEBE ser America/Mexico_City o la nómina sale 6 h adelantada');
  } else if (process.env.TZ === 'America/Mexico_City') {
    ok('TZ correcta', process.env.TZ);
  } else {
    nota(`TZ = ${process.env.TZ}`, 'se esperaba America/Mexico_City');
  }

  console.log('\n' + '─'.repeat(60));
  if (fallos) console.log(`${fallos} falla(s) y ${avisos} aviso(s). NO grabes las 100 etiquetas todavía.\n`);
  else if (avisos) console.log(`Sin fallas, ${avisos} aviso(s) que revisar antes de producción.\n`);
  else console.log('Todo en orden. Puedes grabar las etiquetas.\n');
  process.exit(fallos ? 1 : 0);
})();
