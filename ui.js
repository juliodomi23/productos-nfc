// Helpers de HTML compartidos por todas las páginas. Sin motor de plantillas:
// son funciones que devuelven strings, igual que en maquina-resenas y menu-digital.

function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const CSS = `
  *,*::before,*::after{box-sizing:border-box}
  body{margin:0;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
       background:#F8FAFC;color:#0F172A;line-height:1.5}
  .wrap{max-width:640px;margin:0 auto;padding:24px 20px 48px}
  .card{background:#fff;border:1px solid #E2E8F0;border-radius:16px;padding:20px;margin-bottom:16px}
  h1{font-size:1.5rem;margin:0 0 4px}
  h2{font-size:1.05rem;margin:0 0 12px}
  .muted{color:#64748B;font-size:.875rem}
  label{display:block;font-size:.875rem;font-weight:600;margin:12px 0 4px}
  input,select,textarea{width:100%;padding:11px 12px;border:1px solid #CBD5E1;
       border-radius:10px;font:inherit;background:#fff}
  input:focus,select:focus{outline:2px solid var(--acento,#B91C1C);outline-offset:1px}
  button{width:100%;padding:14px;border:0;border-radius:12px;font:inherit;font-weight:700;
       color:#fff;background:var(--acento,#B91C1C);cursor:pointer;margin-top:14px}
  button:disabled{opacity:.5;cursor:not-allowed}
  button.sec{background:#334155}
  .row{display:flex;gap:10px}
  .row>*{flex:1}
  table{width:100%;border-collapse:collapse;font-size:.875rem}
  th,td{text-align:left;padding:8px 6px;border-bottom:1px solid #E2E8F0}
  th{color:#64748B;font-weight:600}
  .ok{color:#15803D}.bad{color:#B91C1C}
  .msg{padding:12px;border-radius:10px;margin-top:14px;font-size:.9rem;display:none}
  .msg.show{display:block}
  .msg.ok{background:#DCFCE7;color:#14532D}
  .msg.bad{background:#FEE2E2;color:#7F1D1D}
  code{background:#F1F5F9;padding:2px 6px;border-radius:6px;font-size:.85em}
`;

function layout({ titulo, acento = '#B91C1C', body, script = '' }) {
  return `<!doctype html>
<html lang="es"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(titulo)}</title>
<style>:root{--acento:${esc(acento)}}${CSS}</style>
</head><body><div class="wrap">${body}</div>
${script ? `<script>${script}</script>` : ''}
</body></html>`;
}

// Iconos SVG inline (trazo, estilo Lucide). NO emojis: en Android de gama media
// y en MIUI los emoji salen monocromáticos o desalineados, y el mismo icono se ve
// distinto en cada teléfono. Mismo criterio que menu-digital.
const ICONO = {
  telefono: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>',
  whatsapp: '<path d="M3 21l1.65-4.95A8.5 8.5 0 1 1 7.95 19.4L3 21z"/><path d="M8.5 9.5c0 3 3 6 6 6"/>',
  correo: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/>',
  web: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 0 20 15.3 15.3 0 0 1 0-20z"/>',
  descargar: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
};

function svg(nombre, tam = 20) {
  return `<svg width="${tam}" height="${tam}" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
    aria-hidden="true" focusable="false">${ICONO[nombre] || ''}</svg>`;
}

module.exports = { esc, layout, svg, ICONO };
