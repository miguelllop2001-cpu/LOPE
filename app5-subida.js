// LOPE · Mi Negocio — Subir lo pendiente: dinero de la venta, colas de reintento, sincronización y sesión
// (Este archivo solo tiene funciones. Lo que se ejecuta al abrir la app está en app8-arranque.js)

// Reintenta SOLO las comisiones que fallaron al subir (cola com_fallidas).
// Corre sola al reconectar y cada 30s → la comisión nunca se pierde, sin buscar faltantes a mano.
// ══════════════════════════════════════════════════════════════════════════════
//  EL DINERO DE UNA VENTA NUNCA SE PIERDE NI SE DUPLICA
//  Antes, el día se cerraba y el dinero se registraba DESPUÉS. Si el internet se
//  cortaba en ese tramo, la venta quedaba registrada y el dinero NO entraba a caja
//  —y al reintentar, la app daba la venta por completa y ya no lo registraba nunca.
//  (Es lo que pasó con el P 110 el 26-oct: $98,340 vendidos sin entrada de caja.)
//  Ahora cada movimiento lleva una CLAVE ÚNICA: se puede preguntar "¿ya entró?",
//  reintentar sin duplicar, y lo que falle queda en cola hasta que entre.
// ══════════════════════════════════════════════════════════════════════════════
function lineasDineroDeVenta(v){
  const id = v.venta_dia_id, p = v.nombre_puesto || '', f = v.fecha || '';
  const L = [];
  if(Number(v.efectivo) > 0) L.push({sufijo:'ef',  metodo:'efectivo', categoria:'venta',    monto:Number(v.efectivo), concepto:`Venta ${p} - ${f}`});
  if(Number(v.tarjeta)  > 0) L.push({sufijo:'tj',  metodo:'tarjeta',  categoria:'venta',    monto:Number(v.tarjeta),  concepto:`Venta ${p} - ${f}`});
  if(Number(v.sobrante) > 0) L.push({sufijo:'sob', metodo:'efectivo', categoria:'sobrante', monto:Number(v.sobrante), concepto:`Sobrante ${p} - ${f}`});
  return L.map(x=>Object.assign(x,{clave: id!=null ? ('vtacaja-'+id+'-'+x.sufijo) : null}));
}

// Mete UNA línea de dinero. Devuelve true si quedó registrada (o ya estaba).
async function meterLineaDeCaja(linea, v){
  const base = {tipo:'ingreso', metodo:linea.metodo, categoria:linea.categoria, monto:linea.monto,
                concepto:linea.concepto, almacen_id:v.almacen_id};
  // ¿Ya está? Primero por la clave única. Si la base todavía NO tiene esa columna
  // (falta correr caja_trazable.sql), esa comprobación falla: en ese caso hay que
  // comprobar por parecido igual, porque si no un reintento DUPLICARÍA el dinero.
  const yaEstaPorParecido = async()=>{
    try{
      const {data} = await sb.from('caja_movimientos').select('id')
        .eq('almacen_id', v.almacen_id).eq('categoria', linea.categoria)
        .eq('monto', linea.monto).eq('concepto', linea.concepto).limit(1);
      return !!(data && data.length);
    }catch(e){ return false; }
  };
  if(linea.clave){
    let seLogro=false;
    try{
      const {data, error} = await sb.from('caja_movimientos').select('id').eq('clave_caja', linea.clave).limit(1);
      if(!error){ seLogro=true; if(data && data.length) return true; }
    }catch(e){}
    if(!seLogro && await yaEstaPorParecido()) return true;   // sin la columna: se comprueba igual
  } else {
    if(await yaEstaPorParecido()) return true;
  }

  const conClave = Object.assign({}, base, linea.clave ? {clave_caja: linea.clave, venta_dia_id: v.venta_dia_id} : {});
  let r = await sb.from('caja_movimientos').insert(conClave);
  // La base todavía no tiene las columnas nuevas (falta correr caja_trazable.sql): se guarda sin ellas.
  if(r && r.error && /clave_caja|venta_dia_id|column/i.test(r.error.message||'')){
    r = await sb.from('caja_movimientos').insert(base);
  }
  // La base rechaza la categoría 'sobrante' (candado viejo): se guarda como 'otro', sin perder el dinero.
  if(r && r.error && linea.categoria==='sobrante'){
    const alt = Object.assign({}, base, {categoria:'otro', concepto:'SOBRANTE '+(v.nombre_puesto||'')+' - '+(v.fecha||'')});
    if(linea.clave){ alt.clave_caja = linea.clave; alt.venta_dia_id = v.venta_dia_id; }
    r = await sb.from('caja_movimientos').insert(alt);
    if(r && r.error && /clave_caja|venta_dia_id|column/i.test(r.error.message||'')){
      delete alt.clave_caja; delete alt.venta_dia_id;
      r = await sb.from('caja_movimientos').insert(alt);
    }
  }
  // Si chocó con la clave única, es que ya estaba: lo damos por bueno.
  if(r && r.error && /duplicate|unique|23505/i.test(r.error.message||'')) return true;
  if(r && r.error) throw new Error(r.error.message||'no se pudo registrar el dinero');
  return true;
}

// Registra TODO el dinero de una venta. Lo que no entre queda en cola y se reintenta solo.
async function registrarDineroDeVenta(v){
  const lineas = lineasDineroDeVenta(v);
  if(!lineas.length) return;
  for(const linea of lineas){
    try{
      await meterLineaDeCaja(linea, v);
    }catch(e){
      const motivo=(e&&e.message)||String(e);
      try{ const q=lsGet('caja_fallidas',[]); q.push({linea, v, error:motivo, ts:Date.now()}); lsSet('caja_fallidas',q); }catch(_){}
      try{ registrarError('caja/venta','No se pudo registrar el dinero de la venta (quedó en cola para reintentar)',motivo); }catch(_){}
    }
  }
}
function __sellarCola(nombre){            // le pone número propio a lo que no lo tenga
  let cola = lsGet(nombre, []);
  if(!Array.isArray(cola)) cola = [];     // si el guardado se corrompió, se empieza limpio
  const limpia = cola.filter(it => it && typeof it === 'object' && !Array.isArray(it));  // basura o huecos: fuera
  let cambio = limpia.length !== cola.length;
  for(const it of limpia){ if(it.__cid==null){ it.__cid = 'c'+Date.now()+'-'+Math.random().toString(36).slice(2,8); cambio = true; } }
  if(cambio) lsSet(nombre, limpia);       // sin await en el medio: nada se puede colar aquí
  return limpia;
}
async function drenarCola(nombre, intentar){
  if(!navigator.onLine || typeof sb==='undefined' || !sb) return 0;
  if(__colasOcupadas[nombre]) return 0;   // ya hay otra pasada corriendo
  __colasOcupadas[nombre] = true;
  let logrados = 0;
  try{
    const cola = __sellarCola(nombre);
    if(!cola.length) return 0;
    const hechos = [], fallos = {};
    for(const item of cola){
      try{ await intentar(item); hechos.push(item.__cid); logrados++; }
      catch(e){ fallos[item.__cid] = { msg:((e && e.message) || String(e)), faltantes:((e && e.faltantes) || null) }; }  // sigue fallando → se queda
    }
    if(hechos.length || Object.keys(fallos).length){
      const ahora = lsGet(nombre, []);    // se vuelve a leer: puede haber entrado algo nuevo
      const nueva = (Array.isArray(ahora)?ahora:[]).filter(it => it && typeof it==='object' && !Array.isArray(it) && !hechos.includes(it.__cid));
      for(const it of nueva){             // deja anotado por qué falló y cuántas veces
        if(it && fallos[it.__cid]!=null){
          it._ultimoError = fallos[it.__cid].msg;
          it._faltantes   = fallos[it.__cid].faltantes;
          it._intentos    = (it._intentos||0)+1;
        }
      }
      lsSet(nombre, nueva);
    }
  } finally { __colasOcupadas[nombre] = false; }
  return logrados;
}

