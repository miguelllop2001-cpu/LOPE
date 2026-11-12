// LOPE · Mi Negocio — Mayoreo
// (Este archivo solo tiene funciones. Lo que se ejecuta al abrir la app está en app8-arranque.js)

// ¿El almacén es un PUNTO DE VENTA? (nombre empieza con "P ")
function esPuntoVenta(a){ return /^p\s/i.test(((a&&a.nombre)||'').trim()); }

function cargarMayoreo(){
  const aviso=document.getElementById('mayAviso');
  const alm=almacenMayoreo();
  if(!alm){ aviso.innerHTML='⚠️ Falta el almacén de mayoreo. Ve a "Almacenes y Productos" y crea uno llamado <b>MAYOREO</b>.'; aviso.className='msg err'; }
  else { aviso.textContent=''; aviso.className='msg'; }
  cambiarMTab('productos');
}

function cambiarMTab(cual){
  ['productos','inventario','vender','ganancias','dinero','historial','reservas','avisar','clientes'].forEach(t=>{
    const el=document.getElementById('mtab-'+t); if(el) el.style.display = (t===cual)?'block':'none';
    const b=document.getElementById('mtab-btn-'+t); if(b) b.classList.toggle('active', t===cual);
  });
  if(cual==='productos') renderPreciosMayoreo();
  if(cual==='inventario') renderInvMayoreo();
  if(cual==='vender') prepararVenderMayoreo();
  if(cual==='ganancias') cargarGananciasMayoreo();
  if(cual==='dinero') cargarDineroMayoreo();
  if(cual==='historial') cambiarHTab('dinero');
  if(cual==='reservas') cargarReservasMayoreo();
  if(cual==='avisar') cargarAvisarMayoreo();
  if(cual==='clientes') cargarClientesMayoreo();
}

// Inventario del almacén MAYOREO
function renderInvMayoreo(){
  const cont=document.getElementById('mayInvBody');
  const alm=almacenMayoreo();
  if(!alm){ cont.innerHTML='<div class="empty">Falta crear el almacén MAYOREO.</div>'; return; }
  const q=(document.getElementById('mayInvBuscar').value||'').trim().toLowerCase();
  let filas=(PRODUCTOS||[]).map(p=>({nombre:p.nombre, pm:Number(p.precio_mayoreo||0),
    cant:(INVENTARIO||[]).filter(i=>i.almacen_id===alm.id&&i.producto_id===p.id).reduce((s,i)=>s+Number(i.cantidad||0),0)}))
    .filter(x=>x.cant>0);
  if(q) filas=filas.filter(x=>coincideNombre(x.nombre, q));
  const total=filas.reduce((s,x)=>s+x.cant,0);
  if(!filas.length){ cont.innerHTML='<div class="empty">El almacén de mayoreo no tiene stock todavía. Métele con "📥 Entrada de mercancía".</div>'; return; }
  cont.innerHTML=`<div style="font-weight:700; margin-bottom:6px">${num(total)} uds.</div>
  <table style="min-width:520px"><thead><tr><th>Producto</th><th class="numcell">Cant.</th><th class="numcell">P. Mayoreo</th></tr></thead><tbody>
  ${filas.sort((a,b)=>a.nombre.localeCompare(b.nombre)).map(x=>`<tr><td>${x.nombre}</td><td class="numcell">${num(x.cant)}</td><td class="numcell">$${num(x.pm)}</td></tr>`).join('')}
  </tbody></table>`;
}

// ----- PRODUCTOS / PRECIOS -----
function renderPreciosMayoreo(){
  const cont=document.getElementById('mayPreciosBody');
  const q=(document.getElementById('mayBuscarPrecio').value||'').trim().toLowerCase();
  let lista=[...(PRODUCTOS||[])];
  if(q) lista=lista.filter(p=>coincideNombre(p.nombre, q));
  lista=lista.slice(0,60);
  if(!lista.length){ cont.innerHTML='<div class="empty">Sin productos.</div>'; return; }
  cont.innerHTML=`<table style="min-width:850px"><thead><tr><th>Producto (interno)</th><th>Nombre para la web</th><th class="numcell">Costo may.</th><th class="numcell">Precio may.</th><th class="numcell">Mín.</th><th class="numcell">Caja</th><th></th><th></th></tr></thead><tbody>
  ${lista.map(p=>`<tr>
    <td>${p.nombre}</td>
    <td><input type="text" id="maynw-${p.id}" value="${(p.nombre_web||'').replace(/"/g,'&quot;')}" placeholder="(igual que el interno)" style="width:170px"></td>
    <td class="numcell"><input type="number" id="mayco-${p.id}" value="${Number(p.costo_mayoreo)>0?Number(p.costo_mayoreo):''}" placeholder="0" inputmode="decimal" style="width:85px; text-align:right"></td>
    <td class="numcell"><input type="number" id="maypv-${p.id}" value="${Number(p.precio_mayoreo)>0?Number(p.precio_mayoreo):''}" placeholder="0" inputmode="decimal" style="width:85px; text-align:right"></td>
    <td class="numcell"><input type="number" id="maymin-${p.id}" value="${Number(p.min_mayoreo)>1?Number(p.min_mayoreo):''}" placeholder="1" inputmode="numeric" style="width:60px; text-align:right"></td>
    <td class="numcell"><input type="number" id="maymul-${p.id}" value="${Number(p.multiplo_mayoreo)>1?Number(p.multiplo_mayoreo):''}" placeholder="1" inputmode="numeric" style="width:60px; text-align:right"></td>
    <td><button class="ghost" id="maybtn-${p.id}" onclick="guardarPrecioMayoreo(${p.id})">✓</button></td>
    <td><button class="ghost" onclick="abrirFotosMayoreo(${p.id})">📷 Fotos</button> <button class="ghost" onclick="abrirSpecsMayoreo(${p.id})">📋 Especif.</button></td>
  </tr>`).join('')}
  </tbody></table>
  <div id="mayFotosPanel" style="margin-top:12px"></div>`;
}

async function guardarPrecioMayoreo(pid){
  const pv=Number(document.getElementById('maypv-'+pid).value)||0;
  const co=Number(document.getElementById('mayco-'+pid).value)||0;
  const nwEl=document.getElementById('maynw-'+pid);
  const nw=nwEl?(nwEl.value||'').trim():'';
  const minEl=document.getElementById('maymin-'+pid);
  let mn=minEl?(parseInt(minEl.value)||1):1; if(mn<1)mn=1;
  const mulEl=document.getElementById('maymul-'+pid);
  let ml=mulEl?(parseInt(mulEl.value)||1):1; if(ml<1)ml=1;
  if(pv<0||co<0){ alert('Precio o costo no válido.'); return; }
  if(!navigator.onLine){ alert('Necesitas internet para guardar.'); return; }
  try{
    let {data,error}=await sb.from('productos').update({precio_mayoreo:pv, costo_mayoreo:co, nombre_web:nw||null, min_mayoreo:mn, multiplo_mayoreo:ml}).eq('id',pid).select();
    if(error && (String(error.message||'').includes('multiplo_mayoreo'))){
      const r0=await sb.from('productos').update({precio_mayoreo:pv, costo_mayoreo:co, nombre_web:nw||null, min_mayoreo:mn}).eq('id',pid).select();
      data=r0.data; error=r0.error;
      if(!error){ alert('Guardé lo demás. Para la caja (múltiplo) corre el SQL "multiplo_mayoreo.sql".'); }
    }
    if(error && (String(error.message||'').includes('min_mayoreo'))){
      const r0=await sb.from('productos').update({precio_mayoreo:pv, costo_mayoreo:co, nombre_web:nw||null}).eq('id',pid).select();
      data=r0.data; error=r0.error;
      if(!error){ alert('Guardé lo demás. Para el mínimo corre el SQL "min_mayoreo.sql".'); }
    }
    if(error && (String(error.message||'').includes('nombre_web'))){
      const r0=await sb.from('productos').update({precio_mayoreo:pv, costo_mayoreo:co}).eq('id',pid).select();
      data=r0.data; error=r0.error;
      if(!error){ alert('Guardé precio y costo. Para el nombre web corre el SQL "nombre_web.sql".'); }
    }
    if(error && (String(error.message||'').includes('costo_mayoreo'))){
      const r2=await sb.from('productos').update({precio_mayoreo:pv}).eq('id',pid).select();
      data=r2.data; error=r2.error;
      if(!error){ alert('Guardé el precio. El costo de mayoreo necesita correr el SQL "mayoreo_setup.sql".'); }
    }
    if(error) throw error;
    if(!data||!data.length){ alert('El servidor no aplicó el cambio (permisos).'); return; }
    const p=(PRODUCTOS||[]).find(x=>x.id===pid); if(p){ p.precio_mayoreo=pv; p.costo_mayoreo=co; p.nombre_web=nw||null; p.min_mayoreo=mn; p.multiplo_mayoreo=ml; }
    lsSet('adm_cache_productos', PRODUCTOS);
    // Buscamos el botón por su id (antes se usaba el "event" global, que queda vacío
    // después de esperar al servidor, y por eso la palomita verde nunca se veía).
    const btn=document.getElementById('maybtn-'+pid); if(btn){ const t=btn.textContent; btn.textContent='✓'; btn.style.color='var(--green)'; setTimeout(()=>{btn.textContent=t; btn.style.color='';},1200); }
  }catch(e){ alert('No se pudo: '+(e.message||e)); registrarError('mayoreo/productos','No se pudo guardar precio/caja',(e&&e.message)||String(e)); }
}

