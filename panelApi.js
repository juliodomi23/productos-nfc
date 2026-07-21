const { db } = require('./db');

module.exports = function registrarPanelApi(app, authCliente) {
  // --- Empleados (checador) ---
  app.get('/:slug/api/empleados', authCliente, (req, res) => {
    res.json(db.prepare(`
      SELECT e.id, e.nombre, e.pin, e.activo,
        (SELECT tipo FROM checadas c WHERE c.empleado_id = e.id ORDER BY c.id DESC LIMIT 1) AS ultimo,
        (SELECT created_at FROM checadas c WHERE c.empleado_id = e.id ORDER BY c.id DESC LIMIT 1) AS ultimo_at
      FROM empleados e WHERE e.cliente_id = ? ORDER BY e.nombre
    `).all(req.cliente.id));
  });

  app.post('/:slug/api/empleados', authCliente, (req, res) => {
    const nombre = String(req.body?.nombre || '').trim();
    const pin = String(req.body?.pin || '').trim();
    // El PIN es la única credencial del empleado: 4 dígitos mínimo, o cualquiera
    // adivina el de su compañero y le cierra el turno.
    if (!nombre) return res.status(400).json({ error: 'nombre requerido' });
    if (!/^\d{4,8}$/.test(pin)) return res.status(400).json({ error: 'el PIN debe tener entre 4 y 8 dígitos' });
    try {
      const r = db.prepare('INSERT INTO empleados (cliente_id, nombre, pin) VALUES (?, ?, ?)')
        .run(req.cliente.id, nombre, pin);
      res.status(201).json({ id: Number(r.lastInsertRowid) });
    } catch {
      res.status(409).json({ error: 'Ese PIN ya está en uso en tu empresa' });
    }
  });

  app.delete('/:slug/api/empleados/:id', authCliente, (req, res) => {
    // Baja lógica: borrarlo dejaría checadas huérfanas y rompería el histórico.
    const r = db.prepare('UPDATE empleados SET activo = 0 WHERE id = ? AND cliente_id = ?')
      .run(req.params.id, req.cliente.id);
    res.json({ ok: r.changes > 0 });
  });

  // --- Reporte de checadas ---
  app.get('/:slug/api/checadas', authCliente, (req, res) => {
    const dias = Math.min(Math.max(Number(req.query.dias) || 7, 1), 90);
    res.json(db.prepare(`
      SELECT c.id, c.tipo, c.created_at, c.en_sitio, e.nombre AS empleado, t.etiqueta AS punto
      FROM checadas c
      JOIN empleados e ON e.id = c.empleado_id
      JOIN tags t ON t.id = c.tag_id
      WHERE e.cliente_id = ? AND c.created_at >= datetime('now','localtime', ?)
      ORDER BY c.id DESC LIMIT 500
    `).all(req.cliente.id, `-${dias} days`));
  });

  // Export para nómina. Excel en español abre el CSV con separador ';' y el BOM
  // evita que los acentos salgan como "MarÃ­a".
  app.get('/:slug/api/checadas.csv', authCliente, (req, res) => {
    const dias = Math.min(Math.max(Number(req.query.dias) || 30, 1), 90);
    const filas = db.prepare(`
      SELECT e.nombre AS empleado, c.tipo, c.created_at, t.etiqueta AS punto, c.en_sitio
      FROM checadas c
      JOIN empleados e ON e.id = c.empleado_id
      JOIN tags t ON t.id = c.tag_id
      WHERE e.cliente_id = ? AND c.created_at >= datetime('now','localtime', ?)
      ORDER BY e.nombre, c.id
    `).all(req.cliente.id, `-${dias} days`);

    // Un nombre que empiece con '=' o '+' se ejecuta como fórmula al abrir el
    // archivo. Se prefija con comilla simple.
    const celda = v => {
      const s = String(v ?? '');
      const seguro = /^[=+\-@]/.test(s) ? "'" + s : s;
      return `"${seguro.replace(/"/g, '""')}"`;
    };

    const sitio = v => (v === 1 ? 'en sitio' : v === 0 ? 'fuera del area' : 'sin ubicacion');
    const csv = ['Empleado;Tipo;Fecha;Punto;Ubicacion']
      .concat(filas.map(f => [f.empleado, f.tipo, f.created_at, f.punto || '', sitio(f.en_sitio)]
        .map(celda).join(';')))
      .join('\r\n');

    res.type('text/csv; charset=utf-8')
       .set('Content-Disposition', `attachment; filename="asistencia-${req.cliente.slug}.csv"`)
       .send('﻿' + csv);
  });

  // --- vCards ---
  app.get('/:slug/api/vcards', authCliente, (req, res) => {
    res.json(db.prepare(`
      SELECT v.*, (SELECT codigo FROM tags t WHERE t.cliente_id = v.cliente_id
                   AND t.tipo = 'vcard' AND json_extract(t.config,'$.vcard_id') = v.id LIMIT 1) AS codigo
      FROM vcards v WHERE v.cliente_id = ? ORDER BY v.nombre
    `).all(req.cliente.id));
  });

  app.post('/:slug/api/vcards', authCliente, (req, res) => {
    const { nombre, puesto, empresa, telefono, whatsapp, email, web, foto_url, color } = req.body || {};
    if (!String(nombre || '').trim()) return res.status(400).json({ error: 'nombre requerido' });
    const r = db.prepare(`
      INSERT INTO vcards (cliente_id, nombre, puesto, empresa, telefono, whatsapp, email, web, foto_url, color)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(req.cliente.id, nombre, puesto || null, empresa || null, telefono || null,
           whatsapp || null, email || null, web || null, foto_url || null, color || '#B91C1C');
    res.status(201).json({ id: Number(r.lastInsertRowid) });
  });

  // --- Etiquetas del cliente ---
  app.get('/:slug/api/tags', authCliente, (req, res) => {
    res.json(db.prepare(`
      SELECT t.codigo, t.tipo, t.etiqueta, t.activo,
        (SELECT COUNT(*) FROM escaneos e WHERE e.tag_id = t.id) AS escaneos
      FROM tags t WHERE t.cliente_id = ? ORDER BY t.id DESC
    `).all(req.cliente.id));
  });
};
