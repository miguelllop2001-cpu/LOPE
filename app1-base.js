// LOPE · Mi Negocio — Arranque de pantallas, inventario, búsqueda, movimientos, compras y funciones del servidor
// (Este archivo solo tiene funciones. Lo que se ejecuta al abrir la app está en app8-arranque.js)

// ---------- MENÚ LATERAL (Gestión) ----------
function toggleMenu(){
  const yaAbierto = document.getElementById('drawerMenu').classList.contains('open');
  if(yaAbierto) cerrarMenu(); else abrirMenu();
}
function abrirMenu(){
  document.getElementById('drawerMenu').classList.add('open');
  document.getElementById('drawerOverlay').classList.add('show');
}
function cerrarMenu(){
  document.getElementById('drawerMenu').classList.remove('open');
  document.getElementById('drawerOverlay').classList.remove('show');
}

// ---------- TEMA CLARO / OSCURO ----------
function alternarTema(){
  const actual = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
  aplicarTema(actual);
  lsSet('tema_preferido', actual);
}
function aplicarTema(tema){
  if(tema === 'light'){
    document.documentElement.setAttribute('data-theme', 'light');
    document.getElementById('btnTema').textContent = '🌙';
    document.getElementById('btnTema').title = 'Cambiar a modo oscuro';
  } else {
    document.documentElement.removeAttribute('data-theme');
    document.getElementById('btnTema').textContent = '☀️';
    document.getElementById('btnTema').title = 'Cambiar a modo claro';
  }
}
function aplicarLetra(nivel){
  nivel = Math.min(5, Math.max(1, Number(nivel) || 1));
  document.documentElement.style.zoom = ESCALA_LETRA[nivel];
  const el = document.getElementById('letraNivel'); if(el) el.textContent = nivel;
  return nivel;
}
function cambiarLetra(delta){
  const actual = Number(lsGet('letra_nivel', 1));
  const nuevo = aplicarLetra(actual + delta);
  lsSet('letra_nivel', nuevo);
}

// ---------- CARGA INICIAL ----------
async function cargarTodo(){
  if(!navigator.onLine){
    ALMACENES = lsGet('adm_cache_almacenes', []);
    PRODUCTOS = lsGet('adm_cache_productos', []);
    INVENTARIO = lsGet('adm_cache_inventario', []);
    statusEl.textContent = `Sin conexión · usando datos guardados (${ALMACENES.length} almacenes · ${PRODUCTOS.length} productos)`;
    renderInventario();
    renderSelects();
    renderAdmin();
    actualizarConexionAdminUI();
    return;
  }
  try{
    // Traer TODO paginando (Supabase corta en 1000 filas si no se pagina → se perdía inventario/productos).
    const traerTablaCompleta = async (tabla, ordenarPor)=>{
      const PAGE=1000; let desde=0; const acc=[];
      for(;;){
        const {data, error} = await sb.from(tabla).select('*').order(ordenarPor,{ascending:true}).range(desde, desde+PAGE-1);
        if(error) throw error;
        acc.push(...(data||[]));
        if(!data || data.length<PAGE) break;
        desde += PAGE;
      }
      return acc;
    };
    const [alm, prod, inv] = await Promise.all([
      traerTablaCompleta('almacenes','id'),
      traerTablaCompleta('productos','id'),
      traerTablaCompleta('inventario','id')
    ]);
    ALMACENES = (alm||[]).sort((a,b)=>(a.nombre||'').localeCompare(b.nombre||''));
    PRODUCTOS = (prod||[]).sort((a,b)=>(a.nombre||'').localeCompare(b.nombre||''));
    INVENTARIO = inv||[];
    lsSet('adm_cache_almacenes', ALMACENES);
    lsSet('adm_cache_productos', PRODUCTOS);
    lsSet('adm_cache_inventario', INVENTARIO);
    statusEl.textContent = `Conectado · ${ALMACENES.length} almacenes · ${PRODUCTOS.length} productos`;
    renderInventario();
    renderSelects();
    renderAdmin();
    actualizarConexionAdminUI();
    sincronizarPendientesAdmin();
  }catch(err){
    ALMACENES = lsGet('adm_cache_almacenes', []);
    PRODUCTOS = lsGet('adm_cache_productos', []);
    INVENTARIO = lsGet('adm_cache_inventario', []);
    statusEl.textContent = `Sin conexión · usando datos guardados (${ALMACENES.length} almacenes · ${PRODUCTOS.length} productos)`;
    renderInventario();
    renderSelects();
    renderAdmin();
    actualizarConexionAdminUI();
    console.error(err);
  }
}

function seleccionarProductoCompra(p){
  if(!p) return;
  compraAcInput.value = p.nombre;
  compraAcHidden.value = String(p.id);
  compraAcList.style.display = 'none';
  previsualizarCompra();
}

// Existencia TOTAL del producto en todos los almacenes (el costo es uno solo por producto)
function existenciaTotalProducto(productoId){
  return INVENTARIO.filter(i=>i.producto_id===productoId).reduce((s,i)=>s+Number(i.cantidad), 0);
}

// Calcula el costo promedio ponderado. Devuelve null si no hay datos suficientes.
function calcularCostoPromedio(costoViejo, existencia, costoCompra, cantidadComprada){
  const exi = Number(existencia) || 0;
  const cv = Number(costoViejo) || 0;
  const cc = Number(costoCompra) || 0;
  const qc = Number(cantidadComprada) || 0;
  if(qc <= 0) return null;
  // Si no había existencia, o el costo viejo estaba sin poner, el costo nuevo es el de la compra
  if(exi <= 0 || cv <= 0) return cc;
  return (exi * cv + qc * cc) / (exi + qc);
}

function previsualizarCompra(){
  const cont = document.getElementById('compraPrevio');
  if(!cont) return;
  const pid = Number(compraAcHidden.value);
  const cantidad = Number(document.getElementById('compraCantidad').value) || 0;
  const costoCompra = Number(document.getElementById('compraCosto').value) || 0;
  const p = PRODUCTOS.find(x=>x.id===pid);

  if(!p || cantidad <= 0 || costoCompra <= 0){
    cont.innerHTML = '<div style="color:var(--muted); font-size:13px">Elige el producto, la cantidad y el costo para ver cómo queda el costo nuevo.</div>';
    return;
  }

  const existencia = existenciaTotalProducto(pid);
  const costoViejo = Number(p.costo) || 0;
  const nuevoCosto = calcularCostoPromedio(costoViejo, existencia, costoCompra, cantidad);
  const subeOBaja = nuevoCosto > costoViejo ? 'sube' : (nuevoCosto < costoViejo ? 'baja' : 'queda igual');
  const colorNuevo = nuevoCosto > costoViejo ? 'var(--amber)' : 'var(--green)';
  const sinBase = (existencia <= 0 || costoViejo <= 0);

  cont.innerHTML = `
    <div style="background:var(--panel2); border-radius:12px; padding:14px">
      <div style="font-weight:700; margin-bottom:10px">${p.nombre}</div>
      <div class="row" style="gap:18px; flex-wrap:wrap">
        <div><div style="color:var(--muted); font-size:12px">Tienes ahora</div><div style="font-weight:700">${num(existencia)} uds. a $${num(costoViejo)}</div></div>
        <div><div style="color:var(--muted); font-size:12px">Estás comprando</div><div style="font-weight:700">${num(cantidad)} uds. a $${num(costoCompra)}</div></div>
        <div><div style="color:var(--muted); font-size:12px">Costo nuevo (promedio)</div><div style="font-weight:700; font-size:19px; color:${colorNuevo}">$${num(nuevoCosto)}</div></div>
      </div>
      <div style="color:var(--muted); font-size:12px; margin-top:10px; padding-top:10px; border-top:1px solid var(--border)">
        ${sinBase
          ? 'No había existencia (o el costo estaba en 0), así que el costo nuevo es el de esta compra.'
          : `Cuenta: (${num(existencia)} × $${num(costoViejo)} + ${num(cantidad)} × $${num(costoCompra)}) ÷ ${num(existencia+cantidad)} = <strong>$${num(nuevoCosto)}</strong> — el costo ${subeOBaja}.`}
      </div>
      <div style="color:var(--muted); font-size:12px; margin-top:8px">Total de esta compra: <strong>$${num(cantidad*costoCompra)}</strong></div>
    </div>`;
}

async function registrarCompra(){
  const msgEl = document.getElementById('compraMsg');
  const btn = document.getElementById('btnRegistrarCompra');
  if(registrandoCompra) return;

  const pid = Number(compraAcHidden.value);
  const almacenId = Number(document.getElementById('compraAlmacen').value);
  const cantidad = Number(document.getElementById('compraCantidad').value) || 0;
  const costoCompra = Number(document.getElementById('compraCosto').value) || 0;
  const nota = (document.getElementById('compraNota').value || '').trim();
  const pagarDeCaja = document.getElementById('compraPagarDeCaja').checked;

  const p = PRODUCTOS.find(x=>x.id===pid);
  if(!p){ msgEl.textContent='Elige un producto de la lista.'; msgEl.className='msg err'; return; }
  if(!almacenId){ msgEl.textContent='Elige a qué almacén entra la mercancía.'; msgEl.className='msg err'; return; }
  if(cantidad <= 0){ msgEl.textContent='Pon una cantidad mayor que cero.'; msgEl.className='msg err'; return; }
  if(costoCompra <= 0){ msgEl.textContent='Pon el costo por unidad que pagaste.'; msgEl.className='msg err'; return; }

  const existencia = existenciaTotalProducto(pid);
  const costoViejo = Number(p.costo) || 0;
  const nuevoCosto = calcularCostoPromedio(costoViejo, existencia, costoCompra, cantidad);
  const alm = ALMACENES.find(a=>a.id===almacenId);
  const totalPagado = cantidad * costoCompra;

  registrandoCompra = true;
  if(btn){ btn.disabled = true; btn.textContent = 'Registrando…'; }
  msgEl.textContent = 'Registrando la compra…'; msgEl.className = 'msg';

  // Clave única: si se toca dos veces o se corta el internet, no se duplica la entrada
  const claveCompra = 'compra_' + Date.now() + '_' + Math.random().toString(36).slice(2,8);

  try{
    if(!navigator.onLine){
      encolarOperacionAdmin('compra', {producto_id:pid, almacen_id:almacenId, cantidad, costo_compra:costoCompra, nuevo_costo:nuevoCosto, nota, clave_local:claveCompra, pagar_de_caja:pagarDeCaja, total:totalPagado, almacen_nombre: alm?alm.nombre:'', nombre:p.nombre});
      // Reflejarlo de una vez en la pantalla
      p.costo = nuevoCosto;
      lsSet('adm_cache_productos', PRODUCTOS);
      msgEl.textContent = `Sin internet: la compra quedó guardada y se aplicará al volver la conexión. El costo de "${p.nombre}" pasará a $${num(nuevoCosto)}.`;
      msgEl.className = 'msg ok';
      limpiarFormularioCompra();
      return;
    }

    const notaMov = 'Compra' + (nota ? ' — ' + nota : '') + ` (a $${num(costoCompra)} c/u)`;
    const conceptoPago = `Compra de ${p.nombre} x${num(cantidad)}${nota?' — '+nota:''}`;
    const clavePago = 'compra-' + claveCompra;

    // VÍA DEL SERVIDOR: mercancía + costo + pago en UN solo golpe (todo o nada).
    let hechaEnServidor = false;
    try{
      const rS = await rpcSegura('comprar_atomico', {
        p_clave: claveCompra, p_almacen: almacenId, p_producto: pid, p_cantidad: cantidad, p_nota: notaMov,
        p_nuevo_costo: nuevoCosto, p_pago: (pagarDeCaja ? totalPagado : 0), p_concepto: conceptoPago
      });
      hechaEnServidor = rS.estado === 'ok';
    }catch(eRed){
      // Se cortó y no se sabe si entró. Va a la cola con la MISMA clave: si ya entró no se
      // repite, y si no entró se aplica sola. Así no hay que volver a teclearla (ni duplicarla).
      encolarOperacionAdmin('compra', {producto_id:pid, almacen_id:almacenId, cantidad, costo_compra:costoCompra, nuevo_costo:nuevoCosto, nota, clave_local:claveCompra, pagar_de_caja:pagarDeCaja, total:totalPagado, almacen_nombre: alm?alm.nombre:'', nombre:p.nombre});
      msgEl.textContent = 'Se cortó la conexión: la compra quedó guardada en el teléfono y se aplica sola al volver la señal. NO la registres otra vez.';
      msgEl.className = 'msg ok';
      limpiarFormularioCompra();
      return;
    }

    if(hechaEnServidor){
      marcarClaveMovAplicada(claveCompra);
    } else {
    // VÍA POR PASOS (si la función del servidor todavía no está puesta)
    // 1) La mercancía entra al almacén
    const r = await ajustarInventario(almacenId, pid, cantidad);
    // 2) Queda en el historial de movimientos
    await insertarMovimiento({
      tipo:'ingreso', producto_id:pid, almacen_destino_id:almacenId, cantidad,
      nota: notaMov,
      clave_local: claveCompra, cant_antes: r.antes, cant_despues: r.despues
    });
    marcarClaveMovAplicada(claveCompra);
    // 3) Se recalcula el costo del producto
    const {error: eCosto} = await sb.from('productos').update({costo: nuevoCosto}).eq('id', pid);
    if(eCosto) throw eCosto;
    // 4) Si se pidió, se registra el pago como salida de dinero (con clave: nunca sale doble)
    if(pagarDeCaja && totalPagado > 0){
      const filaPago = {tipo:'egreso', metodo:'efectivo', monto: totalPagado, concepto: conceptoPago, almacen_id: almacenId};
      try{
        try{ await meterMovimientoCajaUnico(Object.assign({categoria:'compra'}, filaPago), clavePago); }
        catch(eCat){
          // La base rechazó 'compra' (candado viejo): se guarda como 'pago_mercancia', que
          // significa lo mismo y la base siempre lo acepta. El dinero no se pierde.
          await meterMovimientoCajaUnico(Object.assign({categoria:'pago_mercancia'}, filaPago), clavePago);
        }
      }catch(ePago){
        // La mercancía ya entró; lo que falló es SOLO anotar el pago. Se dice claro para que no se pierda.
        try{ registrarError('compras/pago','La compra entró al inventario pero el pago NO se registró en caja', String((ePago&&ePago.message)||ePago)); }catch(_){}
        alert('⚠️ La compra SÍ entró al inventario, pero el PAGO de $'+num(totalPagado)+' no se pudo registrar en caja (se cortó la conexión).\n\nRegístralo a mano en Dinero → Sale dinero, o tu caja va a marcar $'+num(totalPagado)+' de más.');
      }
    }
    }

    msgEl.innerHTML = `Compra registrada: <strong>${num(cantidad)} ${p.nombre}</strong> entraron a <strong>${alm?alm.nombre:''}</strong>. El costo pasó de $${num(costoViejo)} a <strong>$${num(nuevoCosto)}</strong>.`;
    msgEl.className = 'msg ok';
    limpiarFormularioCompra();
    await cargarTodo();
    await cargarCompras();
  }catch(err){
    msgEl.textContent = 'No se pudo registrar la compra: ' + (err.message||err);
    msgEl.className = 'msg err';
  }finally{
    registrandoCompra = false;
    if(btn){ btn.disabled = false; btn.textContent = 'Registrar compra'; }
  }
}