// ----- ENTRADA DE MERCANCÍA A MAYOREO -----
function filtrarMayEntrada(){
  const q=(document.getElementById('mayEbuscar').value||'').trim().toLowerCase();
  const cont=document.getElementById('mayEsug');
  document.getElementById('mayEprod').value=''; document.getElementById('mayEelegido').textContent='';
  if(q.length<1){ cont.style.display='none'; cont.innerHTML=''; return; }
  const m=(PRODUCTOS||[]).filter(p=>coincideNombre(p.nombre, q)).sort((a,b)=>a.nombre.localeCompare(b.nombre)).slice(0,15);
  if(!m.length){ cont.style.display='block'; cont.innerHTML='<div style="padding:10px;color:var(--muted)">Sin coincidencias.</div>'; return; }
  cont.innerHTML=m.map(p=>`<div onclick="elegirMayEntrada(${p.id})" style="padding:12px;border-bottom:1px solid var(--border);cursor:pointer">${p.nombre}</div>`).join('');
  cont.style.display='block';
}
function elegirMayEntrada(id){
  const p=(PRODUCTOS||[]).find(x=>x.id===id); if(!p) return;
  document.getElementById('mayEprod').value=id;
  document.getElementById('mayEbuscar').value=p.nombre;
  document.getElementById('mayEelegido').textContent='✓ '+p.nombre;
  document.getElementById('mayEsug').style.display='none';
}
async function entradaMayoreo(signo){
  signo = (Number(signo)<0) ? -1 : 1;
  const pid=Number(document.getElementById('mayEprod').value);
  const cant=Number(document.getElementById('mayEcant').value);
  const msg=document.getElementById('mayEmsg');
  const alm=almacenMayoreo();
  if(!alm){ msg.textContent='Falta crear el almacén MAYOREO.'; msg.className='msg err'; return; }
  if(!pid){ msg.textContent='Elige un producto.'; msg.className='msg err'; return; }
  if(!cant||cant<=0){ msg.textContent='Pon una cantidad.'; msg.className='msg err'; return; }
  const pr=(PRODUCTOS||[]).find(x=>x.id===pid);
  // Si es EXTRACCIÓN, no dejar sacar más de lo que hay (en memoria)
  if(signo<0){
    const hay=(INVENTARIO||[]).filter(i=>i.almacen_id===alm.id&&i.producto_id===pid).reduce((s,i)=>s+Number(i.cantidad||0),0);
    if(cant>hay){ msg.textContent='No hay tanto para extraer (hay '+num(hay)+').'; msg.className='msg err'; return; }
  }
  // 1) guardar el movimiento en la cola local (nunca se pierde)
  const clave='maymov_'+Date.now()+'_'+Math.random().toString(36).slice(2,7);
  const mov={ clave, almacen_id:alm.id, producto_id:pid, delta:signo*cant, nombre:(pr&&pr.nombre)||('#'+pid), ts:Date.now() };
  try{ const cola=lsGet('may_movs_pendientes',[]); cola.push(mov); lsSet('may_movs_pendientes',cola); }catch(_){}
  // 2) ajustar el stock en memoria al momento
  { let row=(INVENTARIO||[]).find(i=>i.almacen_id===alm.id&&i.producto_id===pid); if(!row){ row={almacen_id:alm.id,producto_id:pid,cantidad:0}; INVENTARIO.push(row);} row.cantidad=Number(row.cantidad||0)+signo*cant; }
  // 3) intentar subirlo (si falla, queda en cola y se reintenta solo)
  await subirMovsMayoreo();
  msg.textContent = (signo>0 ? 'Ingresó al mayoreo.' : 'Se extrajo del mayoreo.') + (navigator.onLine?' ✓':' (se subirá cuando vuelva el internet) ✓'); msg.className='msg ok';
  document.getElementById('mayEbuscar').value=''; document.getElementById('mayEprod').value='';
  document.getElementById('mayEelegido').textContent=''; document.getElementById('mayEcant').value='';
  try{ renderInvMayoreo(); }catch(_){}
}
// Sube los movimientos de mercancía pendientes con el RPC atómico. Idempotente + reintento.
async function subirMovsMayoreo(){
  await drenarCola('may_movs_pendientes', async m => {
    const { error } = await sb.rpc('mover_mayoreo_atomico', { p_clave:m.clave, p_almacen:m.almacen_id, p_producto:m.producto_id, p_delta:m.delta, p_nombre:m.nombre||'' });
    if(error){
      if(String(error.message||'').includes('mover_mayoreo_atomico')){
        if(!window.__avisoRpcMov){ window.__avisoRpcMov=true; try{ alert('Falta correr el SQL "mover_mayoreo_atomico.sql" en Supabase. El movimiento quedó guardado y se subirá cuando lo corras.'); }catch(_){} }
      }
      registrarError('mayoreo/movimiento','No subió el movimiento (queda en cola)', error.message);
      throw new Error(error.message);
    }
  });
}

// --- Especificaciones del producto (se ven en el catálogo web) ---
function abrirSpecsMayoreo(pid){
  const prod=(PRODUCTOS||[]).find(x=>x.id===pid); if(!prod) return;
  const cont=document.getElementById('mayFotosPanel'); if(!cont) return;
  const val=(prod.especificaciones||'').replace(/</g,'&lt;');
  cont.innerHTML=`<div class="card" style="border:2px solid var(--blue)">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
      <h3 style="margin:0">📋 Especificaciones — ${prod.nombre}</h3>
      <button class="ghost" onclick="document.getElementById('mayFotosPanel').innerHTML=''">Cerrar ✕</button>
    </div>
    <p style="color:var(--muted);font-size:13px;margin:6px 0">Una por línea. Se ven <b>tal como las escribas</b>. En el catálogo aparece un <b>!</b> al lado del nombre y al tocarlo se abren.</p>
    <textarea id="specsTxt-${pid}" rows="7" style="width:100%;font-family:inherit;font-size:14px;padding:10px;border:1px solid var(--border);border-radius:9px" placeholder="Medida: 5 pulgadas&#10;Material: Acero&#10;Marca: Q7&#10;Contenido: 1000 piezas">${val}</textarea>
    <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">
      <button class="primary" onclick="guardarSpecsMayoreo(${pid})">Guardar especificaciones</button>
    </div>
    <div id="specsMsg-${pid}" class="msg"></div>
  </div>`;
}
async function guardarSpecsMayoreo(pid){
  const ta=document.getElementById('specsTxt-'+pid); if(!ta) return;
  const msg=document.getElementById('specsMsg-'+pid);
  const txt=(ta.value||'').trim();
  if(!navigator.onLine){ if(msg){msg.textContent='Necesitas internet.';msg.className='msg err';} return; }
  try{
    const {data,error}=await sb.from('productos').update({especificaciones: txt||null}).eq('id',pid).select();
    if(error) throw error;
    if(!data||!data.length){ if(msg){msg.textContent='El servidor no aplicó el cambio (permisos).';msg.className='msg err';} return; }
    const p=(PRODUCTOS||[]).find(x=>x.id===pid); if(p) p.especificaciones=txt||null;
    lsSet('adm_cache_productos', PRODUCTOS);
    if(msg){ msg.textContent='Guardado ✓ (se ve en el catálogo web)'; msg.className='msg ok'; }
  }catch(e){
    const falta=String(e.message||'').includes('especificaciones');
    if(msg){ msg.textContent = falta ? 'Falta correr el SQL "especificaciones.sql" en Supabase.' : ('No se pudo: '+(e.message||e)); msg.className='msg err'; }
    registrarError('mayoreo/especificaciones','No se pudo guardar especificaciones',(e&&e.message)||String(e));
  }
}
async function abrirFotosMayoreo(pid){
  const p=(PRODUCTOS||[]).find(x=>x.id===pid);
  const cont=document.getElementById('mayFotosPanel');
  cont.innerHTML=`<div class="card" style="border:2px solid var(--accent)">
    <div style="display:flex;justify-content:space-between;align-items:center">
      <h3 style="margin:0">📷 Fotos — ${p?p.nombre:('#'+pid)}</h3>
      <button class="ghost" onclick="document.getElementById('mayFotosPanel').innerHTML=''">Cerrar ✕</button>
    </div>
    
    <button class="primary" style="width:100%" onclick="document.getElementById('mayFotoInput-${pid}').click()">+ Subir foto</button>
    <input type="file" id="mayFotoInput-${pid}" accept="image/*" style="position:absolute;left:-9999px" onchange="subirFotoMayoreo(${pid}, this)">
    <div id="mayFotosLista" style="margin-top:10px">Cargando…</div>
  </div>`;
  await listarFotosMayoreo(pid);
}

