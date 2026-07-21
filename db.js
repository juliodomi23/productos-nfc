const { DatabaseSync } = require('node:sqlite');
const crypto = require('node:crypto');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'nfc.db');
require('fs').mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA foreign_keys = ON');

// central es un ROUTER puro: cada etiqueta redirige a la URL de un producto que
// vive en su propio servicio. Aquí solo se listan los tipos como etiqueta y una
// pista del dominio para ayudar a armar el destino en el panel.
const TIPOS = {
  resena:   { label: 'Máquina de reseñas',       dominio: 'https://resenas.ambarrojostudios.cloud' },
  menu:     { label: 'Menú digital',             dominio: 'https://menu.ambarrojostudios.cloud' },
  lealtad:  { label: 'Tarjeta de lealtad',       dominio: 'https://lealtad.ambarrojostudios.cloud' },
  checador: { label: 'Reloj checador',           dominio: 'https://checador.ambarrojostudios.cloud' },
  vcard:    { label: 'Tarjeta de presentación',  dominio: 'https://tarjeta.ambarrojostudios.cloud' },
};

db.exec(`
  CREATE TABLE IF NOT EXISTS clientes (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    slug       TEXT NOT NULL UNIQUE,
    nombre     TEXT NOT NULL,
    activo     INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS tags (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo     TEXT NOT NULL UNIQUE,
    cliente_id INTEGER REFERENCES clientes(id),
    tipo       TEXT CHECK (tipo IN ('resena','menu','lealtad','checador','vcard')),
    destino    TEXT,
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
`);

// Alfabeto sin caracteres ambiguos (0/O, 1/I/l) para poder dictarlos por teléfono.
const ALFABETO = '23456789abcdefghjkmnpqrstuvwxyz';

function nuevoCodigo(largo = 7) {
  const bytes = crypto.randomBytes(largo);
  let out = '';
  for (const b of bytes) out += ALFABETO[b % ALFABETO.length];
  return out;
}

/**
 * Crea N tags en blanco (sin asignar): llegan 100 etiquetas, se graban con su URL
 * y se asignan a un producto después. Reintenta ante colisión de código.
 */
function crearTags(cantidad, etiquetaBase) {
  const insert = db.prepare('INSERT INTO tags (codigo, etiqueta) VALUES (?, ?)');
  const creados = [];
  for (let i = 0; i < cantidad; i++) {
    for (let intento = 0; intento < 5; intento++) {
      const codigo = nuevoCodigo();
      try {
        insert.run(codigo, etiquetaBase ? `${etiquetaBase} ${i + 1}` : null);
        creados.push(codigo);
        break;
      } catch (e) { if (intento === 4) throw e; }
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

module.exports = { db, TIPOS, nuevoCodigo, crearTags, leerTag, registrarEscaneo };
