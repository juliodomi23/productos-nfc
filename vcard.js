const { esc, layout, svg } = require('./ui');

// Escape del formato vCard (RFC 6350): coma, punto y coma y backslash son
// separadores de campo, así que un apellido "Pérez, Jr." rompe el archivo si no.
function escVcf(v) {
  return String(v ?? '').replace(/([\\,;])/g, '\\$1').replace(/\n/g, '\\n');
}

/** Genera el archivo .vcf que el celular abre como "guardar contacto". */
function generarVcf(p) {
  const partes = String(p.nombre || '').trim().split(/\s+/);
  const nombre = partes[0] || '';
  const apellido = partes.slice(1).join(' ');
  const lineas = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `N:${escVcf(apellido)};${escVcf(nombre)};;;`,
    `FN:${escVcf(p.nombre)}`,
  ];
  if (p.empresa)  lineas.push(`ORG:${escVcf(p.empresa)}`);
  if (p.puesto)   lineas.push(`TITLE:${escVcf(p.puesto)}`);
  if (p.telefono) lineas.push(`TEL;TYPE=CELL:${escVcf(p.telefono)}`);
  if (p.email)    lineas.push(`EMAIL;TYPE=WORK:${escVcf(p.email)}`);
  if (p.web)      lineas.push(`URL:${escVcf(p.web)}`);
  lineas.push('END:VCARD');
  // CRLF obligatorio: iOS ignora archivos con saltos de línea Unix.
  return lineas.join('\r\n') + '\r\n';
}

function waLink(numero) {
  const limpio = String(numero || '').replace(/\D/g, '');
  if (!limpio) return null;
  // 10 dígitos = número mexicano sin lada país; se le antepone 52.
  return 'https://wa.me/' + (limpio.length === 10 ? '52' + limpio : limpio);
}

function renderVcard(v, codigo) {
  const wa = waLink(v.whatsapp || v.telefono);
  const inicial = String(v.nombre || '?').trim().charAt(0).toUpperCase();
  const fallback = `<div class="ini">${esc(inicial)}</div>`;
  // Si la foto no carga, el ícono roto del navegador sería lo PRIMERO que ve
  // quien acaba de acercar el celular. Se cae al avatar de inicial en su lugar.
  const avatar = v.foto_url
    ? `<img src="${esc(v.foto_url)}" alt="" width="96" height="96"
           onerror="this.outerHTML='${fallback.replace(/'/g, "\\'")}'"
           style="width:96px;height:96px;border-radius:50%;object-fit:cover">`
    : fallback;

  const enlaces = [
    v.telefono && `<a href="tel:${esc(v.telefono)}">${svg('telefono')}<span>Llamar</span></a>`,
    wa && `<a href="${esc(wa)}" target="_blank" rel="noopener">${svg('whatsapp')}<span>WhatsApp</span></a>`,
    v.email && `<a href="mailto:${esc(v.email)}">${svg('correo')}<span>${esc(v.email)}</span></a>`,
    v.web && `<a href="${esc(v.web)}" target="_blank" rel="noopener">${svg('web')}<span>Sitio web</span></a>`,
  ].filter(Boolean).join('');

  const body = `
    <div class="card" style="text-align:center">
      <div style="display:flex;justify-content:center;margin-bottom:14px">${avatar}</div>
      <h1>${esc(v.nombre)}</h1>
      ${v.puesto ? `<p class="muted" style="margin:0">${esc(v.puesto)}</p>` : ''}
      ${v.empresa ? `<p style="margin:2px 0 0;font-weight:600">${esc(v.empresa)}</p>` : ''}
      <div style="margin-top:20px;display:grid;gap:10px">${enlaces}</div>
      <a class="btn" href="/t/${esc(codigo)}/contacto.vcf">${svg('descargar')}<span>Guardar contacto</span></a>
    </div>
    <style>
      .card a{display:flex;align-items:center;gap:10px;padding:15px;border:1px solid #E2E8F0;
        border-radius:12px;text-decoration:none;color:#0F172A;font-weight:600;min-height:52px}
      .card a svg{flex:none;color:var(--acento)}
      .card a span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .card a.btn{background:var(--acento);color:#fff;border:0;margin-top:18px;justify-content:center}
      .card a.btn svg{color:#fff}
      .ini{width:96px;height:96px;border-radius:50%;background:var(--acento);color:#fff;
        display:flex;align-items:center;justify-content:center;font-size:2.5rem;font-weight:700}
    </style>`;

  return layout({ titulo: v.nombre, acento: v.color || '#B91C1C', body });
}

module.exports = { renderVcard, generarVcf, waLink, escVcf };