// Reintenta el dinero que no pudo entrar. Corre al volver el internet y cada 30s.
async function reintentarCaja(){
  await drenarCola('caja_fallidas', async item => { await meterLineaDeCaja(item.linea, item.v); });
}

// Reintenta marcar como PAGADOS los cobros que no se pudieron marcar al cerrar el día.
// Sin esto, el cobro le vuelve a aparecer al trabajador como si no lo hubiera cobrado.
// Marca una deuda como cobrada dentro de una venta: reintenta y COMPRUEBA leyendo de
// vuelta que de verdad quedó marcada. Devuelve true solo si lo pudo confirmar.
async function marcarCobroConReintento(deudaId, ventaDiaId, intentos){
  const veces = intentos || 3;
  for(let n=1; n<=veces; n++){
    try{
      const r = await sb.from('deudas').update({pagada:true, pagada_en:new Date().toISOString(), venta_dia_id: ventaDiaId}).eq('id', deudaId);
      if(r && r.error) throw new Error(r.error.message);
      const {data} = await sb.from('deudas').select('id, pagada').eq('id', deudaId).maybeSingle();
      if(data && data.pagada) return true;      // confirmado en la base
    }catch(e){ /* se vuelve a intentar */ }
    if(n < veces) await new Promise(res=>setTimeout(res, 400*n));
  }
  return false;
}

async function reintentarCobros(){
  const n = await drenarCola('cobros_fallidos', async c => {
    const r = await sb.from('deudas').update({pagada:true, pagada_en:new Date().toISOString(), venta_dia_id:(c.venta_dia_id||null)}).eq('id', c.deudaId);
    if(r && r.error) throw new Error(r.error.message);
  });
  if(n) { try{ cargarCobros(); }catch(e){} }
}

async function reintentarComisiones(){
  await drenarCola('com_fallidas', async item => {
    const fila = item.fila || {tipo:'debo', persona:item.persona, monto:item.monto, venta_dia_id:item.venta_dia_id,
      clave_comision:(item.venta_dia_id!=null?('comvta-'+item.venta_dia_id):null),
      nota:('Comisión 15% de ganancia ($'+num(item.monto)+') - venta del '+item.fecha)};
    // ¿ya existe? (por clave, o por persona+fecha) → no duplicar
    let existe=false;
    if(fila.clave_comision){ const {data}=await sb.from('deudas').select('id').eq('clave_comision',fila.clave_comision); existe = data && data.length>0; }
    if(!existe){
      const mf=(fila.nota||'').match(/venta del (\d{4}-\d{2}-\d{2})/);
      if(mf){ const data=await traerTodasLasFilas(()=> sb.from('deudas').select('id,nota').eq('tipo','debo').eq('persona',fila.persona).order('id',{ascending:true}));
        existe = (data||[]).some(c=>(c.nota||'').includes('Comisión 15%') && (c.nota||'').includes('venta del '+mf[1])); }
    }
    if(existe) return;  // ya está → se saca de la cola
    // crear (con fallback si falta la columna clave_comision)
    let r=await sb.from('deudas').insert(fila);
    if(r.error && ((r.error.message||'').includes('clave_comision')||(r.error.message||'').includes('column'))){
      const base=Object.assign({},fila); delete base.clave_comision; r=await sb.from('deudas').insert(base);
    }
    if(r.error) throw new Error(r.error.message);   // sigue fallando → se queda para el próximo intento
  });
}
async function sincronizarPendientes(){  if(sincronizando || !navigator.onLine) { actualizarConexionUI(); return; }
  sincronizando = true;
  try{
    await sincronizarPedidosPendientes();
    await sincronizarDevolucionesPendientes(); // antes que los días: así el cierre pendiente ya las encuentra y descuenta
    await sincronizarDiasPendientes();
  } finally {
    sincronizando = false;
    actualizarConexionUI();
  }
}

async function sincronizarPedidosPendientes(){
  const n = await drenarCola('vt_pending_pedidos', async p => {
    const {error} = await sb.from('pedidos').insert({almacen_id:p.almacen_id, producto_id:p.producto_id, cantidad:p.cantidad, nota:p.nota});
    if(error) throw error;
  });
  if(puestoActual && n) await cargarMisPedidos();
}

async function sincronizarDiasPendientes(){
  const algunoOk = await drenarCola('vt_pending_days', async dia => { await sincronizarUnDia(dia); });
  if(algunoOk && puestoActual){
    // PALOMITA: confirmación visual cuando las ventas pendientes sincronizaron
    pantallaExito('¡Sincronizado!', 'Tu venta se guardó en el sistema.');
    await cargarHistorialDias();
    await cargarMiInventario();
    // Si seguíamos en modo local y ya se sincronizó, intentamos retomar el día en línea normalmente
    if(modoLocal && carrito.length===0){
      await buscarOAbrirVentaDia();
    }
  }
}

