const { db, TIPOS, crearTags, configDe } = require('./db');


// Este dominio queda GRABADO en cada etiqueta física. Cambiarlo después de grabar
// un lote deja esos tags apuntando al dominio viejo, sin arreglo posible.
const BASE_URL = (process.env.BASE_URL || 'https://nfc.ambarrojostudios.cloud').replace(/\/$/, '');

const SLUGS_RESERVADOS = ['superadmin', 'panel', 't', 'salud', 'api'];

function limpiarSlug(v) {
  return String(v || '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
}

function listarTags(filtro = {}) {
  const where = [];
  const params = [];
  if (filtro.cliente_id) { where.push('t.cliente_id = ?'); params.push(filtro.cliente_id); }
  if (filtro.sin_asignar) where.push('t.tipo IS NULL');
  return db.prepare(`
    SELECT t.*, c.slug AS cliente_slug, c.nombre AS cliente_nombre,
      (SELECT COUNT(*) FROM escaneos e WHERE e.tag_id = t.id) AS escaneos
    FROM tags t LEFT JOIN clientes c ON c.id = t.cliente_id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY t.id DESC
  `).all(...params).map(t => ({ ...t, url: `${BASE_URL}/t/${t.codigo}` }));
}

module.exports = function registrarSuperadminApi(app) {
  // --- Clientes ---
  app.get('/superadmin/api/clientes', (req, res) => {
    res.json(db.prepare(`
      SELECT c.id, c.slug, c.nombre, c.activo, c.created_at,
        (SELECT COUNT(*) FROM tags t WHERE t.cliente_id = c.id) AS tags
      FROM clientes c ORDER BY c.created_at DESC
    `).all());
  });

  app.post('/superadmin/api/clientes', (req, res) => {
    const { slug, nombre, admin_pass } = req.body || {};
    const s = limpiarSlug(slug);
    if (!s || !nombre || !admin_pass) return res.status(400).json({ error: 'slug, nombre y admin_pass son requeridos' });
    if (SLUGS_RESERVADOS.includes(s)) return res.status(400).json({ error: `"${s}" es un slug reservado` });
    try {
      const r = db.prepare('INSERT INTO clientes (slug, nombre, admin_pass) VALUES (?, ?, ?)').run(s, nombre, admin_pass);
      res.status(201).json({ id: Number(r.lastInsertRowid), slug: s });
    } catch {
      res.status(409).json({ error: 'Ese slug ya existe' });
    }
  });

  // --- Tags ---
  app.get('/superadmin/api/tags', (req, res) => {
    res.json(listarTags({
      cliente_id: req.query.cliente_id ? Number(req.query.cliente_id) : null,
      sin_asignar: req.query.sin_asignar === '1',
    }));
  });

  // Genera el lote que se graba en las etiquetas físicas. Tope de 500 por
  // llamada: es un INSERT síncrono y un dedazo con 5 ceros congela el servidor.
  app.post('/superadmin/api/tags/lote', (req, res) => {
    const cantidad = Number(req.body?.cantidad);
    if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > 500) {
      return res.status(400).json({ error: 'cantidad debe ser un entero entre 1 y 500' });
    }
    const codigos = crearTags(cantidad, req.body?.etiqueta);
    res.status(201).json({ creados: codigos.length, urls: codigos.map(c => `${BASE_URL}/t/${c}`) });
  });

  // Asigna (o reasigna) una etiqueta ya grabada a un producto. Este endpoint es
  // la razón de ser del servicio: reasignar no requiere tocar el tag físico.
  app.put('/superadmin/api/tags/:codigo', (req, res) => {
    const tag = db.prepare('SELECT * FROM tags WHERE codigo = ?').get(req.params.codigo);
    if (!tag) return res.status(404).json({ error: 'Etiqueta no encontrada' });

    const { cliente_id, tipo, destino, config, etiqueta, activo } = req.body || {};
    if (tipo != null && !TIPOS[tipo]) return res.status(400).json({ error: 'tipo inválido' });
    if (cliente_id != null && !db.prepare('SELECT 1 FROM clientes WHERE id = ?').get(cliente_id)) {
      return res.status(400).json({ error: 'cliente_id no existe' });
    }
    // El dueño final del tag: el que venga en el body, o el que ya tenía.
    const duenoFinal = cliente_id ?? tag.cliente_id;

    if ((tipo ?? tag.tipo) === 'vcard') {
      const vcardId = config?.vcard_id ?? configDe(tag).vcard_id;
      if (!vcardId) return res.status(400).json({ error: 'Una etiqueta vcard requiere config.vcard_id' });
      const dueno = db.prepare('SELECT cliente_id FROM vcards WHERE id = ?').get(vcardId);
      if (!dueno) return res.status(400).json({ error: `No existe la vCard ${vcardId}` });
      if (dueno.cliente_id !== duenoFinal) {
        return res.status(400).json({ error: `La vCard ${vcardId} es de otro cliente` });
      }
    }

    if (tipo && !TIPOS[tipo].nativo) {
      try {
        const u = new URL(destino);
        if (!['http:', 'https:'].includes(u.protocol)) throw new Error();
      } catch {
        return res.status(400).json({ error: `El tipo "${tipo}" requiere un destino http(s) válido` });
      }
    }

    db.prepare(`
      UPDATE tags SET cliente_id = ?, tipo = ?, destino = ?, config = ?, etiqueta = ?, activo = ?
      WHERE id = ?
    `).run(
      cliente_id ?? tag.cliente_id,
      tipo ?? tag.tipo,
      destino ?? tag.destino,
      config ? JSON.stringify(config) : tag.config,
      etiqueta ?? tag.etiqueta,
      activo == null ? tag.activo : (activo ? 1 : 0),
      tag.id
    );
    res.json({ ok: true, ...db.prepare('SELECT * FROM tags WHERE id = ?').get(tag.id) });
  });

  app.get('/superadmin/api/resumen', (req, res) => {
    res.json({
      clientes: db.prepare('SELECT COUNT(*) n FROM clientes').get().n,
      tags: db.prepare('SELECT COUNT(*) n FROM tags').get().n,
      sin_asignar: db.prepare('SELECT COUNT(*) n FROM tags WHERE tipo IS NULL').get().n,
      escaneos: db.prepare('SELECT COUNT(*) n FROM escaneos').get().n,
      por_tipo: db.prepare('SELECT tipo, COUNT(*) n FROM tags WHERE tipo IS NOT NULL GROUP BY tipo').all(),
    });
  });
};

module.exports.listarTags = listarTags;
module.exports.BASE_URL = BASE_URL;