async function listarFotosMayoreo(pid){
  const cont=document.getElementById('mayFotosLista');
  if(!cont) return;
  if(!navigator.onLine){ cont.innerHTML='<div class="msg err">Necesitas internet para ver/subir fotos.</div>'; return; }
  try{
    const {data,error}=await sb.from('fotos_mayoreo').select('*').eq('producto_id',pid).order('id',{ascending:true});
    if(error) throw error;
    if(!data||!data.length){ cont.innerHTML='<div class="empty">Sin fotos. (Puedes dejarlo así, "sin foto".)</div>'; return; }
    cont.innerHTML=`<div style="display:flex;flex-wrap:wrap;gap:10px">${data.map(f=>`
      <div style="border:1px solid var(--border);border-radius:10px;padding:6px;width:120px">
        <img src="${f.url}" style="width:108px;height:108px;object-fit:cover;border-radius:8px" onerror="this.style.opacity=.3">
        <button class="ghost" style="width:100%;margin-top:4px;font-size:12px;padding:5px" onclick="toggleFotoWeb(${f.id}, ${f.mostrar_web}, ${pid})">${f.mostrar_web?'🌐 Web':'📄 Legal'}</button>
        <button class="ghost" style="width:100%;margin-top:4px;font-size:12px;padding:5px;color:var(--red)" onclick="borrarFotoMayoreo(${f.id}, ${pid})">Borrar</button>
      </div>`).join('')}</div>`;
  }catch(e){ cont.innerHTML='<div class="msg err">No se pudo: '+(e.message||e)+'</div>'; }
}

// Achica la imagen antes de subir (importante para no gastar muchos datos en Cuba).
function comprimirImagen(file, maxLado=1000, calidad=0.7){
  return new Promise((resolve,reject)=>{
    const img=new Image(); const rd=new FileReader();
    rd.onload=()=>{ img.onload=()=>{
      let {width:w,height:h}=img;
      if(w>h && w>maxLado){ h=Math.round(h*maxLado/w); w=maxLado; }
      else if(h>maxLado){ w=Math.round(w*maxLado/h); h=maxLado; }
      const c=document.createElement('canvas'); c.width=w; c.height=h;
      c.getContext('2d').drawImage(img,0,0,w,h);
      c.toBlob(b=> b?resolve(b):reject(new Error('No se pudo procesar la imagen')), 'image/jpeg', calidad);
    }; img.onerror=()=>reject(new Error('Imagen no válida')); img.src=rd.result; };
    rd.onerror=()=>reject(new Error('No se pudo leer el archivo')); rd.readAsDataURL(file);
  });
}

async function subirFotoMayoreo(pid, input){
  const file=input.files&&input.files[0]; if(!file) return;
  if(!navigator.onLine){ alert('Necesitas internet para subir fotos.'); input.value=''; return; }
  const lista=document.getElementById('mayFotosLista'); const antes=lista?lista.innerHTML:''; if(lista) lista.innerHTML='Subiendo foto…';
  try{
    const blob=await comprimirImagen(file);
    const path=pid+'/'+Date.now()+'.jpg';
    const up=await sb.storage.from(MAY_BUCKET).upload(path, blob, {contentType:'image/jpeg', upsert:true});
    if(up.error) throw up.error;
    const {data:pub}=sb.storage.from(MAY_BUCKET).getPublicUrl(path);
    const ins=await sb.from('fotos_mayoreo').insert({producto_id:pid, url:pub.publicUrl, path, mostrar_web:true});
    if(ins.error) throw ins.error;
    await listarFotosMayoreo(pid);
  }catch(e){
    if(lista) lista.innerHTML=antes;
    alert('No se pudo subir: '+(e.message||e)+'\n\n(¿Creaste el bucket público "fotos-mayoreo" en Storage y corriste fotos_mayoreo.sql?)');
  }
  input.value='';
}

async function toggleFotoWeb(fid, actual, pid){
  if(!navigator.onLine){ alert('Necesitas internet.'); return; }
  try{ const {error}=await sb.from('fotos_mayoreo').update({mostrar_web:!actual}).eq('id',fid); if(error) throw error; await listarFotosMayoreo(pid); }
  catch(e){ alert('No se pudo: '+(e.message||e)); }
}

async function borrarFotoMayoreo(fid, pid){
  if(!confirm('¿Borrar esta foto?')) return;
  if(!navigator.onLine){ alert('Necesitas internet.'); return; }
  try{
    // buscar la ruta para borrarla también del almacenamiento (si falla, igual se borra el registro)
    let path='';
    try{ const {data}=await sb.from('fotos_mayoreo').select('path').eq('id',fid).single(); if(data) path=data.path||''; }catch(_){}
    if(path){ try{ await sb.storage.from(MAY_BUCKET).remove([path]); }catch(_){} }
    const {error}=await sb.from('fotos_mayoreo').delete().eq('id',fid); if(error) throw error;
    await listarFotosMayoreo(pid);
  }catch(e){ alert('No se pudo: '+(e.message||e)); registrarError('mayoreo/fotos','No se pudo borrar la foto',(e&&e.message)||String(e)); }
}

// ----- VENDER -----
function prepararVenderMayoreo(){
  const av=document.getElementById('mayVenderAviso');
  if(!almacenMayoreo()){ av.innerHTML='⚠️ Falta crear el almacén <b>MAYOREO</b>.'; av.className='msg err'; }
  else { av.textContent=''; av.className='msg'; }
  document.getElementById('mayVbuscar').value=''; document.getElementById('mayVprod').value='';
  document.getElementById('mayVelegido').textContent=''; document.getElementById('mayVsug').style.display='none';
  document.getElementById('mayVcant').value=''; document.getElementById('mayVprecio').value='';
  renderMayCarrito();
}

function filtrarMayVender(){
  const q=(document.getElementById('mayVbuscar').value||'').trim().toLowerCase();
  const cont=document.getElementById('mayVsug');
  document.getElementById('mayVprod').value=''; document.getElementById('mayVelegido').textContent='';
  const alm=almacenMayoreo();
  if(q.length<1||!alm){ cont.style.display='none'; cont.innerHTML=''; return; }
  const stockDe=pid=>(INVENTARIO||[]).filter(i=>i.almacen_id===alm.id&&i.producto_id===pid).reduce((s,i)=>s+Number(i.cantidad||0),0);
  const matches=(PRODUCTOS||[]).filter(p=>coincideNombre(p.nombre, q)).sort((a,b)=>a.nombre.localeCompare(b.nombre)).slice(0,15);
  if(!matches.length){ cont.style.display='block'; cont.innerHTML='<div style="padding:10px;color:var(--muted)">Sin coincidencias.</div>'; return; }
  cont.innerHTML=matches.map(p=>{ const h=stockDe(p.id); return `<div onclick="elegirMayProducto(${p.id})" style="padding:12px;border-bottom:1px solid var(--border);cursor:pointer">${p.nombre} <span style="color:${h>0?'var(--green)':'var(--muted)'};font-size:13px">· hay ${num(h)}</span></div>`; }).join('');
  cont.style.display='block';
}

function elegirMayProducto(id){
  const p=(PRODUCTOS||[]).find(x=>x.id===id); if(!p) return;
  document.getElementById('mayVprod').value=id;
  document.getElementById('mayVbuscar').value=p.nombre;
  document.getElementById('mayVelegido').textContent='✓ '+p.nombre;
  document.getElementById('mayVsug').style.display='none';
  document.getElementById('mayVprecio').value=Number(p.precio_mayoreo||0);
  const c=document.getElementById('mayVcant'); if(c&&!c.value) c.value=1;
}

function agregarMayItem(){
  const pid=Number(document.getElementById('mayVprod').value);
  const cant=Number(document.getElementById('mayVcant').value);
  const precio=Number(document.getElementById('mayVprecio').value);
  const p=(PRODUCTOS||[]).find(x=>x.id===pid);
  if(!p){ alert('Elige un producto.'); return; }
  if(!cant||cant<=0){ alert('Pon una cantidad.'); return; }
  if(isNaN(precio)||precio<0){ alert('Precio no válido.'); return; }
  const alm=almacenMayoreo();
  if(!alm){ alert('Falta el almacén MAYOREO.'); return; }
  const stock=(INVENTARIO||[]).filter(i=>i.almacen_id===alm.id&&i.producto_id===pid).reduce((s,i)=>s+Number(i.cantidad||0),0);
  const yaEnCarrito=__mayCarrito.filter(x=>x.producto_id===pid).reduce((s,x)=>s+x.cantidad,0);
  if(cant+yaEnCarrito>stock){ alert(`No hay tanto en mayoreo. Hay ${num(stock)} y ya llevas ${num(yaEnCarrito)}.`); return; }
  __mayCarrito.push({producto_id:pid, nombre:p.nombre, cantidad:cant, precio, costo:Number(p.costo_mayoreo||0)});
  document.getElementById('mayVbuscar').value=''; document.getElementById('mayVprod').value='';
  document.getElementById('mayVelegido').textContent=''; document.getElementById('mayVcant').value=''; document.getElementById('mayVprecio').value='';
  renderMayCarrito();
}