async function sincronizarUnDia(dia){
  // IDEMPOTENCIA 1: buscamos si esta venta ya tiene una fila (por su clave_local). Puede estar COMPLETA
  // (cerrada y con inventario descontado), a MEDIAS (cerrada pero sin descontar, o abierta),
  // o no existir. Solo si está COMPLETA nos salimos; si está a medias la reutilizamos y la
  // TERMINAMOS más abajo (así una venta que quedó "cerrada pero NO descontó" se completa sola).
  let filaPrevia = null;
  if(dia.clave_local){
    try{
      const {data} = await sb.from('ventas_dia').select('*').eq('clave_local', dia.clave_local).maybeSingle();
      filaPrevia = data || null;
    }catch(e){ /* si la columna no existe todavía, seguimos con el flujo normal */ }
  }
  if(filaPrevia){
    let tieneMovs = false;
    try{
      const {data: m} = await sb.from('movimientos').select('id').eq('venta_dia_id', filaPrevia.id).limit(1);
      tieneMovs = !!(m && m.length);
    }catch(e){}
    // ANTES aquí decía: if(filaPrevia.cerrado && tieneMovs) return;
    // Ese candado solo miraba el inventario. Si el internet se cortaba después de cerrar el
    // día pero ANTES de registrar el dinero, al reintentar daba la venta por completa y la
    // entrada de caja NO se creaba nunca más. Ahora, aunque la venta ya esté completa, se
    // sigue adelante hasta el registro del dinero y la comisión, que son idempotentes
    // (tienen clave única: si ya están, no se duplican).
    if(filaPrevia.cerrado && tieneMovs){
      await registrarDineroDeVenta({
        venta_dia_id: filaPrevia.id, almacen_id: dia.almacen_id, nombre_puesto: dia.almacen_nombre,
        fecha: dia.fecha, efectivo: dia.efectivo, tarjeta: dia.tarjeta, sobrante: dia.sobrante
      });
      return;
    }
  }

  // IDEMPOTENCIA 2 (contra duplicados por subida manual): aunque no coincida la clave_local,
  // si ya hay una venta CERRADA hoy en este puesto con EXACTAMENTE los mismos artículos y el
  // mismo total, es la misma venta (por ejemplo, el dueño la subió a mano desde el perfil).
  // No se vuelve a aplicar. (Solo si NO estamos completando una fila que ya conocemos.)
  if(!filaPrevia) try{
    const firmaCola = (dia.items||[]).map(it=>`${it.producto_id}x${it.cantidad}@${it.precio_venta}`).sort().join('|');
    const totalCola = Number(Number(dia.total||0).toFixed(2));
    if(firmaCola){
      const {data: cerradasHoy} = await sb.from('ventas_dia').select('id, total')
        .eq('almacen_id', dia.almacen_id).eq('fecha', dia.fecha).eq('cerrado', true);
      const ids = (cerradasHoy||[]).map(d=>d.id);
      if(ids.length > 0){
        const itemsExistentes = await traerItemsDe(ids, 'venta_dia_id, producto_id, cantidad, precio_venta');
        const porDia = {};
        for(const it of (itemsExistentes||[])){
          if(!porDia[it.venta_dia_id]) porDia[it.venta_dia_id] = [];
          porDia[it.venta_dia_id].push(`${it.producto_id}x${it.cantidad}@${it.precio_venta}`);
        }
        for(const d of (cerradasHoy||[])){
          const firma = (porDia[d.id]||[]).sort().join('|');
          const total = Number(Number(d.total||0).toFixed(2));
          if(firma && firma === firmaCola && Math.abs(total - totalCola) < 0.01){
            console.warn('Esta venta pendiente ya existe cerrada (subida a mano): no se duplica.');
            return; // ya está en la base: no duplicar
          }
        }
      }
    }
  }catch(e){ /* si falla la verificación, seguimos con el flujo normal */ }

  // Agrupamos las líneas por producto (juntando las repetidas del mismo artículo) para verificar
  // y descontar CORRECTO. Antes se verificaba/descontaba línea por línea: si un producto estaba en
  // dos líneas (ej. cuchillo 1 + cuchillo 2 = 3), solo se descontaba una y el inventario quedaba mal.
  const necesarioSync = {};
  for(const it of dia.items){ necesarioSync[it.producto_id] = (necesarioSync[it.producto_id]||0) + Number(it.cantidad); }

  // Obtenemos (o creamos) la fila de la venta, pero la dejamos ABIERTA por ahora. El día se
  // cierra al FINAL, solo después de descontar el inventario y guardar los artículos. Antes se
  // cerraba primero y se descontaba después: si el internet se cortaba en medio, el día quedaba
  // "cerrado pero NO descontó" y el candado de reintento lo daba por hecho y ya no lo terminaba.
  let nuevo;
  if(filaPrevia){
    // Ya existía una fila para esta venta (a medias). La reutilizamos y, si había quedado cerrada
    // sin descontar (zombie), la reabrimos para poder completarla bien.
    nuevo = filaPrevia;
    if(filaPrevia.cerrado){
      try{ await sb.from('ventas_dia').update({cerrado:false}).eq('id', filaPrevia.id); }catch(e){}
    }
  } else {
    const {data: abierto} = await sb.from('ventas_dia').select('*').eq('almacen_id', dia.almacen_id).eq('fecha', dia.fecha).eq('cerrado', false).maybeSingle();
    if(abierto){
      nuevo = abierto;
      // marcamos la clave_local en la fila abierta para reconocerla si algo falla a mitad
      try{ await sb.from('ventas_dia').update({clave_local: dia.clave_local || null}).eq('id', abierto.id); }catch(e){}
    } else {
      const filaDia = {almacen_id:dia.almacen_id, fecha:dia.fecha, cerrado:false, total:dia.total, clave_local: dia.clave_local || null, usuario_id: dia.usuario_id || null};
      let rCreado = await sb.from('ventas_dia').insert(filaDia).select().single();
      if(rCreado.error && ((rCreado.error.message||'').includes('usuario_id') || (rCreado.error.message||'').includes('column'))){
        delete filaDia.usuario_id;
        rCreado = await sb.from('ventas_dia').insert(filaDia).select().single();
      }
      if(rCreado.error) throw rCreado.error;
      nuevo = rCreado.data;
    }
  }

  // ===== VÍA ATÓMICA en la sincronización (si la función 'descontar_y_cerrar_venta' existe en
  // Supabase): descuenta el inventario, guarda los artículos y cierra el día en UNA sola
  // transacción → es IMPOSIBLE que quede "cerrada sin descontar". Si la función no existe todavía,
  // caemos a la vía normal reordenada de abajo (que también descuenta ANTES de cerrar).
  let hechoPorRPC = false;
  try{
    const {error: rpcErr} = await sb.rpc('descontar_y_cerrar_venta', {
      p_venta_dia_id: nuevo.id, p_almacen_id: dia.almacen_id, p_fecha: dia.fecha, p_total: dia.total,
      p_items: dia.items.map(it=>({producto_id: it.producto_id, cantidad: it.cantidad, precio_venta: it.precio_venta, costo: it.costo}))
    });
    if(rpcErr){
      const m = (rpcErr.message||'').toLowerCase();
      if(m.includes('stock_insuficiente') || m.includes('no alcanza') || (m.includes('inventario') && !m.includes('column') && !m.includes('relation'))){
        const faltan = await faltantesDeStock(dia.almacen_id, necesarioSync, pid => (dia.items.find(x=>Number(x.producto_id)===Number(pid))||{}).nombre || ('producto '+pid));
        const detalle = faltan.length ? ` Falta: ${faltantesTexto(faltan)}.` : '';
        const eStk = new Error(`Stock insuficiente para sincronizar (${dia.almacen_nombre} ${dia.fecha}).${detalle}`);
        eStk.faltantes = faltan;
        throw eStk;
      }
      const noExiste = m.includes('does not exist') || m.includes('could not find') || m.includes('not found') || m.includes('schema cache') || m.includes('pgrst202') || m.includes('function');
      if(!noExiste) throw rpcErr;
    } else {
      hechoPorRPC = true;
    }
  }catch(eRPC){
    if((eRPC.message||'').startsWith('Stock insuficiente')) throw eRPC;
    // ¿La base sí lo hizo y solo se perdió la respuesta? Si no se puede saber, se deja en
    // cola: seguir por pasos a ciegas podía descontar la venta por segunda vez.
    let yaQuedo = false;
    try{ yaQuedo = await ventaYaCerradaEnServidor(nuevo.id, Object.keys(necesarioSync)); }
    catch(eV){ throw new Error('se cortó la conexión y no se pudo confirmar si la venta quedó registrada (se reintenta sola)'); }
    if(yaQuedo) hechoPorRPC = true;
    // cualquier otro problema con la RPC → seguimos por la vía normal (respaldo)
  }

  if(!hechoPorRPC){
    // Verificar stock SOLO de lo que aún falta aplicar (si un intento previo ya descontó algún
    // producto, su clave ya está marcada y no se vuelve a verificar ni a descontar).
    for(const pid of Object.keys(necesarioSync)){
      const claveVenta = 'vt_sync_' + nuevo.id + '_' + pid;
      if(productoDeVentaYaDescontado(claveVenta) || await movimientoYaRegistrado(claveVenta)) continue;
      const {data, error} = await sb.from('inventario').select('cantidad').eq('almacen_id', dia.almacen_id).eq('producto_id', Number(pid)).maybeSingle();
      if(error) throw error;
      const actual = data ? Number(data.cantidad) : 0;
      if(actual < necesarioSync[pid]){
        const nombre = (dia.items.find(x=>x.producto_id===Number(pid))||{}).nombre || 'un producto';
        throw new Error(`Stock insuficiente para sincronizar "${nombre}" (hay ${actual}, se vendieron ${necesarioSync[pid]} en total).`);
      }
    }

    // Guardar los artículos vendidos (borrar + insertar = sin duplicados, idempotente).
    await escribirConReintento(()=> sb.from('venta_items').delete().eq('venta_dia_id', nuevo.id));
    const filasItems = dia.items.map(it=>({
      venta_dia_id: nuevo.id, producto_id: it.producto_id, cantidad: it.cantidad,
      precio_venta: it.precio_venta, costo: it.costo
    }));
    const {error: eItems} = await sb.from('venta_items').insert(filasItems);
    if(eItems) throw eItems;

    // Descuento AGRUPADO por producto: cada artículo se descuenta UNA vez con su cantidad total.
    // La clave por producto evita descontar dos veces si se sincroniza de nuevo.
    for(const pid of Object.keys(necesarioSync)){
      const claveVenta = 'vt_sync_' + nuevo.id + '_' + pid;
      await descontarProductoDeVenta(claveVenta, dia.almacen_id, Number(pid), necesarioSync[pid], 'Venta del día (sincronizada sin conexión)', nuevo.id);
    }

    // AHORA SÍ cerramos el día: al final, cuando el inventario YA se descontó y los artículos YA
    // se guardaron. Así nunca queda "cerrada pero NO descontó".
    // Antes este resultado se ignoraba: si no se guardaba, la venta quedaba ABIERTA en la base
    // con el inventario ya descontado, y seguía de largo como si estuviera cerrada.
    try{
      await escribirConReintento(()=> sb.from('ventas_dia').update({cerrado:true, total:dia.total, cerrado_en:new Date().toISOString(), clave_local: dia.clave_local || null}).eq('id', nuevo.id));
    }catch(eCierre){
      const mC = String((eCierre && eCierre.message) || eCierre).toLowerCase();
      if(mC.includes('clave_local') || mC.includes('column') || mC.includes('schema cache')){
        // base sin la columna clave_local: se cierra igual, sin ella
        await escribirConReintento(()=> sb.from('ventas_dia').update({cerrado:true, total:dia.total, cerrado_en:new Date().toISOString()}).eq('id', nuevo.id));
      } else throw eCierre;
    }
  }

  // Mismo registro de dinero que en el cierre normal: con clave única, sin duplicar y
  // con cola de reintento si falla.
  await registrarDineroDeVenta({
    venta_dia_id: nuevo.id, almacen_id: dia.almacen_id, nombre_puesto: dia.almacen_nombre,
    fecha: dia.fecha, efectivo: dia.efectivo, tarjeta: dia.tarjeta, sobrante: dia.sobrante
  });

  let costoTotal = 0;
  for(const it of dia.items) costoTotal += it.cantidad*it.costo;
  const ganancia = dia.total - costoTotal;

  // Restar devoluciones de esa fecha que aún no se hayan descontado de ninguna comisión
  let gananciaDevuelta = 0;
  let devsDia = [];
  try{
    const rDevs = await sb.from('devoluciones').select('*').eq('almacen_id', dia.almacen_id).eq('fecha', dia.fecha).eq('aplicada', false);
    devsDia = rDevs.data || [];
    for(const d of devsDia) gananciaDevuelta += Number(d.cantidad)*(Number(d.precio_venta)-Number(d.costo));
  }catch(e){ /* tabla aún no creada: seguir sin descuento */ }

  const gananciaNeta = ganancia - gananciaDevuelta;
  if(gananciaNeta > 0){
    const comision = redondearComision(gananciaNeta*0.15);
    // CANDADO: clave única por día pendiente, para no crear la comisión dos veces al sincronizar.
    const claveComVta = 'comvta-' + (dia.clave_local || nuevo.id);
    let comisionYaExiste = false;
    let lecturaComFallo = false;   // no se pudo comprobar → a la cola, no crear a ciegas
    try{
      const rYaCom = await sb.from('deudas').select('id').eq('clave_comision', claveComVta);
      if(rYaCom.error){
        const mY = String(rYaCom.error.message||'').toLowerCase();
        if(!(mY.includes('clave_comision') || mY.includes('column') || mY.includes('schema cache'))) lecturaComFallo = true;
      } else comisionYaExiste = !!(rYaCom.data && rYaCom.data.length > 0);
    }catch(e){ lecturaComFallo = true; }
    if(!comisionYaExiste){
      const filaCom = {tipo:'debo', persona:(dia.cobra_comision || dia.almacen_nombre), monto:comision, nota:`Comisión 15% de ganancia ($${gananciaNeta.toFixed(2)})${gananciaDevuelta>0?` (ya restada ganancia devuelta $${gananciaDevuelta.toFixed(2)})`:''} - venta del ${dia.fecha}${dia.es_comodin?` (${dia.almacen_nombre})`:''} (sincronizada sin conexión)`, clave_comision: claveComVta, venta_dia_id: nuevo.id};
      // Mismo blindaje que en el cierre normal: si se corta el internet justo aquí, la
      // comisión NO se pierde — queda en la cola y se crea sola al volver la conexión.
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
        console.error('COMISIÓN NO CREADA al sincronizar:', motivo, filaCom);
        try{ const log=lsGet('com_fallidas',[]); log.push({fila:{tipo:'debo',persona:(dia.cobra_comision||dia.almacen_nombre),monto:comision,nota:filaCom.nota,clave_comision:claveComVta,venta_dia_id:nuevo.id}, fecha:dia.fecha, persona:(dia.cobra_comision||dia.almacen_nombre), monto:comision, venta_dia_id:nuevo.id, error:motivo, ts:Date.now()}); lsSet('com_fallidas',log); }catch(e){}
        try{ registrarError('comision/sincronizar','No se pudo crear la comisión al subir la venta (quedó en cola para reintentar)',motivo); }catch(e){}
      }
    }
  }
  // Protegido: si esto falla, NO puede impedir que los cobros se marquen como pagados.
  for(const d of devsDia){
    try{ await escribirConReintento(()=> sb.from('devoluciones').update({aplicada:true}).eq('id', d.id)); }catch(e){ /* no crítico */ }
  }

  // Marcar como pagados los cobros que se agregaron al carrito antes de quedarse sin conexión
  // (el efectivo/tarjeta ya vienen netos, así que no se crea un egreso aparte para no restarlo dos veces).
  // Si se cae la conexión aquí, el cobro quedaría SIN marcar y le volvería a aparecer al
  // trabajador para cobrarlo otra vez. Por eso queda en cola y se marca solo al volver el internet.
  if(dia.cobros && dia.cobros.length>0){
    for(const c of dia.cobros){
      // Igual que al cerrar el día: se intenta varias veces y se COMPRUEBA leyendo de vuelta.
      // Antes aquí era UN SOLO intento, y con el internet de Cuba se cortaba a cada rato.
      const marcado = await marcarCobroConReintento(c.deudaId, nuevo.id);
      if(!marcado){
        try{ const q=lsGet('cobros_fallidos',[]); q.push({deudaId:c.deudaId, monto:c.monto, venta_dia_id:nuevo.id, ts:Date.now()}); lsSet('cobros_fallidos',q); }catch(e){}
        try{ registrarError('cobro/sincronizar','No se pudo marcar el cobro como pagado al subir la venta (quedó en cola; el dueño lo repara solo)','deuda '+c.deudaId); }catch(e){}
      }
    }
  }
}
function contarPendientesTotales(){
  let n = 0;
  for(const c of COLAS_PENDIENTES){ const v = lsGet(c, []); if(Array.isArray(v)) n += v.length; }
  return n;
}
function pintarPillPendientes(){
  const pill = document.getElementById('connPill');
  const arriba = document.getElementById('pendHeader');
  if(!pill || typeof usuarioActual === 'undefined' || !usuarioActual){ if(arriba) arriba.style.display = 'none'; return; }
  const n = contarPendientesTotales();
  // El aviso de ARRIBA (siempre a la vista, sin abrir el menú): solo sale si hay algo que decir.
  if(arriba){
    const sinSenal = !navigator.onLine;
    if(n === 0 && !sinSenal) arriba.style.display = 'none';
    else {
      arriba.style.display = 'inline-block';
      // En la pantalla del vendedor el botón "Venta del día" ocupa el centro: ahí va corto.
      const vp = document.getElementById('ventaDiaHeaderPill');
      const corto = !!(vp && vp.style.display !== 'none' && window.innerWidth < 640);
      arriba.textContent = corto
        ? ((sinSenal ? '📵' : (__subiendoAhora ? '⏫' : '⏳')) + (n > 0 ? ' ' + n : ''))
        : (sinSenal ? (n > 0 ? `📵 ${n} sin subir` : '📵 Sin señal') : (__subiendoAhora ? `⏫ Subiendo ${n}…` : `⏳ ${n} sin subir`));
      arriba.style.padding = corto ? '7px 9px' : '7px 12px';
      const c = sinSenal ? 'var(--red)' : 'var(--amber)';
      arriba.style.color = c; arriba.style.borderColor = c;
    }
  }
  if(navigator.onLine){
    pill.textContent = n > 0 ? (__subiendoAhora ? `⏫ Subiendo ${n}…` : `🟡 ${n} sin subir · toca aquí`) : '🟢 En línea';
    pill.style.color = n > 0 ? 'var(--amber)' : 'var(--green)';
  } else {
    pill.textContent = n > 0 ? `🔴 Sin señal · ${n} guardado${n===1?'':'s'} en el teléfono` : '🔴 Sin señal';
    pill.style.color = 'var(--red)';
  }
  pill.style.fontWeight = n > 0 ? '800' : '';
}
async function subirPendientesAhora(){
  if(__subiendoAhora) return;
  const n0 = contarPendientesTotales();
  if(!navigator.onLine){
    alert(n0 > 0 ? `No hay señal ahora mismo.\n\nTienes ${n0} cosa${n0===1?'':'s'} guardada${n0===1?'':'s'} en este teléfono. No se pierden: se suben solas en cuanto vuelva la señal. No borres los datos de la app mientras tanto.` : 'No hay señal ahora mismo. No tienes nada pendiente por subir.');
    return;
  }
  if(n0 === 0){ pintarPillPendientes(); return; }
  __subiendoAhora = true; pintarPillPendientes();
  const pasos = [sincronizarPendientes, sincronizarPendientesAdmin, reintentarCaja, reintentarCobros, reintentarComisiones,
                 sincronizarRecepciones, subirMovsMayoreo, subirVentasMayoreo];
  for(const f of pasos){ try{ await f(); }catch(e){ console.error(e); } }
  __subiendoAhora = false; pintarPillPendientes();
  const n1 = contarPendientesTotales();
  if(n1 > 0) alert(`Se subieron ${Math.max(0, n0-n1)} de ${n0}. Quedan ${n1} sin subir:\n\n${detallePendientes()}\n\nSe sigue intentando solo cada medio minuto. Si no baja, mándale una foto de este aviso al dueño.`);
}
// Qué es lo que está sin subir y por qué (para no adivinar). Sin detalles de pagos internos.
function detallePendientes(){
  const NOMBRES = {vt_pending_days:'venta(s) del día', vt_pending_pedidos:'pedido(s)', vt_pending_devoluciones:'devolución(es)',
    adm_pending_ops:'operación(es) de gestión', caja_fallidas:'dinero de venta(s)', cobros_fallidos:'cobro(s) por marcar',
    com_fallidas:'registro(s) interno(s)', recep_pending:'artículo(s) de Recepción', may_movs_pendientes:'movimiento(s) de mayoreo', may_ventas_pendientes:'venta(s) de mayoreo'};
  const lineas = [];
  for(const c of COLAS_PENDIENTES){
    const v = lsGet(c, []); if(!Array.isArray(v) || !v.length) continue;
    let motivo = '';
    const conError = v.find(x => x && x._ultimoError);
    if(conError){
      let m = String(conError._ultimoError);
      if(__esErrorDeRed(m)) m = 'se cortó la conexión';
      motivo = ' — ' + m.slice(0, 110) + ((conError._intentos||0) > 1 ? ` (${conError._intentos} intentos)` : '');
    }
    lineas.push(`• ${v.length} ${NOMBRES[c] || c}${motivo}`);
  }
  return lineas.join('\n');
}