function limpiarFormularioCompra(){
  compraAcInput.value = '';
  compraAcHidden.value = '';
  document.getElementById('compraCantidad').value = '';
  document.getElementById('compraCosto').value = '';
  document.getElementById('compraNota').value = '';
  document.getElementById('compraPagarDeCaja').checked = false;
  previsualizarCompra();
}

// Llena el selector de almacenes de la pestaña de compras
function prepararCompras(){
  const sel = document.getElementById('compraAlmacen');
  if(sel) sel.innerHTML = almacenesVisibles().filter(a=>!esMayoreo(a)).map(a=>`<option value="${a.id}">${a.nombre}</option>`).join('');
  previsualizarCompra();
  cargarCompras();
}

// Lista las últimas compras (movimientos de ingreso cuya nota empieza por "Compra")
async function cargarCompras(){
  const body = document.getElementById('comprasBody');
  const empty = document.getElementById('comprasEmpty');
  if(!body) return;
  try{
    const {data, error} = await sb.from('movimientos').select('*')
      .eq('tipo','ingreso').order('creado_en', {ascending:false}).limit(1000);
    if(error) throw error;
    const compras = (data||[]).filter(m => (m.nota||'').startsWith('Compra'));
    if(compras.length === 0){
      body.innerHTML = ''; empty.style.display = 'block'; return;
    }
    empty.style.display = 'none';
    body.innerHTML = compras.map(m=>{
      const p = PRODUCTOS.find(x=>x.id===m.producto_id);
      const alm = ALMACENES.find(a=>a.id===m.almacen_destino_id);
      return `<tr>
        <td>${new Date(m.creado_en).toLocaleString()}</td>
        <td>${p?p.nombre:'—'}</td>
        <td class="numcell">${num(m.cantidad)}</td>
        <td>${alm?alm.nombre:'—'}</td>
        <td style="font-size:12px">${(m.nota||'').replace(/^Compra\s*—?\s*/,'') || '—'}</td>
      </tr>`;
    }).join('');
  }catch(err){
    body.innerHTML = `<tr><td colspan="5" class="empty">No se pudieron cargar las compras.</td></tr>`;
  }
}

// ============================================================
// VENTAS POR VENDEDOR (dueño y administrador)
// Muestra todas las ventas del período agrupadas por quién las hizo, para revisar
// el trabajo de cada trabajadora y abrir el detalle de cualquier venta.
// ============================================================
function prepararVentasPorVendedor(){
  const sel = document.getElementById('vvAlmacen');
  if(sel){
    sel.innerHTML = '<option value="">Todos los puestos</option>' +
      almacenesVisibles().filter(a=>!esMayoreo(a)).map(a=>`<option value="${a.id}">${a.nombre}</option>`).join('');
  }
  const hasta = document.getElementById('vvHasta');
  const desde = document.getElementById('vvDesde');
  if(hasta && !hasta.value) hasta.value = fechaHoyLocal();
  // Por defecto se muestra TODO el historial (desde el primer día del negocio), no solo la
  // última semana — así no falta ninguna venta. El dueño puede acotar la fecha si quiere.
  if(desde && !desde.value){
    desde.value = '2020-01-01';
  }
  cargarVentasPorVendedor();
}

// ===== BUSCAR ARTÍCULO: todas las ventas y movimientos de un producto, por puesto o vendedor =====
function prepararBuscarArticulo(){
  const sp=document.getElementById('baPuesto');
  if(sp) sp.innerHTML='<option value="">Todos los puestos</option>'+almacenesVisibles().map(a=>`<option value="${a.id}">${(a.nombre||'').replace(/</g,'&lt;')}</option>`).join('');
  const dl=document.getElementById('baProductoList');
  if(dl) dl.innerHTML=((PRODUCTOS||[]).slice().sort((a,b)=>(a.nombre||'').localeCompare(b.nombre||''))).map(p=>`<option value="${(p.nombre||'').replace(/"/g,'&quot;')}"></option>`).join('');
  const sv=document.getElementById('baVendedor');
  if(sv){
    sb.from('usuarios').select('id, nombre').then(({data})=>{
      sv.innerHTML='<option value="">Todos los vendedores</option>'+((data||[]).sort((a,b)=>(a.nombre||'').localeCompare(b.nombre||''))).map(u=>`<option value="${u.id}">${(u.nombre||'').replace(/</g,'&lt;')}</option>`).join('');
    }).catch(()=>{});
  }
}
async function buscarArticulo(){
  const msg=document.getElementById('baMsg');
  const resumen=document.getElementById('baResumen');
  const ventasEl=document.getElementById('baVentas');
  const movsEl=document.getElementById('baMovs');
  msg.textContent=''; msg.className='msg'; resumen.innerHTML=''; ventasEl.innerHTML=''; movsEl.innerHTML='';
  if(!navigator.onLine){ msg.textContent='Necesitas internet para buscar.'; msg.className='msg err'; return; }
  const txt=(document.getElementById('baProducto').value||'').trim().toLowerCase();
  if(!txt){ msg.textContent='Escribe un artículo.'; msg.className='msg err'; return; }
  const prod=(PRODUCTOS||[]).find(p=>(p.nombre||'').toLowerCase()===txt) || (PRODUCTOS||[]).find(p=>normNombre(p.nombre)===normNombre(txt)) || (PRODUCTOS||[]).find(p=>coincideNombre(p.nombre, txt));
  if(!prod){ msg.textContent='No encontré ese artículo. Elígelo de la lista.'; msg.className='msg err'; return; }
  const pid=prod.id;
  const puesto=document.getElementById('baPuesto').value;
  const vend=document.getElementById('baVendedor').value;
  const desde=document.getElementById('baDesde').value;
  const hasta=document.getElementById('baHasta').value;
  ventasEl.innerHTML='<div class="card"><div style="color:var(--muted);padding:10px">Buscando…</div></div>';
  try{
    // --- VENTAS (venta_items del producto → sus ventas_dia) ---
    const items=[]; { const PAGE=1000; let d=0; for(;;){ const r=await sb.from('venta_items').select('venta_dia_id, cantidad, precio_venta').eq('producto_id', pid).order('id',{ascending:true}).range(d,d+PAGE-1); if(r.error) throw r.error; items.push(...(r.data||[])); if(!r.data||r.data.length<PAGE) break; d+=PAGE; } }
    const idsDia=[...new Set(items.map(it=>it.venta_dia_id).filter(Boolean))];
    const diaMap={};
    for(let i=0;i<idsDia.length;i+=300){ const sub=idsDia.slice(i,i+300); const r=await sb.from('ventas_dia').select('id, almacen_id, fecha, usuario_id, cerrado').in('id', sub); if(r.error) throw r.error; (r.data||[]).forEach(v=>{ diaMap[v.id]=v; }); }
    let nomUser={}; try{ const r=await sb.from('usuarios').select('id, nombre'); (r.data||[]).forEach(u=>nomUser[u.id]=u.nombre); }catch(_){}
    let filas=[];
    for(const it of items){ const v=diaMap[it.venta_dia_id]; if(!v || !v.cerrado) continue; // solo ventas finalizadas (reales)
      if(puesto && String(v.almacen_id)!==String(puesto)) continue;
      if(vend && String(v.usuario_id)!==String(vend)) continue;
      if(desde && (v.fecha||'') < desde) continue;
      if(hasta && (v.fecha||'') > hasta) continue;
      filas.push({fecha:v.fecha||'', puesto:((ALMACENES||[]).find(a=>a.id===v.almacen_id)||{}).nombre||('#'+v.almacen_id), vendedor:nomUser[v.usuario_id]||'—', cantidad:Number(it.cantidad||0), precio:Number(it.precio_venta||0)});
    }
    filas.sort((a,b)=>(b.fecha||'').localeCompare(a.fecha||''));
    const totUds=filas.reduce((s,f)=>s+f.cantidad,0);
    const totDin=filas.reduce((s,f)=>s+f.cantidad*f.precio,0);
    // --- MOVIMIENTOS del producto ---
    const movs=[]; { const PAGE=1000; let d=0; for(;;){ const r=await sb.from('movimientos').select('*').eq('producto_id', pid).order('creado_en',{ascending:false}).range(d,d+PAGE-1); if(r.error) throw r.error; movs.push(...(r.data||[])); if(!r.data||r.data.length<PAGE) break; d+=PAGE; } }
    const movFilt=movs.filter(m=>{
      if(puesto){ if(String(m.almacen_origen_id)!==String(puesto) && String(m.almacen_destino_id)!==String(puesto)) return false; }
      if(desde && (m.creado_en||'').slice(0,10) < desde) return false;
      if(hasta && (m.creado_en||'').slice(0,10) > hasta) return false;
      return true;
    });
    // --- RENDER ---
    resumen.innerHTML=`<div class="card"><h2 style="margin:0 0 8px">${(prod.nombre||'').replace(/</g,'&lt;')}</h2><div style="display:flex;gap:20px;flex-wrap:wrap">
      <div><div style="color:var(--muted);font-size:12px">Vendido (uds)</div><div style="font-size:22px;font-weight:800">${num(totUds)}</div></div>
      <div><div style="color:var(--muted);font-size:12px">En dinero</div><div style="font-size:22px;font-weight:800;color:var(--green)">$${num(totDin)}</div></div>
      <div><div style="color:var(--muted);font-size:12px">Ventas</div><div style="font-size:22px;font-weight:800">${filas.length}</div></div>
      <div><div style="color:var(--muted);font-size:12px">Movimientos</div><div style="font-size:22px;font-weight:800">${movFilt.length}</div></div>
    </div></div>`;
    ventasEl.innerHTML=`<div class="card"><h3 style="margin:0 0 8px">🧾 Ventas</h3>`+(filas.length
      ? `<div style="overflow-x:auto"><table><thead><tr><th>Fecha</th><th>Puesto</th><th>Vendedor</th><th class="numcell">Cant.</th><th class="numcell">Precio</th><th class="numcell">Subtotal</th></tr></thead><tbody>${filas.map(f=>`<tr><td>${f.fecha}</td><td>${(f.puesto||'').replace(/</g,'&lt;')}</td><td>${(f.vendedor||'').replace(/</g,'&lt;')}</td><td class="numcell">${num(f.cantidad)}</td><td class="numcell">$${num(f.precio)}</td><td class="numcell">$${num(f.cantidad*f.precio)}</td></tr>`).join('')}</tbody></table></div>`
      : '<div class="empty">No hay ventas de este artículo con esos filtros.</div>')+`</div>`;
    movsEl.innerHTML=`<div class="card"><h3 style="margin:0 0 8px">🔁 Movimientos</h3>`+(movFilt.length
      ? `<div style="overflow-x:auto"><table><thead><tr><th>Fecha</th><th>Tipo</th><th>De</th><th>A</th><th class="numcell">Cant.</th><th>Nota</th></tr></thead><tbody>${movFilt.map(m=>{const o=(ALMACENES||[]).find(a=>a.id===m.almacen_origen_id);const dd=(ALMACENES||[]).find(a=>a.id===m.almacen_destino_id);return `<tr><td>${(m.creado_en||'').slice(0,16).replace('T',' ')}</td><td><span class="badge ${m.tipo||''}">${m.tipo||''}</span></td><td>${o?(o.nombre||'').replace(/</g,'&lt;'):'—'}</td><td>${dd?(dd.nombre||'').replace(/</g,'&lt;'):'—'}</td><td class="numcell">${num(m.cantidad)}</td><td>${(m.nota||'').replace(/</g,'&lt;')}</td></tr>`;}).join('')}</tbody></table></div>`
      : '<div class="empty">No hay movimientos de este artículo con esos filtros.</div>')+`</div>`;
    if(vend){ msg.textContent='Nota: el filtro de vendedor aplica a las ventas. Los movimientos (traslados, entradas) no tienen vendedor, se filtran por puesto.'; msg.className='msg'; }
  }catch(e){ msg.textContent='No se pudo buscar: '+(e.message||e); msg.className='msg err'; ventasEl.innerHTML=''; }
}