function quitarMayItem(i){ __mayCarrito.splice(i,1); renderMayCarrito(); }

function renderMayCarrito(){
  const cont=document.getElementById('mayCarritoBody');
  const btn=document.getElementById('mayFinalizarBtn');
  if(!__mayCarrito.length){ cont.innerHTML='<div class="empty">Carrito vacío.</div>'; btn.style.display='none'; return; }
  const total=__mayCarrito.reduce((s,x)=>s+x.cantidad*x.precio,0);
  cont.innerHTML=`<table style="min-width:520px"><thead><tr><th>Producto</th><th class="numcell">Cant.</th><th class="numcell">Precio</th><th class="numcell">Subtotal</th><th></th></tr></thead><tbody>
  ${__mayCarrito.map((x,i)=>`<tr><td>${x.nombre}</td><td class="numcell">${num(x.cantidad)}</td><td class="numcell">$${num(x.precio)}</td><td class="numcell">$${num(x.cantidad*x.precio)}</td><td><button class="ghost" onclick="quitarMayItem(${i})">✕</button></td></tr>`).join('')}
  </tbody><tfoot><tr><td colspan="3" style="text-align:right;font-weight:700">TOTAL</td><td class="numcell" style="font-weight:800;color:var(--green)">$${num(total)}</td><td></td></tr></tfoot></table>`;
  btn.style.display='block';
}

// NÚCLEO compartido de la venta de mayoreo (mismo dinero para dueño/Dariel y Tamy).
// Venta de mayoreo A PRUEBA DE CAÍDAS:
// 1) Se guarda PRIMERO en el teléfono (cola local) → nunca se pierde.
// 2) Se descuenta el stock en memoria al momento (no se sobrevende).
// 3) Se sube con el RPC atómico (o todo o nada). Si falla (sin internet, etc.)
//    queda en la cola y se reintenta solo. Idempotente: no duplica.
async function procesarVentaMayoreo(carrito, reservaId){
  const alm=await asegurarAlmacenMayoreo(); if(!alm) throw new Error('Falta el almacén MAYOREO.');
  if(!carrito||!carrito.length) throw new Error('Carrito vacío.');
  const total=carrito.reduce((s,x)=>s+x.cantidad*x.precio,0);
  const ganancia=carrito.reduce((s,x)=>s+x.cantidad*(x.precio-x.costo),0);
  // Validar stock con lo que hay DE VERDAD en el almacén MAYOREO (pedido fresco al
  // servidor). La cuenta de la vendedora NO tiene ese almacén en memoria, por eso antes
  // decía "hay 0". Si no se puede leer (sin internet), NO bloqueamos: la venta se encola
  // y el servidor (RPC atómico) valida el stock igual al subirla.
  let __stkFresco=null;
  try{ await tvCargarStockMayoreo(); if(typeof __tvStockMayoreo!=='undefined' && __tvStockMayoreo) __stkFresco=__tvStockMayoreo; }catch(_){}
  if(__stkFresco){
    for(const it of carrito){
      const hay=Number(__stkFresco[it.producto_id]||0);
      if(it.cantidad>hay) throw new Error('No hay suficiente de "'+it.nombre+'" (hay '+num(hay)+').');
    }
  }
  const clave='may_'+Date.now()+'_'+Math.random().toString(36).slice(2,7);
  const venta={ clave, almacen_id:alm.id, items:carrito.map(x=>({producto_id:x.producto_id,nombre:x.nombre,cantidad:x.cantidad,precio:x.precio,costo:x.costo})), total, ganancia, usuario:(usuarioActual&&usuarioActual.nombre)||'', reserva_id:reservaId||null, ts:Date.now() };
  // 1) guardar en la cola local (esto NUNCA falla ni se pierde)
  try{ const cola=lsGet('may_ventas_pendientes',[]); cola.push(venta); lsSet('may_ventas_pendientes',cola); }catch(_){}
  // 2) descontar stock en memoria de una vez (para que se vea al instante y no se sobrevenda)
  carrito.forEach(it=>{ const row=(INVENTARIO||[]).find(i=>i.almacen_id===alm.id&&i.producto_id===it.producto_id); if(row) row.cantidad=Number(row.cantidad||0)-it.cantidad; });
  if(reservaId){ if(__reservasMay&&__reservasMay[reservaId]) __reservasMay[reservaId].estado='atendida'; }
  // 3) intentar subirla ya (si falla, queda en la cola y se reintenta solo)
  await subirVentasMayoreo();
  return {total, ganancia, encolada:true};
}

// Sube las ventas de mayoreo pendientes con el RPC atómico. Idempotente y con reintento.
async function subirVentasMayoreo(){
  await drenarCola('may_ventas_pendientes', async v => {
    const { error } = await sb.rpc('vender_mayoreo_atomico', {
      p_clave:v.clave, p_almacen:v.almacen_id, p_items:v.items,
      p_total:v.total, p_ganancia:v.ganancia, p_usuario:v.usuario||'', p_reserva_id:v.reserva_id||null
    });
    if(error){
      // Si el RPC no existe todavía, avisar una vez (no perder la venta: queda en cola)
      if(String(error.message||'').includes('vender_mayoreo_atomico')){
        if(!window.__avisoRpcVenta){ window.__avisoRpcVenta=true; try{ alert('Falta correr el SQL "vender_mayoreo_atomico.sql" en Supabase. La venta quedó guardada y se subirá cuando lo corras.'); }catch(_){} }
      }
      registrarError('mayoreo/venta','No subió la venta (queda en cola para reintento)', error.message);
      throw new Error(error.message); // se reintenta luego
    }
    // si no hay error (data 'ok' o 'ya_existe') → se saca de la cola
  });
}

async function finalizarVentaMayoreo(){
  if(!__mayCarrito.length) return;
  if(!almacenMayoreo()){ alert('Falta el almacén MAYOREO.'); return; }
  const total=__mayCarrito.reduce((s,x)=>s+x.cantidad*x.precio,0);
  const ganancia=__mayCarrito.reduce((s,x)=>s+x.cantidad*(x.precio-x.costo),0);
  if(!confirm('Cobrar venta de mayoreo por $'+num(total)+' (ganancia $'+num(ganancia)+').\n\n¿Confirmar?')) return;
  const btn=document.getElementById('mayFinalizarBtn'); btn.disabled=true; btn.textContent='Cobrando…';
  try{
    await procesarVentaMayoreo(__mayCarrito, __reservaEnVenta); __reservaEnVenta=null;
    __mayCarrito=[]; renderMayCarrito();
    alert(navigator.onLine ? 'Venta de mayoreo cobrada. ✓' : 'Venta guardada. Se subirá sola cuando vuelva el internet. ✓');
    try{ await cargarTodo(); }catch(_){}
    cambiarMTab('historial');
  }catch(e){ alert('No se pudo: '+(e.message||e)); }
  finally{ btn.disabled=false; btn.textContent='✅ Cobrar venta de mayoreo'; }
}

// ----- GANANCIAS -----
async function acumuladoMayoreo(){
  const ventas=[]; { let d=0; for(;;){ const r=await sb.from('ventas_mayoreo').select('total,ganancia').order('id',{ascending:true}).range(d,d+999); if(r.error) throw r.error; ventas.push(...(r.data||[])); if(!r.data||r.data.length<1000) break; d+=1000; } }
  let vendido=0, gan=0, acc={Dariel:0,Tamy:0,jk:0,'Dueño':0}, darInv=0, darGan=0;
  ventas.forEach(v=>{ const t=Number(v.total||0), g=Number(v.ganancia||0); const c=t-g; const rf=repartoMayoreoFull(c,g); vendido+=t; gan+=g; acc.Dariel+=rf.darielTotal; darInv+=rf.inversion; darGan+=rf.darielGan; acc.Tamy+=rf.vendedor; acc.jk+=rf.adminJk; acc['Dueño']+=rf.dueno; });
  let movs=[]; try{ let d=0; for(;;){ const r=await sb.from('mayoreo_caja').select('*').order('id',{ascending:true}).range(d,d+999); if(r.error) throw r.error; movs.push(...(r.data||[])); if(!r.data||r.data.length<1000) break; d+=1000; } }catch(e){ movs=[]; }
  const cobrado={Dariel:0,Tamy:0,jk:0,'Dueño':0}; let ingManual=0, egrManual=0;
  movs.forEach(m=>{ if(m.tipo==='cobro'){ if(cobrado[m.persona]!=null) cobrado[m.persona]+=Number(m.monto||0); } else if(m.tipo==='ingreso'){ ingManual+=Number(m.monto||0); } else if(m.tipo==='egreso'){ egrManual+=Number(m.monto||0); } });
  const pend={}; Object.keys(acc).forEach(k=>pend[k]=Math.round((acc[k]-cobrado[k])*100)/100);
  const totalCobrado=Object.values(cobrado).reduce((a,b)=>a+b,0);
  const efectivo=Math.round((vendido + ingManual - egrManual - totalCobrado)*100)/100;
  return { vendido, gan, acc, cobrado, pend, efectivo, dariel:{inv:Math.round(darInv*100)/100, gan:Math.round(darGan*100)/100} };
}

