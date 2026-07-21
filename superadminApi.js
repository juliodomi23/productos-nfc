const { db, TIPOS, crearTags } = require('./db');

// Este dominio queda GRABADO en cada etiqueta física. Cambiarlo después de grabar
// un lote deja esos tags apuntando al dominio viejo, sin arreglo posible.
const BASE_URL = (process.env.BASE_URL || 'https://nfc.ambarrojostudios.cloud').replace(/\/$/, '');

const SLUGS_RESERVADOS = ['superadmin', 't', 'salud', 'api'];
const limpiarSlug = v => String(v || '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '');

function listarTags(filtro = {}) {
  const where = [], params = [];
  if (filtro.cliente_id) { where.push('t.cliente_id = ?'); params.push(filtro.cliente_id); }
  if (filtro.sin_asignar) where.push('t.tipo IS NULL');
  return db.prepare(`
    SELECT t.codigo, t.tipo, t.destino, t.etiqueta, t.activo,
      c.slug AS cliente_slug, c.nombre AS cliente_nombre,
      (SELECT COUNT(*) FROM escaneos e WHERE e.tag_id = t.id) AS escaneos
    FROM tags t LEFT JOIN clientes c ON c.id = t.cliente_id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY t.id DESC
  `).all(...params).map(t => ({ ...t, url: `${BASE_URL}/t/${t.codigo}` }));
}

// destinoValido se inyecta desde server.js (misma validación http(s) que el router).
module.exports = function registrarSuperadminApi(app, destinoValido) {
  // --- Clientes (solo para agrupar etiquetas; central no tiene login de cliente) ---
  app.get('/superadmin/api/clientes', (req, res) => {
    res.json(db.prepare(`
      SELECT c.id, c.slug, c.nombre, c.activo,
        (SELECT COUNT(*) FROM tags t WHERE t.cliente_id = c.id) AS tags
      FROM clientes c ORDER BY c.created_at DESC
    `).all());
  });

  app.post('/superadmin/api/clientes', (req, res) => {
    const s = limpiarSlug(req.body?.slug);
    const nombre = String(req.body?.nombre || '').trim();
    if (!s || !nombre) return res.status(400).json({ error: 'slug y nombre son requeridos' });
    if (SLUGS_RESERVADOS.includes(s)) return res.status(400).json({ error: `"${s}" es un slug reservado` });
    try {
      const r = db.prepare('INSERT INTO clientes (slug, nombre) VALUES (?, ?)').run(s, nombre);
      res.status(201).json({ id: Number(r.lastInsertRowid), slug: s });
    } catch { res.status(409).json({ error: 'Ese slug ya existe' }); }
  });

  // --- Tags ---
  app.get('/superadmin/api/tags', (req, res) => {
    res.json(listarTags({
      cliente_id: req.query.cliente_id ? Number(req.query.cliente_id) : null,
      sin_asignar: req.query.sin_asignar === '1',
    }));
  });

  // Genera el lote que se graba en las etiquetas. Tope de 500: es un INSERT
  // síncrono y un dedazo con 5 ceros congelaría el servidor.
  app.post('/superadmin/api/tags/lote', (req, res) => {
    const cantidad = Number(req.body?.cantidad);
    if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > 500) {
      return res.status(400).json({ error: 'cantidad debe ser un entero entre 1 y 500' });
    }
    const codigos = crearTags(cantidad, req.body?.etiqueta);
    res.status(201).json({ creados: codigos.length, urls: codigos.map(c => `${BASE_URL}/t/${c}`) });
  });

  // Asigna (o reasigna) una etiqueta a un producto: tipo (etiqueta) + destino (URL
  // del producto). Reasignar no requiere tocar el tag físico — esa es la razón de
  // ser de central.
  app.put('/superadmin/api/tags/:codigo', (req, res) => {
    const tag = db.prepare('SELECT * FROM tags WHERE codigo = ?').get(req.params.codigo);
    if (!tag) return res.status(404).json({ error: 'Etiqueta no encontrada' });

    const { cliente_id, tipo, destino, etiqueta, activo } = req.body || {};
    if (tipo != null && !TIPOS[tipo]) return res.status(400).json({ error: 'tipo inválido' });
    if (cliente_id != null && !db.prepare('SELECT 1 FROM clientes WHERE id = ?').get(cliente_id)) {
      return res.status(400).json({ error: 'cliente_id no existe' });
    }
    // Toda asignación necesita un destino http(s): la etiqueta redirige ahí.
    if (tipo != null) {
      const dest = destino ?? tag.destino;
      if (!destinoValido(dest)) return res.status(400).json({ error: 'destino debe ser una URL http(s) válida' });
    }

    db.prepare('UPDATE tags SET cliente_id = ?, tipo = ?, destino = ?, etiqueta = ?, activo = ? WHERE id = ?')
      .run(
        cliente_id ?? tag.cliente_id,
        tipo ?? tag.tipo,
        destino ?? tag.destino,
        etiqueta ?? tag.etiqueta,
        activo == null ? tag.activo : (activo ? 1 : 0),
        tag.id
      );
    res.json({ ok: true, ...db.prepare('SELECT codigo, tipo, destino, etiqueta FROM tags WHERE id = ?').get(tag.id) });
  });

  app.get('/superadmin/api/resumen', (req, res) => {
    res.json({
      clientes: db.prepare('SELECT COUNT(*) n FROM clientes').get().n,
      tags: db.prepare('SELECT COUNT(*) n FROM tags').get().n,
      sin_asignar: db.prepare('SELECT COUNT(*) n FROM tags WHERE tipo IS NULL').get().n,
      escaneos: db.prepare('SELECT COUNT(*) n FROM escaneos').get().n,
    });
  });
};

module.exports.listarTags = listarTags;
module.exports.BASE_URL = BASE_URL;
