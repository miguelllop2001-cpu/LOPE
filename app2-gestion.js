// LOPE · Mi Negocio — Historial, almacenes, productos, importar/exportar y Dinero
// (Este archivo solo tiene funciones. Lo que se ejecuta al abrir la app está en app8-arranque.js)

async function cargarHistorial(){
  // Empezar de cero (al abrir la pestaña o al refrescar)
  HISTORIAL_MOVS = [];
  historialHayMas = true;
  await cargarMasHistorial();
}

async function cargarMasHistorial(){
  if(historialCargando) return;
  historialCargando = true;
  const btn = document.getElementById('btnMasHistorial');
  if(btn){ btn.disabled = true; btn.textContent = 'Cargando…'; }

  try{
    // Cursor: traemos lo más nuevo primero y, en cada tanda, lo anterior a lo más viejo que ya tenemos
    let q = sb.from('movimientos').select('*');
    if(HISTORIAL_MOVS.length > 0){
      const masViejo = HISTORIAL_MOVS[HISTORIAL_MOVS.length-1];
      q = q.lt('creado_en', masViejo.creado_en);
    }
    const {data, error} = await q.order('creado_en', {ascending:false}).limit(HISTORIAL_POR_TANDA);
    if(error) throw error;
    const nuevos = data || [];
    // Si vino menos de una tanda completa, ya no queda nada más viejo
    if(nuevos.length < HISTORIAL_POR_TANDA) historialHayMas = false;
    // Evitar repetidos por si dos movimientos comparten el mismo instante exacto
    const yaTengo = new Set(HISTORIAL_MOVS.map(m=>m.id));
    for(const m of nuevos){ if(!yaTengo.has(m.id)) HISTORIAL_MOVS.push(m); }
  }catch(err){
    console.error('No se pudo cargar más historial:', err);
  }finally{
    historialCargando = false;
  }

  await renderHistorial();
}

async function renderHistorial(){
  const data = HISTORIAL_MOVS;
  const body = document.getElementById('historialBody');
  const empty = document.getElementById('historialMovEmpty');
  const pie = document.getElementById('historialPie');
  if(!data || data.length===0){
    body.innerHTML=''; empty.style.display='block';
    if(pie) pie.innerHTML='';
    return;
  }
  empty.style.display='none';

  // Agrupar las filas que pertenecen a una venta del día (venta_dia_id) en una sola entrada,
  // y mezclar con los movimientos sueltos, todo ordenado por fecha real (más reciente arriba).
  const gruposPorVenta = new Map();
  const entradas = []; // {timestamp, html}

  for(const m of data){
    if(m.venta_dia_id){
      if(!gruposPorVenta.has(m.venta_dia_id)){
        gruposPorVenta.set(m.venta_dia_id, {timestamp:m.creado_en, items:[]});
      }
      gruposPorVenta.get(m.venta_dia_id).items.push(m);
    } else {
      const p = PRODUCTOS.find(p=>p.id===m.producto_id);
      const origen = ALMACENES.find(a=>a.id===m.almacen_origen_id);
      const destino = ALMACENES.find(a=>a.id===m.almacen_destino_id);
      const fecha = new Date(m.creado_en).toLocaleString();
      const antesDesp = celdaAntesDespues(m);
      const esDuenoMov = usuarioActual && usuarioActual.rol === 'dueno';
      const btnComprobar = esDuenoMov
        ? `<button class="ghost" style="padding:3px 10px; font-size:12px" onclick="comprobarMovimiento(${m.producto_id}, ${m.almacen_origen_id||'null'}, ${m.almacen_destino_id||'null'}, '${m.tipo}', ${m.id})">Comprobar</button>`
        : '';
      entradas.push({timestamp:m.creado_en, html:`<tr>
        <td>${fecha}</td>
        <td><span class="badge ${m.tipo}">${m.tipo}</span></td>
        <td>${p?p.nombre:'—'}</td>
        <td>${origen?origen.nombre:'—'}</td>
        <td>${destino?destino.nombre:'—'}</td>
        <td class="numcell">${num(m.cantidad)}</td>
        <td class="numcell">${antesDesp}</td>
        <td>${m.nota||''}</td>
        <td>${btnComprobar}</td>
      </tr>
      <tr id="comprob-mov-${m.id}" style="display:none"><td colspan="9" style="padding:0" id="comprob-mov-cell-${m.id}"></td></tr>`});
    }
  }

  // Traemos los datos reales del día (fecha exacta y total) en vez de inferirlos de los movimientos
  const idsVentaDia = Array.from(gruposPorVenta.keys());
  let ventasDiaInfo = [];
  let cobrosPorDia = {};
  if(idsVentaDia.length>0){
    const [{data: vd}, {data: cobros}] = await Promise.all([
      sb.from('ventas_dia').select('*').in('id', idsVentaDia),
      sb.from('deudas').select('venta_dia_id, monto, tipo, nota, clave_comision').in('venta_dia_id', idsVentaDia)
    ]);
    ventasDiaInfo = vd || [];
    (cobros||[]).forEach(c=>{
      if(c.tipo==='debo' && ((c.nota||'').includes('Comisi') || c.clave_comision)) return; // la comisión no baja el total
      cobrosPorDia[c.venta_dia_id] = (cobrosPorDia[c.venta_dia_id]||0) + Number(c.monto);
    });
  }

  for(const [ventaDiaId, grupo] of gruposPorVenta){
    const items = grupo.items;
    const origen = ALMACENES.find(a=>a.id===items[0].almacen_origen_id);
    const infoDia = ventasDiaInfo.find(v=>v.id===ventaDiaId);
    const fecha = infoDia ? infoDia.fecha : new Date(grupo.timestamp).toLocaleDateString();
    const totalUds = items.reduce((s,i)=>s+Number(i.cantidad),0);
    const totalBruto = infoDia ? Number(infoDia.total) : null;
    const cobrado = cobrosPorDia[ventaDiaId] || 0;
    const totalNeto = totalBruto!==null ? totalBruto - cobrado : null;
    const totalTxt = totalNeto!==null ? ` — $${num(totalNeto)}` : '';

    entradas.push({timestamp:grupo.timestamp, html:`<tr class="venta-group-header" onclick="toggleHistVenta(${ventaDiaId})" style="cursor:pointer">
      <td>${fecha}</td>
      <td><span class="badge traslado">venta del día</span></td>
      <td colspan="2"><strong>${origen?origen.nombre:'—'}</strong> — ${items.length} artículo(s) — ${totalUds} uds.${totalTxt} <span style="color:var(--muted)">▾ ver detalle</span></td>
      <td>${origen?origen.nombre:'—'}</td>
      <td></td>
      <td></td>
      <td></td>
    </tr>
    <tr id="hist-venta-${ventaDiaId}" style="display:none"><td colspan="9" style="padding:0" id="hist-venta-contenido-${ventaDiaId}">
      <div style="padding:10px; color:var(--muted)">Cargando detalle…</div>
    </td></tr>`});
  }

  entradas.sort((a,b)=> new Date(b.timestamp) - new Date(a.timestamp));
  body.innerHTML = entradas.map(e=>e.html).join('');

  // Pie: cuánto se está mostrando y botón para traer lo más viejo
  if(pie){
    pie.innerHTML = `
      <div style="display:flex; align-items:center; gap:12px; flex-wrap:wrap; margin-top:10px">
        <span style="color:var(--muted); font-size:12px">Mostrando ${data.length} movimiento(s)${historialHayMas ? '' : ' — este es todo el historial'}</span>
        ${historialHayMas
          ? '<button class="ghost" id="btnMasHistorial" onclick="cargarMasHistorial()">Ver más antiguos</button>'
          : ''}
      </div>`;
  }
}

async function toggleHistVenta(id){
  const row = document.getElementById('hist-venta-'+id);
  const abrir = row.style.display === 'none';
  row.style.display = abrir ? 'table-row' : 'none';
  if(!abrir) return;

  const contenedor = document.getElementById('hist-venta-contenido-'+id);
  if(contenedor.dataset.loaded) return;

  try{
    const [{data: items, error: e1}, {data: cobros, error: e2}, {data: movs}, {data: diaData}] = await Promise.all([
      sb.from('venta_items').select('*').eq('venta_dia_id', id),
      sb.from('deudas').select('*').eq('venta_dia_id', id),
      sb.from('movimientos').select('*').eq('venta_dia_id', id),
      sb.from('ventas_dia').select('clave_local').eq('id', id).maybeSingle()
    ]);
    if(e1) throw e1;
    if(e2) throw e2;

    // Cruzamos cada producto con su movimiento para mostrar cuánto había antes y después.
    const movPorProducto = {};
    (movs||[]).forEach(m=>{ movPorProducto[m.producto_id] = m; });

    const filasProductos = (items||[]).map(it=>{
      const p = PRODUCTOS.find(p=>p.id===it.producto_id);
      const mv = movPorProducto[it.producto_id];
      const antesDesp = mv ? celdaAntesDespues(mv) : '<span style="color:var(--muted)">—</span>';
      return `<tr><td style="padding-left:30px">${p?p.nombre:'(eliminado)'}</td><td class="numcell">${num(it.cantidad)}</td><td class="numcell">${antesDesp}</td><td class="numcell">$${num(it.precio_venta)}</td><td class="numcell">$${num(it.cantidad*it.precio_venta)}</td></tr>`;
    }).join('');

    // Distinguir la COMISIÓN que ESTA venta generó (no es un cobro; es lo que se le debe al
    // trabajador por esta venta) de los COBROS que se AGREGARON a esta venta como descuento
    // (comisiones de otros días, o pagos de cliente, que el trabajador cobró aquí y por eso
    // entregó menos efectivo). Ambos van con venta_dia_id de esta venta, así que los separamos:
    // la comisión propia tiene clave 'comvta-<esta venta>'; los cobros agregados están PAGADOS
    // y NO son esa comisión propia.
    const claveEstaVenta1 = 'comvta-' + id;
    const claveEstaVenta2 = (diaData && diaData.clave_local) ? ('comvta-' + diaData.clave_local) : null;
    const esComisionDeEstaVenta = (c)=> c.clave_comision === claveEstaVenta1 || (claveEstaVenta2 && c.clave_comision === claveEstaVenta2);
    const esComision = (c)=> (c.nota||'').includes('Comisi') || c.clave_comision;

    const cobrosCliente = (cobros||[]).filter(c => !esComision(c));
    const cobrosComisionAgregados = (cobros||[]).filter(c => esComision(c) && c.pagada && !esComisionDeEstaVenta(c));

    const filasCobros = [
      ...cobrosCliente.map(c =>
        `<tr style="color:var(--red)"><td style="padding-left:30px">Cobro de pago pendiente</td><td class="numcell">—</td><td class="numcell">—</td><td class="numcell">—</td><td class="numcell">-$${num(c.monto)}</td></tr>`),
      ...cobrosComisionAgregados.map(c =>
        `<tr style="color:var(--red)"><td style="padding-left:30px">Cobro (descuento)</td><td class="numcell">—</td><td class="numcell">—</td><td class="numcell">—</td><td class="numcell">-$${num(c.monto)}</td></tr>`)
    ].join('');

    contenedor.innerHTML = `<table style="margin:0">
      <thead><tr><th style="padding-left:30px">Producto</th><th class="numcell">Cant.</th><th class="numcell">Antes → Después</th><th class="numcell">Precio</th><th class="numcell">Subtotal</th></tr></thead>
      <tbody>${filasProductos + filasCobros || '<tr><td class="empty" colspan="5">Sin artículos</td></tr>'}</tbody>
    </table>`;
    contenedor.dataset.loaded = '1';
  }catch(err){
    console.error(err);
    contenedor.innerHTML = '<div class="msg err" style="padding:10px">No se pudo cargar el detalle.</div>';
  }
}

// ---------- ADMIN: ALMACENES ----------
async function crearAlmacen(){
  if(usuarioActual.rol !== 'dueno'){ alert('Solo el dueño puede crear almacenes.'); return; }
  const nombre = document.getElementById('nuevoAlmacen').value.trim();
  const msgEl = document.getElementById('almacenMsg');
  if(!nombre){ msgEl.textContent='Escribe un nombre.'; msgEl.className='msg err'; return; }
  // Lógica: dos almacenes con el mismo nombre confundirían las ventas y el inventario
  if(ALMACENES.some(a => a.nombre.trim().toLowerCase() === nombre.toLowerCase())){
    msgEl.textContent = 'Ya existe un almacén con ese nombre.'; msgEl.className='msg err'; return;
  }
  const {error} = await sb.from('almacenes').insert({nombre});
  if(error){ msgEl.textContent='Error: '+error.message; msgEl.className='msg err'; return; }
  document.getElementById('nuevoAlmacen').value='';
  msgEl.textContent='Almacén creado.'; msgEl.className='msg ok';
  await cargarTodo();
}

