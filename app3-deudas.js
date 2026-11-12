// LOPE · Mi Negocio — Deudas, cobros, comisiones, usuarios, ventas registradas y conciliación
// (Este archivo solo tiene funciones. Lo que se ejecuta al abrir la app está en app8-arranque.js)

function toggleCamposDeuda(){
  const esArticulo = document.getElementById('deudaTipoDeuda').value === 'articulo';
  document.getElementById('campoDeudaTipoMoneda').style.display = esArticulo ? 'none' : '';
  document.getElementById('campoDeudaTipoArticulo').style.display = esArticulo ? '' : 'none';
  document.getElementById('filaCamposDinero').style.display = esArticulo ? 'none' : '';
  document.getElementById('filaCamposArticulo').style.display = esArticulo ? '' : 'none';
  actualizarCampoMetodoPrestamo();
}

// El dinero que TÚ prestas sale de la caja en el momento (porque es efectivo/tarjeta real que entregas).
// Lo que TÚ debes (por mercancía, etc.) no mueve caja hasta que lo pagas — por eso solo se pide
// el método cuando el tipo es "Me deben" (estás prestando dinero ahora mismo).
function actualizarCampoMetodoPrestamo(){
  const esDinero = document.getElementById('deudaTipoDeuda').value === 'dinero';
  const prestoYo = document.getElementById('deudaTipo').value === 'me_deben';
  document.getElementById('campoMetodoPrestamo').style.display = (esDinero && prestoYo) ? '' : 'none';
}

async function crearDeuda(){
  const tipoDeuda = document.getElementById('deudaTipoDeuda').value;
  const persona = document.getElementById('deudaPersona').value.trim();
  const nota = document.getElementById('deudaNota').value.trim();
  const msgEl = document.getElementById('deudaMsg');

  if(!persona){ msgEl.textContent='Escribe el nombre de la persona/empresa.'; msgEl.className='msg err'; return; }

  const limpiarCamposComunes = ()=>{
    document.getElementById('deudaPersona').value=''; document.getElementById('deudaMonto').value='';
    document.getElementById('deudaNota').value=''; document.getElementById('deudaCantidad').value='';
    document.getElementById('deudaProductoTexto').value=''; document.getElementById('deudaProducto').value='';
  };

  if(tipoDeuda === 'dinero'){
    const tipo = document.getElementById('deudaTipo').value;
    const monto = Number(document.getElementById('deudaMonto').value);
    if(!monto || monto<=0){ msgEl.textContent='Ingresa un monto válido.'; msgEl.className='msg err'; return; }

    let metodo = null;
    if(tipo === 'me_deben'){
      metodo = document.getElementById('deudaMetodo').value;
    }

    if(!navigator.onLine){
      if(tipo==='me_deben' && obtenerSaldoMetodoLocal(metodo) < monto){
        msgEl.textContent = `Según los últimos datos guardados no hay suficiente ${metodo} para prestar esto. Conéctate para confirmarlo antes de prestar.`;
        msgEl.className='msg err';
        return;
      }
      encolarOperacionAdmin('crear_deuda_dinero', {tipo, persona, monto, nota, metodo});
      msgEl.textContent = 'Sin internet: guardado en el teléfono, se aplicará cuando vuelva la conexión.'; msgEl.className='msg ok';
      limpiarCamposComunes();
      actualizarConexionAdminUI();
      return;
    }

    try{
      if(tipo === 'me_deben'){
        // Estás prestando dinero real ahora mismo: sale de la caja en el momento, no cuando te lo paguen.
        const saldo = await obtenerSaldoMetodo(metodo);
        if(saldo < monto){
          msgEl.textContent = `No hay suficiente ${metodo} registrado para prestar esto (hay $${num(saldo)}). No puedes prestar dinero que no está en caja.`;
          msgEl.className='msg err';
          return;
        }
      }

      const {error} = await sb.from('deudas').insert({tipo, tipo_deuda:'dinero', persona, monto, nota, metodo});
      if(error) throw error;

      if(tipo === 'me_deben'){
        // La deuda YA quedó creada arriba. Si el dinero no sale de caja ahora, se deja en cola
        // SOLO la salida de caja (no la deuda otra vez, que quedaría duplicada).
        const rPrest = await sb.from('caja_movimientos').insert({tipo:'egreso', metodo, categoria:'otro', monto, concepto:`Préstamo de dinero a ${persona}`});
        if(rPrest && rPrest.error){
          encolarOperacionAdmin('registrar_caja', {tipo:'egreso', metodo, categoria:'otro', monto, concepto:`Préstamo de dinero a ${persona}`});
          msgEl.textContent = 'Préstamo registrado. La salida de caja quedó pendiente y se sube sola cuando vuelva la conexión.'; msgEl.className='msg ok';
          limpiarCamposComunes(); actualizarConexionAdminUI();
          return;
        }
      }

      msgEl.textContent = tipo==='me_deben' ? 'Préstamo registrado y descontado de caja.' : 'Deuda registrada.';
      msgEl.className='msg ok';
      await cargarDinero();
      limpiarCamposComunes();
    }catch(err){
      encolarOperacionAdmin('crear_deuda_dinero', {tipo, persona, monto, nota, metodo});
      msgEl.textContent = 'No se pudo conectar: guardado en el teléfono, se aplicará cuando vuelva la conexión.'; msgEl.className='msg ok';
      limpiarCamposComunes();
      actualizarConexionAdminUI();
    }
  } else {
    // Préstamo de artículo: el inventario se mueve YA, en el momento de crear el préstamo.
    const tipo = document.getElementById('deudaTipoArticulo').value;
    const almacenId = Number(document.getElementById('deudaAlmacen').value);
    const productoId = Number(document.getElementById('deudaProducto').value);
    const cantidad = Number(document.getElementById('deudaCantidad').value);
    if(!almacenId || !productoId || !cantidad || cantidad<=0){
      msgEl.textContent='Selecciona almacén, producto y una cantidad válida.'; msgEl.className='msg err'; return;
    }

    if(!navigator.onLine){
      encolarOperacionAdmin('crear_deuda_articulo', {tipo, persona, almacenId, productoId, cantidad, nota});
      msgEl.textContent = 'Sin internet: el préstamo se guardó en el teléfono, se aplicará al inventario cuando vuelva la conexión.'; msgEl.className='msg ok';
      limpiarCamposComunes();
      actualizarConexionAdminUI();
      return;
    }

    try{
      if(tipo === 'me_deben'){
        // Yo presté el artículo: sale de mi almacén ahora mismo.
        await verificarStock(almacenId, productoId, cantidad);
        const rPr = await ajustarInventario(almacenId, productoId, -cantidad);
        await insertarMovimiento({tipo:'extraccion', producto_id:productoId, almacen_origen_id:almacenId, cantidad, nota:`Préstamo de artículo a ${persona}`, cant_antes:rPr.antes, cant_despues:rPr.despues});
      } else {
        // Me prestaron el artículo: entra a mi almacén ahora mismo.
        const rPr = await ajustarInventario(almacenId, productoId, cantidad);
        await insertarMovimiento({tipo:'ingreso', producto_id:productoId, almacen_destino_id:almacenId, cantidad, nota:`Préstamo de artículo recibido de ${persona}`, cant_antes:rPr.antes, cant_despues:rPr.despues});
      }
      const {error} = await sb.from('deudas').insert({tipo, tipo_deuda:'articulo', persona, producto_id:productoId, cantidad, almacen_id:almacenId, monto:0, nota});
      if(error) throw error;
      msgEl.textContent='Préstamo registrado y aplicado al inventario.'; msgEl.className='msg ok';
      await cargarTodo();
      limpiarCamposComunes();
    }catch(err){
      encolarOperacionAdmin('crear_deuda_articulo', {tipo, persona, almacenId, productoId, cantidad, nota});
      msgEl.textContent = 'No se pudo conectar: el préstamo se guardó en el teléfono, se aplicará cuando vuelva la conexión.'; msgEl.className='msg ok';
      limpiarCamposComunes();
      actualizarConexionAdminUI();
    }
  }

  await cargarDeudas();
}

// Muestra CUÁNDO se pagó una deuda y CON QUÉ VENTA se cobró. El dato ya se guardaba
// (pagada_en y venta_dia_id), pero no se veía en pantalla: por eso parecía que los pagos
// de comisiones no dejaban ningún rastro.
function trazaDePago(d){
  const partes=[];
  if(d && d.pagada_en){
    try{ partes.push(new Date(d.pagada_en).toLocaleDateString()); }catch(e){}
  }
  if(d && d.venta_dia_id!=null) partes.push('cobrada en la venta #'+d.venta_dia_id);
  if(!partes.length) return '';
  return '<div style="color:var(--muted);font-size:11px;margin-top:2px">'+partes.join(' · ')+'</div>';
}

async function cargarDeudas(){
  const body = document.getElementById('deudasBody');
  const empty = document.getElementById('deudasEmpty');
  const verTodasBtn = document.getElementById('deudasVerTodasBtn');

  if(!navigator.onLine){
    DEUDAS_CACHE = lsGet('adm_cache_deudas', []);
  } else {
    try{
      // Paginado: sin esto la base devuelve solo 1000 y las deudas viejas desaparecen de la lista y de los totales.
      DEUDAS_CACHE = await traerTodasLasFilas(()=> sb.from('deudas').select('*').order('creado_en', {ascending:false}));
      lsSet('adm_cache_deudas', DEUDAS_CACHE);
    }catch(err){
      console.error(err);
      DEUDAS_CACHE = lsGet('adm_cache_deudas', []);
    }
  }

  if(DEUDAS_CACHE.length===0){
    body.innerHTML=''; empty.style.display='block'; verTodasBtn.style.display='none';
    document.getElementById('deudasContadorPill').textContent='';
    return;
  }
  empty.style.display='none';
  document.getElementById('deudasContadorPill').textContent = `${DEUDAS_CACHE.filter(d=>!d.pagada).length} pendiente(s)`;

  // ORDEN: primero TODAS las pendientes (prioridad), de la MÁS NUEVA a la más vieja.
  // Después las ya pagadas, también de la más nueva a la más vieja.
  const masNuevaPrimero = (a,b) => new Date(b.creado_en||0) - new Date(a.creado_en||0);
  const pendientes = DEUDAS_CACHE.filter(d=>!d.pagada).sort(masNuevaPrimero);
  const pagadas = DEUDAS_CACHE.filter(d=>d.pagada).sort(masNuevaPrimero);
  const DEUDAS_ORDENADAS = [...pendientes, ...pagadas];

  const aMostrar = mostrarTodasDeudas ? DEUDAS_ORDENADAS : DEUDAS_ORDENADAS.slice(0,6);
  verTodasBtn.style.display = DEUDAS_ORDENADAS.length > 6 ? 'inline-block' : 'none';
  verTodasBtn.textContent = mostrarTodasDeudas ? 'Ver solo las primeras 6' : `Ver todas (${DEUDAS_ORDENADAS.length})`;

  body.innerHTML = aMostrar.map(d=>{
    let detalle;
    if(d.tipo_deuda === 'articulo'){
      const p = PRODUCTOS.find(p=>p.id===d.producto_id);
      const alm = ALMACENES.find(a=>a.id===d.almacen_id);
      detalle = `${p?p.nombre:'(producto)'} × ${num(d.cantidad)} — ${alm?alm.nombre:'—'}`;
    } else {
      detalle = `$${num(d.monto)}`;
    }
    const etiquetaTipo = d.tipo_deuda==='articulo'
      ? (d.tipo==='me_deben' ? 'Presté artículo' : 'Me prestaron artículo')
      : (d.tipo==='debo' ? 'Yo debo' : 'Me deben');
    const botonTexto = d.tipo==='debo' ? 'Pagar' : 'Cobrar';
    const mostrarNota = usuarioActual.rol === 'dueno' && d.nota;

    return `<tr>
      <td>${etiquetaTipo}</td>
      <td>${d.persona}${mostrarNota?`<div style="color:var(--muted);font-size:12px">${d.nota}</div>`:''}</td>
      <td>${detalle}</td>
      <td>${d.pagada?'<span class="badge ingreso">pagada</span>'+trazaDePago(d):'<span class="badge extraccion">pendiente</span>'}</td>
      <td>${d.pagada?'':(
        d.tipo_deuda==='articulo'
        ? `<button class="ghost" onclick="resolverDeudaArticulo(${d.id})">${botonTexto}</button>`
        : `<select id="metodoDeuda-${d.id}" style="font-size:12px;padding:4px 6px;margin-right:4px">
            <option value="efectivo" ${d.metodo==='efectivo'?'selected':''}>Efectivo</option>
            <option value="tarjeta" ${d.metodo==='tarjeta'?'selected':''}>Tarjeta</option>
          </select>
          <button class="ghost" onclick="marcarDeudaPagada(${d.id}, '${d.tipo}', ${d.monto}, '${txtAttr(d.persona)}')">${botonTexto}</button>`
      )}${usuarioActual.rol==='dueno' ? `<button class="ghost" style="padding:4px 8px; font-size:11px; border-color:var(--red); color:var(--red); margin-left:4px" onclick="borrarDeuda(${d.id}, '${txtAttr(d.persona)}', ${d.monto})">Borrar</button>` : ''}</td>
    </tr>`;
  }).join('');
}

// Borra una deuda/comisión a mano. Solo el dueño. Sirve para limpiar comisiones que quedaron
// sueltas (por ejemplo, de una venta que se borró y cuya comisión no tenía el vínculo).
async function borrarDeuda(id, persona, monto){
  if(usuarioActual.rol !== 'dueno'){ alert('Solo el dueño puede borrar deudas.'); return; }
  const d = (typeof DEUDAS_CACHE!=='undefined' ? DEUDAS_CACHE : []).find(x=>x.id===id);
  if(d && d.pagada){
    // Ojo: borrar una deuda YA PAGADA no revierte el dinero que ya entró/salió de la caja.
    if(!confirm(`⚠️ Esta deuda de ${persona} ($${num(monto)}) ya está PAGADA.\n\nBorrarla NO devuelve ni quita el dinero de la caja — solo elimina el registro. La caja quedará como está.\n\nSi lo que quieres es corregir la caja, hazlo aparte en 💵 Dinero.\n\n¿Borrar de todos modos el registro?`)) return;
  } else {
    if(!confirm(`¿Borrar esta deuda/comisión?\n\n${persona} — $${num(monto)}\n\nEsto la elimina del todo. Úsalo para limpiar comisiones que quedaron sueltas de una venta borrada.`)) return;
  }
  try{
    const {error} = await sb.from('deudas').delete().eq('id', id);
    if(error) throw error;
    await cargarDeudas();
  }catch(err){
    alert('No se pudo borrar: ' + (err.message||err));
  }
}

function toggleVerTodasDeudas(){
  mostrarTodasDeudas = !mostrarTodasDeudas;
  cargarDeudas();
}

// La fecha que le importa al que cobra es la del DÍA DE LA VENTA (la ganancia), no la del día en
// que se registró la comisión. La sacamos de la nota ("...venta del YYYY-MM-DD..."). Si por lo que
// sea no está, caemos a la fecha de creación. Se arma como fecha LOCAL para que la zona horaria
// no la corra un día.
function fechaDeLaVentaDeComision(deuda){
  const m = (deuda && deuda.nota || '').match(/venta del (\d{4})-(\d{2})-(\d{2})/);
  if(m){
    return new Date(Number(m[1]), Number(m[2])-1, Number(m[3])).toLocaleDateString();
  }
  return deuda && deuda.creado_en ? new Date(deuda.creado_en).toLocaleDateString() : '';
}

// ---------- COBRAR (el administrador cobra su propia comisión pendiente) ----------
async function cargarCobrosAdmin(){
  await cargarDeudas(); // reutiliza la misma caché/offline que el resto de Deudas
  const propias = DEUDAS_CACHE.filter(d => d.tipo_deuda==='dinero' && d.tipo==='debo' && d.persona===usuarioActual.nombre && !d.pagada);

  const body = document.getElementById('cobrarAdminBody');
  const empty = document.getElementById('cobrarAdminEmpty');
  const total = propias.reduce((s,d)=>s+Number(d.monto),0);
  document.getElementById('cobrarAdminTotalPendiente').textContent = num(total);

  if(propias.length===0){ body.innerHTML=''; empty.style.display='block'; return; }
  empty.style.display='none';
  body.innerHTML = propias.map(d => `<tr>
    <td>${fechaDeLaVentaDeComision(d)}</td>
    <td class="numcell">$${num(d.monto)}</td>
    <td>
      <select id="metodoCobroAdmin-${d.id}" style="font-size:12px;padding:4px 6px">
        <option value="efectivo">Efectivo</option>
        <option value="tarjeta">Tarjeta</option>
      </select>
    </td>
    <td><button class="primary" style="padding:8px 14px; font-size:13px" onclick="cobrarComoAdmin(${d.id}, ${d.monto}, '${txtAttr(d.persona)}')">Cobrar</button></td>
  </tr>`).join('');
}