// ---------- HISTORIAL DE DÍAS (colapsable) ----------
// Pliega o despliega TODO el historial de días cerrados (para que no ocupe tanto).
function toggleHistorialDias(){
  const w=document.getElementById('historialDiasWrap');
  const f=document.getElementById('histDiasFlecha');
  if(!w) return;
  const abierto = w.style.display!=='none';
  w.style.display = abierto ? 'none' : 'block';
  if(f) f.textContent = abierto ? '▸' : '▾';
}

async function cargarHistorialDias(){
  if(!puestoActual) return; // aún no se ha cargado el puesto: no hacemos nada (evita el cuelgue)
  const cont = document.getElementById('historialDias');
  const empty = document.getElementById('historialEmpty');
  if(!navigator.onLine){
    cont.innerHTML=''; empty.style.display='block';
    empty.textContent = 'Sin conexión: el historial de días anteriores no se puede mostrar ahora (no afecta tus ventas de hoy, que están guardadas).';
    return;
  }
  try{
    // Cada perfil ve SUS propios días cerrados, sin importar el teléfono. Si la base tiene
    // la columna usuario_id, filtramos por ella; si no, caemos al filtro por puesto.
    let data, error;
    try{
      const r = await sb.from('ventas_dia').select('*')
        .eq('almacen_id', puestoActual.id).eq('cerrado', true)
        .eq('usuario_id', usuarioActual.id).order('fecha', {ascending:false}).limit(5000);
      if(r.error) throw r.error;
      data = r.data;
    }catch(e){
      // La columna usuario_id no existe todavía: mostramos por puesto (comportamiento anterior)
      const r = await sb.from('ventas_dia').select('*')
        .eq('almacen_id', puestoActual.id).eq('cerrado', true).order('fecha', {ascending:false}).limit(5000);
      error = r.error; data = r.data;
    }
    if(error) throw error;
    if(!data || data.length===0){ cont.innerHTML=''; empty.textContent='Sin días cerrados todavía.'; empty.style.display='block'; return; }
    empty.style.display='none';

    // Buscamos los cobros vinculados a estos días, para restarlos del total que se muestra
    const idsDias = data.map(d=>d.id);
    const {data: cobrosDeEstosDias} = await sb.from('deudas').select('venta_dia_id, monto, tipo, nota, clave_comision').in('venta_dia_id', idsDias);
    const cobroPorDia = {};
    (cobrosDeEstosDias||[]).forEach(c=>{
      // No restar las COMISIONES (son 'debo' del vendedor, no un cobro que baje el total de la venta)
      if(c.tipo==='debo' && ((c.nota||'').includes('Comisi') || c.clave_comision)) return;
      cobroPorDia[c.venta_dia_id] = (cobroPorDia[c.venta_dia_id]||0) + Number(c.monto);
    });

    cont.innerHTML = data.map(d=>{
      const cobrado = cobroPorDia[d.id] || 0;
      const totalNeto = Number(d.total) - cobrado;
      return `
      <div>
        <div class="day-header" onclick="toggleDia(${d.id})">
          <span>${d.fecha}</span>
          <span>$${num(totalNeto)} <span style="color:var(--muted);font-size:12px">▾</span></span>
        </div>
        <div class="day-detail" id="dia-${d.id}"></div>
      </div>`;
    }).join('');
  }catch(err){
    console.error(err);
    cont.innerHTML=''; empty.textContent='No se pudo cargar el historial ahora.'; empty.style.display='block';
  }
}