// ── ARCHIVAR ALMACENES ──────────────────────────────────────────────────────
// Un almacén con historial NO se puede borrar: las ventas y los movimientos apuntan a él
// y borrarlo perdería ese pasado (o la base lo impide). Archivarlo lo quita de todas las
// listas donde se elige almacén, pero deja el historial entero y legible.
function estaArchivado(a){
  if(!a) return false;
  if(a.activo === false) return true;
  return /\(archivado\)\s*$/i.test(String(a.nombre||''));
}
function almacenesVisibles(){
  return (ALMACENES||[]).filter(a=>!estaArchivado(a));
}
function stockDeAlmacen(id){
  return (INVENTARIO||[]).filter(i=>Number(i.almacen_id)===Number(id))
    .reduce((s,i)=>s+Number(i.cantidad||0),0);
}

async function archivarAlmacen(id){
  if(!usuarioActual || usuarioActual.rol!=='dueno'){ alert('Solo el dueño puede archivar almacenes.'); return; }
  if(!navigator.onLine){ alert('Necesitas internet.'); return; }
  const alm = (ALMACENES||[]).find(a=>Number(a.id)===Number(id));
  if(!alm){ alert('No encontré ese almacén.'); return; }

  // ¿Hay alguien trabajando en él?
  try{
    const us = await traerTodasLasFilas(()=> sb.from('usuarios').select('nombre, almacen_id, activo').order('id',{ascending:true}));
    const suyos = (us||[]).filter(u=>u.activo!==false && Number(u.almacen_id)===Number(id));
    if(suyos.length){
      alert('No puedes archivar "'+alm.nombre+'" todavía: hay '+suyos.length+' trabajador(es) asignados a él ('+suyos.map(u=>u.nombre).join(', ')+').\n\nCámbiales el puesto primero en Usuarios.');
      return;
    }
  }catch(e){ /* si no se puede mirar, seguimos */ }

  // ¿Le queda mercancía?
  const quedan = (INVENTARIO||[]).filter(i=>Number(i.almacen_id)===Number(id) && Number(i.cantidad)>0);
  const uds = quedan.reduce((s,i)=>s+Number(i.cantidad||0),0);
  if(uds > 0){
    const destinos = almacenesVisibles().filter(a=>Number(a.id)!==Number(id) && !esMayoreo(a));
    if(!destinos.length){ alert('"'+alm.nombre+'" tiene '+num(uds)+' unidad(es) y no hay otro almacén a donde pasarlas.'); return; }
    const lista = destinos.map((a,i)=>'  '+(i+1)+') '+a.nombre).join('\n');
    const resp = prompt('"'+alm.nombre+'" todavía tiene '+quedan.length+' artículo(s), '+num(uds)+' unidad(es) en total.\n\n'
      + 'Antes de archivarlo hay que pasar esa mercancía a otro almacén. ¿A cuál?\n\n'+lista+'\n\n'
      + 'Escribe el número (o cancela para no hacer nada):');
    if(resp===null) return;
    const idx = Number(String(resp).trim()) - 1;
    if(!(idx>=0 && idx<destinos.length)){ alert('Número no válido. No se hizo nada.'); return; }
    const destino = destinos[idx];
    if(!confirm('Se van a pasar '+num(uds)+' unidad(es) de "'+alm.nombre+'" a "'+destino.nombre+'".\n\nQueda registrado como traslado, artículo por artículo. ¿Seguir?')) return;
    let movidos=0, fallados=[];
    for(const i of quedan){
      const prod=(PRODUCTOS||[]).find(x=>x.id===i.producto_id);
      try{
        await aplicarLineaMovimiento({
          clave_local: 'arch_'+id+'_'+i.producto_id+'_'+Date.now(),
          tipo:'traslado', origen_id:Number(id), destino_id:Number(destino.id),
          producto_id:i.producto_id, cantidad:Number(i.cantidad),
          nota:'Vaciado al archivar '+alm.nombre
        });
        movidos++;
      }catch(e){ fallados.push((prod?prod.nombre:('#'+i.producto_id))+': '+((e&&e.message)||e)); }
    }
    await cargarTodo();
    if(fallados.length){
      alert('Se pasaron '+movidos+' artículo(s), pero '+fallados.length+' no se pudieron:\n\n'+fallados.slice(0,5).join('\n')
        +'\n\nEl almacén NO se archivó. Revisa eso y vuelve a intentarlo.');
      return;
    }
    alert('Mercancía pasada a "'+destino.nombre+'". ✓');
  }

  if(!confirm('¿Archivar "'+alm.nombre+'"?\n\nDeja de salir en las listas para elegir almacén, pero su historial de ventas y movimientos se conserva completo.\n\nLo puedes volver a activar cuando quieras.')) return;
  try{
    let r = await sb.from('almacenes').update({activo:false}).eq('id', id).select();
    if(r.error || !r.data || !r.data.length){
      // La columna "activo" no existe en esta base: se marca en el propio nombre.
      const nuevo = String(alm.nombre||'').replace(/\s*\(archivado\)\s*$/i,'') + ' (archivado)';
      const r2 = await sb.from('almacenes').update({nombre:nuevo}).eq('id', id).select();
      if(r2.error) throw r2.error;
      if(!r2.data || !r2.data.length){
        alert('El servidor no aplicó el cambio (permisos). Corre en Supabase el SQL "permisos_todas_tablas.sql".');
        return;
      }
    }
    await cargarTodo();
    alert('"'+alm.nombre+'" archivado. ✓\n\nSu historial sigue intacto.');
  }catch(e){
    alert('No se pudo archivar: '+((e&&e.message)||e));
    try{ registrarError('almacenes','No se pudo archivar', String((e&&e.message)||e)); }catch(_){}
  }
}

async function reactivarAlmacen(id){
  if(!usuarioActual || usuarioActual.rol!=='dueno'){ alert('Solo el dueño puede hacer esto.'); return; }
  if(!navigator.onLine){ alert('Necesitas internet.'); return; }
  const alm = (ALMACENES||[]).find(a=>Number(a.id)===Number(id));
  if(!alm) return;
  const limpio = String(alm.nombre||'').replace(/\s*\(archivado\)\s*$/i,'');
  if(!confirm('¿Volver a activar "'+limpio+'"?')) return;
  try{
    let r = await sb.from('almacenes').update({activo:true, nombre:limpio}).eq('id', id).select();
    if(r.error || !r.data || !r.data.length){
      const r2 = await sb.from('almacenes').update({nombre:limpio}).eq('id', id).select();
      if(r2.error) throw r2.error;
    }
    await cargarTodo();
    alert('"'+limpio+'" activado otra vez. ✓');
  }catch(e){ alert('No se pudo: '+((e&&e.message)||e)); }
}

async function eliminarAlmacen(id){
  if(usuarioActual.rol !== 'dueno'){ alert('Solo el dueño puede eliminar almacenes.'); return; }
  if(!navigator.onLine){ alert('Necesitas internet para eliminar un almacén.'); return; }
  const alm=(ALMACENES||[]).find(a=>a.id===id); const nom=alm?alm.nombre:'este almacén';
  if(!confirm('¿Eliminar "'+nom+'"? Se borra su inventario. (No se borran las ventas ni movimientos ya registrados.)')) return;
  try{
    // 1) borrar primero el inventario de ese almacén (lo advertimos)
    { const r=await sb.from('inventario').delete().eq('almacen_id', id); if(r.error) throw r.error; }
    // 2) borrar el almacén y CONFIRMAR que de verdad se borró
    const { data, error } = await sb.from('almacenes').delete().eq('id', id).select();
    if(error) throw error;
    if(!data || !data.length){
      alert('El servidor no borró el almacén (permisos). Corre en Supabase el SQL "permisos_todas_tablas.sql" y vuelve a intentar.');
      registrarError('almacenes','Borrado de almacén sin efecto (RLS)', 'almacen '+id);
      return;
    }
    await cargarTodo();
    alert('Almacén "'+nom+'" eliminado. ✓');
  }catch(e){
    const m=String((e&&e.message)||e);
    if(/foreign key|violates|referenced|still referenced/i.test(m)){
      alert('No se puede borrar "'+nom+'" porque tiene ventas o movimientos registrados, y borrarlo perdería ese historial. Si de verdad quieres eliminarlo por completo, dime y te preparo un borrado seguro que limpie también su historial.');
    } else if(/permission|row-level|rls|not allowed/i.test(m)){
      alert('No se pudo por permisos. Corre en Supabase el SQL "permisos_todas_tablas.sql".');
    } else {
      alert('No se pudo eliminar: '+m);
    }
    registrarError('almacenes','No se pudo eliminar almacén', m);
  }
}

// ---------- ADMIN: PRODUCTOS ----------
async function crearProducto(){
  const nombre = document.getElementById('nuevoProductoNombre').value.trim();
  const costo = Number(document.getElementById('nuevoProductoCosto').value)||0;
  const precio_venta = Number(document.getElementById('nuevoProductoPrecio').value)||0;
  const msgEl = document.getElementById('productoMsg');
  if(!nombre){ msgEl.textContent='Escribe un nombre.'; msgEl.className='msg err'; return; }

  const limpiarCampos = ()=>{
    document.getElementById('nuevoProductoNombre').value='';
    document.getElementById('nuevoProductoCosto').value='';
    document.getElementById('nuevoProductoPrecio').value='';
  };

  function guardarLocalYEncolar(){
    // Evitar encolar DOS veces el mismo producto (toques repetidos sin internet): si ya existe
    // local o ya está en la cola con ese nombre, no se agrega otra vez.
    const nom = nombre.trim().toLowerCase();
    const yaLocal = (PRODUCTOS||[]).some(x=>((x.nombre||'').trim().toLowerCase())===nom);
    const colaAdm = lsGet('adm_pending_ops', []);
    const yaEnCola = colaAdm.some(o=>o.tipo==='crear_producto' && (((o.payload&&o.payload.nombre)||'').trim().toLowerCase())===nom);
    if(yaLocal || yaEnCola){
      msgEl.textContent='Ese producto ya está (o ya quedó en cola para crearse). No se duplica.'; msgEl.className='msg';
      limpiarCampos(); return;
    }
    const tempId = -Date.now();
    PRODUCTOS.push({id:tempId, nombre, costo, precio_venta});
    lsSet('adm_cache_productos', PRODUCTOS);
    encolarOperacionAdmin('crear_producto', {nombre, costo, precio_venta, tempId});
    limpiarCampos();
    msgEl.textContent='Sin internet: guardado en el teléfono, se creará cuando vuelva la conexión.'; msgEl.className='msg ok';
    renderAdmin(); renderSelects();
  }

  if(!navigator.onLine){ guardarLocalYEncolar(); return; }

  try{
    // Evitar duplicados: si ya existe un producto con ese mismo nombre, avisar y no crear otro.
    const {data: existentes} = await sb.from('productos').select('id, nombre').ilike('nombre', nombre);
    if(existentes && existentes.length > 0){
      msgEl.textContent = `Ya existe un producto llamado "${nombre}". Usa ese o ponle un nombre distinto (por ejemplo, agrega la medida o la marca).`;
      msgEl.className='msg err';
      return;
    }
    const {error} = await sb.from('productos').insert({nombre, costo, precio_venta});
    if(error) throw error;
    limpiarCampos();
    msgEl.textContent='Producto creado.'; msgEl.className='msg ok';
    await cargarTodo();
  }catch(err){
    guardarLocalYEncolar();
  }
}

async function eliminarProducto(id){
  if(usuarioActual.rol !== 'dueno'){ alert('Solo el dueño puede eliminar productos.'); return; }
  if(!confirm('¿Eliminar este producto? Se perderá su historial e inventario.')) return;
  await escribirConReintento(()=> sb.from('productos').delete().eq('id', id));
  await cargarTodo();
}