async function cargarVentasPorVendedor(){
  const msgEl = document.getElementById('vvMsg');
  const resEl = document.getElementById('vvResumen');
  const bodyEl = document.getElementById('vvBody');
  const desde = document.getElementById('vvDesde').value;
  const hasta = document.getElementById('vvHasta').value;
  const almFiltro = document.getElementById('vvAlmacen').value;
  const soloFinalizadas = document.getElementById('vvEstado').value === 'finalizadas';

  msgEl.textContent = ''; msgEl.className = 'msg';
  bodyEl.innerHTML = '<div style="color:var(--muted); padding:10px">Cargando…</div>';
  resEl.innerHTML = '';

  try{
    let q = sb.from('ventas_dia').select('*');
    if(desde) q = q.gte('fecha', desde);
    if(hasta) q = q.lte('fecha', hasta);
    if(almFiltro) q = q.eq('almacen_id', Number(almFiltro));
    const dias = await traerTodasLasFilas(()=> q.order('fecha', {ascending:false}).order('id',{ascending:true}));   // paginado: .limit(3000) no servía, la base corta en 1000

    let lista = dias || [];
    if(soloFinalizadas) lista = lista.filter(d=>d.cerrado);
    if(lista.length === 0){
      bodyEl.innerHTML = '<div class="card"><div class="empty">No hay ventas en ese período.</div></div>';
      return;
    }

    const ids = lista.map(d=>d.id);
    const items = await traerItemsDe(ids, '*');

    // ¿Cuáles descontaron inventario de verdad? (consulta paginada: no se queda corta en el
    // corte de 1000 filas de Supabase, que hacía salir "No descontó" en ventas que sí descontaron).
    const descontaron = await idsConMovimiento(ids);

    // Nombres de los trabajadores
    let nombrePorUsuario = {};
    try{
      const {data: us} = await sb.from('usuarios').select('id, nombre');
      (us||[]).forEach(u=>{ nombrePorUsuario[u.id] = u.nombre; });
    }catch(e){}

    // Artículos y totales de cada venta
    const itemsPorVenta = {};
    for(const it of (items||[])){
      if(!itemsPorVenta[it.venta_dia_id]) itemsPorVenta[it.venta_dia_id] = [];
      itemsPorVenta[it.venta_dia_id].push(it);
    }

    // Agrupar por vendedor
    const porVendedor = {};
    for(const d of lista){
      const nombre = nombrePorUsuario[d.usuario_id] || 'Sin trabajador asignado';
      if(!porVendedor[nombre]) porVendedor[nombre] = {ventas:[], totalVenta:0, totalGanancia:0, uds:0};
      const suyos = itemsPorVenta[d.id] || [];
      // La VENTA sale del total del día (inmune a items repetidos); ganancia y unidades, de los items REALES.
      const reales = itemsRealesDeVenta(suyos, d.total);
      let venta = totalRealDeVenta(d, suyos), ganancia = 0, uds = 0;
      for(const it of reales){
        ganancia += Number(it.cantidad)*(Number(it.precio_venta)-Number(it.costo));
        uds += Number(it.cantidad);
      }
      porVendedor[nombre].ventas.push({dia:d, items:reales, venta, ganancia, uds});
      porVendedor[nombre].totalVenta += venta;
      porVendedor[nombre].totalGanancia += ganancia;
      porVendedor[nombre].uds += uds;
    }

    // Ordenar: quien más vendió primero
    const vendedores = Object.entries(porVendedor).sort((a,b)=> b[1].totalVenta - a[1].totalVenta);

    // La GANANCIA es información del dueño: el administrador ve las ventas, no lo que se gana.
    const verGanancia = usuarioActual && usuarioActual.rol === 'dueno';

    // Resumen general
    const granTotal = vendedores.reduce((s,[,v])=>s+v.totalVenta, 0);
    const granGanancia = vendedores.reduce((s,[,v])=>s+v.totalGanancia, 0);
    resEl.innerHTML = `
      <div class="card">
        <div class="row" style="gap:20px; flex-wrap:wrap">
          <div><div style="color:var(--muted); font-size:12px">Ventas del período</div><div style="font-weight:700; font-size:20px">${lista.length}</div></div>
          <div><div style="color:var(--muted); font-size:12px">Total vendido</div><div style="font-weight:700; font-size:20px; color:var(--green)">$${num(granTotal)}</div></div>
          ${verGanancia ? `<div><div style="color:var(--muted); font-size:12px">Ganancia</div><div style="font-weight:700; font-size:20px">$${num(granGanancia)}</div></div>` : ''}
          <div><div style="color:var(--muted); font-size:12px">Trabajadores</div><div style="font-weight:700; font-size:20px">${vendedores.length}</div></div>
        </div>
      </div>`;

    // Una tarjeta por vendedor
    bodyEl.innerHTML = vendedores.map(([nombre, v], vi)=>{
      const filas = v.ventas.sort((a,b)=> (b.dia.fecha||'').localeCompare(a.dia.fecha||'') || b.dia.id - a.dia.id).map(x=>{
        const alm = ALMACENES.find(a=>a.id===x.dia.almacen_id);
        const desconto = descontaron.has(x.dia.id);
        let estado, color;
        if(!x.dia.cerrado){ estado = 'En curso'; color = 'var(--muted)'; }
        else if(!desconto){ estado = '⚠️ No descontó'; color = 'var(--amber)'; }
        else { estado = '✓ Finalizada'; color = 'var(--green)'; }
        const hora = x.dia.cerrado_en ? new Date(x.dia.cerrado_en).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : '—';
        return `
          <tr>
            <td>${x.dia.fecha}</td>
            <td>${hora}</td>
            <td>${alm?alm.nombre:'—'}</td>
            <td class="numcell">${x.items.length}</td>
            <td class="numcell">$${num(x.venta)}</td>
            ${verGanancia ? `<td class="numcell" style="color:var(--green)">$${num(x.ganancia)}</td>` : ''}
            <td style="font-size:11px; color:${color}">${estado}</td>
            <td><button class="ghost" style="padding:3px 10px; font-size:12px" onclick="verDetalleVentaVendedor(${x.dia.id})">abrir</button></td>
          </tr>
          <tr id="vv-det-${x.dia.id}" style="display:none"><td colspan="${verGanancia ? 8 : 7}" style="padding:0">
            <table style="margin:0; background:var(--panel2)">
              <thead><tr><th style="padding-left:22px">Producto</th><th class="numcell">Cant.</th>${verGanancia ? '<th class="numcell">Costo</th>' : ''}<th class="numcell">Precio</th><th class="numcell">Subtotal</th>${verGanancia ? '<th class="numcell">Ganancia</th>' : ''}</tr></thead>
              <tbody>
                ${x.items.length === 0
                  ? `<tr><td colspan="${verGanancia ? 6 : 4}" class="empty">Esta venta no tiene artículos.</td></tr>`
                  : x.items.map(it=>{
                      const p = PRODUCTOS.find(z=>z.id===it.producto_id);
                      const sub = Number(it.cantidad)*Number(it.precio_venta);
                      const gan = Number(it.cantidad)*(Number(it.precio_venta)-Number(it.costo));
                      return `<tr>
                        <td style="padding-left:22px">${p?p.nombre:'(producto borrado)'}</td>
                        <td class="numcell">${num(it.cantidad)}</td>
                        ${verGanancia ? `<td class="numcell" style="color:var(--muted)">$${num(it.costo)}</td>` : ''}
                        <td class="numcell">$${num(it.precio_venta)}</td>
                        <td class="numcell">$${num(sub)}</td>
                        ${verGanancia ? `<td class="numcell" style="color:var(--green)">$${num(gan)}</td>` : ''}
                      </tr>`;
                    }).join('')}
              </tbody>
            </table>
          </td></tr>`;
      }).join('');

      return `
        <div class="card">
          <div onclick="toggleVendedor(${vi})" style="cursor:pointer; display:flex; justify-content:space-between; align-items:flex-start; gap:10px">
            <div style="flex:1; min-width:0">
              <h2 style="margin-bottom:4px">${nombre}</h2>
              <div style="color:var(--muted); font-size:13px">
                ${v.ventas.length} venta(s) · ${num(v.uds)} unidades ·
                <strong style="color:var(--green)">$${num(v.totalVenta)}</strong> vendidos${verGanancia ? ` · ganancia $${num(v.totalGanancia)}` : ''}
              </div>
            </div>
            <span id="vend-arrow-${vi}" style="font-size:22px; flex:none; color:var(--muted)">▸</span>
          </div>
          <div id="vend-body-${vi}" style="display:none; margin-top:12px">
            <table>
              <thead><tr><th>Fecha</th><th>Hora</th><th>Puesto</th><th class="numcell">Artíc.</th><th class="numcell">Venta</th>${verGanancia ? '<th class="numcell">Ganancia</th>' : ''}<th>Estado</th><th></th></tr></thead>
              <tbody>${filas}</tbody>
            </table>
          </div>
        </div>`;
    }).join('');

  }catch(err){
    bodyEl.innerHTML = '';
    msgEl.textContent = 'No se pudieron cargar las ventas: ' + (err.message||err);
    msgEl.className = 'msg err';
  }
}

// Abre o cierra el bloque de ventas de un vendedor (para no ver todos a la vez).
function toggleVendedor(vi){
  const body = document.getElementById('vend-body-'+vi);
  const arrow = document.getElementById('vend-arrow-'+vi);
  if(!body) return;
  const abierto = body.style.display !== 'none';
  body.style.display = abierto ? 'none' : '';
  if(arrow) arrow.textContent = abierto ? '▸' : '▾';
}

// Abre o cierra el detalle de una venta concreta.
// Lleva su propia marca (data-abierto) en vez de leer el estilo: así funciona igual
// sin importar cómo se haya pintado la fila al inicio.
function verDetalleVentaVendedor(id){
  const fila = document.getElementById('vv-det-'+id);
  if(!fila) return;
  const estaAbierto = fila.dataset.abierto === '1';
  fila.style.display = estaAbierto ? 'none' : '';
  fila.dataset.abierto = estaAbierto ? '0' : '1';
}

