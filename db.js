const { DatabaseSync } = require('node:sqlite');
const crypto = require('node:crypto');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'nfc.db');
require('fs').mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA foreign_keys = ON');

// Tipos soportados. 'redirect' = el producto ya existe y vive en otro servicio.
const TIPOS = {
  resena:   { nativo: false, label: 'Máquina de reseñas' },
  menu:     { nativo: false, label: 'Menú digital' },
  lealtad:  { nativo: false, label: 'Tarjeta de lealtad' },
  checador: { nativo: true,  label: 'Reloj checador' },
  vcard:    { nativo: true,  label: 'Tarjeta de presentación' },
};

db.exec(`
  CREATE TABLE IF NOT EXISTS clientes (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    slug       TEXT NOT NULL UNIQUE,
    nombre     TEXT NOT NULL,
    admin_pass TEXT NOT NULL,
    activo     INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS tags (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo     TEXT NOT NULL UNIQUE,
    cliente_id INTEGER REFERENCES clientes(id),
    tipo       TEXT CHECK (tipo IN ('resena','menu','lealtad','checador','vcard')),
    destino    TEXT,
    config     TEXT NOT NULL DEFAULT '{}',
    etiqueta   TEXT,
    activo     INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
  CREATE INDEX IF NOT EXISTS idx_tags_cliente ON tags(cliente_id);

  CREATE TABLE IF NOT EXISTS escaneos (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    tag_id     INTEGER NOT NULL REFERENCES tags(id),
    ua         TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
  CREATE INDEX IF NOT EXISTS idx_escaneos_tag ON escaneos(tag_id, created_at);

  CREATE TABLE IF NOT EXISTS empleados (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    cliente_id INTEGER NOT NULL REFERENCES clientes(id),
    nombre     TEXT NOT NULL,
    pin        TEXT NOT NULL,
    activo     INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    UNIQUE (cliente_id, pin)
  );

  CREATE TABLE IF NOT EXISTS checadas (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    empleado_id INTEGER NOT NULL REFERENCES empleados(id),
    tag_id      INTEGER NOT NULL REFERENCES tags(id),
    tipo        TEXT NOT NULL CHECK (tipo IN ('entrada','salida')),
    lat         REAL,
    lon         REAL,
    precision_m REAL,
    en_sitio    INTEGER,
    created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
  CREATE INDEX IF NOT EXISTS idx_checadas_emp ON checadas(empleado_id, created_at);

  CREATE TABLE IF NOT EXISTS vcards (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    cliente_id INTEGER REFERENCES clientes(id),
    nombre     TEXT NOT NULL,
    puesto     TEXT,
    empresa    TEXT,
    telefono   TEXT,
    whatsapp   TEXT,
    email      TEXT,
    web        TEXT,
    foto_url   TEXT,
    color      TEXT NOT NULL DEFAULT '#B91C1C',
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
`);

// ---------- Códigos de tag ----------
// Alfabeto sin caracteres ambiguos (0/O, 1/I/l) para poder dictarlos por teléfono.
const ALFABETO = '23456789abcdefghjkmnpqrstuvwxyz';

function nuevoCodigo(largo = 7) {
  const bytes = crypto.randomBytes(largo);
  let out = '';
  for (const b of bytes) out += ALFABETO[b % ALFABETO.length];
  return out;
}

/**
 * Crea N tags en blanco (sin asignar). Es el flujo real: llegan 100 etiquetas
 * físicas, se graban con su URL, y se asignan a un cliente después.
 */
function crearTags(cantidad, etiquetaBase) {
  const insert = db.prepare('INSERT INTO tags (codigo, etiqueta) VALUES (?, ?)');
  const creados = [];
  for (let i = 0; i < cantidad; i++) {
    // Reintenta ante colisión de código en vez de asumir que nunca pasa.
    for (let intento = 0; intento < 5; intento++) {
      const codigo = nuevoCodigo();
      try {
        insert.run(codigo, etiquetaBase ? `${etiquetaBase} ${i + 1}` : null);
        creados.push(codigo);
        break;
      } catch (e) {
        if (intento === 4) throw e;
      }
    }
  }
  return creados;
}

function leerTag(codigo) {
  return db.prepare(`
    SELECT t.*, c.slug AS cliente_slug, c.nombre AS cliente_nombre
    FROM tags t LEFT JOIN clientes c ON c.id = t.cliente_id
    WHERE t.codigo = ? AND t.activo = 1
  `).get(codigo);
}

function registrarEscaneo(tagId, ua) {
  db.prepare('INSERT INTO escaneos (tag_id, ua) VALUES (?, ?)').run(tagId, (ua || '').slice(0, 200));
}

function configDe(tag) {
  try { return JSON.parse(tag.config || '{}'); } catch { return {}; }
}

module.exports = { db, TIPOS, nuevoCodigo, crearTags, leerTag, registrarEscaneo, configDe };