async function toggleDia(id){
  const el = document.getElementById('dia-'+id);
  const yaAbierto = el.classList.contains('open');
  if(yaAbierto){ el.classList.remove('open'); return; }
  el.classList.add('open');
  if(el.dataset.loaded) return;

  const [{data, error}, {data: cobros}] = await Promise.all([
    sb.from('venta_items').select('*').eq('venta_dia_id', id),
    sb.from('deudas').select('*').eq('venta_dia_id', id)
  ]);
  if(error){ el.innerHTML = '<div class="msg err">Error cargando detalle.</div>'; return; }

  const filasProductos = (data||[]).map(it=>{
    const p = PRODUCTOS.find(p=>p.id===it.producto_id);
    return `<tr><td>${p?p.nombre:'(eliminado)'}</td><td class="numcell">${num(it.cantidad)}</td><td class="numcell">$${num(it.precio_venta)}</td><td class="numcell">$${num(it.cantidad*it.precio_venta)}</td></tr>`;
  }).join('');

  // Igual que en el detalle de movimientos: la comisión del trabajador queda vinculada a la
  // venta pero NO es un cobro, así que se excluye de "Cobro de pago pendiente".
  const cobrosReales = (cobros||[]).filter(c => !((c.nota||'').includes('Comisi') || c.clave_comision));
  const filasCobros = cobrosReales.map(c =>
    `<tr style="color:var(--red)"><td>Cobro de pago pendiente</td><td class="numcell">—</td><td class="numcell">—</td><td class="numcell">-$${num(c.monto)}</td></tr>`
  ).join('');

  el.innerHTML = `<table>
    <thead><tr><th>Producto</th><th class="numcell">Cant.</th><th class="numcell">Precio</th><th class="numcell">Subtotal</th></tr></thead>
    <tbody>${filasProductos + filasCobros || '<tr><td class="empty" colspan="4">Sin artículos</td></tr>'}</tbody>
  </table>`;
  el.dataset.loaded = '1';
}