async function cargarGananciasMayoreo(){
  const cont=document.getElementById('mayGananciasBody');
  if(!navigator.onLine){ cont.innerHTML='<div class="msg err">Necesitas internet.</div>'; return; }
  cont.textContent='Cargando…';
  try{
    const a=await acumuladoMayoreo();
    const fila=(clave,etq,desc,extra)=>{
      const p=a.pend[clave]||0;
      const btn=p>0.004?`<button class="primary" style="padding:8px 14px;font-size:13px" onclick="cobrarMayoreo('${clave}')">Cobrar $${num(p)}</button>`:'<span style="color:var(--muted);font-size:13px">Nada por cobrar</span>';
      return `<div style="border:1px solid var(--border);border-radius:12px;padding:12px;margin-bottom:10px">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">
          <div><b>${etq}</b><div style="color:var(--muted);font-size:12px">${desc}</div></div>
          <div style="text-align:right"><div style="font-weight:800;font-size:18px;color:var(--green)">$${num(p)}</div>${btn}</div>
        </div>${extra||''}
      </div>`;
    };
    // Desglose de Dariel: cuánto de lo pendiente es recuperar inversión y cuánto es su ganancia
    let dExtra='';
    { const pd=a.pend.Dariel||0, accD=a.acc.Dariel||0, inv=(a.dariel&&a.dariel.inv)||0, gan=(a.dariel&&a.dariel.gan)||0;
      const pInv = accD>0 ? Math.round(pd*(inv/accD)*100)/100 : 0;
      const pGan = Math.round((pd-pInv)*100)/100;
      dExtra=`<div style="margin-top:8px;padding-top:8px;border-top:1px dashed var(--border);display:flex;gap:14px;font-size:13px">
        <div>📦 Inversión<br><b style="font-size:15px">$${num(pInv)}</b></div>
        <div>📈 Ganancia<br><b style="font-size:15px;color:var(--green)">$${num(pGan)}</b></div>
      </div>`;
    }
    cont.innerHTML=`<div style="color:var(--muted);font-size:12px;margin-bottom:10px">Vendido $${num(a.vendido)} · Ganancia $${num(a.gan)}. Cada uno cobra TODO lo acumulado; luego vuelve a subir con nuevas ventas.</div>`
      + fila('Dariel','👤 Dariel','Inversión + su parte de ganancia. Al cobrar solo sale el dinero.', dExtra)
      + fila('Dueño','🤵 Dueño (tú)','Al cobrar entra a la caja normal de LOPE.')
      + fila('jk','👥 Admin jk','Al cobrar se le pone en su cobro (Deudas).')
      + fila('Tamy','🛒 Tamy','Al cobrar se le pone en su cobro (Deudas).');
  }catch(e){ cont.innerHTML='<div class="msg err">No se pudo: '+(e.message||e)+' (¿corriste mayoreo_caja.sql?)</div>'; }
}

async function cobrarMayoreo(clave){
  if(!navigator.onLine){ alert('Necesitas internet.'); return; }
  try{
    const a=await acumuladoMayoreo();
    const monto=Math.round((a.pend[clave]||0)*100)/100;
    if(monto<=0.004){ alert('No hay nada por cobrar.'); return; }
    const etq={Dariel:'Dariel', 'Dueño':'el dueño', jk:'Admin jk', Tamy:'Tamy'}[clave]||clave;
    let destino = clave==='Dueño' ? 'Entra a la caja normal de LOPE.' : (clave==='jk'||clave==='Tamy') ? 'Se le pone en su cobro (Deudas).' : 'Solo sale del mayoreo.';
    if(!confirm(`Cobrar $${num(monto)} para ${etq}.\n${destino}\n\n¿Confirmar?`)) return;
    // Marca única: si se pierde la respuesta, se puede comprobar si el cobro quedó anotado.
    const marcaCobro = 'Cobro mayoreo '+etq+' ·'+Date.now().toString(36);
    let c=await sb.from('mayoreo_caja').insert({tipo:'cobro', persona:clave, monto, concepto:marcaCobro}).select();
    if(c.error){
      let visto=null;
      for(let i=0;i<3 && !visto;i++){
        const v=await sb.from('mayoreo_caja').select('id').eq('concepto', marcaCobro).limit(1);
        if(!v.error){ visto=v; break; }
        await new Promise(r=>setTimeout(r,400));
      }
      if(visto && visto.data && visto.data.length) c={data:visto.data, error:null};
      else if(visto) throw c.error;                      // seguro que NO se anotó
      else throw new Error('se cortó la conexión y no pude confirmar si el cobro quedó anotado. Abre Mayoreo → Dinero y revisa antes de volver a cobrar.');
    }
    const idCobro = c.data && c.data[0] && c.data[0].id;
    // SEGUNDO PASO: que el dinero llegue a su destino. Antes el resultado se ignoraba: si se
    // cortaba aquí, el cobro quedaba anotado en mayoreo pero el dueño no lo recibía en caja,
    // o a jk/Tamy nunca se les creaba su cobro. Ahora, si falla, se deshace el primer paso.
    try{
      let ultimo=null, listo=false;
      for(let vez=0; vez<3 && !listo; vez++){
        try{
        if(clave==='Dueño'){
          await meterMovimientoCajaUnico({tipo:'ingreso', metodo:'efectivo', categoria:'otro', monto, concepto:'Cobro dueño (mayoreo)'}, idCobro ? ('maycob-'+idCobro) : null);
        } else if(clave==='jk' || clave==='Tamy'){
          const filaD = {tipo:'debo', tipo_deuda:'dinero', persona:(clave==='jk'?'admin jk':'Tamy'), monto, pagada:false,
                         nota:'Cobro mayoreo del '+fechaHoyLocal()+(idCobro?(' #'+idCobro):'')};
          const rD = await sb.from('deudas').insert(filaD);
          if(rD && rD.error){
            // ¿se guardó igual y solo se perdió la respuesta?
            let esta=false;
            try{ const {data:ya}=await sb.from('deudas').select('id').eq('persona',filaD.persona).eq('nota',filaD.nota).limit(1); esta=!!(ya&&ya.length); }catch(_){}
            if(!esta) throw rD.error;
          }
        }
          listo=true;
        }catch(eV){ ultimo=eV; await new Promise(r=>setTimeout(r,500)); }
      }
      if(!listo) throw ultimo;
    }catch(e2){
      let deshecho=false;
      if(idCobro){ try{ await escribirConReintento(()=> sb.from('mayoreo_caja').delete().eq('id', idCobro)); deshecho=true; }catch(_){} }
      if(!deshecho){
        try{ registrarError('mayoreo/cobro','El cobro quedó anotado en mayoreo pero el dinero NO llegó a su destino', etq+' $'+monto+' · '+String((e2&&e2.message)||e2)); }catch(_){}
        throw new Error('se cortó la conexión a mitad. El cobro quedó anotado en mayoreo pero NO llegó a '+etq+'. Mándame una foto de esto para corregirlo.');
      }
      throw new Error('se cortó la conexión y no se cobró nada. Inténtalo otra vez.');
    }
    alert('Cobrado. ✓');
    cargarGananciasMayoreo();
  }catch(e){ alert('No se pudo: '+(e.message||e)); }
}

