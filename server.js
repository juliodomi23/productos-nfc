const express = require('express');
const { db, leerTag, registrarEscaneo } = require('./db');
const { esc, layout } = require('./ui');
const { renderSuperadmin } = require('./superadminPage');

const PORT = process.env.PORT || 3040;
const SUPERADMIN_USER = process.env.SUPERADMIN_USER || 'admin';
const SUPERADMIN_PASS = process.env.SUPERADMIN_PASS || 'ambar-rojo-2026';

const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '32kb' }));

// ---------- Auth ----------
function credenciales(req) {
  return Buffer.from((req.headers.authorization || '').split(' ')[1] || '', 'base64')
    .toString().split(':');
}
function authSuperadmin(req, res, next) {
  const [u, p] = credenciales(req);
  if (u === SUPERADMIN_USER && p === SUPERADMIN_PASS) return next();
  res.set('WWW-Authenticate', 'Basic realm="Superadmin"').status(401).send('Autenticación requerida');
}

// El destino se edita desde el panel: sin validar protocolo, un "javascript:" en
// el destino convertiría la etiqueta en un XSS físico.
function destinoValido(url) {
  try { const u = new URL(url); return u.protocol === 'https:' || u.protocol === 'http:'; }
  catch { return false; }
}
function paginaSimple(titulo, mensaje, extra = '') {
  return layout({ titulo, body: `<div class="card"><h1>${esc(titulo)}</h1><p class="muted">${esc(mensaje)}</p>${extra}</div>` });
}

// ---------- Router universal ----------
// Toda etiqueta apunta a https://nfc.ambarrojostudios.cloud/t/<codigo>. central
// registra el escaneo y redirige al producto asignado. Reasignar no requiere
// volver a grabar la etiqueta física.
app.get('/t/:codigo', (req, res) => {
  const tag = leerTag(req.params.codigo);
  if (!tag) return res.status(404).send(paginaSimple('Etiqueta no encontrada', 'Esta etiqueta no está registrada o fue desactivada.'));

  registrarEscaneo(tag.id, req.get('user-agent'));

  if (!tag.tipo || !tag.destino) {
    return res.send(paginaSimple(
      'Etiqueta sin asignar',
      'Esta etiqueta ya funciona, falta asignarle un producto desde el panel.',
      `<p style="margin-top:12px">Código: <code>${esc(tag.codigo)}</code></p>`
    ));
  }
  if (!destinoValido(tag.destino)) {
    return res.status(500).send(paginaSimple('Destino no configurado', 'Avisa a Ámbar Rojo: esta etiqueta no tiene un destino válido.'));
  }
  res.redirect(302, tag.destino);
});

// ---------- Superadmin ----------
app.use('/superadmin', authSuperadmin);
require('./superadminApi')(app, destinoValido);
app.get('/superadmin', (req, res) => res.send(renderSuperadmin()));

app.get('/salud', (req, res) => res.json({ ok: true, tags: db.prepare('SELECT COUNT(*) n FROM tags').get().n }));
app.get('/', (req, res) => res.redirect('/superadmin'));

const CLAVES_INSEGURAS = ['', 'ambar-rojo-2026', 'cambia-esta-contrasena'];
if (require.main === module) {
  if (CLAVES_INSEGURAS.includes(SUPERADMIN_PASS)) {
    console.error('✗ SUPERADMIN_PASS vacía o con un valor por defecto inseguro. Defínela en EasyPanel.');
    process.exit(1);
  }
  if (!process.env.TZ) console.warn('⚠️  TZ sin definir: las fechas se guardarán en UTC (6 h adelante de Tuxtla).');
  app.listen(PORT, () => {
    console.log(`central (router NFC) escuchando en http://localhost:${PORT}`);
    console.log(`Hora local: ${new Date().toLocaleString('es-MX')} (TZ=${process.env.TZ || 'sin definir'})`);
  });
}

module.exports = app;
