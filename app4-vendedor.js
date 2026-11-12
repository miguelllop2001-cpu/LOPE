// LOPE · Mi Negocio — Pantalla del vendedor: venta del día, carrito, pedidos, cobros, devoluciones y finalizar
// (Este archivo solo tiene funciones. Lo que se ejecuta al abrir la app está en app8-arranque.js)

 // true justo después de finalizar un día, para abrir el siguiente EN BLANCO

// ---------- ALMACENAMIENTO LOCAL (para trabajar sin internet) ----------
function lsGet(key, fallback){
  try{ const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
  catch(e){ return fallback; }
}
function lsSet(key, val){
  try{ localStorage.setItem(key, JSON.stringify(val)); }catch(e){ console.error(e); }
}

function actualizarConexionUI(){
  const dias = lsGet('vt_pending_days', []);
  const pedidos = lsGet('vt_pending_pedidos', []);
  const devq = lsGet('vt_pending_devoluciones', []);
  const pendTotal = dias.length + pedidos.length + devq.length;
  const pill = document.getElementById('connPill');
  if(navigator.onLine){
    pill.textContent = pendTotal>0 ? `🟡 En línea · sincronizando ${pendTotal}` : '🟢 En línea';
    pill.style.color = pendTotal>0 ? 'var(--amber)' : 'var(--green)';
  } else {
    pill.textContent = pendTotal>0 ? `🔴 Sin conexión · ${pendTotal} por sincronizar` : '🔴 Sin conexión';
    pill.style.color = 'var(--red)';
  }

  pintarPillPendientes();   // el numerito cuenta TODO lo pendiente, no solo estas colas

  const debugBar = document.getElementById('syncDebugBar');
  const debugMsg = document.getElementById('syncDebugMsg');
  const conError = [...dias, ...pedidos, ...devq].filter(x=>x._ultimoError);
  const trabados = conError.filter(x => (x._intentos || 0) >= 3);
  if(navigator.onLine && conError.length>0){
    debugBar.style.display = 'block';
    if(trabados.length > 0){
      debugMsg.innerHTML = `🚨 <strong>¡ATENCIÓN!</strong> ${trabados.length} venta(s)/pedido(s) llevan varios intentos sin poder registrarse. Esto puede significar mercancía vendida que NO se descontó. Toca "Ver qué está pendiente" y avísale al dueño. Último error: "${conError[0]._ultimoError}"`;
    } else {
      debugMsg.textContent = `⚠️ ${conError.length} elemento(s) no se han podido sincronizar aún. Último error: "${conError[0]._ultimoError}"`;
    }
  } else {
    debugBar.style.display = 'none';
  }
}

function verDetallePendientes(){
  const dias = lsGet('vt_pending_days', []);
  const pedidos = lsGet('vt_pending_pedidos', []);
  const devq = lsGet('vt_pending_devoluciones', []);
  if(dias.length===0 && pedidos.length===0 && devq.length===0){
    abrirModalInfo('Pendientes por subir', '<div style="color:var(--muted)">No hay nada pendiente. Todo está sincronizado. ✓</div>');
    return;
  }
  let html = '';
  dias.forEach((d,i)=>{
    const arts = (d.items||[]).map(it=>`${it.nombre} ×${num(it.cantidad)}`).join(', ');
    html += tarjetaPendiente(`Venta #${i+1}`, `${d.almacen_nombre} · ${d.fecha}`, `Total: $${num(d.total)}`, arts, d._ultimoError, d._faltantes, d._intentos);
  });
  pedidos.forEach((p,i)=>{
    const prod = PRODUCTOS.find(pr=>pr.id===p.producto_id);
    html += tarjetaPendiente(`Pedido #${i+1}`, (prod?prod.nombre:('producto '+p.producto_id)), `Cantidad: ${num(p.cantidad)}`, '', p._ultimoError, null, p._intentos);
  });
  devq.forEach((d,i)=>{
    html += tarjetaPendiente(`Devolución #${i+1}`, `${d.nombre} ×${num(d.cantidad)}`, `Devolver $${num(d.cantidad*d.precio_venta)} (${d.metodo})`, '', d._ultimoError, null, d._intentos);
  });
  html += '<div style="color:var(--muted); font-size:12px; margin-top:2px">No se perdió nada: se subirá solo cuando haya buena conexión.</div>';
  abrirModalInfo('Pendientes por subir', html);
}

function descartarPendienteAtascado(){
  const dias = lsGet('vt_pending_days', []);
  const pedidos = lsGet('vt_pending_pedidos', []);
  if(dias.length===0 && pedidos.length===0){ alert('No hay nada pendiente.'); return; }
  if(!confirm('Esto borra PERMANENTEMENTE el primer elemento pendiente en la cola (la venta o pedido más antiguo sin sincronizar). Usa "Ver qué está pendiente" primero para saber cuál es. ¿Continuar?')) return;
  if(dias.length>0){ dias.shift(); lsSet('vt_pending_days', dias); }
  else { pedidos.shift(); lsSet('vt_pending_pedidos', pedidos); }
  actualizarConexionUI();
}

async function cargarCatalogoVentas(){
  if(!navigator.onLine){
    ALMACENES = lsGet('vt_cache_almacenes', []);
    PRODUCTOS = lsGet('vt_cache_productos', []);
    statusEl.textContent = `Sin conexión · usando datos guardados (${ALMACENES.length} puestos · ${PRODUCTOS.length} productos)`;
    actualizarConexionUI();
    return;
  }
  try{
    // Traer TODO paginando (sin paginar, Supabase corta en 1000 → faltarían productos al vendedor).
    const traerTablaCompleta = async (tabla)=>{
      const PAGE=1000; let desde=0; const acc=[];
      for(;;){
        const {data, error} = await sb.from(tabla).select('*').order('id',{ascending:true}).range(desde, desde+PAGE-1);
        if(error) throw error;
        acc.push(...(data||[]));
        if(!data || data.length<PAGE) break;
        desde += PAGE;
      }
      return acc;
    };
    const [alm, prod] = await Promise.all([
      traerTablaCompleta('almacenes'),
      traerTablaCompleta('productos')
    ]);
    ALMACENES = (alm||[]).sort((a,b)=>(a.nombre||'').localeCompare(b.nombre||''));
    PRODUCTOS = (prod||[]).sort((a,b)=>(a.nombre||'').localeCompare(b.nombre||''));
    lsSet('vt_cache_almacenes', ALMACENES);
    lsSet('vt_cache_productos', PRODUCTOS);
    statusEl.textContent = `Conectado · ${ALMACENES.length} puestos · ${PRODUCTOS.length} productos`;
    actualizarConexionUI();
    sincronizarPendientes();
  }catch(err){
    ALMACENES = lsGet('vt_cache_almacenes', []);
    PRODUCTOS = lsGet('vt_cache_productos', []);
    statusEl.textContent = `Sin conexión · usando datos guardados (${ALMACENES.length} puestos · ${PRODUCTOS.length} productos)`;
    actualizarConexionUI();
    console.error(err);
  }
}

async function abrirPanelVenta(){
  document.getElementById('puestoActualLabel').textContent = 'Puesto: ' + puestoActual.nombre;
  // No vaciamos el carrito aquí: buscarOAbrirVentaDia() se encarga de cargar
  // lo que corresponda (de la base de datos o del respaldo guardado en el teléfono).
  await buscarOAbrirVentaDia();
  await cargarHistorialDias();
  await cargarMiInventario();
  await cargarMisPedidos();
  // Si alcanzó a tocar una pestaña mientras cargaba el puesto, quedó el aviso de "un momento".
  // Ya hay puesto: la cargamos sola, sin que tenga que volver a tocar.
  try{
    const pend=document.getElementById('avisoSinPuesto');
    if(pend){
      const cont=pend.closest('.vtab');
      const id=(cont&&cont.id&&cont.id.indexOf('vtab-')===0) ? cont.id.slice(5) : null;
      pend.remove();
      document.querySelectorAll('.vtab').forEach(el=>{ delete el.dataset.avisoPuesto; });
      if(id) cambiarVTab(id);
    }
  }catch(e){}
}
function cambiarVTab(tab){
  document.querySelectorAll('.tabs button[data-vtab]').forEach(b=>b.classList.toggle('active', b.dataset.vtab===tab));
  document.querySelectorAll('.vtab').forEach(v=>v.style.display='none');
  document.getElementById('vtab-'+tab).style.display='block';
  actualizarBotonVentaHeader(tab);
  cerrarMenu();
  // El menú aparece ANTES de que termine de cargarse el puesto (se espera a la red y, si
  // es comodín, a que elija en cuál trabaja). Si tocan una pestaña en esos segundos, el
  // puesto todavía no existe: no cargamos nada y avisamos, en vez de colgar la app.
  if(!puestoActual){
    const av=document.getElementById('vtab-'+tab);
    if(av && !av.dataset.avisoPuesto){
      av.insertAdjacentHTML('afterbegin','<div class="msg" id="avisoSinPuesto" style="margin:10px 0">⏳ Un momento: todavía se está cargando tu puesto. Vuelve a tocar esta pestaña en unos segundos.</div>');
      av.dataset.avisoPuesto='1';
    }
    return;
  }
  { const a=document.getElementById('avisoSinPuesto'); if(a) a.remove(); }
  if(tab==='inventario'){ cargarMiInventario(); }
  if(tab==='pedir'){ cargarMisPedidos(); cargarSugerenciasPedido(); }
  if(tab==='recepcion'){ cargarRecepcionesHoy(); }
  if(tab==='cobrar'){ cargarCobros(); }
  if(tab==='devoluciones'){ cargarDevolucionesTab(); }
  if(tab==='historial'){ cargarHistorialDias(); cargarMercanciaRecibida(); }
  if(tab==='mayoreo'){ cambiarVMTab('vender'); }
}
async function tvCargarStockMayoreo(){
  const alm=await asegurarAlmacenMayoreo();
  if(!alm){ __tvStockMayoreo=null; return; }
  if(!navigator.onLine){ /* sin internet: se queda con lo último que tenga */ return; }
  // 1) Vía función PROTEGIDA (stock_mayoreo): funciona aunque la cuenta de la
  //    vendedora no tenga permiso directo de leer el almacén MAYOREO.
  try{
    const mapa={}; const PAGE=1000; let desde=0; let ok=false;
    for(;;){
      const r=await sb.rpc('stock_mayoreo',{p_almacen:alm.id}).range(desde, desde+PAGE-1);
      if(r.error || !Array.isArray(r.data)) break;
      ok=true;
      r.data.forEach(row=>{ mapa[row.producto_id]=(mapa[row.producto_id]||0)+Number(row.cantidad||0); });
      if(r.data.length < PAGE) break;
      desde += PAGE;
    }
    if(ok){ __tvStockMayoreo=mapa; return; }
  }catch(e){ /* si la función no está, cae al respaldo */ }
  // 2) Respaldo: lectura directa (si aún no se instaló la función o RLS está abierto).
  try{
    const mapa={}; const PAGE=1000; let desde=0;
    for(;;){
      const r=await sb.from('inventario').select('producto_id, cantidad').eq('almacen_id', alm.id).order('id',{ascending:true}).range(desde, desde+PAGE-1);
      if(r.error || !r.data) break;
      r.data.forEach(row=>{ mapa[row.producto_id]=(mapa[row.producto_id]||0)+Number(row.cantidad||0); });
      if(r.data.length < PAGE) break;
      desde += PAGE;
    }
    __tvStockMayoreo=mapa;
  }catch(e){ /* si falla, tvStockDe cae a INVENTARIO */ }
}
// Stock de un producto en MAYOREO: usa el mapa fresco si existe; si no, cae a INVENTARIO.
function tvStockDe(pid){
  if(__tvStockMayoreo){ return Number(__tvStockMayoreo[pid]||0); }
  const alm=almacenMayoreo();
  if(!alm) return 0;
  return (INVENTARIO||[]).filter(i=>i.almacen_id===alm.id&&i.producto_id===pid).reduce((s,i)=>s+Number(i.cantidad||0),0);
}
function cambiarVMTab(cual){
  document.getElementById('vmt-vender').style.display = cual==='vender'?'block':'none';
  document.getElementById('vmt-reservas').style.display = cual==='reservas'?'block':'none';
  const bv=document.getElementById('vmt-btn-vender'), br=document.getElementById('vmt-btn-reservas');
  if(bv) bv.classList.toggle('active', cual==='vender');
  if(br) br.classList.toggle('active', cual==='reservas');
  // Asegura el almacén MAYOREO (la cuenta de la vendedora no siempre lo tiene cargado) y
  // luego refresca el stock; re-pinta cuando llega.
  asegurarAlmacenMayoreo().then(()=>tvCargarStockMayoreo()).then(()=>{ try{ if(cual==='vender'){ tvPreparar(); tvRenderCarrito(); } }catch(e){} });
  if(cual==='vender') tvPreparar();
  if(cual==='reservas') tvCargarReservas();
}
function tvPreparar(){
  const av=document.getElementById('tvAviso');
  if(!almacenMayoreo()){ av.innerHTML='⚠️ Falta el almacén MAYOREO (que lo cree el dueño).'; av.className='msg err'; }
  else { av.textContent=''; av.className='msg'; }
  document.getElementById('tvBuscar').value=''; document.getElementById('tvProd').value='';
  document.getElementById('tvElegido').textContent=''; document.getElementById('tvSug').style.display='none';
  document.getElementById('tvCant').value=''; document.getElementById('tvPrecio').value='';
  tvRenderCarrito();
}
function tvFiltrar(){
  const q=(document.getElementById('tvBuscar').value||'').trim().toLowerCase();
  const cont=document.getElementById('tvSug');
  document.getElementById('tvProd').value=''; document.getElementById('tvElegido').textContent='';
  const alm=almacenMayoreo();
  if(q.length<1||!alm){ cont.style.display='none'; cont.innerHTML=''; return; }
  const m=(PRODUCTOS||[]).filter(p=>coincideNombre(p.nombre, q)).sort((a,b)=>a.nombre.localeCompare(b.nombre)).slice(0,15);
  if(!m.length){ cont.style.display='block'; cont.innerHTML='<div style="padding:10px;color:var(--muted)">Sin coincidencias.</div>'; return; }
  cont.innerHTML=m.map(p=>{ const h=tvStockDe(p.id); return `<div onclick="tvElegir(${p.id})" style="padding:12px;border-bottom:1px solid var(--border);cursor:pointer">${p.nombre} <span style="color:${h>0?'var(--green)':'var(--muted)'};font-size:13px">· hay ${num(h)}</span></div>`; }).join('');
  cont.style.display='block';
}
function tvElegir(id){
  const p=(PRODUCTOS||[]).find(x=>x.id===id); if(!p) return;
  document.getElementById('tvProd').value=id;
  document.getElementById('tvBuscar').value=p.nombre;
  document.getElementById('tvElegido').textContent='✓ '+p.nombre;
  document.getElementById('tvSug').style.display='none';
  document.getElementById('tvPrecio').value=Number(p.precio_mayoreo||0);
  const c=document.getElementById('tvCant'); if(c&&!c.value) c.value=1;
}
function tvAgregar(){
  const pid=Number(document.getElementById('tvProd').value);
  const cant=Number(document.getElementById('tvCant').value);
  const precio=Number(document.getElementById('tvPrecio').value);
  const p=(PRODUCTOS||[]).find(x=>x.id===pid);
  if(!p){ alert('Elige un producto.'); return; }
  if(!cant||cant<=0){ alert('Pon una cantidad.'); return; }
  if(isNaN(precio)||precio<0){ alert('Precio no válido.'); return; }
  const alm=almacenMayoreo();
  if(!alm){ alert('Falta el almacén MAYOREO.'); return; }
  const stock=tvStockDe(pid);
  const ya=__tvCarrito.filter(x=>x.producto_id===pid).reduce((s,x)=>s+x.cantidad,0);
  if(cant+ya>stock){ alert('No hay tanto. Hay '+num(stock)+' y ya llevas '+num(ya)+'.'); return; }
  __tvCarrito.push({producto_id:pid, nombre:p.nombre, cantidad:cant, precio, costo:Number(p.costo_mayoreo||0)});
  document.getElementById('tvBuscar').value=''; document.getElementById('tvProd').value='';
  document.getElementById('tvElegido').textContent=''; document.getElementById('tvCant').value=''; document.getElementById('tvPrecio').value='';
  tvRenderCarrito();
}
function tvQuitar(i){ __tvCarrito.splice(i,1); tvRenderCarrito(); }
function tvRenderCarrito(){
  const cont=document.getElementById('tvCarritoBody'); const btn=document.getElementById('tvFinalizar');
  if(!__tvCarrito.length){ cont.innerHTML='<div class="empty">Carrito vacío.</div>'; btn.style.display='none'; return; }
  const total=__tvCarrito.reduce((s,x)=>s+x.cantidad*x.precio,0);
  cont.innerHTML=`<table style="min-width:480px"><thead><tr><th>Producto</th><th class="numcell">Cant.</th><th class="numcell">Precio</th><th class="numcell">Subtotal</th><th></th></tr></thead><tbody>
  ${__tvCarrito.map((x,i)=>`<tr><td>${x.nombre}</td><td class="numcell">${num(x.cantidad)}</td><td class="numcell">$${num(x.precio)}</td><td class="numcell">$${num(x.cantidad*x.precio)}</td><td><button class="ghost" onclick="tvQuitar(${i})">✕</button></td></tr>`).join('')}
  </tbody><tfoot><tr><td colspan="3" style="text-align:right;font-weight:700">TOTAL</td><td class="numcell" style="font-weight:800;color:var(--green)">$${num(total)}</td><td></td></tr></tfoot></table>`;
  btn.style.display='block';
}
async function tvVender(){
  if(!__tvCarrito.length) return;
  const total=__tvCarrito.reduce((s,x)=>s+x.cantidad*x.precio,0);
  if(!confirm('Cobrar venta de mayoreo por $'+num(total)+'.\n\n¿Confirmar?')) return;
  const btn=document.getElementById('tvFinalizar'); btn.disabled=true; btn.textContent='Cobrando…';
  try{
    await procesarVentaMayoreo(__tvCarrito, __tvReservaEnVenta); __tvReservaEnVenta=null;
    __tvCarrito=[]; tvRenderCarrito();
    alert(navigator.onLine ? 'Venta cobrada. ✓' : 'Venta guardada. Se subirá sola cuando vuelva el internet. ✓');
    cambiarVMTab('reservas');
  }catch(e){ alert('No se pudo: '+(e.message||e)); }
  finally{ btn.disabled=false; btn.textContent='✅ Cobrar venta'; }
}
async function tvCargarReservas(){
  const cont=document.getElementById('tvReservasBody');
  if(!navigator.onLine){ cont.innerHTML='<div class="msg err">Necesitas internet.</div>'; return; }
  cont.textContent='Cargando…';
  try{
    const {data,error}=await sb.from('reservas_mayoreo').select('*').eq('estado','nueva').order('id',{ascending:false}).limit(100);
    if(error) throw error;
    __tvReservas={}; (data||[]).forEach(r=>{ __tvReservas[r.id]=r; });
    if(!data||!data.length){ cont.innerHTML='<div class="empty">No hay reservas pendientes.</div>'; return; }
    cont.innerHTML=data.map(r=>{ const items=Array.isArray(r.items)?r.items:[]; const tel=(r.telefono||'').replace(/[^0-9]/g,'');
      const wa=tel?`<a class="ghost" style="display:inline-block;padding:8px 12px;border:1px solid var(--border);border-radius:8px;text-decoration:none;font-size:13px" href="https://wa.me/${tel}" target="_blank">💬</a>`:'';
      return `<div style="border:2px solid var(--amber);border-radius:12px;padding:12px;margin-bottom:10px">
        <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap"><b>${r.nombre||'(sin nombre)'}</b><span style="color:var(--muted);font-size:12px">${(r.creado_en||'').slice(0,16).replace('T',' ')}</span></div>
        <div style="color:var(--muted);font-size:13px;margin:4px 0">📞 ${r.telefono||'—'} · total aprox $${num(r.total)}</div>
        ${r.cita?`<div style="font-size:13px;margin:4px 0;color:#0a7d33;font-weight:700">📅 Recogida: ${fmtCita(r.cita)}</div>`:''}
        <div style="font-size:14px;margin:6px 0">${items.map(it=>`${it.nombre} <b>×${num(it.cantidad)}</b>`).join('<br>')}</div>
        <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap">
          <button class="primary" style="padding:8px 12px;font-size:13px" onclick="tvVenderReserva(${r.id})">🛒 Vender</button>
          ${wa}
          <button class="ghost" style="padding:8px 12px;font-size:13px;color:var(--amber)" onclick="tvNoVino(${r.id})">🚫 No vino</button>
        </div>
      </div>`;
    }).join('');
  }catch(e){ cont.innerHTML='<div class="msg err">No se pudo: '+(e.message||e)+'</div>'; }
}
async function tvVenderReserva(id){
  const r=__tvReservas[id]; if(!r) return;
  const alm=await asegurarAlmacenMayoreo();
  if(!alm){ alert('Falta el almacén MAYOREO.'); return; }
  // Pide el stock FRESCO del MAYOREO antes de validar (la vista de Tamy no lo tiene en memoria).
  await tvCargarStockMayoreo();
  __tvCarrito=[]; let avisos=[];
  (Array.isArray(r.items)?r.items:[]).forEach(it=>{
    const p=(PRODUCTOS||[]).find(x=>x.id===it.producto_id);
    if(!p){ avisos.push(it.nombre+' ya no existe'); return; }
    let cant=Number(it.cantidad)||0;
    const hay=tvStockDe(p.id);
    if(cant>hay){ avisos.push('de "'+p.nombre+'" solo hay '+num(hay)+' (pedía '+num(cant)+')'); cant=hay; }
    if(cant<=0) return;
    __tvCarrito.push({producto_id:p.id, nombre:p.nombre, cantidad:cant, precio:Number(p.precio_mayoreo||it.precio||0), costo:Number(p.costo_mayoreo||0)});
  });
  __tvReservaEnVenta=id;
  cambiarVMTab('vender'); tvRenderCarrito();
  if(avisos.length) alert('Ojo: '+avisos.join(', ')+'.');
}
async function tvNoVino(id){
  if(!confirm('¿Marcar que el cliente NO vino? Libera el stock.')) return;
  if(!navigator.onLine){ alert('Necesitas internet.'); return; }
  try{ const {error}=await sb.from('reservas_mayoreo').update({estado:'no_vino'}).eq('id',id); if(error) throw error; tvCargarReservas(); }
  catch(e){ alert('No se pudo: '+(e.message||e)); }
}

// ---------- VENTA DEL DÍA (abrir si no existe una abierta para hoy) ----------
async function buscarOAbrirVentaDia(){
  const hoy = fechaHoyLocal();
  // El carrito local se separa POR USUARIO además de por puesto, para que dos trabajadoras
  // distintas en el mismo puesto NUNCA compartan artículos.
  const carritoLocalKey = 'vt_carrito_'+puestoActual.id+'_'+usuarioActual.id;

  if(!navigator.onLine){
    modoLocal = true;
    ventaDiaAbiertaId = null;
    carrito = lsGet(carritoLocalKey, []);
    ventaActualInicio = carrito.length;
    renderCarrito();
    return;
  }

  // Busca el día abierto de ESTE usuario en este puesto hoy. Si la base tiene la columna
  // usuario_id, filtra por ella; si no, cae al filtro viejo (solo puesto) para no romper.
  // Si por algún fallo quedaron VARIOS días abiertos del mismo trabajador en el mismo puesto
  // y la misma fecha, nos quedamos con uno solo: el que tenga artículos (o el primero) y
  // BORRAMOS los que estén vacíos. Así no se acumulan "ventas en curso" fantasma.
  async function consolidarDiasAbiertos(lista){
    if(!lista || lista.length === 0) return null;

    // Artículos de cada día abierto
    let itemsPorDia = {};
    try{
      const ids = lista.map(d=>d.id);
      const its = await traerItemsDe(ids, 'venta_dia_id, producto_id, cantidad, precio_venta');
      (its||[]).forEach(i=>{
        if(!itemsPorDia[i.venta_dia_id]) itemsPorDia[i.venta_dia_id] = [];
        itemsPorDia[i.venta_dia_id].push(`${i.producto_id}x${i.cantidad}@${i.precio_venta}`);
      });
    }catch(e){ return lista[0]; }

    // FANTASMAS: un día ABIERTO cuyos artículos son idénticos a una venta ya CERRADA de hoy
    // es una copia que quedó colgada. Se borra: la venta buena es la cerrada.
    try{
      const {data: cerrados} = await sb.from('ventas_dia').select('id')
        .eq('almacen_id', puestoActual.id).eq('fecha', hoy).eq('cerrado', true);
      const idsCerrados = (cerrados||[]).map(d=>d.id);
      if(idsCerrados.length > 0){
        const itsCerrados = await traerItemsDe(idsCerrados, 'venta_dia_id, producto_id, cantidad, precio_venta');
        const firmasCerradas = {};
        for(const i of (itsCerrados||[])){
          if(!firmasCerradas[i.venta_dia_id]) firmasCerradas[i.venta_dia_id] = [];
          firmasCerradas[i.venta_dia_id].push(`${i.producto_id}x${i.cantidad}@${i.precio_venta}`);
        }
        const setCerradas = new Set(Object.values(firmasCerradas).map(l=>l.sort().join('|')));
        const sobrevivientes = [];
        for(const d of lista){
          const firma = (itemsPorDia[d.id]||[]).sort().join('|');
          if(firma && setCerradas.has(firma)){
            try{
              await escribirConReintento(()=> sb.from('venta_items').delete().eq('venta_dia_id', d.id));
              await escribirConReintento(()=> sb.from('ventas_dia').delete().eq('id', d.id));
              delete itemsPorDia[d.id];
              continue; // era copia de una venta ya cerrada
            }catch(e){}
          }
          sobrevivientes.push(d);
        }
        lista = sobrevivientes;
      }
    }catch(e){}

    if(lista.length === 0) return null;
    if(lista.length === 1) return lista[0];

    // Si aún quedan varios abiertos, nos quedamos con el que tenga artículos y borramos los vacíos
    const conMercancia = lista.filter(d => (itemsPorDia[d.id]||[]).length > 0);
    const elegido = conMercancia[0] || lista[0];
    for(const d of lista){
      if(d.id === elegido.id) continue;
      if((itemsPorDia[d.id]||[]).length > 0) continue; // tiene artículos: no lo tocamos
      try{ await escribirConReintento(()=> sb.from('ventas_dia').delete().eq('id', d.id)); }catch(e){}
    }
    return elegido;
  }

  async function buscarDiaAbierto(){
    // Traemos TODOS los días abiertos (no maybeSingle, que falla si hay más de uno por el bug
    // de duplicados) y consolidamos para que quede uno solo.
    try{
      const r = await sb.from('ventas_dia').select('*')
        .eq('almacen_id', puestoActual.id).eq('fecha', hoy).eq('cerrado', false)
        .eq('usuario_id', usuarioActual.id).order('id', {ascending:true});
      if(r.error) throw r.error;
      const elegido = await consolidarDiasAbiertos(r.data || []);
      return {data: elegido, porUsuario: true};
    }catch(e){
      // La columna usuario_id no existe aún: usamos el filtro por puesto (comportamiento anterior)
      const r = await sb.from('ventas_dia').select('*')
        .eq('almacen_id', puestoActual.id).eq('fecha', hoy).eq('cerrado', false).order('id', {ascending:true});
      const elegido = await consolidarDiasAbiertos(r.data || []);
      return {data: elegido, porUsuario: false};
    }
  }

  async function crearDiaNuevo(){
    const fila = {almacen_id:puestoActual.id, fecha:hoy, usuario_id: usuarioActual.id};
    let r = await sb.from('ventas_dia').insert(fila).select().single();
    if(r.error && ((r.error.message||'').includes('usuario_id') || (r.error.message||'').includes('column'))){
      delete fila.usuario_id;
      r = await sb.from('ventas_dia').insert(fila).select().single();
    }
    if(r.error) throw r.error;
    return r.data;
  }

  try{
    // Si acabamos de finalizar el día, NO reusamos ningún día abierto viejo ni sus artículos:
    // buscamos/creamos el día de hoy pero SIEMPRE con el carrito en blanco.
    if(diaRecienFinalizado){
      const {data: diaHoy} = await buscarDiaAbierto();
      if(diaHoy){
        ventaDiaAbiertaId = diaHoy.id;
      } else {
        const nueva = await crearDiaNuevo();
        ventaDiaAbiertaId = nueva.id;
      }
      modoLocal = false;
      carrito = [];
      cobrosEnCarrito = [];
      ventaActualInicio = 0;
      guardarInicioVentaActual();
      lsSet(carritoLocalKey, []);
      renderCarrito();
      return;
    }

    const {data} = await buscarDiaAbierto();

    let cacheLocal = lsGet(carritoLocalKey, []);

    // GUARDA CONTRA VENTAS FANTASMA: el carrito guardado en el teléfono puede ser un resto
    // de una venta que YA se finalizó (por ejemplo, se cerró desde otro teléfono, o la app
    // se recargó justo después de cerrar). Si esos mismos artículos ya están en una venta
    // CERRADA de hoy, el carrito es basura vieja: se descarta en vez de volver a subirlo.
    if(cacheLocal.length > 0){
      try{
        const firmaCache = cacheLocal.map(it=>`${it.producto_id}x${it.cantidad}@${it.precio_venta}`).sort().join('|');
        const {data: cerradosHoy} = await sb.from('ventas_dia').select('id')
          .eq('almacen_id', puestoActual.id).eq('fecha', hoy).eq('cerrado', true);
        const idsCerrados = (cerradosHoy||[]).map(d=>d.id);
        if(idsCerrados.length > 0){
          const itemsCerrados = await traerItemsDe(idsCerrados, 'venta_dia_id, producto_id, cantidad, precio_venta');
          const porDia = {};
          for(const it of (itemsCerrados||[])){
            if(!porDia[it.venta_dia_id]) porDia[it.venta_dia_id] = [];
            porDia[it.venta_dia_id].push(`${it.producto_id}x${it.cantidad}@${it.precio_venta}`);
          }
          const yaVendido = Object.values(porDia).some(lista => lista.sort().join('|') === firmaCache);
          if(yaVendido){
            console.warn('El carrito guardado ya se vendió y cerró hoy: se descarta para no duplicar la venta.');
            cacheLocal = [];
            lsSet(carritoLocalKey, []);
          }
        }
      }catch(e){ /* si no se puede verificar, seguimos con el comportamiento normal */ }
    }

    if(data){
      ventaDiaAbiertaId = data.id;
      modoLocal = false;
      if(cacheLocal.length > 0){
        // Había artículos guardados en el teléfono (agregados sin conexión) que la base
        // de datos todavía no tiene: los subimos ahora en vez de perderlos.
        carrito = cacheLocal;
        const guardadoLocal = leerInicioVentaActual();
        ventaActualInicio = (guardadoLocal !== null && guardadoLocal <= carrito.length) ? guardadoLocal : carrito.length;
        guardarInicioVentaActual();
        renderCarrito();
        await guardarItemsEnDB();
      } else {
        await cargarItemsCarritoDesdeDB();
      }
    } else {
      const nueva = await crearDiaNuevo();
      ventaDiaAbiertaId = nueva.id;
      modoLocal = false;
      if(cacheLocal.length > 0){
        carrito = cacheLocal;
        const guardadoLocal = leerInicioVentaActual();
        ventaActualInicio = (guardadoLocal !== null && guardadoLocal <= carrito.length) ? guardadoLocal : carrito.length;
        guardarInicioVentaActual();
        renderCarrito();
        await guardarItemsEnDB();
      } else {
        carrito = []; ventaActualInicio = 0;
        renderCarrito();
      }
    }
  }catch(err){
    console.error(err);
    modoLocal = true;
    ventaDiaAbiertaId = null;
    carrito = lsGet(carritoLocalKey, []);
    renderCarrito();
  }
}

async function cargarItemsCarritoDesdeDB(){
  const {data, error} = await sb.from('venta_items').select('*').eq('venta_dia_id', ventaDiaAbiertaId);
  if(error){ console.error(error); return; }
  const itemsDia = (data||[]).map(it=>{
    const p = PRODUCTOS.find(p=>p.id===it.producto_id);
    return {id_db: it.id, producto_id: it.producto_id, nombre: p?p.nombre:'(producto eliminado)', cantidad:Number(it.cantidad), precio_venta:Number(it.precio_venta), costo:Number(it.costo)};
  });

  // BASURA ENTRE TELÉFONOS: si estos artículos ya corresponden a una venta que HOY quedó
  // registrada (día cerrado con la misma huella y total), NO son un carrito en curso: son
  // sobras de una venta ya guardada. Las quitamos para que no reaparezcan en ningún teléfono
  // ni se puedan volver a entrar.
  if(itemsDia.length > 0){
    const firma = firmaVenta(itemsDia);
    const total = Number((itemsDia.reduce((s,it)=>s+it.cantidad*it.precio_venta,0)).toFixed(2));
    const gemela = await buscarVentaGemelaHoy(firma, total, ventaDiaAbiertaId);
    if(gemela){
      try{ await escribirConReintento(()=> sb.from('venta_items').delete().eq('venta_dia_id', ventaDiaAbiertaId)); }catch(e){}
      carrito = []; ventaActualInicio = 0;
      guardarInicioVentaActual();
      renderCarrito();
      return;
    }
  }

  carrito = itemsDia;
  // Recuperamos dónde empezaba la venta del cliente actual, para que los artículos que el
  // vendedor está cobrando ahora NO se vayan solos a "venta del día" al recargar la pantalla.
  const guardado = leerInicioVentaActual();
  ventaActualInicio = (guardado !== null && guardado <= carrito.length) ? guardado : carrito.length;
  renderCarrito();
}

// Guarda/lee el punto donde empieza la venta del cliente actual (por puesto y por usuario)
function claveInicioVentaActual(){
  if(!puestoActual || !usuarioActual) return null;
  return 'vt_inicio_cliente_' + puestoActual.id + '_' + usuarioActual.id;
}
function guardarInicioVentaActual(){
  const k = claveInicioVentaActual();
  if(!k) return;
  try{ lsSet(k, {indice: ventaActualInicio, fecha: fechaHoyLocal()}); }catch(e){}
}
function leerInicioVentaActual(){
  const k = claveInicioVentaActual();
  if(!k) return null;
  const g = lsGet(k, null);
  if(!g || g.fecha !== fechaHoyLocal()) return null; // de otro día: no sirve
  return Number(g.indice);
}

function seleccionarProductoVenta(p){
  if(!p) return;
  acInput.value = p.nombre;
  acHidden.value = p.id;
  document.getElementById('ventaPrecio').value = p.precio_venta;
  acList.style.display='none';
}

// ---------- CARRITO ----------
function agregarAlCarrito(){
  if(!puestoActual){ alert('Espera unos segundos: todavía se está cargando tu puesto.'); return; }
  const msgEl = document.getElementById('ventaMsg');
  const productoId = Number(acHidden.value);
  const cantidad = Number(document.getElementById('ventaCantidad').value);
  const precio = Number(document.getElementById('ventaPrecio').value);
  if(!productoId){ msgEl.textContent='Selecciona un producto de la lista.'; msgEl.className='msg err'; return; }
  if(!cantidad || cantidad<=0){ msgEl.textContent='Ingresa una cantidad válida.'; msgEl.className='msg err'; return; }
  const p = PRODUCTOS.find(p=>p.id===productoId);

  // Aviso temprano si no alcanza el stock conocido (no bloquea: el conteo real se valida al finalizar,
  // pero así el vendedor se entera de una vez y no hasta el final del día).
  const invRow = (ultimoInventarioData||[]).find(i=>i.producto_id===productoId);
  const stockConocido = invRow ? Number(invRow.cantidad) : 0;
  const yaEnCarrito = carrito.filter(it=>it.producto_id===productoId).reduce((s,it)=>s+it.cantidad,0);
  if(stockConocido > 0 && (yaEnCarrito + cantidad) > stockConocido){
    if(!confirm(`Según tu inventario solo tienes ${num(stockConocido)} de "${p.nombre}" y estás por vender ${num(yaEnCarrito + cantidad)}. ¿Agregar de todos modos?`)) return;
  }

  carrito.push({producto_id:productoId, nombre:p.nombre, cantidad, precio_venta: precio||p.precio_venta, costo:p.costo});
  guardarInicioVentaActual(); // recordar dónde empieza la venta de este cliente
  renderCarrito();
  guardarItemsEnDB(); // persistimos en vivo para no perder la venta si se cierra el navegador
  acInput.value=''; acHidden.value=''; document.getElementById('ventaCantidad').value=''; document.getElementById('ventaPrecio').value='';
  msgEl.textContent = modoLocal ? 'Agregado (guardado en el teléfono, sin internet).' : 'Agregado.';
  msgEl.className='msg ok';
}

function quitarDelCarrito(index){
  const it = carrito[index];
  if(it && !confirm(`¿Quitar "${it.nombre}" (${num(it.cantidad)} × $${num(it.precio_venta)}) de la venta?`)) return;
  carrito.splice(index,1);
  if(ventaActualInicio > carrito.length) ventaActualInicio = carrito.length;
  guardarInicioVentaActual();
  renderCarrito();
  guardarItemsEnDB();
}

function renderCarrito(){
  if(!puestoActual) return; // aún no se ha cargado el puesto: no hacemos nada (evita el cuelgue)
  const body = document.getElementById('carritoBody');
  const empty = document.getElementById('carritoEmpty');
  if(puestoActual) lsSet('vt_carrito_'+puestoActual.id+'_'+usuarioActual.id, carrito); // respaldo local siempre, online u offline

  if(carrito.length===0 && cobrosEnCarrito.length===0){
    body.innerHTML=''; empty.style.display='block'; document.getElementById('carritoTotal').textContent='0.00';
    actualizarTotalesVenta();
    return;
  }
  empty.style.display='none';

  let total = 0;
  let filasProductos = carrito.map((it,i)=>{
    const subtotal = it.cantidad*it.precio_venta;
    total += subtotal;
    const inicioVentaActual = (i === ventaActualInicio && ventaActualInicio > 0 && ventaActualInicio < carrito.length);
    const separador = inicioVentaActual ? `<tr><td colspan="5" style="padding:6px 4px; color:var(--accent); font-size:12px; font-weight:600; border-top:2px solid var(--accent)">▼ Venta actual (cliente de ahora)</td></tr>` : '';
    return `${separador}<tr>
      <td>${it.nombre}</td>
      <td class="numcell">${num(it.cantidad)}</td>
      <td class="numcell">$${num(it.precio_venta)}</td>
      <td class="numcell">$${num(subtotal)}</td>
      <td><button class="ghost" onclick="quitarDelCarrito(${i})">Quitar</button></td>
    </tr>`;
  }).join('');

  let filasCobros = cobrosEnCarrito.map((c,i)=>{
    total -= c.monto;
    return `<tr style="color:var(--red)">
      <td>Cobro de pago pendiente</td>
      <td class="numcell">—</td>
      <td class="numcell">—</td>
      <td class="numcell">-$${num(c.monto)}</td>
      <td><button class="ghost" onclick="quitarCobroDelCarrito(${i})">Quitar</button></td>
    </tr>`;
  }).join('');

  body.innerHTML = filasProductos + filasCobros;
  document.getElementById('carritoTotal').textContent = num(total);
  const efEl = document.getElementById('finEfectivo');
  if(efEl && !efEl.dataset.tocado){
    efEl.value = total ? total.toFixed(2) : '';
  }
  actualizarTotalesVenta();
}

// Calcula el total de SOLO la venta del cliente actual (desde el último "Finalizar venta"),
// y lo muestra junto al menú hamburguesa y arriba de la tabla.
function actualizarTotalesVenta(){
  const totalVentaActual = carrito.slice(ventaActualInicio).reduce((s,it)=> s + it.cantidad*it.precio_venta, 0);

  const elVentaActual = document.getElementById('ventaActualTotal');
  if(elVentaActual) elVentaActual.textContent = num(totalVentaActual);

  const body = document.getElementById('ventaActualLista');
  const empty = document.getElementById('ventaActualEmpty');
  if(body){
    const itemsActuales = carrito.slice(ventaActualInicio);
    if(itemsActuales.length===0){
      body.innerHTML=''; if(empty) empty.style.display='block';
    } else {
      if(empty) empty.style.display='none';
      body.innerHTML = itemsActuales.map((it,i)=>{
        const idxReal = ventaActualInicio + i;
        const subtotal = it.cantidad*it.precio_venta;
        return `<tr>
          <td>${it.nombre}</td>
          <td class="numcell">${num(it.cantidad)}</td>
          <td class="numcell">$${num(it.precio_venta)}</td>
          <td class="numcell">$${num(subtotal)}</td>
          <td><button class="ghost" onclick="quitarDelCarrito(${idxReal})">Quitar</button></td>
        </tr>`;
      }).join('');
    }
  }

  const btnFinalizarVenta = document.getElementById('btnFinalizarVenta');
  if(btnFinalizarVenta) btnFinalizarVenta.disabled = (totalVentaActual <= 0);
}

// El botón del header alterna entre "Vender" y "Venta del día" — mismo lugar, mismo estilo, ida y vuelta.
function irAVentaDelDia(){
  const enVentaDelDia = document.getElementById('vtab-ventadeldia').style.display !== 'none';
  cambiarVTab(enVentaDelDia ? 'vender' : 'ventadeldia');
}

function actualizarBotonVentaHeader(tab){
  const btn = document.getElementById('ventaDiaHeaderPill');
  if(!btn) return;
  btn.textContent = (tab === 'ventadeldia') ? '🛒 Volver a vender' : '🧾 Venta del día';
}

// El cliente actual ya pagó/se le cobró: se marca esa parte como cerrada y se prepara
// la pantalla para el siguiente cliente. No toca la base de datos — eso sigue pasando
// solo con "Finalizar el día". Es solo para saber claramente cuánto cobrarle a cada persona.
function finalizarVenta(){
  if(!puestoActual){ alert('Espera unos segundos: todavía se está cargando tu puesto.'); return; }
  const totalVentaActual = carrito.slice(ventaActualInicio).reduce((s,it)=> s + it.cantidad*it.precio_venta, 0);
  if(totalVentaActual <= 0){ alert('Todavía no hay artículos en la venta actual.'); return; }
  ventaActualInicio = carrito.length;
  guardarInicioVentaActual();
  renderCarrito();
}

// Guarda el estado actual del carrito en venta_items (borra y reinserta; el día sigue abierto)
// Si estamos sin internet o falla la red, no truena: el carrito ya quedó respaldado en el teléfono.
async function guardarItemsEnDB(){
  if(modoLocal || !ventaDiaAbiertaId || !navigator.onLine) return;
  try{
    await escribirConReintento(()=> sb.from('venta_items').delete().eq('venta_dia_id', ventaDiaAbiertaId));
    if(carrito.length===0) return;
    const rows = carrito.map(it=>({
      venta_dia_id: ventaDiaAbiertaId, producto_id: it.producto_id, cantidad: it.cantidad,
      precio_venta: it.precio_venta, costo: it.costo
    }));
    const {error} = await sb.from('venta_items').insert(rows);
    if(error) throw error;
  }catch(err){
    console.error('No se pudo guardar en línea, seguimos en modo local:', err);
    modoLocal = true; // perdimos la conexión a medio camino; el carrito sigue respaldado localmente
    actualizarConexionUI();
  }
}

async function cargarMiInventario(){
  if(!puestoActual) return; // aún no se ha cargado el puesto: no hacemos nada (evita el cuelgue)
  const cacheKey = 'vt_cache_inventario_'+puestoActual.id;

  let data = null;
  if(navigator.onLine){
    try{
      const acc=[]; const PAGE=1000; let desde=0;
      for(;;){ const res = await sb.from('inventario').select('*').eq('almacen_id', puestoActual.id).order('id',{ascending:true}).range(desde, desde+PAGE-1); if(res.error) throw res.error; acc.push(...(res.data||[])); if(!res.data||res.data.length<PAGE) break; desde+=PAGE; }
      data = acc;
      lsSet(cacheKey, data);
    }catch(err){ console.error(err); data = lsGet(cacheKey, []); }
  } else {
    data = lsGet(cacheKey, []);
  }

  ultimoInventarioData = data || [];
  renderMiInventario();
}

function renderMiInventario(){
  const body = document.getElementById('miInventarioBody');
  const empty = document.getElementById('miInventarioEmpty');
  const filtro = document.getElementById('filtroMiInventario').value.trim().toLowerCase();

  if(PRODUCTOS.length===0){ body.innerHTML=''; empty.style.display='block'; return; }

  // Mostramos TODOS los productos del catálogo (aunque existan en otros almacenes
  // y aquí no tengan stock todavía). Si hay texto en el buscador, los que coinciden
  // suben al principio de la lista para encontrarlos más rápido.
  let lista = PRODUCTOS.map(p=>{
    const inv = ultimoInventarioData.find(i=>i.producto_id===p.id);
    return {producto:p, cantidad: inv ? Number(inv.cantidad) : 0};
  });

  if(filtro){
    lista = lista.filter(x=>coincideNombre(x.producto.nombre, filtro))
      .sort((a,b)=> a.producto.nombre.toLowerCase().indexOf(filtro) - b.producto.nombre.toLowerCase().indexOf(filtro));
  } else {
    lista.sort((a,b)=>a.producto.nombre.localeCompare(b.producto.nombre));
  }

  if(lista.length===0){ body.innerHTML=''; empty.style.display='block'; empty.textContent='No se encontró ningún artículo con ese nombre.'; return; }
  empty.style.display='none';

  body.innerHTML = lista.map(({producto,cantidad})=>{
    const bajo = cantidad <= 3;
    return `<tr><td>${producto.nombre}</td><td class="numcell ${bajo?'stock-low':''}">${num(cantidad)}</td><td>${bajo?'<span class="pill" style="color:var(--red);border-color:var(--red)">Stock bajo</span>':''}</td></tr>`;
  }).join('');
}

// ---------- SUGERENCIAS INTELIGENTES DE PEDIDO ----------
// En vez de "stock bajo = pedir", calculamos cuántos DÍAS de inventario le quedan a cada
// artículo según qué tan rápido se vende en ESTE puesto. Así un artículo grande que casi
// no se mueve no sale como urgente solo porque hay pocas unidades.
async function cargarSugerenciasPedido(){
  if(!puestoActual) return; // aún no se ha cargado el puesto: no hacemos nada (evita el cuelgue)
  const cont = document.getElementById('sugerenciasBody');
  const empty = document.getElementById('sugerenciasEmpty');

  if(!navigator.onLine){
    cont.innerHTML=''; empty.style.display='block';
    empty.textContent = 'Sin conexión: las sugerencias necesitan internet para revisar el historial de ventas.';
    return;
  }

  try{
    const desde = new Date(); desde.setDate(desde.getDate()-30);
    const desdeStr = desde.toISOString().slice(0,10);

    const {data: dias, error: e1} = await sb.from('ventas_dia').select('id, fecha')
      .eq('almacen_id', puestoActual.id).eq('cerrado', true).gte('fecha', desdeStr);
    if(e1) throw e1;

    if(!dias || dias.length===0){
      cont.innerHTML=''; empty.style.display='block';
      empty.textContent = 'Aún no hay días de venta cerrados en los últimos 30 días para calcular sugerencias.';
      return;
    }

    const idsDias = dias.map(d=>d.id);
    const items = await traerItemsDe(idsDias, 'producto_id, cantidad'); const e2 = null;
    if(e2) throw e2;

    // Días reales considerados: desde la fecha más antigua de venta hasta hoy (mínimo 1)
    const fechaMasAntigua = dias.map(d=>d.fecha).sort()[0];
    const diasPeriodo = Math.max(1, Math.round((new Date() - new Date(fechaMasAntigua)) / (1000*60*60*24)));

    const ventasPorProducto = {};
    for(const it of (items||[])) ventasPorProducto[it.producto_id] = (ventasPorProducto[it.producto_id]||0) + Number(it.cantidad);

    const inventarioActual = lsGet('vt_cache_inventario_'+puestoActual.id, []);

    const sugerencias = Object.entries(ventasPorProducto).map(([prodId, totalVendido])=>{
      const producto = PRODUCTOS.find(p=>p.id===Number(prodId));
      if(!producto) return null;
      const inv = inventarioActual.find(i=>i.producto_id===Number(prodId));
      const stockActual = inv ? Number(inv.cantidad) : 0;
      const promedioDiario = totalVendido / diasPeriodo;
      const diasRestantes = promedioDiario>0 ? stockActual/promedioDiario : Infinity;
      const sugerido = Math.max(0, Math.ceil(promedioDiario*7 - stockActual)); // cubrir ~7 días
      return {producto, stockActual, promedioDiario, diasRestantes, sugerido};
    }).filter(x=>x && x.diasRestantes < 10 && x.sugerido > 0)
      .sort((a,b)=>a.diasRestantes-b.diasRestantes)
      .slice(0,15);

    if(sugerencias.length===0){
      cont.innerHTML=''; empty.style.display='block';
      empty.textContent = '✅ No hay artículos urgentes por pedir según tu ritmo de ventas reciente.';
      return;
    }
    empty.style.display='none';

    cont.innerHTML = `<table>
      <thead><tr><th>Producto</th><th class="numcell">Stock</th><th class="numcell">Venta/día</th><th class="numcell">Días restantes</th><th class="numcell">Cantidad</th><th></th></tr></thead>
      <tbody>${sugerencias.map(s=>{
        const urgente = s.diasRestantes <= 2;
        const color = urgente ? 'var(--red)' : (s.diasRestantes<=5 ? 'var(--amber)' : 'var(--muted)');
        return `<tr>
          <td>${s.producto.nombre}</td>
          <td class="numcell">${num(s.stockActual)}</td>
          <td class="numcell">${s.promedioDiario.toFixed(1)}</td>
          <td class="numcell" style="color:${color}; font-weight:600">${s.diasRestantes===Infinity?'—':s.diasRestantes.toFixed(1)}</td>
          <td class="numcell"><input type="number" class="editPrice" id="sug-cant-${s.producto.id}" value="${s.sugerido}" min="0" step="any"></td>
          <td><button class="primary" style="padding:7px 12px; font-size:13px" onclick="pedirDesdeSugerencia(${s.producto.id}, '${txtAttr(s.producto.nombre)}')">Pedir</button></td>
        </tr>`;
      }).join('')}</tbody>
    </table>`;
  }catch(err){
    console.error(err);
    cont.innerHTML=''; empty.style.display='block';
    empty.textContent = 'No se pudieron calcular las sugerencias ahora.';
  }
}

async function pedirDesdeSugerencia(productoId, nombre){
  const input = document.getElementById('sug-cant-'+productoId);
  const cantidad = Number(input.value);
  if(!cantidad || cantidad<=0){ alert('Ingresa una cantidad válida.'); return; }
  const resultado = await insertarPedido(productoId, cantidad, 'Sugerido según ritmo de venta');
  const msgEl = document.getElementById('pedidoMsg');
  msgEl.textContent = resultado.offline
    ? `"${nombre}" guardado sin internet, se enviará cuando vuelva la conexión.`
    : `Pedido de "${nombre}" enviado al admin.`;
  msgEl.className = 'msg ok';
  await cargarMisPedidos();
}

async function insertarPedido(productoId, cantidad, nota){
  if(!navigator.onLine){
    const pendientes = lsGet('vt_pending_pedidos', []);
    pendientes.push({almacen_id:puestoActual.id, producto_id:productoId, cantidad, nota});
    lsSet('vt_pending_pedidos', pendientes);
    actualizarConexionUI();
    return {ok:true, offline:true};
  }
  try{
    const {error} = await sb.from('pedidos').insert({almacen_id:puestoActual.id, producto_id:productoId, cantidad, nota});
    if(error) throw error;
    return {ok:true, offline:false};
  }catch(err){
    const pendientes = lsGet('vt_pending_pedidos', []);
    pendientes.push({almacen_id:puestoActual.id, producto_id:productoId, cantidad, nota});
    lsSet('vt_pending_pedidos', pendientes);
    actualizarConexionUI();
    return {ok:true, offline:true, err};
  }
}

async function crearPedido(){
  if(!puestoActual){ alert('Espera unos segundos: todavía se está cargando tu puesto.'); return; }
  const msgEl = document.getElementById('pedidoMsg');
  const productoId = Number(pedAcHidden.value);
  const cantidad = Number(document.getElementById('pedidoCantidad').value);
  const nota = document.getElementById('pedidoNota').value.trim();
  if(!productoId){ msgEl.textContent='Selecciona un producto.'; msgEl.className='msg err'; return; }
  if(!cantidad || cantidad<=0){ msgEl.textContent='Ingresa una cantidad válida.'; msgEl.className='msg err'; return; }

  const resultado = await insertarPedido(productoId, cantidad, nota);
  pedAcInput.value=''; pedAcHidden.value=''; document.getElementById('pedidoCantidad').value=''; document.getElementById('pedidoNota').value='';
  msgEl.textContent = resultado.offline
    ? 'Sin internet: el pedido se guardó en el teléfono y se enviará automáticamente cuando vuelva la conexión.'
    : 'Pedido enviado al admin.';
  msgEl.className='msg ok';
  await cargarMisPedidos();
}

async function cargarMisPedidos(){
  if(!puestoActual) return; // aún no se ha cargado el puesto: no hacemos nada (evita el cuelgue)
  const body = document.getElementById('misPedidosBody');
  if(!navigator.onLine){
    const pendientesLocal = lsGet('vt_pending_pedidos', []).filter(p=>p.almacen_id===puestoActual.id);
    if(pendientesLocal.length===0){ body.innerHTML='<tr><td class="empty" colspan="4">Sin conexión: no se puede ver el historial de pedidos ahora.</td></tr>'; return; }
    body.innerHTML = pendientesLocal.map(p=>{
      const prod = PRODUCTOS.find(pr=>pr.id===p.producto_id);
      return `<tr><td>${prod?prod.nombre:'—'}</td><td class="numcell">${num(p.cantidad)}</td>
        <td><span class="pill" style="color:var(--amber);border-color:var(--amber)">por enviar</span></td><td>—</td></tr>`;
    }).join('');
    return;
  }
  try{
    const {data, error} = await sb.from('pedidos').select('*').eq('almacen_id', puestoActual.id).order('creado_en', {ascending:false}).limit(300);
    if(error) throw error;
    if(!data || data.length===0){ body.innerHTML='<tr><td class="empty" colspan="4">Sin pedidos</td></tr>'; return; }
    body.innerHTML = data.map(d=>{
      const p = PRODUCTOS.find(p=>p.id===d.producto_id);
      const estadoColor = d.estado==='pendiente' ? 'var(--amber)' : (d.estado==='resuelto' ? 'var(--green)' : 'var(--muted)');
      return `<tr><td>${p?p.nombre:'—'}</td><td class="numcell">${num(d.cantidad)}</td>
        <td><span class="pill" style="color:${estadoColor};border-color:${estadoColor}">${d.estado}</span></td>
        <td>${new Date(d.creado_en).toLocaleDateString()}</td></tr>`;
    }).join('');
  }catch(err){
    console.error(err);
    body.innerHTML='<tr><td class="empty" colspan="4">No se pudo cargar el historial de pedidos ahora.</td></tr>';
  }
} // [{deudaId, monto}] — pendientes de aplicar, se procesan al Finalizar el día

async function cargarCobros(){
  if(!puestoActual) return; // aún no se ha cargado el puesto: no hacemos nada (evita el cuelgue)
  const body = document.getElementById('cobrarBody');
  const empty = document.getElementById('cobrarEmpty');
  const msgEl = document.getElementById('cobrarMsg');
  msgEl.textContent = '';

  if(!navigator.onLine){
    body.innerHTML = ''; empty.style.display='block';
    empty.textContent = 'Necesitas internet para ver y cobrar tus pagos pendientes.';
    return;
  }

  try{
    // ¿Qué comisiones ve para cobrar?
    // - Comodín: las que están a nombre de ELLA (las ganó en cualquier puesto).
    // - Vendedora con puesto fijo: las que están a nombre de su puesto.
    // Antes se buscaba con el nombre EXACTO de una sola forma, y por eso a veces no le salía
    // nada: la comisión podía estar guardada a nombre del PUESTO y ella ser comodín (o al
    // revés), o diferir en mayúsculas/acentos/espacios. Ahora aceptamos su nombre Y el de su
    // puesto, comparando sin distinguir mayúsculas, acentos ni espacios de más.
    const normNom = s => (s==null?'':String(s)).normalize('NFD').replace(/[̀-ͯ]/g,'').trim().toLowerCase();
    const misNombres = new Set([
      (usuarioActual && usuarioActual.nombre) || '',
      (puestoActual && puestoActual.nombre) || ''
    ].map(normNom).filter(Boolean));
    const data = await traerTodasLasFilas(()=> sb.from('deudas').select('*')
      .eq('tipo','debo').eq('pagada', false).order('creado_en', {ascending:true}));
    const mias = (data || []).filter(d => misNombres.has(normNom(d.persona)));

    // No mostramos en la lista los que ya agregamos a la venta de hoy (para no agregarlos dos veces)
    const idsYaEnCarrito = new Set(cobrosEnCarrito.map(c=>c.deudaId));
    const lista = mias.filter(d => !idsYaEnCarrito.has(d.id));
    const totalPendiente = lista.reduce((s,d)=> s + Number(d.monto), 0);
    document.getElementById('cobrarTotalPendiente').textContent = num(totalPendiente);

    if(lista.length===0){ body.innerHTML=''; empty.style.display='block'; empty.textContent='No tienes nada más pendiente por cobrar.'; return; }
    empty.style.display='none';

    body.innerHTML = lista.map(d => `<tr>
      <td>${new Date(d.creado_en).toLocaleDateString()}</td>
      <td class="numcell">$${num(d.monto)}</td>
      <td><button class="primary" style="padding:8px 14px; font-size:13px" data-cobro="${d.id}" onclick="agregarCobroAlCarrito(${d.id}, ${d.monto})">Agregar</button></td>
    </tr>`).join('');
  }catch(err){
    console.error(err);
    body.innerHTML = ''; empty.style.display='block'; empty.textContent='No se pudo cargar ahora.';
  }
}

async function agregarCobroAlCarrito(id, monto){
  if(cobrosEnCarrito.some(c=>c.deudaId===id)) return; // ya estaba agregado: no se duplica
  cobrosEnCarrito.push({deudaId:id, monto:Number(monto)});
  // Lo sacamos de la lista AL INSTANTE (sin esperar al servidor), para que vea enseguida
  // que se movió al carrito y no lo toque dos veces creyendo que no funcionó.
  try{ const b=document.querySelector('#cobrarBody button[data-cobro="'+id+'"]'); const fila=b&&b.closest('tr'); if(fila) fila.remove(); }catch(e){}
  renderCarrito();
  cambiarVTab('vender'); // lo lleva a ver la línea que se acaba de agregar
  try{ await cargarCobros(); }catch(e){}  // y después se refresca la lista de verdad
}

function quitarCobroDelCarrito(index){
  const c = cobrosEnCarrito[index];
  if(c && !confirm(`¿Quitar el cobro de $${num(c.monto)} de la venta?`)) return;
  cobrosEnCarrito.splice(index, 1);
  renderCarrito();
}

// ---------- DEVOLUCIONES ----------
function cargarDevolucionesTab(){
  document.getElementById('devBuscar').value = '';
  document.getElementById('devProducto').value = '';
  document.getElementById('devElegido').textContent = '';
  document.getElementById('devSugerencias').style.display = 'none';
  document.getElementById('devCantidad').value = '';
  document.getElementById('devPrecio').value = '';
  document.getElementById('devNota').value = '';
  document.getElementById('devMsg').textContent = '';
  cargarDevolucionesDeHoy();
}

// Autocompletado real: al escribir, muestra SOLO los productos que coinciden (máx. 15).
function filtrarDevProductos(){
  const q = (document.getElementById('devBuscar').value||'').trim().toLowerCase();
  const cont = document.getElementById('devSugerencias');
  document.getElementById('devProducto').value = '';       // al reescribir, se borra la elección previa
  document.getElementById('devElegido').textContent = '';
  if(q.length < 1){ cont.style.display='none'; cont.innerHTML=''; return; }
  const matches = (PRODUCTOS||[])
    .filter(p => coincideNombre(p.nombre, q))
    .sort((a,b)=>a.nombre.localeCompare(b.nombre))
    .slice(0, 15);
  if(!matches.length){ cont.style.display='block'; cont.innerHTML='<div style="padding:10px; color:var(--muted)">Sin coincidencias.</div>'; return; }
  cont.innerHTML = matches.map(p =>
    `<div onclick="elegirDevProducto(${p.id})" style="padding:12px 12px; border-bottom:1px solid var(--border); cursor:pointer">${p.nombre}</div>`
  ).join('');
  cont.style.display = 'block';
}

function elegirDevProducto(id){
  const p = (PRODUCTOS||[]).find(x=>x.id===id);
  if(!p) return;
  document.getElementById('devProducto').value = id;
  document.getElementById('devBuscar').value = p.nombre;
  document.getElementById('devElegido').textContent = '✓ ' + p.nombre;
  document.getElementById('devSugerencias').style.display = 'none';
  document.getElementById('devPrecio').value = p.precio_venta;   // precio por defecto
  const c = document.getElementById('devCantidad'); if(c && !c.value) c.value = 1;
}

function devPrecioPorDefecto(){
  const p = PRODUCTOS.find(x=>x.id===Number(document.getElementById('devProducto').value));
  if(p) document.getElementById('devPrecio').value = p.precio_venta;
}

async function cargarDevolucionesDeHoy(){
  if(!puestoActual) return; // aún no se ha cargado el puesto: no hacemos nada (evita el cuelgue)
  const body = document.getElementById('devHoyBody');
  const empty = document.getElementById('devHoyEmpty');
  const pendientes = lsGet('vt_pending_devoluciones', []).filter(d=>d.almacen_id===puestoActual.id);
  let filas = pendientes.map(d=>`<tr style="color:var(--amber)"><td>${d.nombre} (por sincronizar)</td><td class="numcell">${num(d.cantidad)}</td><td class="numcell">$${num(d.cantidad*d.precio_venta)}</td></tr>`).join('');
  if(navigator.onLine){
    try{
      const hoy = fechaHoyLocal();
      const {data} = await sb.from('devoluciones').select('*').eq('almacen_id', puestoActual.id).eq('fecha', hoy).order('creado_en', {ascending:false});
      filas += (data||[]).map(d=>{
        const p = PRODUCTOS.find(x=>x.id===d.producto_id);
        return `<tr><td>${p?p.nombre:'(producto)'}</td><td class="numcell">${num(d.cantidad)}</td><td class="numcell">$${num(Number(d.cantidad)*Number(d.precio_venta))}</td></tr>`;
      }).join('');
    }catch(e){ /* sin tabla o sin red: se muestran solo las pendientes */ }
  }
  body.innerHTML = filas;
  empty.style.display = filas ? 'none' : 'block';
}

async function procesarDevolucion(){
  if(!puestoActual){ alert('Espera unos segundos: todavía se está cargando tu puesto.'); return; }
  const msgEl = document.getElementById('devMsg');
  const productoId = Number(document.getElementById('devProducto').value);
  const cantidad = Number(document.getElementById('devCantidad').value);
  const precio = Number(document.getElementById('devPrecio').value);
  const metodo = document.getElementById('devMetodo').value;
  const nota = document.getElementById('devNota').value.trim();

  if(!productoId){ msgEl.textContent='Elige el producto que devuelven.'; msgEl.className='msg err'; return; }
  if(!(cantidad > 0)){ msgEl.textContent='Pon una cantidad válida.'; msgEl.className='msg err'; return; }
  if(!(precio > 0)){ msgEl.textContent='Pon el precio al que se vendió (lo que hay que devolverle al cliente por unidad).'; msgEl.className='msg err'; return; }

  const p = PRODUCTOS.find(x=>x.id===productoId);
  const monto = cantidad * precio;
  if(!confirm(`¿Registrar la devolución de ${num(cantidad)} × "${p.nombre}" y devolverle $${num(monto)} al cliente (${metodo})?`)) return;

  const payload = {
    almacen_id: puestoActual.id, almacen_nombre: puestoActual.nombre,
    producto_id: productoId, nombre: p.nombre,
    cantidad, precio_venta: precio, costo: Number(p.costo),
    metodo, nota, fecha: fechaHoyLocal(),
    clave: 'dev_' + Date.now() + '_' + Math.random().toString(36).slice(2,8)
  };

  if(!navigator.onLine){
    encolarDevolucion(payload);
    msgEl.textContent = 'Sin conexión: la devolución quedó guardada en el teléfono y se aplicará sola al volver el internet (ahí se valida que haya dinero en caja).';
    msgEl.className = 'msg ok';
    limpiarFormDevolucion();
    cargarDevolucionesDeHoy();
    actualizarConexionUI();
    return;
  }

  try{
    const saldo = await obtenerSaldoMetodo(metodo);
    if(saldo < monto){
      msgEl.textContent = `No hay suficiente ${metodo} registrado en caja para devolver $${num(monto)} (hay $${num(saldo)}). Avísale al dueño/administrador.`;
      msgEl.className = 'msg err';
      return;
    }
    await aplicarDevolucionEnServidor(payload);
    msgEl.textContent = `Devolución registrada: ${num(cantidad)} × ${p.nombre} regresó a tu inventario y se devolvieron $${num(monto)}.`;
    msgEl.className = 'msg ok';
    limpiarFormDevolucion();
    cargarDevolucionesDeHoy();
  }catch(err){
    encolarDevolucion(payload);
    msgEl.textContent = 'No se pudo conectar: la devolución quedó guardada en el teléfono y se aplicará sola al volver el internet.';
    msgEl.className = 'msg ok';
    actualizarConexionUI();
  }
}

function limpiarFormDevolucion(){
  document.getElementById('devProducto').value = '';
  document.getElementById('devCantidad').value = '';
  document.getElementById('devPrecio').value = '';
  document.getElementById('devNota').value = '';
}

function encolarDevolucion(payload){
  const q = lsGet('vt_pending_devoluciones', []);
  q.push(payload);
  lsSet('vt_pending_devoluciones', q);
}

// Aplica una devolución completa en el servidor:
// 1) la registra, 2) regresa el artículo al inventario (+movimiento de rastro),
// 3) devuelve el dinero de caja, 4) si el día YA se cerró hoy, descuenta el 15%
//    de la ganancia devuelta de la comisión pendiente del vendedor de una vez.
//    Si el día aún no se cierra, queda marcada como no-aplicada y finalizarDia la descuenta.
async function aplicarDevolucionEnServidor(d){
  // Intento ATÓMICO primero: registra devolución + regresa producto + movimiento + saca de caja,
  // todo en una sola operación e idempotente por 'clave'. Si la función aún no existe en la base,
  // usamos el camino paso a paso de siempre.
  let devId = undefined; let usoAtomico = false; let yaAplicada = false;
  try{
    const { data, error } = await sb.rpc('devolver_atomico', {
      p_almacen:d.almacen_id, p_producto:d.producto_id, p_cantidad:d.cantidad,
      p_precio:d.precio_venta, p_costo:d.costo, p_metodo:d.metodo,
      p_nota:d.nota||'', p_fecha:d.fecha, p_clave:d.clave||'',
      p_nombre:d.nombre||'', p_almacen_nombre:d.almacen_nombre||''
    });
    if(error) throw error;
    usoAtomico = true;
    devId = data;              // id de la devolución, o null si ya estaba aplicada (idempotente)
    yaAplicada = (data == null);
  }catch(e){
    const msg = (e && (e.message||e.code||'')+'').toLowerCase();
    const faltaFuncion = msg.includes('does not exist') || msg.includes('not find') || msg.includes('42883') || msg.includes('schema cache') || msg.includes('404');
    if(!faltaFuncion) throw e; // error real (ej. permiso): que lo maneje quien llama
    // ---- Camino de respaldo (paso a paso, como antes) ----
    // Candado anti-duplicado por clave, si la columna existe.
    // Son cuatro pasos (anotar la devolución, regresar el producto, su movimiento y sacar el
    // dinero). Antes, si se cortaba después del primero, el reintento veía la devolución ya
    // anotada y SE SALÍA: el producto nunca regresaba y el dinero nunca salía de caja.
    // Ahora cada paso lleva su propia clave y el reintento termina lo que faltó.
    const k = d.clave || null;
    let previa = null;
    if(k){
      try{ const {data:ya} = await sb.from('devoluciones').select('id, aplicada').eq('clave_local', k).maybeSingle(); previa = ya || null; }catch(_){}
    }
    if(previa){
      devId = previa.id;
      if(previa.aplicada === true) return;          // completa de punta a punta: nada que hacer
    } else {
      const {data: devRow, error: e1} = await sb.from('devoluciones').insert({
        almacen_id: d.almacen_id, producto_id: d.producto_id, cantidad: d.cantidad,
        precio_venta: d.precio_venta, costo: d.costo, metodo: d.metodo,
        nota: d.nota || null, fecha: d.fecha, aplicada: false,
        ...(k ? {clave_local: k} : {})
      }).select().single();
      if(e1){
        // Si la columna clave_local no existe todavía, reintenta sin ella.
        if((e1.message||'').includes('clave_local') || (e1.message||'').includes('column')){
          const r2 = await sb.from('devoluciones').insert({
            almacen_id: d.almacen_id, producto_id: d.producto_id, cantidad: d.cantidad,
            precio_venta: d.precio_venta, costo: d.costo, metodo: d.metodo,
            nota: d.nota || null, fecha: d.fecha, aplicada: false
          }).select().single();
          if(r2.error) throw r2.error;
          devId = r2.data.id;
        } else throw e1;
      } else { devId = devRow.id; }
    }
    // El producto regresa UNA vez (con vuelta atrás si queda a medias).
    await aplicarLineaMovimiento({
      clave_local: k ? ('devmov-'+k) : null, tipo:'ingreso', origen_id: Number(d.almacen_id),
      producto_id: d.producto_id, cantidad: Number(d.cantidad),
      nota: 'Devolución de cliente' + (d.nota ? ' — ' + d.nota : '')
    });
    // El dinero sale de caja UNA vez. Si falla, lanza error y la devolución queda en cola.
    await meterMovimientoCajaUnico(
      {tipo:'egreso', metodo:d.metodo, categoria:'otro', monto: d.cantidad*d.precio_venta, concepto:`Devolución ${d.nombre} ×${num(d.cantidad)} — ${d.almacen_nombre}`},
      k ? ('devcaja-'+k) : null);
  }

  if(yaAplicada) return; // ya se había aplicado antes (reintento): no descontar comisión otra vez

  const gananciaDevuelta = d.cantidad * (d.precio_venta - d.costo);
  if(gananciaDevuelta > 0){
    // Busca la comisión del vendedor de ESE puesto que todavía NO se ha pagado.
    // Funciona con vendedor fijo (persona = nombre del puesto) y con comodín (la comisión
    // quedó a nombre del vendedor pero la nota lleva el puesto entre paréntesis, ej "(P 110)").
    const deudas = await traerTodasLasFilas(()=> sb.from('deudas').select('*').eq('tipo','debo').eq('pagada', false).order('id',{ascending:true}));
    const delPuesto = (deudas||[]).filter(x =>
      (x.nota||'').includes('Comisión 15%') &&
      ( x.persona === d.almacen_nombre || (x.nota||'').includes('('+d.almacen_nombre+')') )
    );
    // Preferimos la comisión de la MISMA fecha; si no existe (devolución otro día), tomamos
    // la más reciente pendiente de ese puesto → se le descuenta de su próximo pago.
    let objetivo = delPuesto.find(x => (x.nota||'').includes(`venta del ${d.fecha}`));
    if(!objetivo && delPuesto.length){
      objetivo = delPuesto.sort((a,b)=> Number(b.id||0) - Number(a.id||0))[0];
    }
    if(objetivo){
      const comisionARestar = gananciaDevuelta * 0.15;
      const nuevoMonto = redondearComision(Math.max(0, Number(objetivo.monto) - comisionARestar));
      // La rebaja de la comisión se hace UNA vez (clave propia) y se comprueba que se guardó.
      const claveCom = d.clave ? ('devcom-' + d.clave) : null;
      if(!(claveCom && claveMovYaAplicada(claveCom))){
        if(nuevoMonto <= 0.004){
          await escribirConReintento(()=> sb.from('deudas').update({monto:0, pagada:true, pagada_en:new Date().toISOString(), nota: objetivo.nota + ' (anulada por devoluciones)'}).eq('id', objetivo.id));
        } else {
          await escribirConReintento(()=> sb.from('deudas').update({monto: nuevoMonto, nota: objetivo.nota + ` (−$${comisionARestar.toFixed(2)} por devolución)`}).eq('id', objetivo.id));
        }
        if(claveCom) marcarClaveMovAplicada(claveCom);
      }
      if(devId){ try{ await escribirConReintento(()=> sb.from('devoluciones').update({aplicada:true}).eq('id', devId)); }catch(_){ /* se reintenta en el cierre del día */ } }
    }
  } else {
    if(devId){ try{ await escribirConReintento(()=> sb.from('devoluciones').update({aplicada:true}).eq('id', devId)); }catch(_){} }
  }
}

async function sincronizarDevolucionesPendientes(){
  await drenarCola('vt_pending_devoluciones', async d => {
    const saldo = await obtenerSaldoMetodo(d.metodo);
    const monto = d.cantidad * d.precio_venta;
    if(saldo < monto) throw new Error(`No hay suficiente ${d.metodo} en caja para devolver $${monto.toFixed(2)}.`);
    await aplicarDevolucionEnServidor(d);
  });
}

// ---------- MERCANCÍA RECIBIDA (rastro de lo que entra al puesto del vendedor) ----------
async function cargarMercanciaRecibida(){
  if(!puestoActual) return; // aún no se ha cargado el puesto: no hacemos nada (evita el cuelgue)
  const body = document.getElementById('recibidoBody');
  const empty = document.getElementById('recibidoEmpty');
  const cacheKey = 'vt_cache_recibido_' + puestoActual.id;
  let data;
  if(navigator.onLine){
    try{
      const res = await sb.from('movimientos').select('*').eq('almacen_destino_id', puestoActual.id).order('creado_en', {ascending:false}).limit(600);
      if(res.error) throw res.error;
      data = res.data || [];
      lsSet(cacheKey, data);
    }catch(e){ data = lsGet(cacheKey, []); }
  } else {
    data = lsGet(cacheKey, []);
  }
  const lista = data.filter(m => m.tipo==='ingreso' || m.tipo==='traslado');
  if(lista.length===0){ body.innerHTML=''; empty.style.display='block'; return; }
  empty.style.display='none';
  body.innerHTML = lista.map(m=>{
    const p = PRODUCTOS.find(x=>x.id===m.producto_id);
    const fecha = m.creado_en ? new Date(m.creado_en).toLocaleDateString() : '—';
    const tipoLabel = m.tipo==='ingreso' ? '📥 Ingreso' : '🔁 Traslado';
    return `<tr><td>${fecha}</td><td>${tipoLabel}</td><td>${p?p.nombre:'(producto eliminado)'}</td><td class="numcell">${num(Number(m.cantidad))}</td><td style="color:var(--muted)">${m.nota||'—'}</td></tr>`;
  }).join('');
} // candado: un doble toque no debe correr el cierre dos veces

// Revisa el stock de cada producto y devuelve una lista de textos con los que NO alcanzan,
// del tipo: "CABLE UTP (hay 12, necesita 100)". Sirve para decirle al vendedor EXACTAMENTE
// qué artículo corregir, en vez de un "no alcanza" genérico. `necesario` = {producto_id: cantidad}.
async function faltantesDeStock(almacenId, necesario, nombreDe){
  const faltan = [];
  for(const pid of Object.keys(necesario)){
    let hay = 0;
    try{
      const {data} = await sb.from('inventario').select('cantidad').eq('almacen_id', almacenId).eq('producto_id', Number(pid)).maybeSingle();
      hay = data ? Number(data.cantidad) : 0;
    }catch(e){ hay = 0; }
    if(hay < necesario[pid]) faltan.push({ nombre: nombreDe(pid), hay, necesita: necesario[pid] });
  }
  return faltan;
}

// Versión en texto (para logs, sync y como respaldo si no se puede mostrar el recuadro).
function faltantesTexto(faltan){
  return (faltan||[]).map(f=> `${f.nombre} (hay ${num(f.hay)}, necesita ${num(f.necesita)})`).join('; ');
}

// Solo la tabla de faltantes (Artículo · Hay · Necesita · Faltan). Se reutiliza tanto en el
// aviso de finalizar como en el detalle de pendientes.
function tablaFaltantesHTML(faltan){
  const filas = (faltan||[]).map(f=>{
    const faltanN = Number(f.necesita) - Number(f.hay);
    return `<tr>
      <td style="padding:9px 8px; border-top:1px solid var(--border); font-weight:600">${f.nombre}</td>
      <td style="padding:9px 8px; border-top:1px solid var(--border); text-align:right">${num(f.hay)}</td>
      <td style="padding:9px 8px; border-top:1px solid var(--border); text-align:right">${num(f.necesita)}</td>
      <td style="padding:9px 8px; border-top:1px solid var(--border); text-align:right; color:var(--red); font-weight:800">-${num(faltanN)}</td>
    </tr>`;
  }).join('');
  return `<table style="width:100%; border-collapse:collapse; font-size:14px">
      <thead>
        <tr style="color:var(--muted); font-size:12px; text-transform:uppercase; letter-spacing:.03em">
          <th style="padding:0 8px 6px; text-align:left">Artículo</th>
          <th style="padding:0 8px 6px; text-align:right">Hay</th>
          <th style="padding:0 8px 6px; text-align:right">Necesita</th>
          <th style="padding:0 8px 6px; text-align:right">Faltan</th>
        </tr>
      </thead>
      <tbody>${filas}</tbody>
    </table>`;
}

// Recuadro bonito para avisar que no alcanza el inventario al FINALIZAR: tarjeta con borde rojo,
// margen, ícono y la tabla. Usa las variables de color de la app (se ve bien en oscuro y claro).
function avisoFaltantesHTML(faltan){
  return `
  <div style="border:1px solid var(--red); background:rgba(255,92,92,.08); border-radius:14px; padding:16px; margin-top:12px">
    <div style="display:flex; align-items:center; gap:10px">
      <span style="font-size:22px; line-height:1">⚠️</span>
      <div style="font-weight:800; font-size:16px; color:var(--red)">No se pudo finalizar — falta inventario</div>
    </div>
    <div style="color:var(--muted); font-size:13px; margin:8px 0 12px">No se descontó nada. Ajusta las cantidades de estos artículos y vuelve a intentar:</div>
    ${tablaFaltantesHTML(faltan)}
  </div>`;
}

// ---------- MODAL DE INFO (recuadro propio, para no usar el alert() feo del navegador) ----------
function abrirModalInfo(titulo, htmlInterior){
  const previa = document.getElementById('modalInfoOverlay');
  if(previa) previa.remove();
  const ov = document.createElement('div');
  ov.id = 'modalInfoOverlay';
  ov.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,.55); z-index:10000; display:flex; align-items:center; justify-content:center; padding:16px';
  ov.innerHTML = `
    <div style="background:var(--panel); border:1px solid var(--border); border-radius:16px; max-width:540px; width:100%; max-height:85vh; display:flex; flex-direction:column; box-shadow:0 20px 60px rgba(0,0,0,.45)">
      <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; padding:16px 18px; border-bottom:1px solid var(--border)">
        <div style="font-weight:800; font-size:17px">${titulo}</div>
        <button onclick="cerrarModalInfo()" style="background:var(--panel2); border:1px solid var(--border); color:var(--text); border-radius:8px; padding:6px 14px; cursor:pointer; font-size:14px; font-weight:600">Cerrar</button>
      </div>
      <div style="padding:16px 18px; overflow:auto">${htmlInterior}</div>
    </div>`;
  ov.addEventListener('click', e=>{ if(e.target === ov) cerrarModalInfo(); });
  document.body.appendChild(ov);
}
function cerrarModalInfo(){ const ov = document.getElementById('modalInfoOverlay'); if(ov) ov.remove(); }