async function cargarDineroMayoreo(){
  const cont=document.getElementById('mayDineroBody');
  if(!navigator.onLine){ cont.innerHTML='<div class="msg err">Necesitas internet.</div>'; return; }
  cont.textContent='Cargando…';
  try{
    const a=await acumuladoMayoreo();
    const alm=almacenMayoreo();
    let netoInv=0;
    if(alm){ (INVENTARIO||[]).filter(i=>i.almacen_id===alm.id).forEach(i=>{ const p=(PRODUCTOS||[]).find(x=>x.id===i.producto_id); netoInv += Number(i.cantidad||0)*Number((p&&p.costo_mayoreo)||0); }); }
    cont.innerHTML=`
    <div style="display:flex; gap:22px; flex-wrap:wrap; margin-bottom:14px">
      <div><div style="color:var(--muted);font-size:12px">Efectivo en caja (mayoreo)</div><div style="font-weight:800;font-size:24px;color:var(--green)">$${num(a.efectivo)}</div></div>
      <div><div style="color:var(--muted);font-size:12px">Neto del inventario (a costo)</div><div style="font-weight:800;font-size:24px">$${num(netoInv)}</div></div>
    </div>
    <div class="row">
      <div class="field"><label>Monto</label><input type="number" id="mayCajaMonto" inputmode="decimal" placeholder="0"></div>
      <div class="field"><label>Concepto (opcional)</label><input type="text" id="mayCajaConcepto" placeholder="ej: ajuste"></div>
    </div>
    <div class="row">
      <div class="field" style="display:flex;align-items:flex-end"><button style="width:100%; padding:12px 10px; font-weight:800; border-radius:12px; background:var(--green); color:#fff; border:2px solid var(--green)" onclick="movCajaMayoreo('ingreso')">⬇️ Entra dinero</button></div>
      <div class="field" style="display:flex;align-items:flex-end"><button style="width:100%; padding:12px 10px; font-weight:800; border-radius:12px; background:var(--red); color:#fff; border:2px solid var(--red)" onclick="movCajaMayoreo('egreso')">⬆️ Sale dinero</button></div>
    </div>
    <div id="mayCajaMsg" class="msg"></div>`;
  }catch(e){ cont.innerHTML='<div class="msg err">No se pudo: '+(e.message||e)+' (¿corriste mayoreo_caja.sql?)</div>'; }
}
async function movCajaMayoreo(tipo){
  const monto=Number(document.getElementById('mayCajaMonto').value);
  const concepto=(document.getElementById('mayCajaConcepto').value||'').trim();
  const msg=document.getElementById('mayCajaMsg');
  if(!monto||monto<=0){ msg.textContent='Pon un monto.'; msg.className='msg err'; return; }
  if(!navigator.onLine){ msg.textContent='Necesitas internet.'; msg.className='msg err'; return; }
  try{
    const r=await sb.from('mayoreo_caja').insert({tipo, monto, concepto: concepto||(tipo==='ingreso'?'Agregado a mano':'Sacado a mano')});
    if(r.error) throw r.error;
    cargarDineroMayoreo();
  }catch(e){ msg.textContent='No se pudo: '+(e.message||e); msg.className='msg err'; registrarError('mayoreo/caja', 'No se pudo agregar/sacar dinero del mayoreo', (e&&e.message)||String(e)); }
}
async function cargarClientesMayoreo(){
  const cont=document.getElementById('mayClientesBody');
  if(!navigator.onLine){ cont.innerHTML='<div class="msg err">Necesitas internet.</div>'; return; }
  cont.textContent='Cargando…';
  try{
    // Reservas (para compras + cumplimiento)
    const rows=[]; { let d=0; for(;;){ const r=await sb.from('reservas_mayoreo').select('*').order('id',{ascending:false}).range(d,d+999); if(r.error) throw r.error; rows.push(...(r.data||[])); if(!r.data||r.data.length<1000) break; d+=1000; } }
    // Cuentas registradas (por si alguno creó cuenta y no ha reservado)
    let cuentas=[]; try{ const r=await sb.from('clientes').select('*').limit(1000); cuentas=r.data||[]; }catch(e){ cuentas=[]; }
    const map={};
    cuentas.forEach(c=>{ const tel=(c.telefono||'').replace(/[^0-9]/g,''); if(!tel)return; map[tel]={tel, nombre:c.usuario||c.nombre||'', total:0, atend:0, novino:0, nueva:0, reservas:[]}; });
    rows.forEach(r=>{ const tel=(r.telefono||'').replace(/[^0-9]/g,'')||'(sin tel)'; if(!map[tel]) map[tel]={tel, nombre:r.nombre||'', total:0, atend:0, novino:0, nueva:0, reservas:[]}; if(r.nombre&&!map[tel].nombre)map[tel].nombre=r.nombre; const m=map[tel]; m.total++; if(r.estado==='atendida')m.atend++; else if(r.estado==='no_vino')m.novino++; else m.nueva++; m.reservas.push(r); });
    __clientesMay=Object.values(map).sort((a,b)=> b.novino-a.novino || b.total-a.total);
    renderClientes();
  }catch(e){ cont.innerHTML='<div class="msg err">No se pudo: '+(e.message||e)+' (¿corriste clientes.sql / reservas_mayoreo.sql?)</div>'; }
}
function renderClientes(){
  const cont=document.getElementById('mayClientesBody');
  const q=(document.getElementById('cliBuscar').value||'').trim().toLowerCase();
  let lista=__clientesMay;
  if(q) lista=lista.filter(c=>coincideNombre(c.nombre, q)||String(c.tel||'').includes(q));
  if(!lista.length){ cont.innerHTML='<div class="empty">Sin clientes.</div>'; return; }
  cont.innerHTML=lista.map((c,i)=>{
    const alerta = c.novino>0 ? `<span style="color:var(--red);font-weight:700">⚠ ${c.novino} no vino</span>` : `<span style="color:var(--green)">cumple</span>`;
    const compras=c.reservas.map(r=>{ const items=(Array.isArray(r.items)?r.items:[]).map(it=>`${it.nombre} ×${num(it.cantidad)}`).join(', '); const est=r.estado==='atendida'?'✓':r.estado==='no_vino'?'🚫':'⏳'; return `<div style="font-size:13px;border-top:1px solid var(--border);padding:6px 0">${est} ${(r.creado_en||'').slice(0,10)} · $${num(r.total)}<div style="color:var(--muted)">${items}</div></div>`; }).join('');
    return `<div style="border:1px solid var(--border);border-radius:12px;padding:12px;margin-bottom:10px">
      <div onclick="document.getElementById('cli-${i}').style.display=(document.getElementById('cli-${i}').style.display==='none'?'block':'none')" style="cursor:pointer;display:flex;justify-content:space-between;align-items:center;gap:8px">
        <div><b>${c.nombre||'(sin nombre)'}</b><div style="color:var(--muted);font-size:12px">${c.tel}</div></div>
        <div style="text-align:right;font-size:12px">${c.total} reserva(s)<br>${alerta}</div>
      </div>
      <div id="cli-${i}" style="display:none;margin-top:8px">
        <div style="font-size:12px;color:var(--muted)">✓ cumplió ${c.atend} · 🚫 no vino ${c.novino} · ⏳ pendiente ${c.nueva}</div>
        ${compras||'<div style="color:var(--muted);font-size:13px;margin-top:6px">Sin compras aún.</div>'}
      </div>
    </div>`;
  }).join('');
}
function copiarTexto(txt, ok){
  try{ navigator.clipboard.writeText(txt).then(()=>{ const e=document.getElementById('avisarMsgEstado'); if(e){e.textContent=ok||'Copiado'; e.className='msg ok';} }); }
  catch(_){ prompt('Copia esto:', txt); }
}
async function cargarAvisarMayoreo(){
  const cont=document.getElementById('avisarContactos');
  const ta=document.getElementById('avisarMsg');
  if(ta && !ta.value){ ta.value='🆕 ¡Llegó mercancía nueva a LOPE! Mira el catálogo y aparta tu pedido: '+LINK_TIENDA_AVISO; }
  if(!navigator.onLine){ cont.innerHTML='<div class="msg err">Necesitas internet para ver los contactos.</div>'; return; }
  cont.textContent='Cargando contactos…';
  try{
    const rows=[]; { let d=0; for(;;){ const r=await sb.from('reservas_mayoreo').select('nombre,telefono,creado_en').order('id',{ascending:false}).range(d,d+999); if(r.error) throw r.error; rows.push(...(r.data||[])); if(!r.data||r.data.length<1000) break; d+=1000; } }
    // Números únicos (el más reciente con su nombre)
    const vistos={}; const contactos=[];
    rows.forEach(r=>{ const tel=(r.telefono||'').replace(/[^0-9]/g,''); if(!tel) return; if(vistos[tel]) return; vistos[tel]=1; contactos.push({tel, nombre:r.nombre||''}); });
    __avisarNumeros = contactos.map(c=>c.tel);
    if(!contactos.length){ cont.innerHTML='<div class="empty">Todavía no hay teléfonos (aparecen cuando los clientes reservan en la web).</div>'; return; }
    cont.innerHTML='<div style="color:var(--muted);font-size:12px;margin-bottom:6px">'+contactos.length+' contacto(s):</div>'+contactos.map(c=>{
      return `<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;border-bottom:1px solid var(--border);padding:10px 2px">
        <div><b>${c.nombre||'(sin nombre)'}</b><div style="color:var(--muted);font-size:12px">${c.tel}</div></div>
        <button class="primary" style="padding:8px 14px;font-size:13px" onclick="enviarAvisoUno('${c.tel}')">💬 Enviar</button>
      </div>`;
    }).join('');
  }catch(e){ cont.innerHTML='<div class="msg err">No se pudo: '+(e.message||e)+'</div>'; }
}
function enviarAvisoUno(tel){
  const msg=encodeURIComponent(document.getElementById('avisarMsg').value||'');
  window.open('https://wa.me/'+tel+'?text='+msg, '_blank');
}
function copiarNumerosAvisar(){
  if(!__avisarNumeros.length){ alert('No hay números.'); return; }
  copiarTexto(__avisarNumeros.join(', '), __avisarNumeros.length+' números copiados');
}
async function ponerNovedadesAvisar(){
  const ta=document.getElementById('avisarMsg'); const est=document.getElementById('avisarMsgEstado');
  if(!navigator.onLine){ est.textContent='Necesitas internet.'; est.className='msg err'; return; }
  try{
    const desde=new Date(); desde.setDate(desde.getDate()-7);
    const iso=desde.toISOString();
    const {data,error}=await sb.from('mayoreo_movimientos').select('nombre,tipo,creado_en').eq('tipo','ingreso').gte('creado_en',iso).order('id',{ascending:false}).limit(500);
    if(error) throw error;
    const nombres=[...new Set((data||[]).map(m=>m.nombre).filter(Boolean))].slice(0,30);
    if(!nombres.length){ est.textContent='No hay ingresos nuevos en los últimos 7 días.'; est.className='msg'; return; }
    ta.value='🆕 ¡Llegó a LOPE!\n• '+nombres.join('\n• ')+'\n\nMira el catálogo y aparta: '+LINK_TIENDA_AVISO;
    est.textContent='Puse '+nombres.length+' producto(s) nuevos.'; est.className='msg ok';
  }catch(e){ est.textContent='No se pudo: '+(e.message||e)+' (¿corriste mayoreo_movimientos.sql?)'; est.className='msg err'; }
}