// ---------- IMPORTAR / EXPORTAR CSV ----------
// Exporta a Excel (CSV) el inventario del PUESTO que esté seleccionado (su pestaña abierta arriba),
// con cantidad + costo + precio de venta + totales. Consulta paginada para que salga COMPLETO
// (sin el corte de 1000 filas). CSV abre directo en Excel.
async function exportarInventarioPuesto(){
  if(!usuarioActual || usuarioActual.rol !== 'dueno'){ alert('Solo el dueño puede exportar el inventario.'); return; }
  if(!navigator.onLine){ alert('Necesitas internet para exportar el inventario del puesto.'); return; }
  const a = ALMACENES.find(x=>x.id===almacenSeleccionado);
  if(!a){ alert('Primero elige un almacén tocando su pestaña arriba.'); return; }
  try{
    // Inventario del puesto (paginado = completo).
    const inv = {}; const PAGE=1000; let desde=0;
    for(;;){
      const r = await sb.from('inventario').select('producto_id, cantidad').eq('almacen_id', a.id).order('id',{ascending:true}).range(desde, desde+PAGE-1);
      if(r.error || !r.data) break;
      r.data.forEach(row=>{ inv[row.producto_id] = Number(row.cantidad||0); });
      if(r.data.length < PAGE) break;
      desde += PAGE;
    }
    const prodMap = {}; PRODUCTOS.forEach(p=>prodMap[p.id]=p);
    // Mismo orden que la lista de arriba: recorremos PRODUCTOS tal como los muestra la pantalla.
    const filas = [];
    PRODUCTOS.forEach(p=>{
      const cant = inv[p.id];
      if(cant == null || cant === 0) return;
      const costo = Number(p.costo||0), precio = Number(p.precio_venta||0);
      filas.push({ Producto: p.nombre, Cantidad: cant, Costo: costo, 'Precio venta': precio, 'Total al costo': cant*costo, 'Total a precio': cant*precio });
    });
    // Por si hay existencias de un producto que ya no está en la lista, lo agregamos al final.
    Object.keys(inv).forEach(pid=>{
      if(inv[pid] === 0 || prodMap[pid]) return;
      const cant = inv[pid];
      filas.push({ Producto: 'producto '+pid, Cantidad: cant, Costo: 0, 'Precio venta': 0, 'Total al costo': 0, 'Total a precio': 0 });
    });
    if(filas.length===0){ alert('Ese puesto no tiene existencias para exportar.'); return; }
    const totUds = filas.reduce((s,f)=>s+f.Cantidad,0);
    const totCosto = filas.reduce((s,f)=>s+f['Total al costo'],0);
    const totPrecio = filas.reduce((s,f)=>s+f['Total a precio'],0);
    filas.push({ Producto:'TOTAL', Cantidad: totUds, Costo:'', 'Precio venta':'', 'Total al costo': totCosto, 'Total a precio': totPrecio });
    const csv = '\uFEFF' + Papa.unparse(filas); // BOM para que Excel muestre bien los acentos
    const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
    const url = URL.createObjectURL(blob);
    const nombreArch = 'inventario_' + (a.nombre||'puesto').replace(/[^a-z0-9]+/gi,'_') + '_' + fechaHoyLocal() + '.csv';
    const el = document.createElement('a'); el.href=url; el.download=nombreArch;
    document.body.appendChild(el); el.click(); document.body.removeChild(el);
    URL.revokeObjectURL(url);
  }catch(e){ alert('No se pudo exportar: ' + (e.message||e)); }
}
async function previsualizarImportInv(){
  if(!usuarioActual || usuarioActual.rol !== 'dueno'){ alert('Solo el dueño puede cargar cambios.'); return; }
  if(!navigator.onLine){ alert('Necesitas internet para cargar cambios desde Excel.'); document.getElementById('importInvInput').value=''; return; }
  const a = ALMACENES.find(x=>x.id===almacenSeleccionado);
  const cont = document.getElementById('importInvBody');
  const input = document.getElementById('importInvInput');
  const file = input.files[0];
  input.value = ''; // permitir recargar el mismo archivo después
  if(!file) return;
  if(!a){ alert('Primero elige un puesto tocando su pestaña arriba.'); return; }
  cont.innerHTML = '<div class="msg">Leyendo archivo…</div>';
  Papa.parse(file, { header:true, skipEmptyLines:true, complete: async (res)=>{
    try{
      const norm = s => (s||'').toString().trim().toLowerCase().replace(/[^a-z0-9]/g,'');
      // Inventario actual del puesto (paginado) para comparar.
      const invActual = {}; const PAGE=1000; let desde=0;
      for(;;){
        const r = await sb.from('inventario').select('producto_id, cantidad').eq('almacen_id', a.id).order('id',{ascending:true}).range(desde, desde+PAGE-1);
        if(r.error || !r.data) break;
        r.data.forEach(row=>{ invActual[row.producto_id] = Number(row.cantidad||0); });
        if(r.data.length < PAGE) break; desde += PAGE;
      }
      const porNombre = {}; PRODUCTOS.forEach(p=>{ porNombre[norm(p.nombre)] = p; });
      const cambios = []; const noEncontrados = [];
      (res.data||[]).forEach(row=>{
        const obj = {}; for(const k in row) obj[norm(k)] = row[k];
        const nombreCsv = (obj['producto'] || obj['nombre'] || '').toString().trim();
        if(!nombreCsv || norm(nombreCsv)==='total') return;
        const p = porNombre[norm(nombreCsv)];
        if(!p){ noEncontrados.push(nombreCsv); return; }
        const val = v => (v!==undefined && v!==null && String(v).trim()!=='') ? Number(String(v).replace(/[^0-9.\-]/g,'')) : null;
        const nCant = val(obj['cantidad']);
        const nCosto = val(obj['costo']);
        const nPrecio = obj['precioventa']!==undefined ? val(obj['precioventa']) : val(obj['precio']);
        const actualCant = invActual[p.id] || 0;
        const c = { id:p.id, nombre:p.nombre }; let hay=false;
        if(nCant!==null && !isNaN(nCant) && nCant!==actualCant){ c.cant=[actualCant, nCant]; hay=true; }
        if(nCosto!==null && !isNaN(nCosto) && nCosto!==Number(p.costo)){ c.costo=[Number(p.costo), nCosto]; hay=true; }
        if(nPrecio!==null && !isNaN(nPrecio) && nPrecio!==Number(p.precio_venta)){ c.precio=[Number(p.precio_venta), nPrecio]; hay=true; }
        if(hay) cambios.push(c);
      });
      cambiosPendientesImport = { almacenId: a.id, cambios };

      if(cambios.length===0){
        cont.innerHTML = `<div class="msg ok">El archivo no trae ningún cambio para "${a.nombre}".</div>` +
          (noEncontrados.length?`<div class="msg" style="color:var(--muted)">${noEncontrados.length} nombre(s) del archivo no coinciden con ningún producto y se ignoran.</div>`:'');
        return;
      }
      const flecha = (ant,des,pre) => `<span style="color:var(--muted)">${pre||''}${num(ant)}</span> → <span style="color:var(--green); font-weight:700">${pre||''}${num(des)}</span>`;
      const tarjetas = cambios.map(c=>`
        <div style="border:1px solid var(--border); background:var(--panel2); border-radius:10px; padding:10px 12px; margin-bottom:8px">
          <div style="font-weight:700; margin-bottom:4px">${c.nombre}</div>
          ${c.cant?`<div style="font-size:14px">Cantidad: ${flecha(c.cant[0],c.cant[1])}</div>`:''}
          ${c.costo?`<div style="font-size:14px">Costo: ${flecha(c.costo[0],c.costo[1],'$')}</div>`:''}
          ${c.precio?`<div style="font-size:14px">Precio venta: ${flecha(c.precio[0],c.precio[1],'$')}</div>`:''}
        </div>`).join('');
      cont.innerHTML = `
        <div style="border:1px solid var(--accent); border-radius:12px; padding:14px">
          <div style="font-weight:800; margin-bottom:2px">Revisa los cambios antes de aplicar</div>
          <div style="color:var(--muted); font-size:13px; margin-bottom:10px">${cambios.length} cambio(s) en "${a.nombre}". Todavía NO se ha tocado nada.</div>
          ${tarjetas}
          ${noEncontrados.length?`<div style="color:var(--amber); font-size:13px; margin:6px 0">⚠️ ${noEncontrados.length} nombre(s) del archivo no coinciden con ningún producto y se ignoran: ${noEncontrados.slice(0,5).join(', ')}${noEncontrados.length>5?'…':''}</div>`:''}
          <div style="display:flex; gap:8px; margin-top:10px">
            <button class="primary" onclick="aplicarImportInv()">✅ Aplicar ${cambios.length} cambio(s)</button>
            <button class="ghost" onclick="cambiosPendientesImport=null; document.getElementById('importInvBody').innerHTML='';">Cancelar</button>
          </div>
        </div>`;
    }catch(e){ cont.innerHTML = `<div class="msg err">No se pudo leer el archivo: ${e.message||e}</div>`; }
  }, error: (err)=>{ cont.innerHTML = `<div class="msg err">No se pudo leer el archivo: ${err.message||err}</div>`; } });
}

async function aplicarImportInv(){
  if(!cambiosPendientesImport){ return; }
  const { almacenId, cambios } = cambiosPendientesImport;
  const cont = document.getElementById('importInvBody');
  cont.innerHTML = '<div class="msg">Aplicando cambios…</div>';
  let okCant=0, okPP=0, fall=0; const errores=[];
  for(const c of cambios){
    try{
      if(c.cant){
        const delta = c.cant[1] - c.cant[0];
        if(delta !== 0){
          const r = await ajustarInventario(almacenId, c.id, delta);
          const pay = { tipo: delta>0?'ingreso':'extraccion', producto_id:c.id, cantidad:Math.abs(delta), nota:'Ajuste por carga de Excel (recuento)', cant_antes:r.antes, cant_despues:r.despues };
          if(delta>0) pay.almacen_destino_id = almacenId; else pay.almacen_origen_id = almacenId;
          await insertarMovimiento(pay);
          okCant++;
        }
      }
      if(c.costo || c.precio){
        const upd = {};
        if(c.costo) upd.costo = c.costo[1];
        if(c.precio) upd.precio_venta = c.precio[1];
        const { error } = await sb.from('productos').update(upd).eq('id', c.id);
        if(error) throw error;
        okPP++;
      }
    }catch(e){ fall++; errores.push(`${c.nombre}: ${e.message||e}`); }
  }
  cambiosPendientesImport = null;
  try{ await cargarTodo(); }catch(e){}
  renderInventario();
  let msg = `Listo: ${okCant} cambio(s) de cantidad y ${okPP} de precio/costo aplicados.`;
  if(fall>0) msg += ` ${fall} no se pudieron: ${errores.slice(0,3).join(' | ')}`;
  document.getElementById('importInvBody').innerHTML = `<div class="msg ${fall?'err':'ok'}">${msg}</div>`;
}

