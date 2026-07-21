const { esc, layout } = require('./ui');

function renderPanel(cliente) {
  const body = `
    <div class="card">
      <h1>${esc(cliente.nombre)}</h1>
      <p class="muted">Panel de etiquetas NFC</p>
    </div>

    <div class="card">
      <h2>Asistencia</h2>
      <label for="dias">Últimos días</label>
      <select id="dias" onchange="cargarChecadas()">
        <option value="1">Hoy</option><option value="7" selected>7 días</option>
        <option value="15">15 días</option><option value="30">30 días</option>
      </select>
      <a id="csv" href="#" style="display:inline-block;margin-top:12px;font-weight:600">⬇ Descargar CSV para nómina</a>
      <table style="margin-top:14px"><thead><tr><th>Empleado</th><th>Tipo</th><th>Fecha</th><th>Sitio</th></tr></thead>
      <tbody id="tchecadas"></tbody></table>
    </div>

    <div class="card">
      <h2>Empleados</h2>
      <div class="row">
        <div><label for="enom">Nombre</label><input id="enom" placeholder="María López"></div>
        <div><label for="epin">PIN (4-8 dígitos)</label><input id="epin" inputmode="numeric" placeholder="4821"></div>
      </div>
      <button onclick="crearEmpleado()">Agregar empleado</button>
      <div id="me" class="msg"></div>
      <table style="margin-top:14px"><thead><tr><th>Nombre</th><th>PIN</th><th>Estado</th><th></th></tr></thead>
      <tbody id="templeados"></tbody></table>
    </div>

    <div class="card">
      <h2>Tarjetas de presentación</h2>
      <div class="row">
        <div><label for="vnom">Nombre</label><input id="vnom" placeholder="Julio Domínguez"></div>
        <div><label for="vpue">Puesto</label><input id="vpue" placeholder="CTO"></div>
      </div>
      <div class="row">
        <div><label for="vtel">Teléfono</label><input id="vtel" placeholder="9611234567"></div>
        <div><label for="vmail">Email</label><input id="vmail" type="email" placeholder="hola@ambarrojo.mx"></div>
      </div>
      <label for="vweb">Sitio web</label><input id="vweb" placeholder="https://ambarrojo.mx">
      <button onclick="crearVcard()">Crear tarjeta</button>
      <div id="mv" class="msg"></div>
      <table style="margin-top:14px"><thead><tr><th>Nombre</th><th>Puesto</th><th>Etiqueta</th></tr></thead>
      <tbody id="tvcards"></tbody></table>
    </div>

    <div class="card">
      <h2>Mis etiquetas</h2>
      <table><thead><tr><th>Código</th><th>Producto</th><th>Punto</th><th>Escaneos</th></tr></thead>
      <tbody id="ttags"></tbody></table>
    </div>`;

  const script = `
    const SLUG=${JSON.stringify(cliente.slug)};
    const $=id=>document.getElementById(id);
    const vacio=(n,t)=>'<tr><td colspan="'+n+'" class="muted">'+t+'</td></tr>';
    function aviso(el,texto,ok){el.className='msg show '+(ok?'ok':'bad');el.textContent=texto;}
    async function api(ruta,opts){
      const r=await fetch('/'+SLUG+'/api'+ruta,{headers:{'Content-Type':'application/json'},...opts});
      const d=await r.json().catch(()=>({}));
      if(!r.ok) throw new Error(d.error||'Error '+r.status);
      return d;
    }
    async function cargarChecadas(){
      $('csv').href='/'+SLUG+'/api/checadas.csv?dias='+$('dias').value;
      const d=await api('/checadas?dias='+$('dias').value);
      $('tchecadas').innerHTML=d.map(c=>'<tr><td>'+c.empleado+'</td><td>'+c.tipo+'</td><td>'+
        c.created_at+'</td><td class="'+(c.en_sitio===0?'bad':'ok')+'">'+
        (c.en_sitio===1?'✓':c.en_sitio===0?'fuera':'—')+'</td></tr>').join('')||vacio(4,'Sin checadas en el periodo');
    }
    async function cargarEmpleados(){
      const d=await api('/empleados');
      $('templeados').innerHTML=d.map(e=>'<tr><td>'+e.nombre+'</td><td><code>'+e.pin+'</code></td><td>'+
        (e.activo?(e.ultimo||'—'):'baja')+'</td><td>'+(e.activo?
        '<a href="#" onclick="baja('+e.id+');return false">baja</a>':'')+'</td></tr>').join('')||vacio(4,'Sin empleados');
    }
    async function cargarVcards(){
      const d=await api('/vcards');
      $('tvcards').innerHTML=d.map(v=>'<tr><td>'+v.nombre+'</td><td>'+(v.puesto||'—')+'</td><td>'+
        (v.codigo?'<code>'+v.codigo+'</code>':'<span class="muted">sin asignar (id '+v.id+')</span>')+
        '</td></tr>').join('')||vacio(3,'Sin tarjetas');
    }
    async function cargarTags(){
      const d=await api('/tags');
      $('ttags').innerHTML=d.map(t=>'<tr><td><code>'+t.codigo+'</code></td><td>'+(t.tipo||'—')+'</td><td>'+
        (t.etiqueta||'—')+'</td><td>'+t.escaneos+'</td></tr>').join('')||vacio(4,'Sin etiquetas asignadas');
    }
    async function crearEmpleado(){
      try{ await api('/empleados',{method:'POST',body:JSON.stringify({nombre:$('enom').value,pin:$('epin').value})});
        aviso($('me'),'Empleado agregado',true); $('enom').value=$('epin').value=''; cargarEmpleados();
      }catch(e){ aviso($('me'),e.message,false); }
    }
    async function baja(id){
      if(!confirm('¿Dar de baja a este empleado?')) return;
      await api('/empleados/'+id,{method:'DELETE'}); cargarEmpleados();
    }
    async function crearVcard(){
      try{ await api('/vcards',{method:'POST',body:JSON.stringify({
          nombre:$('vnom').value,puesto:$('vpue').value,empresa:${JSON.stringify(cliente.nombre)},
          telefono:$('vtel').value,email:$('vmail').value,web:$('vweb').value})});
        aviso($('mv'),'Tarjeta creada. Pásale el id al superadmin para asignar la etiqueta.',true);
        cargarVcards();
      }catch(e){ aviso($('mv'),e.message,false); }
    }
    cargarChecadas();cargarEmpleados();cargarVcards();cargarTags();`;

  return layout({ titulo: 'Panel — ' + cliente.nombre, body, script });
}

module.exports = { renderPanel };