function renderInventario(){
  const tabsEl = document.getElementById('almacenTabs');
  const cont = document.getElementById('inventarioContainer');
  if(ALMACENES.length===0){
    tabsEl.innerHTML = '';
    cont.innerHTML = '<div class="empty">No hay almacenes creados. Ve a la pestaña "Almacenes y Productos".</div>';
    return;
  }
  const __almNormales = ALMACENES.filter(a=>!esMayoreo(a)); // MAYOREO no se muestra aquí
  if(!__almNormales.length){
    tabsEl.innerHTML = '';
    cont.innerHTML = '<div class="empty">No hay almacenes (sin contar MAYOREO).</div>';
    return;
  }
  if(almacenSeleccionado===null || !__almNormales.find(a=>a.id===almacenSeleccionado)){
    almacenSeleccionado = __almNormales[0].id;
  }
  tabsEl.innerHTML = almacenesVisibles().filter(a=>!esMayoreo(a)).map(a=>
    `<button class="${a.id===almacenSeleccionado?'active':''}" onclick="seleccionarAlmacen(${a.id})">${a.nombre}</button>`
  ).join('');

  const a = ALMACENES.find(a=>a.id===almacenSeleccionado);
  const filtro = (document.getElementById('filtroInventarioAdmin').value || '').trim().toLowerCase();
  const productosFiltrados = filtro ? PRODUCTOS.filter(p=>coincideNombre(p.nombre, filtro)) : PRODUCTOS;
  const items = productosFiltrados.map(p=>{
      // Sumar TODAS las filas de ese producto+almacén (por si la tabla tiene filas duplicadas).
      const cantidad = INVENTARIO.filter(i=>i.almacen_id===a.id && i.producto_id===p.id).reduce((s,i)=>s+Number(i.cantidad||0),0);
      return `<tr><td>${p.nombre}</td><td class="numcell">${num(cantidad)}</td><td class="numcell">$${num(p.costo)}</td><td class="numcell">$${num(p.precio_venta)}</td></tr>`;
    }).join('');
  const totalUnidades = INVENTARIO.filter(i=>i.almacen_id===a.id).reduce((s,i)=>s+Number(i.cantidad),0);
  cont.innerHTML = `<h3 style="margin:0 0 10px;font-size:14px;display:flex;justify-content:space-between">${a.nombre} <span class="total">${num(totalUnidades)} uds.</span></h3>
    <table>
      <thead><tr><th>Producto</th><th class="numcell">Cant.</th><th class="numcell">Costo</th><th class="numcell">P. venta</th></tr></thead>
      <tbody>${items || `<tr><td colspan="4" class="empty">${filtro?'Ningún artículo coincide con la búsqueda':'Sin existencias'}</td></tr>`}</tbody>
    </table>`;
}

function seleccionarAlmacen(id){
  almacenSeleccionado = id;
  renderInventario();
}

function num(n){ n=Number(n); return n%1===0 ? n.toString() : n.toFixed(2); }
// Texto seguro para meter DENTRO de un botón: onclick="funcion(123, 'AQUI')".
// Escapa la comilla simple (que cortaría el texto) y sobre todo la comilla DOBLE, que
// cerraría el atributo y rompería el botón. Esto pasa con nombres de ferretería que
// llevan pulgadas: TUBO 1/2" , CODO 3/4" , etc.
// ── BÚSQUEDA DE PRODUCTOS QUE AGUANTA ERRORES DE ESCRITURA ──────────────────
// En la ferretería los nombres se escriben como salga: "TUVO" por "TUBO", con o sin
// acentos, con "DE" en medio, con letras dobles. Antes la búsqueda era literal, así que
// escribir "tubo led" NO encontraba "TUVO LED DE 40" y parecía que el artículo no existía
// aunque sí tuviera inventario. Esto empareja por como SUENA la palabra, no por como se
// escribió, y además busca cada palabra por separado (no importa el orden).
function normNombre(s){
  return String(s==null?'':s)
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g,'')   // quita tildes
    .replace(/[^a-z0-9ñ ]+/g,' ')                      // signos y rayas fuera
    .replace(/ñ/g,'n')
    .replace(/h/g,'')                                   // la h no suena
    .replace(/ll/g,'y')                                 // antes de juntar repetidas
    .replace(/(.)\1+/g,'$1')                            // acCesorio = acesorio, carro = caro
    .replace(/qu/g,'k').replace(/q/g,'k')
    .replace(/c([ei])/g,'s$1').replace(/c/g,'k')        // cebolla→sebolla, casa→kasa
    .replace(/z/g,'s')                                  // z y s suenan igual
    .replace(/v/g,'b')                                  // TUVO = TUBO
    .replace(/\s+/g,' ').trim();
}
function coincideNombre(nombre, consulta){
  const n = normNombre(nombre);
  const palabras = normNombre(consulta).split(' ').filter(Boolean);
  if(!palabras.length) return true;
  return palabras.every(w => n.includes(w));   // todas las palabras, en cualquier orden
}

// Celda "ANTES → DESPUÉS" del Historial. En un traslado la mercancía toca DOS almacenes,
// así que se muestran los dos renglones: arriba el que la da (rojo, baja) y abajo el que la
// recibe (verde, sube) — en el mismo orden que las columnas ORIGEN y DESTINO de al lado.
// Van en una rejilla de 3 columnas para que las flechas queden alineadas y no se ensanche.
function celdaAntesDespues(m){
  const hay = v => v !== null && v !== undefined && v !== '';
  const linea = (antes, despues, color) =>
      `<span style="color:${color}">${num(antes)}</span>`
    + `<span style="color:var(--muted)">→</span>`
    + `<span style="color:${color};font-weight:700">${num(despues)}</span>`;
  const caja = dentro =>
    `<div style="display:inline-grid;grid-template-columns:auto auto auto;gap:0 4px;`
    + `justify-items:end;align-items:center;font-size:13px;line-height:1.4;`
    + `font-variant-numeric:tabular-nums;white-space:nowrap">${dentro}</div>`;

  const origen  = hay(m.cant_antes)         ? linea(m.cant_antes, m.cant_despues, 'var(--red)') : null;
  const destino = hay(m.cant_antes_destino) ? linea(m.cant_antes_destino, m.cant_despues_destino, 'var(--green)') : null;

  if(m.tipo === 'traslado'){
    if(origen && destino) return caja(origen + destino);           // los dos lados
    // Fila vieja a la que le falta el lado del destino: se deja el renglón en blanco con un
    // guion, para que la columna NO se ensanche. El "title" lo explica al tocarlo.
    if(origen)  return `<span title="De esta fila solo se guardó el almacén de origen">`
                     + caja(origen + '<span style="color:var(--muted)">—</span><span></span><span></span>')
                     + `</span>`;
    if(destino) return caja(destino);
    return '<span style="color:var(--muted)">—</span>';
  }
  if(!hay(m.cant_antes)) return '<span style="color:var(--muted)">—</span>';
  // Entra mercancía → verde. Sale → rojo.
  const sube = Number(m.cant_despues) >= Number(m.cant_antes);
  return caja(linea(m.cant_antes, m.cant_despues, sube ? 'var(--green)' : 'var(--red)'));
}