// ¿Ya se está usando como app instalada? (entonces no tiene sentido ofrecer instalarla)
function appYaInstalada(){
  return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches)
      || window.navigator.standalone === true;
}

async function instalarApp(){
  if(!promptInstalacion){
    alert('Para instalarla: abre el menú del navegador (los 3 puntitos) y toca "Instalar aplicación".');
    return;
  }
  promptInstalacion.prompt();
  try{ await promptInstalacion.userChoice; }catch(e){}
  promptInstalacion = null;
  const zona = document.getElementById('zonaInstalar');
  if(zona) zona.style.display = 'none';
}

async function iniciarApp(){
  try{
    if(navigator.onLine){
      const {data, error} = await sb.from('usuarios').select('*').limit(1);
      if(error) throw error;
      if(!data || data.length===0){
        document.getElementById('cardPrimeraVez').style.display='block';
        document.getElementById('cardLoginNormal').style.display='none';
        return;
      }
    }
  }catch(err){
    console.error(err);
    // seguimos: puede que ya haya una sesión guardada para retomar sin internet
  }

  // Si venimos de "Salir" del contador, forzamos mostrar el login (no reusar la sesión).
  if(localStorage.getItem('forzar_login')){
    localStorage.removeItem('forzar_login');
    try{ sessionStorage.removeItem('app_sesion'); }catch(e){}
    document.getElementById('cardLoginNormal').style.display='block';
    document.getElementById('loginUsuario').focus();
    return;
  }

  // ¿Ya había una sesión abierta en esta pestaña del navegador? (sobrevive a un recargo accidental)
  const sesionGuardada = sessionStorage.getItem('app_sesion');
  if(sesionGuardada){
    try{
      const sesion = JSON.parse(sesionGuardada);
      if(navigator.onLine){
        const {data, error} = await sb.from('usuarios').select('*').eq('id', sesion.id).eq('activo', true).maybeSingle();
        if(!error && data){ await entrarComo(data); return; }
      } else {
        // Sin internet: confiamos en la sesión ya validada anteriormente en este navegador
        await entrarComo(sesion);
        return;
      }
    }catch(e){ console.error(e); }
  }

  document.getElementById('cardLoginNormal').style.display='block';
  document.getElementById('loginUsuario').focus();
}