function exportarProductosCSV(){
  if(usuarioActual.rol !== 'dueno'){ alert('Solo el dueño puede exportar/importar productos por Excel.'); return; }
  const filas = PRODUCTOS.map(p=>({nombre:p.nombre, costo:p.costo, precio_venta:p.precio_venta}));
  const csv = Papa.unparse(filas);
  const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'productos.csv';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function importarProductosCSV(){
  if(usuarioActual.rol !== 'dueno'){ alert('Solo el dueño puede exportar/importar productos por Excel.'); return; }
  const input = document.getElementById('importCsvInput');
  const msgEl = document.getElementById('importMsg');
  const file = input.files[0];
  if(!file){ msgEl.textContent='Selecciona un archivo CSV primero.'; msgEl.className='msg err'; return; }

  Papa.parse(file, {
    header: true,
    skipEmptyLines: true,
    complete: async (results) => {
      try{
        // Normaliza nombres de columna (admite mayúsculas, acentos, "precio venta", etc.)
        const norm = s => (s||'').toString().trim().toLowerCase().replace(/[^a-z0-9]/g,'');
        const filas = results.data.map(row=>{
          const obj = {};
          for(const key in row) obj[norm(key)] = row[key];
          const nombre = (obj['nombre'] || obj['producto'] || obj['articulo'] || '').toString().trim();
          const costo = parseFloat(obj['costo'] || obj['preciocosto'] || obj['preciodecosto'] || 0) || 0;
          const precio_venta = parseFloat(obj['precioventa'] || obj['preciodeventa'] || obj['precio'] || 0) || 0;
          return {nombre, costo, precio_venta};
        }).filter(r=>r.nombre);

        if(filas.length===0){ msgEl.textContent='No se encontraron filas válidas (revisa que la columna "nombre" exista).'; msgEl.className='msg err'; return; }

        // Si el CSV tiene el mismo nombre repetido en varias filas, Postgres no permite
        // actualizar la misma fila dos veces en un solo upsert. Nos quedamos con la última.
        const porNombre = new Map();
        for(const f of filas) porNombre.set(f.nombre.trim().toLowerCase(), f);
        const filasUnicas = Array.from(porNombre.values());
        const duplicados = filas.length - filasUnicas.length;

        // upsert: si el producto ya existe (mismo nombre) actualiza precios, si no lo crea
        const {error} = await sb.from('productos').upsert(filasUnicas, {onConflict:'nombre'});
        if(error) throw error;

        msgEl.textContent = `Se importaron/actualizaron ${filasUnicas.length} productos.` + (duplicados>0 ? ` (${duplicados} filas duplicadas por nombre, se usó la última de cada una)` : '');
        msgEl.className='msg ok';
        input.value = '';
        await cargarTodo();
      }catch(err){
        msgEl.textContent = 'Error al importar: ' + (err.message||err); msgEl.className='msg err';
        console.error(err);
      }
    },
    error: (err)=>{ msgEl.textContent='Error leyendo el archivo: '+err.message; msgEl.className='msg err'; }
  });
}

async function guardarPrecios(id){
  const costo = Number(document.getElementById('costo-'+id).value)||0;
  const precio_venta = Number(document.getElementById('precio-'+id).value)||0;
  const nombreInput = document.getElementById('nombre-'+id);
  const nombre = nombreInput ? nombreInput.value.trim() : '';
  const msgEl = document.getElementById('productoEditMsg');

  const productoActual = PRODUCTOS.find(p=>p.id===id);
  const costoAnterior = productoActual ? productoActual.costo : null;
  const precioAnterior = productoActual ? productoActual.precio_venta : null;
  const nombreAnterior = productoActual ? productoActual.nombre : '';

  // Validar el nombre: no puede quedar vacío ni chocar con otro producto (partiría el inventario)
  if(!nombre){
    msgEl.textContent = 'El nombre no puede quedar vacío.'; msgEl.className = 'msg err';
    if(nombreInput) nombreInput.value = nombreAnterior;
    return;
  }
  const nombreCambia = nombre !== nombreAnterior;
  if(nombreCambia && PRODUCTOS.some(x=>x.id!==id && (x.nombre||'').toLowerCase()===nombre.toLowerCase())){
    msgEl.textContent = 'Ya existe otro producto llamado "'+nombre+'". Ponle un nombre distinto.'; msgEl.className = 'msg err';
    return;
  }

  const payload = {producto_id:id, nombre, costo, precio_venta, costoAnterior, precioAnterior, nombreAnterior, usuario_nombre: usuarioActual.nombre};

  function guardarLocalYEncolar(){
    if(productoActual){ productoActual.costo = costo; productoActual.precio_venta = precio_venta; productoActual.nombre = nombre; lsSet('adm_cache_productos', PRODUCTOS); }
    encolarOperacionAdmin('editar_precios', payload);
    msgEl.textContent='Sin internet: el cambio se guardó y se aplicará cuando vuelva la conexión.'; msgEl.className='msg ok';
    renderAdmin();
  }

  if(!navigator.onLine){ guardarLocalYEncolar(); return; }

  try{
    // Guardamos nombre + precios y pedimos la fila de vuelta con .select() para COMPROBAR
    // que el cambio realmente entró (si por permisos no afectara ninguna fila, data vendría vacío).
    const {data, error} = await sb.from('productos').update({nombre, costo, precio_venta}).eq('id', id).select();
    if(error) throw error;
    if(!data || data.length===0){
      msgEl.textContent = 'El servidor no aplicó el cambio (sin permiso o el producto ya no existe). Nada se guardó.';
      msgEl.className = 'msg err';
      await cargarTodo();
      return;
    }

    // Verificamos que el servidor de verdad haya cambiado el NOMBRE (no solo costo/precio).
    // Si la base no lo permite (permisos/policy), avisamos claro en vez de que parezca que no pasó nada.
    if(nombreCambia && data && data[0] && String(data[0].nombre||'') !== nombre){
      msgEl.textContent = 'Se guardaron el costo y el precio, pero la base de datos NO dejó cambiar el nombre (es un permiso en Supabase). Avísame para darte el ajuste.';
      msgEl.className = 'msg err';
      await cargarTodo();
      return;
    }

    // Queda registrado para que el dueño vea quién cambió qué precio y cuándo
    if(costoAnterior !== costo || precioAnterior !== precio_venta){
      await sb.from('historial_precios').insert({
        producto_id: id, usuario_nombre: usuarioActual.nombre,
        costo_anterior: costoAnterior, costo_nuevo: costo,
        precio_anterior: precioAnterior, precio_nuevo: precio_venta
      });
    }

    msgEl.textContent = nombreCambia ? `Guardado. Ahora se llama "${nombre}" (su inventario, ventas e historial quedaron intactos).` : 'Precios actualizados.';
    msgEl.className='msg ok';
    await cargarTodo();
  }catch(err){
    if(!navigator.onLine){ guardarLocalYEncolar(); return; }
    // Con internet, un error es un rechazo del servidor (no es "offline"): mostramos el motivo real
    // en vez de un falso "sin internet" que además revertía el cambio.
    msgEl.textContent = 'El servidor no aceptó el cambio: ' + (err.message||err) + '. Si era el nombre, suele ser un permiso en la base — avísame.';
    msgEl.className = 'msg err';
    try{ await cargarTodo(); }catch(e){}
  }
}

async function cargarHistorialPrecios(){
  const body = document.getElementById('historialPreciosBody');
  const empty = document.getElementById('historialPreciosEmpty');
  if(!body) return;
  try{
    const {data, error} = await sb.from('historial_precios').select('*').order('creado_en', {ascending:false}).limit(1000);
    if(error) throw error;
    if(!data || data.length===0){ body.innerHTML=''; empty.style.display='block'; return; }
    empty.style.display='none';
    body.innerHTML = data.map(h=>{
      const p = PRODUCTOS.find(p=>p.id===h.producto_id);
      return `<tr>
        <td>${new Date(h.creado_en).toLocaleString()}</td>
        <td>${p?p.nombre:'(eliminado)'}</td>
        <td>${h.usuario_nombre||'—'}</td>
        <td class="numcell">${h.costo_anterior!==null?'$'+num(h.costo_anterior):'—'} → $${num(h.costo_nuevo)}</td>
        <td class="numcell">${h.precio_anterior!==null?'$'+num(h.precio_anterior):'—'} → $${num(h.precio_nuevo)}</td>
      </tr>`;
    }).join('');
  }catch(err){
    console.error(err);
    body.innerHTML=''; empty.textContent='No se pudo cargar el historial de precios.'; empty.style.display='block';
  }
}

// Cambia SOLO el nombre del producto. El inventario, las ventas, los movimientos y el
// historial se enlazan por el ID del producto (no por el nombre), así que renombrar
// NO afecta nada de eso: conserva todas sus existencias e historial.
async function renombrarProducto(id){
  const msgEl = document.getElementById('productoEditMsg');
  const p = PRODUCTOS.find(x=>x.id===id);
  if(!p) return;

  const nuevo = (prompt('Nuevo nombre para "' + p.nombre + '":\n\n(Solo cambia el nombre. Conserva su inventario, ventas e historial.)', p.nombre) || '').trim();
  if(!nuevo || nuevo === p.nombre) return;

  // Evitar dos productos con el mismo nombre (partiría el inventario en dos)
  const yaExiste = PRODUCTOS.some(x => x.id !== id && (x.nombre||'').toLowerCase() === nuevo.toLowerCase());
  if(yaExiste){
    msgEl.textContent = 'Ya existe otro producto llamado "' + nuevo + '". Ponle un nombre distinto.';
    msgEl.className = 'msg err';
    return;
  }

  if(!navigator.onLine){
    p.nombre = nuevo;                       // se ve el cambio de una vez
    lsSet('adm_cache_productos', PRODUCTOS);
    encolarOperacionAdmin('renombrar_producto', {producto_id:id, nombre:nuevo});
    msgEl.textContent = 'Sin internet: el nuevo nombre se guardó y se aplicará cuando vuelva la conexión.';
    msgEl.className = 'msg ok';
    renderAdmin();
    return;
  }

  try{
    const {error} = await sb.from('productos').update({nombre: nuevo}).eq('id', id);
    if(error) throw error;
    msgEl.textContent = 'Renombrado a "' + nuevo + '". Su inventario, ventas e historial quedaron intactos.';
    msgEl.className = 'msg ok';
    await cargarTodo();
  }catch(err){
    msgEl.textContent = 'No se pudo renombrar: ' + (err.message||err);
    msgEl.className = 'msg err';
  }
}

function renderAdmin(){
  const esDueno = usuarioActual.rol === 'dueno';
  document.getElementById('almacenesBody').innerHTML = ALMACENES.map(a=>
    `<tr><td>${String(a.nombre||'').replace(/</g,'&lt;')}${estaArchivado(a)?' <span class="badge extraccion">archivado</span>':''}</td>`
    +`<td>${esDueno
        ? (estaArchivado(a)
            ? `<button class="ghost" onclick="reactivarAlmacen(${a.id})">Volver a activar</button>`
            : `<button class="ghost" onclick="archivarAlmacen(${a.id})">📦 Archivar</button> `
              +`<button class="ghost" onclick="eliminarAlmacen(${a.id})">Eliminar</button>`)
        : ''}</td></tr>`
  ).join('') || '<tr><td class="empty" colspan="2">Sin almacenes</td></tr>';

  const filtro = (document.getElementById('filtroProductosAdmin').value || '').trim().toLowerCase();
  const productosFiltrados = filtro ? PRODUCTOS.filter(p=>coincideNombre(p.nombre, filtro)) : PRODUCTOS;

  document.getElementById('productosBody').innerHTML = productosFiltrados.map(p=>
    `<div style="border:1px solid var(--border); border-radius:12px; padding:12px; margin-bottom:10px; background:var(--panel2)">
       <input type="text" class="editNombre" id="nombre-${p.id}" value="${escAttr(p.nombre)}" style="width:100%; font-weight:600" placeholder="Nombre del producto">
       <div style="display:flex; gap:8px; margin-top:10px">
         <div class="field" style="flex:1; min-width:0; margin:0"><label style="font-size:11px; color:var(--muted)">Costo</label><input type="number" step="any" class="editPrice" id="costo-${p.id}" value="${p.costo}" style="width:100%"></div>
         <div class="field" style="flex:1; min-width:0; margin:0"><label style="font-size:11px; color:var(--muted)">Precio venta</label><input type="number" step="any" class="editPrice" id="precio-${p.id}" value="${p.precio_venta}" style="width:100%"></div>
       </div>
       <div style="display:flex; gap:8px; margin-top:10px">
         <button class="ghost" onclick="guardarPrecios(${p.id})">Guardar</button>
         ${esDueno?`<button class="ghost" onclick="eliminarProducto(${p.id})">Eliminar</button>`:''}
       </div>
     </div>`
  ).join('') || `<div class="empty">${filtro ? 'Ningún producto coincide con la búsqueda' : 'Sin productos'}</div>`;
}

// Detecta productos con nombres iguales o muy parecidos (para cazar duplicados que cruzan
// las comparaciones, ej. "CAJA 4X2" vs "CAJA 4X2 CRIOLLA"). NO borra nada — solo avisa.
function buscarProductosParecidos(){
  const cont = document.getElementById('dupProductosBody');
  // Usa la misma lectura "por como suena" que el buscador: así atrapa TUVO vs TUBO,
  // con o sin tildes, y los que solo se diferencian en un "DE" o un "LA" en el medio.
  const RELLENO = new Set(['de','del','la','el','los','las','un','una','y','con','para','por','a','en']);
  const palabrasDe = s => new Set(normNombre(s).split(' ').filter(w=>w && !RELLENO.has(w)));
  const mismasPalabras = (A,B) => A.size>0 && A.size===B.size && [...A].every(w=>B.has(w));
  const lista = (PRODUCTOS||[]).map(p=>({id:p.id, nombre:p.nombre, n:normNombre(p.nombre), w:palabrasDe(p.nombre)}));
  const grupos = [];
  const usados = new Set();
  for(let i=0;i<lista.length;i++){
    if(usados.has(lista[i].id)) continue;
    const grupo = [lista[i]];
    for(let j=i+1;j<lista.length;j++){
      if(usados.has(lista[j].id)) continue;
      const a=lista[i].n, b=lista[j].n;
      // Parecidos: iguales al oído, uno contiene al otro, o llevan las mismas palabras
      const igual = a===b;
      const contiene = a.length>=4 && b.length>=4 && (a.includes(b) || b.includes(a));
      const sinEspacios = a.replace(/ /g,'')===b.replace(/ /g,'');
      const mismasW = mismasPalabras(lista[i].w, lista[j].w);
      if(igual || contiene || sinEspacios || mismasW){ grupo.push(lista[j]); usados.add(lista[j].id); }
    }
    if(grupo.length>1){ usados.add(lista[i].id); grupos.push(grupo); }
  }
  if(!grupos.length){ cont.innerHTML='<div class="empty">No encontré nombres repetidos ni muy parecidos. 👍</div>'; return; }
  const stockDe = pid => (INVENTARIO||[]).filter(i=>i.producto_id===pid).reduce((s,i)=>s+Number(i.cantidad||0),0);
  cont.innerHTML = `<div style="border:2px solid var(--amber); border-radius:12px; padding:12px">
    <div style="font-weight:800; margin-bottom:8px">⚠️ ${grupos.length} grupo(s) de nombres parecidos</div>
    <div style="color:var(--muted); font-size:12px; margin-bottom:10px">Si dos filas son en realidad el MISMO producto, conviene dejar solo una y borrar la otra (o ponerles nombres bien distintos). Fíjate cuál tiene el stock/movimientos.</div>
    ${grupos.map(g=>`<div style="border-top:1px solid var(--border); padding-top:8px; margin-top:8px">
      ${g.map(x=>`<div style="display:flex; justify-content:space-between; gap:8px; padding:4px 0"><span>${x.nombre}</span><span style="color:var(--muted); font-size:13px; flex:none">stock: ${num(stockDe(x.id))}</span></div>`).join('')}
    </div>`).join('')}
  </div>`;
}

// ============================================================
// PEDIDOS
// ============================================================
async function cargarPedidos(){
  const cont = document.getElementById('pedidosBody');
  const empty = document.getElementById('pedidosEmpty');
  let data;
  if(!navigator.onLine){
    data = lsGet('adm_cache_pedidos', []);
  } else {
    try{
      const res = await sb.from('pedidos').select('*').eq('estado','pendiente').order('creado_en', {ascending:true});
      if(res.error) throw res.error;
      data = res.data || [];
      lsSet('adm_cache_pedidos', data);
    }catch(err){ console.error(err); data = lsGet('adm_cache_pedidos', []); }
  }
  if(!data || data.length===0){ cont.innerHTML=''; empty.style.display='block'; return; }
  empty.style.display='none';
  cont.innerHTML = data.map(ped=>{
    const p = PRODUCTOS.find(p=>p.id===ped.producto_id);
    const alm = ALMACENES.find(a=>a.id===ped.almacen_id);
    const opcionesOrigen = almacenesVisibles().filter(a=>a.id!==ped.almacen_id).map(a=>`<option value="${a.id}">${a.nombre}</option>`).join('');
    return `<div class="row" style="border-bottom:1px solid var(--border); padding:12px 0; align-items:center">
      <div class="field" style="flex:2">
        <strong>${p?p.nombre:'—'}</strong> pidió ${num(ped.cantidad)} uds. → <em>${alm?alm.nombre:'—'}</em>
        ${ped.nota?`<div style="color:var(--muted);font-size:12px">${ped.nota}</div>`:''}
      </div>
      <div class="field" style="max-width:110px">
        <label>Cant. a entregar</label>
        <input type="number" id="cantPedido-${ped.id}" value="${ped.cantidad}" min="0" step="any">
      </div>
      <div class="field" style="max-width:200px">
        <label>Trasladar desde</label>
        <select id="origenPedido-${ped.id}"><option value="">— elegir almacén —</option>${opcionesOrigen}</select>
      </div>
      <button class="primary" onclick="resolverPedido(${ped.id}, ${ped.producto_id}, ${ped.almacen_id}, 'agregar')">Agregar directo</button>
      <button class="ghost" onclick="resolverPedido(${ped.id}, ${ped.producto_id}, ${ped.almacen_id}, 'trasladar')">Trasladar</button>
      <button class="ghost" onclick="cancelarPedido(${ped.id})">Cancelar</button>
    </div>`;
  }).join('');
}

async function resolverPedido(pedidoId, productoId, destinoId, modo){
  const cantidad = Number(document.getElementById('cantPedido-'+pedidoId).value);
  if(!cantidad || cantidad<=0){ alert('Ingresa una cantidad válida a entregar.'); return; }
  // Cada pedido lleva su propia clave: la mercancía se mueve UNA sola vez aunque el botón se
  // toque dos veces o se corte la conexión. Antes, si la mercancía se movía y el "resuelto"
  // no llegaba a guardarse, el pedido seguía pendiente y al resolverlo de nuevo se movía doble.
  const clavePed = 'ped-' + pedidoId;
  try{
    if(modo==='agregar'){
      await aplicarLineaMovimiento({clave_local:clavePed, tipo:'ingreso', origen_id:Number(destinoId),
        producto_id:productoId, cantidad, nota:'Pedido resuelto (ingreso directo)'});
    } else {
      const origenSel = document.getElementById('origenPedido-'+pedidoId);
      const origenId = Number(origenSel.value);
      if(!origenId){ alert('Selecciona desde qué almacén trasladar.'); return; }
      const yaMovido = claveMovYaAplicada(clavePed) || await movimientoYaRegistrado(clavePed);
      if(!yaMovido) await verificarStock(origenId, productoId, cantidad);
      await aplicarLineaMovimiento({clave_local:clavePed, tipo:'traslado', origen_id:origenId, destino_id:Number(destinoId),
        producto_id:productoId, cantidad, nota:'Pedido resuelto (traslado)'});
    }
    await escribirConReintento(()=> sb.from('pedidos').update({estado:'resuelto', resuelto_en:new Date().toISOString()}).eq('id', pedidoId));
    await cargarTodo();
    await cargarPedidos();
  }catch(err){
    const yaMovido = claveMovYaAplicada(clavePed);
    alert('Error: ' + (err.message||err) + (yaMovido ? '\n\nLa mercancía YA se movió; solo faltó marcar el pedido como resuelto. Vuelve a tocar el botón cuando haya señal: no se moverá dos veces.' : ''));
  }
}

async function cancelarPedido(id){
  if(!confirm('¿Cancelar este pedido?')) return;
  await escribirConReintento(()=> sb.from('pedidos').update({estado:'cancelado'}).eq('id', id));
  await cargarPedidos();
}

// ─────────────────────────────────────────────────────────────────────────────
// TOTALES DE CAJA — SE CUENTA TODO, NO SOLO LO QUE SE VE
// La tabla de abajo se carga por tandas de 200 para que el teléfono no se trabe.
// El RESUMEN de arriba NO puede calcularse con esa tanda: si solo se suman los
// últimos 200 movimientos, al registrar uno nuevo el más viejo se sale de la
// cuenta y el total salta un número que no tiene nada que ver. (Fue lo que pasó:
// marcaba -77065, se metieron 77065 para dejarlo en 0, y mostró -6048, que era
// justo el ingreso que se cayó de la ventana.)
// Esto recorre la tabla COMPLETA, de mil en mil, y suma todo.
// ── ESCRITURAS QUE NO SE PUEDEN IGNORAR ─────────────────────────────────────
// Supabase NO lanza error cuando una escritura falla: lo DEVUELVE en el resultado. Si nadie
// lo mira, la app sigue como si hubiera guardado. Con internet malo eso pasaba a cada rato:
// "se cerró el día" sin cerrarse, "se pagó" sin registrarse el dinero, etc.
//   exigir(...)              → si la escritura falló, lanza el error (para inserts).
//   escribirConReintento(..) → reintenta hasta 3 veces y, si no pudo, lanza. SOLO para
//                              escrituras que se pueden repetir sin daño (update/delete por id).
function exigir(r){
  if(r && r.error){
    const e = r.error;
    throw (e instanceof Error) ? e : new Error(e.message || e.details || String(e));
  }
  return r;
}
async function escribirConReintento(hacer, intentos){
  const veces = intentos || 3;
  let ultimo = null;
  for(let n=1; n<=veces; n++){
    try{
      const r = await hacer();
      if(!r || !r.error) return r;
      ultimo = r.error;
    }catch(e){ ultimo = e; }
    if(n < veces) await new Promise(res=>setTimeout(res, 400*n));
  }
  throw (ultimo instanceof Error) ? ultimo : new Error((ultimo && (ultimo.message||ultimo.details)) || 'No se pudo guardar');
}

// Trae TODAS las filas de una consulta. La base devuelve como máximo 1000 por tanda;
// si no se pagina, los totales salen cortos sin avisar de nada. Siempre que haya que
// SUMAR algo (dinero, ventas, deudas), se trae con esto.
async function traerTodasLasFilas(hazQuery, porTanda){
  const PAGE = porTanda || 1000;
  const todo = [];
  for(let desde=0;;desde+=PAGE){
    let data, error;
    try{ const r = await hazQuery().range(desde, desde+PAGE-1); data=r.data; error=r.error; }
    catch(e){ error=e; }
    if(error) throw error;
    if(!data) break;
    todo.push(...data);
    if(data.length < PAGE) break;
  }
  return todo;
}
async function calcularTotalesCaja(){
  if(!navigator.onLine || typeof sb==='undefined' || !sb){
    TOTALES_CAJA = lsGet('adm_cache_totales_caja', null);
    return TOTALES_CAJA;
  }
  try{
    let efectivo=0, tarjeta=0, sobrantes=0, n=0;
    for(let desde=0;;desde+=1000){
      const {data, error} = await sb.from('caja_movimientos')
        .select('tipo, metodo, monto, categoria, concepto')
        .order('id',{ascending:true}).range(desde, desde+999);
      if(error) throw error;
      const lote = data||[];
      for(const m of lote){
        const signo = (m.tipo==='ingreso') ? 1 : -1;
        const monto = signo*Number(m.monto||0);
        if(m.metodo==='efectivo') efectivo += monto; else tarjeta += monto;
        if(m.categoria==='sobrante' || String(m.concepto||'').startsWith('SOBRANTE')) sobrantes += monto;
        n++;
      }
      if(lote.length < 1000) break;
    }
    TOTALES_CAJA = {efectivo:Math.round(efectivo*100)/100, tarjeta:Math.round(tarjeta*100)/100,
                    sobrantes:Math.round(sobrantes*100)/100, n, completo:true, ts:Date.now()};
    lsSet('adm_cache_totales_caja', TOTALES_CAJA);
  }catch(e){
    console.error('No se pudieron calcular los totales de caja:', e);
    TOTALES_CAJA = lsGet('adm_cache_totales_caja', null);   // lo último bueno que se supo
  }
  return TOTALES_CAJA;
}

async function cargarDinero(){
  cajaHayMas = true;
  if(!navigator.onLine){
    CAJA_MOVS = lsGet('adm_cache_caja', []);
    cajaHayMas = false; // sin internet solo tenemos lo guardado en el teléfono
  } else {
    try{
      const {data, error} = await sb.from('caja_movimientos').select('*').order('creado_en', {ascending:false}).limit(CAJA_POR_TANDA);
      if(error) throw error;
      CAJA_MOVS = data || [];
      if(CAJA_MOVS.length < CAJA_POR_TANDA) cajaHayMas = false;
      lsSet('adm_cache_caja', CAJA_MOVS);
    }catch(err){ console.error(err); CAJA_MOVS = lsGet('adm_cache_caja', []); cajaHayMas = false; }
  }
  await calcularTotalesCaja();   // los totales se cuentan sobre TODA la tabla, no sobre la tanda
  try{ fijarTipoCaja(document.getElementById('cajaTipo').value || 'egreso'); }catch(e){}
  renderResumenCaja();
  renderTablaCaja();
  await cargarDeudas();

  // Preparar la sección de comisión del administrador
  if(navigator.onLine){
    try{
      const {data: usuariosData, error} = await sb.from('usuarios').select('*').eq('rol','administrador').eq('activo', true);
      if(error) throw error;
      ADMINISTRADORES_CACHE = usuariosData || [];
      lsSet('adm_cache_administradores', ADMINISTRADORES_CACHE);
    }catch(err){ console.error(err); ADMINISTRADORES_CACHE = lsGet('adm_cache_administradores', []); }
  } else {
    ADMINISTRADORES_CACHE = lsGet('adm_cache_administradores', []);
  }
  const selAdmin = document.getElementById('comisionAdminUsuario');
  if(selAdmin){
    selAdmin.innerHTML = ADMINISTRADORES_CACHE.map(u=>`<option value="${u.id}">${u.nombre}</option>`).join('') || '<option value="">— sin administradores —</option>';
  }
  const fechaInput = document.getElementById('comisionAdminFecha');
  if(fechaInput && !fechaInput.value) fechaInput.value = fechaHoyLocal();
}

function renderResumenCaja(){
  // Los totales SIEMPRE salen de la tabla completa (TOTALES_CAJA). Solo si todavía no
  // se pudieron traer se usa lo cargado, y entonces se avisa que es parcial.
  const T = TOTALES_CAJA;
  let efectivo, tarjeta, parcial = false;
  if(T && T.completo){
    efectivo = T.efectivo; tarjeta = T.tarjeta;
  } else {
    efectivo = 0; tarjeta = 0; parcial = true;
    for(const m of CAJA_MOVS){
      const signo = m.tipo==='ingreso' ? 1 : -1;
      if(m.metodo==='efectivo') efectivo += signo*Number(m.monto);
      else tarjeta += signo*Number(m.monto);
    }
  }
  document.getElementById('totalEfectivo').textContent = '$' + num(efectivo);
  document.getElementById('totalTarjeta').textContent = '$' + num(tarjeta);
  document.getElementById('totalGeneral').textContent = '$' + num(efectivo+tarjeta);
  const avi = document.getElementById('cajaAvisoParcial');
  if(avi){
    avi.style.display = parcial ? 'block' : 'none';
    avi.textContent = parcial ? '⚠️ Estos totales son solo de los movimientos cargados en el teléfono, no del total real. Conéctate para ver el dinero exacto.' : '';
  }

  // Fondo de sobrantes: dinero de más que fueron entregando los vendedores. Sirve para
  // cubrir el valor de un artículo que falte en el almacén.
  let fondoSobrantes = 0;
  if(T && T.completo){
    fondoSobrantes = T.sobrantes;      // contado sobre la tabla completa
  } else {
    for(const m of CAJA_MOVS){
      // Cuenta la categoría propia y también los guardados por la vía de respaldo
      // (cuando la base vieja rechazaba la categoría, iban como 'otro' con concepto SOBRANTE)
      const esSobrante = m.categoria === 'sobrante' || (m.concepto||'').startsWith('SOBRANTE');
      if(esSobrante){
        fondoSobrantes += (m.tipo==='ingreso' ? 1 : -1) * Number(m.monto);
      }
    }
  }
  const elSobrantes = document.getElementById('totalSobrantes');
  if(elSobrantes) elSobrantes.textContent = '$' + num(fondoSobrantes);

  // Valor del inventario a costo, en TODOS los almacenes (solo lo ve el dueño)
  if(usuarioActual.rol === 'dueno'){
    const valorInventario = (INVENTARIO||[]).filter(i=>!esAlmacenMayoreoId(i.almacen_id)).reduce((s,i)=>{
      const p = PRODUCTOS.find(p=>p.id===i.producto_id);
      return s + (p ? Number(i.cantidad)*Number(p.costo) : 0);
    }, 0);
    const elValor = document.getElementById('totalValorInventario');
    const elPatrimonio = document.getElementById('totalPatrimonio');
    if(elValor){ elValor.textContent = '$' + num(valorInventario); }
    if(elPatrimonio){ elPatrimonio.textContent = '$' + num(efectivo + tarjeta + valorInventario); }
  }
}

async function cargarMasDinero(){
  if(cajaCargando || !cajaHayMas || !navigator.onLine) return;
  cajaCargando = true;
  const btn = document.getElementById('btnMasCaja');
  if(btn){ btn.disabled = true; btn.textContent = 'Cargando…'; }
  try{
    const masViejo = CAJA_MOVS[CAJA_MOVS.length-1];
    let q = sb.from('caja_movimientos').select('*');
    if(masViejo) q = q.lt('creado_en', masViejo.creado_en);
    const {data, error} = await q.order('creado_en', {ascending:false}).limit(CAJA_POR_TANDA);
    if(error) throw error;
    const nuevos = data || [];
    if(nuevos.length < CAJA_POR_TANDA) cajaHayMas = false;
    const yaTengo = new Set(CAJA_MOVS.map(m=>m.id));
    for(const m of nuevos){ if(!yaTengo.has(m.id)) CAJA_MOVS.push(m); }
    mostrarTodasCaja = true; // si pidió más, es porque quiere verlas
  }catch(err){ console.error('No se pudo cargar más dinero:', err); }
  finally{ cajaCargando = false; }
  renderResumenCaja();
  renderTablaCaja();
}

function renderTablaCaja(){
  const body = document.getElementById('cajaBody');
  const empty = document.getElementById('cajaEmpty');
  const verTodasBtn = document.getElementById('cajaVerTodasBtn');
  if(CAJA_MOVS.length===0){ body.innerHTML=''; empty.style.display='block'; verTodasBtn.style.display='none'; document.getElementById('cajaContadorPill').textContent=''; return; }
  empty.style.display='none';
  document.getElementById('cajaContadorPill').textContent = `${CAJA_MOVS.length} movimiento(s)`;

  // Cuánto había en caja (de ese método) justo ANTES de cada movimiento.
  // Se va HACIA ATRÁS desde el saldo real de hoy. Antes se empezaba en cero en el
  // movimiento más viejo CARGADO, y como solo se cargan 200, la columna mentía.
  const T = TOTALES_CAJA;
  let saldoEfectivo = (T && T.completo) ? T.efectivo : 0;
  let saldoTarjeta  = (T && T.completo) ? T.tarjeta  : 0;
  const saldoAntesPorId = {};
  for(const m of CAJA_MOVS){            // viene del más reciente al más antiguo
    const efecto = (m.tipo==='ingreso' ? Number(m.monto) : -Number(m.monto));
    if(m.metodo === 'efectivo'){ saldoEfectivo -= efecto; saldoAntesPorId[m.id] = saldoEfectivo; }
    else { saldoTarjeta -= efecto; saldoAntesPorId[m.id] = saldoTarjeta; }
  }

  const aMostrar = mostrarTodasCaja ? CAJA_MOVS : CAJA_MOVS.slice(0,6);
  verTodasBtn.style.display = CAJA_MOVS.length > 6 ? 'inline-block' : 'none';
  verTodasBtn.textContent = mostrarTodasCaja ? 'Ver solo las últimas 6' : `Ver todas (${CAJA_MOVS.length})`;

  const esDueno = !!(usuarioActual && usuarioActual.rol==='dueno');
  body.innerHTML = aMostrar.map(m=>`<tr>
    <td>${new Date(m.creado_en).toLocaleString()}</td>
    <td><span class="badge ${m.tipo==='ingreso'?'ingreso':'extraccion'}">${m.tipo}</span></td>
    <td>${m.metodo}</td>
    <td>${m.categoria}</td>
    <td class="numcell" style="color:${m.tipo==='ingreso'?'var(--green)':'var(--red)'}; font-weight:800">${m.tipo==='ingreso'?'+':'−'}$${num(m.monto)}</td>
    <td class="numcell" style="color:var(--muted)">$${num(saldoAntesPorId[m.id])}</td>
    <td>${(m.concepto||'').replace(/</g,'&lt;')}</td>
    <td>${esDueno ? `<button class="ghost" style="padding:5px 10px;font-size:13px;white-space:nowrap" onclick="borrarMovimientoCaja(${m.id})">🗑</button>` : ''}</td>
  </tr>`).join('');

  const pie = document.getElementById('cajaPie');
  if(pie){
    pie.innerHTML = (mostrarTodasCaja && cajaHayMas)
      ? `<div style="margin-top:10px"><button class="ghost" id="btnMasCaja" onclick="cargarMasDinero()">Ver más antiguos</button>
         <span style="color:var(--muted); font-size:12px; margin-left:8px">${CAJA_MOVS.length} movimiento(s) cargados</span></div>`
      : (mostrarTodasCaja ? `<div style="margin-top:10px; color:var(--muted); font-size:12px">${CAJA_MOVS.length} movimiento(s) — este es todo el historial de dinero</div>` : '');
  }
}

// Borra un movimiento de dinero. SOLO el dueño. Sirve para quitar una prueba, un
// ingreso escrito dos veces o un error. Pide confirmación con el monto a la vista.
async function borrarMovimientoCaja(id){
  if(!usuarioActual || usuarioActual.rol!=='dueno'){ alert('Solo el dueño puede borrar movimientos de dinero.'); return; }
  if(!navigator.onLine){ alert('Necesitas internet para borrar un movimiento.'); return; }
  const m = (CAJA_MOVS||[]).find(x=>x.id===id);
  if(!m){ alert('No encontré ese movimiento. Vuelve a abrir la pantalla.'); return; }
  const signo = m.tipo==='ingreso' ? '-' : '+';
  const quedaEn = (TOTALES_CAJA && TOTALES_CAJA.completo)
      ? ((m.metodo==='efectivo'?TOTALES_CAJA.efectivo:TOTALES_CAJA.tarjeta) - (m.tipo==='ingreso'?Number(m.monto):-Number(m.monto)))
      : null;
  const aviso = '¿Borrar este movimiento?\n\n'
      + m.tipo.toUpperCase()+' · '+m.metodo+' · '+(m.categoria||'')+'\n'
      + '$'+num(m.monto)+'\n'
      + (m.concepto ? m.concepto+'\n' : '')
      + new Date(m.creado_en).toLocaleString()+'\n\n'
      + 'El '+m.metodo+' en caja va a cambiar '+signo+'$'+num(m.monto)
      + (quedaEn!==null ? (' y queda en $'+num(quedaEn)) : '') + '.\n\n'
      + 'Esto no se puede deshacer.';
  if(!confirm(aviso)) return;
  try{
    const {error} = await sb.from('caja_movimientos').delete().eq('id', id);
    if(error) throw error;
    const msg = document.getElementById('cajaMsg');
    if(msg){ msg.textContent = 'Movimiento borrado. ✓'; msg.className='msg ok'; }
    await cargarDinero();          // recalcula los totales sobre TODA la tabla
  }catch(e){
    alert('No se pudo borrar: '+((e&&e.message)||e));
  }
}

function toggleVerTodasCaja(){
  mostrarTodasCaja = !mostrarTodasCaja;
  renderTablaCaja();
}

// Calcula cuánto dinero hay realmente registrado en un método (efectivo o tarjeta).
// Sirve para nunca dejar pagar/sacar más de lo que de verdad ha entrado (de ventas o depósitos).
async function obtenerSaldoMetodo(metodo){
  // OJO: sin paginar, la base devuelve como máximo 1000 filas y el saldo sale corto.
  // Con el saldo corto la app puede bloquear una devolución buena, o dejar pasar una mala.
  let total = 0;
  for(let desde=0;;desde+=1000){
    const {data, error} = await sb.from('caja_movimientos').select('tipo, monto')
      .eq('metodo', metodo).order('id',{ascending:true}).range(desde, desde+999);
    if(error) throw error;
    const lote = data||[];
    for(const m of lote) total += (m.tipo==='ingreso' ? Number(m.monto) : -Number(m.monto));
    if(lote.length < 1000) break;
  }
  return Math.round(total*100)/100;
}

// Misma idea pero usando lo último guardado en el teléfono — para revisar sin conexión
// (no es 100% exacto si hay operaciones pendientes sin sincronizar, pero da una idea real).
function obtenerSaldoMetodoLocal(metodo){
  // Primero lo último COMPLETO que se supo (contado sobre toda la tabla).
  const T = TOTALES_CAJA || lsGet('adm_cache_totales_caja', null);
  if(T && T.completo) return (metodo==='efectivo') ? Number(T.efectivo||0) : Number(T.tarjeta||0);
  // Si nunca se pudo contar completo, lo guardado en el teléfono (son solo los últimos, avisa la pantalla).
  const movs = lsGet('adm_cache_caja', []);
  return movs.filter(m=>m.metodo===metodo).reduce((s,m)=> s + (m.tipo==='ingreso' ? Number(m.monto) : -Number(m.monto)), 0);
}

// ============================================================
// MOTOR DE SINCRONIZACIÓN DEL ADMINISTRADOR/DUEÑO (trabajar sin internet)
// ============================================================
// Cubre: crear productos, editar precios, movimientos (lista), dinero (caja) y deudas
// (dinero y préstamos de artículo). Crear/eliminar almacenes y usuarios requieren internet.
function encolarOperacionAdmin(tipo, payload){
  const cola = lsGet('adm_pending_ops', []);
  cola.push({id: 'op-'+Date.now()+'-'+Math.random().toString(36).slice(2,8), tipo, payload, creado_en: new Date().toISOString()});
  lsSet('adm_pending_ops', cola);
  actualizarConexionAdminUI();
}

function actualizarConexionAdminUI(){
  if(!usuarioActual || usuarioActual.rol==='vendedor') return;
  const cola = lsGet('adm_pending_ops', []);
  const pendientes = cola.length;
  const pill = document.getElementById('connPill');
  if(pill){
    if(navigator.onLine){
      pill.textContent = pendientes>0 ? `🟡 En línea · sincronizando ${pendientes}` : '🟢 En línea';
      pill.style.color = pendientes>0 ? 'var(--amber)' : 'var(--green)';
    } else {
      pill.textContent = pendientes>0 ? `🔴 Sin conexión · ${pendientes} por sincronizar` : '🔴 Sin conexión';
      pill.style.color = 'var(--red)';
    }
  }

  pintarPillPendientes();   // el numerito cuenta TODO lo pendiente, no solo esta cola

  const debugBar = document.getElementById('syncDebugBarAdmin');
  const debugMsg = document.getElementById('syncDebugMsgAdmin');
  const conError = cola.filter(op=>op._ultimoError);
  if(debugBar){
    if(navigator.onLine && conError.length>0){
      debugBar.style.display = 'block';
      debugMsg.textContent = `⚠️ ${conError.length} operación(es) no se han podido sincronizar. Último error: "${conError[0]._ultimoError}"`;
    } else {
      debugBar.style.display = 'none';
    }
  }
}
async function sincronizarPendientesAdmin(){
  if(sincronizandoAdmin || !navigator.onLine) { actualizarConexionAdminUI(); return; }
  sincronizandoAdmin = true;
  try{
    const cola = lsGet('adm_pending_ops', []);
    if(cola.length===0){ actualizarConexionAdminUI(); return; }
    const algoSincronizo = await drenarCola('adm_pending_ops', async op => { await procesarOperacionAdmin(op, cola); });
    if(algoSincronizo && usuarioActual && usuarioActual.rol!=='vendedor'){
      await cargarTodo();
    }
  } finally {
    sincronizandoAdmin = false;
    actualizarConexionAdminUI();
  }
}

// Si una operación creó un producto con id temporal (negativo), las operaciones siguientes
// en la cola que lo referencian deben actualizarse con el id real antes de procesarse.
function reemplazarIdTemporalEnCola(cola, tempId, idReal){
  for(const op of cola){
    if(op.payload && op.payload.producto_id === tempId) op.payload.producto_id = idReal;
    if(op.payload && Array.isArray(op.payload.items)){
      op.payload.items.forEach(it=>{ if(it.producto_id===tempId) it.producto_id = idReal; });
    }
  }
}

async function procesarOperacionAdmin(op, colaCompleta){
  const p = op.payload;
  if(op.tipo === 'crear_producto'){
    const {data, error} = await sb.from('productos').insert({nombre:p.nombre, costo:p.costo, precio_venta:p.precio_venta}).select().single();
    if(error){
      // Si ya existe un producto con ese nombre, NO es un fallo: el objetivo (que exista) ya se
      // cumplió. Buscamos su id real, arreglamos la cola y damos la operación por HECHA
      // (así se saca de pendientes y no se queda reintentando para siempre).
      if(/duplicate|unique|already exists|23505/i.test(error.message||error.code||'')){
        try{
          const {data:ya} = await sb.from('productos').select('id').ilike('nombre', p.nombre).limit(1);
          if(ya && ya[0] && p.tempId) reemplazarIdTemporalEnCola(colaCompleta, p.tempId, ya[0].id);
        }catch(_){}
        // no se lanza error: la operación se considera resuelta.
      } else {
        throw error;
      }
    } else {
      if(p.tempId) reemplazarIdTemporalEnCola(colaCompleta, p.tempId, data.id);
    }

  } else if(op.tipo === 'renombrar_producto'){
    await escribirConReintento(()=> sb.from('productos').update({nombre: p.nombre}).eq('id', p.producto_id));

  } else if(op.tipo === 'compra'){
    // TRES pasos, cada uno repetible sin daño. Antes el costo y el pago iban DENTRO del
    // candado de la mercancía: si la mercancía entraba y el pago fallaba, al reintentar se
    // saltaba todo y el pago de la compra se perdía para siempre.
    const notaMovC = 'Compra' + (p.nota ? ' — ' + p.nota : '') + ' (a $' + num(p.costo_compra) + ' c/u)';
    const conceptoC = 'Compra de ' + (p.nombre||'producto') + ' x' + num(p.cantidad);
    const pagoC = (p.pagar_de_caja && Number(p.total) > 0) ? Number(p.total) : 0;
    // VÍA DEL SERVIDOR (todo o nada). Solo si este teléfono no había empezado ya la compra
    // por pasos; si responde 'ya_estaba' se repasan igual los pasos, que no repiten nada.
    if(p.clave_local && !claveMovYaAplicada(p.clave_local)){
      const rS = await rpcSegura('comprar_atomico', {
        p_clave: p.clave_local, p_almacen: p.almacen_id, p_producto: p.producto_id, p_cantidad: Number(p.cantidad),
        p_nota: notaMovC, p_nuevo_costo: p.nuevo_costo, p_pago: pagoC, p_concepto: conceptoC
      });
      if(rS.estado === 'ok' && rS.data !== 'ya_estaba'){ marcarClaveMovAplicada(p.clave_local); return; }
    }
    // 1) La mercancía entra UNA vez (clave única, con vuelta atrás si queda a medias).
    await aplicarLineaMovimiento({
      clave_local: p.clave_local, tipo:'ingreso', origen_id: p.almacen_id,
      producto_id: p.producto_id, cantidad: Number(p.cantidad),
      nota: notaMovC
    });
    // 2) El costo nuevo (es un valor fijo: ponerlo dos veces no cambia nada).
    await escribirConReintento(()=> sb.from('productos').update({costo: p.nuevo_costo}).eq('id', p.producto_id));
    // 3) El pago sale de caja UNA vez (clave única).
    if(pagoC > 0){
      const filaPago = {tipo:'egreso', metodo:'efectivo', monto:pagoC, concepto:conceptoC};
      // La clave del pago va atada a la COMPRA (la misma que usa el servidor), así no sale
      // doble aunque una parte la haya hecho el servidor y otra el teléfono.
      const clavePagoC = p.clave_local ? ('compra-' + p.clave_local) : ('opcaja-' + op.id);
      // Pendientes de la versión anterior pudieron haberlo guardado ya con la clave vieja.
      let yaConClaveVieja = false;
      { const v = await sb.from('caja_movimientos').select('id').eq('clave_caja', 'opcaja-'+op.id).limit(1);
        if(!v.error && v.data && v.data.length) yaConClaveVieja = true; }
      if(!yaConClaveVieja){
        try{
          await meterMovimientoCajaUnico(Object.assign({categoria:'compra'}, filaPago), clavePagoC);
        }catch(eCat){
          // la base vieja no admite la categoría 'compra': se guarda como pago de mercancía
          await meterMovimientoCajaUnico(Object.assign({categoria:'pago_mercancia'}, filaPago), clavePagoC);
        }
      }
    }

  } else if(op.tipo === 'editar_precios'){
    // Puede incluir también el nombre (edición unificada del producto). Solo mandamos los
    // campos presentes para no pisar el nombre si un pendiente viejo no lo trae.
    const cambios = {costo:p.costo, precio_venta:p.precio_venta};
    if(p.nombre) cambios.nombre = p.nombre;
    await escribirConReintento(()=> sb.from('productos').update(cambios).eq('id', p.producto_id));
    if(p.costoAnterior !== p.costo || p.precioAnterior !== p.precio_venta){
      await sb.from('historial_precios').insert({
        producto_id: p.producto_id, usuario_nombre: p.usuario_nombre,
        costo_anterior: p.costoAnterior, costo_nuevo: p.costo,
        precio_anterior: p.precioAnterior, precio_nuevo: p.precio_venta
      });
    }

  } else if(op.tipo === 'movimiento_lista'){
    await verificarStockDeLista(p.items);
    // Cada línea se aplica con su clave única: las que ya entraron antes se saltan solas.
    for(const it of p.items){
      await aplicarLineaMovimiento(it);
    }

  } else if(op.tipo === 'registrar_caja'){
    if(p.tipo==='egreso'){
      const saldo = await obtenerSaldoMetodo(p.metodo);
      if(saldo < p.monto) throw new Error(`Sin suficiente ${p.metodo} para este egreso (hay $${saldo.toFixed(2)})`);
    }
    // Clave única: si se reintenta, la base rechaza el repetido en vez de duplicar el dinero.
    await meterMovimientoCajaUnico({tipo:p.tipo, metodo:p.metodo, categoria:p.categoria, monto:p.monto, concepto:p.concepto}, 'opcaja-'+op.id);

  } else if(op.tipo === 'crear_deuda_dinero'){
    if(p.tipo==='me_deben'){
      const saldo = await obtenerSaldoMetodo(p.metodo);
      if(saldo < p.monto) throw new Error(`Sin suficiente ${p.metodo} para prestar (hay $${saldo.toFixed(2)})`);
    }
    await pasoUnaVez('opdeuda-'+op.id, async()=>{
      const r=await sb.from('deudas').insert({tipo:p.tipo, tipo_deuda:'dinero', persona:p.persona, monto:p.monto, nota:p.nota, metodo:p.metodo||null});
      if(r && r.error) throw r.error;
    });
    if(p.tipo==='me_deben'){
      await meterMovimientoCajaUnico({tipo:'egreso', metodo:p.metodo, categoria:'otro', monto:p.monto, concepto:`Préstamo de dinero a ${p.persona}`}, 'opcaja-'+op.id);
    }

  } else if(op.tipo === 'crear_deuda_articulo'){
    // La mercancía se mueve UNA sola vez aunque esto se reintente.
    await pasoUnaVez('opinv-'+op.id, async()=>{
      if(p.tipo === 'me_deben'){
        await verificarStock(p.almacenId, p.productoId, p.cantidad);
        const rq = await ajustarInventario(p.almacenId, p.productoId, -p.cantidad);
        await insertarMovimiento({tipo:'extraccion', producto_id:p.productoId, almacen_origen_id:p.almacenId, cantidad:p.cantidad, nota:`Préstamo de artículo a ${p.persona}`, clave_local:'opinv-'+op.id, cant_antes:rq.antes, cant_despues:rq.despues});
      } else {
        const rq = await ajustarInventario(p.almacenId, p.productoId, p.cantidad);
        await insertarMovimiento({tipo:'ingreso', producto_id:p.productoId, almacen_destino_id:p.almacenId, cantidad:p.cantidad, nota:`Préstamo de artículo recibido de ${p.persona}`, clave_local:'opinv-'+op.id, cant_antes:rq.antes, cant_despues:rq.despues});
      }
    });
    await pasoUnaVez('opdeuda-'+op.id, async()=>{
      const r=await sb.from('deudas').insert({tipo:p.tipo, tipo_deuda:'articulo', persona:p.persona, producto_id:p.productoId, cantidad:p.cantidad, almacen_id:p.almacenId, monto:0, nota:p.nota});
      if(r && r.error) throw r.error;
    });

  } else if(op.tipo === 'pagar_deuda_dinero'){
    const tipoCaja = p.tipo==='debo' ? 'egreso' : 'ingreso';
    const dudosoPD = claveMovYaAplicada('reclamo-dudoso-'+op.id) || p.dudoso === true;
    // ¿Ya quedó pagada (un intento anterior entró y solo se perdió la respuesta)? Entonces
    // no hay nada que hacer. Sin esto, la revisión de saldo de abajo podía trabar el
    // pendiente para siempre: el dinero ya había salido y "no alcanzaba" para pagar otra vez.
    if(!dudosoPD){
      const ya = await sb.from('deudas').select('pagada').eq('id', p.deudaId).maybeSingle();
      if(ya.error) throw new Error(ya.error.message || 'no se pudo leer la deuda');
      if(ya.data && ya.data.pagada) return;
    }
    if(tipoCaja==='egreso'){
      const saldo = await obtenerSaldoMetodo(p.metodo);
      if(saldo < p.monto) throw new Error(`Sin suficiente ${p.metodo} para pagar (hay $${saldo.toFixed(2)})`);
    }
    const categoria = p.tipo==='debo' ? 'pago_mercancia' : 'otro';
    const concepto = (p.tipo==='debo' ? 'Pago de deuda a ' : 'Cobro de deuda a ') + p.persona;
    // VÍA DEL SERVIDOR (todo o nada). No se usa si un intento por pasos quedó a medias.
    if(!dudosoPD){
      const rS = await rpcSegura('pagar_deuda_atomico', {p_deuda:p.deudaId, p_tipo_caja:tipoCaja, p_metodo:p.metodo, p_categoria:categoria, p_monto:p.monto, p_concepto:concepto});
      if(rS.estado === 'ok') return;
    }
    // CANDADO: reclamamos la deuda (pagada solo si no lo estaba). Si ya estaba pagada (porque el
    // pago ya se aplicó antes de sincronizar), NO registramos el movimiento de caja otra vez.
    const {data: reclamada, error: eReclamo} = await sb.from('deudas')
      .update({pagada:true, pagada_en:new Date().toISOString()}).eq('id', p.deudaId).eq('pagada', false).select();
    if(eReclamo){
      // Antes este error ni se miraba: si se cortaba la conexión justo aquí, el pago pendiente
      // se daba por hecho y se BORRABA de la cola sin haberse aplicado. Ahora se queda en cola.
      // Se anota que este intento falló: puede que la base sí lo haya guardado y solo se
      // perdiera la respuesta; en ese caso el reintento debe terminar de mover el dinero.
      marcarClaveMovAplicada('reclamo-dudoso-'+op.id);
      throw new Error(eReclamo.message || 'no se pudo marcar la deuda');
    }
    const reclamoPrevioDudoso = dudosoPD || claveMovYaAplicada('reclamo-dudoso-'+op.id);
    if((reclamada && reclamada.length > 0) || reclamoPrevioDudoso){
      try{
        // Clave única: si se reintenta, no se duplica el movimiento de dinero.
        // Pendientes de la versión anterior pudieron haberlo guardado ya con la clave vieja.
        const vV = await sb.from('caja_movimientos').select('id').eq('clave_caja', 'opcaja-'+op.id).limit(1);
        if(!(!vV.error && vV.data && vV.data.length))
          await meterMovimientoCajaUnico({tipo:tipoCaja, metodo:p.metodo, categoria, monto:p.monto, concepto}, 'pagodeuda-'+p.deudaId);
      }catch(eMov){
        await escribirConReintento(()=> sb.from('deudas').update({pagada:false, pagada_en:null}).eq('id', p.deudaId));
        throw eMov;
      }
    }

  } else if(op.tipo === 'resolver_prestamo_articulo'){
    // Misma clave que el camino directo (atada a la deuda): la mercancía se mueve UNA vez.
    const clavePD = 'presdev-' + p.deudaId;
    if(!claveMovYaAplicada('opinv-'+op.id)){          // pendientes viejos que ya la habían movido
      const yaMovido = claveMovYaAplicada(clavePD) || await movimientoYaRegistrado(clavePD);
      if(p.tipoOriginal !== 'me_deben' && !yaMovido) await verificarStock(p.almacenId, p.productoId, p.cantidad);
      await aplicarLineaMovimiento({
        clave_local: clavePD, tipo: (p.tipoOriginal === 'me_deben' ? 'ingreso' : 'extraccion'),
        origen_id: Number(p.almacenId), producto_id: p.productoId, cantidad: Number(p.cantidad),
        nota: `Devolución de préstamo — ${p.persona}`
      });
    }
    await escribirConReintento(()=> sb.from('deudas').update({pagada:true, pagada_en:new Date().toISOString()}).eq('id', p.deudaId));
  }
}

function verDetallePendientesAdmin(){
  const cola = lsGet('adm_pending_ops', []);
  if(cola.length===0){ abrirModalInfo('Pendientes por subir', '<div style="color:var(--muted)">No hay nada pendiente. Todo está sincronizado. ✓</div>'); return; }

  // Traduce cada operacion pendiente a un texto claro (sin claves ni JSON).
  const nombreProd = id => { const p = PRODUCTOS.find(x=>x.id===id); return p ? p.nombre : ('producto #'+id); };
  const nombreAlm = id => { const a = ALMACENES.find(x=>x.id===id); return a ? a.nombre : ('almacen #'+id); };
  const tipoTexto = {ingreso:'Entrada', extraccion:'Salida', traslado:'Traslado'};

  const bloques = cola.map((op,i)=>{
    const p = op.payload || {};
    let detalle = '';
    if(op.tipo === 'movimiento_lista' && Array.isArray(p.items)){
      const lineas = p.items.map(it=>{
        const t = tipoTexto[it.tipo] || it.tipo;
        if(it.tipo === 'traslado'){
          return `   - ${t}: ${it.nombre} x${it.cantidad}  (de ${it.origen_nombre||nombreAlm(it.origen_id)} a ${it.destino_nombre||nombreAlm(it.destino_id)})`;
        }
        return `   - ${t}: ${it.nombre} x${it.cantidad}  (${it.origen_nombre||nombreAlm(it.origen_id)})`;
      }).join('\n');
      detalle = `Movimiento de mercancia:\n${lineas}`;
    } else if(op.tipo === 'crear_producto'){
      detalle = `Crear producto nuevo: ${p.nombre || '-'}`;
    } else if(op.tipo === 'editar_precios'){
      detalle = p.nombre && p.nombre !== p.nombreAnterior
        ? `Cambiar producto: ${p.nombreAnterior||nombreProd(p.producto_id)} → "${p.nombre}" (precio/costo)`
        : `Cambiar precios de: ${nombreProd(p.producto_id)}`;
    } else if(op.tipo === 'renombrar_producto'){
      detalle = `Cambiar nombre a: ${p.nombre || '-'}`;
    } else if(op.tipo === 'movimiento_dinero'){
      detalle = `Movimiento de dinero: ${p.tipo==='ingreso'?'entro':'salio'} $${num(p.monto)} (${p.categoria||'-'})`;
    } else {
      detalle = op.tipo;
    }
    const causa = op._ultimoError ? `\n   Motivo: ${motivoLegible(op._ultimoError)}` : '';
    return `${i+1}) ${detalle}${causa}`;
  }).join('\n\n');

  const cuerpo = `<div style="border:1px solid var(--border); background:var(--panel2); border-radius:12px; padding:14px; white-space:pre-wrap; font-size:14px; line-height:1.5">${bloques}</div>
    <div style="color:var(--muted); font-size:12px; margin-top:10px">No se perdió nada: se subirá solo cuando haya buena conexión.</div>`;
  abrirModalInfo('Pendientes por subir (admin)', cuerpo);
}

// Traduce los errores técnicos comunes a un texto claro para el trabajador. Casi siempre son
// cortes de internet, no fallas de la app.
function motivoLegible(err){
  const m = (err||'').toString().toLowerCase();
  if(m.includes('failed to fetch') || m.includes('networkerror') || m.includes('load failed') || m.includes('network request failed') || m.includes('err_internet') || m.includes('timeout') || m.includes('timed out')){
    return 'No había internet en ese momento (se reintenta solo)';
  }
  if(m.includes('duplicate') || m.includes('unique')){
    return 'Ya estaba registrado (no se duplica)';
  }
  return err;
}

function descartarPendienteAdmin(){
  const cola = lsGet('adm_pending_ops', []);
  if(cola.length===0){ alert('No hay nada pendiente.'); return; }
  if(!confirm('Esto borra PERMANENTEMENTE la operación más antigua sin sincronizar. Usa "Ver qué está pendiente" primero. ¿Continuar?')) return;
  cola.shift();
  lsSet('adm_pending_ops', cola);
  actualizarConexionAdminUI();
}

// Verde = entra dinero, rojo = sale. El <select> sigue existiendo (oculto) para que todo
// lo demás funcione igual; estos botones solo le cambian el valor y pintan el color.
function fijarTipoCaja(tipo){
  const sel = document.getElementById('cajaTipo');
  if(sel) sel.value = tipo;
  const base = 'flex:1; padding:12px 10px; font-size:15px; font-weight:800; border-radius:12px; cursor:pointer; ';
  const activo = c => base + 'background:'+c+'; color:#fff; border:2px solid '+c+'; box-shadow:0 2px 8px rgba(0,0,0,.18)';
  const apagado = () => base + 'background:transparent; color:var(--muted); border:2px solid var(--border); opacity:.75';
  const bIn = document.getElementById('btnTipoIngreso');
  const bEg = document.getElementById('btnTipoEgreso');
  if(bIn) bIn.setAttribute('style', tipo==='ingreso' ? activo('var(--green)') : apagado());
  if(bEg) bEg.setAttribute('style', tipo==='egreso'  ? activo('var(--red)')   : apagado());
  // el botón de registrar y el monto se pintan igual, para que no haya dudas
  const btnReg = document.getElementById('btnRegistrarCaja');
  if(btnReg){
    const c = (tipo==='egreso') ? 'var(--red)' : 'var(--green)';
    btnReg.style.background = c; btnReg.style.borderColor = c; btnReg.style.color = '#fff';
    btnReg.textContent = (tipo==='egreso') ? 'Registrar salida' : 'Registrar entrada';
  }
  const monto = document.getElementById('cajaMonto');
  if(monto) monto.style.borderColor = (tipo==='egreso') ? 'var(--red)' : 'var(--green)';
}

async function registrarCaja(){
  const tipo = document.getElementById('cajaTipo').value;
  const metodo = document.getElementById('cajaMetodo').value;
  const categoria = document.getElementById('cajaCategoria').value;
  const monto = Number(document.getElementById('cajaMonto').value);
  const concepto = document.getElementById('cajaConcepto').value.trim();
  const msgEl = document.getElementById('cajaMsg');
  if(!monto || monto<=0){ msgEl.textContent='Ingresa un monto válido.'; msgEl.className='msg err'; return; }

  const limpiarYEncolar = (prefijo)=>{
    encolarOperacionAdmin('registrar_caja', {tipo, metodo, categoria, monto, concepto});
    msgEl.textContent = prefijo+' guardado en el teléfono, se aplicará cuando vuelva la conexión.'; msgEl.className='msg ok';
    document.getElementById('cajaMonto').value=''; document.getElementById('cajaConcepto').value='';
    actualizarConexionAdminUI();
  };

  if(!navigator.onLine){
    if(tipo==='egreso' && obtenerSaldoMetodoLocal(metodo) < monto){
      msgEl.textContent = `Según los últimos datos guardados no hay suficiente ${metodo} (esto puede cambiar al sincronizar). Aun así, ¿deseas guardarlo para revisarlo después? Mejor evita registrar egresos grandes sin conexión.`;
      msgEl.className='msg err';
      return;
    }
    limpiarYEncolar('Sin internet:');
    return;
  }

  try{
    if(tipo==='egreso'){
      const saldo = await obtenerSaldoMetodo(metodo);
      if(saldo < monto){
        msgEl.textContent = `No hay suficiente ${metodo} registrado (hay $${num(saldo)}, intentas sacar $${num(monto)}). Si el dinero viene de fuera del negocio, regístralo primero como "Depósito / aporte".`;
        msgEl.className='msg err';
        return;
      }
      if(!confirm(`Vas a registrar una SALIDA de $${num(monto)} en ${metodo}${concepto?' ('+concepto+')':''}. Esto baja el dinero del negocio. ¿Confirmas?`)) return;
    }
    const {error} = await sb.from('caja_movimientos').insert({tipo, metodo, categoria, monto, concepto});
    if(error) throw error;
    msgEl.textContent='Movimiento registrado.'; msgEl.className='msg ok';
    document.getElementById('cajaMonto').value=''; document.getElementById('cajaConcepto').value='';
    await cargarDinero();
  }catch(err){
    limpiarYEncolar('No se pudo conectar:');
  }
}
