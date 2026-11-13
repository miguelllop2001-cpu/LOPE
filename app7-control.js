// LOPE · Mi Negocio — Errores, Sala de Control, reposición, recepción, pestañas, mínimos y Resumen del día
// (Este archivo solo tiene funciones. Lo que se ejecuta al abrir la app está en app8-arranque.js)

// ---- MAYOREO ----// ---- MAYOREO ----
// El almacén de mayoreo se reconoce por el nombre (empieza con "MAYOREO").
// ================== CAPTURA DE ERRORES (para la pestaña 🚨 Errores del dueño) ==================
// Guarda cada fallo en la tabla 'errores' de Supabase. Si no hay internet, lo deja en cola
// local y lo sube solo cuando vuelve la conexión. Así el dueño ve fallos de cualquier celular.
function registrarError(donde, mensaje, detalle){
  try{
    if(!mensaje) return;
    const verEl=document.getElementById('versionApp');
    const reg={
      usuario: (usuarioActual&&usuarioActual.nombre)||'(sin sesión)',
      donde: String(donde||'').slice(0,200),
      mensaje: String(mensaje||'').slice(0,600),
      detalle: detalle?String(detalle).slice(0,1500):null,
      version: (verEl&&verEl.textContent)||'',
      en_linea: !!navigator.onLine,
      creado_en: new Date().toISOString()
    };
    let cola=lsGet('errores_cola', []);
    // evita duplicar el mismo error repetido en menos de 4 segundos
    const ultimo=cola[cola.length-1];
    if(ultimo && ultimo.mensaje===reg.mensaje && ultimo.donde===reg.donde && (Date.parse(reg.creado_en)-Date.parse(ultimo.creado_en))<4000) return;
    cola.push(reg); if(cola.length>300) cola=cola.slice(-300);
    lsSet('errores_cola', cola);
    flushErrores();
  }catch(_){}
}
async function flushErrores(){
  if(__colasOcupadas['errores_cola']) return;   // que no corran dos a la vez y se borren avisos sin subir
  __colasOcupadas['errores_cola'] = true;
  try{
    if(!navigator.onLine || typeof sb==='undefined' || !sb) return;
    let cola=lsGet('errores_cola', []);
    if(!cola.length) return;
    const lote=cola.slice(0,50);
    const { error }=await sb.from('errores').insert(lote.map(r=>({usuario:r.usuario, donde:r.donde, mensaje:r.mensaje, detalle:r.detalle, version:r.version, en_linea:r.en_linea, creado_en:r.creado_en})));
    if(!error){
      const resto=lsGet('errores_cola', []).slice(lote.length); lsSet('errores_cola', resto);
      if(resto.length){ __colasOcupadas['errores_cola'] = false; return flushErrores(); }
    }
  }catch(_){}
  finally{ __colasOcupadas['errores_cola'] = false; }
}
async function actualizarBadgeErrores(){
  try{
    if(!navigator.onLine || !sb) return;
    const { count }=await sb.from('errores').select('id',{count:'exact', head:true}).eq('resuelto', false);
    const b=document.getElementById('tabBtnErrores');
    if(b){ const base='🚨 Errores'; b.textContent = (count&&count>0) ? (base+' ('+count+')') : base; }
  }catch(_){}
}
// Traduce un error técnico a algo que el dueño entienda, con una pista de qué hacer.
function explicarError(r){
  const t=((r.mensaje||'')+' '+(r.detalle||'')).toLowerCase();
  let titulo, pista;
    // OJO: esto va PRIMERO. "TypeError: Failed to fetch" parece un fallo de programación
    // pero es la conexión que se cortó. Antes caía en la rama de abajo y la tarjeta decía
    // "error de programación", que asusta sin motivo.
    if(/failed to fetch|networkerror|network request failed|load failed|fetch failed|timeout|aborted|err_|necesitas internet/.test(t)){
      titulo='Se cortó la conexión a mitad';
      pista='No es un fallo de la app. Quedó guardado en cola y se sube solo cuando vuelva la señal. Si dice "quedó en cola", no hay que hacer nada.';
    } else if(/is not defined|referenceerror|is not a function|cannot read|null is not|undefined is not|typeerror|syntaxerror/.test(t)){
    titulo='La app tropezó con un fallo interno';
    pista='Es un error de programación (no es culpa del usuario). Mándame esta tarjeta y lo arreglo.';
  } else if(/row-level security|rls|permission|not allowed|violates|policy/.test(t)){
    titulo='La base de datos bloqueó la acción por permisos';
    pista='Falta correr un SQL de permisos en Supabase (o volver a correr TODO_MAYOREO.sql).';
  } else if(/could not find|column|does not exist|schema|relation .* does not exist|undefined column/.test(t)){
    titulo='Falta una tabla o columna en la base de datos';
    pista='Corre en Supabase el SQL que falta (TODO_MAYOREO.sql / errores.sql).';
  } else if(/bucket not found|storage|object not found/.test(t)){
    titulo='Problema al subir/ver una foto';
    pista='Falta crear el bucket "fotos-mayoreo" (Público) en Storage, o correr permisos_storage_fotos.sql.';
  } else if(/sin conexion|sin conexión|offline/.test(t)){
    titulo='Se cayó el internet a mitad de la acción';
    pista='Quedó guardado en el teléfono y se sube solo al volver la señal.';
  } else if(/negativo|no se puede descontar|no hay tanto|no alcanza|se agotó|solo quedan/.test(t)){
    titulo='No había suficiente mercancía';
    pista='El inventario no alcanzaba para esa venta o extracción. Revisa el stock.';
  } else if(/se revirti|no se completó la venta|no se complet/.test(t)){
    titulo='Una venta no se pudo completar';
    pista='La app devolvió el stock sola (no se perdió mercancía). Que la repitan; si sigue, mándame la tarjeta.';
  } else if(/falta (crear )?el almac|almacén mayoreo/.test(t)){
    titulo='Falta el almacén MAYOREO';
    pista='Crea un almacén cuyo nombre empiece por "MAYOREO".';
  } else {
    titulo='Ocurrió un error';
    pista='Si se repite, mándame esta tarjeta.';
  }
  return {titulo, pista};
}
async function cargarErrores(){
  const cont=document.getElementById('erroresBody');
  if(!cont) return;
  if(!navigator.onLine){ cont.innerHTML='<div class="msg err">Necesitas internet para ver los errores.</div>'; return; }
  cont.textContent='Cargando…';
  try{
    await flushErrores(); // por si este mismo celular tenía errores en cola
    const { data, error }=await sb.from('errores').select('*').order('id',{ascending:false}).limit(300);
    if(error) throw error;
    const rows=data||[];
    actualizarBadgeErrores();
    if(!rows.length){ cont.innerHTML='<div class="empty">✅ Sin errores. Todo bien.</div>'; return; }
    const pend=rows.filter(r=>!r.resuelto).length;
    const fmt=iso=>{ try{ const d=new Date(iso); return d.toLocaleString('es',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}); }catch(_){ return iso||''; } };
    cont.innerHTML='<div style="color:var(--muted);font-size:12px;margin-bottom:10px">'+rows.length+' en total · '+pend+' sin resolver</div>'+rows.map(r=>{
      const resuelto=!!r.resuelto;
      const ex=explicarError(r);
      const dondeBonito = { 'mayoreo/venta':'Vender (mayoreo)','mayoreo/movimiento':'Ingresar/Extraer (mayoreo)','mayoreo/ingreso-extracción':'Ingresar/Extraer (mayoreo)','mayoreo/caja':'Dinero (mayoreo)','aviso':'Aviso en pantalla','cuelgue':'Fallo interno','promesa':'Fallo interno' }[r.donde] || (r.donde||'—');
      const tecnico = ((r.mensaje||'')+(r.detalle?('\n'+r.detalle):'')).replace(/</g,'&lt;');
      return `<div style="border:1px solid var(--border);border-left:4px solid ${resuelto?'var(--green)':'var(--red)'};border-radius:10px;padding:12px;margin-bottom:9px;opacity:${resuelto?'0.65':'1'}">
        <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;align-items:baseline">
          <b style="font-size:15px">${ex.titulo}</b>
          <span style="color:var(--muted);font-size:12px;white-space:nowrap">${fmt(r.creado_en)}</span>
        </div>
        <div style="font-size:13px;margin-top:6px;background:var(--bg,#f6f7f9);border-radius:8px;padding:8px 10px">💡 ${ex.pista}</div>
        <div style="color:var(--muted);font-size:12px;margin-top:8px">
          👤 ${(r.usuario||'?').replace(/</g,'&lt;')} · 📍 ${dondeBonito} · ${r.en_linea?'🟢 el teléfono tenía señal':'🔴 sin señal'} · ${r.version||''}
        </div>
        <details style="margin-top:8px">
          <summary style="cursor:pointer;color:var(--muted);font-size:12px">Detalle técnico (para el programador)</summary>
          <div style="color:var(--muted);font-size:11px;margin-top:5px;word-break:break-word;white-space:pre-wrap">${tecnico}</div>
        </details>
        <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap">
          ${resuelto?`<button class="ghost" style="padding:6px 12px;font-size:12px" onclick="marcarErrorResuelto(${r.id},false)">↩︎ Reabrir</button>`:`<button class="primary" style="padding:6px 12px;font-size:12px" onclick="marcarErrorResuelto(${r.id},true)">✓ Ya lo resolví</button>`}
          <button class="ghost" style="padding:6px 12px;font-size:12px;color:var(--red)" onclick="borrarUnError(${r.id})">🗑 Borrar</button>
        </div>
      </div>`;
    }).join('');
  }catch(e){ cont.innerHTML='<div class="msg err">No se pudo cargar: '+(e.message||e)+' (¿corriste errores.sql?)</div>'; }
}
async function marcarErrorResuelto(id, val){
  if(!navigator.onLine){ alert('Necesitas internet.'); return; }
  try{ const {error}=await sb.from('errores').update({resuelto:!!val}).eq('id',id); if(error) throw error; cargarErrores(); }
  catch(e){ alert('No se pudo: '+(e.message||e)); }
}
async function borrarUnError(id){
  if(!confirm('¿Borrar este error de la lista?')) return;
  if(!navigator.onLine){ alert('Necesitas internet.'); return; }
  try{ const {error}=await sb.from('errores').delete().eq('id',id); if(error) throw error; cargarErrores(); }
  catch(e){ alert('No se pudo: '+(e.message||e)); }
}
async function borrarErroresResueltos(){
  if(!confirm('¿Borrar todos los errores YA marcados como resueltos?')) return;
  if(!navigator.onLine){ alert('Necesitas internet.'); return; }
  try{ const {error}=await sb.from('errores').delete().eq('resuelto',true); if(error) throw error; cargarErrores(); }
  catch(e){ alert('No se pudo: '+(e.message||e)); }
}
async function limpiarTodosErrores(){
  if(!confirm('¿Borrar TODOS los errores (resueltos y sin resolver)? No se puede deshacer.')) return;
  if(!navigator.onLine){ alert('Necesitas internet.'); return; }
  try{ const {error}=await sb.from('errores').delete().gte('id',0); if(error) throw error; lsSet('errores_cola', []); cargarErrores(); }
  catch(e){ alert('No se pudo: '+(e.message||e)); }
}