async function crearCuentaDueno(){
  const msgEl = document.getElementById('setupMsg');
  const nombre = document.getElementById('setupNombre').value.trim();
  const password = document.getElementById('setupPassword').value;
  if(!nombre || !password){ msgEl.textContent='Completa nombre y contraseña.'; msgEl.className='msg err'; return; }
  try{
    const {data, error} = await sb.from('usuarios').insert({nombre, rol:'dueno', password}).select().single();
    if(error) throw error;
    await entrarComo(data);
  }catch(err){
    msgEl.textContent = 'Error: ' + (err.message||err); msgEl.className='msg err';
  }
}

async function intentarLogin(){
  const msgEl = document.getElementById('loginMsg');
  const nombre = document.getElementById('loginUsuario').value.trim();
  const password = document.getElementById('loginPassword').value;
  if(!nombre || !password){ msgEl.textContent='Completa usuario y contraseña.'; msgEl.className='msg err'; return; }

  if(navigator.onLine){
    try{
      const {data, error} = await sb.from('usuarios').select('*').ilike('nombre', nombre).eq('activo', true).limit(1);
      if(error) throw error;
      const usuario = (data||[])[0];
      if(!usuario || usuario.password !== password){
        msgEl.textContent = 'Usuario o contraseña incorrectos.'; msgEl.className='msg err';
        return;
      }
      // Guardamos en el teléfono a cualquiera que inicie sesión aquí (vendedor, administrador o
      // dueño), para que pueda volver a entrar sin internet más tarde — solo el primer ingreso
      // del día necesita señal, igual que en Ventas/Contar Inventario.
      const cache = lsGet('app_cache_login_usuarios', []);
      const idx = cache.findIndex(u=>u.id===usuario.id);
      if(idx>=0) cache[idx]=usuario; else cache.push(usuario);
      lsSet('app_cache_login_usuarios', cache);
      await entrarComo(usuario);
    }catch(err){
      intentarLoginOffline(nombre, password, msgEl);
    }
  } else {
    intentarLoginOffline(nombre, password, msgEl);
  }
}

async function intentarLoginOffline(nombre, password, msgEl){
  const cache = lsGet('app_cache_login_usuarios', []);
  const usuario = cache.find(u=>u.nombre.toLowerCase()===nombre.trim().toLowerCase() && u.password===password);
  if(!usuario){
    msgEl.textContent = 'Sin internet: no hay una sesión guardada con esos datos. Conéctate al menos una vez para poder entrar sin conexión después.';
    msgEl.className = 'msg err';
    return;
  }
  await entrarComo(usuario);
}

async function entrarComo(usuario){
  usuarioActual = {id:usuario.id, nombre:usuario.nombre, rol:usuario.rol, almacen_id:usuario.almacen_id};
  sessionStorage.setItem('app_sesion', JSON.stringify(usuarioActual));
  document.getElementById('seccionLogin').style.display='none';

  if(usuarioActual.rol === 'contador'){
    // El contador solo cuenta inventario. Lo llevamos directo al contador,
    // guardando su sesión para que el contador sepa quién es.
    try{ localStorage.setItem('cnt_sesion_usuario', JSON.stringify({id:usuarioActual.id, nombre:usuarioActual.nombre})); }catch(e){}
    window.location.href = 'contar.html';
    return;
  }

  if(usuarioActual.rol === 'vendedor'){
    document.getElementById('appTitle').textContent = '🧾 Ventas';
    document.getElementById('connPill').style.display='inline';
    document.getElementById('rolPill').style.display='none';
    document.getElementById('puestoActualLabel').style.display='inline';
    document.getElementById('btnAbrirMenu').style.display='flex';
    document.getElementById('ventaDiaHeaderPill').style.display='inline';
    document.getElementById('drawerNavVentas').style.display='block';
    await cargarAjustesCompartidos();
    { const b=document.getElementById('vbtnMayoreo'); if(b) b.style.display = puedeMayoreoVenta() ? 'block' : 'none'; }
      // SIEMPRE al final: lo que el dueño mandó a esconder manda sobre lo anterior.
    try{ aplicarPestanasOcultas(); }catch(e){}
    document.getElementById('drawerNavGestion').style.display='none';
    document.getElementById('appVentas').style.display='block';
    actualizarConexionUI();
    await cargarCatalogoVentas();
    // Si el vendedor tiene puesto fijo, se usa ese. Si NO tiene (trabajadora que cubre
    // varios puestos), se le pregunta en cuál va a trabajar hoy — pero solo UNA VEZ al día.
    let almacenElegido = usuarioActual.almacen_id;
    esVendedorComodin = !usuarioActual.almacen_id; // sin puesto fijo = comodín
    if(!almacenElegido){
      // ¿Ya eligió puesto hoy? Lo recordamos en el teléfono con la fecha, para no
      // volver a preguntarle cada vez que abre o se actualiza la app durante el día.
      const hoy = fechaHoyLocal();
      const guardado = lsGet('comodin_puesto_' + usuarioActual.id, null);
      if(guardado && guardado.fecha === hoy && ALMACENES.some(a=>a.id===guardado.almacen_id)){
        almacenElegido = guardado.almacen_id; // reusar el puesto elegido hoy
      } else {
        almacenElegido = await pedirPuestoDelDia();
        if(!almacenElegido){
          // No eligió puesto: cerrar sesión para no dejarlo en un estado sin puesto.
          cerrarSesion();
          return;
        }
        lsSet('comodin_puesto_' + usuarioActual.id, {almacen_id: almacenElegido, fecha: hoy});
      }
      usuarioActual.almacen_id = almacenElegido;
    }
    const almacen = ALMACENES.find(a=>a.id===almacenElegido);
    puestoActual = {id: almacenElegido, nombre: almacen?almacen.nombre:'Puesto'};
    // Solo la trabajadora comodín ve el botón "Cambiar de puesto"
    document.getElementById('btnCambiarPuesto').style.display = esComodin() ? 'block' : 'none';
    await abrirPanelVenta();
  } else {
    document.getElementById('appTitle').textContent = '📦 Gestión de Almacenes';
    document.getElementById('connPill').style.display='inline';
    document.getElementById('puestoActualLabel').style.display='none';
    document.getElementById('ventaDiaHeaderPill').style.display='none';
    document.getElementById('btnAbrirMenu').style.display='flex';
    document.getElementById('drawerNavVentas').style.display='none';
    document.getElementById('drawerNavGestion').style.display='block';
    const pill = document.getElementById('rolPill');
    pill.style.display='inline';
    pill.textContent = `${usuarioActual.nombre} · ${usuarioActual.rol==='dueno'?'Dueño':'Administrador'}`;
    document.getElementById('appGestion').style.display='block';
    await cargarAjustesCompartidos();   // qué pestañas mandó esconder el dueño
    aplicarRestriccionesDeRol();
    actualizarConexionAdminUI();
    cargarTodo();
    revisarComisionesAuto();   // avisa si quedó alguna comisión sin generar
    revisarCajaAuto();         // avisa si falta dinero por registrar o hay ventas sin cerrar
  }
}

