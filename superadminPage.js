const { layout } = require('./ui');
const { TIPOS } = require('./db');

const OPCIONES_TIPO = Object.entries(TIPOS)
  .map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('');

function renderSuperadmin() {
  const body = `
    <div class="card">
      <h1>Etiquetas NFC — Ámbar Rojo</h1>
      <p class="muted" id="resumen">Cargando…</p>
    </div>

    <div class="card">
      <h2>1. Generar lote</h2>
      <p class="muted">Crea los códigos y te da las URLs para grabar en las etiquetas físicas.</p>
      <div class="row">
        <div><label for="cant">Cantidad</label><input id="cant" type="number" min="1" max="500" value="100"></div>
        <div><label for="lote">Etiqueta (opcional)</label><input id="lote" placeholder="Mesa"></div>
      </div>
      <button onclick="generarLote()">Generar</button>
      <label for="urls" style="margin-top:16px">URLs para grabar</label>
      <textarea id="urls" rows="6" readonly placeholder="Aparecen aquí; cópialas a NFC Tools"></textarea>
    </div>

    <div class="card">
      <h2>2. Alta de cliente (opcional, para agrupar etiquetas)</h2>
      <div class="row">
        <div><label for="cslug">Slug</label><input id="cslug" placeholder="tacos-el-primo"></div>
        <div><label for="cnom">Nombre</label><input id="cnom" placeholder="Tacos El Primo"></div>
      </div>
      <button onclick="crearCliente()">Crear cliente</button>
      <div id="mc" class="msg"></div>
    </div>

    <div class="card">
      <h2>3. Asignar etiqueta a un producto</h2>
      <p class="muted">La etiqueta redirige al destino. Reasignar no requiere volver a grabar el tag.</p>
      <label for="acod">Código</label><input id="acod" placeholder="a7k2m9">
      <label for="acli">Cliente (opcional)</label><select id="acli"></select>
      <label for="atipo">Producto</label><select id="atipo" onchange="pistaDestino()">${OPCIONES_TIPO}</select>
      <label for="adest">Destino (URL del producto)</label>
      <input id="adest" placeholder="">
      <button onclick="asignar()">Asignar</button>
      <div id="ma" class="msg"></div>
    </div>

    <div class="card">
      <h2>Etiquetas</h2>
      <table><thead><tr><th>Código</th><th>Cliente</th><th>Producto</th><th>Escaneos</th></tr></thead>
      <tbody id="tabla"></tbody></table>
    </div>`;

  const script = `
    const TIPOS=${JSON.stringify(TIPOS)};
    const $=id=>document.getElementById(id);
    function aviso(el,texto,ok){el.className='msg show '+(ok?'ok':'bad');el.textContent=texto;}
    async function api(url,opts){
      const r=await fetch(url,{headers:{'Content-Type':'application/json'},...opts});
      const d=await r.json().catch(()=>({}));
      if(!r.ok) throw new Error(d.error||'Error '+r.status);
      return d;
    }
    // Ayuda: al elegir producto, prellena el destino con el dominio del producto.
    function pistaDestino(){
      const t=TIPOS[$('atipo').value];
      if(t && !$('adest').value) $('adest').value=t.dominio+'/';
    }
    async function cargar(){
      const s=await api('/superadmin/api/resumen');
      $('resumen').textContent=s.clientes+' clientes · '+s.tags+' etiquetas ('+s.sin_asignar+' sin asignar) · '+s.escaneos+' escaneos';
      const cl=await api('/superadmin/api/clientes');
      $('acli').innerHTML='<option value="">— sin cliente —</option>'+
        cl.map(c=>'<option value="'+c.id+'">'+c.nombre+'</option>').join('');
      const tags=await api('/superadmin/api/tags');
      $('tabla').innerHTML=tags.slice(0,100).map(t=>'<tr><td><code>'+t.codigo+'</code></td><td>'+
        (t.cliente_nombre||'—')+'</td><td>'+(t.tipo?TIPOS[t.tipo].label:'—')+'</td><td>'+t.escaneos+'</td></tr>').join('')
        ||'<tr><td colspan="4" class="muted">Sin etiquetas todavía</td></tr>';
    }
    async function generarLote(){
      try{
        const d=await api('/superadmin/api/tags/lote',{method:'POST',
          body:JSON.stringify({cantidad:Number($('cant').value),etiqueta:$('lote').value||null})});
        $('urls').value=d.urls.join('\\n'); cargar();
      }catch(e){ alert(e.message); }
    }
    async function crearCliente(){
      try{
        await api('/superadmin/api/clientes',{method:'POST',
          body:JSON.stringify({slug:$('cslug').value,nombre:$('cnom').value})});
        aviso($('mc'),'Cliente creado',true); cargar();
      }catch(e){ aviso($('mc'),e.message,false); }
    }
    async function asignar(){
      try{
        await api('/superadmin/api/tags/'+encodeURIComponent($('acod').value.trim()),{method:'PUT',
          body:JSON.stringify({
            cliente_id:Number($('acli').value)||null, tipo:$('atipo').value,
            destino:$('adest').value.trim()||null })});
        aviso($('ma'),'Etiqueta asignada',true); cargar();
      }catch(e){ aviso($('ma'),e.message,false); }
    }
    cargar();`;

  return layout({ titulo: 'Superadmin NFC', body, script });
}

module.exports = { renderSuperadmin };