function txtAttr(s){
  return String(s==null?'':s)
    .replace(/&/g,'&amp;')
    .replace(/\\/g,'\\\\')
    .replace(/'/g,"\\'")
    .replace(/"/g,'&quot;')
    .replace(/</g,'&lt;');
}

// --- Helpers de MAYOREO (definidos TEMPRANO: renderInventario y otros los usan antes) ---
// ¿Este almacén es el de MAYOREO? (su nombre empieza con "mayoreo")
function esMayoreo(a){ return /^mayoreo/i.test(((a&&a.nombre)||'').trim()); }
function almacenMayoreo(){ return (ALMACENES||[]).find(esMayoreo) || __almMayCache || null; }
// Asegura tener el almacén MAYOREO: si no está en la lista, lo busca por nombre en el servidor
// (igual que el catálogo) y lo deja cacheado. Devuelve el almacén o null.
async function asegurarAlmacenMayoreo(){
  const yaEnLista=(ALMACENES||[]).find(esMayoreo);
  if(yaEnLista) return yaEnLista;
  if(__almMayCache) return __almMayCache;
  if(typeof navigator!=='undefined' && !navigator.onLine) return null;
  try{
    const r=await sb.from('almacenes').select('id,nombre').ilike('nombre','mayoreo%').limit(1);
    if(!r.error && r.data && r.data[0]){
      __almMayCache=r.data[0];
      if(Array.isArray(ALMACENES) && !ALMACENES.find(a=>a.id===__almMayCache.id)) ALMACENES.push(__almMayCache);
      return __almMayCache;
    }
  }catch(e){}
  return null;
}
function idsMayoreo(){ return new Set((ALMACENES||[]).filter(esMayoreo).map(a=>a.id)); }
function esAlmacenMayoreoId(id){ return idsMayoreo().has(Number(id)); }
// Escapa un texto para meterlo con seguridad dentro de un atributo HTML (value="...").
function escAttr(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

// Devuelve los artículos REALES de una venta, INMUNE a venta_items duplicados.
// El campo `total` del día de venta es la fuente de verdad: el historial y el inventario lo
// respetan bien. Si por un error de sincronización los venta_items quedaron DUPLICADOS o
// TRIPLICADOS (copias idénticas del mismo producto), cualquier vista que los sume se infla.
// Aquí, si la suma cruda NO cuadra con el total del día, colapsamos las copias idénticas y
// verificamos si entonces cuadra. Así "Ver ventas", el cobro del admin y las estadísticas no
// pueden inflarse aunque haya basura repetida en la base.
function itemsRealesDeVenta(items, totalDia){
  const crudos = items || [];
  if(crudos.length === 0) return crudos;
  const suma = arr => arr.reduce((s,it)=> s + Number(it.cantidad)*Number(it.precio_venta), 0);
  const sumaCrudos = suma(crudos);
  // Sin total de referencia, o si ya cuadra, se usan tal cual (incluye ventas normales con
  // dos líneas legítimas del mismo producto: mientras cuadren con el total, no se tocan).
  if(totalDia==null || Math.abs(sumaCrudos - Number(totalDia)) < 0.5) return crudos;

  // No cuadra → probable duplicación. Colapsamos copias idénticas (mismo producto, cantidad,
  // precio y costo) y nos quedamos con una sola de cada una.
  const vistos = new Set();
  const unicos = [];
  for(const it of crudos){
    const firma = `${it.producto_id}|${it.cantidad}|${it.precio_venta}|${it.costo}`;
    if(!vistos.has(firma)){ vistos.add(firma); unicos.push(it); }
  }
  // Si al quitar las copias idénticas ya cuadra con el total del día, esos son los reales.
  if(Math.abs(suma(unicos) - Number(totalDia)) < 0.5) return unicos;
  // Si aún no cuadra exactamente, preferimos quedarnos con la versión sin copias (nunca inflar).
  return suma(unicos) < sumaCrudos ? unicos : crudos;
}

// El total confiable de una venta: el campo `total` del día (fuente de verdad). Si por ser un
// dato viejo no lo tuviera, cae a la suma de los artículos REALES (sin copias duplicadas).
function totalRealDeVenta(dia, itemsDelDia){
  const t = Number(dia.total);
  if(t > 0) return t;
  const reales = itemsRealesDeVenta(itemsDelDia||[], dia.total);
  return reales.reduce((s,it)=> s + Number(it.cantidad)*Number(it.precio_venta), 0);
}

// "Huella" de una venta: agrupa por producto+precio y suma las cantidades. Es robusta a cómo se
// dividan las líneas y a copias duplicadas (se usa junto con itemsRealesDeVenta al comparar).
// Dos ventas con la misma huella tienen exactamente los mismos productos, cantidades y precios.
function firmaVenta(items){
  const porProd = {};
  for(const it of (items||[])){
    const k = it.producto_id + '@' + Number(it.precio_venta);
    porProd[k] = (porProd[k]||0) + Number(it.cantidad);
  }
  return Object.keys(porProd).sort().map(k => k + 'x' + porProd[k]).join('|');
}

// Busca si HOY ya se registró (día cerrado) una venta idéntica a la del carrito, en este puesto.
// Compara por huella (limpia de duplicados) y por total. Devuelve el día gemelo o null.
// Se salta el día `excluirId` (el que estamos cerrando ahora mismo).
async function buscarVentaGemelaHoy(firmaCarrito, totalCarrito, excluirId){
  if(!firmaCarrito || !puestoActual) return null;
  const hoy = fechaHoyLocal();
  try{
    const {data: cerrados} = await sb.from('ventas_dia').select('id, total')
      .eq('almacen_id', puestoActual.id).eq('fecha', hoy).eq('cerrado', true);
    const dias = (cerrados||[]).filter(d => d.id !== excluirId);
    if(dias.length === 0) return null;
    const items = await traerItemsDe(dias.map(d=>d.id), 'venta_dia_id, producto_id, cantidad, precio_venta, costo');
    const porDia = {};
    for(const it of (items||[])){ (porDia[it.venta_dia_id] = porDia[it.venta_dia_id]||[]).push(it); }
    for(const d of dias){
      const reales = itemsRealesDeVenta(porDia[d.id]||[], d.total);
      const firmaDia = firmaVenta(reales);
      const totalDia = Number(Number(d.total||0).toFixed(2));
      if(firmaDia && firmaDia === firmaCarrito && Math.abs(totalDia - Number(totalCarrito)) < 0.01){
        return d;
      }
    }
  }catch(e){ /* si no se puede consultar, no bloqueamos */ }
  return null;
}
function avisoAntesDeSalir(e){
  if(!subiendoVentaActiva) return;
  e.preventDefault();
  e.returnValue = 'La venta se está subiendo. Si sales ahora se puede perder. Espera a que termine.';
  return e.returnValue;
}
function mostrarSubiendo(texto){
  subiendoVentaActiva = true;
  try{ window.addEventListener('beforeunload', avisoAntesDeSalir); }catch(e){}
  const previa = document.getElementById('subiendoOverlay');
  if(previa) previa.remove();
  const ov = document.createElement('div');
  ov.id = 'subiendoOverlay';
  // Bloquea TODA la pantalla y los toques (no tiene cerrar): así no pueden seguir tocando ni salir por error.
  ov.style.cssText = 'position:fixed; inset:0; z-index:99999; display:flex; flex-direction:column; align-items:center; justify-content:center; background:#1e3a8a; color:#fff; animation: exitoFadeIn 0.25s ease-out; padding:0 26px; text-align:center;';
  ov.innerHTML = `
    <div style="width:84px; height:84px; border:8px solid rgba(255,255,255,0.25); border-top-color:#fff; border-radius:50%; animation: subiendoGirar 0.9s linear infinite; margin-bottom:26px;"></div>
    <div style="font-size:26px; font-weight:800; margin-bottom:10px;">${texto||'Subiendo la venta…'}</div>
    <div style="font-size:19px; font-weight:800; background:#fff; color:#1e3a8a; padding:10px 18px; border-radius:12px; margin:6px 0 18px; animation: subiendoPulso 1.2s ease-in-out infinite;">⚠️ NO cierres la app todavía</div>
    <div style="font-size:15px; opacity:0.9; line-height:1.5; max-width:340px;">Espera a que aparezca la palomita verde de <b>¡Día guardado!</b>. Si cierras ahora, la venta puede no subir.</div>
    <div style="position:relative; width:240px; max-width:80%; height:8px; background:rgba(255,255,255,0.25); border-radius:99px; overflow:hidden; margin-top:26px;">
      <div style="position:absolute; top:0; height:100%; width:40%; background:#fff; border-radius:99px; animation: subiendoBarra 1.1s ease-in-out infinite;"></div>
    </div>`;
  document.body.appendChild(ov);
}
function quitarSubiendo(){
  subiendoVentaActiva = false;
  try{ window.removeEventListener('beforeunload', avisoAntesDeSalir); }catch(e){}
  const ov = document.getElementById('subiendoOverlay');
  if(ov) ov.remove();
}

// Pantalla naranja: la venta quedó GUARDADA en el teléfono (pendiente de subir). Deja tranquilo
// al trabajador de que NO se perdió y que NO debe volver a entrarla.
function pantallaPendiente(titulo, detalle){
  const previa = document.getElementById('pantallaPendienteOverlay');
  if(previa) previa.remove();
  const ov = document.createElement('div');
  ov.id = 'pantallaPendienteOverlay';
  ov.style.cssText = 'position:fixed; inset:0; z-index:99999; display:flex; flex-direction:column; align-items:center; justify-content:center; background:#d97706; color:#fff; animation: exitoFadeIn 0.3s ease-out; cursor:pointer; padding:0 26px; text-align:center;';
  ov.innerHTML = `
    <div style="font-size:90px; line-height:1; margin-bottom:18px; animation: exitoPop 0.5s cubic-bezier(0.17,0.89,0.32,1.28);">📥</div>
    <div style="font-size:28px; font-weight:800; margin-bottom:12px;">${titulo}</div>
    ${detalle ? `<div style="font-size:16px; opacity:0.95; line-height:1.5; max-width:340px;">${detalle}</div>` : ''}
    <div style="font-size:14px; opacity:0.9; margin-top:22px;">(toca para cerrar)</div>`;
  ov.addEventListener('click', ()=>{ ov.remove(); });
  document.body.appendChild(ov);
  try{ if(navigator.vibrate) navigator.vibrate([80,50,80]); }catch(e){}
}

function pantallaExito(titulo, detalle){
  // Si ya hay una en pantalla, la quitamos primero
  const previa = document.getElementById('pantallaExitoOverlay');
  if(previa) previa.remove();

  const ov = document.createElement('div');
  ov.id = 'pantallaExitoOverlay';
  ov.style.cssText = 'position:fixed; inset:0; z-index:99999; display:flex; flex-direction:column; align-items:center; justify-content:center; background:#16a34a; color:#fff; animation: exitoFadeIn 0.35s ease-out; cursor:pointer;';
  ov.innerHTML = `
    <div style="font-size:110px; line-height:1; margin-bottom:20px; animation: exitoPop 0.5s cubic-bezier(0.17,0.89,0.32,1.28);">✓</div>
    <div style="font-size:32px; font-weight:800; margin-bottom:12px; text-align:center; padding:0 20px;">${titulo}</div>
    ${detalle ? `<div style="font-size:16px; opacity:0.92; text-align:center; padding:0 30px; line-height:1.5;">${detalle}</div>` : ''}
  `;
  // Al tocar la pantalla se quita de inmediato
  ov.addEventListener('click', ()=>{ ov.remove(); });
  document.body.appendChild(ov);

  // Se quita sola a los 2.2 segundos con un desvanecido
  setTimeout(()=>{
    if(!ov.parentNode) return;
    ov.style.animation = 'exitoFadeOut 0.4s ease-in forwards';
    setTimeout(()=>{ if(ov.parentNode) ov.remove(); }, 400);
  }, 2200);

  // Sonido/vibración opcional (si el teléfono lo permite)
  try{ if(navigator.vibrate) navigator.vibrate(120); }catch(e){}
}

// Devuelve la fecha de HOY según la hora LOCAL del teléfono (no en UTC/Londres).
// Antes se usaba toISOString(), que da la fecha en hora de Londres: después de las 8 PM
// en Cuba ya marcaba el día siguiente, y las ventas de la noche "desaparecían" al buscarlas.
function fechaHoyLocal(){
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const dia = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${dia}`;
}

// ---------- REDONDEO DE COMISIONES ----------
// Las comisiones se redondean SIEMPRE a un número cerrado (múltiplo de 5): 15, 20, 25, 30...
// Se redondea hacia ARRIBA, así el trabajador nunca sale perdiendo por el redondeo.
// Ejemplos: 11→15, 13→15, 14→15, 15→15, 16→20, 37.50→40
function redondearComision(monto){
  const n = Number(monto) || 0;
  if(n <= 0) return 0;
  return Math.ceil(n / 5) * 5;
}

// Carga el inventario por almacén (producto_id → almacen_id → cantidad) para mostrar en el buscador
// de Movimientos cuánto hay EN EL ALMACÉN elegido — así el que hace los traslados/operaciones ve
// el stock de ese almacén, no la suma de todos. Se llama al entrar a la pestaña. Paginado por si >1000.
async function cargarInventarioMov(){
  // Restaura el borrador de movimientos por si se minimizó la app y se descartó la memoria.
  try{ const b = lsGet('mov_borrador', []); if(Array.isArray(b) && b.length && listaMovimientos.length===0){ listaMovimientos = b; renderListaMovimientos(); } }catch(e){}
  try{ restaurarSelectsMov(); }catch(e){}
  try{
    const mapa = {}; const PAGE=1000; let desde=0;
    for(;;){
      const r = await sb.from('inventario').select('producto_id, almacen_id, cantidad').order('id',{ascending:true}).range(desde, desde+PAGE-1);
      if(r.error || !r.data) break;
      r.data.forEach(row=>{ const m=(mapa[row.producto_id]=mapa[row.producto_id]||{}); m[row.almacen_id]=(m[row.almacen_id]||0)+Number(row.cantidad||0); });
      if(r.data.length < PAGE) break;
      desde += PAGE;
    }
    inventarioMov = mapa;
    if(movAcInput && movAcInput.value.trim()) movAcInput.dispatchEvent(new Event('input'));
  }catch(e){ /* si falla, el buscador sigue funcionando, solo sin mostrar la cantidad */ }
}

function seleccionarProductoAC(p){
  if(!p) return;
  movAcInput.value = p.nombre;
  movAcHidden.value = p.id;
  movAcList.style.display='none';
}

// ---------- SELECTS para movimientos (almacenes) ----------
function renderSelects(){
  const opAlm = almacenesVisibles().filter(a=>!esMayoreo(a)).map(a=>`<option value="${a.id}">${a.nombre}</option>`).join('');
  document.getElementById('movOrigen').innerHTML = opAlm;
  const selCompraAlm = document.getElementById('compraAlmacen');
  if(selCompraAlm) selCompraAlm.innerHTML = opAlm;
  document.getElementById('movDestino').innerHTML = opAlm;
  const selDeudaAlm = document.getElementById('deudaAlmacen');
  if(selDeudaAlm) selDeudaAlm.innerHTML = opAlm;
  restaurarSelectsMov();
}

// Recuerda el tipo y los almacenes elegidos en Movimientos, para que al cambiar de pestaña
// (o al reconstruir los selects) NO se reinicien a la primera opción.
function restaurarSelectsMov(){
  const setSel = (id, val)=>{ const el=document.getElementById(id); if(el && val && [...el.options].some(o=>o.value===val)) el.value=val; };
  setSel('movTipo', lsGet('mov_sel_tipo',''));
  setSel('movOrigen', lsGet('mov_sel_origen',''));
  setSel('movDestino', lsGet('mov_sel_destino',''));
  // Ajusta la vista (destino visible / etiqueta) según el tipo restaurado.
  const t=document.getElementById('movTipo'); if(t) t.dispatchEvent(new Event('change'));
} // [{tipo, origen_id, destino_id, producto_id, nombre, cantidad, nota}]

function agregarMovALista(){
  const msgEl = document.getElementById('movAddMsg');
  const tipo = document.getElementById('movTipo').value;
  const origenId = Number(document.getElementById('movOrigen').value);
  const destinoId = Number(document.getElementById('movDestino').value);
  const productoId = Number(movAcHidden.value);
  const cantidad = Number(document.getElementById('movCantidad').value);
  const nota = document.getElementById('movNota').value.trim();

  if(!productoId || !cantidad || cantidad<=0){
    msgEl.textContent = 'Selecciona un producto y una cantidad válida (> 0).'; msgEl.className='msg err'; return;
  }
  if(!almacenValido(origenId)){
    msgEl.textContent = (tipo==='ingreso' ? 'Elige el almacén al que entra la mercancía.' : 'Elige el almacén de donde sale la mercancía.');
    msgEl.className='msg err'; return;
  }
  if(tipo==='traslado'){
    // OJO: antes solo se comparaba origen===destino. Si el destino venía vacío daba NaN,
    // y NaN nunca es igual a nada: la línea pasaba y la mercancía salía del origen para
    // no llegar a ningún almacén.
    if(!almacenValido(destinoId)){
      msgEl.textContent = 'Elige el almacén de destino del traslado.'; msgEl.className='msg err'; return;
    }
    if(origenId===destinoId){
      msgEl.textContent = 'El almacén origen y destino no pueden ser iguales.'; msgEl.className='msg err'; return;
    }
  }
  const p = PRODUCTOS.find(p=>p.id===productoId);
  const almOrigen = ALMACENES.find(a=>a.id===origenId);
  const almDestino = ALMACENES.find(a=>a.id===destinoId);

  // Cada línea de la lista guarda su PROPIO tipo y almacenes — así se pueden mezclar
  // ingresos, extracciones y traslados distintos en una sola lista antes de confirmar.
  listaMovimientos.push({
    // Clave única de esta línea. Sirve para que, si se reintenta la sincronización o se
    // toca "Confirmar" más de una vez, la línea NO se aplique dos (o tres) veces al inventario.
    clave_local: 'mov_' + Date.now() + '_' + Math.random().toString(36).slice(2,8),
    tipo, origen_id: origenId, destino_id: destinoId,
    origen_nombre: almOrigen?almOrigen.nombre:'—', destino_nombre: almDestino?almDestino.nombre:'—',
    producto_id: productoId, nombre: p?p.nombre:'—', cantidad, nota
  });
  renderListaMovimientos();

  movAcInput.value=''; movAcHidden.value='';
  document.getElementById('movCantidad').value=''; document.getElementById('movNota').value='';
  msgEl.textContent = 'Agregado a la lista.'; msgEl.className='msg ok';
}

function quitarMovDeLista(i){
  listaMovimientos.splice(i,1);
  renderListaMovimientos();
}

function renderListaMovimientos(){
  lsSet('mov_borrador', listaMovimientos); // guarda el borrador por si minimizas la app
  const body = document.getElementById('movListaBody');
  const empty = document.getElementById('movListaEmpty');
  if(listaMovimientos.length===0){ body.innerHTML=''; empty.style.display='block'; return; }
  empty.style.display='none';
  body.innerHTML = listaMovimientos.map((it,i)=>{
    const almTexto = it.tipo==='ingreso' ? `→ ${it.origen_nombre}`
      : it.tipo==='extraccion' ? `${it.origen_nombre} →`
      : `${it.origen_nombre} → ${it.destino_nombre}`;
    // Tinte suave de toda la fila según el tipo (mismo color que el historial, pero más leve),
    // solo como ayuda visual para no confundir ingreso / extracción / traslado.
    const tinte = it.tipo==='ingreso' ? 'rgba(62,207,142,.08)'
      : it.tipo==='extraccion' ? 'rgba(255,92,92,.08)'
      : 'rgba(255,180,84,.08)';
    return `<tr style="background:${tinte}">
      <td><span class="badge ${it.tipo}">${ETIQUETA_TIPO_MOV[it.tipo]}</span></td>
      <td>${it.nombre}</td>
      <td class="numcell">${num(it.cantidad)}</td>
      <td>${almTexto}</td>
      <td>${it.nota||''}</td>
      <td><button class="ghost" onclick="quitarMovDeLista(${i})">Quitar</button></td>
    </tr>`;
  }).join('');
}

// Aplica UNA línea de movimiento al inventario, con protección contra duplicados.
// Antes de tocar nada, revisa si esa línea (por su clave única) ya se aplicó. Si ya está,
// no hace nada. Así, aunque se reintente la sincronización o se toque "Confirmar" varias
// veces, la cantidad NUNCA se suma dos o tres veces.
// Recuerda en el teléfono qué líneas ya se aplicaron. Así la protección contra duplicados
// funciona SIEMPRE, aunque la base de datos todavía no tenga la columna 'clave_local'.
// Ejecuta un PASO una sola vez, aunque la operación entera se reintente. Sirve para los
// pasos que NO se pueden repetir sin hacer daño (descontar mercancía, crear una deuda).
// Sin esto, si una operación se aplicaba a medias y fallaba, al reintentarla la mercancía
// se descontaba DOS veces.
// Mete UN movimiento de caja con clave única del servidor: si se reintenta, la base
// rechaza el repetido en vez de duplicar el dinero. Si la base todavía no tiene la columna
// (falta correr caja_trazable.sql), se guarda igual pero comprobando antes por parecido.
async function meterMovimientoCajaUnico(fila, clave){
  try{
    if(clave){
      const {data, error} = await sb.from('caja_movimientos').select('id').eq('clave_caja', clave).limit(1);
      if(!error && data && data.length) return true;   // ya estaba: no duplicar
    }
  }catch(e){}
  let r = await sb.from('caja_movimientos').insert(Object.assign({}, fila, clave?{clave_caja:clave}:{}));
  if(r && r.error && /clave_caja|column/i.test(r.error.message||'')){
    // Sin la columna: se comprueba por parecido para no duplicar, y se guarda sin clave.
    try{
      const {data} = await sb.from('caja_movimientos').select('id')
        .eq('tipo',fila.tipo).eq('monto',fila.monto).eq('concepto',fila.concepto).limit(1);
      if(data && data.length) return true;
    }catch(e){}
    r = await sb.from('caja_movimientos').insert(fila);
  }
  if(r && r.error && /duplicate|unique|23505/i.test(r.error.message||'')) return true;
  if(r && r.error && clave){
    // ¿Se guardó y solo se perdió la respuesta? Se mira antes de darlo por fallido.
    try{
      const v = await sb.from('caja_movimientos').select('id').eq('clave_caja', clave).limit(1);
      if(!v.error && v.data && v.data.length) return true;
    }catch(e){}
  }
  if(r && r.error) throw r.error;
  return true;
}

// ── FUNCIONES "TODO O NADA" DEL SERVIDOR (operaciones_atomicas.sql) ──────────
// Devuelve {estado:'ok', data} si la base lo hizo; {estado:'noexiste'} si la función no está
// (o falló por dentro) y hay que seguir por pasos; y LANZA si se cortó la conexión, porque
// ahí no se sabe si entró o no y hay que reintentar con la misma clave.
function __esErrorDeRed(e){
  return /failed to fetch|networkerror|load failed|network request|timeout|timed out|aborted|fetch/i.test(String((e && e.message) || e || ''));
}
async function rpcSegura(nombre, args){
  let r;
  try{ r = await sb.rpc(nombre, args); }catch(e){ r = {data:null, error:e}; }
  if(r && !r.error) return {estado:'ok', data:r.data};
  const err = (r && r.error) || {};
  const m = String(err.message || err || '').toLowerCase();
  if(String(err.code||'')==='PGRST202' || m.includes('could not find the function') || m.includes('schema cache')
     || (m.includes('function') && m.includes('does not exist'))) return {estado:'noexiste'};
  if(__esErrorDeRed(err)) throw (err instanceof Error ? err : new Error(err.message || 'se cortó la conexión'));
  return {estado:'noexiste', error:err};
}
// ¿La venta quedó cerrada y descontada en la base aunque se haya perdido la respuesta?
async function ventaYaCerradaEnServidor(ventaDiaId, pids){
  const d = await sb.from('ventas_dia').select('cerrado').eq('id', ventaDiaId).maybeSingle();
  if(d.error) throw d.error;
  if(!d.data || !d.data.cerrado) return false;
  const m = await sb.from('movimientos').select('clave_local').eq('venta_dia_id', ventaDiaId);
  if(m.error) throw m.error;
  const claves = new Set((m.data||[]).map(x=>x.clave_local));
  return (pids||[]).every(pid => claves.has('vtp_'+ventaDiaId+'_'+pid) || claves.has('vt_sync_'+ventaDiaId+'_'+pid));
}

// Descuenta UN producto de una venta UNA sola vez, aunque la conexión se corte en cualquier punto.
// Antes eran dos pasos sueltos (bajar el inventario y anotar el movimiento): si se cortaba
// entre los dos, el reintento volvía a bajar el inventario y la venta se descontaba doble.
// Ahora cada paso deja su marca en el teléfono y el reintento sigue justo donde se quedó.
function productoDeVentaYaDescontado(clave){
  return claveMovYaAplicada(clave) || claveMovYaAplicada('inv-' + clave);
}
async function descontarProductoDeVenta(clave, almacenId, pid, cantidad, nota, ventaDiaId){
  if(claveMovYaAplicada(clave)) return;
  if(await movimientoYaRegistrado(clave)){ marcarClaveMovAplicada(clave); return; }
  const marcaInv = 'inv-' + clave;
  let antes = null, despues = null;
  if(!claveMovYaAplicada(marcaInv)){
    const r = await ajustarInventario(almacenId, pid, -cantidad);
    antes = r.antes; despues = r.despues;
    marcarClaveMovAplicada(marcaInv);
  } else {
    // el inventario ya bajó en un intento anterior: solo falta anotar el movimiento
    try{
      const {data} = await sb.from('inventario').select('cantidad').eq('almacen_id', almacenId).eq('producto_id', pid).maybeSingle();
      if(data){ despues = Number(data.cantidad); antes = despues + Number(cantidad); }
    }catch(_){}
  }
  try{
    await insertarMovimiento({tipo:'extraccion', producto_id:pid, almacen_origen_id:almacenId, cantidad, nota,
      venta_dia_id: ventaDiaId, clave_local: clave, cant_antes: antes, cant_despues: despues});
  }catch(eMov){
    // ¿Se guardó igual y solo se perdió la respuesta?
    if(!(await movimientoYaRegistrado(clave))) throw eMov;
  }
  marcarClaveMovAplicada(clave);
}

async function pasoUnaVez(clave, fn){
  if(clave && claveMovYaAplicada(clave)) return false;
  await fn();
  if(clave) marcarClaveMovAplicada(clave);
  return true;
}

function claveMovYaAplicada(clave){
  if(!clave) return false;
  return lsGet('mov_aplicadas', []).includes(clave);
}
function marcarClaveMovAplicada(clave){
  if(!clave) return;
  const lista = lsGet('mov_aplicadas', []);
  if(!lista.includes(clave)){
    lista.push(clave);
    if(lista.length > 800) lista.splice(0, lista.length - 800); // no crecer sin límite
    lsSet('mov_aplicadas', lista);
  }
}

async function insertarMovimiento(payload){
  const intento = Object.assign({}, payload);
  const quitadas = [];
  // Hasta 6 pasadas: cada vez que la base se queje de UNA columna, se quita ESA y se
  // reintenta. Antes, si faltaba una sola (p.ej. cant_antes_destino, que solo usan los
  // traslados), el plan B borraba las CUATRO del antes/después y la fila del Historial
  // salía "—" aunque las otras columnas sí existieran.
  for(let vuelta=0; vuelta<=COLS_OPCIONALES_MOV.length; vuelta++){
    const {error} = await sb.from('movimientos').insert(intento);
    if(!error){
      if(quitadas.length && !__avisoColsMov){
        __avisoColsMov = true;   // avisar UNA vez, no en cada movimiento
        try{ registrarError('movimientos/columnas',
          'A la tabla "movimientos" le faltan columnas, por eso el Historial no muestra ANTES → DESPUÉS. Corre el SQL "movimientos_columnas.sql".',
          'faltan: '+quitadas.join(', ')); }catch(e){}
      }
      return;
    }
    const msg = (error.message||'').toLowerCase();
    // ¿De qué columna se queja? Se busca por nombre dentro del mensaje.
    const culpable = COLS_OPCIONALES_MOV.find(c => (c in intento) && msg.includes(c));
    if(culpable){ delete intento[culpable]; quitadas.push(culpable); continue; }
    // Se queja de una columna pero no dice cuál: se quita la siguiente opcional que quede.
    if(msg.includes('column') || msg.includes('schema cache')){
      const otra = COLS_OPCIONALES_MOV.find(c => c in intento);
      if(otra){ delete intento[otra]; quitadas.push(otra); continue; }
    }
    throw error;   // error de verdad (permisos, stock, etc.)
  }
  throw new Error('No se pudo registrar el movimiento');
}

async function movimientoYaRegistrado(clave){
  if(!clave) return false;
  try{
    const {data} = await sb.from('movimientos').select('id').eq('clave_local', clave).maybeSingle();
    return !!data;
  }catch(e){ return false; }   // si la columna no existe, no podemos saberlo
}

// Valida que un almacén exista de verdad. Sin esto, un traslado con el destino vacío
// mandaba la mercancía a un almacén inexistente: salía del origen y no llegaba a ningún lado.
function almacenValido(id){
  const n = Number(id);
  if(!n || !isFinite(n)) return false;
  if(Array.isArray(ALMACENES) && ALMACENES.length) return ALMACENES.some(a=>Number(a.id)===n);
  return true;   // si aún no cargó la lista, no bloqueamos
}

async function aplicarLineaMovimiento(it){
  // 1) ¿Ya se aplicó esta línea antes? (memoria del teléfono — funciona sin internet y sin SQL)
  if(it.aplicado === true) return;
  if(claveMovYaAplicada(it.clave_local)) { it.aplicado = true; return; }

  // 2) ¿Ya está registrada en la base? (si la columna existe)
  if(await movimientoYaRegistrado(it.clave_local)){
    it.aplicado = true; marcarClaveMovAplicada(it.clave_local); return;
  }

  // 3) Almacenes de verdad. Un id vacío o inventado haría desaparecer mercancía.
  if(!almacenValido(it.origen_id)){
    throw new Error('El almacén de origen no es válido. Revisa esa línea.');
  }
  if(it.tipo==='traslado'){
    if(!almacenValido(it.destino_id)) throw new Error('Falta elegir el almacén de destino del traslado.');
    if(Number(it.origen_id)===Number(it.destino_id)) throw new Error('El almacén de origen y el de destino no pueden ser el mismo.');
  }

  const clave = it.clave_local || null;
  if(it.tipo==='ingreso' || it.tipo==='extraccion'){
    const delta = it.tipo==='ingreso' ? it.cantidad : -it.cantidad;
    // Intento ATÓMICO (ajusta inventario + registra movimiento juntos). Si la función no existe,
    // usamos el camino de siempre (dos pasos).
    let hecho = false;
    try{
      const { error } = await sb.rpc('mover_inventario_atomico', {
        p_almacen: it.origen_id, p_producto: it.producto_id, p_delta: delta,
        p_tipo: it.tipo, p_nota: it.nota||'', p_clave: clave||''
      });
      if(error) throw error;
      hecho = true;
    }catch(e){
      const msg=(e && (e.message||e.code||'')+'').toLowerCase();
      const falta = msg.includes('does not exist')||msg.includes('not find')||msg.includes('42883')||msg.includes('schema cache')||msg.includes('404')||msg.includes('duplicate')||msg.includes('23505');
      if(!falta) throw e; // error real (ej. stock insuficiente): no seguir por el otro camino
    }
    if(!hecho){
      // DOS PASOS CON VUELTA ATRÁS. Antes, si el inventario se ajustaba y el movimiento NO
      // llegaba a guardarse, al reintentar se ajustaba OTRA VEZ: la mercancía se contaba doble.
      const almacen = it.origen_id;   // en ingreso, "origen" es el almacén destino real
      const r = await ajustarInventario(almacen, it.producto_id, delta);
      try{
        if(it.tipo==='ingreso'){
          await insertarMovimiento({tipo:'ingreso', producto_id:it.producto_id, almacen_destino_id:almacen, cantidad:it.cantidad, nota:it.nota, clave_local:clave, cant_antes:r.antes, cant_despues:r.despues});
        } else {
          await insertarMovimiento({tipo:'extraccion', producto_id:it.producto_id, almacen_origen_id:almacen, cantidad:it.cantidad, nota:it.nota, clave_local:clave, cant_antes:r.antes, cant_despues:r.despues});
        }
      }catch(eMov){
        // ¿Se guardó igual y solo se perdió la respuesta? Entonces está bien hecho.
        if(await movimientoYaRegistrado(clave)){ it.aplicado = true; marcarClaveMovAplicada(clave); return; }
        // No se guardó: se deshace el ajuste para que el reintento lo haga limpio.
        try{ await ajustarInventario(almacen, it.producto_id, -delta); }catch(_){}
        throw eMov;
      }
    }
  } else { // traslado
    // Preferimos la función ATÓMICA de la base (todo en una sola operación: si se corta la luz,
    // no queda nada a medias). Si esa función aún no existe, usamos el camino con rollback.
    let usoAtomico = false;
    try{
      const { error } = await sb.rpc('trasladar_atomico', {
        p_origen: it.origen_id, p_destino: it.destino_id, p_producto: it.producto_id,
        p_cantidad: it.cantidad, p_nota: it.nota||'', p_clave: clave
      });
      if(error) throw error;
      usoAtomico = true;
    }catch(e){
      const msg = (e && (e.message||e.code||'')+'' ).toLowerCase();
      const faltaFuncion = msg.includes('does not exist') || msg.includes('not find') || msg.includes('42883') || msg.includes('schema cache') || msg.includes('404') || msg.includes('duplicate') || msg.includes('23505');
      if(!faltaFuncion) throw e; // error real (ej. stock insuficiente): no seguir por el otro camino
      // La función no está creada todavía → camino con rollback (todo-o-nada por software).
      const rOrigen = await ajustarInventario(it.origen_id, it.producto_id, -it.cantidad);
      let destinoHecho = false;
      try{
        const rDestino = await ajustarInventario(it.destino_id, it.producto_id, it.cantidad);
        destinoHecho = true;
        await insertarMovimiento({tipo:'traslado', producto_id:it.producto_id, almacen_origen_id:it.origen_id, almacen_destino_id:it.destino_id, cantidad:it.cantidad, nota:it.nota, clave_local:clave, cant_antes:rOrigen.antes, cant_despues:rOrigen.despues, cant_antes_destino:rDestino.antes, cant_despues_destino:rDestino.despues});
      }catch(e2){
        // Antes se deshacía siempre. Pero si el movimiento SÍ se guardó y solo se perdió la
        // respuesta, deshacerlo dejaba la mercancía sin salir del origen Y el sistema creyendo
        // que el traslado estaba hecho: al reintentar no volvía a moverla. Ahora se comprueba.
        if(destinoHecho && await movimientoYaRegistrado(clave)){
          it.aplicado = true; marcarClaveMovAplicada(clave); return;
        }
        if(destinoHecho){ try{ await ajustarInventario(it.destino_id, it.producto_id, -it.cantidad); }catch(_){} }
        try{ await ajustarInventario(it.origen_id, it.producto_id, it.cantidad); }catch(_){}
        throw e2;
      }
    }
  }

  // 4) Queda marcada como aplicada: ningún reintento la volverá a sumar.
  it.aplicado = true;
  marcarClaveMovAplicada(clave);
}
async function confirmarMovimientos(){
  const msgEl = document.getElementById('movMsg');
  msgEl.textContent = ''; msgEl.className = 'msg';

  if(listaMovimientos.length===0){ msgEl.textContent='Agrega al menos un movimiento a la lista.'; msgEl.className='msg err'; return; }

  // Evita que un doble o triple toque aplique el mismo movimiento varias veces.
  if(confirmandoMovimientos) return;
  confirmandoMovimientos = true;
  const btn = document.getElementById('btnConfirmarMov');
  if(btn){ btn.disabled = true; btn.textContent = 'Procesando…'; }
  try{
    await confirmarMovimientosInterno(msgEl);
  } finally {
    confirmandoMovimientos = false;
    if(btn){ btn.disabled = false; btn.textContent = '✅ Confirmar movimiento'; }
  }
}

async function confirmarMovimientosInterno(msgEl){

  if(!navigator.onLine){
    encolarOperacionAdmin('movimiento_lista', {items: listaMovimientos.slice()});
    msgEl.textContent = `Sin internet: ${listaMovimientos.length} línea(s) guardadas en el teléfono. Se aplicarán al inventario cuando vuelva la conexión.`; msgEl.className='msg ok';
    listaMovimientos = [];
    renderListaMovimientos();
    return;
  }

  try{
    // Se comprueba el stock de TODA la lista junta, sumando lo que varias líneas le quitan
    // al mismo almacén y producto. Así nunca se aplica media lista.
    await verificarStockDeLista(listaMovimientos);

    for(const it of listaMovimientos){
      await aplicarLineaMovimiento(it);
    }

    msgEl.textContent = `Movimiento confirmado: ${listaMovimientos.length} línea(s) procesada(s).`; msgEl.className='msg ok';
    listaMovimientos = [];
    renderListaMovimientos();
    await cargarTodo();
  }catch(err){
    // Lógica: un error de STOCK no es un corte de internet. Si no alcanza la mercancía,
    // reintentar no lo va a arreglar — se avisa y la lista queda para que el dueño corrija.
    const msgStock = (err.message||'') + '';
    if(msgStock.includes('No hay suficiente') || msgStock.includes('negativo')){
      msgEl.textContent = msgStock + ' Corrige la cantidad y vuelve a confirmar.';
      msgEl.className = 'msg err';
      return; // la lista de movimientos queda intacta para corregirla
    }
    // Solo se re-encola lo que NO llegó a aplicarse. Las líneas ya aplicadas quedan marcadas
    // y jamás se vuelven a sumar al inventario.
    const pendientesReales = listaMovimientos.filter(it => it.aplicado !== true);
    if(pendientesReales.length > 0){
      encolarOperacionAdmin('movimiento_lista', {items: pendientesReales});
    }
    msgEl.textContent = 'Se cortó la conexión a medio camino. Lo que faltaba quedó guardado y se aplicará solo al volver el internet, sin repetir lo que ya entró. (' + (err.message||err) + ')';
    msgEl.className='msg ok';
    listaMovimientos = [];
    renderListaMovimientos();
    console.error(err);
  }
}

// Comprueba el stock de TODA la lista de una vez, sumando lo que cada línea le quita al
// mismo almacén y producto. Antes se miraba línea por línea: dos líneas de 60 sobre un
// stock de 100 pasaban las dos la prueba, y al aplicarlas la primera entraba y la segunda
// fallaba, dejando el lote a medias.
async function verificarStockDeLista(items){
  const necesario = {};   // "almacen|producto" -> cantidad total que se quiere sacar
  for(const it of (items||[])){
    if(it.aplicado === true) continue;                       // esa ya entró, no pide stock
    if(it.tipo!=='extraccion' && it.tipo!=='traslado') continue;
    const k = it.origen_id + '|' + it.producto_id;
    necesario[k] = (necesario[k] || 0) + Number(it.cantidad||0);
  }
  const faltantes = [];
  for(const k of Object.keys(necesario)){
    const [almacenId, productoId] = k.split('|').map(Number);
    const {data, error} = await sb.from('inventario').select('cantidad')
      .eq('almacen_id', almacenId).eq('producto_id', productoId).maybeSingle();
    if(error) throw error;
    const hay = data ? Number(data.cantidad) : 0;
    if(hay < necesario[k]){
      const prod = (PRODUCTOS||[]).find(p=>p.id===productoId);
      const alm  = (ALMACENES||[]).find(a=>a.id===almacenId);
      faltantes.push(`"${prod?prod.nombre:('producto #'+productoId)}"${alm?' en '+alm.nombre:''}: hay ${hay} y se necesitan ${necesario[k]}`);
    }
  }
  if(faltantes.length){
    throw new Error('No hay suficiente ' + faltantes.join(' · ') + '.');
  }
}

async function verificarStock(almacenId, productoId, cantidad){
  const {data, error} = await sb.from('inventario').select('cantidad').eq('almacen_id', almacenId).eq('producto_id', productoId).maybeSingle();
  if(error) throw error;
  const actual = data ? Number(data.cantidad) : 0;
  if(actual < cantidad){
    const prod = PRODUCTOS.find(p=>p.id===productoId);
    const alm = ALMACENES.find(a=>a.id===almacenId);
    const nombreP = prod ? prod.nombre : ('producto #'+productoId);
    const nombreA = alm ? alm.nombre : '';
    throw new Error(`No hay suficiente "${nombreP}"${nombreA?' en '+nombreA:''}: hay ${actual} y se necesitan ${cantidad}.`);
  }
}

// COMPROBAR UN MOVIMIENTO desde el historial: mira el producto (y almacén) que tocó ese
// movimiento y reconstruye su inventario desde TODOS sus movimientos. Si el resultado coincide
// con lo que hay ahora, ese movimiento (y toda la cadena de ese producto) se aplicó bien. Si no,
// muestra la diferencia y ofrece corregir el inventario al valor que dicen los movimientos.
async function comprobarMovimiento(productoId, almOrigenId, almDestinoId, tipo, movId){
  const fila = document.getElementById('comprob-mov-'+movId);
  const celda = document.getElementById('comprob-mov-cell-'+movId);
  if(!fila || !celda) return;
  const abierto = fila.style.display !== 'none';
  if(abierto){ fila.style.display = 'none'; celda.innerHTML = ''; return; }
  fila.style.display = 'table-row';
  celda.innerHTML = '<div style="padding:10px; color:var(--muted)">Comprobando…</div>';

  // Los almacenes que tocó este movimiento
  const almacenes = [];
  if(tipo==='ingreso' && almDestinoId!=null) almacenes.push(almDestinoId);
  else if(tipo==='extraccion' && almOrigenId!=null) almacenes.push(almOrigenId);
  else if(tipo==='traslado'){ if(almOrigenId!=null) almacenes.push(almOrigenId); if(almDestinoId!=null) almacenes.push(almDestinoId); }
  if(almacenes.length===0 && almOrigenId!=null) almacenes.push(almOrigenId);

  try{
    // Todos los movimientos de ESTE producto
    const movs = await traerTodasLasFilas(()=> sb.from('movimientos')
      .select('tipo, cantidad, almacen_origen_id, almacen_destino_id')
      .eq('producto_id', productoId).order('id',{ascending:true}));

    const resultados = [];
    for(const almId of almacenes){
      // Reconstruir el inventario de este producto en este almacén
      let deberia = 0;
      for(const m of (movs||[])){
        const c = Number(m.cantidad)||0;
        if(m.tipo==='ingreso' && m.almacen_destino_id===almId) deberia += c;
        else if(m.tipo==='extraccion' && m.almacen_origen_id===almId) deberia -= c;
        else if(m.tipo==='traslado'){ if(m.almacen_origen_id===almId) deberia -= c; if(m.almacen_destino_id===almId) deberia += c; }
      }
      const {data: invRow} = await sb.from('inventario').select('cantidad').eq('almacen_id', almId).eq('producto_id', productoId).maybeSingle();
      const hay = invRow ? Number(invRow.cantidad) : 0;
      resultados.push({almId, hay, deberia, dif: hay - deberia});
    }

    const prod = PRODUCTOS.find(p=>p.id===productoId);
    const nombreProd = prod ? prod.nombre : 'este producto';
    const partes = resultados.map(r=>{
      const alm = ALMACENES.find(a=>a.id===r.almId);
      const nombreAlm = alm ? alm.nombre : 'almacén';
      if(Math.abs(r.dif) < 0.001){
        return `<div style="color:var(--green); padding:6px 0">✓ <strong>${nombreProd}</strong> en <strong>${nombreAlm}</strong>: hay ${num(r.hay)}, y según todos sus movimientos deberían ser ${num(r.deberia)}. <strong>Cuadra: el movimiento se aplicó bien.</strong></div>`;
      }
      const faltanSobran = r.dif < 0 ? `faltan ${num(Math.abs(r.dif))}` : `sobran ${num(r.dif)}`;
      return `<div style="padding:6px 0">
        <div style="color:var(--red)">⚠️ <strong>${nombreProd}</strong> en <strong>${nombreAlm}</strong>: hay ${num(r.hay)}, pero según sus movimientos deberían ser ${num(r.deberia)} (${faltanSobran}).</div>
        <button class="ghost" style="margin-top:6px; border-color:var(--amber); color:var(--amber)"
          onclick="corregirInventarioSegunMovimientos(${r.almId}, ${productoId}, ${r.deberia}, ${movId})">
          Corregir: dejar el inventario en ${num(r.deberia)}
        </button>
      </div>`;
    }).join('');

    celda.innerHTML = `<div style="padding:10px; background:var(--panel2)">${partes}</div>`;
  }catch(err){
    celda.innerHTML = `<div class="msg err" style="padding:10px">No se pudo comprobar: ${err.message||err}</div>`;
  }
}

// Reconcilia el inventario con lo que dictan los movimientos. Como los movimientos YA suman el
// valor correcto, aquí solo se ajusta el inventario a ese valor (NO se registra un movimiento
// nuevo: eso volvería a descuadrar). Es un "recalcular desde el historial" del producto.
async function corregirInventarioSegunMovimientos(almacenId, productoId, valorCorrecto, movId){
  if(!confirm(`Se va a dejar el inventario en ${num(valorCorrecto)} (lo que suman todos sus movimientos).\n\n¿Continuar?`)) return;
  try{
    const {data: invRow} = await sb.from('inventario').select('*').eq('almacen_id', almacenId).eq('producto_id', productoId).maybeSingle();
    const antes = invRow ? Number(invRow.cantidad) : 0;
    if(antes === Number(valorCorrecto)){ alert('Ya estaba correcto.'); return; }
    if(invRow){ await escribirConReintento(()=> sb.from('inventario').update({cantidad: Number(valorCorrecto)}).eq('id', invRow.id)); }
    else { exigir(await sb.from('inventario').insert({almacen_id:almacenId, producto_id:productoId, cantidad:Number(valorCorrecto)})); }
    await cargarTodo();
    const celda = document.getElementById('comprob-mov-cell-'+movId);
    if(celda){ celda.innerHTML = `<div class="msg ok" style="padding:10px; margin:8px">Listo: el inventario de este producto quedó en ${num(valorCorrecto)}, cuadrando con sus movimientos.</div>`; }
  }catch(err){
    alert('No se pudo corregir: ' + (err.message||err));
  }
}

// COMPROBAR INVENTARIO: reconstruye el inventario de cada producto en cada almacén sumando
// TODOS sus movimientos (ingresos entran; extracciones y ventas salen; traslados mueven de un
// almacén a otro; los ajustes por conteo también son ingresos/extracciones). Si el número
// reconstruido coincide con el inventario actual, la cadena de movimientos es real y consistente
// (incluidos los ajustes). Si no coincide, se señala exactamente qué producto/almacén revisar.
async function comprobarInventario(){
  const msgEl = document.getElementById('comprobarInvMsg');
  const bodyEl = document.getElementById('comprobarInvBody');
  msgEl.textContent = 'Reconstruyendo el inventario desde los movimientos…'; msgEl.className = 'msg';
  bodyEl.innerHTML = '';
  try{
    // Inventario actual (de la base, para no depender de la memoria). Paginado (evita el tope de 1000).
    const invActual = [];
    { const PAGE=1000; let desde=0; for(;;){ const {data, error} = await sb.from('inventario').select('almacen_id, producto_id, cantidad').order('id',{ascending:true}).range(desde, desde+PAGE-1); if(error) throw error; invActual.push(...(data||[])); if(!data||data.length<PAGE) break; desde+=PAGE; } }

    // TODOS los movimientos (por tandas para no pasarnos de límite)
    let movs = [], desde = 0, tanda = 1000;
    while(true){
      const {data, error} = await sb.from('movimientos').select('tipo, producto_id, cantidad, almacen_origen_id, almacen_destino_id')
        .order('id',{ascending:true}).range(desde, desde+tanda-1);
      if(error) throw error;
      movs = movs.concat(data||[]);
      if(!data || data.length < tanda) break;
      desde += tanda;
      if(desde > 200000) break; // tope de seguridad
    }

    // Reconstruir: clave = almacen|producto
    const recon = {};
    const key = (a,p)=> a+'|'+p;
    const sumar = (a,p,delta)=>{ if(a==null||p==null) return; const k=key(a,p); recon[k]=(recon[k]||0)+delta; };
    for(const m of movs){
      const c = Number(m.cantidad)||0;
      if(m.tipo==='ingreso'){ sumar(m.almacen_destino_id, m.producto_id, c); }
      else if(m.tipo==='extraccion'){ sumar(m.almacen_origen_id, m.producto_id, -c); }
      else if(m.tipo==='traslado'){ sumar(m.almacen_origen_id, m.producto_id, -c); sumar(m.almacen_destino_id, m.producto_id, c); }
    }

    // Comparar con el inventario actual (unimos las dos listas de claves)
    const actual = {};
    for(const i of (invActual||[])){ actual[key(i.almacen_id, i.producto_id)] = Number(i.cantidad)||0; }
    const claves = new Set([...Object.keys(actual), ...Object.keys(recon)]);

    const filas = [];
    let cuadran = 0, descuadran = 0;
    for(const k of claves){
      const [almId, prodId] = k.split('|').map(Number);
      const hay = actual[k] || 0;
      const deberia = recon[k] || 0;
      const dif = hay - deberia;
      if(Math.abs(dif) < 0.001){ cuadran++; }
      else{
        descuadran++;
        const prod = PRODUCTOS.find(p=>p.id===prodId);
        const alm = ALMACENES.find(a=>a.id===almId);
        filas.push({ producto: prod?prod.nombre:'(#'+prodId+')', almacen: alm?alm.nombre:'(#'+almId+')', hay, deberia, dif });
      }
    }
    filas.sort((a,b)=> Math.abs(b.dif) - Math.abs(a.dif));

    if(descuadran === 0){
      msgEl.textContent = `✓ Todo cuadra: los ${cuadran} renglones de inventario coinciden con la suma de sus movimientos. Los ajustes y movimientos son reales y consistentes.`;
      msgEl.className = 'msg ok';
      bodyEl.innerHTML = '';
      return;
    }

    msgEl.textContent = `Se revisaron ${cuadran+descuadran} renglones: ${cuadran} cuadran y ${descuadran} tienen diferencia. Revisa los de abajo.`;
    msgEl.className = 'msg err';
    bodyEl.innerHTML = `
      <div style="color:var(--muted); font-size:12px; margin-bottom:8px">
        "Hay" = lo que muestra el inventario ahora. "Según movimientos" = lo que debería haber sumando todo el historial.
        Una diferencia significa que hubo un cambio de inventario sin su movimiento (o al revés).
      </div>
      <table>
        <thead><tr><th>Producto</th><th>Puesto</th><th class="numcell">Hay</th><th class="numcell">Según mov.</th><th class="numcell">Diferencia</th></tr></thead>
        <tbody>
          ${filas.map(f=>`<tr>
            <td>${f.producto}</td>
            <td>${f.almacen}</td>
            <td class="numcell">${num(f.hay)}</td>
            <td class="numcell">${num(f.deberia)}</td>
            <td class="numcell" style="color:${f.dif>0?'var(--amber)':'var(--red)'}; font-weight:700">${f.dif>0?'+':''}${num(f.dif)}</td>
          </tr>`).join('')}
        </tbody>
      </table>`;
  }catch(err){
    msgEl.textContent = 'No se pudo comprobar: ' + (err.message||err);
    msgEl.className = 'msg err';
  }
}

async function ajustarInventario(almacenId, productoId, delta){
  const {data:rows, error} = await sb.from('inventario').select('id,cantidad').eq('almacen_id', almacenId).eq('producto_id', productoId).order('id',{ascending:true});
  if(error) throw error;
  if(rows && rows.length){
    // Suma por si quedaran filas duplicadas; deja el total en la primera y las demás en 0.
    const antes = rows.reduce((s,r)=>s+Number(r.cantidad||0),0);
    const nuevaCantidad = antes + delta;
    if(nuevaCantidad < 0){
      throw new Error(`No se puede dejar el inventario en negativo (hay ${antes} y se intentan quitar ${Math.abs(delta)}).`);
    }
    const {error:e2} = await sb.from('inventario').update({cantidad:nuevaCantidad}).eq('id', rows[0].id);
    if(e2){
      // ¿De verdad no se guardó, o se guardó y solo se perdió la respuesta? Se vuelve a leer.
      // Sin esto, un "fallo" que en realidad sí se guardó hacía que el reintento sumara doble.
      let llego = false;
      try{
        const {data:chk, error:eChk} = await sb.from('inventario').select('cantidad').eq('id', rows[0].id).maybeSingle();
        llego = !eChk && chk && Number(chk.cantidad) === nuevaCantidad && nuevaCantidad !== Number(rows[0].cantidad||0);
      }catch(_){}
      if(!llego) throw e2;
    }
    for(let k=1;k<rows.length;k++){ try{ await escribirConReintento(()=> sb.from('inventario').update({cantidad:0}).eq('id', rows[k].id)); }catch(_){} }
    return {antes, despues: nuevaCantidad};
  } else {
    if(delta < 0){
      throw new Error('No se puede descontar de un producto que no tiene inventario en este almacén.');
    }
    const {error:e3} = await sb.from('inventario').insert({almacen_id:almacenId, producto_id:productoId, cantidad:delta});
    if(e3){
      // Si el candado único rechaza porque la fila ya apareció, re-leemos y SUMAMOS (no perdemos el ajuste).
      if((e3.message||'').toLowerCase().includes('duplicate') || e3.code==='23505'){
        const {data:d2} = await sb.from('inventario').select('id,cantidad').eq('almacen_id', almacenId).eq('producto_id', productoId).order('id',{ascending:true});
        if(d2 && d2.length){
          const antes = d2.reduce((s,r)=>s+Number(r.cantidad||0),0);
          const nuevaCantidad = antes + delta;
          if(nuevaCantidad < 0) throw new Error(`No se puede dejar el inventario en negativo (hay ${antes}).`);
          const {error:e4} = await sb.from('inventario').update({cantidad:nuevaCantidad}).eq('id', d2[0].id);
          if(e4) throw e4;
          for(let k=1;k<d2.length;k++){ try{ await escribirConReintento(()=> sb.from('inventario').update({cantidad:0}).eq('id', d2[k].id)); }catch(_){} }
          return {antes, despues: nuevaCantidad};
        }
      }
      // Igual que arriba: ¿la fila nueva sí se creó y solo se perdió la respuesta?
      let llego = false;
      try{
        const {data:chk, error:eChk} = await sb.from('inventario').select('cantidad').eq('almacen_id', almacenId).eq('producto_id', productoId);
        llego = !eChk && chk && chk.length > 0 && chk.reduce((t,r)=>t+Number(r.cantidad||0),0) === delta;
      }catch(_){}
      if(!llego) throw e3;
    }
    return {antes: 0, despues: delta};
  }
}