// Le muestra a una trabajadora sin puesto fijo los puntos de venta disponibles
// (los que empiezan con "P ") para que elija en cuál va a trabajar hoy.
// Devuelve el id del almacén elegido, o null si canceló.
function pedirPuestoDelDia(){
  return new Promise(resolve=>{
    const puntosDeVenta = ALMACENES.filter(a=> /^p\s/i.test((a.nombre||'').trim()));
    if(puntosDeVenta.length === 0){
      alert('No hay puntos de venta creados. Avísale al dueño.');
      resolve(null); return;
    }
    const cont = document.getElementById('modalPuestoDia');
    const lista = document.getElementById('modalPuestoLista');
    lista.innerHTML = puntosDeVenta.map(a=>
      `<button class="primary" style="width:100%; margin-bottom:8px" onclick="__elegirPuestoDia(${a.id})">${a.nombre}</button>`
    ).join('');
    cont.style.display = 'flex';
    window.__elegirPuestoDia = (id)=>{
      cont.style.display = 'none';
      delete window.__elegirPuestoDia;
      resolve(id);
    };
  });
}

// Permite a la trabajadora comodín cambiar de puesto durante el día (por si la mandan
// a cubrir otro). Verifica que no deje una venta a medias antes de cambiar.
async function cambiarPuestoComodin(){
  if(!esComodin()) return;
  if(carrito.length > 0 || (typeof cobrosEnCarrito!=='undefined' && cobrosEnCarrito.length > 0)){
    alert('Tienes una venta a medias en este puesto. Termina o cierra el día antes de cambiarte de puesto, para no perder nada.');
    return;
  }
  cerrarMenu();
  const nuevoPuesto = await pedirPuestoDelDia();
  if(!nuevoPuesto) return; // canceló
  const hoy = fechaHoyLocal();
  lsSet('comodin_puesto_' + usuarioActual.id, {almacen_id: nuevoPuesto, fecha: hoy});
  usuarioActual.almacen_id = nuevoPuesto;
  const almacen = ALMACENES.find(a=>a.id===nuevoPuesto);
  puestoActual = {id: nuevoPuesto, nombre: almacen?almacen.nombre:'Puesto'};
  document.getElementById('puestoActualLabel').textContent = 'Puesto: ' + puestoActual.nombre;
  await abrirPanelVenta();
  try{ cargarRecepcionesHoy(); }catch(e){}
  alert('Ahora estás trabajando en: ' + puestoActual.nombre);
}

function cerrarSesion(){
  // Aviso si hay cosas sin subir: no se pierden, pero que lo sepa antes de irse.
  try{
    const nPend = contarPendientesTotales();
    if(nPend > 0 && !confirm(`Tienes ${nPend} cosa${nPend===1?'':'s'} sin subir todavía.\n\nNo se pierden: quedan guardadas en ESTE teléfono y se suben cuando haya señal. Pero no borres los datos de la app ni cambies de teléfono hasta que suban.\n\n¿Cerrar sesión de todas formas?`)) return;
  }catch(e){}
  sessionStorage.removeItem('app_sesion');
  // Lógica: cerrar sesión = fin del turno. Si es una comodín, al volver a entrar debe poder
  // elegir OTRO puesto (mañana en uno, tarde en otro). El recuerdo del puesto solo sirve
  // para recargas accidentales DENTRO del mismo turno, no entre sesiones.
  if(usuarioActual && esVendedorComodin){
    try{ localStorage.removeItem('comodin_puesto_' + usuarioActual.id); }catch(e){}
  }
  __hoyYaAbierto = false;
  usuarioActual = null; puestoActual = null; carrito = []; modoLocal = false; ventaDiaAbiertaId = null; ventaActualInicio = 0;

  cerrarMenu();
  document.getElementById('appVentas').style.display='none';
  document.getElementById('appGestion').style.display='none';
  document.getElementById('btnAbrirMenu').style.display='none';
  document.getElementById('connPill').style.display='none';
  document.getElementById('rolPill').style.display='none';
  document.getElementById('puestoActualLabel').style.display='none';
  document.getElementById('ventaDiaHeaderPill').style.display='none';
  document.getElementById('drawerNavVentas').style.display='none';
  document.getElementById('drawerNavGestion').style.display='none';
  document.getElementById('appTitle').textContent = '🏠 Mi Negocio';

  document.getElementById('seccionLogin').style.display='block';
  document.getElementById('cardLoginNormal').style.display='block';
  document.getElementById('loginUsuario').value=''; document.getElementById('loginPassword').value='';
}

// ============================================================
// ESTADÍSTICAS (solo dueño) — panorama completo del negocio
// ============================================================
// ══════════════════════════════════════════════════════════════════
// 🔎 REVISIÓN DEL DÍA (solo dueño) — SOLO LECTURA
// Esta función NUNCA escribe, borra ni modifica datos. Solo hace consultas
// (select) y muestra alertas. Es físicamente incapaz de romper la operación.
// ══════════════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════════
// 🎛️ SALA DE CONTROL — métricas completas + alertas anti-robo.
// La lógica de análisis vive en analizarNegocio() (función PURA: recibe los datos ya leídos
// y devuelve {m, alertas, tablas} — sin tocar la base ni el DOM, para poder probarla).
// ══════════════════════════════════════════════════════════════════

function fijarRango(tipo){
  const hoy = new Date();
  const iso = d => { const z=new Date(d.getTime()-d.getTimezoneOffset()*60000); return z.toISOString().slice(0,10); };
  let desde, hasta = iso(hoy);
  if(tipo==='hoy'){ desde = iso(hoy); }
  else if(tipo==='ayer'){ const a=new Date(hoy); a.setDate(a.getDate()-1); desde=iso(a); hasta=iso(a); }
  else if(tipo==='7'){ const a=new Date(hoy); a.setDate(a.getDate()-6); desde=iso(a); }
  else if(tipo==='30'){ const a=new Date(hoy); a.setDate(a.getDate()-29); desde=iso(a); }
  else if(tipo==='mes'){ desde = iso(new Date(hoy.getFullYear(), hoy.getMonth(), 1)); }
  document.getElementById('analizadorFecha').value = desde;
  document.getElementById('analizadorHasta').value = hasta;
  cargarAnalizador();
}