async function cobrarComoAdmin(deudaId, monto, persona){
  const metodo = document.getElementById('metodoCobroAdmin-'+deudaId).value;
  const msgEl = document.getElementById('cobrarAdminMsg');

  if(!navigator.onLine){
    if(obtenerSaldoMetodoLocal(metodo) < monto){
      msgEl.textContent = `Según los últimos datos guardados no hay suficiente ${metodo}. Conéctate para confirmarlo antes de cobrar.`;
      msgEl.className='msg err';
      return;
    }
    encolarOperacionAdmin('pagar_deuda_dinero', {deudaId, tipo:'debo', monto, metodo, persona});
    const d = DEUDAS_CACHE.find(x=>x.id===deudaId);
    if(d) d.pagada = true;
    msgEl.textContent='Sin internet: guardado en el teléfono, se aplicará cuando vuelva la conexión.'; msgEl.className='msg ok';
    await cargarCobrosAdmin();
    actualizarConexionAdminUI();
    return;
  }

  try{
    const saldo = await obtenerSaldoMetodo(metodo);
    if(saldo < monto){
      msgEl.textContent = `No hay suficiente ${metodo} registrado para cobrar esto (hay $${num(saldo)}, se necesitan $${num(monto)}).`;
      msgEl.className='msg err';
      return;
    }
    // VÍA DEL SERVIDOR: marca la deuda y saca el dinero en UN solo golpe (todo o nada).
    {
      const rS = await rpcSegura('pagar_deuda_atomico', {p_deuda:deudaId, p_tipo_caja:'egreso', p_metodo:metodo, p_categoria:'comision', p_monto:monto, p_concepto:'Pago de comisión a '+persona});
      if(rS.estado === 'ok'){
        if(rS.data === 'ya_pagada'){ msgEl.textContent = 'Ese pago ya estaba cobrado. No se cobró de nuevo.'; msgEl.className='msg err'; }
        else { msgEl.textContent = `Cobraste $${num(monto)}.`; msgEl.className='msg ok'; }
        await cargarCobrosAdmin();
        return;
      }
    }
    // CANDADO: "reclamamos" la deuda marcándola pagada SOLO si todavía estaba sin pagar. Si otro
    // toque (o un reintento) ya la cobró, este update afecta 0 filas y NO registramos el egreso
    // otra vez. Así el pago de la comisión NUNCA sale doble de la caja.
    const {data: reclamada, error: eR} = await sb.from('deudas')
      .update({pagada:true, pagada_en:new Date().toISOString()}).eq('id', deudaId).eq('pagada', false).select();
    if(eR){ const eD = new Error(eR.message || 'se cortó la conexión'); eD.__dudoso = true; throw eD; }
    if(!reclamada || reclamada.length === 0){
      msgEl.textContent = 'Ese pago ya estaba cobrado. No se cobró de nuevo.'; msgEl.className='msg err';
      await cargarCobrosAdmin();
      return;
    }
    // Ya es nuestra: registramos el egreso UNA sola vez. Si falla, devolvemos la deuda a "sin pagar"
    // para no dejarla marcada como cobrada sin haber sacado el dinero.
    try{
      // Esto es el pago de una COMISIÓN, no una compra de mercancía. Antes se guardaba con
      // la categoría 'pago_mercancia', que hacía parecer compras los pagos al administrador.
      // Se intenta con la categoría correcta y, si la base todavía no la admite, se guarda
      // como antes pero con el concepto claro (el dinero nunca se pierde).
      // Clave atada a la deuda: el dinero de esta deuda sale UNA sola vez, por la vía que sea.
      const filaCA = {tipo:'egreso', metodo, monto, concepto:'Pago de comisión a '+persona};
      try{ await meterMovimientoCajaUnico(Object.assign({categoria:'comision'}, filaCA), 'pagodeuda-'+deudaId); }
      catch(eCat){ await meterMovimientoCajaUnico(Object.assign({categoria:'pago_mercancia'}, filaCA), 'pagodeuda-'+deudaId); }
    }catch(eEgreso){
      // Se deshace la marca de pagada. Si ni eso se puede, se avisa: quedaría pagada sin dinero movido.
      try{ await escribirConReintento(()=> sb.from('deudas').update({pagada:false, pagada_en:null}).eq('id', deudaId)); }
      catch(eDes){ try{ registrarError('deudas/pago','Quedó marcada como PAGADA pero el dinero no se movió (revisar deuda #'+deudaId+')', String((eDes&&eDes.message)||eDes)); }catch(_){}
        alert('⚠️ Se cortó la conexión a mitad: la deuda quedó marcada como pagada pero el dinero NO se movió.\n\nEntra a Deudas y vuelve a ponerla como pendiente (botón de deshacer), o avísame.'); }
      throw eEgreso;
    }
    msgEl.textContent = `Cobraste $${num(monto)}.`; msgEl.className='msg ok';
    await cargarCobrosAdmin();
  }catch(err){
    encolarOperacionAdmin('pagar_deuda_dinero', {deudaId, tipo:'debo', monto, metodo, persona, dudoso: !!(err && err.__dudoso)});
    msgEl.textContent='No se pudo conectar: guardado en el teléfono, se aplicará cuando vuelva la conexión.'; msgEl.className='msg ok';
    await cargarCobrosAdmin();
    actualizarConexionAdminUI();
  }
}

async function marcarDeudaPagada(id, tipo, monto, persona){
  const metodo = document.getElementById('metodoDeuda-'+id).value;
  // "debo" pagada => sale dinero (egreso). "me_deben" cobrada => entra dinero (ingreso).
  const tipoCaja = tipo==='debo' ? 'egreso' : 'ingreso';

  if(!navigator.onLine){
    if(tipoCaja==='egreso' && obtenerSaldoMetodoLocal(metodo) < monto){
      alert(`Según los últimos datos guardados no hay suficiente ${metodo} para pagar esto. Conéctate para confirmarlo antes de pagar.`);
      return;
    }
    encolarOperacionAdmin('pagar_deuda_dinero', {deudaId:id, tipo, monto, metodo, persona});
    // Reflejamos el cambio en la copia local para que la pantalla no se vea desactualizada
    const d = DEUDAS_CACHE.find(x=>x.id===id);
    if(d) d.pagada = true;
    alert('Sin internet: guardado en el teléfono, se aplicará cuando vuelva la conexión.');
    renderResumenCaja(); await cargarDeudas();
    actualizarConexionAdminUI();
    return;
  }

  try{
    if(tipoCaja==='egreso'){
      const saldo = await obtenerSaldoMetodo(metodo);
      if(saldo < monto){
        alert(`No hay suficiente ${metodo} registrado para pagar esto (hay $${num(saldo)}, se necesitan $${num(monto)}). Registra primero un "Depósito / aporte" en Dinero si ese efectivo viene de fuera del negocio.`);
        return;
      }
    }

    const categoria = tipo==='debo' ? 'pago_mercancia' : 'otro';
    const concepto = (tipo==='debo' ? 'Pago de deuda a ' : 'Cobro de deuda a ') + persona;
    // VÍA DEL SERVIDOR: marca la deuda y mueve el dinero en UN solo golpe (todo o nada).
    // Si se corta, salta al catch de abajo y queda en la cola, que no lo repite.
    {
      const rS = await rpcSegura('pagar_deuda_atomico', {p_deuda:id, p_tipo_caja:tipoCaja, p_metodo:metodo, p_categoria:categoria, p_monto:monto, p_concepto:concepto});
      if(rS.estado === 'ok'){
        if(rS.data === 'ya_pagada') alert('Esa deuda ya estaba saldada. No se registró de nuevo.');
        await cargarDeudas();
        if(rS.data !== 'ya_pagada') await cargarDinero();
        return;
      }
    }
    // CANDADO: reclamamos la deuda (marcar pagada solo si NO lo estaba). Si ya estaba pagada,
    // no registramos el movimiento de caja otra vez — así el pago/cobro no se duplica.
    const {data: reclamada, error: eR} = await sb.from('deudas')
      .update({pagada:true, pagada_en:new Date().toISOString()}).eq('id', id).eq('pagada', false).select();
    // Si se corta justo aquí no se sabe si quedó marcada: se anota para que la cola lo termine bien.
    if(eR){ const eD = new Error(eR.message || 'se cortó la conexión'); eD.__dudoso = true; throw eD; }
    if(!reclamada || reclamada.length === 0){
      alert('Esa deuda ya estaba saldada. No se registró de nuevo.');
      await cargarDeudas();
      return;
    }
    try{
      // Clave atada a la deuda: el dinero de esta deuda se mueve UNA sola vez, por la vía que sea.
      await meterMovimientoCajaUnico({tipo:tipoCaja, metodo, categoria, monto, concepto}, 'pagodeuda-'+id);
    }catch(eMov){
      // Se deshace la marca de pagada. Si ni eso se puede, se avisa: quedaría pagada sin dinero movido.
      try{ await escribirConReintento(()=> sb.from('deudas').update({pagada:false, pagada_en:null}).eq('id', id)); }
      catch(eDes){ try{ registrarError('deudas/pago','Quedó marcada como PAGADA pero el dinero no se movió (revisar deuda #'+id+')', String((eDes&&eDes.message)||eDes)); }catch(_){}
        alert('⚠️ Se cortó la conexión a mitad: la deuda quedó marcada como pagada pero el dinero NO se movió.\n\nEntra a Deudas y vuelve a ponerla como pendiente (botón de deshacer), o avísame.'); }
      throw eMov;
    }
    await cargarDeudas();
    await cargarDinero();
  }catch(err){
    encolarOperacionAdmin('pagar_deuda_dinero', {deudaId:id, tipo, monto, metodo, persona, dudoso: !!(err && err.__dudoso)});
    alert('No se pudo conectar: guardado en el teléfono, se aplicará cuando vuelva la conexión.');
    actualizarConexionAdminUI();
  }
}

// Liquidar un préstamo de artículo: el inventario se mueve en sentido contrario al que se
// movió cuando se creó el préstamo.
async function resolverDeudaArticulo(id){
  const d = DEUDAS_CACHE.find(x=>x.id===id);
  if(!d) return;

  if(!navigator.onLine){
    encolarOperacionAdmin('resolver_prestamo_articulo', {
      deudaId:id, tipoOriginal:d.tipo, almacenId:d.almacen_id, productoId:d.producto_id, cantidad:d.cantidad, persona:d.persona
    });
    d.pagada = true;
    alert('Sin internet: guardado en el teléfono, se aplicará al inventario cuando vuelva la conexión.');
    await cargarDeudas();
    actualizarConexionAdminUI();
    return;
  }

  // La clave va atada a la DEUDA: la mercancía se mueve UNA sola vez, se haga por aquí o por la
  // cola de pendientes. Antes, si el inventario se movía y la deuda no llegaba a marcarse, la
  // operación se mandaba a la cola con OTRA clave y la mercancía se movía por segunda vez.
  const clavePD = 'presdev-' + id;
  try{
    const yaMovido = claveMovYaAplicada(clavePD) || await movimientoYaRegistrado(clavePD);
    if(d.tipo !== 'me_deben' && !yaMovido) await verificarStock(d.almacen_id, d.producto_id, d.cantidad);
    await aplicarLineaMovimiento({
      clave_local: clavePD, tipo: (d.tipo === 'me_deben' ? 'ingreso' : 'extraccion'),
      origen_id: Number(d.almacen_id), producto_id: d.producto_id, cantidad: Number(d.cantidad),
      nota: `Devolución de préstamo — ${d.persona}`
    });
    await escribirConReintento(()=> sb.from('deudas').update({pagada:true, pagada_en:new Date().toISOString()}).eq('id', id));
    await cargarDeudas();
    await cargarTodo();
  }catch(err){
    const motivo = String((err && err.message) || err);
    // Si lo que falta es mercancía, no es cosa de conexión: se dice y no se manda a la cola.
    if(/no hay suficiente|negativo|insuficiente|no alcanza/i.test(motivo)){ alert('No se pudo: ' + motivo); return; }
    encolarOperacionAdmin('resolver_prestamo_articulo', {
      deudaId:id, tipoOriginal:d.tipo, almacenId:d.almacen_id, productoId:d.producto_id, cantidad:d.cantidad, persona:d.persona
    });
    alert('No se pudo conectar: guardado en el teléfono, se aplicará cuando vuelva la conexión.');
    actualizarConexionAdminUI();
  }
}

// ---------- COMISIÓN DEL ADMINISTRADOR (20% de la ganancia neta de todos los puestos) ----------
// Descarta días de venta DUPLICADOS: cuando por un fallo quedaron varias copias del mismo
// día (mismo puesto, misma fecha y exactamente los mismos artículos), solo se cuenta UNA.
// Las ventas de verdad distintas (con artículos distintos) se conservan todas.
function descartarDiasDuplicados(dias, lineas){
  const firmaDe = (diaId) => {
    const suyos = (lineas||[]).filter(l => l.venta_dia_id === diaId)
      .map(l => `${l.producto_id}x${l.cantidad}@${l.precio_venta}`)
      .sort();
    return suyos.join('|');
  };
  const vistas = new Set();
  const conservados = [];
  const descartados = [];
  for(const d of dias){
    const firma = `${d.almacen_id}#${d.fecha}#${firmaDe(d.id)}`;
    // Un día sin artículos no se compara por firma (no aporta nada a los totales)
    if(firmaDe(d.id) === ''){ conservados.push(d); continue; }
    if(vistas.has(firma)){ descartados.push(d); continue; }
    vistas.add(firma);
    conservados.push(d);
  }
  return {conservados, descartados};
}

function quitarDiaComision(id){
  diasExcluidosComision.add(Number(id));
  calcularComisionAdmin();
}
function restaurarDiaComision(id){
  diasExcluidosComision.delete(Number(id));
  calcularComisionAdmin();
}

// Devuelve el conjunto de venta_dia_id que TIENEN al menos un movimiento de inventario.
// Consulta paginada: Supabase corta en 1000 filas por defecto, así que si hay muchos movimientos
// (cada artículo vendido es uno) una sola consulta se quedaría corta y ventas que SÍ descontaron
// aparecerían como "NO descontó". Aquí paginamos con .range() hasta traerlos todos, y troceamos
// los ids por si son muchos (para no armar una URL enorme en el .in()).
async function idsConMovimiento(ids){
  const set = new Set();
  if(!ids || !ids.length) return set;
  const PAGE = 1000, CHUNK = 300;
  for(let i=0; i<ids.length; i+=CHUNK){
    const sub = ids.slice(i, i+CHUNK);
    let desde = 0;
    for(;;){
      let data, error;
      try{
        const r = await sb.from('movimientos').select('venta_dia_id').in('venta_dia_id', sub).order('id',{ascending:true}).range(desde, desde+PAGE-1);
        data = r.data; error = r.error;
      }catch(e){ error = e; }
      if(error || !data) break;
      data.forEach(m=>{ if(m.venta_dia_id) set.add(m.venta_dia_id); });
      if(data.length < PAGE) break;
      desde += PAGE;
    }
  }
  return set;
}

// Igual que arriba pero para venta_items: trae TODOS los artículos de esas ventas, paginando,
// para que no se queden ventas con "0 artíc / $0 ganancia" por el corte de 1000 filas de Supabase.
async function traerItemsDe(ids, cols){
  const out = [];
  if(!ids || !ids.length) return out;
  const PAGE = 1000, CHUNK = 300;
  for(let i=0; i<ids.length; i+=CHUNK){
    const sub = ids.slice(i, i+CHUNK);
    let desde = 0;
    for(;;){
      let data, error;
      try{
        const r = await sb.from('venta_items').select(cols||'*').in('venta_dia_id', sub).order('id',{ascending:true}).range(desde, desde+PAGE-1);
        data = r.data; error = r.error;
      }catch(e){ error = e; }
      if(error || !data) break;
      out.push(...data);
      if(data.length < PAGE) break;
      desde += PAGE;
    }
  }
  return out;
}