// Formatea la cita (fecha+hora) para mostrarla bonita.
function fmtCita(v){
  if(!v) return '';
  try{ const d=new Date(v); if(isNaN(d.getTime())) return v;
    return d.toLocaleString('es',{weekday:'short',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
  }catch(_){ return v; }
}
// El admin le pone (o cambia) fecha y hora de recogida a una reserva; el cliente la ve en el catálogo.
async function guardarCitaReserva(id){
  const inp=document.getElementById('cita-'+id); if(!inp) return;
  const val=inp.value; // "2026-09-20T15:00" o ''
  if(!navigator.onLine){ alert('Necesitas internet.'); return; }
  try{
    const {error}=await sb.from('reservas_mayoreo').update({cita: val||null}).eq('id',id); if(error) throw error;
    alert(val? ('Cita guardada: '+fmtCita(val)) : 'Cita borrada.');
    cargarReservasMayoreo();
  }catch(e){ alert('No se pudo: '+(e.message||e)); registrarError('mayoreo/reservas','No se pudo guardar la cita',(e&&e.message)||String(e)); }
}
async function cargarReservasMayoreo(){
  const cont=document.getElementById('mayReservasBody');
  if(!navigator.onLine){ cont.innerHTML='<div class="msg err">Necesitas internet.</div>'; return; }
  cont.textContent='Cargando…';
  try{
    const {data,error}=await sb.from('reservas_mayoreo').select('*').order('id',{ascending:false}).limit(100);
    if(error) throw error;
    const nuevas=(data||[]).filter(r=>r.estado==='nueva');
    __reservasMay={}; nuevas.forEach(r=>{ __reservasMay[r.id]=r; });
    if(!nuevas.length){ cont.innerHTML='<div class="empty">No hay reservas nuevas.</div>'; return; }
    cont.innerHTML=nuevas.map(r=>{
      const items=Array.isArray(r.items)?r.items:[];
      const tel=(r.telefono||'').replace(/[^0-9]/g,'');
      const wa=tel?`<a class="ghost" style="display:inline-block;padding:8px 12px;border:1px solid var(--border);border-radius:8px;text-decoration:none;font-size:13px" href="https://wa.me/${tel}" target="_blank">💬 WhatsApp</a>`:'';
      return `<div style="border:2px solid var(--amber);border-radius:12px;padding:12px;margin-bottom:10px">
        <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap"><b>${r.nombre||'(sin nombre)'}</b><span style="color:var(--muted);font-size:12px">${(r.creado_en||'').slice(0,16).replace('T',' ')}</span></div>
        <div style="color:var(--muted);font-size:13px;margin:4px 0">📞 ${r.telefono||'—'} · total aprox $${num(r.total)}</div>
        <div style="font-size:14px;margin:6px 0">${items.map(it=>`${it.nombre} <b>×${num(it.cantidad)}</b>`).join('<br>')}</div>
        <div style="margin:8px 0;padding:9px;background:#f6f7f9;border-radius:9px">
          <div style="font-size:12px;color:var(--muted);margin-bottom:5px">📅 Fecha y hora de recogida (la ve el cliente):</div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
            <input type="datetime-local" id="cita-${r.id}" value="${(r.cita||'').slice(0,16)}" style="flex:1;min-width:160px;padding:8px;border:1px solid var(--border);border-radius:8px;font-family:inherit;font-size:13px">
            <button class="primary" style="padding:8px 12px;font-size:13px" onclick="guardarCitaReserva(${r.id})">Guardar cita</button>
          </div>
          ${r.cita?`<div style="font-size:12px;color:#0a7d33;margin-top:5px">✓ Cita: ${fmtCita(r.cita)}</div>`:'<div style="font-size:12px;color:var(--muted);margin-top:5px">Sin cita todavía</div>'}
        </div>
        <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap">
          <button class="primary" style="padding:8px 12px;font-size:13px" onclick="venderReservaMayoreo(${r.id})">🛒 Vender</button>
          ${wa}
          <button class="ghost" style="padding:8px 12px;font-size:13px" onclick="marcarReservaAtendida(${r.id})">✓ Atendida</button>
          <button class="ghost" style="padding:8px 12px;font-size:13px;color:var(--amber)" onclick="marcarReservaNoVino(${r.id})">🚫 No vino</button>
          <button class="ghost" style="padding:8px 12px;font-size:13px;color:var(--red)" onclick="quitarReservaMayoreo(${r.id})">🗑 Quitar</button>
        </div>
      </div>`;
    }).join('');
  }catch(e){ cont.innerHTML='<div class="msg err">No se pudo: '+(e.message||e)+' (¿corriste reservas_mayoreo.sql?)</div>'; }
}
// Carga la reserva en el carrito de Vender (usa el precio de mayoreo actual del producto).
function venderReservaMayoreo(id){
  const r=__reservasMay[id]; if(!r) return;
  const items=Array.isArray(r.items)?r.items:[];
  const alm=almacenMayoreo();
  if(!alm){ alert('Falta el almacén MAYOREO.'); return; }
  const stockDe=pid=>(INVENTARIO||[]).filter(i=>i.almacen_id===alm.id&&i.producto_id===pid).reduce((s,i)=>s+Number(i.cantidad||0),0);
  __mayCarrito=[];
  let avisos=[];
  items.forEach(it=>{
    const p=(PRODUCTOS||[]).find(x=>x.id===it.producto_id);
    if(!p){ avisos.push('"'+it.nombre+'" ya no existe'); return; }
    let cant=Number(it.cantidad)||0;
    const hay=stockDe(p.id);
    if(cant>hay){ avisos.push('de "'+p.nombre+'" solo hay '+num(hay)+' (pedía '+num(cant)+')'); cant=hay; }
    if(cant<=0) return;
    __mayCarrito.push({producto_id:p.id, nombre:p.nombre, cantidad:cant, precio:Number(p.precio_mayoreo||it.precio||0), costo:Number(p.costo_mayoreo||0)});
  });
  __reservaEnVenta=id; // recordar cuál reserva se está cobrando (para marcarla atendida al cobrar)
  cambiarMTab('vender');
  renderMayCarrito();
  if(avisos.length) alert('Aviso: '+avisos.join(', ')+'.');
}
async function quitarReservaMayoreo(id){
  if(!confirm('¿Quitar esta reserva? Se elimina de la lista.')) return;
  if(!navigator.onLine){ alert('Necesitas internet.'); return; }
  try{ const {error}=await sb.from('reservas_mayoreo').delete().eq('id',id); if(error) throw error; cargarReservasMayoreo(); }
  catch(e){ alert('No se pudo: '+(e.message||e)); }
}
async function marcarReservaNoVino(id){
  if(!confirm('¿Marcar que este cliente NO vino? Se libera el stock y queda en su historial.')) return;
  if(!navigator.onLine){ alert('Necesitas internet.'); return; }
  try{ const {error}=await sb.from('reservas_mayoreo').update({estado:'no_vino'}).eq('id',id); if(error) throw error; cargarReservasMayoreo(); }
  catch(e){ alert('No se pudo: '+(e.message||e)); }
}
// Cumplimiento por cliente (para saber si queda bien con las reservas)
async function verCumplimientoClientes(){
  const cont=document.getElementById('mayCumplBody');
  if(!navigator.onLine){ cont.innerHTML='<div class="msg err">Necesitas internet.</div>'; return; }
  cont.textContent='Cargando…';
  try{
    const rows=[]; { let d=0; for(;;){ const r=await sb.from('reservas_mayoreo').select('nombre,telefono,estado').order('id',{ascending:false}).range(d,d+999); if(r.error) throw r.error; rows.push(...(r.data||[])); if(!r.data||r.data.length<1000) break; d+=1000; } }
    const map={};
    rows.forEach(r=>{ const tel=(r.telefono||'').replace(/[^0-9]/g,'')||'(sin tel)'; if(!map[tel]) map[tel]={nombre:r.nombre||'', tel, total:0, atend:0, novino:0, nueva:0}; map[tel].total++; if(r.estado==='atendida')map[tel].atend++; else if(r.estado==='no_vino')map[tel].novino++; else map[tel].nueva++; if(r.nombre) map[tel].nombre=r.nombre; });
    const lista=Object.values(map).sort((a,b)=>b.novino-a.novino || b.total-a.total);
    if(!lista.length){ cont.innerHTML='<div class="empty">Sin clientes todavía.</div>'; return; }
    cont.innerHTML=`<table style="min-width:520px"><thead><tr><th>Cliente</th><th class="numcell">Reservas</th><th class="numcell">Cumplió</th><th class="numcell">No vino</th></tr></thead><tbody>
    ${lista.map(c=>`<tr>
      <td>${c.nombre||'(sin nombre)'}<div style="color:var(--muted);font-size:12px">${c.tel}</div></td>
      <td class="numcell">${c.total}</td>
      <td class="numcell" style="color:var(--green);font-weight:700">${c.atend}</td>
      <td class="numcell" style="color:${c.novino>0?'var(--red)':'var(--muted)'};font-weight:700">${c.novino}</td>
    </tr>`).join('')}
    </tbody></table>`;
  }catch(e){ cont.innerHTML='<div class="msg err">No se pudo: '+(e.message||e)+'</div>'; }
}
async function marcarReservaAtendida(id){
  if(!navigator.onLine){ alert('Necesitas internet.'); return; }
  try{ const {error}=await sb.from('reservas_mayoreo').update({estado:'atendida'}).eq('id',id); if(error) throw error; cargarReservasMayoreo(); }
  catch(e){ alert('No se pudo: '+(e.message||e)); }
}

// ----- HISTORIAL -----
function cambiarHTab(cual){
  ['dinero','ventas','productos'].forEach(t=>{
    const el=document.getElementById('htab-'+t); if(el) el.style.display=(t===cual)?'block':'none';
    const b=document.getElementById('htab-btn-'+t); if(b) b.classList.toggle('active', t===cual);
  });
  if(cual==='dinero') cargarHistDineroMayoreo();
  if(cual==='ventas') cargarHistorialMayoreo();
  if(cual==='productos') cargarHistProdMayoreo();
}

// Historial de DINERO del mayoreo: entradas por ventas + (más adelante) cobros/agregar/sacar.
async function cargarHistDineroMayoreo(){
  const cont=document.getElementById('mayHistDineroBody');
  if(!navigator.onLine){ cont.innerHTML='<div class="msg err">Necesitas internet.</div>'; return; }
  cont.textContent='Cargando…';
  try{
    const ventas=[]; { let d=0; for(;;){ const r=await sb.from('ventas_mayoreo').select('fecha,total,creado_en').order('id',{ascending:false}).range(d,d+999); if(r.error) throw r.error; ventas.push(...(r.data||[])); if(!r.data||r.data.length<1000) break; d+=1000; } }
    let movs=[]; try{ let d=0; for(;;){ const r=await sb.from('mayoreo_caja').select('*').order('id',{ascending:false}).range(d,d+999); if(r.error) throw r.error; movs.push(...(r.data||[])); if(!r.data||r.data.length<1000) break; d+=1000; } }catch(e){ movs=[]; }
    const filas=[];
    ventas.forEach(v=>filas.push({fecha:(v.creado_en||v.fecha||'').slice(0,16).replace('T',' '), concepto:'Venta', signo:1, monto:Number(v.total||0)}));
    movs.forEach(m=>filas.push({fecha:(m.creado_en||'').slice(0,16).replace('T',' '), concepto:m.concepto||m.tipo, signo:(m.tipo==='ingreso'?1:-1), monto:Number(m.monto||0)}));
    filas.sort((a,b)=>String(b.fecha).localeCompare(String(a.fecha)));
    if(!filas.length){ cont.innerHTML='<div class="empty">Sin movimientos de dinero todavía.</div>'; return; }
    cont.innerHTML=`<table style="min-width:520px"><thead><tr><th>Fecha</th><th>Concepto</th><th class="numcell">Monto</th></tr></thead><tbody>
    ${filas.slice(0,200).map(f=>`<tr><td>${f.fecha}</td><td>${f.concepto}</td><td class="numcell" style="color:${f.signo>0?'var(--green)':'var(--red)'};font-weight:700">${f.signo>0?'+':'−'}$${num(f.monto)}</td></tr>`).join('')}
    </tbody></table>`;
  }catch(e){ cont.innerHTML='<div class="msg err">No se pudo: '+(e.message||e)+'</div>'; }
}

// Historial de PRODUCTOS: cuánto se ha vendido de cada producto en mayoreo.
async function cargarHistProdMayoreo(){
  const cont=document.getElementById('mayHistProdBody');
  if(!navigator.onLine){ cont.innerHTML='<div class="msg err">Necesitas internet.</div>'; return; }
  cont.textContent='Cargando…';
  try{
    const movs=[]; { let d=0; for(;;){ const r=await sb.from('mayoreo_movimientos').select('*').order('id',{ascending:false}).range(d,d+999); if(r.error) throw r.error; movs.push(...(r.data||[])); if(!r.data||r.data.length<1000) break; d+=1000; if(d>=4000) break; } }
    if(!movs.length){ cont.innerHTML='<div class="empty">Sin movimientos de mercancía todavía. (Ingresa/extrae en Productos o vende, y correr mayoreo_movimientos.sql.)</div>'; return; }
    const etiqueta=t=> t==='ingreso'?'<span class="badge ingreso">ingreso</span>' : t==='venta'?'<span class="badge traslado">venta</span>' : '<span class="badge extraccion">extracción</span>';
    cont.innerHTML=`<table style="min-width:520px"><thead><tr><th>Fecha</th><th>Tipo</th><th>Producto</th><th class="numcell">Cant.</th><th class="numcell">Antes→Después</th></tr></thead><tbody>
    ${movs.slice(0,300).map(m=>{ const signo=m.tipo==='ingreso'?'+':'−'; return `<tr>
      <td style="font-size:12px">${(m.creado_en||'').slice(0,16).replace('T',' ')}</td>
      <td>${etiqueta(m.tipo)}</td>
      <td>${m.nombre||('#'+m.producto_id)}</td>
      <td class="numcell" style="font-weight:700">${signo}${num(m.cantidad)}</td>
      <td class="numcell">${celdaAntesDespues(m)}</td>
    </tr>`; }).join('')}
    </tbody></table>`;
  }catch(e){ cont.innerHTML='<div class="msg err">No se pudo: '+(e.message||e)+' (¿corriste mayoreo_movimientos.sql?)</div>'; }
}

async function cargarHistorialMayoreo(){
  const cont=document.getElementById('mayHistorialBody');
  if(!navigator.onLine){ cont.innerHTML='<div class="msg err">Necesitas internet.</div>'; return; }
  cont.textContent='Cargando…';
  try{
    const {data,error}=await sb.from('ventas_mayoreo').select('*').order('id',{ascending:false}).limit(100);
    if(error) throw error;
    if(!data||!data.length){ cont.innerHTML='<div class="empty">Sin ventas de mayoreo todavía.</div>'; return; }
    cont.innerHTML=data.map((v,idx)=>{
      const items=Array.isArray(v.items)?v.items:[];
      return `<div style="border:1px solid var(--border);border-radius:10px;padding:10px;margin-bottom:8px">
        <div onclick="document.getElementById('mayHv-${idx}').style.display=(document.getElementById('mayHv-${idx}').style.display==='none'?'block':'none')" style="display:flex;justify-content:space-between;align-items:center;cursor:pointer;gap:8px">
          <div><b>${v.fecha}</b> <span style="color:var(--muted);font-size:12px">· ${items.length} artículo(s) · ${v.usuario||''}</span></div>
          <span style="color:var(--green);font-weight:700">$${num(v.total)}</span>
        </div>
        <div id="mayHv-${idx}" style="display:none;margin-top:8px;border-top:1px solid var(--border);padding-top:8px">
          <div style="color:var(--muted);font-size:12px;margin-bottom:6px">Ganancia $${num(v.ganancia)}</div>
          <table style="min-width:520px"><thead><tr><th>Producto</th><th class="numcell">Cant.</th><th class="numcell">Precio</th><th class="numcell">Subtotal</th></tr></thead><tbody>
          ${items.map(it=>`<tr><td>${it.nombre}</td><td class="numcell">${num(it.cantidad)}</td><td class="numcell">$${num(it.precio)}</td><td class="numcell">$${num(it.cantidad*it.precio)}</td></tr>`).join('')}
          </tbody></table>
        </div>
      </div>`;
    }).join('');
  }catch(e){ cont.innerHTML='<div class="msg err">No se pudo: '+(e.message||e)+'</div>'; }
}