// (esMayoreo / almacenMayoreo / idsMayoreo / esAlmacenMayoreoId se definen ARRIBA, antes de renderInventario)
// Quién puede administrar el mayoreo (dueño + Dariel) y quién solo vende (Tamy).
// El nombre se compara sin tildes y por palabras, así "Dariel Pérez" o "TAMY R." también valen.
function __nomUsuario(){ return (((usuarioActual&&usuarioActual.nombre)||'')+'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase(); }
function __usuarioEs(nombre){ const s=__nomUsuario(); if(!s) return false; return s===nombre || s.split(/[^a-z0-9]+/).filter(Boolean).includes(nombre); }
function puedeMayoreoAdmin(){ return !!usuarioActual && (usuarioActual.rol==='dueno' || __usuarioEs('dariel')); }
// Tamy vende. Dariel también aparece aquí por si su cuenta quedó como vendedor: así nunca
// se queda sin acceso al mayoreo (si es administrador, ve la pestaña completa).
function puedeMayoreoVenta(){ return !!usuarioActual && (__usuarioEs('tamy') || __usuarioEs('dariel')); }
// Reparto de ganancia del mayoreo: Dariel 60%; del 40% del dueño, vendedor 10% del pool,
// del restante admin jk 20%, y el dueño se queda el resto.
function repartoMayoreo(G){
  G = Number(G)||0;
  const r2 = n => Math.round(n*100)/100;
  const pool = G*0.40; // lado del dueño (de aquí salen Tamy y jk)
  const dariel   = r2(G*0.60);
  const vendedor = r2(pool*0.10);
  const adminJk  = r2((pool - pool*0.10)*0.20);
  const dueno    = r2(G - dariel - vendedor - adminJk); // absorbe el redondeo → siempre suma G
  return { dariel, vendedor, adminJk, dueno };
}

function repartoMayoreoFull(costo, ganancia){
  costo=Number(costo)||0; ganancia=Number(ganancia)||0;
  const r2=n=>Math.round(n*100)/100;
  const PARTE_DARIEL = 0.60; // Dariel: 60% de la ganancia
  const PARTE_DUENO  = 0.40; // Lado del dueño: 40% de la ganancia (de aquí salen Tamy y jk)
  const total=r2(costo + ganancia);
  const inversion=r2(costo);
  const darielGan=r2(ganancia*PARTE_DARIEL);
  const darielTotal=r2(inversion + darielGan);
  const pool = ganancia*PARTE_DUENO;
  const vendedor=r2(pool*0.10);
  const adminJk=r2((pool - pool*0.10)*0.20);
  // El dueño absorbe TODO el redondeo: es lo que falta para llegar al total exacto.
  const dueno=r2(total - darielTotal - vendedor - adminJk);
  return {inversion, darielGan, darielTotal, vendedor, adminJk, dueno};
}


function analizarNegocio(d){
  const { dias, items, movimientos, caja, deudas, devoluciones, inventario, productos, almacenes, usuarios } = d;
  const nombreAlm = id => { const a=(almacenes||[]).find(x=>x.id===id); return a?a.nombre:('Puesto '+id); };
  const nombreProd = id => { const p=(productos||[]).find(x=>x.id===id); return p?p.nombre:('Producto '+id); };
  const costoProd = id => Number(((productos||[]).find(x=>x.id===id)||{}).costo || 0);
  const nombreUser = id => { const u=(usuarios||[]).find(x=>x.id===id); return u?u.nombre:(id?('Usuario '+id):'—'); };

  const cerrados = (dias||[]).filter(x=>x.cerrado);
  const itemsPorDia = {};
  (items||[]).forEach(it=>{ (itemsPorDia[it.venta_dia_id]=itemsPorDia[it.venta_dia_id]||[]).push(it); });

  // ---------- MÉTRICAS DE VENTA ----------
  let ventaTotal=0, gananciaTotal=0, unidades=0;
  const ventaProd={}, ganProd={}, uniProd={}, ventaPuesto={}, ganPuesto={}, ventaVend={}, ganVend={};
  cerrados.forEach(dia=>{
    ventaTotal += Number(dia.total||0);
    const reales = itemsRealesDeVenta(itemsPorDia[dia.id]||[], dia.total);
    let gDia=0;
    reales.forEach(it=>{
      const g = Number(it.cantidad)*(Number(it.precio_venta)-Number(it.costo));
      gananciaTotal += g; gDia += g; unidades += Number(it.cantidad);
      ventaProd[it.producto_id]=(ventaProd[it.producto_id]||0)+Number(it.cantidad)*Number(it.precio_venta);
      ganProd[it.producto_id]=(ganProd[it.producto_id]||0)+g;
      uniProd[it.producto_id]=(uniProd[it.producto_id]||0)+Number(it.cantidad);
    });
    ventaPuesto[dia.almacen_id]=(ventaPuesto[dia.almacen_id]||0)+Number(dia.total||0);
    ganPuesto[dia.almacen_id]=(ganPuesto[dia.almacen_id]||0)+gDia;
    if(dia.usuario_id){ ventaVend[dia.usuario_id]=(ventaVend[dia.usuario_id]||0)+Number(dia.total||0); ganVend[dia.usuario_id]=(ganVend[dia.usuario_id]||0)+gDia; }
  });
  const margen = ventaTotal>0 ? gananciaTotal/ventaTotal*100 : 0;
  const ticket = cerrados.length ? ventaTotal/cerrados.length : 0;
  const puntos = (almacenes||[]).filter(esPuntoVenta);

  // ---------- CAJA / DINERO ----------
  const ing = (caja||[]).filter(c=>c.tipo==='ingreso');
  const egr = (caja||[]).filter(c=>c.tipo==='egreso');
  const sum = arr => arr.reduce((s,c)=>s+Number(c.monto||0),0);
  const entro = sum(ing), salio = sum(egr);
  const efectIn = sum(ing.filter(c=>c.metodo==='efectivo'));
  const tarjIn = sum(ing.filter(c=>c.metodo==='tarjeta'));
  const ventaEnCaja = sum(ing.filter(c=>c.categoria==='venta'));
  const egrOtro = egr.filter(c=>c.categoria==='otro');

  // ---------- INVENTARIO ----------
  const valorInv = (inventario||[]).reduce((s,r)=> s + Number(r.cantidad)*costoProd(r.producto_id), 0);
  const unidadesInv = (inventario||[]).reduce((s,r)=> s + Number(r.cantidad), 0);

  // ---------- DEUDAS / DEVOLUCIONES ----------
  const comisionesMonto = (deudas||[]).filter(x=>x.clave_comision).reduce((s,x)=>s+Number(x.monto||0),0);
  const meDebenPend = (deudas||[]).filter(x=>x.tipo==='me_deben' && !x.pagada).reduce((s,x)=>s+Number(x.monto||0),0);
  const yoDeboPend = (deudas||[]).filter(x=>x.tipo==='debo' && !x.pagada).reduce((s,x)=>s+Number(x.monto||0),0);
  const devMonto = (devoluciones||[]).reduce((s,x)=>s+Number(x.cantidad)*Number(x.precio_venta),0);

  // ---------- MERCANCÍA QUE SALIÓ SIN VENTA NI TRASLADO ----------
  // Una salida (extraccion) es legítima si está ligada a una venta (venta_dia_id) o su nota lo dice.
  // Los traslados son otro tipo y mueven mercancía ENTRE almacenes (no "desaparece"). Todo lo demás
  // es una salida de mercancía sin destino claro → hay que revisarla.
  const salidasSosp = (movimientos||[]).filter(mv => mv.tipo==='extraccion' && !mv.venta_dia_id && !/venta|ajuste|recuento|correcc|excel/i.test(mv.nota||''));
  const valorSalidasSosp = salidasSosp.reduce((s,mv)=> s + Number(mv.cantidad)*costoProd(mv.producto_id), 0);
  const ingresosManuales = (movimientos||[]).filter(mv => mv.tipo==='ingreso' && !/compra|pedido|devoluc/i.test(mv.nota||''));

  // ---------- TABLAS ----------
  const topPor = obj => Object.keys(obj).map(pid=>({id:Number(pid), v:obj[pid]})).sort((a,b)=>b.v-a.v);
  const topProductos = topPor(ventaProd).slice(0,8).map(x=>({nombre:nombreProd(x.id), venta:x.v, ganancia:ganProd[x.id]||0, unid:uniProd[x.id]||0}));
  const porPuesto = Object.keys(ventaPuesto).map(id=>({nombre:nombreAlm(Number(id)), venta:ventaPuesto[id], ganancia:ganPuesto[id]||0})).sort((a,b)=>b.venta-a.venta);
  const porVendedor = Object.keys(ventaVend).map(id=>({nombre:nombreUser(Number(id)), venta:ventaVend[id], ganancia:ganVend[id]||0})).sort((a,b)=>b.venta-a.venta);

  // ---------- VENTAS POR DÍA (tendencia del rango) ----------
  const porDiaMap = {};
  cerrados.forEach(dia=>{
    const f = dia.fecha;
    if(!porDiaMap[f]) porDiaMap[f] = {fecha:f, venta:0, ganancia:0, uds:0};
    porDiaMap[f].venta += Number(dia.total||0);
    itemsRealesDeVenta(itemsPorDia[dia.id]||[], dia.total).forEach(it=>{
      porDiaMap[f].ganancia += Number(it.cantidad)*(Number(it.precio_venta)-Number(it.costo));
      porDiaMap[f].uds += Number(it.cantidad);
    });
  });
  const ventasPorDia = Object.values(porDiaMap).sort((a,b)=> a.fecha<b.fecha?-1:1);

  // ---------- CAPITAL PARADO (en stock pero NO se vendió en el rango) ----------
  const stockPorProd = {};
  (inventario||[]).forEach(r=>{ stockPorProd[r.producto_id] = (stockPorProd[r.producto_id]||0) + Number(r.cantidad||0); });
  const estancados = Object.keys(stockPorProd)
    .filter(pid => stockPorProd[pid] > 0 && !(uniProd[pid] > 0))
    .map(pid => ({ nombre: nombreProd(Number(pid)), uds: stockPorProd[pid], valor: stockPorProd[pid]*costoProd(Number(pid)) }))
    .sort((a,b)=> b.valor - a.valor);
  const valorEstancado = estancados.reduce((s,x)=>s+x.valor, 0);

  // ---------- REPOSICIÓN: hay en bodega y falta en algún puesto ----------
  const invPorProdAlm = {};
  (inventario||[]).forEach(r=>{ (invPorProdAlm[r.producto_id]=invPorProdAlm[r.producto_id]||{})[r.almacen_id]=Number(r.cantidad||0); });
  const puestosIds = puntos.map(a=>a.id);
  const bodegas = (almacenes||[]).filter(a=>!esPuntoVenta(a) && !esMayoreo(a)); // MAYOREO va aparte: nunca se mezcla con lo normal
  let reposicionFaltan = 0;
  Object.keys(invPorProdAlm).forEach(pid=>{
    const porAlm = invPorProdAlm[pid];
    const enBodega = bodegas.reduce((s,b)=> s + (porAlm[b.id]||0), 0);
    if(enBodega <= 0) return;
    puestosIds.forEach(pu=>{ if((porAlm[pu]||0) <= 0) reposicionFaltan++; });
  });

  // ---------- COMPARACIÓN CON EL PERÍODO ANTERIOR ----------
  let ventaPrev = null, gananciaPrev = null;
  if(d.prev && d.prev.dias){
    const itPrev = {}; (d.prev.items||[]).forEach(it=>{ (itPrev[it.venta_dia_id]=itPrev[it.venta_dia_id]||[]).push(it); });
    ventaPrev = 0; gananciaPrev = 0;
    d.prev.dias.filter(x=>x.cerrado).forEach(dia=>{
      ventaPrev += Number(dia.total||0);
      itemsRealesDeVenta(itPrev[dia.id]||[], dia.total).forEach(it=>{ gananciaPrev += Number(it.cantidad)*(Number(it.precio_venta)-Number(it.costo)); });
    });
  }

  const m = {
    // ventas
    ventaTotal, gananciaTotal, margen, ticket, unidades,
    diasCerrados: cerrados.length, numPuntos: puntos.length,
    ventaPrev, gananciaPrev,
    // caja
    entro, salio, neto: entro-salio, efectIn, tarjIn, ventaEnCaja,
    // inventario
    valorInv, unidadesInv, valorEstancado, numEstancados: estancados.length,
    // reposición
    reposicionFaltan,
    // deudas/dev
    comisionesMonto, meDebenPend, yoDeboPend, devMonto, numDev: (devoluciones||[]).length,
    // mercancía sospechosa
    numSalidasSosp: salidasSosp.length, valorSalidasSosp,
  };

  // ══════════════════ ALERTAS ══════════════════
  const A = [];
  const add = (cat, nivel, texto) => A.push({cat, nivel, texto});

  // ---- MERCANCÍA (robo de artículos) ----
  salidasSosp.forEach(mv=>{
    add('mercancia','alta',`Salió mercancía SIN venta ni traslado: ${nombreProd(mv.producto_id)} ×${num(mv.cantidad)} de "${nombreAlm(mv.almacen_origen_id)}"${mv.nota?` — nota: "${mv.nota}"`:' — sin nota'}. La mercancía solo debería moverse entre almacenes/puestos o salir por venta. Revisa a dónde fue.`);
  });
  // Ventas cerradas SIN descontar inventario (mercancía vendida que no bajó del stock)
  // ¿Qué ventas SÍ descontaron? Se pasa desde afuera (`descontados`) consultando los movimientos
  // por venta_dia_id SIN filtrar por fecha — porque `creado_en` está en UTC y la fecha de la venta
  // es local: una venta de la noche genera su movimiento con fecha UTC del día siguiente, y si
  // filtráramos por rango la perderíamos y la venta parecería "no descontó" (falso positivo).
  const descontados = d.descontados || new Set((movimientos||[]).filter(mv=>mv.venta_dia_id).map(mv=>mv.venta_dia_id));
  cerrados.forEach(dia=>{
    if(!descontados.has(dia.id) && Number(dia.total||0) > 0){
      add('mercancia','alta',`"${nombreAlm(dia.almacen_id)}" cerró una venta de $${num(dia.total)} que NO descontó inventario. Se cobró pero la mercancía no bajó del stock — úsala con "Descontar ventas cerradas que no descontaron".`);
    }
  });

  // ---- VENTAS (manipulación) ----
  cerrados.forEach(dia=>{
    const crudos = itemsPorDia[dia.id]||[];
    const reales = itemsRealesDeVenta(crudos, dia.total);
    const sumaReal = reales.reduce((s,it)=>s+Number(it.cantidad)*Number(it.precio_venta),0);
    if(crudos.length===0 && Number(dia.total||0)>0){
      add('ventas','alta',`"${nombreAlm(dia.almacen_id)}" tiene una venta de $${num(dia.total)} con CERO artículos guardados. Se cobró sin registrar qué se vendió — posible artículo borrado antes de guardar.`);
    } else if(sumaReal>0 && sumaReal < Number(dia.total)-0.5){
      add('ventas','alta',`En "${nombreAlm(dia.almacen_id)}" el total cobrado ($${num(dia.total)}) es MAYOR que los artículos registrados ($${num(sumaReal)}). Faltan $${num(Number(dia.total)-sumaReal)} de mercancía — pudieron quitar un artículo y cobrar igual.`);
    }
  });
  // Ganancia negativa (vendió bajo costo)
  cerrados.forEach(dia=>{
    let g=0; itemsRealesDeVenta(itemsPorDia[dia.id]||[], dia.total).forEach(it=>{ g += Number(it.cantidad)*(Number(it.precio_venta)-Number(it.costo)); });
    if(g < -0.5) add('ventas','alta',`"${nombreAlm(dia.almacen_id)}" tuvo GANANCIA NEGATIVA ($${num(g)}): vendió por debajo del costo. Revisa precios (o un costo mal puesto).`);
  });
  // Productos vendidos sin costo (infla ganancia y comisión)
  const sinCosto = (productos||[]).filter(p=>!p.costo || Number(p.costo)===0);
  const vendidosSinCosto = sinCosto.filter(p => (items||[]).some(it=>it.producto_id===p.id));
  if(vendidosSinCosto.length){
    add('ventas','alta',`${vendidosSinCosto.length} producto(s) se vendieron SIN costo (${vendidosSinCosto.slice(0,4).map(p=>p.nombre).join(', ')}${vendidosSinCosto.length>4?'…':''}). Infla la ganancia y la comisión del vendedor sale de más. Ponles el costo.`);
  }
  // Venta $0 cerrada
  cerrados.forEach(dia=>{ if(Number(dia.total||0)===0) add('ventas','media',`"${nombreAlm(dia.almacen_id)}" cerró con venta de $0. Confirma que de verdad no vendió.`); });
  // Puntos que no cerraron
  const cerroSet = new Set(cerrados.map(x=>x.almacen_id));
  puntos.forEach(a=>{ if(!cerroSet.has(a.id)) add('ventas','media',`El punto "${a.nombre}" no cerró el día en este rango. Si trabajó, puede haber ventas sin registrar.`); });

  // ---- DINERO ----
  // Venta cobrada vs dinero registrado en caja como "venta"
  if(ventaTotal>0 && ventaEnCaja>0){
    const dif = ventaTotal - ventaEnCaja;
    if(Math.abs(dif) > Math.max(50, ventaTotal*0.05)){
      if(dif>0) add('dinero','media',`Se vendieron $${num(ventaTotal)} pero a la caja entraron $${num(ventaEnCaja)} como venta (diferencia $${num(dif)}). Suele ser normal (cobros de deuda que se pagan con ese efectivo, o depósitos que aún no se hacen), pero conviene verificar quién manejó el dinero.`);
      else add('dinero','baja',`En caja entró más como venta ($${num(ventaEnCaja)}) que el total vendido ($${num(ventaTotal)}). Diferencia de $${num(-dif)} — probablemente sobrantes o depósitos; verifícalo.`);
    }
  }
  // Egresos "otro" (dinero que salió sin categoría clara)
  egrOtro.forEach(c=>{
    add('dinero','media',`Salió dinero SIN categoría clara: $${num(c.monto)} (${c.metodo||'—'})${c.concepto?` — "${c.concepto}"`:''}. Confirma que sea un gasto real del negocio.`);
  });
  // Salió más de lo que entró
  if(salio > entro && salio>0) add('dinero','media',`En este rango salió más dinero de caja ($${num(salio)}) del que entró ($${num(entro)}). Revisa los egresos.`);

  // ---- INVENTARIO ----
  (inventario||[]).forEach(r=>{
    if(Number(r.cantidad) < 0) add('inventario','alta',`"${nombreProd(r.producto_id)}" en "${nombreAlm(r.almacen_id)}" está en NEGATIVO (${num(r.cantidad)}). No debería pasar nunca — señal de un descuadre serio.`);
  });
  const vendidosHoy = new Set((items||[]).map(it=>it.producto_id));
  (inventario||[]).forEach(r=>{
    if(vendidosHoy.has(r.producto_id) && Number(r.cantidad) >= 0 && Number(r.cantidad) <= 2){
      add('inventario','baja',`"${nombreProd(r.producto_id)}" en "${nombreAlm(r.almacen_id)}" quedó en ${num(r.cantidad)}. Se vendió y casi se agota — conviene surtir.`);
    }
  });
  // Muchas devoluciones
  if((devoluciones||[]).length > 3) add('dinero','media',`Hubo ${devoluciones.length} devoluciones ($${num(devMonto)}). Es bastante — pregunta qué pasó.`);

  // Reposición: aviso resumido (el detalle va en la pestaña Reposición)
  if(reposicionFaltan > 0) add('inventario','media',`Hay ${reposicionFaltan} caso(s) de mercancía que ESTÁ en bodega pero FALTA en algún puesto. Míralo en la pestaña "🚚 Reposición" para surtir.`);

  return { m, alertas: A, tablas: {
    topProductos, porPuesto, porVendedor, ventasPorDia, estancados,
    salidasSosp: salidasSosp.map(mv=>({nombre:nombreProd(mv.producto_id), cant:mv.cantidad, almacen:nombreAlm(mv.almacen_origen_id), nota:mv.nota||'', fecha:(mv.creado_en||'').slice(0,10)}))
  } };
}

// ---------- RENDER ----------
function kpiHTML(label, valor, color, sub){
  return `<div style="background:var(--panel2); border:1px solid var(--border); border-radius:12px; padding:12px 14px; flex:1">
    <div style="color:var(--muted); font-size:11px; text-transform:uppercase; letter-spacing:.03em">${label}</div>
    <div style="font-size:22px; font-weight:800; color:${color||'var(--text)'}; margin-top:2px">${valor}</div>
    ${sub?`<div style="color:var(--muted); font-size:12px; margin-top:2px">${sub}</div>`:''}
  </div>`;
}
function tablaHTML(headers, filas){
  if(!filas.length) return `<div style="color:var(--muted); font-size:13px; padding:6px 0">Sin datos.</div>`;
  const th = headers.map((h,i)=>`<th style="padding:6px 8px; text-align:${i===0?'left':'right'}; color:var(--muted); font-size:12px; border-bottom:1px solid var(--border)">${h}</th>`).join('');
  const tr = filas.map(f=>`<tr>${f.map((c,i)=>`<td style="padding:7px 8px; text-align:${i===0?'left':'right'}; border-bottom:1px solid var(--border)">${c}</td>`).join('')}</tr>`).join('');
  return `<table style="width:100%; border-collapse:collapse; font-size:14px"><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table>`;
}
function seccionHTML(titulo, contenido){
  return `<div style="margin-top:18px"><div style="font-weight:800; font-size:14px; margin-bottom:8px">${titulo}</div>${contenido}</div>`;
}

async function cargarAnalizador(){
  const msgEl = document.getElementById('analizadorMsg');
  const resumenEl = document.getElementById('analizadorResumen');
  const alertasEl = document.getElementById('analizadorAlertas');
  const sinAlertasEl = document.getElementById('analizadorSinAlertas');
  msgEl.textContent = '';
  if(!navigator.onLine){ msgEl.textContent='Necesitas internet para analizar.'; msgEl.className='msg err'; return; }

  const fD = document.getElementById('analizadorFecha');
  const fH = document.getElementById('analizadorHasta');
  if(!fD.value) fD.value = fechaHoyLocal();
  if(!fH.value) fH.value = fD.value;
  let desde = fD.value, hasta = fH.value;
  if(desde > hasta){ const t=desde; desde=hasta; hasta=t; fD.value=desde; fH.value=hasta; }

  document.getElementById('analizadorResumenTitulo').textContent = (desde===hasta) ? `Panel del ${desde}` : `Panel — ${desde} a ${hasta}`;
  resumenEl.textContent = 'Analizando…'; alertasEl.innerHTML=''; sinAlertasEl.style.display='none';

  try{
    // Trae TODAS las filas de una consulta, paginando (Supabase corta en 1000 por defecto).
    const traerTodo = async (hazQuery) => {
      const todo = []; const PAGE=1000; let desde=0;
      for(;;){
        let data, error;
        try{ const r = await hazQuery().range(desde, desde+PAGE-1); data=r.data; error=r.error; }
        catch(e){ error=e; }
        if(error || !data) break;
        todo.push(...data);
        if(data.length < PAGE) break;
        desde += PAGE;
      }
      return todo;
    };
    // Para caja/deudas/movimientos acotamos por creado_en en UTC con 1 día de colchón a cada lado
    // (el desfase UTC↔local), y después filtramos por fecha LOCAL exacta más abajo.
    const menosUnDia = f => { const d=new Date(f+'T00:00:00'); d.setDate(d.getDate()-1); return d.toISOString().slice(0,10); };
    const masUnDia   = f => { const d=new Date(f+'T00:00:00'); d.setDate(d.getDate()+1); return d.toISOString().slice(0,10); };
    const ini = menosUnDia(desde) + 'T00:00:00';
    const fin = masUnDia(hasta) + 'T23:59:59';

    const [dias, productos, inventario, almacenes, usuarios, cajaRaw, deudasRaw, devoluciones, movRaw] = await Promise.all([
      traerTodo(()=> sb.from('ventas_dia').select('*').gte('fecha', desde).lte('fecha', hasta)),
      traerTodo(()=> sb.from('productos').select('*')),
      traerTodo(()=> sb.from('inventario').select('*')),
      traerTodo(()=> sb.from('almacenes').select('*')),
      traerTodo(()=> sb.from('usuarios').select('id,nombre')).catch(()=>[]),
      traerTodo(()=> sb.from('caja_movimientos').select('*').gte('creado_en', ini).lte('creado_en', fin)).catch(()=>[]),
      traerTodo(()=> sb.from('deudas').select('*').gte('creado_en', ini).lte('creado_en', fin)).catch(()=>[]),
      traerTodo(()=> sb.from('devoluciones').select('*').gte('fecha', desde).lte('fecha', hasta)).catch(()=>[]),
      traerTodo(()=> sb.from('movimientos').select('*').gte('creado_en', ini).lte('creado_en', fin)).catch(()=>[])
    ]);
    // creado_en viene en UTC; la fecha de la venta es local. Convertimos a fecha LOCAL para que
    // caja/deudas/movimientos caigan en el mismo día que la venta.
    const fechaLocal = ts => { if(!ts) return ''; const dd=new Date(ts); if(isNaN(dd)) return (ts||'').slice(0,10); const z=new Date(dd.getTime()-dd.getTimezoneOffset()*60000); return z.toISOString().slice(0,10); };
    const enRango = ts => { const s=fechaLocal(ts); return s && s>=desde && s<=hasta; };
    const caja = (cajaRaw||[]).filter(c=>enRango(c.creado_en));
    const deudas = (deudasRaw||[]).filter(x=>enRango(x.creado_en));
    const movimientos = (movRaw||[]).filter(x=>enRango(x.creado_en));

    let items = [];
    const ids = dias.map(d=>d.id);
    let descontados = new Set();
    if(ids.length){
      items = await traerItemsDe(ids, '*');
      // ¿Qué ventas SÍ descontaron? Consulta paginada por venta_dia_id (sin filtrar fecha, y sin
      // quedarse corta en el corte de 1000 filas de Supabase).
      descontados = await idsConMovimiento(ids);
    }

    // Período anterior de igual duración (para comparar venta/ganancia).
    let prev = null;
    try{
      const diasRango = Math.round((new Date(hasta+'T00:00:00') - new Date(desde+'T00:00:00'))/86400000) + 1;
      const pFin = new Date(desde+'T00:00:00'); pFin.setDate(pFin.getDate()-1);
      const pIni = new Date(pFin); pIni.setDate(pIni.getDate() - (diasRango-1));
      const pIniS = pIni.toISOString().slice(0,10), pFinS = pFin.toISOString().slice(0,10);
      const pDias = await traerTodo(()=> sb.from('ventas_dia').select('*').gte('fecha', pIniS).lte('fecha', pFinS));
      let pItems = [];
      const pIds = pDias.map(x=>x.id);
      if(pIds.length) pItems = await traerItemsDe(pIds, 'venta_dia_id, cantidad, precio_venta, costo');
      prev = { dias: pDias, items: pItems };
    }catch(e){ prev = null; }

    const invSinMay = (inventario||[]).filter(i=>!esAlmacenMayoreoId(i.almacen_id));
    const almSinMay = (almacenes||[]).filter(a=>!esMayoreo(a));
    const { m, alertas, tablas } = analizarNegocio({
      dias, items, movimientos, caja, deudas, devoluciones, descontados, prev,
      inventario: invSinMay, productos, almacenes: almSinMay, usuarios
    });

    // ---------- PANEL ----------
    const flechaPct = (act, prev) => {
      if(prev==null || prev===0) return '';
      const pct = (act-prev)/prev*100;
      const arr = pct>=0?'▲':'▼', col = pct>=0?'var(--green)':'var(--red)';
      return ` · <span style="color:${col}">${arr}${num(Math.abs(pct))}%</span> vs antes`;
    };
    let html = `<div class="row" style="flex-wrap:wrap; gap:10px">
      ${kpiHTML('Venta', '$'+num(m.ventaTotal), 'var(--green)', m.diasCerrados+' de '+m.numPuntos+' puntos'+flechaPct(m.ventaTotal, m.ventaPrev))}
      ${kpiHTML('Ganancia', '$'+num(m.gananciaTotal), 'var(--text)', 'margen '+num(m.margen)+'%'+flechaPct(m.gananciaTotal, m.gananciaPrev))}
      ${kpiHTML('Ticket prom.', '$'+num(m.ticket), 'var(--text)', num(m.unidades)+' uds vendidas')}
      ${kpiHTML('Entró a caja', '$'+num(m.entro), 'var(--green)', 'efec $'+num(m.efectIn)+' · tarj $'+num(m.tarjIn))}
      ${kpiHTML('Salió de caja', '$'+num(m.salio), 'var(--red)', 'neto $'+num(m.neto))}
      ${kpiHTML('Valor inventario', '$'+num(m.valorInv), 'var(--text)', num(m.unidadesInv)+' uds en stock')}
      ${kpiHTML('Capital parado', '$'+num(m.valorEstancado), m.valorEstancado?'var(--amber)':'var(--text)', m.numEstancados+' productos sin venderse en el rango')}
      ${kpiHTML('Faltan por surtir', num(m.reposicionFaltan), m.reposicionFaltan?'var(--amber)':'var(--green)', 'hay en bodega, falta en puesto')}
      ${kpiHTML('Me deben', '$'+num(m.meDebenPend), 'var(--amber)', 'pendiente')}
      ${kpiHTML('Yo debo / comisión', '$'+num(m.yoDeboPend), 'var(--red)', 'comisiones $'+num(m.comisionesMonto))}
      ${kpiHTML('Devoluciones', num(m.numDev), m.numDev?'var(--amber)':'var(--text)', '$'+num(m.devMonto))}
      ${kpiHTML('Salidas sin venta', num(m.numSalidasSosp), m.numSalidasSosp?'var(--red)':'var(--green)', '$'+num(m.valorSalidasSosp)+' en mercancía')}
    </div>`;

    html += seccionHTML('🏪 Por punto de venta', tablaHTML(['Punto','Venta','Ganancia'],
      tablas.porPuesto.map(p=>[p.nombre, '$'+num(p.venta), '$'+num(p.ganancia)])));
    if(tablas.porVendedor.length) html += seccionHTML('👤 Por vendedor', tablaHTML(['Vendedor','Venta','Ganancia'],
      tablas.porVendedor.map(p=>[p.nombre, '$'+num(p.venta), '$'+num(p.ganancia)])));
    html += seccionHTML('🏆 Productos más vendidos', tablaHTML(['Producto','Uds','Venta','Ganancia'],
      tablas.topProductos.map(p=>[p.nombre, num(p.unid), '$'+num(p.venta), '$'+num(p.ganancia)])));
    if(tablas.salidasSosp.length) html += seccionHTML('🚨 Mercancía que salió sin venta ni traslado', tablaHTML(['Producto','Cant','Desde','Nota','Fecha'],
      tablas.salidasSosp.map(s=>[s.nombre, num(s.cant), s.almacen, s.nota||'—', s.fecha||'—'])));
    if(tablas.ventasPorDia && tablas.ventasPorDia.length>1) html += seccionHTML('📅 Ventas por día', tablaHTML(['Día','Venta','Ganancia','Uds'],
      tablas.ventasPorDia.map(d=>[d.fecha, '$'+num(d.venta), '$'+num(d.ganancia), num(d.uds)])));
    if(tablas.estancados && tablas.estancados.length) html += seccionHTML('🐌 Capital parado (no se vendió en el rango)', tablaHTML(['Producto','En stock','Valor (costo)'],
      tablas.estancados.slice(0,15).map(e=>[e.nombre, num(e.uds), '$'+num(e.valor)])));

    resumenEl.innerHTML = html;

    // ---------- ALERTAS por categoría ----------
    const cats = [
      {k:'mercancia', t:'📦 Mercancía'},
      {k:'dinero', t:'💵 Dinero'},
      {k:'ventas', t:'🧾 Ventas'},
      {k:'inventario', t:'📉 Inventario'}
    ];
    const orden = {alta:0, media:1, baja:2};
    const color = n => n==='alta'?'var(--red)':n==='media'?'var(--amber)':'var(--muted)';
    const icono = n => n==='alta'?'🔴':n==='media'?'🟠':'🟡';
    if(alertas.length===0){ sinAlertasEl.style.display='block'; }
    else {
      let ah = '';
      cats.forEach(c=>{
        const grupo = alertas.filter(a=>a.cat===c.k).sort((a,b)=>orden[a.nivel]-orden[b.nivel]);
        if(!grupo.length) return;
        ah += `<div style="font-weight:800; font-size:14px; margin:14px 0 6px">${c.t} <span style="color:var(--muted); font-weight:500">(${grupo.length})</span></div>`;
        ah += grupo.map(a=>`<div style="display:flex; gap:10px; padding:11px 4px; border-bottom:1px solid var(--border)">
          <div style="font-size:15px">${icono(a.nivel)}</div>
          <div style="flex:1; color:${color(a.nivel)}; font-size:14px">${a.texto}</div>
        </div>`).join('');
      });
      alertasEl.innerHTML = ah;
    }

    const nAlta = alertas.filter(a=>a.nivel==='alta').length;
    msgEl.textContent = `Análisis listo: ${alertas.length} alerta(s)${nAlta?` — ${nAlta} de alta prioridad 🔴`:''}.`;
    msgEl.className = nAlta ? 'msg err' : 'msg ok';
  }catch(err){
    console.error(err);
    resumenEl.textContent = '';
    msgEl.textContent = 'No se pudo completar el análisis: ' + (err.message||err);
    msgEl.className = 'msg err';
  }
}

// ══════════════════════════════════════════════════════════════════
// 🚚 REPOSICIÓN — qué hay en bodega y falta en los puestos (función pura + carga)
// ══════════════════════════════════════════════════════════════════
function analizarReposicion(d){
  const { inventario, productos, almacenes, umbral, puestoId } = d;
  const nombreProd = id => { const p=(productos||[]).find(x=>x.id===id); return p?p.nombre:('#'+id); };
  const U = Number(umbral)||0;
  const bodegas = (almacenes||[]).filter(a=>!esPuntoVenta(a) && !esMayoreo(a)); // MAYOREO va aparte: nunca se mezcla con lo normal
  let puestos = (almacenes||[]).filter(esPuntoVenta);
  if(puestoId) puestos = puestos.filter(p=>String(p.id)===String(puestoId));
  const invMap = {};
  (inventario||[]).forEach(r=>{ (invMap[r.producto_id]=invMap[r.producto_id]||{})[r.almacen_id]=Number(r.cantidad||0); });
  const porPuesto = puestos.map(pu=>{
    const faltantes = [];
    Object.keys(invMap).forEach(pid=>{
      const porAlm = invMap[pid];
      const enBodega = bodegas.reduce((s,b)=>s+(porAlm[b.id]||0),0);
      if(enBodega<=0) return;                 // si no hay en bodega, no se puede surtir
      const enPuesto = porAlm[pu.id]||0;
      if(enPuesto <= U){                       // hay en bodega y falta (o está bajo) en el puesto
        const dondeHay = bodegas.filter(b=>(porAlm[b.id]||0)>0).map(b=>({almacen:b.nombre, cant:porAlm[b.id]}));
        faltantes.push({ nombre:nombreProd(Number(pid)), enBodega, enPuesto, dondeHay });
      }
    });
    faltantes.sort((a,b)=> a.nombre.localeCompare(b.nombre));
    return { puesto: pu.nombre, id: pu.id, faltantes };
  });
  const total = porPuesto.reduce((s,p)=>s+p.faltantes.length,0);
  return { porPuesto, total, numBodegas: bodegas.length, numPuestos: puestos.length };
}

// Sugerencia inteligente: cuánto pasar a cada puesto según lo que ha vendido (historial).
// porDia = unidades vendidas / días de historial; objetivo = porDia × días a cubrir; sugerido =
// max(0, objetivo − lo que tiene el puesto), limitado por lo que hay en bodega. Función PURA.
function sugerirReposicion(d){
  const { ventasPuestoProd, inventario, productos, almacenes, diasHistorial, diasCubrir, puestoId } = d;
  const nombreProd = id => { const p=(productos||[]).find(x=>x.id===id); return p?p.nombre:('#'+id); };
  const bodegas = (almacenes||[]).filter(a=>!esPuntoVenta(a) && !esMayoreo(a)); // MAYOREO va aparte: nunca se mezcla con lo normal
  let puestos = (almacenes||[]).filter(esPuntoVenta);
  if(puestoId) puestos = puestos.filter(p=>String(p.id)===String(puestoId));
  const invMap = {};
  (inventario||[]).forEach(r=>{ (invMap[r.producto_id]=invMap[r.producto_id]||{})[r.almacen_id]=Number(r.cantidad||0); });
  const dh = Math.max(1, Number(diasHistorial)||30);
  const dc = Math.max(1, Number(diasCubrir)||15);
  const porPuesto = puestos.map(pu=>{
    const ventas = (ventasPuestoProd||{})[pu.id] || {};
    const filas = [];
    Object.keys(ventas).forEach(pid=>{
      const vendidas = Number(ventas[pid])||0;
      if(vendidas<=0) return;
      const porDia = vendidas/dh;
      const objetivo = Math.ceil(porDia*dc);
      const tiene = (invMap[pid] && invMap[pid][pu.id]) || 0;
      const necesita = Math.max(0, objetivo - tiene);
      if(necesita<=0) return;
      const dondeHay = bodegas.filter(b=>((invMap[pid]||{})[b.id]||0)>0)
        .map(b=>({almacenId:b.id, almacen:b.nombre, cant:(invMap[pid]||{})[b.id]}))
        .sort((a,b)=> b.cant-a.cant);
      const enBodega = dondeHay.reduce((s,x)=>s+x.cant,0);
      const sugerido = Math.min(necesita, enBodega);
      if(sugerido<=0) return;
      filas.push({ producto_id:Number(pid), nombre:nombreProd(Number(pid)), vendidas, porDia, objetivo, tiene, enBodega, sugerido, dondeHay });
    });
    filas.sort((a,b)=> b.sugerido - a.sugerido);
    return { puesto:pu.nombre, id:pu.id, filas };
  });
  const total = porPuesto.reduce((s,p)=>s+p.filas.length,0);
  return { porPuesto, total };
}

async function cargarReposicion(){
  const body = document.getElementById('repoBody');
  const msg = document.getElementById('repoMsg');
  msg.textContent='';
  const sel = document.getElementById('repoPuesto');
  if(sel && sel.options.length<=1){
    const puestos = (ALMACENES||[]).filter(esPuntoVenta);
    sel.innerHTML = '<option value="">Todos los puestos</option>' + puestos.map(p=>`<option value="${p.id}">${p.nombre}</option>`).join('');
  }
  if(!navigator.onLine){ msg.textContent='Necesitas internet para revisar.'; msg.className='msg err'; return; }
  body.textContent = 'Revisando…';
  try{
    // Inventario completo (paginado).
    const inv=[]; const PAGE=1000; let desde=0;
    for(;;){ const r=await sb.from('inventario').select('producto_id, almacen_id, cantidad').order('id',{ascending:true}).range(desde,desde+PAGE-1); if(r.error||!r.data)break; inv.push(...r.data); if(r.data.length<PAGE)break; desde+=PAGE; }
    const umbral = Number(document.getElementById('repoUmbral').value)||0;
    const puestoId = document.getElementById('repoPuesto').value || null;
    const { porPuesto, total } = analizarReposicion({ inventario:inv, productos:PRODUCTOS, almacenes:ALMACENES, umbral, puestoId });
    if(!porPuesto.length){ body.innerHTML='<div class="empty">No hay puestos configurados (un puesto es un almacén cuyo nombre empieza con "P ").</div>'; return; }
    let html='';
    porPuesto.forEach(p=>{
      html += `<div style="margin-bottom:16px">
        <div style="font-weight:800; font-size:15px; margin-bottom:6px">${p.puesto} <span style="color:var(--muted); font-weight:500">— ${p.faltantes.length} por surtir</span></div>`;
      if(!p.faltantes.length){ html += `<div style="color:var(--green); font-size:13px">Todo lo que hay en bodega ya está en este puesto. 👍</div>`; }
      else html += tablaHTML(['Producto','En bodega','En puesto','Dónde está'],
        p.faltantes.map(f=>[f.nombre, num(f.enBodega), num(f.enPuesto), f.dondeHay.map(x=>`${x.almacen}: ${num(x.cant)}`).join(', ')||'—']));
      html += `</div>`;
    });
    body.innerHTML = html;
    msg.textContent = total>0 ? `${total} artículo(s) por surtir en total. Muévelos desde Movimientos (traslado).` : 'Nada por surtir. 👍';
    msg.className = total>0 ? 'msg' : 'msg ok';
  }catch(e){ body.textContent=''; msg.textContent='No se pudo revisar: '+(e.message||e); msg.className='msg err'; }
}

// Elegir "para cuántos días surtir" con botones grandes (en vez de escribir números).
function elegirDiasCubrir(n, el){
  const c = document.getElementById('repoCubrir'); if(c) c.value = n;
  document.querySelectorAll('.repo-dia').forEach(b=>{ b.className = 'ghost repo-dia'; });
  if(el) el.className = 'primary repo-dia';
  calcularReposicionInteligente();
}
// Marcar o desmarcar todas las casillas de la sugerencia de golpe.
function marcarTodoRepo(v){
  document.querySelectorAll('#repoIntBody input[type="checkbox"]').forEach(ck=>{ ck.checked = v; });
} // {puestoId: [filas]} para saber qué transferir al confirmar
async function calcularReposicionInteligente(){
  const body = document.getElementById('repoIntBody');
  const msg = document.getElementById('repoIntMsg');
  msg.textContent='';
  if(!navigator.onLine){ msg.textContent='Necesitas internet para calcular.'; msg.className='msg err'; return; }
  // Poblar el selector de puestos si está vacío.
  const selP = document.getElementById('repoPuesto');
  if(selP && selP.options.length<=1){
    const puestos = (ALMACENES||[]).filter(esPuntoVenta);
    selP.innerHTML = '<option value="">Todos los puestos</option>' + puestos.map(p=>`<option value="${p.id}">${p.nombre}</option>`).join('');
  }
  body.textContent = 'Calculando según las ventas…';
  try{
    const diasHistorial = Math.max(1, Number(document.getElementById('repoHist').value)||30);
    const diasCubrir = Math.max(1, Number(document.getElementById('repoCubrir').value)||15);
    const puestoId = document.getElementById('repoPuesto') ? (document.getElementById('repoPuesto').value||null) : null;

    // Inventario completo (paginado)
    const inv=[]; { const PAGE=1000; let desde=0; for(;;){ const r=await sb.from('inventario').select('producto_id, almacen_id, cantidad').order('id',{ascending:true}).range(desde,desde+PAGE-1); if(r.error||!r.data)break; inv.push(...r.data); if(r.data.length<PAGE)break; desde+=PAGE; } }

    // Ventas del historial: ventas_dia cerradas de los puestos en la ventana de días.
    const hoy = new Date(); const corte = new Date(hoy); corte.setDate(corte.getDate() - (diasHistorial-1));
    const iso = d => { const z=new Date(d.getTime()-d.getTimezoneOffset()*60000); return z.toISOString().slice(0,10); };
    const dias = await traerTodasLasFilas(()=> sb.from('ventas_dia').select('id, almacen_id, total, cerrado, fecha').gte('fecha', iso(corte)).lte('fecha', iso(hoy)).order('id',{ascending:true}));
    const cerrados = (dias||[]).filter(d=>d.cerrado);
    const ids = cerrados.map(d=>d.id);
    const items = ids.length ? await traerItemsDe(ids, 'venta_dia_id, producto_id, cantidad, precio_venta') : [];
    const itemsPorDia = {}; items.forEach(it=>{ (itemsPorDia[it.venta_dia_id]=itemsPorDia[it.venta_dia_id]||[]).push(it); });
    // unidades vendidas por puesto y producto (deduplicando artículos contra el total del día)
    const ventasPuestoProd = {};
    cerrados.forEach(d=>{
      const reales = itemsRealesDeVenta(itemsPorDia[d.id]||[], d.total);
      reales.forEach(it=>{
        (ventasPuestoProd[d.almacen_id] = ventasPuestoProd[d.almacen_id]||{});
        ventasPuestoProd[d.almacen_id][it.producto_id] = (ventasPuestoProd[d.almacen_id][it.producto_id]||0) + Number(it.cantidad);
      });
    });

    const { porPuesto, total } = sugerirReposicion({ ventasPuestoProd, inventario:inv, productos:PRODUCTOS, almacenes:ALMACENES, diasHistorial, diasCubrir, puestoId });
    __repoFilas = {};
    if(total===0){ body.innerHTML='<div class="empty">No hay nada que sugerir: o los puestos ya están surtidos, o no hay en bodega lo que venden.</div>'; return; }
    let html='';
    porPuesto.forEach(p=>{
      if(!p.filas.length) return;
      __repoFilas[p.id] = p.filas;
      html += `<div style="border:2px solid var(--border); border-radius:14px; padding:14px; margin-bottom:16px">
        <div style="font-weight:800; font-size:17px; margin-bottom:6px">${p.puesto} <span style="color:var(--muted); font-weight:500; font-size:14px">— ${p.filas.length} para surtir</span></div>
        <div style="display:flex; gap:14px; margin-bottom:6px">
          <span onclick="marcarTodoRepo(true)" style="color:var(--accent); font-size:13px; cursor:pointer">✓ Marcar todo</span>
          <span onclick="marcarTodoRepo(false)" style="color:var(--muted); font-size:13px; cursor:pointer">✗ Desmarcar todo</span>
        </div>`;
      p.filas.forEach(f=>{
        html += `<label style="display:flex; align-items:center; gap:12px; padding:12px 0; border-top:1px solid var(--border); cursor:pointer">
          <input type="checkbox" id="repock_${p.id}_${f.producto_id}" checked style="width:26px; height:26px; flex:none">
          <div style="flex:1; min-width:0">
            <div style="font-weight:700; font-size:16px">${f.nombre}</div>
            <div style="color:var(--muted); font-size:13px">vende ~${num(Math.round(f.porDia*10)/10)}/día · tiene ${num(f.tiene)} · en bodega ${num(f.enBodega)}</div>
          </div>
          <div style="flex:none; text-align:center">
            <div style="font-size:12px; color:var(--muted)">pasar</div>
            <input type="number" id="repoq_${p.id}_${f.producto_id}" value="${f.sugerido}" min="0" max="${f.enBodega}" style="width:74px; text-align:center; font-size:18px; font-weight:700; padding:8px">
          </div>
        </label>`;
      });
      html += `<button class="primary" style="width:100%; margin-top:14px; font-size:17px; padding:16px" onclick="transferirReposicionPuesto(${p.id})">✅ Pasar lo marcado a ${p.puesto}</button>
      </div>`;
    });
    body.innerHTML = html;
    msg.textContent = `${total} sugerencia(s). Revisa, ajusta si quieres, y pasa lo que apruebes.`;
    msg.className = 'msg';
  }catch(e){ body.textContent=''; msg.textContent='No se pudo calcular: '+(e.message||e); msg.className='msg err'; }
}
async function transferirReposicionPuesto(puestoId){
  if(__repoTransfiriendo) return; // evita doble toque = doble transferencia
  const filas = __repoFilas[puestoId] || [];
  const puesto = (ALMACENES||[]).find(a=>a.id===puestoId);
  const seleccion = [];
  filas.forEach(f=>{
    const ck = document.getElementById(`repock_${puestoId}_${f.producto_id}`);
    const qEl = document.getElementById(`repoq_${puestoId}_${f.producto_id}`);
    if(ck && ck.checked){
      const q = Math.max(0, Math.floor(Number(qEl && qEl.value)||0));
      if(q>0) seleccion.push({ producto_id:f.producto_id, nombre:f.nombre, qty:q });
    }
  });
  if(!seleccion.length){ alert('No hay nada marcado para transferir.'); return; }
  const msg = document.getElementById('repoIntMsg');
  // Necesita internet: hay que leer el stock real de cada bodega para no sacar de más.
  if(!navigator.onLine){ msg.textContent = 'Necesitas internet para transferir la reposición (hay que ver el stock real de la bodega).'; msg.className='msg err'; return; }
  const totalUds = seleccion.reduce((s,x)=>s+x.qty,0);
  if(!confirm(`Vas a transferir ${seleccion.length} producto(s) (${num(totalUds)} unidades) a "${puesto?puesto.nombre:''}" desde la bodega. ¿Seguro?`)) return;
  __repoTransfiriendo = true;
  msg.textContent = 'Transfiriendo…'; msg.className='msg';
  const bodegaIds = (ALMACENES||[]).filter(a=>!esPuntoVenta(a)).map(a=>a.id);

  // Armamos las líneas de traslado (repartiendo desde las bodegas que más tienen), leyendo el
  // stock REAL de cada bodega ahora mismo. Luego las aplicamos por la MISMA vía segura que los
  // movimientos manuales (con rollback e idempotencia por clave), y si se corta el internet a
  // medio camino, lo que falte se guarda en la cola y se aplica solo al volver — sin repetir.
  const lineas = []; const problemas = [];
  for(const it of seleccion){
    let rows;
    try{ const r = await sb.from('inventario').select('almacen_id, cantidad').eq('producto_id', it.producto_id).in('almacen_id', bodegaIds); rows = r.data; }
    catch(e){ problemas.push(`${it.nombre}: no se pudo leer la bodega`); continue; }
    const fuentes = (rows||[]).map(r=>({almId:r.almacen_id, cant:Number(r.cantidad||0)})).filter(x=>x.cant>0).sort((a,b)=>b.cant-a.cant);
    let restante = it.qty;
    for(const f of fuentes){
      if(restante<=0) break;
      const mover = Math.min(restante, f.cant);
      lineas.push({ tipo:'traslado', producto_id:it.producto_id, origen_id:f.almId, destino_id:puestoId, cantidad:mover, nota:'Reposición inteligente', clave_local:'repo_'+puestoId+'_'+it.producto_id+'_'+f.almId+'_'+Date.now()+'_'+Math.random().toString(36).slice(2,7) });
      restante -= mover;
    }
    if(restante>0) problemas.push(`${it.nombre}: faltaron ${num(restante)} (no había suficiente en bodega)`);
  }
  if(!lineas.length){
    __repoTransfiriendo = false;
    msg.textContent = 'No se transfirió nada. ' + (problemas.length?('Avisos: '+problemas.slice(0,3).join(' | ')):''); msg.className='msg err';
    return;
  }
  let movidos = 0;
  try{
    for(const ln of lineas){ await aplicarLineaMovimiento(ln); movidos += ln.cantidad; }
  }catch(err){
    // Se cortó a medio camino: encolamos lo que NO llegó a aplicarse (idempotente, no se repite).
    const pendientes = lineas.filter(l=>l.aplicado !== true);
    if(pendientes.length) encolarOperacionAdmin('movimiento_lista', {items: pendientes});
    __repoTransfiriendo = false;
    try{ await cargarTodo(); }catch(e){}
    await calcularReposicionInteligente();
    document.getElementById('repoIntMsg').textContent = 'Se cortó la conexión a medio camino. Lo que faltaba quedó guardado y se aplicará solo al volver el internet, sin repetir lo ya movido.';
    document.getElementById('repoIntMsg').className = 'msg ok';
    return;
  }
  try{ await cargarTodo(); }catch(e){}
  __repoTransfiriendo = false;
  await calcularReposicionInteligente(); // recalcula con el stock ya actualizado
  let fin = `Listo: ${num(movidos)} unidad(es) transferida(s) a "${puesto?puesto.nombre:''}".`;
  if(problemas.length) fin += ' Avisos: ' + problemas.slice(0,3).join(' | ');
  document.getElementById('repoIntMsg').textContent = fin;
  document.getElementById('repoIntMsg').className = problemas.length ? 'msg err' : 'msg ok';
}

// El vendedor agrega un artículo recibido. Online: lo inserta; offline: lo encola.
async function agregarRecepcion(){
  if(!puestoActual){ alert('Espera unos segundos: todavía se está cargando tu puesto.'); return; }
  const msg = document.getElementById('recepMsg');
  const pid = Number(document.getElementById('recepProductoId').value)||0;
  const cant = Number(document.getElementById('recepCantidad').value)||0;
  if(!pid){ msg.textContent='Elige un producto de la lista.'; msg.className='msg err'; return; }
  if(cant<=0){ msg.textContent='Pon una cantidad mayor que 0.'; msg.className='msg err'; return; }
  const fila = { almacen_id: puestoActual.id, producto_id: pid, cantidad: cant, fecha: fechaHoyLocal(), usuario_id: usuarioActual.id };
  // Limpiar el formulario ya (respuesta rápida)
  document.getElementById('recepProductoTexto').value='';
  document.getElementById('recepProductoId').value='';
  document.getElementById('recepCantidad').value='';
  if(!navigator.onLine){
    const cola = lsGet('recep_pending', []); cola.push(fila); lsSet('recep_pending', cola);
    msg.textContent='Guardado sin internet. Se subirá solo al volver la conexión.'; msg.className='msg ok';
    cargarRecepcionesHoy(); return;
  }
  try{
    const { error } = await sb.from('recepciones').insert(fila);
    if(error) throw error;
    msg.textContent='Agregado. ✓'; msg.className='msg ok';
    cargarRecepcionesHoy();
  }catch(e){
    // Si falla estando online, lo guardamos igual en la cola para no perderlo.
    const cola = lsGet('recep_pending', []); cola.push(fila); lsSet('recep_pending', cola);
    msg.textContent='No se pudo subir ahora; quedó guardado y se reintentará. ('+(e.message||e)+')'; msg.className='msg err';
    cargarRecepcionesHoy();
  }
}

// Sube lo que quedó en la cola (se llama al volver el internet).
async function sincronizarRecepciones(){
  const n = await drenarCola('recep_pending', async fila => {
    // A la base van SOLO los datos del artículo. Las marcas internas de la cola (__cid y, si
    // un intento falló, _ultimoError/_intentos/_faltantes) se quitan: antes solo se quitaba
    // __cid, así que bastaba UN fallo de señal para que el artículo llevara pegado "_intentos"
    // y la base lo rechazara para siempre ("no existe esa columna"). Por eso no subían.
    const envio = {};
    for(const k of Object.keys(fila)){ if(k.charAt(0) !== '_') envio[k] = fila[k]; }
    const { error } = await sb.from('recepciones').insert(envio);
    if(error) throw error;
  });
  if(!n) return;
  const tab = document.getElementById('vtab-recepcion');
  if(tab && tab.style.display!=='none') cargarRecepcionesHoy();
}

async function borrarRecepcion(id){
  if(!confirm('¿Quitar este artículo de la lista de recibidos?')) return;
  try{ await escribirConReintento(()=> sb.from('recepciones').delete().eq('id', id)); }catch(e){}
  cargarRecepcionesHoy();
}
function borrarRecepcionPendiente(idx){
  const cola = lsGet('recep_pending', []);
  cola.splice(idx,1); lsSet('recep_pending', cola);
  cargarRecepcionesHoy();
}

// Muestra lo que el vendedor lleva anotado HOY en su puesto (subido + pendiente).
async function cargarRecepcionesHoy(){
  if(!puestoActual) return; // aún no se ha cargado el puesto: no hacemos nada (evita el cuelgue)
  const body = document.getElementById('recepBody');
  const hoy = fechaHoyLocal();
  const nombreProd = id => { const p=PRODUCTOS.find(x=>x.id===id); return p?p.nombre:('#'+id); };
  let subidas = [];
  if(navigator.onLine){
    try{ const r = await sb.from('recepciones').select('*').eq('almacen_id', puestoActual.id).eq('fecha', hoy).eq('revisado', false).order('id',{ascending:false}); subidas = r.data||[]; }catch(e){ try{ const r2 = await sb.from('recepciones').select('*').eq('almacen_id', puestoActual.id).eq('fecha', hoy).order('id',{ascending:false}); subidas = r2.data||[]; }catch(e2){} }
  }
  const pend = lsGet('recep_pending', []).map((f,idx)=>({...f, __idx:idx})).filter(f=>f.almacen_id===puestoActual.id && f.fecha===hoy);
  if(!subidas.length && !pend.length){ body.innerHTML='<div class="empty">Todavía no has anotado nada hoy.</div>'; return; }
  let filas = pend.map(f=>`<tr><td>${nombreProd(f.producto_id)} <span style="color:var(--amber);font-size:11px">(por subir)</span></td><td class="numcell">${num(f.cantidad)}</td><td><button class="ghost" onclick="borrarRecepcionPendiente(${f.__idx})">🗑</button></td></tr>`).join('');
  filas += subidas.map(f=>`<tr><td>${nombreProd(f.producto_id)}</td><td class="numcell">${num(f.cantidad)}</td><td><button class="ghost" onclick="borrarRecepcion(${f.id})">🗑</button></td></tr>`).join('');
  body.innerHTML = `<table><thead><tr><th>Producto</th><th class="numcell">Cant.</th><th></th></tr></thead><tbody>${filas}</tbody></table>`;
}

// ---------- Conciliación (dueño): declarado por el vendedor vs enviado por el sistema ----------
// PURA: recibe dos mapas {producto_id: cantidad} y devuelve la comparación por producto.
function conciliarRecepcion(d){
  const { declarado, enviado, nombreProd } = d;
  const nom = nombreProd || (id=>('#'+id));
  const ids = new Set([...Object.keys(declarado||{}), ...Object.keys(enviado||{})]);
  const filas = [];
  ids.forEach(pid=>{
    const dec = Number((declarado||{})[pid]||0);
    const env = Number((enviado||{})[pid]||0);
    const dif = dec - env;
    let estado;
    if(dec===env) estado='cuadra';
    else if(env>0 && dec===0) estado='no_anotado';   // se envió pero el vendedor no lo anotó
    else if(dec>0 && env===0) estado='no_enviado';   // el vendedor anotó algo que no se le envió
    else if(dec>env) estado='de_mas';                // anotó más de lo enviado
    else estado='de_menos';                          // anotó menos de lo enviado
    filas.push({ producto_id:Number(pid), nombre:nom(Number(pid)), declarado:dec, enviado:env, diferencia:dif, estado });
  });
  filas.sort((a,b)=>{
    const cuadraA = a.estado==='cuadra'?1:0, cuadraB = b.estado==='cuadra'?1:0;
    if(cuadraA!==cuadraB) return cuadraA-cuadraB; // primero los que NO cuadran
    return a.nombre.localeCompare(b.nombre);
  });
  const cuadran = filas.filter(f=>f.estado==='cuadra').length;
  return { filas, cuadran, descuadran: filas.length-cuadran };
}

// Da por buena UNA fila (marca revisado / consume el envío) sin preguntar (uso interno).
async function marcarRevisado(puestoId, productoId, enviadoNeto){
  const upd = await sb.from('recepciones').update({revisado:true}).eq('almacen_id', puestoId).eq('producto_id', productoId).eq('revisado', false).select('id');
  if(upd.error) throw upd.error;
  if((upd.data||[]).length===0 && Number(enviadoNeto)>0){
    const ins = await sb.from('recepciones').insert({almacen_id:puestoId, producto_id:productoId, cantidad:Number(enviadoNeto), fecha:fechaHoyLocal(), usuario_id:usuarioActual.id, revisado:true});
    if(ins.error) throw ins.error;
  }
}

// Da por bueno TODO un puesto.
async function quitarPuestoRecepcion(puestoId){
  const p = __conciliacionData.find(x=>x.pid===puestoId);
  if(!p) return;
  if(!confirm('¿Dar por buenos TODOS los artículos de este puesto?')) return;
  if(!navigator.onLine){ alert('Necesitas internet.'); return; }
  const msg=document.getElementById('recAdminMsg'); msg.textContent='Limpiando…'; msg.className='msg';
  try{ for(const it of p.items){ await marcarRevisado(puestoId, it.prod, it.enviadoNeto); } }
  catch(e){ msg.textContent='No se pudo del todo: '+(e.message||e); msg.className='msg err'; }
  cargarConciliacion();
}

// Da por buena TODA la lista (todos los puestos).
async function quitarTodoRecepcion(){
  if(!__conciliacionData.length) return;
  const total = __conciliacionData.reduce((s,p)=>s+p.items.length,0);
  if(!confirm(`¿Dar por buena TODA la lista (${total} artículo(s) en ${__conciliacionData.length} puesto(s))? Se limpia la comparación y la lista de los vendedores.`)) return;
  if(!navigator.onLine){ alert('Necesitas internet.'); return; }
  const msg=document.getElementById('recAdminMsg'); msg.textContent='Limpiando todo…'; msg.className='msg';
  try{ for(const p of __conciliacionData){ for(const it of p.items){ await marcarRevisado(p.pid, it.prod, it.enviadoNeto); } } }
  catch(e){ msg.textContent='No se pudo del todo: '+(e.message||e); msg.className='msg err'; cargarConciliacion(); return; }
  cargarConciliacion();
}

// El dueño da por bueno un artículo. En vez de borrar, lo marca como "revisado":
// - las anotaciones del vendedor de ese producto/puesto pasan a revisado=true (salen de su lista)
// - si NO había anotación (solo se envió), inserta una marca revisada con la cantidad enviada,
//   para que ese envío quede "consumido" y no reaparezca en la comparación.
async function quitarRecepcionProducto(puestoId, productoId, enviadoNeto){
  if(!confirm('¿Dar por bueno este artículo? Sale de la comparación y de la lista del vendedor.')) return;
  if(!navigator.onLine){ alert('Necesitas internet para hacerlo.'); return; }
  try{
    const upd = await sb.from('recepciones').update({revisado:true}).eq('almacen_id', puestoId).eq('producto_id', productoId).eq('revisado', false).select('id');
    if(upd.error) throw upd.error;
    const marco = (upd.data||[]).length;
    // Si no había nada anotado pero SÍ se había enviado, dejamos una marca revisada.
    if(marco===0 && Number(enviadoNeto)>0){
      const ins = await sb.from('recepciones').insert({almacen_id:puestoId, producto_id:productoId, cantidad:Number(enviadoNeto), fecha:fechaHoyLocal(), usuario_id:usuarioActual.id, revisado:true});
      if(ins.error) throw ins.error;
    }
  }catch(e){ alert('No se pudo: '+(e.message||e)); return; }
  cargarConciliacion();
}

// Muestra TODO lo que está pendiente de cuadrar, por puesto: tanto lo que el vendedor anotó como
// lo que el admin/dueño ENVIÓ al puesto (aunque el vendedor no lo haya anotado). Lo ya revisado
// no aparece. Compara "Anotó" (vendedor) contra "Enviado" (sistema) y marca las diferencias.
async function cargarConciliacion(){
  const body = document.getElementById('recAdminBody');
  const msg = document.getElementById('recAdminMsg');
  msg.textContent='';
  if(!navigator.onLine){ msg.textContent='Necesitas internet para ver esto.'; msg.className='msg err'; return; }
  body.textContent='Cargando…';
  try{
    const nombreProd = id => { const p=(PRODUCTOS||[]).find(x=>x.id===id); return p?p.nombre:('#'+id); };
    const nombreAlm = id => { const a=(ALMACENES||[]).find(x=>x.id===id); return a?a.nombre:('Puesto '+id); };
    const puestosApp = (ALMACENES||[]).filter(esPuntoVenta).map(a=>a.id);
    const fechaLocal = ts => { if(!ts) return ''; const dd=new Date(ts); if(isNaN(dd)) return (ts||'').slice(0,10); const z=new Date(dd.getTime()-dd.getTimezoneOffset()*60000); return z.toISOString().slice(0,10); };
    const sumaDias = (f, n) => { const d=new Date(f+'T00:00:00'); d.setDate(d.getDate()+n); return d.toISOString().slice(0,10); };
    const hoy = fechaHoyLocal();

    // 1) Recepciones (todas: pendientes y revisadas). Paginado con ORDEN estable.
    const rec=[]; { const PAGE=1000; let d=0; for(;;){ const r=await sb.from('recepciones').select('almacen_id,producto_id,cantidad,fecha,revisado').order('id',{ascending:true}).range(d,d+PAGE-1); if(r.error||!r.data)break; rec.push(...r.data); if(r.data.length<PAGE)break; d+=PAGE; } }
    // declarado (revisado=false) y revisado (revisado=true) por puesto/producto; fechas de lo pendiente
    const declPP = {}, revPP = {}, fechasP = {};
    rec.forEach(r=>{
      const a=r.almacen_id, pid=r.producto_id, c=Number(r.cantidad||0);
      if(r.revisado){ (revPP[a]=revPP[a]||{})[pid]=(revPP[a][pid]||0)+c; }
      else { (declPP[a]=declPP[a]||{})[pid]=(declPP[a][pid]||0)+c; (fechasP[a]=fechasP[a]||new Set()).add(r.fecha); }
    });

    // Puestos a CONSULTAR envíos: los que se llaman "P ..." + CUALQUIER almacén donde el vendedor
    // anotó recepción (por si un puesto tiene otro nombre). Así nunca dejamos fuera un puesto real.
    const puestosConsulta = [...new Set([ ...puestosApp, ...Object.keys(declPP).map(Number), ...Object.keys(revPP).map(Number) ])];

    // 2) Ventana de fechas del "enviado", POR PUESTO:
    //    - Si el puesto TIENE anotaciones pendientes: desde (la anotación más vieja − 1 día) hasta hoy.
    //    - Si NO tiene anotaciones: solo miramos envíos de los ÚLTIMOS 3 DÍAS (para no arrastrar
    //      envíos viejos que ya se recibieron hace tiempo e inflaban los números).
    const DIAS_SIN_ANOTACION = 3;
    const ventana = {};
    let inicioGlobal = sumaDias(hoy, -DIAS_SIN_ANOTACION);
    puestosConsulta.forEach(pid=>{
      const set = fechasP[pid];
      if(set && set.size){ const arr=[...set].filter(Boolean).sort(); const ini=sumaDias(arr[0],-1); ventana[pid]={ini, fin:hoy}; if(ini<inicioGlobal) inicioGlobal=ini; }
      else { ventana[pid]={ini:sumaDias(hoy,-DIAS_SIN_ANOTACION), fin:hoy}; }
    });

    // 3) Movimientos de ingreso/traslado hacia esos puestos, desde el inicio más temprano. Paginado.
    //    (El TRASLADO también entra mercancía al puesto, así que cuenta igual que el ingreso.)
    const mov=[]; { const PAGE=1000; let d=0; for(;;){ const r=await sb.from('movimientos').select('almacen_destino_id,producto_id,cantidad,tipo,creado_en').in('almacen_destino_id', puestosConsulta).gte('creado_en', inicioGlobal+'T00:00:00').order('id',{ascending:true}).range(d,d+PAGE-1); if(r.error||!r.data)break; mov.push(...r.data); if(r.data.length<PAGE)break; d+=PAGE; } }
    let nEnviosContados = 0;
    const enviadoPP = {};
    mov.forEach(m=>{ const t=(m.tipo||'').toString().toLowerCase().trim(); if(t!=='ingreso' && t!=='traslado') return; const a=Number(m.almacen_destino_id); if(!puestosConsulta.includes(a)) return; const f=fechaLocal(m.creado_en); const w=ventana[a]; if(!w) return; if(f<w.ini || f>w.fin) return; (enviadoPP[a]=enviadoPP[a]||{})[m.producto_id]=(enviadoPP[a][m.producto_id]||0)+Number(m.cantidad||0); nEnviosContados++; });

    // 4) Armar por puesto: producto sale si tiene anotado pendiente O enviado-neto > 0
    const badge = est => {
      if(est==='cuadra') return '<span style="color:var(--green)">✓ cuadra</span>';
      if(est==='no_anotado') return '<span style="color:var(--red)">⛔ enviado, NO lo anotó</span>';
      if(est==='no_enviado') return '<span style="color:var(--amber)">⚠ anotó, no se envió</span>';
      if(est==='de_mas') return '<span style="color:var(--amber)">▲ anotó de más</span>';
      return '<span style="color:var(--amber)">▼ anotó de menos</span>';
    };
    const puestos = [...new Set([...Object.keys(declPP), ...Object.keys(enviadoPP)].map(Number))];
    let html=''; let totalPend=0;
    puestos.forEach(pid=>{
      const decl = declPP[pid]||{}, env = enviadoPP[pid]||{}, rev = revPP[pid]||{};
      const productos = [...new Set([...Object.keys(decl), ...Object.keys(env)].map(Number))];
      const filas = [];
      productos.forEach(prod=>{
        const anoto = Number(decl[prod]||0);
        const enviadoNeto = Math.max(0, Number(env[prod]||0) - Number(rev[prod]||0)); // descontamos lo ya revisado
        if(anoto<=0 && enviadoNeto<=0) return;
        const dif = anoto - enviadoNeto;
        let estado;
        if(anoto===enviadoNeto) estado='cuadra';
        else if(enviadoNeto>0 && anoto===0) estado='no_anotado';
        else if(anoto>0 && enviadoNeto===0) estado='no_enviado';
        else if(anoto>enviadoNeto) estado='de_mas';
        else estado='de_menos';
        filas.push({ prod, nombre:nombreProd(prod), anoto, enviadoNeto, dif, estado });
      });
      if(!filas.length) return;
      filas.sort((a,b)=>{ const ca=a.estado==='cuadra'?1:0, cb=b.estado==='cuadra'?1:0; if(ca!==cb) return ca-cb; return a.nombre.localeCompare(b.nombre); });
      totalPend += filas.length;
      html += `<div style="border:2px solid var(--border); border-radius:14px; padding:12px; margin-bottom:16px; overflow:hidden">
        <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:8px; flex-wrap:wrap">
          <div style="font-weight:800; font-size:17px">${nombreAlm(pid)} <span style="color:var(--muted); font-weight:500; font-size:14px">— ${filas.length} por revisar</span></div>
          <button class="ghost" style="font-size:13px; padding:6px 12px" onclick="quitarPuestoRecepcion(${pid})">✓ Quitar todo</button>
        </div>
        <div style="overflow-x:auto; -webkit-overflow-scrolling:touch">
        <table style="min-width:520px"><thead><tr><th>Producto</th><th class="numcell">Anotó</th><th class="numcell">Enviado</th><th class="numcell">Dif.</th><th>Estado</th><th></th></tr></thead><tbody>`;
      html += filas.map(f=>`<tr>
        <td>${f.nombre}</td>
        <td class="numcell">${num(f.anoto)}</td>
        <td class="numcell">${num(f.enviadoNeto)}</td>
        <td class="numcell" style="font-weight:700; color:${f.dif===0?'var(--muted)':(f.dif>0?'var(--red)':'var(--amber)')}">${f.dif>0?'+':''}${num(f.dif)}</td>
        <td>${badge(f.estado)}</td>
        <td><button class="ghost" onclick="quitarRecepcionProducto(${pid}, ${f.prod}, ${f.enviadoNeto})">✓ Quitar</button></td>
      </tr>`).join('');
      html += `</tbody></table></div></div>`;
    });
    if(!totalPend){ body.innerHTML='<div class="empty">No hay nada por revisar. Todo cuadra. 👍</div>'; msg.textContent=''; __conciliacionData=[]; return; }
    // Guardamos lo mostrado para el botón "Quitar todo".
    __conciliacionData = puestos.map(pid=>{
      const decl = declPP[pid]||{}, env = enviadoPP[pid]||{}, rev = revPP[pid]||{};
      const items = [...new Set([...Object.keys(decl), ...Object.keys(env)].map(Number))].map(prod=>({ prod, enviadoNeto: Math.max(0, Number(env[prod]||0) - Number(rev[prod]||0)) })).filter(x=> (Number(decl[x.prod]||0)>0) || x.enviadoNeto>0);
      return { pid, items };
    }).filter(p=>p.items.length);
    body.innerHTML = `<button class="ghost" style="width:100%; margin-bottom:12px" onclick="quitarTodoRecepcion()">✓ Quitar todo (dar por buena toda la lista)</button>` + html;
    msg.textContent = `${totalPend} artículo(s) por revisar en ${puestos.length} puesto(s). (Encontré ${nEnviosContados} envío(s) en la ventana revisada.)`;
    msg.className = 'msg';
  }catch(e){ body.textContent=''; msg.textContent='No se pudo cargar: '+(e.message||e)+'. (¿Corriste el SQL de la columna "revisado"?)'; msg.className='msg err'; }
}

// ══════════════════════════════════════════════════════════════════
// 💬 ASISTENTE CON IA (solo dueño) — hace preguntas sobre el negocio.
// La IA SOLO recibe un resumen de datos (calculado con consultas de lectura)
// y responde texto. NUNCA escribe, borra ni modifica nada en la base.
// La clave de Gemini se guarda solo en este teléfono (localStorage).
// ══════════════════════════════════════════════════════════════════
function estadoClaveIA(){
  const clave = lsGet('ia_clave_gemini', '');
  document.getElementById('iaSinClave').style.display = clave ? 'none' : 'block';
  document.getElementById('iaConClave').style.display = clave ? 'block' : 'none';
}
function guardarClaveIA(){
  const clave = (document.getElementById('iaClaveInput').value||'').trim();
  const msg = document.getElementById('iaClaveMsg');
  if(!(clave.startsWith('AIza') || clave.startsWith('AQ.'))){
    msg.textContent = 'La clave debe empezar con "AQ." o "AIza". Revisa que la copiaste completa.';
    msg.className = 'msg err';
    return;
  }
  lsSet('ia_clave_gemini', clave);
  document.getElementById('iaClaveInput').value = '';
  estadoClaveIA();
}
function olvidarClaveIA(){
  if(!confirm('¿Quitar la clave de este teléfono? Tendrás que volver a pegarla para hacer preguntas.')) return;
  lsSet('ia_clave_gemini', '');
  estadoClaveIA();
}

// Arma un resumen compacto de los datos del negocio para dárselo a la IA como contexto.
// Todo son consultas de LECTURA.
async function armarContextoNegocio(){
  const vacio = ()=>[];
  const [almacenes, productos, inventario, dias, items, caja, deudas, devs] = await Promise.all([
    traerTodasLasFilas(()=> sb.from('almacenes').select('*').order('id',{ascending:true})),
    traerTodasLasFilas(()=> sb.from('productos').select('*').order('id',{ascending:true})),
    traerTodasLasFilas(()=> sb.from('inventario').select('*').order('id',{ascending:true})),
    traerTodasLasFilas(()=> sb.from('ventas_dia').select('*').eq('cerrado', true).order('id',{ascending:true})),
    traerTodasLasFilas(()=> sb.from('venta_items').select('*').order('id',{ascending:true})),
    traerTodasLasFilas(()=> sb.from('caja_movimientos').select('*').order('id',{ascending:true})),
    traerTodasLasFilas(()=> sb.from('deudas').select('*').order('id',{ascending:true})),
    traerTodasLasFilas(()=> sb.from('devoluciones').select('*').order('id',{ascending:true})).catch(vacio)
  ]);

  const nombreAlm = id => (almacenes.find(a=>a.id===id)||{}).nombre || ('Almacén '+id);
  const nombreProd = id => (productos.find(p=>p.id===id)||{}).nombre || ('Producto '+id);
  const esPV = a => /^p\s/i.test((a.nombre||'').trim());

  // Ventas y ganancia por punto de venta
  const itemsPorDia = {};
  items.forEach(it=>{ (itemsPorDia[it.venta_dia_id]=itemsPorDia[it.venta_dia_id]||[]).push(it); });
  const porPuesto = {};
  dias.forEach(d=>{
    const nom = nombreAlm(d.almacen_id);
    porPuesto[nom] = porPuesto[nom] || {venta:0, ganancia:0, dias:0};
    porPuesto[nom].venta += Number(d.total||0);
    porPuesto[nom].dias++;
    (itemsPorDia[d.id]||[]).forEach(it=>{ porPuesto[nom].ganancia += it.cantidad*(it.precio_venta-it.costo); });
  });

  // Stock por almacén (resumido)
  const stock = inventario.map(r=>({almacen:nombreAlm(r.almacen_id), producto:nombreProd(r.producto_id), cantidad:Number(r.cantidad)}));

  const efectivoCaja = caja.filter(c=>c.metodo==='efectivo').reduce((s,c)=>s+(c.tipo==='ingreso'?Number(c.monto):-Number(c.monto)),0);
  const tarjetaCaja = caja.filter(c=>c.metodo==='tarjeta').reduce((s,c)=>s+(c.tipo==='ingreso'?Number(c.monto):-Number(c.monto)),0);

  return {
    fecha_hoy: fechaHoyLocal(),
    puntos_de_venta: almacenes.filter(esPV).map(a=>a.nombre),
    bodegas: almacenes.filter(a=>!esPV(a)).map(a=>a.nombre),
    resumen_por_puesto: porPuesto,
    dinero_en_caja: {efectivo: efectivoCaja, tarjeta: tarjetaCaja},
    stock_actual: stock,
    deudas_pendientes: deudas.filter(d=>!d.pagada).map(d=>({tipo:d.tipo, persona:d.persona, monto:d.monto, nota:d.nota})),
    total_devoluciones: devs.length,
    productos: productos.map(p=>({nombre:p.nombre, costo:p.costo, precio:p.precio_venta})),
  };
}

async function preguntarIA(){
  const clave = lsGet('ia_clave_gemini', '');
  const pregunta = (document.getElementById('iaPregunta').value||'').trim();
  const msg = document.getElementById('iaMsg');
  const respEl = document.getElementById('iaRespuesta');
  const btn = document.getElementById('iaBtnPreguntar');
  msg.textContent = '';

  if(!clave){ estadoClaveIA(); return; }
  if(!pregunta){ msg.textContent='Escribe una pregunta.'; msg.className='msg err'; return; }
  if(!navigator.onLine){ msg.textContent='Necesitas internet para preguntarle al asistente.'; msg.className='msg err'; return; }

  btn.disabled = true;
  respEl.textContent = 'Pensando…';
  try{
    const contexto = await armarContextoNegocio();
    const instruccion = `Eres el asistente de un dueño de ferretería. Responde SIEMPRE en español, claro y breve, como hablándole a un comerciante (no técnico). Usa SOLO los datos que te doy; si algo no está en los datos, dilo con honestidad en vez de inventar. Los "puntos de venta" son los almacenes que venden (su nombre empieza con "P "); las "bodegas" solo guardan mercancía y no venden. Aquí están los datos actuales del negocio en formato JSON:\n\n${JSON.stringify(contexto)}\n\nPregunta del dueño: ${pregunta}`;

    const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(clave)}`, {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ contents:[{ parts:[{ text: instruccion }] }] })
    });
    if(!resp.ok){
      const txt = await resp.text();
      if(resp.status===400 && txt.includes('API_KEY')){ throw new Error('La clave no parece válida. Revisa que la copiaste bien o genera una nueva.'); }
      if(resp.status===429){ throw new Error('Llegaste al límite gratuito de hoy. Vuelve a intentar mañana.'); }
      throw new Error('El asistente no respondió (código '+resp.status+'). Intenta de nuevo en un momento.');
    }
    const data = await resp.json();
    const texto = (((data.candidates||[])[0]||{}).content||{}).parts?.map(p=>p.text).join('') || 'No obtuve respuesta. Intenta reformular la pregunta.';
    respEl.textContent = texto;
    msg.textContent = '';
  }catch(err){
    respEl.textContent = '';
    msg.textContent = err.message || String(err);
    msg.className = 'msg err';
  }finally{
    btn.disabled = false;
  }
}

// Llena el selector de puestos y pone la fecha de hoy por defecto (solo la primera vez).
function prepararSelectorEstadisticas(){
  // Fechas por defecto de "Todas las ventas registradas": TODO el historial (no ocultar ninguna venta).
  const desdeEl = document.getElementById('listaVentasDesde');
  const hastaEl = document.getElementById('listaVentasHasta');
  if(hastaEl && !hastaEl.value) hastaEl.value = fechaHoyLocal();
  if(desdeEl && !desdeEl.value) desdeEl.value = '2020-01-01';
  // (El selector de puesto por día ya no está en esta pantalla; se rellena solo si existe.)
  const sel = document.getElementById('estDetPuesto');
  if(!sel) return;
  sel.innerHTML = almacenesVisibles().map(a=>`<option value="${a.id}">${a.nombre}</option>`).join('');
  const fechaEl = document.getElementById('estDetFecha');
  if(fechaEl && !fechaEl.value){ fechaEl.value = fechaHoyLocal(); }
}

// Muestra la venta de un puesto en un día concreto: cada producto con su cantidad, costo,
// precio de venta, total y ganancia; más los totales del día (venta, costo, ganancia,
// comisión y cuánto entró en efectivo/tarjeta).
// Cierra manualmente un día que quedó abierto (por ejemplo, si se cortó la conexión justo
// al finalizar). El inventario ya se descontó; esto solo marca el día como cerrado para que
// deje de aparecer "en curso" y cuente bien en las estadísticas.
async function cerrarDiaDesdeEstadistica(){
  const ids = window.__diasAbiertosEstadistica || [];
  if(ids.length === 0) return;
  if(!confirm('¿Cerrar este día? Los productos ya se descontaron; esto solo lo marca como finalizado.')) return;
  const resumenEl = document.getElementById('estDetResumen');
  try{
    for(const id of ids){
      // Calcular el total real del día a partir de sus artículos, para guardarlo al cerrar.
      const {data: items} = await sb.from('venta_items').select('*').eq('venta_dia_id', id);
      let total = 0;
      for(const it of (items||[])) total += Number(it.cantidad)*Number(it.precio_venta);
      await escribirConReintento(()=> sb.from('ventas_dia').update({cerrado:true, total, cerrado_en:new Date().toISOString()}).eq('id', id));
    }
    if(resumenEl){ resumenEl.innerHTML = '<div class="msg ok">Día cerrado correctamente. Vuelve a tocar "Buscar" para ver el resumen actualizado.</div>'; }
    await buscarVentaPuestoDia();
  }catch(err){
    if(resumenEl){ resumenEl.innerHTML = `<div class="msg err">No se pudo cerrar: ${err.message||err}</div>`; }
  }
}

// Despliega u oculta el detalle de una venta concreta dentro de las estadísticas
function verDetalleVentaEstadistica(id){
  const fila = document.getElementById('est-venta-det-'+id);
  if(!fila) return;
  const estaAbierto = fila.dataset.abierto === '1';
  fila.style.display = estaAbierto ? 'none' : '';
  fila.dataset.abierto = estaAbierto ? '0' : '1';
}

async function buscarVentaPuestoDia(){
  const resumenEl = document.getElementById('estDetResumen');
  const prodEl = document.getElementById('estDetProductos');
  const almacenId = Number(document.getElementById('estDetPuesto').value);
  const fecha = document.getElementById('estDetFecha').value;
  if(!almacenId || !fecha){ resumenEl.innerHTML = '<div class="msg err">Elige un puesto y un día.</div>'; prodEl.innerHTML=''; return; }

  const nombrePuesto = (ALMACENES.find(a=>a.id===almacenId)||{}).nombre || 'Puesto';
  resumenEl.innerHTML = '<div style="color:var(--muted)">Buscando…</div>';
  prodEl.innerHTML = '';

  try{
    // Buscar el/los día(s) de venta de ese puesto en esa fecha (cerradas Y en curso).
    let {data: dias, error} = await sb.from('ventas_dia').select('*')
      .eq('almacen_id', almacenId).eq('fecha', fecha);
    if(error) throw error;

    if(!dias || dias.length===0){
      resumenEl.innerHTML = `<div class="msg">No hay ninguna venta de "${nombrePuesto}" el ${fecha}.</div>`;
      return;
    }

    // Traer los artículos de esos días
    const ids = dias.map(d=>d.id);
    const itemsIniciales = await traerItemsDe(ids, '*');
    let lineas = itemsIniciales || [];

    // ¿Cuáles de estos días YA descontaron inventario? (tienen movimientos registrados).
    // Esto distingue una venta REAL a medio cerrar de un carrito que el vendedor todavía
    // está armando: mientras vende, sus artículos se guardan en vivo, pero eso NO es una venta.
    // (paginado: no se queda corto en el corte de 1000 filas de Supabase)
    const idsConMovimientos = await idsConMovimiento(ids);

    // AUTO-REPARACIÓN: cerramos SOLO los días que ya descontaron inventario pero quedaron
    // sin marcar como cerrados (cierre a medias por un corte). NUNCA cerramos un carrito en curso.
    const paraCerrar = dias.filter(d => !d.cerrado && idsConMovimientos.has(d.id));
    if(paraCerrar.length > 0){
      for(const d of paraCerrar){
        const suyos = lineas.filter(l => l.venta_dia_id === d.id);
        let total = 0;
        for(const it of suyos) total += Number(it.cantidad)*Number(it.precio_venta);
        try{
          await escribirConReintento(()=> sb.from('ventas_dia').update({cerrado:true, total, cerrado_en:new Date().toISOString()}).eq('id', d.id));
          d.cerrado = true; // reflejarlo en memoria
        }catch(e){ /* si falla, seguimos mostrando lo que hay */ }
      }
    }

    // SOLO contamos ventas CERRADAS. Un día abierto es un carrito que el vendedor sigue
    // armando: no se suma a las estadísticas ni al cobro del administrador.
    const diasCerrados = dias.filter(d => d.cerrado);
    const idsCerrados = new Set(diasCerrados.map(d=>d.id));
    const hayCarritoEnCurso = dias.some(d => !d.cerrado && lineas.some(l=>l.venta_dia_id===d.id));
    lineas = lineas.filter(l => idsCerrados.has(l.venta_dia_id));

    if(diasCerrados.length === 0){
      resumenEl.innerHTML = `<div class="msg">No hay ninguna venta finalizada de "${nombrePuesto}" el ${fecha}.${hayCarritoEnCurso ? ' (Hay una venta en curso que el vendedor todavía no ha finalizado.)' : ''}</div>`;
      prodEl.innerHTML = '';
      return;
    }

    const hayAbierta = false;
    window.__diasAbiertosEstadistica = [];

    // Descartar días DUPLICADOS (copias idénticas del mismo cierre). Sin esto, la venta
    // aparecía sumada varias veces: por ejemplo 4 copias hacían ver 40 donde había 10.
    const {conservados: diasUnicos, descartados: diasRepes} = descartarDiasDuplicados(diasCerrados, lineas);
    const idsUnicos = new Set(diasUnicos.map(d=>d.id));
    lineas = lineas.filter(l => idsUnicos.has(l.venta_dia_id));

    // Además de descartar días repetidos, limpiamos venta_items DUPLICADOS dentro de un mismo
    // día (copias idénticas del mismo producto), usando el total del día como árbitro. Así el
    // detalle, los subtotales y la ganancia no se inflan aunque la base tenga items repetidos.
    let lineasLimpias = [];
    for(const d of diasUnicos){
      const suyos = lineas.filter(l => l.venta_dia_id === d.id);
      lineasLimpias = lineasLimpias.concat(itemsRealesDeVenta(suyos, d.total));
    }
    lineas = lineasLimpias;
    const avisoRepes = diasRepes.length > 0
      ? `<div style="color:var(--amber); font-size:12px; margin-top:8px">Se ignoraron ${diasRepes.length} copia(s) repetida(s) de esta misma venta para no contarla varias veces.</div>`
      : '';

    // Detalle de CADA venta que se está sumando, para poder revisarlas una por una
    let nombrePorUsuarioEst = {};
    try{
      const {data: us} = await sb.from('usuarios').select('id, nombre');
      (us||[]).forEach(u=>{ nombrePorUsuarioEst[u.id] = u.nombre; });
    }catch(e){}

    const detallePorVenta = diasUnicos.map(d=>{
      const suyos = lineas.filter(l => l.venta_dia_id === d.id);
      let vTotal = 0, vCosto = 0, uds = 0;
      for(const it of suyos){
        vTotal += Number(it.cantidad)*Number(it.precio_venta);
        vCosto += Number(it.cantidad)*Number(it.costo);
        uds += Number(it.cantidad);
      }
      const hora = d.cerrado_en ? new Date(d.cerrado_en).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : '—';
      return {
        id: d.id, hora,
        quien: nombrePorUsuarioEst[d.usuario_id] || '—',
        articulos: suyos.length, uds,
        venta: vTotal, ganancia: vTotal - vCosto,
        items: suyos
      };
    }).sort((a,b)=> b.venta - a.venta);

    const bloqueVentas = detallePorVenta.length > 0 ? `
      <div style="margin-top:14px">
        <h3 style="font-size:13px; color:var(--muted); margin:0 0 8px; text-transform:uppercase; letter-spacing:.04em">Ventas que se están sumando (${detallePorVenta.length})</h3>
        <table style="margin:0">
          <thead><tr><th>Hora</th><th>Quién</th><th class="numcell">Artíc.</th><th class="numcell">Uds.</th><th class="numcell">Venta</th><th class="numcell">Ganancia</th><th></th></tr></thead>
          <tbody>
            ${detallePorVenta.map(v=>`
              <tr>
                <td>${v.hora}</td>
                <td>${v.quien}</td>
                <td class="numcell">${v.articulos}</td>
                <td class="numcell">${num(v.uds)}</td>
                <td class="numcell">$${num(v.venta)}</td>
                <td class="numcell" style="color:var(--green)">$${num(v.ganancia)}</td>
                <td><button class="ghost" style="padding:3px 8px; font-size:11px" onclick="verDetalleVentaEstadistica(${v.id})">ver</button></td>
              </tr>
              <tr id="est-venta-det-${v.id}" style="display:none"><td colspan="7" style="padding:0">
                <table style="margin:0; background:var(--panel2)">
                  <thead><tr><th style="padding-left:24px">Producto</th><th class="numcell">Cant.</th><th class="numcell">Precio</th><th class="numcell">Subtotal</th></tr></thead>
                  <tbody>
                    ${v.items.map(it=>{
                      const p = PRODUCTOS.find(x=>x.id===it.producto_id);
                      return `<tr><td style="padding-left:24px">${p?p.nombre:'(borrado)'}</td><td class="numcell">${num(it.cantidad)}</td><td class="numcell">$${num(it.precio_venta)}</td><td class="numcell">$${num(Number(it.cantidad)*Number(it.precio_venta))}</td></tr>`;
                    }).join('')}
                  </tbody>
                </table>
              </td></tr>`).join('')}
          </tbody>
        </table>
      </div>` : '';

    // Sumar por producto (juntando líneas repetidas del mismo producto)
    const porProducto = {};
    for(const it of lineas){
      const k = it.producto_id;
      if(!porProducto[k]){
        const p = PRODUCTOS.find(p=>p.id===it.producto_id);
        porProducto[k] = { nombre: p?p.nombre:'(producto eliminado)', cantidad:0, costo:Number(it.costo), precio_venta:Number(it.precio_venta) };
      }
      porProducto[k].cantidad += Number(it.cantidad);
    }
    const filas = Object.values(porProducto);

    let ventaTotal=0, costoTotal=0;
    for(const f of filas){ ventaTotal += f.cantidad*f.precio_venta; costoTotal += f.cantidad*f.costo; }
    const gananciaTotal = ventaTotal - costoTotal;
    const comision = gananciaTotal > 0 ? redondearComision(gananciaTotal*0.15) : 0;

    // Cuánto entró en caja ese día por ese puesto (efectivo y tarjeta)
    let efectivo=0, tarjeta=0;
    try{
      const caja = await traerTodasLasFilas(()=> sb.from('caja_movimientos').select('*')
          .eq('almacen_id', almacenId).eq('categoria','venta').order('id',{ascending:true}));
      for(const c of (caja||[])){
        const cf = (c.creado_en||'').slice(0,10);
        if(cf === fecha && c.tipo==='ingreso'){
          if(c.metodo==='efectivo') efectivo += Number(c.monto);
          else if(c.metodo==='tarjeta') tarjeta += Number(c.monto);
        }
      }
    }catch(e){ /* si no se puede, se muestran en 0 */ }

    // Resumen de totales
    resumenEl.innerHTML = `
      <div style="background:var(--panel2); border-radius:12px; padding:14px">
        <div style="font-weight:700; font-size:16px; margin-bottom:10px">${nombrePuesto} — ${fecha}</div>
        <div class="row" style="gap:16px; flex-wrap:wrap">
          <div><div style="color:var(--muted); font-size:12px">Venta total</div><div style="font-weight:700; font-size:18px; color:var(--green)">$${num(ventaTotal)}</div></div>
          <div><div style="color:var(--muted); font-size:12px">Costo total</div><div style="font-weight:700; font-size:18px; color:var(--purple)">$${num(costoTotal)}</div></div>
          <div><div style="color:var(--muted); font-size:12px">Ganancia</div><div style="font-weight:700; font-size:18px">$${num(gananciaTotal)}</div></div>
          <div><div style="color:var(--muted); font-size:12px">Comisión (15%)</div><div style="font-weight:700; font-size:18px; color:var(--accent)">$${num(comision)}</div></div>
        </div>
        <div class="row" style="gap:16px; flex-wrap:wrap; margin-top:10px; padding-top:10px; border-top:1px solid var(--border)">
          <div><div style="color:var(--muted); font-size:12px">Entró en efectivo</div><div style="font-weight:700">$${num(efectivo)}</div></div>
          <div><div style="color:var(--muted); font-size:12px">Entró en tarjeta</div><div style="font-weight:700">$${num(tarjeta)}</div></div>
          <div><div style="color:var(--muted); font-size:12px">Artículos distintos</div><div style="font-weight:700">${filas.length}</div></div>
        </div>
        ${avisoRepes}
      </div>
      ${bloqueVentas}`;

    // Tabla de productos
    if(filas.length === 0){
      prodEl.innerHTML = '<div class="msg">Ese día no se registraron productos (quizás fue solo un cobro).</div>';
      return;
    }
    filas.sort((a,b)=> (b.cantidad*b.precio_venta) - (a.cantidad*a.precio_venta));
    prodEl.innerHTML = `
      <table>
        <thead><tr>
          <th>Producto</th>
          <th class="numcell">Cant.</th>
          <th class="numcell">Costo</th>
          <th class="numcell">P. venta</th>
          <th class="numcell">Total</th>
          <th class="numcell">Ganancia</th>
        </tr></thead>
        <tbody>
          ${filas.map(f=>{
            const totalLinea = f.cantidad*f.precio_venta;
            const gananciaLinea = f.cantidad*(f.precio_venta - f.costo);
            return `<tr>
              <td>${f.nombre}</td>
              <td class="numcell">${num(f.cantidad)}</td>
              <td class="numcell">$${num(f.costo)}</td>
              <td class="numcell">$${num(f.precio_venta)}</td>
              <td class="numcell">$${num(totalLinea)}</td>
              <td class="numcell" style="color:${gananciaLinea>=0?'var(--green)':'var(--red)'}">$${num(gananciaLinea)}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>`;
  }catch(err){
    resumenEl.innerHTML = `<div class="msg err">No se pudo cargar: ${err.message||err}</div>`;
  }
}

async function cargarEstadisticas(){
  prepararSelectorEstadisticas();
  try{
    const [ventasDia, ventaItems, deudasTodas, pedidosPend, cajaTodos] = await Promise.all([
      traerTodasLasFilas(()=> sb.from('ventas_dia').select('*').eq('cerrado', true).order('id',{ascending:true})),
      traerTodasLasFilas(()=> sb.from('venta_items').select('*').order('id',{ascending:true})),
      traerTodasLasFilas(()=> sb.from('deudas').select('*').order('id',{ascending:true})),
      traerTodasLasFilas(()=> sb.from('pedidos').select('*').eq('estado','pendiente').order('id',{ascending:true})),
      traerTodasLasFilas(()=> sb.from('caja_movimientos').select('tipo, metodo, monto').order('id',{ascending:true}))
    ]);
    let devolucionesTodas = [];
    try{ devolucionesTodas = await traerTodasLasFilas(()=> sb.from('devoluciones').select('*').order('id',{ascending:true})); }catch(e){ /* tabla aún no creada */ }

    const dias = ventasDia || [];
    const items = ventaItems || [];
    const deudas = deudasTodas || [];
    const pedidos = pedidosPend || [];
    const itemsPorDia = {};
    items.forEach(it=>{ (itemsPorDia[it.venta_dia_id] = itemsPorDia[it.venta_dia_id]||[]).push(it); });

    function gananciaDeItems(its){ return its.reduce((s,it)=> s + Number(it.cantidad)*(Number(it.precio_venta)-Number(it.costo)), 0); }
    function ventaDeItems(its){ return its.reduce((s,it)=> s + Number(it.cantidad)*Number(it.precio_venta), 0); }

    // ---------- Patrimonio ----------
    const efectivo = (cajaTodos||[]).filter(c=>c.metodo==='efectivo').reduce((s,c)=>s+(c.tipo==='ingreso'?c.monto:-c.monto),0);
    const tarjeta = (cajaTodos||[]).filter(c=>c.metodo==='tarjeta').reduce((s,c)=>s+(c.tipo==='ingreso'?c.monto:-c.monto),0);
    const valorInventario = (INVENTARIO||[]).filter(i=>!esAlmacenMayoreoId(i.almacen_id)).reduce((s,i)=>{
      const p = PRODUCTOS.find(p=>p.id===i.producto_id);
      return s + (p ? Number(i.cantidad)*Number(p.costo) : 0);
    }, 0);
    const meDebenDinero = deudas.filter(d=>d.tipo_deuda==='dinero' && d.tipo==='me_deben' && !d.pagada).reduce((s,d)=>s+Number(d.monto),0);
    const yoDeboDinero = deudas.filter(d=>d.tipo_deuda==='dinero' && d.tipo==='debo' && !d.pagada).reduce((s,d)=>s+Number(d.monto),0);

    document.getElementById('estDinero').textContent = '$'+num(efectivo+tarjeta);
    document.getElementById('estInventario').textContent = '$'+num(valorInventario);
    document.getElementById('estMeDeben').textContent = '$'+num(meDebenDinero);
    document.getElementById('estYoDebo').textContent = '$'+num(yoDeboDinero);
    document.getElementById('estPatrimonioNeto').textContent = '$'+num(efectivo+tarjeta+valorInventario+meDebenDinero-yoDeboDinero);

    // ---------- Ventas y ganancias por periodo ----------
    const hoy = fechaHoyLocal();
    const fechaSemana = new Date(); fechaSemana.setDate(fechaSemana.getDate()-7);
    const inicioSemana = fechaSemana.toISOString().slice(0,10);
    const inicioMes = hoy.slice(0,7)+'-01';

    function sumarPeriodo(filtroFecha){
      const diasPeriodo = dias.filter(d=>filtroFecha(d.fecha));
      let venta=0, ganancia=0;
      diasPeriodo.forEach(d=>{
        // La VENTA sale del campo total del día (inmune a venta_items repetidos).
        // La GANANCIA se calcula sobre los items REALES (sin copias duplicadas).
        const reales = itemsRealesDeVenta(itemsPorDia[d.id]||[], d.total);
        venta += totalRealDeVenta(d, itemsPorDia[d.id]||[]);
        ganancia += gananciaDeItems(reales);
      });
      // Devoluciones del periodo: se restan de venta y ganancia (el dinero se regresó al cliente)
      devolucionesTodas.filter(d=>filtroFecha(d.fecha)).forEach(d=>{
        venta -= Number(d.cantidad)*Number(d.precio_venta);
        ganancia -= Number(d.cantidad)*(Number(d.precio_venta)-Number(d.costo));
      });
      return {venta, ganancia};
    }
    const periodos = [
      ['Hoy', sumarPeriodo(f=>f===hoy)],
      ['Últimos 7 días', sumarPeriodo(f=>f>=inicioSemana)],
      ['Este mes', sumarPeriodo(f=>f>=inicioMes)],
      ['Histórico total', sumarPeriodo(()=>true)]
    ];
    document.getElementById('estVentasBody').innerHTML = periodos.map(([nombre,v])=>
      `<tr><td>${nombre}</td><td class="numcell">$${num(v.venta)}</td><td class="numcell" style="color:var(--green)">$${num(v.ganancia)}</td></tr>`
    ).join('');

    // ---------- Comisiones ----------
    const comisionesVendedor = deudas.filter(d=>(d.nota||'').includes('Comisión 15%'));
    const comisionesAdmin = deudas.filter(d=>(d.nota||'').includes('Comisión administrador'));
    function resumenComision(lista){
      return {
        pagado: lista.filter(d=>d.pagada).reduce((s,d)=>s+Number(d.monto),0),
        pendiente: lista.filter(d=>!d.pagada).reduce((s,d)=>s+Number(d.monto),0)
      };
    }
    const rv = resumenComision(comisionesVendedor), ra = resumenComision(comisionesAdmin);
    document.getElementById('estComisionesBody').innerHTML = `
      <tr><td>Vendedores</td><td class="numcell">$${num(rv.pagado)}</td><td class="numcell" style="color:var(--amber)">$${num(rv.pendiente)}</td></tr>
      <tr><td>Administrador</td><td class="numcell">$${num(ra.pagado)}</td><td class="numcell" style="color:var(--amber)">$${num(ra.pendiente)}</td></tr>
    `;

    // ---------- Ranking de puestos ----------
    const porAlmacen = {};
    dias.forEach(d=>{
      const reales = itemsRealesDeVenta(itemsPorDia[d.id]||[], d.total);
      if(!porAlmacen[d.almacen_id]) porAlmacen[d.almacen_id] = {venta:0, ganancia:0};
      porAlmacen[d.almacen_id].venta += totalRealDeVenta(d, itemsPorDia[d.id]||[]);
      porAlmacen[d.almacen_id].ganancia += gananciaDeItems(reales);
    });
    const ranking = Object.entries(porAlmacen).map(([almId,v])=>({
      almacen: ALMACENES.find(a=>a.id===Number(almId)), ...v
    })).filter(r=>r.almacen).sort((a,b)=>b.ganancia-a.ganancia);

    const rankingBody = document.getElementById('estRankingBody');
    const rankingEmpty = document.getElementById('estRankingEmpty');
    if(ranking.length===0){ rankingBody.innerHTML=''; rankingEmpty.style.display='block'; }
    else{
      rankingEmpty.style.display='none';
      rankingBody.innerHTML = ranking.map((r,i)=>
        `<tr><td><span class="rank-badge ${i===0?'first':''}">${i+1}</span></td><td>${r.almacen.nombre}</td><td class="numcell">$${num(r.venta)}</td><td class="numcell" style="color:var(--green)">$${num(r.ganancia)}</td></tr>`
      ).join('');
    }

    // ---------- Top productos ----------
    const porProducto = {};
    items.forEach(it=>{
      if(!porProducto[it.producto_id]) porProducto[it.producto_id] = {cantidad:0, ganancia:0};
      porProducto[it.producto_id].cantidad += Number(it.cantidad);
      porProducto[it.producto_id].ganancia += Number(it.cantidad)*(Number(it.precio_venta)-Number(it.costo));
    });
    const listaProductos = Object.entries(porProducto).map(([pid,v])=>({producto:PRODUCTOS.find(p=>p.id===Number(pid)), ...v})).filter(x=>x.producto);
    const topCantidad = [...listaProductos].sort((a,b)=>b.cantidad-a.cantidad).slice(0,10);
    const topGanancia = [...listaProductos].sort((a,b)=>b.ganancia-a.ganancia).slice(0,10);
    document.getElementById('estTopCantidadBody').innerHTML = topCantidad.map(x=>`<tr><td>${x.producto.nombre}</td><td class="numcell">${num(x.cantidad)}</td></tr>`).join('') || '<tr><td class="empty" colspan="2">Sin datos</td></tr>';
    document.getElementById('estTopGananciaBody').innerHTML = topGanancia.map(x=>`<tr><td>${x.producto.nombre}</td><td class="numcell" style="color:var(--green)">$${num(x.ganancia)}</td></tr>`).join('') || '<tr><td class="empty" colspan="2">Sin datos</td></tr>';

    // ---------- Alertas de stock bajo ----------
    const stockBajo = (INVENTARIO||[]).filter(i=>Number(i.cantidad) <= 3 && Number(i.cantidad) >= 0)
      .map(i=>({...i, producto:PRODUCTOS.find(p=>p.id===i.producto_id), almacen:ALMACENES.find(a=>a.id===i.almacen_id)}))
      .filter(x=>x.producto && x.almacen)
      .sort((a,b)=>a.cantidad-b.cantidad);
    const stockBody = document.getElementById('estStockBajoBody');
    const stockEmpty = document.getElementById('estStockBajoEmpty');
    if(stockBajo.length===0){ stockBody.innerHTML=''; stockEmpty.style.display='block'; }
    else{
      stockEmpty.style.display='none';
      stockBody.innerHTML = stockBajo.map(x=>`<tr><td>${x.producto.nombre}</td><td>${x.almacen.nombre}</td><td class="numcell" style="color:var(--red)">${num(x.cantidad)}</td></tr>`).join('');
    }

    // ---------- Préstamos de artículos pendientes ----------
    const prestamos = deudas.filter(d=>d.tipo_deuda==='articulo' && !d.pagada);
    const prestamosBody = document.getElementById('estPrestamosBody');
    const prestamosEmpty = document.getElementById('estPrestamosEmpty');
    if(prestamos.length===0){ prestamosBody.innerHTML=''; prestamosEmpty.style.display='block'; }
    else{
      prestamosEmpty.style.display='none';
      prestamosBody.innerHTML = prestamos.map(d=>{
        const p = PRODUCTOS.find(p=>p.id===d.producto_id);
        const alm = ALMACENES.find(a=>a.id===d.almacen_id);
        const etiqueta = d.tipo==='me_deben' ? 'Presté' : 'Me prestaron';
        return `<tr><td>${etiqueta}</td><td>${d.persona}</td><td>${p?p.nombre:'—'} × ${num(d.cantidad)} (${alm?alm.nombre:'—'})</td></tr>`;
      }).join('');
    }

    // ---------- Pedidos pendientes ----------
    const pedidosBodyEst = document.getElementById('estPedidosBody');
    const pedidosEmptyEst = document.getElementById('estPedidosEmpty');
    if(pedidos.length===0){ pedidosBodyEst.innerHTML=''; pedidosEmptyEst.style.display='block'; }
    else{
      pedidosEmptyEst.style.display='none';
      pedidosBodyEst.innerHTML = pedidos.map(ped=>{
        const p = PRODUCTOS.find(p=>p.id===ped.producto_id);
        const alm = ALMACENES.find(a=>a.id===ped.almacen_id);
        return `<tr><td>${alm?alm.nombre:'—'}</td><td>${p?p.nombre:'—'}</td><td class="numcell">${num(ped.cantidad)}</td><td>${new Date(ped.creado_en).toLocaleDateString()}</td></tr>`;
      }).join('');
    }
  }catch(err){
    console.error('No se pudieron cargar las estadísticas:', err);
  }
}

// ══════════════════════════════════════════════════════════════════
// 📈 ANÁLISIS DE PRODUCTOS (solo dueño)
// Lee todas las ventas cerradas del período y calcula: velocidad (rápida/lenta),
// tendencia (subió/bajó), márgenes, capital parado y precios desactualizados.
// ══════════════════════════════════════════════════════════════════
async function cargarAnalisisProductos(){
  const body = document.getElementById('apBody');
  const msg = document.getElementById('apMsg');
  msg.textContent='';
  if(!navigator.onLine){ msg.textContent='Necesitas internet para analizar.'; msg.className='msg err'; return; }
  body.innerHTML='<div class="card">Analizando todas las ventas… un momento.</div>';
  try{
    const dias = Number(document.getElementById('apPeriodo').value)||0;
    const hoy = fechaHoyLocal();
    const sumaDias = (f,n)=>{ const d=new Date(f+'T00:00:00'); d.setDate(d.getDate()+n); return d.toISOString().slice(0,10); };
    const desde = dias>0 ? sumaDias(hoy, -dias) : '2000-01-01';
    const nom = id=>{ const p=(PRODUCTOS||[]).find(x=>x.id===id); return p?p.nombre:('#'+id); };
    const prodCat = id=>(PRODUCTOS||[]).find(x=>x.id===id);

    // 1) Ventas cerradas del período (paginado, ordenado).
    const ventas=[]; { const PAGE=1000; let d=0; for(;;){ const r=await sb.from('ventas_dia').select('id,fecha,total').eq('cerrado',true).gte('fecha',desde).order('id',{ascending:true}).range(d,d+PAGE-1); if(r.error||!r.data)break; ventas.push(...r.data); if(r.data.length<PAGE)break; d+=PAGE; } }
    if(!ventas.length){ body.innerHTML='<div class="card"><div class="empty">No hay ventas cerradas en ese período.</div></div>'; msg.textContent=''; return; }
    const totalPorVenta = {}; ventas.forEach(v=>totalPorVenta[v.id]=v.total);
    const fechaVenta = {}; ventas.forEach(v=>fechaVenta[v.id]=v.fecha);

    // 2) Ítems de esas ventas (en lotes por id).
    const ids = ventas.map(v=>v.id);
    const items=[];
    for(let i=0;i<ids.length;i+=300){
      const trozo = ids.slice(i,i+300);
      let d=0; const PAGE=1000;
      for(;;){ const r=await sb.from('venta_items').select('venta_dia_id,producto_id,cantidad,precio_venta,costo').in('venta_dia_id',trozo).order('id',{ascending:true}).range(d,d+PAGE-1); if(r.error||!r.data)break; items.push(...r.data); if(r.data.length<PAGE)break; d+=PAGE; }
    }
    // Agrupar ítems por venta y quitar duplicados con la lógica segura.
    const porVenta={}; items.forEach(it=>{ (porVenta[it.venta_dia_id]=porVenta[it.venta_dia_id]||[]).push(it); });

    // 3) Acumular por producto.
    const mitad = dias>0 ? sumaDias(hoy, -Math.round(dias/2)) : sumaDias(hoy, -Math.round((()=>{ let min=hoy; ventas.forEach(v=>{ if(v.fecha<min)min=v.fecha; }); const d0=new Date(min+'T00:00:00'), d1=new Date(hoy+'T00:00:00'); return Math.max(2,Math.round((d1-d0)/86400000)); })()/2));
    const P={}; // producto_id -> agregados
    const reg = id => P[id] || (P[id]={uds:0,venta:0,ganancia:0,fechas:new Set(),udsRec:0,udsPrev:0,precioTally:{}});
    Object.keys(porVenta).forEach(vid=>{
      const reales = itemsRealesDeVenta(porVenta[vid], totalPorVenta[vid]);
      const f = fechaVenta[vid];
      reales.forEach(it=>{
        const a=reg(it.producto_id);
        const c=Number(it.cantidad)||0, pv=Number(it.precio_venta)||0, co=Number(it.costo)||0;
        a.uds+=c; a.venta+=c*pv; a.ganancia+=c*(pv-co); a.fechas.add(f);
        if(f>=mitad) a.udsRec+=c; else a.udsPrev+=c;
        a.precioTally[pv]=(a.precioTally[pv]||0)+c; // para saber a qué precio venden de verdad
      });
    });

    const diasPeriodo = dias>0 ? dias : (()=>{ let min=hoy; ventas.forEach(v=>{ if(v.fecha<min)min=v.fecha; }); const d0=new Date(min+'T00:00:00'), d1=new Date(hoy+'T00:00:00'); return Math.max(1,Math.round((d1-d0)/86400000)+1); })();

    const lista = Object.keys(P).map(id=>{
      const a=P[Number(id)]||P[id]; const pid=Number(id);
      const udsDia = a.uds/diasPeriodo;
      const margen = a.venta>0 ? (a.ganancia/a.venta) : 0;
      let tendencia; const rec=a.udsRec, prev=a.udsPrev;
      if(prev===0 && rec===0) tendencia=0;
      else if(prev===0) tendencia=999; // apareció/creció desde cero
      else tendencia=(rec-prev)/prev*100;
      // precio real más usado (moda ponderada por cantidad)
      let precioReal=null, maxC=-1; Object.keys(a.precioTally).forEach(px=>{ if(a.precioTally[px]>maxC){maxC=a.precioTally[px]; precioReal=Number(px);} });
      const cat=prodCat(pid);
      return { pid, nombre:nom(pid), uds:a.uds, udsDia, venta:a.venta, ganancia:a.ganancia, margen, dias:a.fechas.size, tendencia, rec, prev, precioReal, precioCat: cat?Number(cat.precio_venta):null };
    });

    // Inventario para "capital parado" (con stock pero sin ventas).
    const stockPorProd={}; (INVENTARIO||[]).filter(r=>!esAlmacenMayoreoId(r.almacen_id)).forEach(r=>{ stockPorProd[r.producto_id]=(stockPorProd[r.producto_id]||0)+Number(r.cantidad||0); });

    const fmt = n => '$'+num(n);
    const pct = n => (n===999?'nuevo':(n>0?'+':'')+Math.round(n)+'%');

    // ---- Secciones ----
    let html='';

    // Resumen
    const totUds=lista.reduce((s,x)=>s+x.uds,0), totVenta=lista.reduce((s,x)=>s+x.venta,0), totGan=lista.reduce((s,x)=>s+x.ganancia,0);
    html+=`<div class="card"><h2>Resumen del período</h2>
      <div class="row">
        <div class="field"><label>Productos vendidos</label><div style="font-size:20px;font-weight:800">${lista.length}</div></div>
        <div class="field"><label>Unidades</label><div style="font-size:20px;font-weight:800">${num(totUds)}</div></div>
        <div class="field"><label>Venta total</label><div style="font-size:20px;font-weight:800;color:var(--green)">${fmt(totVenta)}</div></div>
        <div class="field"><label>Ganancia total</label><div style="font-size:20px;font-weight:800;color:var(--green)">${fmt(totGan)}</div></div>
      </div>
      <div style="color:var(--muted);font-size:12px;margin-top:6px">${diasPeriodo} día(s) analizados · ${ventas.length} ventas cerradas</div></div>`;

    const tablaProd = (arr, cols) => {
      let h=`<div style="overflow-x:auto"><table style="min-width:520px"><thead><tr><th>Producto</th>${cols.map(c=>`<th class="numcell">${c.h}</th>`).join('')}</tr></thead><tbody>`;
      h+=arr.map(x=>`<tr><td>${x.nombre}</td>${cols.map(c=>`<td class="numcell" style="${c.style?c.style(x):''}">${c.f(x)}</td>`).join('')}</tr>`).join('');
      return h+'</tbody></table></div>';
    };

    // 🔥 Venta rápida
    const rapidos=[...lista].sort((a,b)=>b.udsDia-a.udsDia).slice(0,15);
    html+=`<div class="card"><h2>🔥 Venta rápida (los que más rotan)</h2>${tablaProd(rapidos,[
      {h:'Uds', f:x=>num(x.uds)},
      {h:'Uds/día', f:x=>x.udsDia.toFixed(2)},
      {h:'Venta', f:x=>fmt(x.venta)},
      {h:'Ganancia', f:x=>fmt(x.ganancia), style:()=> 'color:var(--green)'},
    ])}</div>`;

    // 🐌 Venta lenta (con ventas pero muy poca rotación)
    const lentos=[...lista].filter(x=>x.uds>0).sort((a,b)=>a.udsDia-b.udsDia).slice(0,15);
    html+=`<div class="card"><h2>🐌 Venta lenta (rotan poco)</h2>${tablaProd(lentos,[
      {h:'Uds', f:x=>num(x.uds)},
      {h:'Uds/día', f:x=>x.udsDia.toFixed(3)},
      {h:'Stock hoy', f:x=>num(stockPorProd[x.pid]||0)},
      {h:'Ganancia', f:x=>fmt(x.ganancia), style:()=>'color:var(--green)'},
    ])}</div>`;

    // 📈 Subieron / 📉 Bajaron
    const subieron=[...lista].filter(x=>x.tendencia>=30 && x.rec>=3).sort((a,b)=>b.tendencia-a.tendencia).slice(0,15);
    const bajaron=[...lista].filter(x=>x.tendencia<=-30 && x.prev>=3).sort((a,b)=>a.tendencia-b.tendencia).slice(0,15);
    html+=`<div class="card"><h2>📈 Subieron mucho las ventas</h2>
      <div style="color:var(--muted);font-size:12px;margin-bottom:6px">Alta demanda: podrías <strong>subir el precio</strong> y/o reponer más.</div>
      ${subieron.length?tablaProd(subieron,[
        {h:'Antes', f:x=>num(x.prev)},{h:'Ahora', f:x=>num(x.rec)},
        {h:'Cambio', f:x=>pct(x.tendencia), style:()=>'color:var(--green);font-weight:700'},
        {h:'Precio', f:x=>x.precioCat!=null?fmt(x.precioCat):'—'},
      ]):'<div class="empty">Sin subidas fuertes.</div>'}</div>`;
    html+=`<div class="card"><h2>📉 Bajaron las ventas</h2>
      <div style="color:var(--muted);font-size:12px;margin-bottom:6px">Revisa: quizá <strong>bajar el precio</strong>, promocionar o no reponer tanto.</div>
      ${bajaron.length?tablaProd(bajaron,[
        {h:'Antes', f:x=>num(x.prev)},{h:'Ahora', f:x=>num(x.rec)},
        {h:'Cambio', f:x=>pct(x.tendencia), style:()=>'color:var(--red);font-weight:700'},
        {h:'Precio', f:x=>x.precioCat!=null?fmt(x.precioCat):'—'},
      ]):'<div class="empty">Sin bajadas fuertes.</div>'}</div>`;

    // 💰 Margen bajo
    const margenBajo=[...lista].filter(x=>x.venta>0 && x.margen<0.15).sort((a,b)=>a.margen-b.margen).slice(0,15);
    if(margenBajo.length) html+=`<div class="card"><h2>💰 Margen bajo (ganas poco por venta)</h2>
      <div style="color:var(--muted);font-size:12px;margin-bottom:6px">Menos del 15% de ganancia. Revisa costo o precio.</div>
      ${tablaProd(margenBajo,[
        {h:'Margen', f:x=>Math.round(x.margen*100)+'%', style:()=>'color:var(--amber);font-weight:700'},
        {h:'Venta', f:x=>fmt(x.venta)},{h:'Ganancia', f:x=>fmt(x.ganancia)},
      ])}</div>`;

    // 💤 Capital parado (stock sin ventas en el período)
    const vendidosSet=new Set(lista.map(x=>x.pid));
    const parados=(PRODUCTOS||[]).filter(p=>(stockPorProd[p.id]||0)>0 && !vendidosSet.has(p.id))
      .map(p=>({pid:p.id,nombre:p.nombre,stock:stockPorProd[p.id]||0,inmov:(stockPorProd[p.id]||0)*Number(p.costo||0)}))
      .sort((a,b)=>b.inmov-a.inmov).slice(0,20);
    if(parados.length) html+=`<div class="card"><h2>💤 Capital parado (con stock, sin vender)</h2>
      <div style="color:var(--muted);font-size:12px;margin-bottom:6px">No se vendió nada en el período pero hay stock. Dinero detenido.</div>
      ${tablaProd(parados,[
        {h:'Stock', f:x=>num(x.stock)},
        {h:'$ detenido', f:x=>fmt(x.inmov), style:()=>'color:var(--amber);font-weight:700'},
      ])}</div>`;

    // 🏷️ Precios desactualizados (comparar catálogo vs precio real de venta)
    const sugerencias=lista.filter(x=>{
      if(x.precioReal==null || x.precioCat==null || x.precioCat<=0) return false;
      if(x.uds<3) return false; // pocas ventas: no es confiable
      const dif=Math.abs(x.precioReal-x.precioCat)/x.precioCat;
      return dif>=0.10 && Math.abs(x.precioReal-x.precioCat)>=1;
    }).map(x=>({...x, difPct:(x.precioReal-x.precioCat)/x.precioCat*100}))
      .sort((a,b)=>Math.abs(b.difPct)-Math.abs(a.difPct));
    __apSugerencias=sugerencias;
    if(sugerencias.length){
      let h=`<div class="card"><h2>🏷️ Precios a actualizar (con tu visto bueno)</h2>
        <div style="color:var(--muted);font-size:12px;margin-bottom:8px">El precio del catálogo no coincide con el precio al que los vendedores están vendiendo de verdad. Aprueba uno por uno el que quieras cambiar.</div>
        <div style="overflow-x:auto"><table style="min-width:520px"><thead><tr><th>Producto</th><th class="numcell">Catálogo</th><th class="numcell">Precio real</th><th class="numcell">Dif.</th><th></th></tr></thead><tbody>`;
      h+=sugerencias.map(x=>`<tr>
        <td>${x.nombre}</td>
        <td class="numcell">${fmt(x.precioCat)}</td>
        <td class="numcell" style="font-weight:700">${fmt(x.precioReal)}</td>
        <td class="numcell" style="color:${x.difPct>0?'var(--green)':'var(--red)'};font-weight:700">${x.difPct>0?'+':''}${Math.round(x.difPct)}%</td>
        <td><button class="primary" style="padding:6px 12px;font-size:13px" onclick="aprobarPrecioSugerido(${x.pid}, ${x.precioReal})">✓ Actualizar a ${fmt(x.precioReal)}</button></td>
      </tr>`).join('');
      h+=`</tbody></table></div></div>`;
      html+=h;
    } else {
      html+=`<div class="card"><h2>🏷️ Precios a actualizar</h2><div class="empty">Los precios del catálogo coinciden con lo que venden. Nada que actualizar.</div></div>`;
    }

    body.innerHTML=html;
    msg.textContent='';
  }catch(e){ body.innerHTML=''; msg.textContent='No se pudo analizar: '+(e.message||e); msg.className='msg err'; }
}

// El dueño aprueba cambiar el precio de catálogo al precio real de venta.
async function aprobarPrecioSugerido(pid, nuevoPrecio){
  const p=(PRODUCTOS||[]).find(x=>x.id===pid);
  if(!confirm(`¿Actualizar el precio de "${p?p.nombre:('#'+pid)}" a $${num(nuevoPrecio)}?`)) return;
  if(!navigator.onLine){ alert('Necesitas internet.'); return; }
  try{
    const {data,error}=await sb.from('productos').update({precio_venta:Number(nuevoPrecio)}).eq('id',pid).select();
    if(error) throw error;
    if(!data||!data.length){ alert('El servidor no aplicó el cambio (permisos).'); return; }
    if(p) p.precio_venta=Number(nuevoPrecio);
    lsSet('adm_cache_productos', PRODUCTOS);
    alert('Precio actualizado. ✓');
    cargarAnalisisProductos();
  }catch(e){ alert('No se pudo: '+(e.message||e)); }
}

async function cargarAjustesCompartidos(){
  PESTANAS_OCULTAS = lsGet('ajuste_pestanas_ocultas', []);   // lo último que supimos
  AJUSTES_COMPARTIDOS = false;
  if(!navigator.onLine || typeof sb==='undefined' || !sb) return;
  try{
    const {data, error} = await sb.from('ajustes').select('valor').eq('clave','pestanas_ocultas').maybeSingle();
    if(error) throw error;
    AJUSTES_COMPARTIDOS = true;
    const v = data && data.valor;
    PESTANAS_OCULTAS = Array.isArray(v) ? v : (v && Array.isArray(v.lista) ? v.lista : []);
    lsSet('ajuste_pestanas_ocultas', PESTANAS_OCULTAS);
  }catch(e){ /* la tabla aún no existe: nos quedamos con lo de este teléfono */ }
  try{
    const {data, error} = await sb.from('ajustes').select('valor').eq('clave','stock_minimos').maybeSingle();
    if(!error && data && data.valor && typeof data.valor === 'object'){
      STOCK_MINIMOS = normalizarMinimos(data.valor);
      lsSet('ajuste_stock_minimos', STOCK_MINIMOS);
    }
  }catch(e){}
}

function aplicarPestanasOcultas(){
  const ocultas = new Set((PESTANAS_OCULTAS||[]).filter(k=>!PESTANAS_INTOCABLES.has(k)));
  document.querySelectorAll('#drawerNavGestion button[data-tab]').forEach(b=>{
    if(ocultas.has(b.dataset.tab)) b.style.display = 'none';
  });
  document.querySelectorAll('button[data-vtab]').forEach(b=>{
    if(ocultas.has('v:'+b.dataset.vtab)) b.style.display = 'none';
  });
}

async function guardarPestanasOcultas(lista){
  PESTANAS_OCULTAS = (lista||[]).filter(k=>!PESTANAS_INTOCABLES.has(k));
  lsSet('ajuste_pestanas_ocultas', PESTANAS_OCULTAS);
  aplicarPestanasOcultas();
  if(!navigator.onLine){ return {compartido:false, motivo:'sin internet'}; }
  try{
    let r = await sb.from('ajustes').upsert({clave:'pestanas_ocultas', valor:PESTANAS_OCULTAS, actualizado_en:new Date().toISOString()}, {onConflict:'clave'}).select();
    if(r.error) throw r.error;
    if(!r.data || !r.data.length) return {compartido:false, motivo:'permisos'};
    AJUSTES_COMPARTIDOS = true;
    return {compartido:true};
  }catch(e){
    return {compartido:false, motivo:'falta la tabla', detalle:(e&&e.message)||String(e)};
  }
}

function renderConfigPestanas(){
  const cont = document.getElementById('configPestanasBody');
  if(!cont) return;
  if(!usuarioActual || usuarioActual.rol!=='dueno'){ cont.innerHTML=''; return; }
  const ocultas = new Set(PESTANAS_OCULTAS||[]);
  cont.innerHTML =
    (AJUSTES_COMPARTIDOS
      ? '<div class="msg ok">Lo que escondas aquí se esconde en TODOS los teléfonos.</div>'
      : '<div class="msg err">Ahora mismo esto solo se guarda en este teléfono. Para que les aplique a todos, corre en Supabase el SQL <b>ajustes.sql</b>.</div>')
    + PESTANAS_DEL_MENU.map(g=>
      '<div style="margin-top:12px"><div style="font-weight:800; margin-bottom:6px">'+g.grupo+'</div>'
      + g.tabs.map(t=>{
          const fija = PESTANAS_INTOCABLES.has(t.k);
          const esconder = ocultas.has(t.k);
          return '<label style="display:flex; align-items:center; gap:10px; padding:8px 4px; border-bottom:1px solid var(--border)'+(fija?'; opacity:.5':'')+'">'
            + '<input type="checkbox" data-pest="'+t.k+'" '+(esconder?'checked':'')+(fija?' disabled':'')+' style="width:20px; height:20px">'
            + '<span>'+t.n+(fija?' <span style="color:var(--muted); font-size:12px">(no se puede esconder)</span>':'')+'</span>'
            + '</label>';
        }).join('')
      + '</div>').join('')
    + '<button class="primary" style="width:100%; margin-top:14px" onclick="guardarConfigPestanas()">Guardar</button>'
    + '<div id="configPestanasMsg" class="msg"></div>';
}

async function guardarConfigPestanas(){
  const cont = document.getElementById('configPestanasBody');
  const msg = document.getElementById('configPestanasMsg');
  if(!cont) return;
  const lista = [...cont.querySelectorAll('input[data-pest]')].filter(c=>c.checked && !c.disabled).map(c=>c.dataset.pest);
  const r = await guardarPestanasOcultas(lista);
  if(msg){
    if(r.compartido){ msg.textContent = 'Guardado. ✓ Se aplica en todos los teléfonos (cada uno lo verá al volver a entrar).'; msg.className='msg ok'; }
    else if(r.motivo==='sin internet'){ msg.textContent = 'Guardado en este teléfono. Conéctate y guarda otra vez para que les aplique a todos.'; msg.className='msg err'; }
    else if(r.motivo==='permisos'){ msg.textContent = 'No se pudo guardar en el servidor (permisos). Corre el SQL "permisos_todas_tablas.sql".'; msg.className='msg err'; }
    else { msg.textContent = 'Guardado solo en este teléfono. Para que les aplique a todos, corre en Supabase el SQL "ajustes.sql".'; msg.className='msg err'; }
  }
  renderConfigPestanas();
}


// ═══════════════════════════════════════════════════════════════════════════
//  SE ESTÁ ACABANDO  ·  mínimo por artículo y lista de lo que hay que comprar
// ═══════════════════════════════════════════════════════════════════════════
function escH(t){ return String(t==null?'':t).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function normalizarMinimos(v){
  const g = (v && v.general != null && v.general !== '') ? Number(v.general) : NaN;   // sin ajuste guardado → 2
  const por = {};
  if(v && v.porProducto && typeof v.porProducto === 'object'){
    for(const k of Object.keys(v.porProducto)){ const n = Number(v.porProducto[k]); if(isFinite(n) && n >= 0) por[k] = n; }
  }
  return {general: (isFinite(g) && g >= 0) ? g : 2, porProducto: por};
}
function minimoDe(pid){
  const propio = STOCK_MINIMOS.porProducto[String(pid)];
  return (propio != null) ? propio : STOCK_MINIMOS.general;
}
// Devuelve lo que está en su mínimo o por debajo. No cuenta MAYOREO ni almacenes archivados.
function calcularPorAcabarse(productos, inventario, almacenes, minimos){
  const M = minimos || STOCK_MINIMOS;
  const cuenta = new Set((almacenes||[]).filter(a=>!esMayoreo(a) && !estaArchivado(a)).map(a=>Number(a.id)));
  const nombreAlm = {}; (almacenes||[]).forEach(a=>{ nombreAlm[Number(a.id)] = a.nombre; });
  const total = {}, porAlm = {};
  for(const r of (inventario||[])){
    const a = Number(r.almacen_id); if(!cuenta.has(a)) continue;
    const c = Number(r.cantidad||0); if(!c) continue;
    total[r.producto_id] = (total[r.producto_id]||0) + c;
    (porAlm[r.producto_id] = porAlm[r.producto_id] || {})[a] = ((porAlm[r.producto_id]||{})[a]||0) + c;
  }
  const pocos = [], agotados = [];
  for(const p of (productos||[])){
    const propio = M.porProducto[String(p.id)];
    const min = (propio != null) ? propio : M.general;
    const hay = Math.round((total[p.id]||0)*100)/100;
    if(hay > min) continue;
    const fila = {id:p.id, nombre:p.nombre, hay, min, propio: propio != null,
      donde: Object.keys(porAlm[p.id]||{}).map(a=>({almacen: nombreAlm[a] || ('almacén '+a), cantidad: porAlm[p.id][a]})).sort((x,y)=>y.cantidad-x.cantidad)};
    // Agotado solo se avisa si tiene mínimo propio (>0) o si el general es mayor que 0:
    // un artículo que ya no se trabaja se quita poniéndole mínimo 0... y los que están en 0 van aparte.
    if(hay <= 0) agotados.push(fila); else pocos.push(fila);
  }
  pocos.sort((a,b)=> (a.hay-b.hay) || String(a.nombre).localeCompare(String(b.nombre)));
  agotados.sort((a,b)=> (b.propio-a.propio) || String(a.nombre).localeCompare(String(b.nombre)));
  return {pocos, agotados};
}
function filaPorAcabarseHTML(f){
  const donde = f.donde.length ? f.donde.map(d=>`${escH(d.almacen)} <strong>${num(d.cantidad)}</strong>`).join(' · ') : 'no queda en ningún almacén';
  const color = f.hay <= 0 ? 'var(--red)' : 'var(--amber)';
  return `<div style="display:flex; align-items:center; gap:10px; padding:8px 0; border-bottom:1px solid var(--border)">
    <div style="min-width:44px; text-align:center; font-weight:800; font-size:18px; color:${color}">${num(f.hay)}</div>
    <div style="flex:1; min-width:0">
      <div style="font-weight:700; overflow-wrap:anywhere">${escH(f.nombre)}</div>
      <div style="color:var(--muted); font-size:12px">${donde}</div>
    </div>
    <label style="display:flex; flex-direction:column; align-items:center; font-size:10px; color:var(--muted)">mín
      <input type="number" inputmode="numeric" min="0" value="${f.propio ? f.min : ''}" placeholder="${num(STOCK_MINIMOS.general)}"
        onchange="guardarMinimoProducto(${f.id}, this.value)" style="width:58px; padding:5px; text-align:center">
    </label>
  </div>`;
}
function renderPorAcabarse(){
  const body = document.getElementById('minBody'); if(!body) return;
  const inpG = document.getElementById('minGeneral');
  if(inpG && document.activeElement !== inpG) inpG.value = STOCK_MINIMOS.general;
  const q = (((document.getElementById('minBuscar')||{}).value) || '').trim();
  if(q){
    // Modo búsqueda: cualquier artículo, para ponerle su mínimo aunque hoy tenga de sobra.
    const total = {};
    const r = calcularPorAcabarse(PRODUCTOS, INVENTARIO, ALMACENES, {general:Infinity, porProducto:{}});
    const todos = r.pocos.concat(r.agotados).filter(f => (typeof coincideNombre === 'function') ? coincideNombre(f.nombre, q) : String(f.nombre).toLowerCase().includes(q.toLowerCase()));
    todos.forEach(f=>{ const propio = STOCK_MINIMOS.porProducto[String(f.id)]; f.propio = propio != null; f.min = f.propio ? propio : STOCK_MINIMOS.general; });
    body.innerHTML = todos.length ? todos.slice(0,40).map(filaPorAcabarseHTML).join('') + (todos.length>40?`<div style="color:var(--muted); font-size:12px; padding-top:6px">…y ${todos.length-40} más. Escribe más letras.</div>`:'')
                                  : '<div style="color:var(--muted)">Ningún artículo con ese nombre.</div>';
    return;
  }
  const r = calcularPorAcabarse(PRODUCTOS, INVENTARIO, ALMACENES);
  const TOPE = 150;
  let h = '';
  if(!r.pocos.length) h += '<div style="color:var(--green); font-weight:700">✓ Nada está por acabarse.</div>';
  else h += `<div style="font-weight:800; margin-bottom:4px; color:var(--amber)">Quedan pocos: ${r.pocos.length}</div>` + r.pocos.slice(0,TOPE).map(filaPorAcabarseHTML).join('')
          + (r.pocos.length>TOPE?`<div style="color:var(--muted); font-size:12px; padding-top:6px">…y ${r.pocos.length-TOPE} más.</div>`:'');
  if(r.agotados.length){
    h += `<details style="margin-top:14px"><summary style="cursor:pointer; font-weight:800; color:var(--red)">Agotados (en cero): ${r.agotados.length}</summary>`
       + r.agotados.slice(0,TOPE).map(filaPorAcabarseHTML).join('')
       + (r.agotados.length>TOPE?`<div style="color:var(--muted); font-size:12px; padding-top:6px">…y ${r.agotados.length-TOPE} más. Usa el buscador.</div>`:'')
       + `<div style="color:var(--muted); font-size:12px; padding-top:6px">Si un artículo ya no lo trabajas, ponle mínimo 0 y deja de salir en "Quedan pocos".</div></details>`;
  }
  body.innerHTML = h;
}
async function guardarMinimos(){
  lsSet('ajuste_stock_minimos', STOCK_MINIMOS);
  const msg = document.getElementById('minMsg');
  let compartido = false;
  if(navigator.onLine){
    try{
      const r = await sb.from('ajustes').upsert({clave:'stock_minimos', valor:STOCK_MINIMOS, actualizado_en:new Date().toISOString()}, {onConflict:'clave'}).select();
      compartido = !r.error && r.data && r.data.length > 0;
    }catch(e){}
  }
  if(msg){
    msg.textContent = compartido ? 'Guardado. ✓ Vale para todos los teléfonos.' : 'Guardado en este teléfono. (Para que valga en todos hace falta internet y haber corrido "ajustes.sql".)';
    msg.className = compartido ? 'msg ok' : 'msg';
  }
}
async function guardarMinimoGeneral(){
  const v = Number(document.getElementById('minGeneral').value);
  if(!isFinite(v) || v < 0){ renderPorAcabarse(); return; }
  STOCK_MINIMOS.general = v;
  renderPorAcabarse();
  await guardarMinimos();
}
async function guardarMinimoProducto(pid, valor){
  const t = String(valor==null?'':valor).trim();
  if(t === '') delete STOCK_MINIMOS.porProducto[String(pid)];     // vacío = vuelve a usar el general
  else { const v = Number(t); if(!isFinite(v) || v < 0) return; STOCK_MINIMOS.porProducto[String(pid)] = v; }
  await guardarMinimos();
  if(!(((document.getElementById('minBuscar')||{}).value)||'').trim()) renderPorAcabarse();
}

// ═══════════════════════════════════════════════════════════════════════════
//  RESUMEN DEL DÍA (solo dueño)  ·  todo lo de hoy en una sola pantalla
// ═══════════════════════════════════════════════════════════════════════════
function moverDiaResumen(pasos){
  const inp = document.getElementById('hoyFecha'); if(!inp) return;
  const base = inp.value || fechaHoyLocal();
  const d = new Date(base + 'T12:00:00'); d.setDate(d.getDate() + pasos);
  const f = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
  if(f > fechaHoyLocal()) return;        // no hay mañana todavía
  inp.value = f; cargarResumenHoy();
}
// Las cuentas, aparte de la pantalla (para poder probarlas).
function armarResumenDia(d){
  const puestos = (d.almacenes||[]).filter(a=>esPuntoVenta(a) && !estaArchivado(a));
  const nombreAlm = {}; (d.almacenes||[]).forEach(a=>{ nombreAlm[Number(a.id)] = a.nombre; });
  const itemsPorDia = {};
  for(const it of (d.items||[])) (itemsPorDia[it.venta_dia_id] = itemsPorDia[it.venta_dia_id] || []).push(it);
  const cajaPorDia = {};
  // El dinero de cada venta se reconoce por su enlace (venta_dia_id). Si la base todavía no
  // guarda ese enlace, se reconoce por el concepto ("Venta P 49 - 2026-11-12").
  const cajaSuelta = {};
  const vistos = new Set();
  for(const m of (d.cajaVentas||[]).concat(d.caja||[])){
    if(m.id != null){ if(vistos.has(m.id)) continue; vistos.add(m.id); }
    if(m.tipo !== 'ingreso') continue;
    if(m.venta_dia_id != null){ cajaPorDia[m.venta_dia_id] = (cajaPorDia[m.venta_dia_id]||0) + Number(m.monto||0); continue; }
    const c = String(m.concepto||'');
    if(!/^(venta|sobrante)\s/i.test(c) || !d.fecha || !c.endsWith(' - ' + d.fecha)) continue;
    const nom = c.replace(/^(venta|sobrante)\s+/i, '').slice(0, -(' - ' + d.fecha).length).trim().toLowerCase();
    const alm = (d.almacenes||[]).find(a=>String(a.nombre||'').trim().toLowerCase() === nom);
    if(alm) cajaSuelta[Number(alm.id)] = (cajaSuelta[Number(alm.id)]||0) + Number(m.monto||0);
  }
  const porAlm = {};
  const fila = (id)=> porAlm[id] = porAlm[id] || {almacen_id:id, nombre: nombreAlm[id] || ('almacén '+id), vendido:0, ganancia:0, entro:0, cerradas:0, abiertas:0, sinEnlace:false};
  puestos.forEach(p=>fila(Number(p.id)));
  for(const dia of (d.dias||[])){
    const its = itemsPorDia[dia.id] || [];
    const vendidoItems = its.reduce((s,i)=>s + Number(i.cantidad||0)*Number(i.precio_venta||0), 0);
    const costo = its.reduce((s,i)=>s + Number(i.cantidad||0)*Number(i.costo||0), 0);
    if(!dia.cerrado && its.length === 0) continue;          // día abierto y vacío: todavía no es nada
    const f = fila(Number(dia.almacen_id));
    const vendido = dia.cerrado ? Number(dia.total||0) : vendidoItems;
    f.vendido += vendido; f.ganancia += (its.length ? vendidoItems - costo : 0);
    if(dia.cerrado){ f.cerradas++; f.entro += (cajaPorDia[dia.id]||0); } else f.abiertas++;
  }
  for(const f of Object.values(porAlm)){ if(f.cerradas && cajaSuelta[f.almacen_id]) f.entro += cajaSuelta[f.almacen_id]; }
  const filas = Object.values(porAlm).sort((a,b)=> b.vendido - a.vendido || String(a.nombre).localeCompare(String(b.nombre)));
  const r2 = n => Math.round(n*100)/100;
  filas.forEach(f=>{ f.vendido=r2(f.vendido); f.ganancia=r2(f.ganancia); f.entro=r2(f.entro);
    f.estado = f.abiertas ? 'vendiendo' : (f.cerradas ? 'cerrado' : 'sin venta'); });
  let entroHoy = 0, salioHoy = 0;
  for(const m of (d.caja||[])){ if(m.tipo === 'ingreso') entroHoy += Number(m.monto||0); else salioHoy += Number(m.monto||0); }
  return {filas, vendido: r2(filas.reduce((s,f)=>s+f.vendido,0)), ganancia: r2(filas.reduce((s,f)=>s+f.ganancia,0)),
          entroHoy: r2(entroHoy), salioHoy: r2(salioHoy)};
}
async function cargarResumenHoy(){
  const cont = document.getElementById('hoyBody'); if(!cont) return;
  const inp = document.getElementById('hoyFecha');
  const hoy = fechaHoyLocal();
  if(inp && !inp.value) inp.value = hoy;
  if(inp) inp.max = hoy;
  const fecha = (inp && inp.value) || hoy;
  const pend = contarPendientesTotales();
  if(!navigator.onLine){
    const c = lsGet('adm_cache_resumen_dia', null);
    cont.innerHTML = (c && c.fecha === fecha)
      ? `<div class="msg err" style="margin-bottom:10px">Sin internet: esto es lo último que se supo (${escH(c.hora)}).</div>` + c.html
      : '<div class="msg err">Necesitas internet para ver el resumen de este día.</div>';
    return;
  }
  cont.textContent = 'Cargando…';
  try{
    // Al entrar, la lista de almacenes e inventario puede estar llegando todavía: se le da un momento.
    for(let i=0; i<30 && !((ALMACENES||[]).length && (INVENTARIO||[]).length); i++) await new Promise(r=>setTimeout(r,200));
    const ini = new Date(fecha + 'T00:00:00'), fin = new Date(fecha + 'T00:00:00'); fin.setDate(fin.getDate()+1);
    const [dias, caja, pedidos, viejas, totales] = await Promise.all([
      traerTodasLasFilas(()=> sb.from('ventas_dia').select('*').eq('fecha', fecha).order('id',{ascending:true})),
      traerTodasLasFilas(()=> sb.from('caja_movimientos').select('*').gte('creado_en', ini.toISOString()).lt('creado_en', fin.toISOString()).order('id',{ascending:true})),
      traerTodasLasFilas(()=> sb.from('pedidos').select('id').eq('estado','pendiente').order('id',{ascending:true})).catch(()=>[]),
      traerTodasLasFilas(()=> sb.from('ventas_dia').select('id, almacen_id, fecha').eq('cerrado', false).lt('fecha', fecha).order('id',{ascending:true})).catch(()=>[]),
      calcularTotalesCaja().catch(()=>null)
    ]);
    const idsDias = dias.map(x=>x.id);
    const items = await traerItemsDe(idsDias, 'venta_dia_id, cantidad, precio_venta, costo');
    // El dinero de las ventas de ese día, aunque haya subido otro día (ventas hechas sin internet).
    let cajaVentas = [];
    if(idsDias.length){ try{ cajaVentas = await traerTodasLasFilas(()=> sb.from('caja_movimientos').select('*').in('venta_dia_id', idsDias).order('id',{ascending:true})); }catch(e){ cajaVentas = []; } }
    const R = armarResumenDia({almacenes: ALMACENES, dias, items, caja, cajaVentas, fecha});
    const bajo = calcularPorAcabarse(PRODUCTOS, INVENTARIO, ALMACENES);
    const esHoy = fecha === hoy;

    let h = `<div style="display:flex; gap:10px; flex-wrap:wrap">
      ${kpiHTML('Vendido', '$'+num(R.vendido), 'var(--green)', esHoy ? 'hasta ahora' : fecha)}
      ${kpiHTML('Ganancia', '$'+num(R.ganancia), R.ganancia>=0?'var(--text)':'var(--red)', 'venta menos costo')}
    </div>
    <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:10px">
      ${kpiHTML('Entró a caja', '$'+num(R.entroHoy), 'var(--green)', 'ese día')}
      ${kpiHTML('Salió de caja', '$'+num(R.salioHoy), R.salioHoy>0?'var(--red)':'var(--text)', 'ese día')}
    </div>`;
    if(totales) h += `<div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:10px">
      ${kpiHTML('Efectivo que debe haber', '$'+num(totales.efectivo), totales.efectivo<0?'var(--red)':'var(--text)', 'ahora mismo')}
      ${kpiHTML('En tarjeta', '$'+num(totales.tarjeta), totales.tarjeta<0?'var(--red)':'var(--text)', 'ahora mismo')}
    </div>`;

    const ETQ = {vendiendo:'<span style="color:var(--amber)">● vendiendo</span>', cerrado:'<span style="color:var(--green)">✓ cerrado</span>', 'sin venta':'<span style="color:var(--muted)">— sin venta</span>'};
    h += seccionHTML('Por puesto', tablaHTML(['Puesto','Vendido','Ganancia','Entró a caja'],
      R.filas.map(f=>[`<strong>${escH(f.nombre)}</strong><div style="font-size:12px">${ETQ[f.estado]}</div>`, '$'+num(f.vendido), '$'+num(f.ganancia),
        f.cerradas ? ('$'+num(f.entro) + (f.vendido-f.entro > 0.009 ? `<div style="font-size:11px; color:var(--amber)">faltan $${num(f.vendido-f.entro)}</div>` : '')) : '—']))
      + '<div style="color:var(--muted); font-size:12px; margin-top:6px">"Faltan" es lo vendido que no entró a la caja: casi siempre es lo que el puesto se cobró de lo suyo. El detalle está en ⚖️ Conciliación.</div>');

    const avisos = [];
    const sinVenta = R.filas.filter(f=>f.estado==='sin venta');
    if(esHoy && sinVenta.length) avisos.push(`Sin venta todavía: <strong>${sinVenta.map(f=>escH(f.nombre)).join(', ')}</strong>.`);
    if(viejas.length){
      const txt = viejas.slice(0,6).map(v=>`${escH((ALMACENES.find(a=>Number(a.id)===Number(v.almacen_id))||{}).nombre || 'un puesto')} (${escH(v.fecha)})`).join(', ');
      avisos.push(`Hay <strong>${viejas.length}</strong> venta(s) de días anteriores que quedaron <strong>sin cerrar</strong>: ${txt}${viejas.length>6?'…':''}`);
    }
    if(pedidos.length) avisos.push(`<strong>${pedidos.length}</strong> pedido(s) de los puestos esperando respuesta. <a href="#" style="color:var(--accent); font-weight:700" onclick="irAPestana('pedidos');return false">Ver pedidos</a>`);
    if(bajo.pocos.length) avisos.push(`<strong>${bajo.pocos.length}</strong> artículo(s) se están acabando. <a href="#" style="color:var(--accent); font-weight:700" onclick="irAPestana('reposicion');return false">Ver cuáles</a>`);
    if(pend > 0) avisos.push(`En ESTE teléfono hay <strong>${pend}</strong> cosa(s) sin subir. <a href="#" style="color:var(--accent); font-weight:700" onclick="subirPendientesAhora();return false">Subir ahora</a>`);
    h += seccionHTML('Para revisar', avisos.length
      ? avisos.map(a=>`<div style="padding:8px 10px; margin-bottom:6px; border-left:3px solid var(--amber); background:var(--panel2); border-radius:6px; font-size:14px">${a}</div>`).join('')
      : '<div style="color:var(--green); font-weight:700">✓ Todo en orden.</div>');

    cont.innerHTML = h;
    const ahora = new Date();
    lsSet('adm_cache_resumen_dia', {fecha, html:h, hora: ahora.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})});
  }catch(e){
    cont.innerHTML = '<div class="msg err">No se pudo cargar el resumen: ' + escH(__esErrorDeRed(e) ? 'se cortó la conexión. Toca ↻ para probar otra vez.' : ((e&&e.message)||e)) + '</div>';
  }
}
function irAPestana(k){
  const b = document.querySelector('.tabs button[data-tab="'+k+'"]');
  if(b) b.click();
}

function aplicarRestriccionesDeRol(){
  const esDueno = usuarioActual.rol === 'dueno';
  document.getElementById('tabBtnUsuarios').style.display = esDueno ? 'inline-block' : 'none';
  document.getElementById('tabBtnEstadisticas').style.display = esDueno ? 'inline-block' : 'none';
  document.getElementById('tabBtnAnalizador').style.display = esDueno ? 'inline-block' : 'none';
  { const b=document.getElementById('tabBtnHoy'); if(b) b.style.display = esDueno ? 'inline-block' : 'none'; }
  { const b=document.getElementById('tabBtnAnalisisProd'); if(b) b.style.display = esDueno ? 'inline-block' : 'none'; }
  { const b=document.getElementById('tabBtnArticulo'); if(b) b.style.display = (esDueno || __usuarioEs('jk')) ? 'inline-block' : 'none'; }
  { const b=document.getElementById('tabBtnConciliacion'); if(b) b.style.display = esDueno ? 'inline-block' : 'none'; }  // SOLO el dueño
  { const b=document.getElementById('tabBtnMayoreo'); if(b) b.style.display = puedeMayoreoAdmin() ? 'inline-block' : 'none'; }
  { const b=document.getElementById('tabBtnErrores'); if(b){ b.style.display = esDueno ? 'inline-block' : 'none'; if(esDueno) actualizarBadgeErrores(); } }
  document.getElementById('tabBtnCobrarAdmin').style.display = usuarioActual.rol==='administrador' ? 'inline-block' : 'none';
  const cardComp = document.getElementById('cardComprobarInv');
  if(cardComp) cardComp.style.display = esDueno ? '' : 'none';
  document.querySelectorAll('.solo-dueno').forEach(el=> el.style.display = esDueno ? '' : 'none');
  // SIEMPRE al final: lo que el dueño mandó a esconder se esconde encima de todo lo anterior.
  try{ aplicarPestanasOcultas(); }catch(e){}
  try{ renderConfigPestanas(); }catch(e){}
  // El dueño entra directo a su Resumen del día (una sola vez por sesión, y solo si no la escondió).
  try{
    const bHoy = document.getElementById('tabBtnHoy');
    if(esDueno && bHoy && !__hoyYaAbierto && bHoy.style.display !== 'none' && document.getElementById('appGestion').style.display !== 'none'){
      __hoyYaAbierto = true; bHoy.click();
    }
  }catch(e){}
}
