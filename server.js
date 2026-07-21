const express = require('express');
const { db, TIPOS, leerTag, registrarEscaneo, configDe } = require('./db');
const { esc, layout } = require('./ui');
const { renderChecador, checar } = require('./checador');
const { renderVcard, generarVcf } = require('./vcard');
const { renderSuperadmin } = require('./superadminPage');
const { renderPanel } = require('./panelPage');
const { limitador } = require('./limite');

const PORT = process.env.PORT || 3040;
const SUPERADMIN_USER = process.env.SUPERADMIN_USER || 'admin';
const SUPERADMIN_PASS = process.env.SUPERADMIN_PASS || 'ambar-rojo-2026';

const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '32kb' }));

// ---------- Auth (mismo patrón que maquina-resenas y menu-digital) ----------
function credenciales(req) {
  return Buffer.from((req.headers.authorization || '').split(' ')[1] || '', 'base64')
    .toString().split(':');
}

function pedirAuth(res, realm) {
  res.set('WWW-Authenticate', `Basic realm="${realm}"`).status(401).send('Autenticación requerida');
}

function authSuperadmin(req, res, next) {
  const [user, pass] = credenciales(req);
  if (user === SUPERADMIN_USER && pass === SUPERADMIN_PASS) return next();
  pedirAuth(res, 'Superadmin');
}

function authCliente(req, res, next) {
  const [user, pass] = credenciales(req);
  const cliente = db.prepare('SELECT * FROM clientes WHERE slug = ? AND activo = 1').get(req.params.slug);
  if (cliente && user === cliente.slug && pass === cliente.admin_pass) {
    req.cliente = cliente;
    return next();
  }
  pedirAuth(res, 'Panel ' + req.params.slug);
}

// ---------- Utilidades ----------
// Un tag apunta a una URL que nosotros grabamos, pero se edita desde el panel:
// sin esta validación, un destino "javascript:" convierte el tag en un XSS físico.
function destinoValido(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch { return false; }
}

// La vCard se busca SIEMPRE atada al cliente dueño del tag. Sin este filtro, un
// vcard_id mal puesto en la config publica los datos de contacto de un cliente en
// la etiqueta de otro — y para cuando se note, el tag ya está pegado en la pared.
function vcardDeTag(tag, cfg) {
  if (!cfg.vcard_id || !tag.cliente_id) return null;
  return db.prepare('SELECT * FROM vcards WHERE id = ? AND cliente_id = ?')
    .get(cfg.vcard_id, tag.cliente_id);
}

function paginaSimple(titulo, mensaje, extra = '') {
  return layout({
    titulo,
    body: `<div class="card"><h1>${esc(titulo)}</h1><p class="muted">${esc(mensaje)}</p>${extra}</div>`,
  });
}

// ---------- Router universal de tags ----------
// Todo tag físico apunta a https://nfc.ambarrojostudios.cloud/t/<codigo>.
// El destino se decide aquí, en el servidor: así una etiqueta ya pegada en una
// mesa se puede reasignar a otro producto sin volver a grabarla.
app.get('/t/:codigo', (req, res) => {
  const tag = leerTag(req.params.codigo);
  if (!tag) return res.status(404).send(paginaSimple('Etiqueta no encontrada', 'Esta etiqueta no está registrada o fue desactivada.'));

  registrarEscaneo(tag.id, req.get('user-agent'));
  const cfg = configDe(tag);

  if (!tag.tipo) {
    return res.send(paginaSimple(
      'Etiqueta sin asignar',
      'Esta etiqueta ya funciona, falta configurarla desde el panel.',
      `<p style="margin-top:12px">Código: <code>${esc(tag.codigo)}</code></p>`
    ));
  }

  // Productos que ya existen en otro servicio: solo redirigimos.
  if (!TIPOS[tag.tipo].nativo) {
    if (!destinoValido(tag.destino)) {
      return res.status(500).send(paginaSimple('Destino no configurado', 'Avisa al negocio: esta etiqueta no tiene un destino válido.'));
    }
    return res.redirect(302, tag.destino);
  }

  if (tag.tipo === 'checador') return res.send(renderChecador(tag, cfg));

  if (tag.tipo === 'vcard') {
    const v = vcardDeTag(tag, cfg);
    if (!v) return res.status(404).send(paginaSimple('Tarjeta no encontrada', 'Esta etiqueta no tiene una tarjeta asociada.'));
    return res.send(renderVcard(v, tag.codigo));
  }

  res.status(500).send(paginaSimple('Tipo desconocido', 'Reporta este código a soporte.'));
});