// Una tarjeta para cada elemento pendiente de subir (venta, pedido o devolución).
function tarjetaPendiente(titulo, sub, extra, articulos, errorTxt, faltantes, intentos){
  const trabado = (intentos||0) >= 3;
  let bloqueError;
  if(faltantes && faltantes.length){
    bloqueError = `<div style="border:1px solid var(--red); background:rgba(255,92,92,.08); border-radius:10px; padding:12px; margin-top:10px">
        <div style="color:var(--red); font-weight:700; font-size:13px; margin-bottom:8px">⚠️ Se vendió mercancía que NO se descontó — falta inventario</div>
        ${tablaFaltantesHTML(faltantes)}
      </div>`;
  } else if(errorTxt){
    bloqueError = `<div style="border:1px solid var(--red); background:rgba(255,92,92,.08); border-radius:10px; padding:10px 12px; margin-top:10px; font-size:13px; color:var(--red)"><strong>${trabado?'⚠️ Lleva varios intentos: ':'Último error: '}</strong>${errorTxt}</div>`;
  } else {
    bloqueError = `<div style="color:var(--muted); font-size:12px; margin-top:10px">Esperando conexión…</div>`;
  }
  return `
  <div style="border:1px solid var(--border); background:var(--panel2); border-radius:12px; padding:14px; margin-bottom:12px">
    <div style="display:flex; align-items:baseline; justify-content:space-between; gap:8px">
      <div style="font-weight:800">${titulo}</div>
      <div style="color:var(--muted); font-size:12px">${sub}</div>
    </div>
    <div style="font-size:14px; margin-top:4px">${extra}</div>
    ${articulos?`<div style="color:var(--muted); font-size:13px; margin-top:4px">${articulos}</div>`:''}
    ${bloqueError}
  </div>`;
}

