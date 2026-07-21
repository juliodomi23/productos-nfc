// Check mínimo end-to-end: node test.js
// Usa una base temporal para no tocar data/nfc.db.
const path = require('path');
const fs = require('fs');
const assert = require('node:assert');

const TMP = path.join(__dirname, 'data', 'test-nfc.db');
fs.mkdirSync(path.dirname(TMP), { recursive: true });
fs.rmSync(TMP, { force: true });
process.env.DB_PATH = TMP;
process.env.BASE_URL = 'http://localhost:9999';

const { db, crearTags, leerTag } = require('./db');
const { distanciaM, evaluarSitio, siguienteTipo, checar } = require('./checador');
const { generarVcf, waLink } = require('./vcard');
const app = require('./server');

const AUTH = 'Basic ' + Buffer.from('admin:ambar-rojo-2026').toString('base64');
let fallos = 0;

function prueba(nombre, fn) {
  return Promise.resolve().then(fn).then(
    () => console.log('  ok  ' + nombre),
    e => { fallos++; console.log('FALLO ' + nombre + '\n      ' + e.message); }
  );
}

(async () => {
  const server = app.listen(0);
  const base = 'http://localhost:' + server.address().port;
  const get = (r, o) => fetch(base + r, o);

  // ---------- Geocerca ----------
  await prueba('distanciaM aproxima bien distancias cortas', () => {
    // 0.001° de latitud ≈ 111 m en cualquier longitud.
    const d = distanciaM(16.75, -93.11, 16.751, -93.11);
    assert.ok(d > 105 && d < 118, 'esperaba ~111 m, dio ' + d);
  });

  await prueba('evaluarSitio devuelve null sin geocerca o sin GPS', () => {
    assert.strictEqual(evaluarSitio({}, 16.75, -93.11, 10), null);
    assert.strictEqual(evaluarSitio({ lat: 16.75, lon: -93.11 }, null, null, null), null);
  });

  await prueba('evaluarSitio acepta dentro del radio y rechaza lejos', () => {
    const cfg = { lat: 16.75, lon: -93.11, radio_m: 120 };
    assert.strictEqual(evaluarSitio(cfg, 16.7505, -93.11, 5), 1);   // ~55 m
    assert.strictEqual(evaluarSitio(cfg, 16.76, -93.11, 5), 0);     // ~1.1 km
  });

  await prueba('evaluarSitio perdona un GPS impreciso', () => {
    const cfg = { lat: 16.75, lon: -93.11, radio_m: 50 };
    // A ~111 m con radio 50 estaría fuera, pero el navegador reporta ±100 m.
    assert.strictEqual(evaluarSitio(cfg, 16.751, -93.11, 100), 1);
  });

  // ---------- vCard ----------
  await prueba('generarVcf escapa comas y usa CRLF', () => {
    const vcf = generarVcf({ nombre: 'Ana Pérez, Jr.', empresa: 'Ámbar; Rojo', telefono: '9611234567' });
    assert.ok(vcf.includes('FN:Ana Pérez\\, Jr.'), 'no escapó la coma');
    assert.ok(vcf.includes('ORG:Ámbar\\; Rojo'), 'no escapó el punto y coma');
    assert.ok(vcf.startsWith('BEGIN:VCARD\r\n') && vcf.endsWith('END:VCARD\r\n'), 'faltan CRLF');
  });

  await prueba('waLink antepone 52 solo a números de 10 dígitos', () => {
    assert.strictEqual(waLink('961 123 4567'), 'https://wa.me/529611234567');
    assert.strictEqual(waLink('529611234567'), 'https://wa.me/529611234567');
    assert.strictEqual(waLink(''), null);
  });

  // ---------- Alta vía API ----------
  let clienteId, codigos;
  await prueba('superadmin crea cliente y lote de tags', async () => {
    const r1 = await get('/superadmin/api/clientes', {
      method: 'POST', headers: { Authorization: AUTH, 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: 'taller-demo', nombre: 'Taller Demo', admin_pass: 'demo-2026' }),
    });
    assert.strictEqual(r1.status, 201);
    clienteId = (await r1.json()).id;

    const r2 = await get('/superadmin/api/tags/lote', {
      method: 'POST', headers: { Authorization: AUTH, 'Content-Type': 'application/json' },
      body: JSON.stringify({ cantidad: 4, etiqueta: 'Mesa' }),
    });
    assert.strictEqual(r2.status, 201);
    const d = await r2.json();
    assert.strictEqual(d.creados, 4);
    codigos = d.urls.map(u => u.split('/t/')[1]);
    assert.strictEqual(new Set(codigos).size, 4, 'hubo códigos duplicados');
  });

  await prueba('superadmin rechaza lote fuera de rango', async () => {
    const r = await get('/superadmin/api/tags/lote', {
      method: 'POST', headers: { Authorization: AUTH, 'Content-Type': 'application/json' },
      body: JSON.stringify({ cantidad: 99999 }),
    });
    assert.strictEqual(r.status, 400);
  });

  await prueba('sin credenciales el superadmin responde 401', async () => {
    assert.strictEqual((await get('/superadmin/api/resumen')).status, 401);
  });

  // ---------- Router de tags ----------
  await prueba('tag sin asignar responde 200 y no rompe', async () => {
    const r = await get('/t/' + codigos[0]);
    assert.strictEqual(r.status, 200);
    assert.ok((await r.text()).includes('sin asignar'));
  });

  await prueba('tag inexistente responde 404', async () => {
    assert.strictEqual((await get('/t/noexiste')).status, 404);
  });

  const asignar = (codigo, cuerpo) => get('/superadmin/api/tags/' + codigo, {
    method: 'PUT', headers: { Authorization: AUTH, 'Content-Type': 'application/json' },
    body: JSON.stringify(cuerpo),
  });

  await prueba('redirect exige destino http(s)', async () => {
    const r = await asignar(codigos[1], { cliente_id: clienteId, tipo: 'menu', destino: 'javascript:alert(1)' });
    assert.strictEqual(r.status, 400, 'aceptó un destino javascript:');
  });

  await prueba('tag de menú redirige 302 a su destino', async () => {
    const ok = await asignar(codigos[1], {
      cliente_id: clienteId, tipo: 'menu', destino: 'https://menu.ambarrojo.mx/taller-demo?mesa=3',
    });
    assert.strictEqual(ok.status, 200);
    const r = await get('/t/' + codigos[1], { redirect: 'manual' });
    assert.strictEqual(r.status, 302);
    assert.strictEqual(r.headers.get('location'), 'https://menu.ambarrojo.mx/taller-demo?mesa=3');
  });

  await prueba('se cuenta cada escaneo real y ninguno de un tag inexistente', async () => {
    // Van 2 lecturas válidas (tag sin asignar + tag de menú) y una a un código
    // inexistente, que no debe inflar la métrica que le facturamos al cliente.
    const antes = db.prepare('SELECT COUNT(*) n FROM escaneos').get().n;
    assert.strictEqual(antes, 2, 'esperaba 2 escaneos, hay ' + antes);
    await get('/t/tampocoexiste');
    assert.strictEqual(db.prepare('SELECT COUNT(*) n FROM escaneos').get().n, 2);
    await get('/t/' + codigos[1], { redirect: 'manual' });
    assert.strictEqual(db.prepare('SELECT COUNT(*) n FROM escaneos').get().n, 3);
  });

  // ---------- Checador ----------
  let empleadoId;
  await prueba('el panel del cliente crea empleados y valida el PIN', async () => {
    const auth = 'Basic ' + Buffer.from('taller-demo:demo-2026').toString('base64');
    const corto = await get('/taller-demo/api/empleados', {
      method: 'POST', headers: { Authorization: auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre: 'María', pin: '12' }),
    });
    assert.strictEqual(corto.status, 400, 'aceptó un PIN de 2 dígitos');

    const r = await get('/taller-demo/api/empleados', {
      method: 'POST', headers: { Authorization: auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre: 'María López', pin: '4821' }),
    });
    assert.strictEqual(r.status, 201);
    empleadoId = (await r.json()).id;
  });

  await prueba('la checada alterna entrada -> salida -> entrada', async () => {
    await asignar(codigos[2], {
      cliente_id: clienteId, tipo: 'checador',
      config: { sucursal: 'Centro', lat: 16.75, lon: -93.11, radio_m: 120 },
    });
    const tag = leerTag(codigos[2]);
    const cfg = { sucursal: 'Centro', lat: 16.75, lon: -93.11, radio_m: 120 };

    const a = checar({ tag, cfg, pin: '4821', lat: 16.7505, lon: -93.11, precision: 8 });
    assert.strictEqual(a.tipo, 'entrada');
    assert.strictEqual(a.en_sitio, 1);

    const b = checar({ tag, cfg, pin: '4821', lat: 16.7505, lon: -93.11, precision: 8 });
    assert.strictEqual(b.tipo, 'salida');

    assert.strictEqual(siguienteTipo(empleadoId), 'entrada');
  });

  await prueba('un olvido de salida NO invierte los días siguientes', async () => {
    const tag = leerTag(codigos[2]);
    const emp = db.prepare('INSERT INTO empleados (cliente_id, nombre, pin) VALUES (?, ?, ?)')
      .run(clienteId, 'Pedro Olvidadizo', '5555');
    const empId = Number(emp.lastInsertRowid);

    // Lunes: entra y se le olvida checar salida.
    checar({ tag, cfg: {}, pin: '5555' });
    db.prepare("UPDATE checadas SET created_at = datetime('now','localtime','-30 hours') WHERE empleado_id = ?")
      .run(empId);

    // Martes: sin la corrección, esto se grabaría como 'salida' y todos sus días
    // quedarían invertidos para siempre.
    const martes = checar({ tag, cfg: {}, pin: '5555' });
    assert.strictEqual(martes.tipo, 'entrada', 'el olvido invirtió la alternancia');

    // Y dentro del turno normal sigue alternando bien.
    assert.strictEqual(checar({ tag, cfg: {}, pin: '5555' }).tipo, 'salida');
  });

  await prueba('un turno nocturno de 8 h no se rompe', () => {
    const tag = leerTag(codigos[2]);
    db.prepare('INSERT INTO empleados (cliente_id, nombre, pin) VALUES (?, ?, ?)')
      .run(clienteId, 'Vigilante', '6666');
    const empId = db.prepare('SELECT id FROM empleados WHERE pin = ?').get('6666').id;

    // Entra a las 10 PM (hace 8 h). Aunque ya cambió el día, sigue en turno.
    checar({ tag, cfg: {}, pin: '6666' });
    db.prepare("UPDATE checadas SET created_at = datetime('now','localtime','-8 hours') WHERE empleado_id = ?")
      .run(empId);
    assert.strictEqual(siguienteTipo(empId), 'salida', 'partió un turno nocturno en dos');
  });

  await prueba('el rate-limit frena la fuerza bruta del PIN pero no a quien acierta', async () => {
    const url = '/t/' + codigos[2] + '/checar';
    const intento = pin => get(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin }),
    });

    let bloqueado = false;
    for (let i = 0; i < 25; i++) {
      if ((await intento('0000')).status === 429) { bloqueado = true; break; }
    }
    assert.ok(bloqueado, 'se pueden probar 25 PINes seguidos sin freno');

    // El límite es por IP+tag: otra etiqueta del mismo negocio sigue operando.
    await asignar(codigos[0], { cliente_id: clienteId, tipo: 'checador', config: {} });
    const otra = await get('/t/' + codigos[0] + '/checar', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: '4821' }),
    });
    assert.strictEqual(otra.status, 200, 'el bloqueo de un tag tumbó a los demás');
  });

  await prueba('no se puede asignar la vCard de otro cliente a mi etiqueta', async () => {
    const otro = await get('/superadmin/api/clientes', {
      method: 'POST', headers: { Authorization: AUTH, 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: 'otro-negocio', nombre: 'Otro Negocio', admin_pass: 'x' }),
    });
    const otroId = (await otro.json()).id;
    const ajena = db.prepare('INSERT INTO vcards (cliente_id, nombre) VALUES (?, ?)')
      .run(otroId, 'Contacto Privado Ajeno');

    const r = await asignar(codigos[1], {
      cliente_id: clienteId, tipo: 'vcard', config: { vcard_id: Number(ajena.lastInsertRowid) },
    });
    assert.strictEqual(r.status, 400, 'dejó publicar el contacto de otro cliente');
  });

  await prueba('la checada sin GPS pasa pero queda marcada como desconocida', () => {
    const tag = leerTag(codigos[2]);
    const r = checar({ tag, cfg: { lat: 16.75, lon: -93.11 }, pin: '4821' });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.en_sitio, null);
  });

  await prueba('un PIN equivocado no registra nada', () => {
    const antes = db.prepare('SELECT COUNT(*) n FROM checadas').get().n;
    const r = checar({ tag: leerTag(codigos[2]), cfg: {}, pin: '0000' });
    assert.ok(r.error);
    assert.strictEqual(db.prepare('SELECT COUNT(*) n FROM checadas').get().n, antes);
  });

  await prueba('POST /checar responde por HTTP', async () => {
    const r = await get('/t/' + codigos[2] + '/checar', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: '4821', lat: 16.75, lon: -93.11, precision: 10 }),
    });
    assert.strictEqual(r.status, 200);
    assert.strictEqual((await r.json()).empleado, 'María López');
  });

  await prueba('el CSV de nómina sale con BOM y neutraliza fórmulas', async () => {
    const auth = 'Basic ' + Buffer.from('taller-demo:demo-2026').toString('base64');
    db.prepare('INSERT INTO empleados (cliente_id, nombre, pin) VALUES (?, ?, ?)')
      .run(clienteId, '=CMD|calc', '7777');
    checar({ tag: leerTag(codigos[2]), cfg: {}, pin: '7777' });

    const r = await get('/taller-demo/api/checadas.csv?dias=1', { headers: { Authorization: auth } });
    assert.strictEqual(r.status, 200);
    assert.ok(r.headers.get('content-type').includes('text/csv'));
    // fetch().text() se come el BOM al decodificar, así que se revisan los bytes.
    const bytes = Buffer.from(await r.arrayBuffer());
    assert.deepStrictEqual([...bytes.subarray(0, 3)], [0xEF, 0xBB, 0xBF],
      'falta el BOM: Excel rompe los acentos');
    const csv = bytes.toString('utf8');
    assert.ok(csv.includes('"\'=CMD|calc"'), 'no neutralizó la fórmula');
    assert.ok(csv.includes('María López'), 'faltan los demás empleados');
  });

  // ---------- vCard end-to-end ----------
  await prueba('el tag de vCard sirve la página y el .vcf', async () => {
    const v = db.prepare(`INSERT INTO vcards (cliente_id, nombre, puesto, telefono)
                          VALUES (?, ?, ?, ?)`).run(clienteId, 'Julio Domínguez', 'CTO', '9611234567');
    await asignar(codigos[3], { cliente_id: clienteId, tipo: 'vcard', config: { vcard_id: Number(v.lastInsertRowid) } });

    const html = await get('/t/' + codigos[3]);
    assert.strictEqual(html.status, 200);
    assert.ok((await html.text()).includes('Julio Domínguez'));

    const vcf = await get('/t/' + codigos[3] + '/contacto.vcf');
    assert.strictEqual(vcf.status, 200);
    assert.ok(vcf.headers.get('content-type').includes('text/vcard'));
    assert.ok((await vcf.text()).includes('TEL;TYPE=CELL:9611234567'));
  });

  await prueba('reasignar una etiqueta ya grabada cambia su producto', async () => {
    await asignar(codigos[3], { tipo: 'menu', destino: 'https://menu.ambarrojo.mx/otro' });
    const r = await get('/t/' + codigos[3], { redirect: 'manual' });
    assert.strictEqual(r.status, 302, 'la etiqueta no cambió de producto');
  });

  server.close();
  db.close();
  fs.rmSync(TMP, { force: true });
  console.log(fallos ? `\n${fallos} prueba(s) fallaron` : '\nTodas las pruebas pasaron');
  process.exit(fallos ? 1 : 0);
})();