app.get('/t/:codigo/contacto.vcf', (req, res) => {
  const tag = leerTag(req.params.codigo);
  if (!tag || tag.tipo !== 'vcard') return res.status(404).send('No encontrado');
  const v = vcardDeTag(tag, configDe(tag));
  if (!v) return res.status(404).send('No encontrado');
  res.type('text/vcard; charset=utf-8')
     .set('Content-Disposition', 'attachment; filename="contacto.vcf"')
     .send(generarVcf(v));
});

// El PIN son 4 dígitos: sin límite, 10.000 intentos se prueban en segundos y
// cualquiera checa por cualquier empleado. 20 intentos fallidos por IP y tag en
// 15 min dejan pasar a la gente que se equivoca y frenan al script.
const limiteChecadas = limitador({ max: 20, ventanaMs: 15 * 60 * 1000 });

app.post('/t/:codigo/checar', (req, res) => {
  const tag = leerTag(req.params.codigo);
  if (!tag || tag.tipo !== 'checador') return res.status(404).json({ error: 'Etiqueta no válida' });

  const { pin, lat, lon, precision } = req.body || {};
  const r = checar({ tag, cfg: configDe(tag), pin, lat, lon, precision });

  if (r.error) {
    // Solo los fallos consumen cuota: un turno entero de checadas correctas nunca
    // debe bloquear la puerta.
    if (limiteChecadas(`${req.ip}|${tag.codigo}`)) {
      return res.status(429).json({ error: 'Demasiados intentos. Espera 15 minutos.' });
    }
    return res.status(400).json(r);
  }
  res.json(r);
});

// ---------- Superadmin (Ámbar Rojo) ----------
app.use('/superadmin', authSuperadmin);
require('./superadminApi')(app);
app.get('/superadmin', (req, res) => res.send(renderSuperadmin()));

// ---------- Panel del cliente ----------
app.get('/:slug/panel', authCliente, (req, res) => res.send(renderPanel(req.cliente)));
require('./panelApi')(app, authCliente);

app.get('/salud', (req, res) => res.json({ ok: true, tags: db.prepare('SELECT COUNT(*) n FROM tags').get().n }));
app.get('/', (req, res) => res.redirect('/superadmin'));

// Claves inseguras: vacía, o las que quedaron escritas en el repo/compose. Si el
// contenedor arranca con una de estas, cualquiera reasignaría tus etiquetas ya
// pegadas a un sitio de phishing. Mejor que NO arranque y EasyPanel marque el error.
const CLAVES_INSEGURAS = ['', 'ambar-rojo-2026', 'cambia-esta-contrasena'];

if (require.main === module) {
  if (CLAVES_INSEGURAS.includes(SUPERADMIN_PASS)) {
    console.error('✗ SUPERADMIN_PASS vacía o con un valor por defecto inseguro.');
    console.error('  Defínela en la pestaña Environment de EasyPanel antes de desplegar.');
    process.exit(1);
  }
  if (!process.env.TZ) {
    // No aborta: la TZ tiene default en el compose, pero avisar si llegó vacía.
    console.warn('⚠️  TZ sin definir: las fechas se guardarán en UTC (6 h adelante de Tuxtla).');
  }
  app.listen(PORT, () => {
    const ahora = new Date().toLocaleString('es-MX');
    console.log(`productos-nfc escuchando en http://localhost:${PORT}`);
    console.log(`Hora local del servidor: ${ahora} (TZ=${process.env.TZ || 'sin definir'})`);
  });
}

module.exports = app;