async function finalizarDia(){
  if(!puestoActual){ alert('Espera unos segundos: todavía se está cargando tu puesto.'); return; }
  // Lógica: si el cierre ya está corriendo, el segundo toque no hace nada. Sin esto,
  // dos toques rápidos duplicaban el registro de caja y la comisión.
  if(finalizandoDia) return;
  finalizandoDia = true;
  const btnFin = document.getElementById('btnFinalizarDia');
  if(btnFin){ btnFin.disabled = true; }
  // Pantalla bloqueante "Subiendo…": evita que cierren la app a mitad de la subida y pierdan la venta.
  mostrarSubiendo('Subiendo la venta…');
  try{
    await finalizarDiaInterno();
  } finally {
    finalizandoDia = false;
    quitarSubiendo();
    if(btnFin){ btnFin.disabled = false; }
  }
}

async function finalizarDiaInterno(){
  const msgEl = document.getElementById('finalizarMsg');
  let diaCerradoOk = false; // se pone true en cuanto el día queda cerrado en la base

  if(carrito.length===0 && cobrosEnCarrito.length===0){
    msgEl.textContent='No hay nada que finalizar (agrega artículos o un cobro pendiente).'; msgEl.className='msg err'; return;
  }

  let totalProductos = 0;
  for(const it of carrito) totalProductos += it.cantidad*it.precio_venta;
  const totalCobros = cobrosEnCarrito.reduce((s,c)=> s + c.monto, 0);
  const total = totalProductos - totalCobros; // lo que realmente hay que entregar

  // ---------- CASO ESPECIAL: solo cobro, sin ninguna venta nueva ----------
  if(carrito.length===0){
    if(!navigator.onLine){ msgEl.textContent='Necesitas internet para cobrar.'; msgEl.className='msg err'; return; }
    try{
      const saldo = await obtenerSaldoMetodo('efectivo');
      if(saldo < totalCobros){
        msgEl.textContent = `No hay suficiente efectivo registrado en caja para cobrar esto (hay $${num(saldo)}). Pide al dueño/administrador que revise el dinero del negocio.`;
        msgEl.className='msg err';
        return;
      }
    }catch(err){
      msgEl.textContent = 'Error: ' + (err.message||err); msgEl.className='msg err'; return;
    }
    if(!confirm(`¿Cobrar $${num(totalCobros)}? Esto sale del efectivo que tienes en caja.`)) return;
    try{
      // COBRO SIN VENTA, en dos pasos seguros. Antes ninguno de los dos se comprobaba: si el
      // "pagada" no llegaba a guardarse, la deuda seguía pendiente y se podía cobrar OTRA vez;
      // y si lo que fallaba era la caja, se cobraba sin que saliera el dinero.
      // 1) Se RECLAMA cada deuda solo si sigue pendiente (nadie la puede cobrar dos veces).
      const reclamadas = [];
      const soltar = async (lista) => { for(const x of lista){ try{ await escribirConReintento(()=> sb.from('deudas').update({pagada:false, pagada_en:null}).eq('id', x.deudaId)); }catch(_){ try{ registrarError('cobro/sin-venta','Una deuda quedó marcada como pagada sin salir el dinero','deuda '+x.deudaId); }catch(__){} } } };
      for(const c of cobrosEnCarrito){
        const rRec = await sb.from('deudas').update({pagada:true, pagada_en:new Date().toISOString()}).eq('id', c.deudaId).eq('pagada', false).select();
        if(rRec && rRec.error){ await soltar(reclamadas.concat([c])); throw new Error(rRec.error.message || 'no se pudo marcar el cobro'); }
        if(rRec.data && rRec.data.length) reclamadas.push(c);
      }
      if(!reclamadas.length){
        msgEl.textContent = 'Esos pagos ya estaban cobrados. No se cobró nada de nuevo.'; msgEl.className='msg';
        cobrosEnCarrito = []; renderCarrito(); await cargarCobros();
        return;
      }
      const totalReal = Math.round(reclamadas.reduce((t,c)=>t+Number(c.monto||0),0)*100)/100;
      // 2) El dinero sale de caja UNA vez (clave única). Si no se puede, se sueltan las deudas.
      try{
        await meterMovimientoCajaUnico({tipo:'egreso', metodo:'efectivo', categoria:'otro', monto:totalReal, concepto:`Cobro de pago pendiente — ${puestoActual.nombre}`},
          'cobrosv-' + reclamadas.map(c=>c.deudaId).sort().join('-'));
      }catch(eCaja){ await soltar(reclamadas); throw eCaja; }
      msgEl.textContent = `Cobraste $${num(totalReal)}.`; msgEl.className='msg ok';
      cobrosEnCarrito = [];
      renderCarrito();
      await cargarCobros();
    }catch(err){
      msgEl.textContent = 'Error: ' + (err.message||err); msgEl.className='msg err';
    }
    return;
  }

  const efectivo = Number(document.getElementById('finEfectivo').value) || 0;
  const tarjeta = Number(document.getElementById('finTarjeta').value) || 0;
  const sobrante = Number(document.getElementById('finSobrante').value) || 0;
  const diferencia = Math.abs((efectivo+tarjeta) - total);
  if(diferencia > 0.01){
    const detalleCobro = totalCobros>0 ? ` (ya con tu cobro de $${num(totalCobros)} restado)` : '';
    msgEl.textContent = `Efectivo + tarjeta ($${num(efectivo+tarjeta)}) no coincide con el total a entregar${detalleCobro} ($${num(total)}). Ajusta los montos.`;
    msgEl.className='msg err';
    return;
  }
  if(!confirm('¿Finalizar el día? Esto descontará los artículos del inventario y no podrás seguir agregando ventas a este día.')) return;

  const fecha = fechaHoyLocal();
  const cobrosAProcesar = cobrosEnCarrito.slice(); // copia, por si algo falla a medio camino

  // RESPALDO DE SEGURIDAD: antes de tocar nada, guardamos una copia del carrito y los cobros
  // en el teléfono. Si CUALQUIER cosa sale mal durante el cierre, este respaldo permite recuperar
  // los datos del vendedor. Solo se borra al final, cuando TODO se confirmó guardado.
  const claveRespaldo = 'vt_respaldo_finalizar_'+puestoActual.id+'_'+usuarioActual.id;
  const respaldoSeguridad = {
    carrito: carrito.map(it=>({...it})),
    cobros: cobrosAProcesar.slice(),
    efectivo_input: document.getElementById('finEfectivo').value,
    tarjeta_input: document.getElementById('finTarjeta').value,
    fecha, ts: Date.now()
  };
  try{ lsSet(claveRespaldo, respaldoSeguridad); }catch(e){}

  // ---------- SIN INTERNET: guardamos todo en el teléfono para sincronizar después ----------
  if(!navigator.onLine || modoLocal){
    const pendientes = lsGet('vt_pending_days', []);
    const nuevoPendiente = {
      clave_local: 'vd_' + puestoActual.id + '_' + Date.now() + '_' + Math.random().toString(36).slice(2,8), // identificador único para no duplicar al sincronizar
      almacen_id: puestoActual.id, almacen_nombre: puestoActual.nombre, fecha,
      cobra_comision: esComodin() ? usuarioActual.nombre : puestoActual.nombre, // a nombre de quién va la comisión
      es_comodin: esComodin(),
      usuario_id: usuarioActual.id, // el perfil dueño de esta venta (para que sea suya en cualquier teléfono)
      items: carrito.map(it=>({producto_id:it.producto_id, nombre:it.nombre, cantidad:it.cantidad, precio_venta:it.precio_venta, costo:it.costo})),
      cobros: cobrosAProcesar, // [{deudaId, monto}]
      efectivo, tarjeta, sobrante, total: totalProductos // el total bruto real de la venta (los cobros se aplican al sincronizar)
    };
    pendientes.push(nuevoPendiente);
    lsSet('vt_pending_days', pendientes);

    // VERIFICACIÓN CRÍTICA: releer lo que quedó guardado. Si el teléfono NO guardó el pendiente
    // (memoria llena, navegador viejo que no persiste, modo incógnito...), NO limpiamos el carrito
    // para que el vendedor no pierda su venta. Le avisamos que lo intente de nuevo.
    const verificar = lsGet('vt_pending_days', []);
    const seGuardo = verificar.some(p => p.clave_local === nuevoPendiente.clave_local);
    if(!seGuardo){
      msgEl.textContent = '⚠️ No se pudo guardar la venta en este teléfono (puede estar lleno el almacenamiento o el navegador no guarda datos). NO se perdió nada: tus artículos siguen aquí. Intenta de nuevo o usa otro teléfono/navegador.';
      msgEl.className = 'msg err';
      return; // el carrito queda intacto
    }

    lsSet('vt_carrito_'+puestoActual.id+'_'+usuarioActual.id, []);
    try{ localStorage.removeItem('vt_carrito_'+puestoActual.id+'_'+usuarioActual.id); }catch(e){}
    try{ localStorage.removeItem(claveRespaldo); }catch(e){}

    msgEl.textContent = '✓ Venta guardada en el teléfono. Se subirá sola cuando vuelva el internet. NO la vuelvas a entrar: no se perdió.';
    msgEl.className='msg ok';
    pantallaPendiente('¡Venta guardada!', 'No hay internet ahora. La venta quedó guardada en el teléfono y se subirá sola cuando vuelva la conexión. No la vuelvas a entrar.');
    carrito = []; cobrosEnCarrito = []; ventaActualInicio = 0; ventaDiaAbiertaId = null;
    document.getElementById('finEfectivo').value=''; document.getElementById('finTarjeta').value=''; document.getElementById('finSobrante').value='';
    document.getElementById('finEfectivo').dataset.tocado='';
    renderCarrito();
    actualizarConexionUI();
    return;
  }

  // ---------- CON INTERNET: flujo normal ----------
  try{
    // GARANTÍA PREVIA: debe existir un día de venta abierto en la base para colgarle la venta.
    // Si por alguna razón no lo tenemos (se perdió la referencia, se abrió en otro momento),
    // lo buscamos o creamos AHORA, antes de descontar nada. Sin esto, el descuento se haría
    // pero el día no se cerraría — justo el problema de "la venta no pasa".
    if(!ventaDiaAbiertaId){
      const hoy = fechaHoyLocal();
      let diaExistente = null;
      try{
        const r = await sb.from('ventas_dia').select('*')
          .eq('almacen_id', puestoActual.id).eq('fecha', hoy).eq('cerrado', false)
          .eq('usuario_id', usuarioActual.id).order('id', {ascending:true});
        diaExistente = (r.data || [])[0] || null;
      }catch(e){
        const r = await sb.from('ventas_dia').select('*')
          .eq('almacen_id', puestoActual.id).eq('fecha', hoy).eq('cerrado', false).order('id', {ascending:true});
        diaExistente = (r.data || [])[0] || null;
      }
      if(diaExistente){
        ventaDiaAbiertaId = diaExistente.id;
      } else {
        const fila = {almacen_id:puestoActual.id, fecha:hoy, usuario_id: usuarioActual.id};
        let r = await sb.from('ventas_dia').insert(fila).select().single();
        if(r.error && ((r.error.message||'').includes('usuario_id') || (r.error.message||'').includes('column'))){
          delete fila.usuario_id;
          r = await sb.from('ventas_dia').insert(fila).select().single();
        }
        if(r.error) throw r.error;
        ventaDiaAbiertaId = r.data.id;
      }
    }

    // Asignamos una clave única a cada línea del carrito ANTES de verificar o descontar. Así,
    // si un reintento vuelve a entrar aquí, reconocemos qué líneas ya se aplicaron por su clave.
    for(const it of carrito){
      if(!it.clave_local){
        it.clave_local = 'vt_' + ventaDiaAbiertaId + '_' + it.producto_id + '_' + Date.now() + '_' + Math.random().toString(36).slice(2,6);
      }
    }

    // CANDADO CONTRA VENTAS REPETIDAS (robusto): se pueden guardar varias ventas el mismo día,
    // pero NO dos exactamente iguales (mismos artículos, cantidades, precios y total). Eso casi
    // siempre es la misma venta subida dos veces (doble toque, o el carrito reapareció en otro
    // teléfono). Comparamos por HUELLA agregada y por total, y con los artículos ya limpios de
    // duplicados, así reconoce el repetido aunque los datos viejos estén raros.
    const firmaActual = firmaVenta(carrito);
    const totalActual = Number(totalProductos.toFixed(2));
    const gemela = await buscarVentaGemelaHoy(firmaActual, totalActual, ventaDiaAbiertaId);
    if(gemela){
      throw new Error(`REPETIDA: Esta venta ya se registró hoy en ${puestoActual.nombre} (mismos artículos y total $${num(totalActual)}). La app la reconoció como repetida y NO la volvió a descontar. Si de verdad es OTRA venta distinta, cambia alguna cantidad o precio.`);
    }

    // ===== VÍA ATÓMICA (la más segura): una sola operación en la base hace TODO —verifica el
    // stock, descuenta cada producto, registra los movimientos, guarda los artículos y cierra el
    // día— dentro de UNA transacción. Si cualquier paso falla, la base revierte TODO sola: la
    // venta NUNCA queda a la mitad. Requiere haber creado la función 'descontar_y_cerrar_venta'
    // en Supabase (te paso el SQL). Si esa función aún no existe, se usa la vía normal de abajo,
    // que también es "todo o nada" pero en varios pasos.
    let cerradoPorRPC = false;
    try{
      const {error: rpcErr} = await sb.rpc('descontar_y_cerrar_venta', {
        p_venta_dia_id: ventaDiaAbiertaId,
        p_almacen_id: puestoActual.id,
        p_fecha: fecha,
        p_total: totalProductos,
        p_items: carrito.map(it=>({producto_id: it.producto_id, cantidad: it.cantidad, precio_venta: it.precio_venta, costo: it.costo}))
      });
      if(rpcErr){
        const m = (rpcErr.message||'').toLowerCase();
        if(m.includes('stock_insuficiente') || m.includes('no alcanza') || (m.includes('inventario') && !m.includes('column') && !m.includes('relation'))){
          // La base solo dice "no alcanza" sin decir de cuál producto. Aquí revisamos cada
          // artículo y armamos un mensaje que nombra EXACTAMENTE el/los que faltan.
          const necesarioDiag = {};
          for(const it of carrito){ necesarioDiag[it.producto_id] = (necesarioDiag[it.producto_id]||0) + Number(it.cantidad); }
          const faltan = await faltantesDeStock(puestoActual.id, necesarioDiag, pid => (carrito.find(x=>Number(x.producto_id)===Number(pid))||{}).nombre || ('producto '+pid));
          const detalle = faltan.length ? ` Falta: ${faltantesTexto(faltan)}.` : '';
          const eStock = new Error(`No alcanza el inventario, por eso NADA se descontó.${detalle} Corrige esas cantidades e intenta de nuevo.`);
          eStock.faltantes = faltan;
          throw eStock;
        }
        // Si la función no existe todavía, no es un error real: seguimos por la vía normal.
        const noExiste = m.includes('does not exist') || m.includes('could not find') || m.includes('not found') || m.includes('schema cache') || m.includes('pgrst202') || m.includes('function');
        if(!noExiste) throw rpcErr;
      } else {
        cerradoPorRPC = true;
        diaCerradoOk = true;
      }
    }catch(eRPC){
      if((eRPC.message||'').startsWith('No alcanza')) throw eRPC;
      // ¿La base SÍ cerró la venta y solo se perdió la respuesta? Hay que saberlo antes de
      // seguir por pasos: si no, se volvería a revisar el stock (ya descontado) y la venta
      // saldría como "no alcanza" estando hecha.
      let yaQuedo = false;
      try{ yaQuedo = await ventaYaCerradaEnServidor(ventaDiaAbiertaId, [...new Set(carrito.map(it=>String(it.producto_id)))]); }
      catch(eV){ throw new Error('Se cortó la conexión al cerrar la venta y no se pudo confirmar si quedó registrada. Espera un momento y toca Finalizar otra vez: no se va a descontar doble.'); }
      if(yaQuedo){ cerradoPorRPC = true; diaCerradoOk = true; }
      // Cualquier otro problema con la RPC: caemos a la vía normal (respaldo).
    }

    if(!cerradoPorRPC){
    // TODO O NADA: primero sumamos cuánto se necesita de CADA producto (juntando las líneas
    // repetidas del carrito) y verificamos que TODO alcance ANTES de descontar nada. Si algo
    // no alcanza, no se toca el inventario, no se registra caja ni comisión: la venta no cierra
    // y el vendedor corrige. Así nunca queda a medias ni en negativo.
    const necesarioPorProducto = {};
    for(const it of carrito){
      necesarioPorProducto[it.producto_id] = (necesarioPorProducto[it.producto_id] || 0) + it.cantidad;
    }
    // Lo que un intento anterior de ESTA venta ya descontó no se vuelve a revisar: ese
    // inventario ya bajó, y revisarlo otra vez hacía salir "no alcanza" con la venta a medias.
    const faltaDescontar = {};
    for(const pid of Object.keys(necesarioPorProducto)){
      const cl = 'vtp_' + ventaDiaAbiertaId + '_' + pid;
      if(productoDeVentaYaDescontado(cl) || await movimientoYaRegistrado(cl)) continue;
      faltaDescontar[pid] = necesarioPorProducto[pid];
    }
    const faltanProd = await faltantesDeStock(puestoActual.id, faltaDescontar, pid => (carrito.find(x=>Number(x.producto_id)===Number(pid))||{}).nombre || 'un producto');
    if(faltanProd.length > 0){
      const eStock = new Error(`No alcanza el inventario, por eso NADA se descontó. Falta: ${faltantesTexto(faltanProd)}. Corrige esas cantidades e intenta de nuevo.`);
      eStock.faltantes = faltanProd;
      throw eStock;
    }

    // DESCUENTO TODO-O-NADA. Descontamos producto por producto (la base no permite hacerlo en
    // un solo golpe), PERO con dos protecciones para que nunca se descuente doble ni a medias:
    //  1) Cada línea lleva una clave única y se marca "aplicada" apenas se descuenta. Si la
    //     conexión se corta a mitad, al reintentar se SALTAN las ya aplicadas — jamás se repiten.
    //  2) Volvemos a verificar el stock de TODO justo aquí (por si cambió entre la primera
    //     verificación y ahora), así no empezamos a descontar algo que ya no alcanza.
    for(const pid of Object.keys(faltaDescontar)){
      const {data} = await sb.from('inventario').select('cantidad').eq('almacen_id', puestoActual.id).eq('producto_id', Number(pid)).maybeSingle();
      const actual = data ? Number(data.cantidad) : 0;
      // Descontamos cuánto queda por aplicar de este producto (lo ya aplicado no cuenta)
      let faltaAplicar = 0;
      for(const it of carrito){
        if(it.producto_id === Number(pid) && it.aplicado !== true && !claveMovYaAplicada(it.clave_local)) faltaAplicar += it.cantidad;
      }
      if(actual < faltaAplicar){
        const nombre = (carrito.find(x=>x.producto_id===Number(pid))||{}).nombre || 'un producto';
        throw new Error(`No alcanza el inventario de "${nombre}": hay ${actual} y falta descontar ${faltaAplicar}. La venta NO se cerró y NADA nuevo se descontó.`);
      }
    }

    // Descuento AGRUPADO por producto: aunque el mismo artículo esté en varias líneas del carrito
    // (ej. cuchillo 1 + cuchillo 2), se descuenta UNA sola vez su cantidad TOTAL y se registra UN
    // solo movimiento con el "antes → después" correcto. La clave por producto (vtp_día_producto)
    // hace que, si la conexión se corta a mitad, un reintento NO descuente de nuevo.
    for(const pid of Object.keys(necesarioPorProducto)){
      const claveProd = 'vtp_' + ventaDiaAbiertaId + '_' + pid;
      await descontarProductoDeVenta(claveProd, puestoActual.id, Number(pid), necesarioPorProducto[pid], 'Venta del día', ventaDiaAbiertaId);
    }
    for(const it of carrito){ it.aplicado = true; }

    // GARANTÍA DE venta_items: el inventario se descuenta del carrito en memoria, pero
    // Estadísticas, la ganancia, el ranking y las comisiones se calculan de la tabla venta_items.
    // guardarItemsEnDB() los guarda EN VIVO mientras se arma el carrito, PERO puede no haber
    // corrido (modo local temporal, día aún sin crear, o un corte breve de red). Si eso pasa,
    // el día se cerraría con el inventario descontado pero SIN venta_items → Estadísticas mostraría
    // "$0 / 0 ganancia" aunque el historial (que usa el campo total) se vea bien. Para que nunca
    // queden descuadrados, aquí volvemos a escribir los venta_items desde el carrito (borrar +
    // insertar es idempotente: si ya estaban, quedan igual; si faltaban, se crean).
    try{
      await escribirConReintento(()=> sb.from('venta_items').delete().eq('venta_dia_id', ventaDiaAbiertaId));
      const filasItemsFin = carrito.map(it=>({
        venta_dia_id: ventaDiaAbiertaId, producto_id: it.producto_id, cantidad: it.cantidad,
        precio_venta: it.precio_venta, costo: it.costo
      }));
      if(filasItemsFin.length>0){
        const {error: eItemsFin} = await sb.from('venta_items').insert(filasItemsFin);
        if(eItemsFin) throw eItemsFin;
      }
    }catch(errItems){
      // Si esto falla, NO cerramos el día a medias: sería el mismo descuadre. Avisamos y salimos;
      // el inventario ya descontado queda marcado por clave_local, así que un reintento no lo repite.
      throw new Error('No se pudieron guardar los artículos de la venta (Estadísticas quedaría en $0). Revisa la conexión e intenta finalizar de nuevo. Detalle: ' + (errItems.message||errItems));
    }

    // CERRAR EL DÍA — se hace JUSTO DESPUÉS de descontar y ANTES de caja/comisión.
    // Motivo: si el inventario ya se descontó, el día TIENE que quedar cerrado sí o sí; de lo
    // contrario aparecería como "venta del día" en el historial pero "en curso" en estadísticas.
    // Marcamos también diaCerradoOk para que, si algo falla después, el reintento no vuelva a cerrar.
    await escribirConReintento(()=> sb.from('ventas_dia').update({cerrado:true, total: totalProductos, cerrado_en:new Date().toISOString()}).eq('id', ventaDiaAbiertaId));
    diaCerradoOk = true;
    } // fin de if(!cerradoPorRPC) — la vía normal (respaldo) termina aquí; la atómica ya cerró el día
    // Por seguridad: cerrar CUALQUIER otro día que haya quedado abierto de este mismo puesto hoy,
    // para que no reaparezcan artículos viejos al abrir el siguiente día.
    // IMPORTANTE: solo cerramos los días de ESTE usuario, nunca los de otra trabajadora
    // que comparta el mismo puesto (cada quien tiene su propia venta y su salario aparte).
    try{
      let q = sb.from('ventas_dia').update({cerrado:true, cerrado_en:new Date().toISOString()})
        .eq('almacen_id', puestoActual.id).eq('fecha', fecha).eq('cerrado', false);
      try{ await q.eq('usuario_id', usuarioActual.id); }
      catch(e){ /* si no existe la columna usuario_id, no cerramos en masa para no afectar a otras */ }
    }catch(e){ /* no crítico */ }

    // Registrar el dinero en caja. Como "efectivo" y "tarjeta" ya vienen netos (con el cobro restado),
    // esto por sí solo refleja correctamente cuánto entró de verdad a la caja — sin duplicar el descuento.
    // Va por registrarDineroDeVenta(): con clave única, sin duplicar y con cola de reintento.
    await registrarDineroDeVenta({
      venta_dia_id: ventaDiaAbiertaId, almacen_id: puestoActual.id,
      nombre_puesto: puestoActual.nombre, fecha, efectivo, tarjeta, sobrante
    });

    // Comisión: 15% de la ganancia del día (venta - costo) queda como deuda a nombre del puesto
    // (no se le muestra el detalle al vendedor, solo queda registrado para administración)
    let costoTotal = 0;
    for(const it of carrito) costoTotal += it.cantidad * it.costo;
    const ganancia = totalProductos - costoTotal;

    // PROTECCIÓN: si algún producto vendido tiene costo 0, la "ganancia" sería igual a la venta
    // completa y la comisión saldría inflada (15% de la venta en vez de 15% de la ganancia).
    // Avisamos al dueño en la nota para que lo detecte y corrija el costo del producto.
    const sinCosto = carrito.filter(it => !it.costo || Number(it.costo) === 0);
    const avisoSinCosto = sinCosto.length > 0
      ? ` ⚠️ OJO: ${sinCosto.length} producto(s) sin costo registrado (${sinCosto.map(i=>i.nombre).join(', ')}) — la ganancia y la comisión pueden estar infladas. Ponles el costo real.`
      : '';

    // Las devoluciones de HOY que aún no se hayan descontado de ninguna comisión
    // se restan de la ganancia antes de calcular el 15% (y se marcan como aplicadas
    // para que nunca se descuenten dos veces, aunque el día se cierre varias veces).
    let gananciaDevueltaHoy = 0;
    let devsHoy = [];
    try{
      const rDevs = await sb.from('devoluciones').select('*').eq('almacen_id', puestoActual.id).eq('fecha', fecha).eq('aplicada', false);
      devsHoy = rDevs.data || [];
      for(const d of devsHoy) gananciaDevueltaHoy += Number(d.cantidad)*(Number(d.precio_venta)-Number(d.costo));
    }catch(e){ /* si la tabla no existe todavía, se sigue sin descuento */ }

    const gananciaNeta = ganancia - gananciaDevueltaHoy;
    if(gananciaNeta > 0){
      const comision = redondearComision(gananciaNeta * 0.15);
      // ¿A nombre de quién queda la comisión para cobrar?
      // - Vendedora con puesto fijo: a nombre del PUESTO (como siempre).
      // - Trabajadora comodín (sin puesto fijo): a nombre de ELLA, para que la cobre
      //   en su propia cuenta sin importar en qué puesto haya trabajado ese día.
      const quienCobra = esComodin() ? usuarioActual.nombre : puestoActual.nombre;
      // CANDADO: una sola comisión por día de venta. La clave (comvta-IDdía) evita que,
      // si el día se cierra o sincroniza dos veces, se cree la comisión del vendedor doble.
      const claveComVta = 'comvta-' + ventaDiaAbiertaId;
      let comisionYaExiste = false;
      // Si NO se pudo comprobar (se cortó la conexión), no se puede dar por hecho que no existe:
      // crearla a ciegas podía duplicarla. Se manda a la cola, que comprueba bien antes de crear.
      let lecturaComFallo = false;
      try{
        const rYaCom = await sb.from('deudas').select('id').eq('clave_comision', claveComVta);
        if(rYaCom.error){
          const mY = String(rYaCom.error.message||'').toLowerCase();
          if(!(mY.includes('clave_comision') || mY.includes('column') || mY.includes('schema cache'))) lecturaComFallo = true;
        } else comisionYaExiste = !!(rYaCom.data && rYaCom.data.length > 0);
      }catch(e){ lecturaComFallo = true; }

      if(!comisionYaExiste){
        const filaCom = {
          tipo: 'debo',
          persona: quienCobra,
          monto: comision,
          nota: `Comisión 15% de ganancia ($${num(gananciaNeta)})${gananciaDevueltaHoy>0?` (ya restada ganancia devuelta $${num(gananciaDevueltaHoy)})`:''} - venta del ${fecha}${esComodin()?` (${puestoActual.nombre})`:''}${avisoSinCosto}`,
          clave_comision: claveComVta,
          venta_dia_id: ventaDiaAbiertaId   // vínculo con la venta, para poder soltarla si se borra
        };
        // OJO: el día YA quedó cerrado más arriba. Si aquí se cae la conexión, antes la
        // excepción se escapaba y la comisión se perdía EN SILENCIO (no se creaba ni se
        // encolaba). Ahora cualquier fallo — error del servidor O corte de internet —
        // cae en el mismo sitio y la comisión queda en la cola para crearse sola.
        try{
          if(lecturaComFallo) throw new Error('no se pudo comprobar si la comisión ya existía (se cortó la conexión)');
          let rCom = await sb.from('deudas').insert(filaCom);
          if(rCom.error && ((rCom.error.message||'').includes('clave_comision') || (rCom.error.message||'').includes('column'))){
            delete filaCom.clave_comision;
            rCom = await sb.from('deudas').insert(filaCom);
          }
          if(rCom.error) throw new Error(rCom.error.message||'error al crear la comisión');
        }catch(eCom){
          const motivo=(eCom&&eCom.message)||String(eCom);
          console.error('COMISIÓN NO CREADA al cerrar:', motivo, filaCom);
          try{ const log=lsGet('com_fallidas',[]); log.push({fila:{tipo:'debo',persona:quienCobra,monto:comision,nota:filaCom.nota,clave_comision:claveComVta,venta_dia_id:ventaDiaAbiertaId}, fecha, persona:quienCobra, monto:comision, venta_dia_id:ventaDiaAbiertaId, error:motivo, ts:Date.now()}); lsSet('com_fallidas',log); }catch(e){}
          try{ registrarError('comision/cierre','No se pudo crear la comisión al cerrar el día (quedó en cola para reintentar)',motivo); }catch(e){}
        }
      }
    }
    // Protegido: si esto falla, NO puede impedir que los cobros se marquen como pagados.
    for(const d of devsHoy){
      try{ await escribirConReintento(()=> sb.from('devoluciones').update({aplicada:true}).eq('id', d.id)); }catch(e){ /* no crítico */ }
    }

    // Marcar como pagados los cobros que venían en el carrito (ya están descontados arriba, en el
    // efectivo/tarjeta netos — por eso aquí NO se crea un egreso aparte, sería restarlo dos veces).
    // Se vinculan a este día para que aparezcan también en el historial.
    // Si se cae la conexión aquí, antes el cobro quedaba SIN marcar y le seguía apareciendo
    // para cobrar otra vez. Ahora queda en cola y se marca solo al volver el internet.
    for(const c of cobrosAProcesar){
      // Se intenta VARIAS veces y además se COMPRUEBA leyendo de vuelta. Antes bastaba con que
      // la escritura no diera error; si aun así no se guardaba, el único rastro quedaba en este
      // teléfono y nadie más se enteraba de que esa venta cobró esa deuda.
      const marcado = await marcarCobroConReintento(c.deudaId, ventaDiaAbiertaId);
      if(!marcado){
        try{ const q=lsGet('cobros_fallidos',[]); q.push({deudaId:c.deudaId, monto:c.monto, venta_dia_id:ventaDiaAbiertaId, ts:Date.now()}); lsSet('cobros_fallidos',q); }catch(e){}
        try{ registrarError('cobro/cierre','No se pudo marcar el cobro como pagado (quedó en cola; el dueño lo repara solo)','deuda '+c.deudaId); }catch(e){}
      }
    }

    // CONFIRMACIÓN VISUAL: pantalla completa verde con palomita que se quita sola
    pantallaExito('¡Día guardado!', `Venta total: $${num(totalProductos)}${totalCobros > 0 ? ` — Entregaste: $${num(total)}` : ''}`);
    msgEl.innerHTML = ''; msgEl.className='msg';
    carrito = []; cobrosEnCarrito = []; ventaDiaAbiertaId = null; ventaActualInicio = 0;
    lsSet('vt_carrito_'+puestoActual.id+'_'+usuarioActual.id, []);
    // Borrar por completo el respaldo del teléfono de este puesto, para que al abrir el
    // día nuevo NO se recarguen los artículos que ya se vendieron.
    try{ localStorage.removeItem('vt_carrito_'+puestoActual.id+'_'+usuarioActual.id); }catch(e){}
    diaRecienFinalizado = true; // le avisa a buscarOAbrirVentaDia que empiece en blanco
    document.getElementById('finEfectivo').value=''; document.getElementById('finTarjeta').value=''; document.getElementById('finSobrante').value='';
    document.getElementById('finEfectivo').dataset.tocado='';
    renderCarrito();
    await buscarOAbrirVentaDia(); // abre un nuevo día limpio
    diaRecienFinalizado = false;
    await cargarHistorialDias();
    // ÉXITO TOTAL confirmado: ahora sí borramos el respaldo de seguridad.
    try{ localStorage.removeItem(claveRespaldo); }catch(e){}
  }catch(err){
    console.error(err);

    // Si el error es porque NO ALCANZA el inventario (no es un corte de internet), la venta
    // NO se cierra y NO se reintenta: se avisa al vendedor para que corrija. Como la verificación
    // es previa al descuento, aquí el inventario no se tocó.
    const msg = (err.message || '') + '';
    const esErrorDeStock = msg.includes('No alcanza') || msg.includes('inventario en negativo') || msg.includes('Stock insuficiente') || msg.includes('no tiene inventario');
    const esVentaRepetida = msg.startsWith('REPETIDA:');

    // Función para dejar la pantalla limpia cuando la venta YA estaba registrada (duplicado):
    // se quitan los artículos "basura" y se abre un día nuevo, sin descontar nada.
    async function limpiarPorDuplicado(textoAviso){
      try{ await escribirConReintento(()=> sb.from('venta_items').delete().eq('venta_dia_id', ventaDiaAbiertaId)); }catch(e){}
      lsSet('vt_carrito_'+puestoActual.id+'_'+usuarioActual.id, []);
      try{ localStorage.removeItem('vt_carrito_'+puestoActual.id+'_'+usuarioActual.id); }catch(e){}
      try{ localStorage.removeItem(claveRespaldo); }catch(e){}
      carrito = []; cobrosEnCarrito = []; ventaDiaAbiertaId = null; ventaActualInicio = 0;
      diaRecienFinalizado = true;
      document.getElementById('finEfectivo').value=''; document.getElementById('finTarjeta').value=''; document.getElementById('finSobrante').value='';
      document.getElementById('finEfectivo').dataset.tocado='';
      renderCarrito();
      try{ await buscarOAbrirVentaDia(); }catch(e){}
      diaRecienFinalizado = false;
      msgEl.textContent = textoAviso;
      msgEl.className = 'msg err';
    }

    if(esVentaRepetida){
      // Venta idéntica ya guardada hoy: NO se descuenta nada y se QUITAN los artículos para que
      // no se pueda volver a entrar la misma venta ni queden de basura.
      await limpiarPorDuplicado(msg.replace('REPETIDA: ', ''));
      return;
    }
    if(esErrorDeStock){
      // Puede que "no alcance" JUSTAMENTE porque esta venta ya se descontó antes (duplicado). Si
      // encontramos una venta gemela cerrada hoy, avisamos que es repetida y limpiamos, en vez de
      // mostrar el confuso "faltan artículos".
      try{
        const firmaChk = firmaVenta(carrito);
        const totalChk = Number((carrito.reduce((s,it)=>s+it.cantidad*it.precio_venta,0)).toFixed(2));
        const gemelaChk = await buscarVentaGemelaHoy(firmaChk, totalChk, ventaDiaAbiertaId);
        if(gemelaChk){
          await limpiarPorDuplicado(`Esta venta ya se había registrado hoy en ${puestoActual.nombre}. Por eso el inventario ya estaba descontado. La app la reconoció como repetida y quitó los artículos — no se descontó de nuevo.`);
          return;
        }
      }catch(e){ /* si no se puede verificar, mostramos el error de stock normal */ }
      if(err && err.faltantes && err.faltantes.length){
        msgEl.innerHTML = avisoFaltantesHTML(err.faltantes); // recuadro bonito con la tablita
        msgEl.className = 'msg'; // el recuadro ya trae su propio color y borde
      } else {
        msgEl.textContent = msg;
        msgEl.className = 'msg err';
      }
      return; // NO encolar, NO limpiar el carrito: el vendedor corrige y vuelve a intentar
    }

    // CASO CLAVE: el día YA quedó cerrado (inventario descontado y día marcado cerrado), pero
    // falló algo DESPUÉS (registrar caja o comisión). NO re-encolamos la venta —eso descontaría
    // doble—. El día ya está bien cerrado; solo quedó pendiente el registro de dinero/comisión,
    // que el dueño puede completar a mano. Limpiamos el carrito porque la venta SÍ se cerró.
    if(diaCerradoOk){
      lsSet('vt_carrito_'+puestoActual.id+'_'+usuarioActual.id, []);
      try{ localStorage.removeItem('vt_carrito_'+puestoActual.id+'_'+usuarioActual.id); }catch(e){}
      carrito = []; cobrosEnCarrito = []; ventaDiaAbiertaId = null; ventaActualInicio = 0;
      diaRecienFinalizado = true;
      document.getElementById('finEfectivo').value=''; document.getElementById('finTarjeta').value=''; document.getElementById('finSobrante').value='';
      document.getElementById('finEfectivo').dataset.tocado='';
      renderCarrito();
      try{ await buscarOAbrirVentaDia(); }catch(e){}
      diaRecienFinalizado = false;
      msgEl.textContent = 'El día se cerró correctamente, pero se cortó la conexión en el último paso. Tu venta quedó bien guardada; se termina sola al volver el internet.';
      msgEl.className = 'msg ok';
      return;
    }

    // ¿Se llegó a descontar ALGÚN artículo antes de fallar? Si NO se descontó nada (por ejemplo,
    // falló al verificar el stock o al crear el día), es más simple y seguro DEJAR la venta en el
    // carrito tal cual, para que el vendedor solo tenga que tocar "Finalizar" otra vez. Nada quedó
    // a medias en la base, así que no hay riesgo de doble descuento.
    const algoSeDesconto = carrito.some(it => it.aplicado === true);
    if(!algoSeDesconto){
      msgEl.textContent = '⚠️ No se pudo completar la venta (posible corte de conexión). NO se descontó nada y TUS ARTÍCULOS SIGUEN AQUÍ. Revisa el internet y toca "Finalizar el día" otra vez.';
      msgEl.className = 'msg err';
      return; // carrito intacto, listo para reintentar
    }

    // Si SÍ se descontó parte antes de cortarse: guardamos para reintentar. Las líneas ya
    // descontadas quedaron marcadas (aplicado/clave), así el reintento NO las repite.
    const pendientes = lsGet('vt_pending_days', []);
    const nuevoPend = {
      clave_local: 'vd_' + puestoActual.id + '_' + Date.now() + '_' + Math.random().toString(36).slice(2,8),
      almacen_id: puestoActual.id, almacen_nombre: puestoActual.nombre, fecha,
      cobra_comision: esComodin() ? usuarioActual.nombre : puestoActual.nombre,
      es_comodin: esComodin(),
      usuario_id: usuarioActual.id, // el perfil dueño de esta venta
      items: carrito.map(it=>({producto_id:it.producto_id, nombre:it.nombre, cantidad:it.cantidad, precio_venta:it.precio_venta, costo:it.costo, clave_local:it.clave_local, aplicado:it.aplicado===true})),
      cobros: cobrosAProcesar,
      efectivo, tarjeta, sobrante, total: totalProductos
    };
    pendientes.push(nuevoPend);
    lsSet('vt_pending_days', pendientes);

    // VERIFICACIÓN CRÍTICA: si el teléfono NO guardó el pendiente, NO limpiamos el carrito,
    // para que el vendedor no pierda su venta.
    const verif = lsGet('vt_pending_days', []);
    if(!verif.some(p => p.clave_local === nuevoPend.clave_local)){
      msgEl.textContent = '⚠️ Se cortó la conexión y además no se pudo guardar la venta en este teléfono. TUS ARTÍCULOS SIGUEN AQUÍ, no se perdió nada. Revisa el almacenamiento del teléfono o usa otro, y finaliza de nuevo.';
      msgEl.className = 'msg err';
      return; // carrito intacto
    }

    lsSet('vt_carrito_'+puestoActual.id+'_'+usuarioActual.id, []);
    try{ localStorage.removeItem(claveRespaldo); }catch(e){}
    modoLocal = true;

    msgEl.textContent = 'Se cortó la conexión a medio camino. No te preocupes: la venta se guardó en el teléfono y se sincronizará sola sin repetir lo que ya entró. (' + (err.message||err) + ')';
    msgEl.className='msg ok';
    carrito = []; cobrosEnCarrito = []; ventaActualInicio = 0;
    document.getElementById('finEfectivo').value=''; document.getElementById('finTarjeta').value=''; document.getElementById('finSobrante').value='';
    document.getElementById('finEfectivo').dataset.tocado='';
    renderCarrito();
    actualizarConexionUI();
  }
}
