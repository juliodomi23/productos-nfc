// Check end-to-end de central (router puro): node test.js
const path = require('path');
const fs = require('fs');
const assert = require('node:assert');

const TMP = path.join(__dirname, 'data', 'test-nfc.db');
fs.mkdirSync(path.dirname(TMP), { recursive: true });
fs.rmSync(TMP, { force: true });
process.env.DB_PATH = TMP;
process.env.BASE_URL = 'http://localhost:9999';

const { db } = require('./db');
const app = require('./server');

const AUTH = 'Basic ' + Buffer.from('admin:ambar-rojo-2026').toString('base64');
let fallos = 0;
function prueba(n, fn) {
  return Promise.resolve().then(fn).then(
    () => console.log('  ok  ' + n),
    e => { fallos++; console.log('FALLO ' + n + '\n      ' + e.message); });
}

(async () => {
  const server = app.listen(0);
  const base = 'http://localhost:' + server.address().port;
  const get = (r, o) => fetch(base + r, o);
  const jsonSA = b => ({ method: 'POST', headers: { Authorization: AUTH, 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
  const asignar = (cod, b) => get('/superadmin/api/tags/' + cod, { method: 'PUT', headers: { Authorization: AUTH, 'Content-Type': 'application/json' }, body: JSON.stringify(b) });

  let codigos;
  await prueba('genera un lote y da URLs sin códigos duplicados', async () => {
    const r = await get('/superadmin/api/tags/lote', jsonSA({ cantidad: 4, etiqueta: 'Mesa' }));
    assert.strictEqual(r.status, 201);
    const d = await r.json();
    assert.strictEqual(d.creados, 4);
    codigos = d.urls.map(u => u.split('/t/')[1]);
    assert.strictEqual(new Set(codigos).size, 4);
  });
  await prueba('rechaza lote fuera de rango', async () => {
    assert.strictEqual((await get('/superadmin/api/tags/lote', jsonSA({ cantidad: 99999 }))).status, 400);
  });
  await prueba('sin credenciales el superadmin da 401', async () => {
    assert.strictEqual((await get('/superadmin/api/resumen')).status, 401);
  });

  await prueba('un tag recién grabado se identifica solo (sin asignar)', async () => {
    const r = await get('/t/' + codigos[0]);
    assert.strictEqual(r.status, 200);
    const html = await r.text();
    assert.ok(html.includes('sin asignar') && html.includes(codigos[0]));
  });
  await prueba('tag inexistente da 404', async () => {
    assert.strictEqual((await get('/t/noexiste')).status, 404);
  });

  await prueba('asignar exige un destino http(s) válido', async () => {
    const r = await asignar(codigos[1], { tipo: 'checador', destino: 'javascript:alert(1)' });
    assert.strictEqual(r.status, 400);
  });

  await prueba('asigna un checador y redirige 302 a su app externa', async () => {
    const ok = await asignar(codigos[1], { tipo: 'checador', destino: 'https://checador.ambarrojostudios.cloud/taller-primo/centro' });
    assert.strictEqual(ok.status, 200);
    const r = await get('/t/' + codigos[1], { redirect: 'manual' });
    assert.strictEqual(r.status, 302);
    assert.strictEqual(r.headers.get('location'), 'https://checador.ambarrojostudios.cloud/taller-primo/centro');
  });

  await prueba('asigna una vCard y redirige a su app externa', async () => {
    await asignar(codigos[2], { tipo: 'vcard', destino: 'https://tarjeta.ambarrojostudios.cloud/julio-dominguez' });
    const r = await get('/t/' + codigos[2], { redirect: 'manual' });
    assert.strictEqual(r.status, 302);
    assert.ok(r.headers.get('location').includes('tarjeta.ambarrojostudios.cloud'));
  });

  await prueba('reasignar cambia el destino sin tocar el tag', async () => {
    await asignar(codigos[1], { tipo: 'menu', destino: 'https://menu.ambarrojostudios.cloud/taller-primo' });
    const r = await get('/t/' + codigos[1], { redirect: 'manual' });
    assert.strictEqual(r.headers.get('location'), 'https://menu.ambarrojostudios.cloud/taller-primo');
  });

  await prueba('cuenta escaneos reales y ninguno de un tag inexistente', async () => {
    const antes = db.prepare('SELECT COUNT(*) n FROM escaneos').get().n;
    await get('/t/tampocoexiste');
    assert.strictEqual(db.prepare('SELECT COUNT(*) n FROM escaneos').get().n, antes);
    await get('/t/' + codigos[3]);
    assert.strictEqual(db.prepare('SELECT COUNT(*) n FROM escaneos').get().n, antes + 1);
  });

  await prueba('crea cliente para agrupar y rechaza slug reservado', async () => {
    const r = await get('/superadmin/api/clientes', jsonSA({ slug: 'taller-primo', nombre: 'Taller El Primo' }));
    assert.strictEqual(r.status, 201);
    assert.strictEqual((await get('/superadmin/api/clientes', jsonSA({ slug: 'superadmin', nombre: 'X' }))).status, 400);
  });

  server.close(); db.close(); fs.rmSync(TMP, { force: true });
  console.log(fallos ? `\n${fallos} prueba(s) fallaron` : '\nTodas las pruebas pasaron');
  process.exit(fallos ? 1 : 0);
})();