// ============================================================
// TODAS LAS VENTAS REGISTRADAS (solo dueño): ver y borrar
// ============================================================
async function cargarListaVentas(){
  const msgEl = document.getElementById('listaVentasMsg');
  const bodyEl = document.getElementById('listaVentasBody');
  const desde = document.getElementById('listaVentasDesde').value;
  const hasta = document.getElementById('listaVentasHasta').value;
  msgEl.textContent = ''; msgEl.className = 'msg';
  bodyEl.innerHTML = '<div style="color:var(--muted)">Cargando…</div>';

  try{
    let q = sb.from('ventas_dia').select('*');
    if(desde) q = q.gte('fecha', desde);
    if(hasta) q = q.lte('fecha', hasta);
    const dias = await traerTodasLasFilas(()=> q.order('fecha', {ascending:false}).order('id',{ascending:true}));   // paginado: .limit(5000) no servía, la base corta en 1000

    if(!dias || dias.length === 0){
      bodyEl.innerHTML = '<div class="empty">No hay ninguna venta registrada en ese rango.</div>';
      return;
    }

    const ids = dias.map(d=>d.id);
    const items = await traerItemsDe(ids, 'venta_dia_id, cantidad, precio_venta');
    const movsPorDia = await idsConMovimiento(ids); // paginado: no se queda corto en el corte de 1000

    // Nombres de los trabajadores, para mostrar de quién es cada venta
    let nombrePorUsuario = {};
    try{
      const {data: us} = await sb.from('usuarios').select('id, nombre');
      (us||[]).forEach(u=>{ nombrePorUsuario[u.id] = u.nombre; });
    }catch(e){}

    // Agrupar los venta_items por día para poder limpiar duplicados contra el total del día.
    const itemsPorDiaLista = {};
    for(const it of (items||[])){ (itemsPorDiaLista[it.venta_dia_id] = itemsPorDiaLista[it.venta_dia_id]||[]).push(it); }

    const resumenPorDia = {};
    for(const d of dias){
      // El TOTAL viene del campo total del día (fuente de verdad, inmune a venta_items repetidos).
      // Los ARTÍCULOS se cuentan sobre los items REALES (sin copias duplicadas).
      const reales = itemsRealesDeVenta(itemsPorDiaLista[d.id]||[], d.total);
      resumenPorDia[d.id] = { articulos: reales.length, total: totalRealDeVenta(d, itemsPorDiaLista[d.id]||[]) };
    }

    // DETECTAR COPIAS FANTASMA: una venta ABIERTA cuyos artículos son idénticos a una venta
    // ya CERRADA del mismo puesto y día no es trabajo real — es una copia que quedó colgada.
    const firmaPorDia = {};
    for(const it of (items||[])){
      if(!firmaPorDia[it.venta_dia_id]) firmaPorDia[it.venta_dia_id] = [];
      firmaPorDia[it.venta_dia_id].push(`${it.producto_id}x${it.cantidad}@${it.precio_venta}`);
    }
    for(const k of Object.keys(firmaPorDia)) firmaPorDia[k] = firmaPorDia[k].sort().join('|');

    const cerradasPorPuestoFecha = {};
    for(const d of dias){
      if(!d.cerrado) continue;
      const f = firmaPorDia[d.id];
      if(!f) continue;
      const clave = d.almacen_id + '|' + d.fecha;
      if(!cerradasPorPuestoFecha[clave]) cerradasPorPuestoFecha[clave] = new Set();
      cerradasPorPuestoFecha[clave].add(f);
    }
    const esFantasma = d => {
      if(d.cerrado) return false;
      const f = firmaPorDia[d.id];
      if(!f) return false;
      const set = cerradasPorPuestoFecha[d.almacen_id + '|' + d.fecha];
      return !!(set && set.has(f));
    };
    const fantasmas = dias.filter(esFantasma);
    window.__ventasFantasma = fantasmas.map(d=>d.id);

    bodyEl.innerHTML = `
      ${fantasmas.length > 0 ? `
        <div style="background:var(--panel2); border-left:3px solid var(--red); border-radius:10px; padding:12px; margin-bottom:12px">
          <div style="font-weight:700; margin-bottom:4px">👻 Hay ${fantasmas.length} copia(s) fantasma</div>
          <div style="color:var(--muted); font-size:12px; margin-bottom:10px">Son ventas "en curso" con exactamente los mismos artículos que una venta ya cerrada del mismo día y puesto. No son trabajo real: quedaron colgadas. Borrarlas no afecta el inventario ni el dinero.</div>
          <button class="ghost" style="border-color:var(--red); color:var(--red)" onclick="borrarVentasFantasma()">Borrar las ${fantasmas.length} copias</button>
        </div>` : ''}
      <table>
        <thead><tr>
          <th>Fecha</th><th>Puesto</th><th>Quién</th><th class="numcell">Artíc.</th>
          <th class="numcell">Total</th><th>Estado</th><th></th>
        </tr></thead>
        <tbody>
          ${dias.map(d=>{
            const alm = ALMACENES.find(a=>a.id===d.almacen_id);
            const nombreUsuario = nombrePorUsuario[d.usuario_id] || '—';
            const r = resumenPorDia[d.id] || {articulos:0,total:0};
            const desconto = movsPorDia.has(d.id);
            let estado, color;
            if(esFantasma(d)){ estado = '👻 Copia de una venta ya cerrada'; color = 'var(--red)'; }
            else if(!d.cerrado){ estado = 'En curso (sin finalizar)'; color = 'var(--muted)'; }
            else if(!desconto){ estado = '⚠️ Cerrada pero NO descontó'; color = 'var(--amber)'; }
            else { estado = '✓ Finalizada'; color = 'var(--green)'; }
            return `<tr>
              <td>${d.fecha}</td>
              <td>${alm?alm.nombre:'—'}</td>
              <td>${nombreUsuario}</td>
              <td class="numcell">${r.articulos}</td>
              <td class="numcell">$${num(r.total)}</td>
              <td style="color:${color}; font-size:12px">${estado}</td>
              <td><button class="ghost" style="padding:4px 10px; font-size:12px; border-color:var(--red); color:var(--red)" onclick="eliminarVentaRegistrada(${d.id})">Eliminar</button></td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
      <div style="color:var(--muted); font-size:12px; margin-top:10px">Total: ${dias.length} venta(s) registrada(s).</div>`;
  }catch(err){
    bodyEl.innerHTML = '';
    msgEl.textContent = 'No se pudo cargar: ' + (err.message||err);
    msgEl.className = 'msg err';
  }
}

// Borra de un tirón las copias fantasma detectadas en la lista.
// Son ventas ABIERTAS idénticas a una ya CERRADA: no descontaron nada ni movieron dinero,
// así que borrarlas solo limpia la vista. La venta buena (la cerrada) no se toca.
async function borrarVentasFantasma(){
  const msgEl = document.getElementById('listaVentasMsg');
  const ids = window.__ventasFantasma || [];
  if(ids.length === 0){ msgEl.textContent = 'No hay copias fantasma que borrar.'; msgEl.className = 'msg'; return; }
  if(!confirm(`Se van a borrar ${ids.length} copia(s) fantasma.\n\nSon ventas en curso idénticas a otra ya cerrada. No descontaron mercancía ni movieron dinero — solo ensucian la lista.\n\n¿Continuar?`)) return;
  msgEl.textContent = 'Borrando copias…'; msgEl.className = 'msg';
  let borradas = 0;
  for(const id of ids){
    try{
      await escribirConReintento(()=> sb.from('venta_items').delete().eq('venta_dia_id', id));
      await escribirConReintento(()=> sb.from('ventas_dia').delete().eq('id', id));
      borradas++;
    }catch(e){ console.error('No se pudo borrar la copia', id, e); }
  }
  window.__ventasFantasma = [];
  await cargarListaVentas();
  msgEl.textContent = `Listo: se borraron ${borradas} copia(s) fantasma.`;
  msgEl.className = 'msg ok';
}

// Borra las ventas que quedaron SIN ningún artículo (días abiertos vacíos que se crean
// automáticamente y nunca se usaron). No se pierde nada: no tienen mercancía ni dinero.
// Repara ventas cuyos venta_items quedaron DUPLICADOS/TRIPLICADOS por un error de sincronización
// viejo. Para cada día, el campo `total` es la verdad; si la suma de sus venta_items no cuadra
// pero al quitar las copias idénticas SÍ cuadra, se borran los items y se dejan solo los únicos.
// Nunca toca inventario, dinero ni el total del día: solo limpia la lista de artículos repetida.
async function repararArticulosDuplicados(){
  const msgEl = document.getElementById('listaVentasMsg');
  const desde = document.getElementById('listaVentasDesde').value;
  const hasta = document.getElementById('listaVentasHasta').value;
  msgEl.innerHTML = ''; msgEl.textContent = 'Buscando ventas con artículos duplicados…'; msgEl.className = 'msg';
  try{
    let q = sb.from('ventas_dia').select('*').eq('cerrado', true);
    if(desde) q = q.gte('fecha', desde);
    if(hasta) q = q.lte('fecha', hasta);
    const dias = await traerTodasLasFilas(()=> q.order('id',{ascending:true}));   // paginado: .limit(5000) no servía, la base corta en 1000
    if(!dias || dias.length === 0){ msgEl.textContent = 'No hay ventas cerradas en ese rango.'; return; }

    const ids = dias.map(d=>d.id);
    const items = await traerItemsDe(ids, '*');
    const itemsPorDia = {};
    for(const it of (items||[])){ (itemsPorDia[it.venta_dia_id] = itemsPorDia[it.venta_dia_id]||[]).push(it); }

    // Detectar días reparables: la suma cruda NO cuadra con el total, pero la suma SIN copias SÍ.
    const suma = arr => arr.reduce((s,it)=> s + Number(it.cantidad)*Number(it.precio_venta), 0);
    const reparables = [];
    for(const d of dias){
      const crudos = itemsPorDia[d.id] || [];
      if(crudos.length === 0) continue;
      if(Math.abs(suma(crudos) - Number(d.total)) < 0.5) continue; // ya está bien
      const reales = itemsRealesDeVenta(crudos, d.total);
      if(reales.length < crudos.length && Math.abs(suma(reales) - Number(d.total)) < 0.5){
        reparables.push({dia:d, reales, quitar: crudos.length - reales.length});
      }
    }

    if(reparables.length === 0){ msgEl.textContent = '✓ No hay ventas con artículos duplicados. Todo está en orden.'; msgEl.className = 'msg ok'; return; }

    const totalCopias = reparables.reduce((s,r)=>s+r.quitar, 0);
    if(!confirm(`Se encontraron ${reparables.length} venta(s) con artículos repetidos (${totalCopias} copia(s) de más).\n\nSe van a quitar SOLO las copias repetidas. El inventario, el dinero y el total de cada venta NO cambian.\n\n¿Reparar ahora?`)){ msgEl.textContent=''; return; }

    let arregladas = 0, fallidas = 0;
    for(const r of reparables){
      try{
        // Borramos todos los items del día y reinsertamos solo los reales (sin copias).
        await escribirConReintento(()=> sb.from('venta_items').delete().eq('venta_dia_id', r.dia.id));
        const filas = r.reales.map(it=>({
          venta_dia_id: r.dia.id, producto_id: it.producto_id, cantidad: it.cantidad,
          precio_venta: it.precio_venta, costo: it.costo
        }));
        if(filas.length>0){ const {error:eIns} = await sb.from('venta_items').insert(filas); if(eIns) throw eIns; }
        arregladas++;
      }catch(e){ fallidas++; }
    }
    await cargarListaVentas();
    msgEl.textContent = `Listo: se repararon ${arregladas} venta(s)` + (fallidas>0?`, ${fallidas} no se pudieron (revisa la conexión).`:'. El total y el inventario quedaron intactos.');
    msgEl.className = fallidas>0 ? 'msg err' : 'msg ok';
  }catch(err){
    msgEl.textContent = 'No se pudo reparar: ' + (err.message||err);
    msgEl.className = 'msg err';
  }
}

async function limpiarVentasVacias(){
  const msgEl = document.getElementById('listaVentasMsg');
  const desde = document.getElementById('listaVentasDesde').value;
  const hasta = document.getElementById('listaVentasHasta').value;
  msgEl.innerHTML = ''; msgEl.textContent = 'Buscando ventas vacías…'; msgEl.className = 'msg';
  try{
    let q = sb.from('ventas_dia').select('*');
    if(desde) q = q.gte('fecha', desde);
    if(hasta) q = q.lte('fecha', hasta);
    const dias = await traerTodasLasFilas(()=> q.order('id',{ascending:true}));   // paginado: .limit(5000) no servía, la base corta en 1000
    if(!dias || dias.length === 0){ msgEl.textContent = 'No hay ventas en ese rango.'; return; }

    const ids = dias.map(d=>d.id);
    const items = await traerItemsDe(ids, 'venta_dia_id');
    const conItems = new Set((items||[]).map(i=>i.venta_dia_id));
    const vacias = dias.filter(d => !conItems.has(d.id));

    if(vacias.length === 0){ msgEl.textContent = 'No hay ninguna venta vacía que borrar.'; msgEl.className = 'msg ok'; return; }
    if(!confirm(`Se van a borrar ${vacias.length} venta(s) que no tienen ningún artículo.\n\nNo se pierde nada: están vacías, no tienen mercancía ni dinero.\n\n¿Continuar?`)) { msgEl.textContent=''; return; }

    let borradas = 0;
    for(const d of vacias){
      try{
        await escribirConReintento(()=> sb.from('ventas_dia').delete().eq('id', d.id));
        borradas++;
      }catch(e){}
    }
    await cargarListaVentas();
    msgEl.textContent = `Listo: se borraron ${borradas} venta(s) vacía(s).`;
    msgEl.className = 'msg ok';
  }catch(err){
    msgEl.textContent = 'No se pudo limpiar: ' + (err.message||err);
    msgEl.className = 'msg err';
  }
}

// Repara ventas "Cerrada pero NO descontó": días CERRADOS que no tienen NINGÚN movimiento de
// inventario (quedaron así por un corte de internet viejo, antes del arreglo de la sincronización).
//  - Si la venta TODAVÍA tiene sus artículos guardados → descuenta ahora el inventario que faltó
//    (arregla el stock), con candado por producto para no descontar dos veces.
//  - Si quedó SIN artículos (no se sabe qué se vendió) → la reporta para borrarla (Eliminar) o
//    volver a entrarla a mano. NO se puede descontar sola.
// NO toca caja ni comisiones (para eso está "Comisiones que faltan por generar").
async function repararVentasSinDescontar(){
  const msgEl = document.getElementById('listaVentasMsg');
  const desde = document.getElementById('listaVentasDesde').value;
  const hasta = document.getElementById('listaVentasHasta').value;
  msgEl.innerHTML = ''; msgEl.textContent = 'Buscando ventas cerradas que no descontaron…'; msgEl.className = 'msg';
  try{
    let q = sb.from('ventas_dia').select('*').eq('cerrado', true);
    if(desde) q = q.gte('fecha', desde);
    if(hasta) q = q.lte('fecha', hasta);
    const dias = await traerTodasLasFilas(()=> q.order('id',{ascending:true}));   // paginado: .limit(5000) no servía, la base corta en 1000
    if(!dias || dias.length === 0){ msgEl.textContent = 'No hay ventas cerradas en ese rango.'; return; }

    const ids = dias.map(d=>d.id);
    // Días que SÍ tienen algún movimiento = ya descontaron (paginado, no se queda corto en 1000).
    const conMov = await idsConMovimiento(ids);
    // Artículos por día.
    const items = await traerItemsDe(ids, '*');
    const itemsPorDia = {};
    for(const it of (items||[])){ (itemsPorDia[it.venta_dia_id] = itemsPorDia[it.venta_dia_id]||[]).push(it); }

    const zombies = dias.filter(d => !conMov.has(d.id));
    if(zombies.length === 0){ msgEl.textContent = '✓ No hay ventas cerradas sin descontar. Todo está en orden.'; msgEl.className = 'msg ok'; return; }

    const conArticulos = zombies.filter(d => (itemsPorDia[d.id]||[]).length > 0);
    const sinArticulos = zombies.filter(d => (itemsPorDia[d.id]||[]).length === 0);
    const almNom = id => { const a = ALMACENES.find(x=>x.id===id); return a?a.nombre:'—'; };

    // Si NO hay ninguna con artículos, solo mostramos las que hay que revisar a mano.
    if(conArticulos.length === 0){
      msgEl.innerHTML = `
        <div style="background:var(--panel2); border-radius:12px; padding:14px">
          <div style="font-weight:700; margin-bottom:8px">${sinArticulos.length} venta(s) cerradas sin descontar — y SIN artículos</div>
          <div style="color:var(--muted); font-size:13px; margin-bottom:10px">No se puede saber qué se vendió, así que no se pueden descontar solas. Si fueron fantasma, bórralas con "Eliminar" (no cambia el inventario). Si la mercancía salió de verdad, vuelve a entrar esa venta a mano.</div>
          <table><thead><tr><th>Fecha</th><th>Puesto</th><th class="numcell">Total</th></tr></thead><tbody>
          ${sinArticulos.map(d=>`<tr><td>${d.fecha}</td><td>${almNom(d.almacen_id)}</td><td class="numcell">$${num(d.total)}</td></tr>`).join('')}
          </tbody></table>
        </div>`;
      msgEl.className = 'msg';
      return;
    }

    let aviso = `Se encontraron ${zombies.length} venta(s) cerrada(s) que NO descontaron inventario.\n\n`;
    aviso += `• ${conArticulos.length} tienen sus artículos guardados → se pueden DESCONTAR ahora (arregla el stock).\n`;
    if(sinArticulos.length>0) aviso += `• ${sinArticulos.length} quedaron SIN artículos → esas hay que borrarlas (Eliminar) o entrarlas a mano.\n`;
    aviso += `\n¿Descontar ahora las ${conArticulos.length} que sí se pueden? (No toca caja ni comisiones.)`;
    if(!confirm(aviso)){ msgEl.textContent=''; return; }

    let ok=0, fallidas=0; const problemas=[];
    for(const d of conArticulos){
      try{ await descontarVentaAtrasada(d, itemsPorDia[d.id]||[]); ok++; }
      catch(e){ fallidas++; problemas.push(`${d.fecha} ${almNom(d.almacen_id)}: ${e.message||e}`); }
    }
    await cargarListaVentas();
    let fin = `Listo: se descontó el inventario de ${ok} venta(s) atrasada(s).`;
    if(sinArticulos.length>0) fin += ` Quedan ${sinArticulos.length} sin artículos por revisar a mano (bórralas o entra la venta de nuevo).`;
    if(fallidas>0) fin += ` ${fallidas} no se pudieron: ${problemas.slice(0,3).join(' | ')}`;
    msgEl.textContent = fin;
    msgEl.className = fallidas>0 ? 'msg err' : 'msg ok';
  }catch(err){
    console.error(err);
    msgEl.textContent = 'No se pudo revisar ahora: ' + (err.message||err);
    msgEl.className = 'msg err';
  }
}

// Aplica el descuento de inventario que le faltó a UNA venta cerrada (que todavía tiene sus
// artículos). Agrupa por producto (quitando copias duplicadas contra el total), verifica que
// alcance el stock, y descuenta UNA vez por producto con candado (clave 'rep_') para no repetir.
async function descontarVentaAtrasada(dia, itemsDelDia){
  // Si ya tiene algún movimiento, no es una venta sin descontar: no la tocamos.
  try{
    const {data: yaMovs} = await sb.from('movimientos').select('id').eq('venta_dia_id', dia.id).limit(1);
    if(yaMovs && yaMovs.length) return;
  }catch(e){}

  const reales = itemsRealesDeVenta(itemsDelDia||[], dia.total);
  const necesario = {};
  for(const it of reales){ necesario[it.producto_id] = (necesario[it.producto_id]||0) + Number(it.cantidad); }
  if(Object.keys(necesario).length === 0) throw new Error('sin artículos');

  // Verificar TODO el stock antes de tocar nada (lo ya aplicado por clave no se recuenta).
  for(const pid of Object.keys(necesario)){
    if(claveMovYaAplicada('rep_' + dia.id + '_' + pid)) continue;
    const {data} = await sb.from('inventario').select('cantidad').eq('almacen_id', dia.almacen_id).eq('producto_id', Number(pid)).maybeSingle();
    const actual = data ? Number(data.cantidad) : 0;
    if(actual < necesario[pid]){
      const p = PRODUCTOS.find(x=>x.id===Number(pid));
      throw new Error(`no alcanza "${p?p.nombre:pid}" (hay ${actual}, faltan ${necesario[pid]})`);
    }
  }
  // Descontar por producto.
  for(const pid of Object.keys(necesario)){
    const claveRep = 'rep_' + dia.id + '_' + pid;
    if(claveMovYaAplicada(claveRep)) continue;
    const cant = necesario[pid];
    const r = await ajustarInventario(dia.almacen_id, Number(pid), -cant);
    await insertarMovimiento({tipo:'extraccion', producto_id:Number(pid), almacen_origen_id:dia.almacen_id, cantidad:cant, nota:`Descuento atrasado (reparación) - venta del ${dia.fecha}`, venta_dia_id:dia.id, clave_local: claveRep, cant_antes:r.antes, cant_despues:r.despues});
    marcarClaveMovAplicada(claveRep);
  }
}

// Paso 1: al tocar "Eliminar" mostramos EXACTAMENTE qué se va a devolver, para revisarlo
// antes de confirmar. La fuente de verdad son los movimientos de salida que generó esa venta:
// cada uno se creó en el mismo momento en que se descontó el inventario, y guarda cuánto
// había antes y cuánto quedó después. Ese "antes → después" es la prueba del descuento real.
async function eliminarVentaRegistrada(id){
  const msgEl = document.getElementById('listaVentasMsg');
  const bodyEl = document.getElementById('listaVentasBody');
  msgEl.textContent = 'Revisando qué descontó esta venta…'; msgEl.className = 'msg';
  try{
    let salidas = [];
    try{
      const {data: movs} = await sb.from('movimientos').select('*').eq('venta_dia_id', id).eq('tipo','extraccion');
      salidas = movs || [];
    }catch(e){ salidas = []; }

    if(salidas.length === 0){
      msgEl.innerHTML = `
        <div style="background:var(--panel2); border-radius:12px; padding:14px">
          <div style="font-weight:700; margin-bottom:8px">Esta venta NO descontó nada del inventario</div>
          <div style="color:var(--muted); font-size:13px; margin-bottom:12px">No hay ningún movimiento de salida asociado, así que no hay artículos que devolver. Al borrarla, el inventario no cambia.</div>
          <button class="ghost" style="border-color:var(--red); color:var(--red); margin-right:8px" onclick="confirmarEliminarVenta(${id})">Sí, eliminar</button>
          <button class="ghost" onclick="cancelarEliminarVenta()">Cancelar</button>
        </div>`;
      msgEl.className = 'msg';
      return;
    }

    // Detalle producto por producto, verificando el descuento real con el antes → después
    let filas = '';
    let totalUds = 0;
    let hayDudas = false;
    for(const m of salidas){
      const p = PRODUCTOS.find(x=>x.id===m.producto_id);
      const alm = ALMACENES.find(a=>a.id===m.almacen_origen_id);
      const cant = Number(m.cantidad);
      totalUds += cant;
      let prueba = '<span style="color:var(--muted)">registrado</span>';
      const tieneAntes = m.cant_antes !== null && m.cant_antes !== undefined;
      if(tieneAntes){
        const bajo = Number(m.cant_antes) - Number(m.cant_despues);
        if(Math.abs(bajo - cant) < 0.001){
          prueba = `<span style="color:var(--green)">✓ bajó de ${num(m.cant_antes)} a ${num(m.cant_despues)}</span>`;
        } else {
          prueba = `<span style="color:var(--amber)">⚠️ dice ${num(m.cant_antes)} → ${num(m.cant_despues)}</span>`;
          hayDudas = true;
        }
      }
      filas += `<tr>
        <td>${p?p.nombre:'(producto borrado)'}</td>
        <td class="numcell"><strong>${num(cant)}</strong></td>
        <td>${alm?alm.nombre:'—'}</td>
        <td style="font-size:11px">${prueba}</td>
      </tr>`;
    }

    msgEl.innerHTML = `
      <div style="background:var(--panel2); border-radius:12px; padding:14px">
        <div style="font-weight:700; margin-bottom:6px">Se devolverán estos artículos al almacén:</div>
        <div style="color:var(--muted); font-size:12px; margin-bottom:10px">Solo se devuelve lo que esta venta descontó de verdad. La columna de la derecha muestra la prueba: de cuánto a cuánto bajó el inventario en ese momento.</div>
        <table style="margin:0 0 10px">
          <thead><tr><th>Producto</th><th class="numcell">Devolver</th><th>Almacén</th><th>Prueba del descuento</th></tr></thead>
          <tbody>${filas}</tbody>
        </table>
        <div style="font-weight:700; margin-bottom:10px">Total: ${num(totalUds)} unidad(es)</div>
        ${hayDudas ? '<div style="color:var(--amber); font-size:12px; margin-bottom:10px">⚠️ En alguna línea el antes/después no cuadra con la cantidad. Revisa el inventario después de borrar.</div>' : ''}
        <button class="ghost" style="border-color:var(--red); color:var(--red); margin-right:8px" onclick="confirmarEliminarVenta(${id})">Confirmar: borrar y devolver</button>
        <button class="ghost" onclick="cancelarEliminarVenta()">Cancelar</button>
      </div>`;
    msgEl.className = 'msg';
  }catch(err){
    msgEl.textContent = 'No se pudo revisar la venta: ' + (err.message||err);
    msgEl.className = 'msg err';
  }
}

function cancelarEliminarVenta(){
  const msgEl = document.getElementById('listaVentasMsg');
  msgEl.innerHTML = ''; msgEl.textContent = ''; msgEl.className = 'msg';
}

// Paso 2: ya revisado, se borra la venta y se devuelven los artículos.
async function confirmarEliminarVenta(id){
  const msgEl = document.getElementById('listaVentasMsg');
  msgEl.innerHTML = ''; msgEl.textContent = 'Devolviendo artículos…'; msgEl.className = 'msg';
  try{
    let salidas = [];
    try{
      const {data: movs} = await sb.from('movimientos').select('*').eq('venta_dia_id', id).eq('tipo','extraccion');
      salidas = movs || [];
    }catch(e){ salidas = []; }

    let devueltos = 0;
    for(const m of salidas){
      const almacenId = m.almacen_origen_id;
      if(!almacenId) continue;
      const clave = 'devventa_' + id + '_' + m.id;
      if(claveMovYaAplicada(clave)) continue; // por si se reintenta, no devolver dos veces
      try{
        const r = await ajustarInventario(almacenId, m.producto_id, Number(m.cantidad));
        await insertarMovimiento({
          tipo:'ingreso',
          producto_id: m.producto_id,
          almacen_destino_id: almacenId,
          cantidad: Number(m.cantidad),
          nota: 'Artículos devueltos por venta borrada',
          clave_local: clave,
          cant_antes: r.antes,
          cant_despues: r.despues
        });
        marcarClaveMovAplicada(clave);
        devueltos += Number(m.cantidad);
      }catch(e){ console.error('No se pudo devolver un producto:', e); }
    }

    // IMPORTANTE: antes de borrar la venta hay que SOLTAR lo que apunta a ella, o la base
    // no deja borrarla (foreign key). Las comisiones/deudas de esta venta se desvinculan.
    // Si la comisión ya estaba pagada, se conserva pero sin apuntar a la venta borrada.
    try{
      // (a) Por vínculo directo (comisiones nuevas que guardan venta_dia_id)
      await escribirConReintento(()=> sb.from('deudas').delete().eq('venta_dia_id', id).eq('pagada', false));
      await escribirConReintento(()=> sb.from('deudas').update({venta_dia_id: null}).eq('venta_dia_id', id));
    }catch(e){ console.error('No se pudieron soltar las comisiones:', e); }

    // Soltar también cualquier movimiento que aún apunte a la venta
    try{ await escribirConReintento(()=> sb.from('venta_items').delete().eq('venta_dia_id', id)); }catch(e){}
    try{ await escribirConReintento(()=> sb.from('movimientos').update({venta_dia_id: null}).eq('venta_dia_id', id)); }catch(e){}

    const {error} = await escribirConReintento(()=> sb.from('ventas_dia').delete().eq('id', id));
    if(error) throw error;

    msgEl.textContent = devueltos > 0
      ? `Venta eliminada. Se devolvieron ${num(devueltos)} unidad(es) al almacén (queda anotado en el historial).`
      : 'Venta eliminada del registro (no había nada que devolver).';
    msgEl.className = 'msg ok';
    await cargarListaVentas();
    await cargarTodo();
  }catch(err){
    msgEl.textContent = 'No se pudo eliminar: ' + (err.message||err);
    msgEl.className = 'msg err';
  }
}
async function registrarDineroFaltante(i){
  const f = __concFilas[i];
  if(!f){ alert('No encontré esa fila. Dale a Revisar otra vez.'); return; }
  if(!navigator.onLine){ alert('Necesitas internet.'); return; }
  // Este botón SOLO sirve cuando FALTA dinero. Si en caja hay de más, meter más lo empeora.
  if(!(f.falta > 1)){
    alert('Aquí no falta dinero.\n\n'+f.puesto+' — '+f.fecha+'\n'+
          (f.sobra>1 ? 'Al contrario: en caja hay $'+num(f.sobra)+' DE MÁS para esa venta.\n\n'+
                       'Eso casi siempre es un ingreso escrito dos veces, o un sobrante metido como venta.\n'+
                       'Usa "🔎 Ver caja" en esa fila para encontrarlo y borrarlo.'
                     : 'Esa fila ya cuadra.'));
    return;
  }
  const sugerido = Math.round(f.falta);
  const txt = prompt(
    'Registrar dinero de la venta\n\n'+
    f.puesto+' — '+f.fecha+'\n'+
    'Vendió: $'+num(f.venta)+'\n'+
    'Ya entró a caja: $'+num(f.entro)+'\n'+
    'Comisión cobrada: $'+num(f.cobrado)+'\n\n'+
    'Falta por registrar: $'+num(sugerido)+'\n\n'+
    'Escribe el monto que SÍ se entregó (puedes cambiarlo):',
    String(sugerido)
  );
  if(txt===null) return;
  const monto = Math.round(Number(String(txt).replace(/[^0-9.\-]/g,''))*100)/100;
  if(!monto || monto<=0){ alert('Monto no válido.'); return; }
  if(monto > f.falta + 1){ alert('Ese monto es mayor que lo que falta ese día ($'+num(f.falta)+').\n\nSi metes más, a esa venta le va a SOBRAR dinero en caja. Revísalo.'); return; }
  if(!confirm('¿Registrar $'+num(monto)+' como entrada de caja de '+f.puesto+' del '+f.fecha+'?\n\nEsto SOLO se hace si el dinero sí se entregó.')) return;
  try{
    await meterMovimientoCajaUnico({
      tipo:'ingreso', metodo:'efectivo', categoria:'venta', monto:monto,
      concepto:'Venta '+f.puesto+' - '+f.fecha, almacen_id:f.almacen_id
    }, 'concfix-'+f.almacen_id+'-'+f.fecha+'-'+monto);
    alert('Registrado. ✓');
    await cargarConciliacionCaja();
  }catch(e){
    alert('No se pudo: '+((e&&e.message)||e));
  }
}
// Marca una deuda pendiente como cobrada DENTRO de una venta. No toca la caja: ese dinero
// ya se quedó el trabajador cuando entregó la venta de menos; aquí solo se deja constancia.
async function marcarCobradaEnVenta(k, ventaDiaId){
  const c = __concCandidatas[k];
  if(!c){ alert('No encontré esa deuda. Dale a Revisar otra vez.'); return; }
  if(!usuarioActual || usuarioActual.rol!=='dueno'){ alert('Solo el dueño puede hacer esto.'); return; }
  if(!navigator.onLine){ alert('Necesitas internet.'); return; }
  if(!ventaDiaId){ alert('No encontré la venta de ese día.'); return; }
  if(!confirm('¿Marcar como COBRADA esta deuda?\n\n'+(c.persona||'')+' — $'+num(c.monto)+'\n'+(c.nota||'')+'\n\n'
      +'Queda pagada y vinculada a la venta de ese día, que es de donde salió el dinero.\n'
      +'NO se mueve nada de la caja.')) return;
  try{
    const r = await sb.from('deudas').update({pagada:true, pagada_en:new Date().toISOString(), venta_dia_id:ventaDiaId}).eq('id', c.id);
    if(r && r.error) throw new Error(r.error.message);
    alert('Marcada. ✓');
    cerrarDetalleConc();
    await cargarConciliacionCaja();
    try{ if(typeof cargarDeudas==='function') await cargarDeudas(); }catch(e){}
  }catch(e){ alert('No se pudo: '+((e&&e.message)||e)); }
}

async function porQueFalta(i){
  const f = __concFilas[i];
  if(!f){ alert('No encontré esa fila. Dale a Revisar otra vez.'); return; }
  if(!navigator.onLine){ alert('Necesitas internet.'); return; }
  const cont = document.getElementById('concDetalle');
  if(cont){ cont.innerHTML = '<div class="card">Buscando…</div>'; cont.style.display='block'; }
  try{
    // las ventas de ese puesto y ese día
    const dias = await traerTodasLasFilas(()=> sb.from('ventas_dia').select('*')
      .eq('almacen_id', f.almacen_id).eq('fecha', f.fecha).eq('cerrado', true).order('id',{ascending:true}));
    const ids = (dias||[]).map(d=>d.id);
    // lo que entró a caja de ese puesto ese día
    const cajaTodo = await traerTodasLasFilas(()=> sb.from('caja_movimientos').select('*')
      .eq('almacen_id', f.almacen_id).eq('tipo','ingreso').order('id',{ascending:true}));
    const entradas = (cajaTodo||[]).filter(m => m.categoria==='venta' &&
      ( (m.venta_dia_id!=null && ids.includes(m.venta_dia_id)) || String(m.concepto||'').includes(f.fecha) ));
    // las deudas vinculadas a esas ventas
    let deudas = [];
    if(ids.length){
      const todas = await traerTodasLasFilas(()=> sb.from('deudas').select('*').eq('tipo','debo').order('id',{ascending:true}));
      deudas = (todas||[]).filter(c => c.venta_dia_id!=null && ids.includes(c.venta_dia_id));
    }
    const esCom = c => (c.nota||'').includes('Comisi') || !!c.clave_comision;
    // Misma regla que usa la pantalla: una comisión solo sale del dinero de ESTA venta si
    // se ganó en OTRA. Si apunta a su propia venta, el dueño se la pagó por otra vía.
    const salioDeEstaVenta = c => {
      const mOrig = (c.clave_comision||'').match(/^comvta-(.+)$/);
      if(mOrig) return String(c.venta_dia_id) !== String(mOrig[1]);
      const mf = (c.nota||'').match(/venta del (\d{4}-\d{2}-\d{2})/);
      return !(mf && mf[1] === f.fecha);
    };
    const comCobradas   = deudas.filter(c => c.pagada && esCom(c) && salioDeEstaVenta(c));
    const comPagoAparte = deudas.filter(c => c.pagada && esCom(c) && !salioDeEstaVenta(c));
    const otrosCobrados = deudas.filter(c => c.pagada && !esCom(c));
    const sinCobrar = deudas.filter(c => !c.pagada);
    const sumar = arr => arr.reduce((s,c)=>s+Number(c.monto||0),0);

    const li = (txt, monto, color) => '<div style="display:flex;justify-content:space-between;gap:12px;padding:6px 0;border-bottom:1px solid var(--border)">'
      +'<span>'+txt+'</span><b'+(color?' style="color:'+color+'"':'')+'>'+(monto==null?'':'$'+num(monto))+'</b></div>';

    let html = '<div class="card">'
      +'<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">'
      +'<b>¿Por qué falta? — '+String(f.puesto||'').replace(/</g,'&lt;')+' · '+f.fecha+'</b>'
      +'<button onclick="cerrarDetalleConc()">Cerrar</button></div>'
      +'<div style="margin-top:10px">'
      + li('Se vendió ('+f.nVentas+' venta/s)', f.venta)
      + li('Entró a caja', -f.entro, 'var(--green)')
      + li('<b>Diferencia</b>', f.dif, 'var(--amber)');

    html += '<div style="margin-top:14px;font-weight:700">Qué explica esa diferencia</div>';
    if(comCobradas.length) comCobradas.forEach(c => { html += li('Comisión cobrada — '+String(c.persona||'').replace(/</g,'&lt;'), -Number(c.monto), 'var(--green)'); });
    if(otrosCobrados.length) otrosCobrados.forEach(c => { html += li('Otro cobro — '+String(c.persona||'').replace(/</g,'&lt;')+'<div style="color:var(--muted);font-size:12px">'+String(c.nota||'').replace(/</g,'&lt;')+'</div>', -Number(c.monto), 'var(--green)'); });
    if(!comCobradas.length && !otrosCobrados.length) html += '<div style="color:var(--muted);padding:6px 0">Nada. No hay ningún cobro marcado dentro de esta venta.</div>';
    if(comPagoAparte.length){
      html += '<div style="margin-top:10px;color:var(--muted);font-size:12px">La comisión que se ganó en esta misma venta ($'+num(sumar(comPagoAparte))+') no se cuenta aquí: se pagó por otra vía, no salió de este dinero.</div>';
    }
    html += li('<b>Queda sin explicar</b>', f.falta, 'var(--red)');

    if(sinCobrar.length){
      html += '<div style="margin-top:14px;font-weight:700">Deudas de esta venta que siguen SIN cobrar</div>';
      sinCobrar.forEach(c => { html += li(String(c.persona||'').replace(/</g,'&lt;')+'<div style="color:var(--muted);font-size:12px">'+String(c.nota||'').replace(/</g,'&lt;')+'</div>', Number(c.monto)); });
    }

    // ¿Hay alguna deuda PENDIENTE de este puesto que valga justo lo que falta? Entonces el
    // trabajador se la cobró ese día y no apretó el botón de cobrar: el dinero no se perdió,
    // solo falta marcarlo. Con un toque se marca y cuadran las dos cosas a la vez.
    __concCandidatas = [];
    try{
      const nombres = new Set([String(f.puesto||'').trim().toLowerCase()]);
      (dias||[]).forEach(d=>{ if(d.cobra_comision) nombres.add(String(d.cobra_comision).trim().toLowerCase()); });
      const pendientes = await traerTodasLasFilas(()=> sb.from('deudas').select('*')
        .eq('tipo','debo').eq('pagada', false).order('id',{ascending:true}));
      __concCandidatas = (pendientes||[]).filter(c =>
        nombres.has(String(c.persona||'').trim().toLowerCase()) &&
        Math.abs(Number(c.monto||0) - f.falta) < 1 &&
        (c.venta_dia_id==null || !ids.includes(c.venta_dia_id))      // que no sea de esta misma venta
      );
    }catch(e){}
    if(__concCandidatas.length){
      html += '<div style="margin-top:14px;font-weight:700">Esto cuadra exacto con lo que falta</div>';
      __concCandidatas.forEach((c,k) => {
        html += '<div style="border:1px solid var(--border);border-radius:10px;padding:10px;margin-top:8px">'
          +'<div><b>'+String(c.persona||'').replace(/</g,'&lt;')+' — $'+num(c.monto)+'</b></div>'
          +'<div style="color:var(--muted);font-size:12px;margin:4px 0 8px">'+String(c.nota||'').replace(/</g,'&lt;')+'</div>'
          +'<button class="primary" style="padding:6px 12px;font-size:13px" onclick="marcarCobradaEnVenta('+k+','+(ids[0]||'null')+')">✓ Se la cobró en esta venta</button>'
          +'</div>';
      });
      html += '<div class="msg" style="margin-top:8px">Si el trabajador se llevó ese dinero el día de esta venta pero no apretó "cobrar", esto lo deja marcado: la deuda queda pagada y el día cuadra. No mueve ni un peso de la caja.</div>';
    }
    if(sinCobrar.length && !__concCandidatas.length){
      html += '<div class="msg" style="margin-top:8px">Si alguna de estas es lo que el trabajador se quedó ese día, el cobro no llegó a marcarse. Suele arreglarse solo cuando su teléfono vuelva a tener internet.</div>';
    }

    html += '<div style="margin-top:14px;font-weight:700">Entradas de caja de ese día ('+entradas.length+')</div>';
    if(entradas.length) entradas.forEach(m => { html += li(String(m.concepto||'(sin concepto)').replace(/</g,'&lt;')+' <span style="color:var(--muted);font-size:12px">'+m.metodo+'</span>', Number(m.monto)); });
    else html += '<div style="color:var(--muted);padding:6px 0">Ninguna.</div>';

    const causa = (f.falta>1 && !comCobradas.length && !otrosCobrados.length && sinCobrar.length)
        ? 'Lo más probable: el trabajador se cobró algo y ese cobro todavía no se marcó.'
        : (f.falta>1 && !comCobradas.length && !otrosCobrados.length && !sinCobrar.length)
        ? 'No hay ningún cobro registrado en esta venta. O el dinero no se entregó, o se entregó y falta su entrada de caja (usa 💵 Registrar).'
        : 'Los cobros de arriba explican parte; el resto es dinero que no llegó a caja.';
    html += '<div class="msg" style="margin-top:14px"><b>Conclusión:</b> '+causa+'</div>';
    html += '</div></div>';
    cont.innerHTML = html;
    cont.scrollIntoView({behavior:'smooth', block:'start'});
  }catch(e){
    if(cont) cont.innerHTML='<div class="card"><div class="msg err">No se pudo: '+((e&&e.message)||e)+'</div><button onclick="cerrarDetalleConc()">Cerrar</button></div>';
  }
}

// Muestra TODAS las entradas de caja de ese puesto y ese día, para encontrar la repetida.
// Es lo que arregla el caso contrario: cuando en caja hay dinero DE MÁS.
async function verCajaDeEseDia(i){
  const f = __concFilas[i];
  if(!f){ alert('No encontré esa fila. Dale a Revisar otra vez.'); return; }
  if(!navigator.onLine){ alert('Necesitas internet.'); return; }
  const cont = document.getElementById('concDetalle');
  if(cont){ cont.innerHTML = '<div class="card">Buscando…</div>'; cont.style.display='block'; }
  try{
    const data = await traerTodasLasFilas(()=> sb.from('caja_movimientos').select('*')
      .eq('almacen_id', f.almacen_id).eq('tipo','ingreso').order('id',{ascending:true}));
    const delDia = (data||[]).filter(m => (m.concepto||'').includes(f.fecha));
    __concCaja = delDia;
    if(!delDia.length){
      cont.innerHTML = '<div class="card"><b>'+f.puesto+' — '+f.fecha+'</b><div class="msg">No encontré entradas de caja de ese día para ese puesto.</div>'
        +'<button onclick="cerrarDetalleConc()">Cerrar</button></div>';
      return;
    }
    // marcar las que se repiten (mismo monto y mismo concepto)
    const cuenta={}; delDia.forEach(m=>{ const k=(m.concepto||'')+'|'+Number(m.monto||0); cuenta[k]=(cuenta[k]||0)+1; });
    const total = delDia.reduce((s,m)=>s+Number(m.monto||0),0);
    cont.innerHTML = '<div class="card">'
      +'<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">'
      +'<b>Entradas de caja — '+String(f.puesto||'').replace(/</g,'&lt;')+' · '+f.fecha+'</b>'
      +'<button onclick="cerrarDetalleConc()">Cerrar</button></div>'
      +'<div class="msg" style="margin-top:8px">Esa venta fue de <b>$'+num(f.venta)+'</b> y en caja hay <b>$'+num(total)+'</b>. '
      +'Sobran <b>$'+num(f.sobra)+'</b>. Busca abajo la línea repetida y bórrala.</div>'
      +'<div style="overflow-x:auto"><table style="min-width:620px"><thead><tr>'
      +'<th>#</th><th>Concepto</th><th>Método</th><th>Categoría</th><th class="numcell">Monto</th><th></th></tr></thead><tbody>'
      + delDia.map(function(m, j){
          const k=(m.concepto||'')+'|'+Number(m.monto||0);
          const rep = cuenta[k] > 1;
          return '<tr'+(rep?' style="background:rgba(255,193,7,0.14)"':'')+'>'
            +'<td>'+m.id+'</td>'
            +'<td>'+String(m.concepto||'').replace(/</g,'&lt;')+(rep?' <b style="color:var(--amber)">· repetida</b>':'')+'</td>'
            +'<td>'+String(m.metodo||'').replace(/</g,'&lt;')+'</td>'
            +'<td>'+String(m.categoria||'').replace(/</g,'&lt;')+'</td>'
            +'<td class="numcell">$'+num(m.monto)+'</td>'
            +'<td><button style="padding:6px 10px;font-size:13px" onclick="borrarEntradaCaja('+j+')">🗑 Borrar</button></td></tr>';
        }).join('')
      +'</tbody></table></div></div>';
    cont.scrollIntoView({behavior:'smooth', block:'start'});
  }catch(e){
    if(cont) cont.innerHTML='<div class="card"><div class="msg err">No se pudo: '+((e&&e.message)||e)+'</div><button onclick="cerrarDetalleConc()">Cerrar</button></div>';
  }
}
function cerrarDetalleConc(){ const c=document.getElementById('concDetalle'); if(c){ c.innerHTML=''; c.style.display='none'; } }
async function borrarEntradaCaja(j){
  const m = __concCaja[j];
  if(!m){ alert('No encontré esa línea.'); return; }
  if(!navigator.onLine){ alert('Necesitas internet.'); return; }
  if(!confirm('¿Borrar esta entrada de caja?\n\n'+(m.concepto||'')+'\n$'+num(m.monto)+'\n\nEsto quita ese dinero de la caja. Hazlo SOLO si está repetida o es un error.')) return;
  try{
    const {error} = await sb.from('caja_movimientos').delete().eq('id', m.id);
    if(error) throw error;
    alert('Borrada. ✓');
    cerrarDetalleConc();
    await cargarConciliacionCaja();
    try{ if(typeof cargarDinero==='function') await cargarDinero(); }catch(e){}
  }catch(e){ alert('No se pudo: '+((e&&e.message)||e)); }
}

function prepararConciliacion(){
  const h=document.getElementById('concHasta'), d=document.getElementById('concDesde');
  if(h && !h.value) h.value = fechaHoyLocal();
  if(d && !d.value){ const x=new Date(Date.now()-30*86400000); d.value = x.toISOString().slice(0,10); }
  cargarConciliacionCaja();
}

// Junta los datos crudos. Lo usa la pantalla y también el aviso automático al dueño.
async function datosConciliacion(desde, hasta){
  let q = sb.from('ventas_dia').select('*').eq('cerrado', true);
  if(desde) q = q.gte('fecha', desde);
  if(hasta) q = q.lte('fecha', hasta);
  const dias = await traerTodasLasFilas(()=> q.order('id',{ascending:true}));   // paginado: .limit(5000) no servía, la base corta en 1000
  if(!dias || !dias.length) return {filas:[]};

  const items = await traerItemsDe(dias.map(d=>d.id), '*');
  const porDia={}; (items||[]).forEach(it=>{ (porDia[it.venta_dia_id]=porDia[it.venta_dia_id]||[]).push(it); });
  // Hay ventas CERRADAS repetidas (la misma venta subida dos veces). Si se cuentan las dos,
  // el "vendió" sale inflado y aparece una diferencia enorme que no existe.
  let diasUsar = dias;
  try{ const r = descartarDiasDuplicados(dias, items||[]); if(r && r.conservados) diasUsar = r.conservados; }catch(e){}

  // Se compara POR PUESTO Y DÍA, no venta por venta. Motivo: las entradas de caja viejas solo
  // dicen "Venta <puesto> - <fecha>", sin decir a cuál venta pertenecen. Si un puesto cerró dos
  // ventas el mismo día, repartirlas una por una es adivinar: a una le sobra dinero y a la otra
  // le falta, y aparecían "ventas sin entrada de caja" que en realidad sí tenían su dinero.
  const diaPorId={}; diasUsar.forEach(d=>{ diaPorId[d.id]=d; });
  const grupos={};
  const grupo=(almacen_id, fecha)=>{
    const k=almacen_id+'|'+fecha;
    if(!grupos[k]) grupos[k]={almacen_id, fecha, venta:0, entro:0, cobrado:0, otros:0, nVentas:0};
    return grupos[k];
  };
  // 1) lo vendido
  diasUsar.forEach(d=>{
    const g=grupo(d.almacen_id, d.fecha||'');
    g.venta += totalRealDeVenta(d, porDia[d.id]||[]);
    g.nVentas++;
  });

  // 2) lo que entró a caja (solo se suma a días que SÍ tienen venta en el rango)
  const caja=[]; { let d0=0; for(;;){ const r=await sb.from('caja_movimientos').select('*')
      .eq('tipo','ingreso').order('id',{ascending:true}).range(d0,d0+999);
    if(r.error) throw r.error; caja.push(...(r.data||[])); if(!r.data||r.data.length<1000) break; d0+=1000; } }
  for(const m of caja){
    if(m.categoria!=='venta') continue;
    const monto=Number(m.monto||0);
    let almId=null, fec=null;
    if(m.venta_dia_id!=null && diaPorId[m.venta_dia_id]){           // entradas nuevas: vínculo exacto
      almId=diaPorId[m.venta_dia_id].almacen_id; fec=diaPorId[m.venta_dia_id].fecha||'';
    } else {                                                         // entradas viejas: por el concepto
      const mm=(m.concepto||'').match(/^Venta\s+(.*?)\s+-\s+(\d{4}-\d{2}-\d{2})$/);
      if(!mm) continue;
      fec=mm[2];
      almId=(m.almacen_id!=null)?m.almacen_id:(((ALMACENES||[]).find(a=>(a.nombre||'').trim()===mm[1].trim())||{}).id);
    }
    if(almId==null||!fec) continue;
    const k=almId+'|'+fec;
    if(grupos[k]) grupos[k].entro += monto;   // si ese día no tiene venta en el rango, se ignora
  }

  // 3) comisiones cobradas dentro de esas ventas
  const deu = await traerTodasLasFilas(()=> sb.from('deudas').select('id, venta_dia_id, pagada, monto, nota, persona, clave_comision').eq('tipo','debo').order('id',{ascending:true}));
  for(const c of (deu||[])){
    if(!c.pagada || c.venta_dia_id==null) continue;
    if(!(c.nota||'').includes('Comisi')) continue;
    const d=diaPorId[c.venta_dia_id]; if(!d) continue;
    // IMPORTANTE: aquí solo cuentan las comisiones que el trabajador se COBRÓ de la venta
    // (se quedó con ese efectivo en vez de entregarlo). Las que pagó el dueño aparte, en
    // efectivo, NO reducen lo que entró a caja ese día y no deben contarse: si se cuentan,
    // sale un "sin explicar" NEGATIVO, que es imposible.
    // Cómo se distinguen: la clave 'comvta-<venta>' dice en qué venta se GANÓ. Si la comisión
    // sigue apuntando a su propia venta, no se cobró de ninguna otra: se pagó por otra vía.
    const mOrig=(c.clave_comision||'').match(/^comvta-(.+)$/);
    if(mOrig && String(c.venta_dia_id)===String(mOrig[1])) continue;
    if(!mOrig){
      // Comisiones viejas sin clave: si la nota dice la MISMA fecha de esta venta, es su
      // propia comisión (no un cobro hecho dentro de ella).
      const mf=(c.nota||'').match(/venta del (\d{4}-\d{2}-\d{2})/);
      if(mf && mf[1]===(d.fecha||'')) continue;
    }
    const k=d.almacen_id+'|'+(d.fecha||'');
    if(grupos[k]) grupos[k].cobrado += Number(c.monto||0);
  }

  // 3b) OTROS COBROS dentro de esas ventas (no son comisión).
  // Al cerrar el día, el vendedor entrega la venta MENOS todo lo que se cobró, y eso puede
  // incluir deudas que no son comisión (un adelanto, un préstamo, un pago que el dueño le debía).
  // Antes esto no se contaba y el día salía como "falta dinero" sin faltar nada.
  for(const c of (deu||[])){
    if(!c.pagada || c.venta_dia_id==null) continue;
    if((c.nota||'').includes('Comisi') || c.clave_comision) continue;   // las comisiones ya se contaron arriba
    const d=diaPorId[c.venta_dia_id]; if(!d) continue;
    const k=d.almacen_id+'|'+(d.fecha||'');
    if(grupos[k]) grupos[k].otros += Number(c.monto||0);
  }

  const filas=Object.values(grupos).map(g=>{
    const alm=(ALMACENES||[]).find(a=>a.id===g.almacen_id);
    const dif=Math.round((g.venta-g.entro)*100)/100;
    // TOPE: de un día solo se puede haber cobrado, en efectivo de ESE día, como máximo
    // lo que falta de ese día. Si la comisión que aparece es mayor, el resto se pagó por
    // otra vía (el dueño se la pagó aparte) y NO sale del dinero de esta venta. Sin este
    // tope salía un "sin explicar" NEGATIVO, que no existe en la vida real.
    const cobradoDeAqui = Math.min(g.cobrado, Math.max(0, dif));
    const cobradoAparte = Math.round((g.cobrado - cobradoDeAqui)*100)/100;
    // Después de la comisión, lo que quede del hueco lo pueden explicar los otros cobros
    // (adelantos, préstamos, pagos que el dueño le debía). También salen del dinero de esa venta.
    const restaTrasComision = Math.max(0, dif - cobradoDeAqui);
    const otrosDeAqui = Math.round(Math.min(g.otros||0, restaTrasComision)*100)/100;
    const sinExplicar=Math.round((dif-cobradoDeAqui-otrosDeAqui)*100)/100;
    return {fecha:g.fecha, almacen_id:g.almacen_id, puesto: alm?alm.nombre:('#'+g.almacen_id), nVentas:g.nVentas,
            venta:g.venta, entro:g.entro, cobrado:cobradoDeAqui, cobradoAparte, otros:otrosDeAqui, dif, sinExplicar,
            falta: sinExplicar > 1 ? sinExplicar : 0,          // dinero que NO entró
            sobra: sinExplicar < -1 ? -sinExplicar : 0,        // entró de MÁS
            sinCaja: (g.entro===0 && g.venta>0)};
  });
  filas.sort((a,b)=> (b.fecha||'').localeCompare(a.fecha||'') || a.puesto.localeCompare(b.puesto));
  return {filas};
}

async function cargarConciliacionCaja(){
  const msg=document.getElementById('concMsg'), res=document.getElementById('concResumen'), body=document.getElementById('concBody');
  msg.textContent='Revisando…'; msg.className='msg'; res.innerHTML=''; body.innerHTML='';
  try{ cerrarDetalleConc(); }catch(e){}
  if(!navigator.onLine){ msg.textContent='Necesitas internet.'; msg.className='msg err'; return; }
  try{
    const desde=document.getElementById('concDesde').value, hasta=document.getElementById('concHasta').value;
    const {filas} = await datosConciliacion(desde, hasta);
    if(!filas.length){ msg.textContent='No hay ventas cerradas en ese rango.'; return; }
    const tVenta=filas.reduce((s,f)=>s+f.venta,0), tEntro=filas.reduce((s,f)=>s+f.entro,0);
    const tCobrado=filas.reduce((s,f)=>s+f.cobrado,0), tDif=Math.round((tVenta-tEntro)*100)/100;
    const tFalta=Math.round(filas.reduce((s,f)=>s+f.falta,0)*100)/100;
    const tSobra=Math.round(filas.reduce((s,f)=>s+f.sobra,0)*100)/100;
    const sinCaja=filas.filter(f=>f.sinCaja);
    const totalSinCaja=sinCaja.reduce((s,f)=>s+f.venta,0);
    const nFalta=filas.filter(f=>f.falta>0).length, nSobra=filas.filter(f=>f.sobra>0).length;
    msg.textContent=''; msg.className='msg';
    res.innerHTML='<div class="card"><div style="display:flex;gap:20px;flex-wrap:wrap">'
      +'<div><div style="color:var(--muted);font-size:12px">Se vendió</div><div style="font-size:21px;font-weight:800">$'+num(tVenta)+'</div></div>'
      +'<div><div style="color:var(--muted);font-size:12px">Entró a caja</div><div style="font-size:21px;font-weight:800">$'+num(tEntro)+'</div></div>'
      +'<div><div style="color:var(--muted);font-size:12px">Diferencia</div><div style="font-size:21px;font-weight:800;color:var(--amber)">$'+num(tDif)+'</div></div>'
      +'<div><div style="color:var(--muted);font-size:12px">Comisiones cobradas</div><div style="font-size:21px;font-weight:800;color:var(--green)">$'+num(tCobrado)+'</div></div>'
      +'<div><div style="color:var(--muted);font-size:12px">Falta por entrar</div><div style="font-size:21px;font-weight:800;color:'+(tFalta>1?'var(--red)':'var(--muted)')+'">$'+num(tFalta)+'</div></div>'
      +'<div><div style="color:var(--muted);font-size:12px">Entró de más</div><div style="font-size:21px;font-weight:800;color:'+(tSobra>1?'var(--amber)':'var(--muted)')+'">$'+num(tSobra)+'</div></div>'
      +'</div>'
      +'<div style="margin-top:10px;color:var(--muted);font-size:12px;line-height:1.5">'
        +'Se vendió − Entró a caja = Diferencia. De esa diferencia, lo que los trabajadores se cobraron de comisión está explicado. '
        +'Lo que sobra de ahí es <b>Falta por entrar</b> (dinero vendido que nunca llegó a caja). '
        +'<b>Entró de más</b> es lo contrario: caja tiene más de lo que esa venta justifica.'
      +'</div>'
      +(sinCaja.length
        ? '<div class="msg err" style="margin-top:12px">⚠️ Hay '+sinCaja.length+' venta(s) por $'+num(totalSinCaja)+' que NO tienen NINGUNA entrada de caja. Salen primero en la lista.</div>'
        : (tFalta>1
          ? '<div class="msg err" style="margin-top:12px">⚠️ Hay '+nFalta+' día(s) donde falta dinero por entrar ($'+num(tFalta)+' en total). Usa el botón 💵 Registrar en esas filas, SOLO si el dinero sí se entregó.</div>'
          : '<div class="msg ok" style="margin-top:12px">✓ No falta dinero por entrar.</div>'))
      +(tSobra>1
        ? '<div class="msg" style="margin-top:8px;background:rgba(255,193,7,0.12)">ℹ️ Hay '+nSobra+' día(s) con $'+num(tSobra)+' de más en caja. Eso NO se arregla con el botón (meter más dinero lo empeora). Casi siempre es un ingreso escrito dos veces o un sobrante metido como venta: búscalo en Caja ese día y bórralo.</div>'
        : '')
      +'</div>';
    const orden=[...filas].sort((a,b)=> (b.sinCaja?1:0)-(a.sinCaja?1:0) || (b.falta-a.falta) || (b.sobra-a.sobra));
    __concFilas = orden;   // se guardan para poder arreglar una fila con un botón
    body.innerHTML='<div class="card"><div style="overflow-x:auto"><table style="min-width:760px">'
      +'<thead><tr><th>Fecha</th><th>Puesto</th><th class="numcell">Ventas</th><th class="numcell">Vendió</th><th class="numcell">Entró a caja</th><th class="numcell">Diferencia</th><th class="numcell">Comisión cobrada</th><th class="numcell">Otros cobros</th><th class="numcell">Falta</th><th class="numcell">Sobra</th><th>Estado</th><th></th></tr></thead><tbody>'
      +orden.map(function(f,i){
        const estado = f.sinCaja ? '<span style="color:var(--red);font-weight:700">⚠ Sin entrada de caja</span>'
                      : (f.falta>1 ? '<span style="color:var(--red);font-weight:700">Falta dinero</span>'
                      : (f.sobra>1 ? '<span style="color:var(--amber)">Entró de más</span>'
                      : '<span style="color:var(--green)">✓ Cuadra</span>'));
        return '<tr'+(f.sinCaja?' style="background:rgba(220,53,69,0.10)"':(f.sobra>1?' style="background:rgba(255,193,7,0.08)"':''))+'>'
          +'<td>'+f.fecha+'</td><td>'+String(f.puesto||'').replace(/</g,'&lt;')+'</td>'
          +'<td class="numcell">'+f.nVentas+'</td>'
          +'<td class="numcell">$'+num(f.venta)+'</td><td class="numcell">$'+num(f.entro)+'</td>'
          +'<td class="numcell">$'+num(f.dif)+'</td>'
          +'<td class="numcell">$'+num(f.cobrado)+(f.cobradoAparte>1?'<div style="color:var(--muted);font-size:11px">+$'+num(f.cobradoAparte)+' pagada aparte</div>':'')+'</td>'
          +'<td class="numcell">'+(f.otros>1?'$'+num(f.otros):'—')+'</td>'
          +'<td class="numcell">'+(f.falta>1?'<b style="color:var(--red)">$'+num(f.falta)+'</b>':'—')+'</td>'
          +'<td class="numcell">'+(f.sobra>1?'<b style="color:var(--amber)">$'+num(f.sobra)+'</b>':'—')+'</td>'
          +'<td>'+estado+'</td>'
          +'<td>'+(f.falta>1
              ? '<button class="ghost" style="padding:6px 10px;font-size:13px;white-space:nowrap;margin-right:6px" onclick="porQueFalta('+i+')">❓ ¿Por qué?</button>'
                +'<button class="primary" style="padding:6px 12px;font-size:13px;white-space:nowrap" onclick="registrarDineroFaltante('+i+')">💵 Registrar</button>'
              : (f.sobra>1
                ? '<button style="padding:6px 12px;font-size:13px;white-space:nowrap" onclick="verCajaDeEseDia('+i+')">🔎 Ver caja</button>'
                : ''))+'</td></tr>';
      }).join('')
      +'</tbody></table></div></div>';
  }catch(e){ msg.textContent='No se pudo revisar: '+(e.message||e); msg.className='msg err'; }
}

// AVISO AUTOMÁTICO AL DUEÑO/ADMIN al abrir la app: ventas sin dinero registrado y
// ventas de días pasados que quedaron abiertas. Antes esto solo se veía auditando a mano.
// REPARACIÓN AUTOMÁTICA DE COBROS QUE NO SE MARCARON.
// Huella inconfundible: una venta cerrada a la que le falta dinero, y una deuda pendiente
// de ESE mismo puesto por EXACTAMENTE esa cantidad. Eso solo pasa cuando el trabajador se
// cobró su deuda dentro de la venta (por eso entregó de menos) y el marcado no llegó a
// guardarse. El dinero no se perdió: solo faltaba dejarlo escrito.
// Solo se repara cuando NO hay duda: una sola deuda candidata y el monto calza al peso.
async function repararCobrosSinMarcar(filas){
  const arreglados=[], dudosos=[];
  const conFalta=(filas||[]).filter(f=>f.falta>1);
  if(!conFalta.length) return {arreglados, dudosos};
  const pendientes = await traerTodasLasFilas(()=> sb.from('deudas').select('*')
    .eq('tipo','debo').eq('pagada', false).order('id',{ascending:true}));
  const usadas=new Set();
  for(const f of conFalta){
    // las ventas de ese puesto ese día (para vincular y para saber a nombre de quién cobra)
    const dias = await traerTodasLasFilas(()=> sb.from('ventas_dia').select('*')
      .eq('almacen_id', f.almacen_id).eq('fecha', f.fecha).eq('cerrado', true).order('id',{ascending:true}));
    if(!dias.length) continue;
    const ids=dias.map(d=>d.id);
    const nombres=new Set([String(f.puesto||'').trim().toLowerCase()]);
    dias.forEach(d=>{ if(d.cobra_comision) nombres.add(String(d.cobra_comision).trim().toLowerCase()); });
    const calzan=(pendientes||[]).filter(c =>
      !usadas.has(c.id) &&
      nombres.has(String(c.persona||'').trim().toLowerCase()) &&
      Math.abs(Number(c.monto||0) - f.falta) < 1 &&
      (c.venta_dia_id==null || !ids.includes(c.venta_dia_id)));
    if(calzan.length===1){
      const c=calzan[0];
      const ok=await marcarCobroConReintento(c.id, ids[0]);
      if(ok){ usadas.add(c.id); arreglados.push({puesto:f.puesto, fecha:f.fecha, persona:c.persona, monto:Number(c.monto)}); }
      else dudosos.push({puesto:f.puesto, fecha:f.fecha, monto:f.falta, motivo:'no se pudo guardar'});
    } else if(calzan.length>1){
      dudosos.push({puesto:f.puesto, fecha:f.fecha, monto:f.falta, motivo:'hay '+calzan.length+' deudas que calzan'});
    } else {
      dudosos.push({puesto:f.puesto, fecha:f.fecha, monto:f.falta, motivo:'ninguna deuda calza'});
    }
  }
  return {arreglados, dudosos};
}

async function revisarCajaAuto(){
  try{
    if(!navigator.onLine || typeof sb==='undefined' || !sb) return;
    if(!usuarioActual || usuarioActual.rol!=='dueno') return;   // la conciliación de caja es SOLO del dueño
    try{ if(sessionStorage.getItem('caja_auto_revisado')) return; }catch(e){}
    const desde = new Date(Date.now()-60*86400000).toISOString().slice(0,10);
    const avisos=[];

    // 1) Ventas cerradas SIN ninguna entrada de caja (el fallo del P 110 del 26-oct).
    let sinCaja=[];
    try{
      let {filas} = await datosConciliacion(desde, null);
      // ANTES de avisar de nada: reparar los cobros que el trabajador hizo pero que no
      // llegaron a marcarse. Eso quita de la lista los días que "faltan" sin faltar nada.
      try{
        const rep = await repararCobrosSinMarcar(filas);
        if(rep.arreglados.length){
          const tot=rep.arreglados.reduce((s,a)=>s+a.monto,0);
          avisos.push('✅ Se repararon solos '+rep.arreglados.length+' cobro(s) por $'+num(tot)+' que el trabajador sí se llevó pero no habían quedado marcados:');
          rep.arreglados.slice(0,6).forEach(a=> avisos.push('     • '+a.persona+' — $'+num(a.monto)+' (venta de '+a.puesto+' del '+a.fecha+')'));
          if(rep.arreglados.length>6) avisos.push('     • …y '+(rep.arreglados.length-6)+' más');
          const r2 = await datosConciliacion(desde, null);   // volver a mirar ya reparado
          filas = r2.filas;
        }
        const quedan = rep.dudosos.filter(d=>d.motivo!=='ninguna deuda calza');
        if(quedan.length) avisos.push('• '+quedan.length+' día(s) con dinero faltante que NO reparé solo (menú → ⚖️ Conciliación → ❓ ¿Por qué?)');
      }catch(e){}
      const faltantes = filas.filter(f=>f.falta>1);
      if(faltantes.length){
        const tot=faltantes.reduce((s,f)=>s+f.falta,0);
        avisos.push('• '+faltantes.length+' día(s) con $'+num(tot)+' de dinero que no llegó a caja (menú → ⚖️ Conciliación)');
      }
      sinCaja = filas.filter(f=>f.sinCaja);
    }catch(e){}
    if(sinCaja.length){
      const tot=sinCaja.reduce((s,f)=>s+f.venta,0);
      avisos.push('• '+sinCaja.length+' venta(s) por $'+num(tot)+' SIN entrada de caja (menú → ⚖️ Conciliación)');
      const b=document.getElementById('tabBtnConciliacion');
      if(b) b.innerHTML='⚖️ Conciliación <span style="background:var(--red);color:#fff;border-radius:10px;padding:1px 7px;font-size:11px;font-weight:700">'+sinCaja.length+'</span>';
    }

    // 2) Ventas de días ANTERIORES que quedaron abiertas (nunca se cierran solas).
    try{
      const hoy = fechaHoyLocal();
      const {data: abiertas} = await sb.from('ventas_dia').select('id, fecha, almacen_id, total')
        .eq('cerrado', false).gte('fecha', desde).lt('fecha', hoy).limit(500);
      const conImporte=(abiertas||[]).filter(d=>Number(d.total||0)>0);
      if(conImporte.length){
        const tot=conImporte.reduce((s,d)=>s+Number(d.total||0),0);
        avisos.push('• '+conImporte.length+' venta(s) de días pasados quedaron SIN finalizar, por $'+num(tot)+' (menú → 🗂️ Ventas registradas)');
      }
    }catch(e){}

    try{ sessionStorage.setItem('caja_auto_revisado','1'); }catch(e){}
    if(avisos.length) alert('⚠️ Revisa esto:\n\n'+avisos.join('\n'));
  }catch(e){ /* nunca debe estorbar el arranque */ }
}

// RED DE SEGURIDAD: la cola de reintentos de comisiones vive en el teléfono de la vendedora.
// Si ese teléfono se limpia, se reinstala la app o se cambia de celular, una comisión
// pendiente se perdería sin que nadie se entere. Por eso, al abrir, el dueño/admin revisa
// solo (contra el servidor) si falta alguna comisión de los últimos 60 días, y avisa.
// Crea la comisión de UNA venta a partir de lo que ya está en la base. No usa el
// teléfono del vendedor para nada: con la venta y sus artículos alcanza. Devuelve
// 'creada', 'ya_existia', 'sin_ganancia' o 'dudosa' (ya hay una de esa persona y fecha).
// Es idempotente: llamarla dos veces no crea dos comisiones.
async function crearComisionDeVenta(dia, itemsDia, comisionesExistentes){
  const reales = itemsRealesDeVenta(itemsDia||[], dia.total);
  const ganancia = reales.reduce((s,it)=> s + Number(it.cantidad)*(Number(it.precio_venta)-Number(it.costo)), 0);
  if(ganancia <= 0) return {estado:'sin_ganancia'};

  const claveVta = 'comvta-' + (dia.clave_local || dia.id);
  const alm = (ALMACENES||[]).find(a=>a.id===dia.almacen_id);
  const puesto = alm ? alm.nombre : ('#'+dia.almacen_id);
  const quienCobra = (dia.cobra_comision || puesto);

  // ¿ya está? por clave, por vínculo a la venta, o por persona+fecha
  const lista = comisionesExistentes || await traerTodasLasFilas(()=> sb.from('deudas')
      .select('id, venta_dia_id, clave_comision, nota, persona, monto').eq('tipo','debo').order('id',{ascending:true}));
  const esCom = c => (c.nota||'').includes('Comisión 15%');
  if((lista||[]).some(c => c.clave_comision===claveVta)) return {estado:'ya_existia'};
  if((lista||[]).some(c => esCom(c) && String(c.venta_dia_id)===String(dia.id))) return {estado:'ya_existia'};
  const mismaPersonaFecha = (lista||[]).filter(c => esCom(c)
      && (c.persona||'').trim().toLowerCase() === String(quienCobra).trim().toLowerCase()
      && (c.nota||'').includes('venta del '+dia.fecha));
  // Ojo: si esa persona ya tiene una comisión de ESA fecha pero de OTRA venta, no se crea
  // sola — se le deja al dueño para que decida, para no pagar doble por error.
  if(mismaPersonaFecha.length>0) return {estado:'dudosa', persona:quienCobra, monto:Number(mismaPersonaFecha[0].monto||0)};

  const comision = redondearComision(ganancia*0.15);
  const filaCom = {
    tipo:'debo', persona: quienCobra, monto: comision,
    nota: `Comisión 15% de ganancia ($${num(ganancia)}) - venta del ${dia.fecha} (recuperada automáticamente)`,
    clave_comision: claveVta, venta_dia_id: dia.id, creado_en: dia.fecha + 'T12:00:00'
  };
  let r = await sb.from('deudas').insert(filaCom);
  if(r.error){
    const m = (r.error.message||'').toLowerCase();
    if(m.includes('duplicate') || m.includes('unique')) return {estado:'ya_existia'};
    if(m.includes('clave_comision') || m.includes('creado_en') || m.includes('column')){
      const base = Object.assign({}, filaCom); delete base.clave_comision;
      let r2 = await sb.from('deudas').insert(base);
      if(r2.error && ((r2.error.message||'').toLowerCase().includes('creado_en')||(r2.error.message||'').toLowerCase().includes('column'))){
        delete base.creado_en; r2 = await sb.from('deudas').insert(base);
      }
      if(r2.error) throw r2.error;
    } else throw r.error;
  }
  return {estado:'creada', persona:quienCobra, monto:comision, fecha:dia.fecha, puesto};
}

async function revisarComisionesAuto(){
  try{
    if(!navigator.onLine || typeof sb==='undefined' || !sb) return;
    if(!usuarioActual || (usuarioActual.rol!=='dueno' && usuarioActual.rol!=='administrador')) return;
    try{ if(sessionStorage.getItem('com_auto_revisado')) return; }catch(e){}
    const desde = new Date(Date.now()-60*86400000).toISOString().slice(0,10);
    const dias = await traerTodasLasFilas(()=> sb.from('ventas_dia').select('*').eq('cerrado',true).gte('fecha',desde).order('id',{ascending:true}));
    if(!dias || !dias.length) return;
    const items = await traerItemsDe(dias.map(d=>d.id), '*');
    const porDia={}; (items||[]).forEach(it=>{ (porDia[it.venta_dia_id]=porDia[it.venta_dia_id]||[]).push(it); });
    const comis = await traerTodasLasFilas(()=> sb.from('deudas').select('id, venta_dia_id, clave_comision, nota, persona').eq('tipo','debo').order('id',{ascending:true}));
    const porVenta=new Set(), porClave=new Set(), porPersonaFecha=new Set();
    (comis||[]).forEach(c=>{
      if(c.venta_dia_id!=null && (c.nota||'').includes('Comisión 15%')) porVenta.add(c.venta_dia_id);
      if(c.clave_comision) porClave.add(c.clave_comision);
      if((c.nota||'').includes('Comisión 15%')){ const mf=(c.nota||'').match(/venta del (\d{4}-\d{2}-\d{2})/); if(mf) porPersonaFecha.add(((c.persona||'').trim().toLowerCase())+'|'+mf[1]); }
    });
    // Las que falten se GENERAN aquí mismo. Antes solo se avisaba, y la comisión dependía
    // de que el teléfono del vendedor lograra crearla: si ahí fallaba y la cola no se
    // vaciaba, el salario se perdía hasta que alguien lo buscara a mano. La venta y sus
    // artículos ya están en la base, así que cualquier equipo puede rehacerla.
    const faltantes=[];
    for(const d of dias){
      const reales=itemsRealesDeVenta(porDia[d.id]||[], d.total);
      const g=reales.reduce((s,it)=>s+Number(it.cantidad)*(Number(it.precio_venta)-Number(it.costo)),0);
      if(g<=0) continue;
      const alm=(ALMACENES||[]).find(a=>a.id===d.almacen_id);
      const quien=(d.cobra_comision||(alm?alm.nombre:'')||'').trim().toLowerCase();
      if(porVenta.has(d.id) || porClave.has('comvta-'+(d.clave_local||d.id)) || porPersonaFecha.has(quien+'|'+d.fecha)) continue;
      faltantes.push(d);
    }
    try{ sessionStorage.setItem('com_auto_revisado','1'); }catch(e){}
    if(!faltantes.length) return;

    const creadas=[], dudosas=[], fallidas=[];
    for(const d of faltantes){
      try{
        const r = await crearComisionDeVenta(d, porDia[d.id]||[], comis);
        if(r.estado==='creada'){ creadas.push(r); comis.push({tipo:'debo', persona:r.persona, monto:r.monto, venta_dia_id:d.id, clave_comision:'comvta-'+(d.clave_local||d.id), nota:'Comisión 15% de ganancia - venta del '+d.fecha}); }
        else if(r.estado==='dudosa') dudosas.push({d, r});
      }catch(e){ fallidas.push({d, motivo:(e&&e.message)||String(e)}); }
    }

    const b=document.getElementById('tabBtnVentasVendedor');
    if((dudosas.length+fallidas.length)>0 && b){
      b.innerHTML='🧾 Ventas por vendedor <span style="background:var(--red);color:#fff;border-radius:10px;padding:1px 7px;font-size:11px;font-weight:700">'+(dudosas.length+fallidas.length)+'</span>';
    }
    let aviso='';
    if(creadas.length){
      const total=creadas.reduce((s,c)=>s+Number(c.monto||0),0);
      aviso += '✅ Se recuperaron '+creadas.length+' comisión(es) que no se habían generado, por $'+num(total)+':\n'
            + creadas.slice(0,8).map(c=>'   • '+c.persona+' — $'+num(c.monto)+' (venta del '+c.fecha+')').join('\n')
            + (creadas.length>8 ? '\n   • …y '+(creadas.length-8)+' más' : '')
            + '\n\nYa están en Deudas, listas para cobrar.';
    }
    if(dudosas.length || fallidas.length){
      if(aviso) aviso += '\n\n';
      aviso += '⚠️ Quedan '+(dudosas.length+fallidas.length)+' que NO generé solo, para no pagar doble.\n'
            + 'Menú → "Ventas por vendedor" → abajo: "Recuperar comisiones que faltan".';
    }
    if(aviso) alert(aviso);
  }catch(e){ /* nunca debe estorbar el arranque */ }
}

async function revisarComisionesFaltantes(){
  const msgEl = document.getElementById('comFaltMsg');
  const bodyEl = document.getElementById('comFaltBody');
  const desde = document.getElementById('comFaltDesde').value;
  const hasta = document.getElementById('comFaltHasta').value;
  msgEl.textContent = 'Revisando ventas y comisiones…'; msgEl.className = 'msg'; bodyEl.innerHTML = '';
  try{
    let q = sb.from('ventas_dia').select('*').eq('cerrado', true);
    if(desde) q = q.gte('fecha', desde);
    if(hasta) q = q.lte('fecha', hasta);
    const dias = await traerTodasLasFilas(()=> q.order('id',{ascending:true}));   // paginado: .limit(3000) no servía, la base corta en 1000
    if(!dias || dias.length===0){ msgEl.textContent='No hay ventas cerradas en ese rango.'; return; }

    const ids = dias.map(d=>d.id);
    const items = await traerItemsDe(ids, '*');
    const itemsPorDia = {};
    for(const it of (items||[])){ (itemsPorDia[it.venta_dia_id]=itemsPorDia[it.venta_dia_id]||[]).push(it); }

    // Todas las comisiones de vendedor existentes (por vínculo a la venta y por clave)
    const comis = await traerTodasLasFilas(()=> sb.from('deudas').select('id, venta_dia_id, clave_comision, nota, monto, persona').eq('tipo','debo').order('id',{ascending:true}));
    const comisionPorVenta = new Set();
    const comisionPorClave = new Set();
    const comisionPorPersonaFecha = new Set(); // respaldo: comisiones viejas o sin vínculo
    for(const c of (comis||[])){
      if(c.venta_dia_id!=null && (c.nota||'').includes('Comisión 15%')) comisionPorVenta.add(c.venta_dia_id);
      if(c.clave_comision) comisionPorClave.add(c.clave_comision);
      if((c.nota||'').includes('Comisión 15%')){
        const mf=(c.nota||'').match(/venta del (\d{4}-\d{2}-\d{2})/);
        if(mf) comisionPorPersonaFecha.add(((c.persona||'').trim().toLowerCase())+'|'+mf[1]);
      }
    }

    const faltantes = [];
    for(const d of dias){
      const reales = itemsRealesDeVenta(itemsPorDia[d.id]||[], d.total);
      const ganancia = reales.reduce((s,it)=> s + Number(it.cantidad)*(Number(it.precio_venta)-Number(it.costo)), 0);
      if(ganancia <= 0) continue; // sin ganancia no corresponde comisión
      const claveVta = 'comvta-' + (d.clave_local || d.id);
      const alm = ALMACENES.find(a=>a.id===d.almacen_id);
      const puesto = alm?alm.nombre:('#'+d.almacen_id);
      const quien = (d.cobra_comision || puesto || '').trim().toLowerCase();
      const tiene = comisionPorVenta.has(d.id)
                 || comisionPorClave.has(claveVta)
                 || comisionPorPersonaFecha.has(quien+'|'+d.fecha); // ya existe una de esa persona y fecha
      if(!tiene){
        faltantes.push({dia:d, ganancia, comision: redondearComision(ganancia*0.15), puesto});
      }
    }

    if(faltantes.length===0){ msgEl.textContent='✓ Todas las ventas con ganancia tienen su comisión. No falta ninguna.'; msgEl.className='msg ok'; return; }

    faltantes.sort((a,b)=> (b.dia.fecha||'').localeCompare(a.dia.fecha||''));
    msgEl.textContent = `Se encontraron ${faltantes.length} venta(s) SIN comisión generada. Revísalas y genera la que corresponda.`;
    msgEl.className='msg err';
    bodyEl.innerHTML = `<table>
      <thead><tr><th>Fecha</th><th>Puesto</th><th class="numcell">Ganancia</th><th class="numcell">Comisión</th><th></th></tr></thead>
      <tbody>${faltantes.map(f=>`<tr>
        <td>${f.dia.fecha}</td>
        <td>${f.puesto}</td>
        <td class="numcell">$${num(f.ganancia)}</td>
        <td class="numcell">$${num(f.comision)}</td>
        <td><button class="primary" style="padding:6px 12px; font-size:13px" onclick="generarComisionFaltante(${f.dia.id})">Generar</button></td>
      </tr>`).join('')}</tbody>
    </table>`;
  }catch(err){
    msgEl.textContent='No se pudo revisar: ' + (err.message||err); msgEl.className='msg err';
  }
}

// Genera la comisión que faltaba para un día de venta concreto (con candado para no crearla doble).
async function generarComisionFaltante(ventaDiaId){
  const msgEl = document.getElementById('comFaltMsg');
  try{
    const {data: dia} = await sb.from('ventas_dia').select('*').eq('id', ventaDiaId).maybeSingle();
    if(!dia){ alert('No se encontró la venta.'); return; }
    const {data: itemsDia} = await sb.from('venta_items').select('*').eq('venta_dia_id', ventaDiaId);
    const reales = itemsRealesDeVenta(itemsDia||[], dia.total);
    const ganancia = reales.reduce((s,it)=> s + Number(it.cantidad)*(Number(it.precio_venta)-Number(it.costo)), 0);
    if(ganancia <= 0){ alert('Esta venta no tiene ganancia positiva, no corresponde comisión.'); return; }

    const claveVta = 'comvta-' + (dia.clave_local || dia.id);
    try{
      const {data: ya} = await sb.from('deudas').select('id').eq('clave_comision', claveVta);
      if(ya && ya.length>0){ msgEl.textContent='Esa comisión ya existía.'; msgEl.className='msg ok'; await revisarComisionesFaltantes(); return; }
    }catch(e){}

    const alm = ALMACENES.find(a=>a.id===dia.almacen_id);
    const puesto = alm?alm.nombre:('#'+dia.almacen_id);
    const quienCobra = (dia.cobra_comision || puesto);
    // PROTECCIÓN EXTRA: ¿ya hay una comisión de ESA persona y ESA fecha (aunque sin vínculo)?
    // Evita pagar dos veces cuando la comisión vieja se guardó sin clave.
    try{
      const mismas = await traerTodasLasFilas(()=> sb.from('deudas').select('id,nota,monto').eq('tipo','debo').eq('persona', quienCobra).order('id',{ascending:true}));
      const yaFecha = (mismas||[]).filter(c=>(c.nota||'').includes('Comisión 15%') && (c.nota||'').includes('venta del '+dia.fecha));
      if(yaFecha.length>0){
        const seguir = confirm('⚠️ OJO: '+quienCobra+' YA tiene una comisión registrada de la venta del '+dia.fecha+' (por $'+num(yaFecha[0].monto)+').\n\nSi generas otra, se le pagaría DOBLE.\n\n¿Seguro que quieres generarla de todos modos?');
        if(!seguir){ msgEl.textContent='No se generó (ya existía una de esa fecha).'; msgEl.className='msg'; await revisarComisionesFaltantes(); return; }
      }
    }catch(e){}

    const comision = redondearComision(ganancia*0.15);
    const filaCom = {
      tipo:'debo', persona: (dia.cobra_comision || puesto), monto: comision,
      nota: `Comisión 15% de ganancia ($${num(ganancia)}) - venta del ${dia.fecha} (generada al revisar comisiones faltantes)`,
      clave_comision: claveVta, venta_dia_id: ventaDiaId, creado_en: dia.fecha + 'T12:00:00'
    };
    let r = await sb.from('deudas').insert(filaCom);
    if(r.error){
      const m = (r.error.message||'').toLowerCase();
      if(m.includes('clave_comision') || m.includes('creado_en') || m.includes('column')){
        const base = Object.assign({}, filaCom); delete base.clave_comision;
        let r2 = await sb.from('deudas').insert(base);
        if(r2.error && ((r2.error.message||'').toLowerCase().includes('creado_en')||(r2.error.message||'').toLowerCase().includes('column'))){
          delete base.creado_en; r2 = await sb.from('deudas').insert(base);
        }
        if(r2.error) throw r2.error;
      } else throw r.error;
    }
    msgEl.textContent = `Comisión de $${num(comision)} generada para ${puesto} (venta del ${dia.fecha}).`; msgEl.className='msg ok';
    await revisarComisionesFaltantes();
  }catch(err){
    alert('No se pudo generar: ' + (err.message||err));
  }
}

async function calcularComisionAdmin(){
  const resEl = document.getElementById('comisionAdminResultado');
  const msgEl = document.getElementById('comisionAdminMsg');
  msgEl.textContent = ''; msgEl.className = 'msg';
  const fecha = document.getElementById('comisionAdminFecha').value;
  if(!fecha){ msgEl.textContent = 'Elige una fecha.'; msgEl.className = 'msg err'; return; }

  try{
    const {data: dias, error: e1} = await sb.from('ventas_dia').select('id, almacen_id, total').eq('fecha', fecha).eq('cerrado', true);
    if(e1) throw e1;
    if(!dias || dias.length===0){
      resEl.innerHTML = '';
      msgEl.textContent = `No hay ningún día de venta cerrado el ${fecha} en ningún puesto.`; msgEl.className = 'msg err';
      return;
    }

    const idsDias = dias.map(d=>d.id);
    const items = await traerItemsDe(idsDias, 'venta_dia_id, cantidad, precio_venta, costo, producto_id'); const e2 = null;
    if(e2) throw e2;

    // Una venta que NUNCA descontó inventario (sin movimientos) no es una venta real: puede ser
    // un carrito que quedó marcado como cerrado por error. No se cobra comisión sobre eso.
    // (paginado: no se queda corto en el corte de 1000 filas, que haría pagar comisión de menos).
    let idsQueDescontaron = new Set();
    let pudoVerificar = true;
    try{
      idsQueDescontaron = await idsConMovimiento(idsDias);
    }catch(e){ pudoVerificar = false; }
    const diasReales = pudoVerificar ? dias.filter(d => idsQueDescontaron.has(d.id)) : dias;
    const ignoradasSinMov = dias.length - diasReales.length;

    // Quitar días duplicados idénticos (copias del mismo cierre) para no contar la venta varias veces
    const {conservados: diasSinRepes, descartados: diasRepetidos} = descartarDiasDuplicados(diasReales, items||[]);

    // Si cambiamos de fecha, se limpian las exclusiones anteriores
    if(fechaComisionActual !== fecha){ diasExcluidosComision = new Set(); fechaComisionActual = fecha; }

    // El dueño puede haber quitado a mano alguna venta de este cálculo
    const diasBuenos = diasSinRepes.filter(d => !diasExcluidosComision.has(Number(d.id)));
    const diasQuitados = diasSinRepes.filter(d => diasExcluidosComision.has(Number(d.id)));
    const idsBuenos = new Set(diasBuenos.map(d=>d.id));

    // Agrupamos los venta_items por día para poder limpiarlos de duplicados (contra el total).
    const itemsPorDiaAdmin = {};
    for(const it of (items||[])){ (itemsPorDiaAdmin[it.venta_dia_id] = itemsPorDiaAdmin[it.venta_dia_id]||[]).push(it); }
    // La VENTA de cada día se toma del campo total (fuente de verdad, inmune a items repetidos).
    // La GANANCIA se calcula sobre los items REALES (sin copias duplicadas).
    function ventaYganancia(dia){
      const reales = itemsRealesDeVenta(itemsPorDiaAdmin[dia.id]||[], dia.total);
      const ganancia = reales.reduce((s,it)=> s + Number(it.cantidad)*(Number(it.precio_venta)-Number(it.costo)), 0);
      return { venta: totalRealDeVenta(dia, itemsPorDiaAdmin[dia.id]||[]), ganancia };
    }

    // Venta y ganancia de CADA día, para poder mostrarlos uno por uno con opción de quitar
    const porDia = {};
    for(const d of diasSinRepes){
      const vg = ventaYganancia(d);
      porDia[d.id] = {venta: vg.venta, ganancia: vg.ganancia, almacen_id:d.almacen_id};
    }

    // Agrupar venta e items por almacén, para mostrar cada puesto por separado
    const porAlmacen = {};
    for(const d of diasBuenos){
      if(!porAlmacen[d.almacen_id]) porAlmacen[d.almacen_id] = {venta:0, ganancia:0, ventaDiaIds:[]};
      porAlmacen[d.almacen_id].ventaDiaIds.push(d.id);
      const vg = ventaYganancia(d);
      porAlmacen[d.almacen_id].venta += vg.venta;
      porAlmacen[d.almacen_id].ganancia += vg.ganancia;
    }

    const filasPuestos = Object.entries(porAlmacen).map(([almId, v])=>{
      const alm = ALMACENES.find(a=>a.id===Number(almId));
      return {nombre: alm?alm.nombre:'—', ...v};
    }).sort((a,b)=>b.ganancia-a.ganancia);

    const ventaTotal = filasPuestos.reduce((s,p)=>s+p.venta, 0);
    const gananciaTotal = filasPuestos.reduce((s,p)=>s+p.ganancia, 0);

    // Devoluciones de ese día: la ganancia devuelta a los clientes se resta ANTES del reparto,
    // así ni los trabajadores ni el administrador cobran comisión sobre ganancia que se regresó.
    let gananciaDevuelta = 0;
    try{
      const {data: devsDia} = await sb.from('devoluciones').select('*').eq('fecha', fecha);
      gananciaDevuelta = (devsDia||[]).reduce((s,d)=> s + Number(d.cantidad)*(Number(d.precio_venta)-Number(d.costo)), 0);
    }catch(e){ /* tabla aún no creada */ }

    const gananciaNeta = Math.max(0, gananciaTotal - gananciaDevuelta);
    // La comisión de los vendedores se calcula POR PUESTO y se redondea por puesto, igual que
    // cuando cada uno cierra su día. Antes se redondeaba UNA sola vez sobre la ganancia del día
    // completo, y como el redondeo es hacia arriba al múltiplo de 5, no coincidía con la suma de
    // las comisiones reales de Deudas (el 27-oct: $12,510 aquí contra $12,515 allá). Esa
    // diferencia además inflaba la base sobre la que cobra el administrador.
    const propDev = gananciaTotal > 0 ? (gananciaDevuelta / gananciaTotal) : 0;
    const pagoVendedores = filasPuestos.reduce(function(s,p){
      const netaPuesto = Math.max(0, p.ganancia * (1 - propDev));
      return s + redondearComision(netaPuesto * 0.15);
    }, 0);
    const quedaTrasVendedores = Math.max(0, gananciaNeta - pagoVendedores);
    const comisionAdmin = redondearComision(quedaTrasVendedores * 0.20);
    const quedaTrasAdmin = quedaTrasVendedores - comisionAdmin;

    document.getElementById('comisionAdminResultado').dataset.comision = comisionAdmin;
    document.getElementById('comisionAdminResultado').dataset.fecha = fecha;

    resEl.innerHTML = `
      <h3 style="font-size:13px; color:var(--muted); margin:0 0 8px; text-transform:uppercase; letter-spacing:.04em">Ventas que se están sumando</h3>
      <table style="margin-bottom:8px">
        <thead><tr><th>Puesto</th><th class="numcell">Venta</th><th class="numcell">Ganancia</th><th></th></tr></thead>
        <tbody>
          ${diasBuenos.map(d=>{
            const alm = ALMACENES.find(a=>a.id===d.almacen_id);
            const v = porDia[d.id] || {venta:0, ganancia:0};
            return `<tr>
              <td>${alm?alm.nombre:'—'}</td>
              <td class="numcell">$${num(v.venta)}</td>
              <td class="numcell" style="color:var(--green)">$${num(v.ganancia)}</td>
              <td><button class="ghost" style="padding:4px 10px; font-size:12px" onclick="quitarDiaComision(${d.id})">Quitar</button></td>
            </tr>`;
          }).join('') || '<tr><td class="empty" colspan="4">No queda ninguna venta incluida.</td></tr>'}
        </tbody>
      </table>
      ${diasQuitados.length>0 ? `
        <div style="margin-bottom:18px">
          <div style="color:var(--muted); font-size:12px; margin-bottom:6px">Ventas que quitaste de este cálculo:</div>
          ${diasQuitados.map(d=>{
            const alm = ALMACENES.find(a=>a.id===d.almacen_id);
            const v = porDia[d.id] || {venta:0};
            return `<div style="display:flex; align-items:center; gap:8px; margin-bottom:4px; opacity:.7">
              <span style="text-decoration:line-through">${alm?alm.nombre:'—'} — $${num(v.venta)}</span>
              <button class="ghost" style="padding:2px 8px; font-size:11px" onclick="restaurarDiaComision(${d.id})">Volver a incluir</button>
            </div>`;
          }).join('')}
        </div>` : '<div style="margin-bottom:10px"></div>'}

      <h3 style="font-size:13px; color:var(--muted); margin:0 0 8px; text-transform:uppercase; letter-spacing:.04em">Por puesto</h3>
      <table style="margin-bottom:18px">
        <thead><tr><th>Puesto</th><th class="numcell">Venta</th><th class="numcell">Ganancia</th></tr></thead>
        <tbody>${filasPuestos.map(p=>`<tr><td>${p.nombre}</td><td class="numcell">$${num(p.venta)}</td><td class="numcell" style="color:var(--green)">$${num(p.ganancia)}</td></tr>`).join('')}</tbody>
        <tfoot><tr style="font-weight:700; border-top:2px solid var(--border)">
          <td>Total (${filasPuestos.length} puesto${filasPuestos.length===1?'':'s'})</td>
          <td class="numcell">$${num(ventaTotal)}</td>
          <td class="numcell" style="color:var(--green)">$${num(gananciaTotal)}</td>
        </tr></tfoot>
      </table>

      <h3 style="font-size:13px; color:var(--muted); margin:0 0 8px; text-transform:uppercase; letter-spacing:.04em">Reparto de la ganancia</h3>
      <table>
        <tr><td>Ganancia total (todos los puestos)</td><td class="numcell" style="font-weight:700">$${num(gananciaTotal)}</td></tr>
        ${gananciaDevuelta > 0 ? `<tr><td style="color:var(--muted)">− Devoluciones del día (ganancia devuelta)</td><td class="numcell" style="color:var(--red)">-$${num(gananciaDevuelta)}</td></tr>
        <tr style="border-top:1px solid var(--border)"><td>Ganancia neta a repartir</td><td class="numcell" style="font-weight:700">$${num(gananciaNeta)}</td></tr>` : ''}
        <tr><td style="color:var(--muted)">− Trabajadores (15%)</td><td class="numcell" style="color:var(--red)">-$${num(pagoVendedores)}</td></tr>
        <tr style="border-top:1px solid var(--border)"><td>Queda después de los trabajadores</td><td class="numcell" style="font-weight:700">$${num(quedaTrasVendedores)}</td></tr>
        <tr><td style="color:var(--muted)">− Administrador (20% de lo anterior)</td><td class="numcell" style="color:var(--amber)">-$${num(comisionAdmin)}</td></tr>
        <tr style="border-top:1px solid var(--border)"><td><strong>Queda para ti después de ambos cobros</strong></td><td class="numcell" style="color:var(--green); font-weight:700; font-size:17px">$${num(quedaTrasAdmin)}</td></tr>
      </table>

      <button class="primary" style="margin-top:14px" onclick="registrarComisionAdmin()">Registrar pago al administrador ($${num(comisionAdmin)})</button>
    `;
  }catch(err){
    msgEl.textContent = 'Error: ' + (err.message||err); msgEl.className = 'msg err';
  }
}

async function registrarComisionAdmin(){
  if(usuarioActual.rol !== 'dueno'){ alert('Solo el dueño puede registrar la comisión del administrador.'); return; }
  const resEl = document.getElementById('comisionAdminResultado');
  const msgEl = document.getElementById('comisionAdminMsg');
  const comision = Number(resEl.dataset.comision);
  const fecha = resEl.dataset.fecha;
  const adminSel = document.getElementById('comisionAdminUsuario');
  const adminId = Number(adminSel.value);
  const adminUsuario = ADMINISTRADORES_CACHE.find(u => u.id === adminId);
  const adminNombre = adminUsuario ? adminUsuario.nombre : 'Administrador';

  if(!comision || comision<=0){ msgEl.textContent='No hay nada que registrar (la comisión salió en $0).'; msgEl.className='msg err'; return; }

  // CANDADO: una sola comisión de administrador por fecha. Guardamos una clave única
  // (comadm-FECHA) en la deuda; si ya existe una con esa clave, NO se registra otra vez.
  const claveComision = 'comadm-' + fecha;
  try{
    const {data: yaExiste} = await sb.from('deudas').select('id').eq('clave_comision', claveComision);
    if(yaExiste && yaExiste.length > 0){
      msgEl.textContent = `La comisión del administrador para el ${fecha} YA fue registrada. No se puede cobrar dos veces la misma venta.`;
      msgEl.className = 'msg err';
      return;
    }
  }catch(e){
    // Si la columna clave_comision aún no existe en la base, usamos el respaldo por nota
    const {data: porNota} = await sb.from('deudas').select('id').eq('tipo','debo').ilike('nota', `%administrador%${fecha}%`);
    if(porNota && porNota.length > 0){
      msgEl.textContent = `La comisión del administrador para el ${fecha} YA fue registrada. No se puede cobrar dos veces la misma venta.`;
      msgEl.className = 'msg err';
      return;
    }
  }

  const filaDeuda = {
    tipo: 'debo',
    persona: adminNombre,
    monto: comision,
    nota: `Comisión administrador (20% ganancia neta) - venta del ${fecha}`,
    clave_comision: claveComision,
    // La deuda queda FECHADA EL DÍA DE LA GANANCIA (la fecha de las ventas), no el día en que el
    // dueño la registra. Se usa mediodía para que la zona horaria no la corra al día anterior.
    creado_en: fecha + 'T12:00:00'
  };
  // Insertamos reintentando sin los campos que la base pueda no tener todavía (clave_comision,
  // creado_en manual), para que la comisión igual se registre.
  let error = null;
  {
    const r1 = await sb.from('deudas').insert(filaDeuda);
    error = r1.error;
    if(error){
      const m = (error.message||'').toLowerCase();
      if(m.includes('clave_comision') || m.includes('creado_en') || m.includes('column')){
        const base = Object.assign({}, filaDeuda);
        // Reintento 1: sin clave_comision pero conservando la fecha de la ganancia
        delete base.clave_comision;
        let r2 = await sb.from('deudas').insert(base);
        if(r2.error && ((r2.error.message||'').toLowerCase().includes('creado_en') || (r2.error.message||'').toLowerCase().includes('column'))){
          // Reintento 2: la base no deja fijar la fecha; guardamos igual (quedará con la fecha de
          // hoy, pero la nota conserva "venta del <fecha>" para saber a qué día pertenece).
          delete base.creado_en;
          r2 = await sb.from('deudas').insert(base);
        }
        error = r2.error;
      }
    }
  }
  if(error){ msgEl.textContent='Error: '+error.message; msgEl.className='msg err'; return; }

  msgEl.textContent = `Comisión de $${num(comision)} registrada como pago pendiente a ${adminNombre}.`; msgEl.className='msg ok';
  resEl.innerHTML = '';
  resEl.dataset.comision = ''; // limpiar para que no se pueda re-registrar con doble toque
  await cargarDeudas();
}





// ============================================================
// GESTIÓN DE USUARIOS (solo dueño)
// ============================================================
function toggleCampoAlmacenUsuario(){
  const rol = document.getElementById('nuevoUsuarioRol').value;
  document.getElementById('campoAlmacenUsuario').style.display = rol==='vendedor' ? '' : 'none';
}

async function crearUsuario(){
  const msgEl = document.getElementById('usuarioMsg');
  const nombre = document.getElementById('nuevoUsuarioNombre').value.trim();
  const rol = document.getElementById('nuevoUsuarioRol').value;
  const almacenId = rol==='vendedor' && document.getElementById('nuevoUsuarioAlmacen').value
    ? Number(document.getElementById('nuevoUsuarioAlmacen').value) : null;
  const password = document.getElementById('nuevoUsuarioPassword').value;

  if(!nombre || !password){ msgEl.textContent='Completa nombre y contraseña.'; msgEl.className='msg err'; return; }

  if(!navigator.onLine){
    msgEl.textContent='Necesitas internet para crear un usuario nuevo. Conéctate e intenta de nuevo.';
    msgEl.className='msg err';
    return;
  }

  const {error} = await sb.from('usuarios').insert({nombre, rol, almacen_id:almacenId, password});
  if(error){ msgEl.textContent='Error: '+error.message; msgEl.className='msg err'; return; }

  msgEl.textContent='Usuario creado.'; msgEl.className='msg ok';
  document.getElementById('nuevoUsuarioNombre').value=''; document.getElementById('nuevoUsuarioPassword').value='';
  await cargarUsuarios();
}

async function cargarUsuarios(){
  // Mantener el select de almacenes del formulario actualizado.
  // La opción "sin puesto fijo" es para trabajadoras que cubren varios puestos:
  // elegirán el puesto cada vez que entren.
  document.getElementById('nuevoUsuarioAlmacen').innerHTML =
    '<option value="">— Sin puesto fijo (elige al entrar) —</option>' +
    almacenesVisibles().map(a=>`<option value="${a.id}">${a.nombre}</option>`).join('');

  const {data, error} = await sb.from('usuarios').select('*').order('rol').order('nombre');
  const body = document.getElementById('usuariosBody');
  if(error || !data || data.length===0){ body.innerHTML = '<tr><td class="empty" colspan="5">Sin usuarios</td></tr>'; return; }

  const rolLabel = r => r==='dueno' ? 'Dueño' : (r==='administrador' ? 'Administrador' : 'Vendedor');

  body.innerHTML = data.map(u=>{
    const almacen = ALMACENES.find(a=>a.id===u.almacen_id);
    const esYoMismo = u.id===usuarioActual.id;
    return `<tr>
      <td>${u.nombre}${esYoMismo?' <span class="pill">tú</span>':''}</td>
      <td>${rolLabel(u.rol)}</td>
      <td>${almacen?almacen.nombre:'—'}</td>
      <td>${u.activo?'<span class="badge ingreso">activo</span>':'<span class="badge extraccion">inactivo</span>'}</td>
      <td>
        <button class="ghost" onclick="cambiarPasswordUsuario(${u.id}, '${txtAttr(u.nombre)}')">Cambiar contraseña</button>
        ${esYoMismo ? '' : `<button class="ghost" onclick="toggleActivoUsuario(${u.id}, ${!u.activo})">${u.activo?'Desactivar':'Activar'}</button>
        <button class="ghost" style="color:var(--red)" onclick="eliminarUsuario(${u.id}, '${txtAttr(u.nombre)}')">Eliminar</button>`}
      </td>
    </tr>`;
  }).join('');
}

async function cambiarPasswordUsuario(id, nombre){
  const nueva = prompt(`Nueva contraseña para "${nombre}":`);
  if(!nueva) return;
  const {error} = await sb.from('usuarios').update({password:nueva}).eq('id', id);
  if(error){ alert('Error: '+error.message); return; }
  alert('Contraseña actualizada.');
}

async function eliminarUsuario(id, nombre){
  if(usuarioActual.rol !== 'dueno'){ alert('Solo el dueño puede eliminar usuarios.'); return; }
  if(!confirm(`¿Eliminar permanentemente a "${nombre}"? Ya no podrá iniciar sesión. (Esto no borra su historial de ventas, que queda ligado al almacén, no a la persona).`)) return;
  const {error} = await sb.from('usuarios').delete().eq('id', id);
  if(error){ alert('Error: '+error.message); return; }
  await cargarUsuarios();
}

async function toggleActivoUsuario(id, nuevoEstado){
  await escribirConReintento(()=> sb.from('usuarios').update({activo:nuevoEstado}).eq('id', id));
  await cargarUsuarios();
} // true si el vendedor NO tiene puesto fijo (cubre varios puestos)

// Una trabajadora es "comodín" si su cuenta no tiene puesto fijo asignado.
// Su comisión y sus cobros van a nombre de ELLA, no del puesto donde trabaje ese día.
function esComodin(){ return esVendedorComodin === true; }
