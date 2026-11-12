// LOPE · Mi Negocio — Datos en memoria y arranque
// Aquí está, en orden, todo lo que se ejecuta al abrir la app: la conexión, las variables
// que guardan el estado y los avisos/temporizadores. Las funciones están en app1…app7.
// IMPORTANTE: este archivo se carga de ÚLTIMO.

// ====== CONFIGURA TU SUPABASE AQUÍ ======
const SUPABASE_URL = "https://dkkrbiyidfgsxasdbxjt.supabase.co";
const SUPABASE_KEY = "sb_publishable_gVKtXTwNjGThLtVSMowK1Q_68AmhtgE";
// =========================================

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let ALMACENES = [];
let PRODUCTOS = [];
let INVENTARIO = [];
let usuarioActual = null; // {id, nombre, rol, almacen_id}

const statusEl = document.getElementById('status');

// ---------- TABS ----------
document.querySelectorAll('.tabs button').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    if(!btn.dataset.tab) return; // los botones de Ventas usan data-vtab, no son de este menú
    document.querySelectorAll('.tabs button').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.tab').forEach(t=>t.style.display='none');
    document.getElementById('tab-'+btn.dataset.tab).style.display='block';
    if(btn.dataset.tab==='historial') cargarHistorial();
    if(btn.dataset.tab==='pedidos') cargarPedidos();
    if(btn.dataset.tab==='movimientos') cargarInventarioMov();
    if(btn.dataset.tab==='hoy' && usuarioActual.rol==='dueno') cargarResumenHoy();
    if(btn.dataset.tab==='reposicion'){ cargarReposicion(); renderPorAcabarse(); }
    if(btn.dataset.tab==='recepcion') cargarConciliacion();
    if(btn.dataset.tab==='dinero') cargarDinero();
    if(btn.dataset.tab==='deudas') cargarDeudas();
    if(btn.dataset.tab==='comisionadmin') cargarDinero();
    if(btn.dataset.tab==='usuarios') cargarUsuarios();
    if(btn.dataset.tab==='cobraradmin') cargarCobrosAdmin();
    if(btn.dataset.tab==='errores') cargarErrores();
    if(btn.dataset.tab==='estadisticas'){ prepararSelectorEstadisticas(); cargarListaVentas(); }
    if(btn.dataset.tab==='compras') prepararCompras();
    if(btn.dataset.tab==='ventasvendedor') prepararVentasPorVendedor();
    if(btn.dataset.tab==='articulo') prepararBuscarArticulo();
    if(btn.dataset.tab==='conciliacion') prepararConciliacion();
    if(btn.dataset.tab==='analizador' && usuarioActual.rol==='dueno') cargarAnalizador();
    if(btn.dataset.tab==='analisisprod' && usuarioActual.rol==='dueno') cargarAnalisisProductos();
    if(btn.dataset.tab==='mayoreo') cargarMayoreo();
    if(btn.dataset.tab==='admin' && usuarioActual.rol==='dueno') cargarHistorialPrecios();
    cerrarMenu();
  });
});
aplicarTema(lsGet('tema_preferido', 'dark'));

// ---------- TAMAÑO DE LETRA (niveles 1 a 5, para personas mayores) ----------
// Usa 'zoom' para agrandar TODO parejo (letra, botones, tablas) y que el texto se reacomode
// sin salirse. Se guarda en el teléfono, así queda fijo para quien use la app.
const ESCALA_LETRA = {1:1, 2:1.15, 3:1.3, 4:1.5, 5:1.75};
aplicarLetra(lsGet('letra_nivel', 1));

document.getElementById('movTipo').addEventListener('change', (e)=>{
  const tipo = e.target.value;
  document.getElementById('fieldDestino').style.display = tipo==='traslado' ? 'block' : 'none';
  document.getElementById('labelOrigen').textContent = tipo==='ingreso' ? 'Almacén destino' : (tipo==='traslado' ? 'Almacén origen' : 'Almacén');
  // Tinte suave del selector según el tipo (misma idea que las filas y el historial).
  const t = document.getElementById('movTipo');
  const tinte = tipo==='ingreso' ? 'rgba(62,207,142,.15)'
    : tipo==='extraccion' ? 'rgba(255,92,92,.15)'
    : 'rgba(255,180,84,.15)';
  const borde = tipo==='ingreso' ? 'var(--green)' : tipo==='extraccion' ? 'var(--red)' : 'var(--amber)';
  t.style.background = tinte;
  t.style.borderColor = borde;
  t.style.fontWeight = '700';
});

// ============================================================
// COMPRAS (mercancía que se compra para el negocio)
// El costo del producto se recalcula con PROMEDIO PONDERADO:
//   costo nuevo = (existencia × costo viejo + comprado × costo compra) / (existencia + comprado)
// Ejemplo: 10 cables a $100 + 10 cables a $150 → (1000 + 1500) / 20 = $125
// ============================================================
const compraAcInput = document.getElementById('compraProductoTexto');
const compraAcHidden = document.getElementById('compraProducto');
const compraAcList = document.getElementById('compraProductoList');
let compraAcMatches = [];
let compraAcHoverIndex = -1;

compraAcInput.addEventListener('input', ()=>{
  compraAcHidden.value = '';
  previsualizarCompra();
  const q = compraAcInput.value.trim().toLowerCase();
  if(!q){ compraAcList.style.display='none'; compraAcMatches=[]; return; }
  compraAcMatches = PRODUCTOS.filter(p=>coincideNombre(p.nombre, q)).slice(0,30);
  compraAcHoverIndex = -1;
  if(compraAcMatches.length===0){ compraAcList.style.display='none'; return; }
  compraAcList.innerHTML = compraAcMatches.map((p,i)=>`<div data-i="${i}">${p.nombre}</div>`).join('');
  compraAcList.style.display='block';
});

compraAcList.addEventListener('mousedown', (e)=>{
  const div = e.target.closest('div[data-i]');
  if(!div) return;
  seleccionarProductoCompra(compraAcMatches[Number(div.dataset.i)]);
});

compraAcInput.addEventListener('keydown', (e)=>{
  if(compraAcList.style.display==='none') return;
  const items = compraAcList.querySelectorAll('div');
  if(e.key==='ArrowDown'){ e.preventDefault(); compraAcHoverIndex = Math.min(compraAcHoverIndex+1, items.length-1); }
  else if(e.key==='ArrowUp'){ e.preventDefault(); compraAcHoverIndex = Math.max(compraAcHoverIndex-1, 0); }
  else if(e.key==='Enter'){ e.preventDefault(); if(compraAcHoverIndex>=0) seleccionarProductoCompra(compraAcMatches[compraAcHoverIndex]); return; }
  else return;
  items.forEach((it,i)=>it.classList.toggle('hover', i===compraAcHoverIndex));
});

let registrandoCompra = false;

// ---------- INVENTARIO ----------
let almacenSeleccionado = null;
document.getElementById('filtroInventarioAdmin').addEventListener('input', renderInventario);
// Copia del almacén MAYOREO traída directo del servidor, por si la cuenta (ej. la vendedora)
// no lo tiene en su lista ALMACENES. Así almacenMayoreo() nunca queda vacío cuando el almacén existe.
let __almMayCache=null;

// Pantalla completa VERDE con palomita que aparece y se quita sola.
// Se usa para confirmar visualmente que el día se guardó.
// Pantalla que BLOQUEA la app mientras la venta se está subiendo, para que el trabajador NO
// cierre la app a mitad de la subida (que era cuando se perdían los datos). Muestra un spinner
// y una barra de progreso animada ("la varita"), y un aviso bien claro de NO cerrar. Además, se
// activa una advertencia del navegador si intenta salir mientras sube.
let subiendoVentaActiva = false;

// ---------- AUTOCOMPLETE PRODUCTO ----------
const movAcInput = document.getElementById('movProductoTexto');
const movAcHidden = document.getElementById('movProducto');
const movAcList = document.getElementById('movProductoList');
let movAcHoverIndex = -1;
let movAcMatches = [];
let inventarioMov = {}; // {producto_id: {almacen_id: cantidad}} — para mostrar el stock del almacén elegido

movAcInput.addEventListener('input', ()=>{
  movAcHidden.value = '';
  const q = movAcInput.value.trim().toLowerCase();
  if(!q){ movAcList.style.display='none'; movAcMatches=[]; return; }
  movAcMatches = PRODUCTOS.filter(p=>coincideNombre(p.nombre, q)).slice(0,30);
  movAcHoverIndex = -1;
  if(movAcMatches.length===0){ movAcList.style.display='none'; return; }
  movAcList.innerHTML = movAcMatches.map((p,i)=>{
    const sel = document.getElementById('movOrigen');
    const aid = sel && sel.value ? Number(sel.value) : null; // el almacén con el que se está trabajando
    let stockTxt = '';
    if(aid!=null){
      const hay = (inventarioMov[p.id] && inventarioMov[p.id][aid]!=null) ? inventarioMov[p.id][aid] : 0;
      stockTxt = ` <span style="color:${Number(hay)>0?'var(--green)':'var(--muted)'};font-size:12px">· hay ${num(hay)}</span>`;
    }
    return `<div data-i="${i}">${p.nombre}${stockTxt}</div>`;
  }).join('');
  movAcList.style.display='block';
});

movAcList.addEventListener('mousedown', (e)=>{
  const div = e.target.closest('div[data-i]');
  if(!div) return;
  const p = movAcMatches[Number(div.dataset.i)];
  seleccionarProductoAC(p);
});

movAcInput.addEventListener('keydown', (e)=>{
  if(movAcList.style.display==='none') return;
  const items = movAcList.querySelectorAll('div');
  if(e.key==='ArrowDown'){ e.preventDefault(); movAcHoverIndex = Math.min(movAcHoverIndex+1, items.length-1); }
  else if(e.key==='ArrowUp'){ e.preventDefault(); movAcHoverIndex = Math.max(movAcHoverIndex-1, 0); }
  else if(e.key==='Enter'){ e.preventDefault(); if(movAcHoverIndex>=0) seleccionarProductoAC(movAcMatches[movAcHoverIndex]); return; }
  else return;
  items.forEach((it,i)=>it.classList.toggle('hover', i===movAcHoverIndex));
});

document.addEventListener('click', (e)=>{
  if(!e.target.closest('.autocomplete')) movAcList.style.display='none';
});
// Si se cambia el almacén (o el tipo), refrescamos el buscador para que la cantidad sea la correcta.
['movOrigen','movTipo'].forEach(id=>{
  const el = document.getElementById(id);
  if(el) el.addEventListener('change', ()=>{ if(movAcInput && movAcInput.value.trim()) movAcInput.dispatchEvent(new Event('input')); });
});

// ---------- AUTOCOMPLETE producto para préstamos de artículo (Deudas) ----------
const deudaAcInput = document.getElementById('deudaProductoTexto');
const deudaAcHidden = document.getElementById('deudaProducto');
const deudaAcList = document.getElementById('deudaProductoList');
let deudaAcHoverIndex = -1;
let deudaAcMatches = [];

deudaAcInput.addEventListener('input', ()=>{
  deudaAcHidden.value = '';
  const q = deudaAcInput.value.trim().toLowerCase();
  if(!q){ deudaAcList.style.display='none'; deudaAcMatches=[]; return; }
  deudaAcMatches = PRODUCTOS.filter(p=>coincideNombre(p.nombre, q)).slice(0,30);
  deudaAcHoverIndex = -1;
  if(deudaAcMatches.length===0){ deudaAcList.style.display='none'; return; }
  deudaAcList.innerHTML = deudaAcMatches.map((p,i)=>`<div data-i="${i}">${p.nombre}</div>`).join('');
  deudaAcList.style.display='block';
});

deudaAcList.addEventListener('mousedown', (e)=>{
  const div = e.target.closest('div[data-i]');
  if(!div) return;
  const p = deudaAcMatches[Number(div.dataset.i)];
  if(!p) return;
  deudaAcInput.value = p.nombre; deudaAcHidden.value = p.id; deudaAcList.style.display='none';
});

deudaAcInput.addEventListener('keydown', (e)=>{
  if(deudaAcList.style.display==='none') return;
  const items = deudaAcList.querySelectorAll('div');
  if(e.key==='ArrowDown'){ e.preventDefault(); deudaAcHoverIndex = Math.min(deudaAcHoverIndex+1, items.length-1); }
  else if(e.key==='ArrowUp'){ e.preventDefault(); deudaAcHoverIndex = Math.max(deudaAcHoverIndex-1, 0); }
  else if(e.key==='Enter'){
    e.preventDefault();
    if(deudaAcHoverIndex>=0){
      const p = deudaAcMatches[deudaAcHoverIndex];
      deudaAcInput.value = p.nombre; deudaAcHidden.value = p.id; deudaAcList.style.display='none';
    }
    return;
  }
  else return;
  items.forEach((it,i)=>it.classList.toggle('hover', i===deudaAcHoverIndex));
});

document.addEventListener('click', (e)=>{
  if(!e.target.closest('.autocomplete')) deudaAcList.style.display='none';
});
['movTipo','movOrigen','movDestino'].forEach(id=>{
  const el=document.getElementById(id);
  if(el) el.addEventListener('change', ()=>{ lsSet('mov_sel_'+id.replace('mov','').toLowerCase(), el.value); });
});

// ---------- REGISTRAR MOVIMIENTO ----------
let listaMovimientos = [];

const ETIQUETA_TIPO_MOV = {ingreso:'Ingreso', extraccion:'Extracción', traslado:'Traslado'};

// Inserta el movimiento. Si la base todavía no tiene la columna 'clave_local', reintenta
// SIN esa columna — así el movimiento igual queda registrado y NO se dispara un reintento
// que volvería a sumar la cantidad al inventario.
// Columnas que la base puede no tener todavía. Se quitan DE UNA EN UNA, no todas de golpe.
const COLS_OPCIONALES_MOV = ['cant_antes_destino','cant_despues_destino','clave_local','venta_dia_id','cant_antes','cant_despues'];
let __avisoColsMov = false;

let confirmandoMovimientos = false;

// ---------- HISTORIAL ----------
// NADA se borra: en la base están TODOS los movimientos desde el primer día. Aquí se cargan
// por tandas para que la pestaña abra rápido, y con "Ver más antiguos" se va trayendo el resto.
const HISTORIAL_POR_TANDA = 150;
let HISTORIAL_MOVS = [];      // todo lo cargado hasta ahora (se acumula)
let historialHayMas = true;   // ¿queda historial más viejo por traer?
let historialCargando = false;

// Carga el CSV editado y muestra en una tabla TODO lo que va a cambiar (cantidad, costo, precio:
// antes → después) ANTES de aplicar. Nada se toca hasta que el dueño confirme.
let cambiosPendientesImport = null;
document.getElementById('filtroProductosAdmin').addEventListener('input', renderAdmin);

// ============================================================
// DINERO / CAJA
// ============================================================
let CAJA_MOVS = [];
let ADMINISTRADORES_CACHE = [];

// El dinero también se guarda completo: aquí se trae por tandas y con "Ver más antiguos"
// se va cargando todo lo anterior.
const CAJA_POR_TANDA = 200;
let cajaHayMas = true;
let cajaCargando = false;

let TOTALES_CAJA = null;

let mostrarTodasCaja = false;

let sincronizandoAdmin = false;

// ---------- DEUDAS ----------


// ============================================================
// DEUDAS (dinero o préstamo de artículos)
// ============================================================
let DEUDAS_CACHE = [];
let mostrarTodasDeudas = false;
document.getElementById('deudaTipo').addEventListener('change', actualizarCampoMetodoPrestamo);

// Días de venta que el dueño decidió NO incluir en el cálculo de la comisión del admin.
// Se guardan solo mientras dura la consulta (se limpian al cambiar de fecha).
let diasExcluidosComision = new Set();
let fechaComisionActual = '';

// COMISIONES FALTANTES: detecta ventas cerradas (con ganancia) que quedaron SIN su comisión de
// vendedor, y permite generarla. Útil cuando una venta se subió pero, por un corte al finalizar
// o un costo mal puesto, no se creó el pago del trabajador.
// ══════════════════════════════════════════════════════════════════════════════
//  CONCILIACIÓN DE CAJA: vendido vs entrado a caja, día por día y puesto por puesto.
//  La diferencia normal es lo que el trabajador se cobró de comisión (la app le deja
//  entregar la venta MENOS su cobro). Lo que NO cuadra con eso es lo que hay que mirar.
// ══════════════════════════════════════════════════════════════════════════════
// Arregla una fila de la conciliación: registra en caja el dinero que falta de ese día
// y ese puesto, con el concepto y la clave correctos para que la fila quede en verde.
let __concFilas = [];

// Explica, línea por línea, de dónde sale el hueco de un día: qué se vendió, qué entró a
// caja, qué se cobró dentro de esa venta y qué queda sin explicar. Es la respuesta a
// "¿a qué se debe esa diferencia?" sin tener que ir a mirar la base a mano.
let __concCandidatas = [];
let __concCaja = [];


// ============================================================
// MÓDULO DE VENTAS (rol vendedor)
// ============================================================
let puestoActual = null; // {id, nombre} -- el almacén del vendedor que inició sesión
let esVendedorComodin = false;
let carrito = []; // {producto_id, nombre, cantidad, precio_venta, costo}
let ventaActualInicio = 0; // índice en `carrito` donde empieza la venta del cliente actual (lo ya cobrado a clientes anteriores hoy queda antes de este índice)
let ventaDiaAbiertaId = null;
let modoLocal = false; // true = el día actual no está vinculado a la base de datos todavía (estamos sin internet)
let diaRecienFinalizado = false;
window.addEventListener('online', ()=>{ actualizarConexionUI(); sincronizarPendientes(); actualizarConexionAdminUI(); sincronizarPendientesAdmin(); sincronizarRecepciones(); reintentarComisiones(); reintentarCobros(); reintentarCaja(); subirVentasMayoreo(); subirMovsMayoreo(); });
window.addEventListener('offline', actualizarConexionUI);

// ===== MAYOREO en la cuenta del vendedor (Tamy): vender + ver reservas =====
let __tvCarrito=[]; let __tvReservaEnVenta=null;
// Stock FRESCO del almacén MAYOREO. La vista de la vendedora (Tamy) NO carga el
// almacén MAYOREO en INVENTARIO, así que aquí lo pedimos directo a Supabase.
// Mapa { producto_id: cantidad }. Si está null aún no se cargó.
let __tvStockMayoreo=null;
let __tvReservas={};

// ---------- AUTOCOMPLETE PRODUCTO ----------
const acInput = document.getElementById('ventaProductoTexto');
const acHidden = document.getElementById('ventaProductoId');
const acList = document.getElementById('ventaProductoList');
let acMatches = []; let acHoverIndex=-1;

acInput.addEventListener('input', ()=>{
  acHidden.value='';
  const q = acInput.value.trim().toLowerCase();
  if(!q){ acList.style.display='none'; acMatches=[]; return; }

  // SOLO se muestran los productos que EXISTEN en el almacén de este puesto. Así el vendedor
  // no puede elegir por error un producto de nombre parecido que en realidad no tiene.
  const stockDe = (id)=>{
    const fila = (ultimoInventarioData||[]).find(i=>i.producto_id===id);
    return fila ? Number(fila.cantidad) : 0;
  };
  const coinciden = PRODUCTOS.filter(p=>coincideNombre(p.nombre, q));
  acMatches = coinciden.filter(p=>stockDe(p.id) > 0).slice(0,30);
  acHoverIndex=-1;

  if(acMatches.length===0){
    // Si el nombre sí existe en el negocio pero no hay en este puesto, se avisa —
    // es más útil que no mostrar nada (el vendedor sabe que debe pedirlo).
    const sinExistencia = coinciden.slice(0,6);
    if(sinExistencia.length > 0){
      acList.innerHTML = `<div style="color:var(--muted); font-size:12px; padding:10px; cursor:default">`
        + `No tienes existencia de: ${sinExistencia.map(p=>p.nombre).join(', ')}`
        + (coinciden.length > 6 ? ` y ${coinciden.length-6} más` : '')
        + `<br>Pídelo al almacén desde la pestaña Pedidos.</div>`;
      acList.style.display='block';
    } else {
      acList.style.display='none';
    }
    return;
  }

  acList.innerHTML = acMatches.map((p,i)=>{
    const hay = stockDe(p.id);
    return `<div data-i="${i}">${p.nombre} <span style="color:var(--muted);font-size:12px">($${num(p.precio_venta)})</span>`
      + ` <span style="color:var(--green);font-size:12px">· tienes ${num(hay)}</span></div>`;
  }).join('');
  acList.style.display='block';
});
acList.addEventListener('mousedown', e=>{
  const div = e.target.closest('div[data-i]'); if(!div) return;
  seleccionarProductoVenta(acMatches[Number(div.dataset.i)]);
});
acInput.addEventListener('keydown', e=>{
  if(acList.style.display==='none' || acMatches.length===0) return;
  const items = acList.querySelectorAll('div[data-i]');
  if(e.key==='ArrowDown'){ e.preventDefault(); acHoverIndex=Math.min(acHoverIndex+1, items.length-1); }
  else if(e.key==='ArrowUp'){ e.preventDefault(); acHoverIndex=Math.max(acHoverIndex-1,0); }
  else if(e.key==='Enter'){ e.preventDefault(); if(acHoverIndex>=0) seleccionarProductoVenta(acMatches[acHoverIndex]); return; }
  else return;
  items.forEach((it,i)=>it.classList.toggle('hover', i===acHoverIndex));
});
document.addEventListener('click', e=>{ if(!e.target.closest('.autocomplete')) acList.style.display='none'; });
document.getElementById('finEfectivo').addEventListener('input', e=>{ e.target.dataset.tocado='1'; });

// ---------- MI INVENTARIO (solo lectura) ----------
let ultimoInventarioData = [];
document.getElementById('filtroMiInventario').addEventListener('input', renderMiInventario);

// ---------- AUTOCOMPLETE PARA PEDIDOS ----------
const pedAcInput = document.getElementById('pedidoProductoTexto');
const pedAcHidden = document.getElementById('pedidoProductoId');
const pedAcList = document.getElementById('pedidoProductoList');
let pedAcMatches = []; let pedAcHover = -1;

pedAcInput.addEventListener('input', ()=>{
  pedAcHidden.value='';
  const q = pedAcInput.value.trim().toLowerCase();
  if(!q){ pedAcList.style.display='none'; pedAcMatches=[]; return; }
  pedAcMatches = PRODUCTOS.filter(p=>coincideNombre(p.nombre, q)).slice(0,30);
  pedAcHover=-1;
  if(pedAcMatches.length===0){ pedAcList.style.display='none'; return; }
  pedAcList.innerHTML = pedAcMatches.map((p,i)=>`<div data-i="${i}">${p.nombre}</div>`).join('');
  pedAcList.style.display='block';
});
pedAcList.addEventListener('mousedown', e=>{
  const div = e.target.closest('div[data-i]'); if(!div) return;
  const p = pedAcMatches[Number(div.dataset.i)];
  pedAcInput.value=p.nombre; pedAcHidden.value=p.id; pedAcList.style.display='none';
});
document.addEventListener('click', e=>{ if(!e.target.closest('#pedidoProductoTexto') && !e.target.closest('#pedidoProductoList')) pedAcList.style.display='none'; });

// ---------- COBRAR (el cobro se agrega como una línea más en "Venta de hoy", en negativo) ----------
let cobrosEnCarrito = [];

// ---------- FINALIZAR DÍA ----------
let finalizandoDia = false;

// ============================================================
// MOTOR DE SINCRONIZACIÓN (corre solo cuando hay internet)
// ============================================================
let sincronizando = false;

// ── MOTOR SEGURO PARA VACIAR COLAS ──────────────────────────────────────────
// Dos peligros que esto evita (los dos probados):
//  1) Que la misma cola se vacíe DOS VECES A LA VEZ (el intervalo de 30s y el
//     evento "volvió el internet" pueden caer juntos). Las dos pasadas leían la
//     misma lista y metían el mismo dinero dos veces. → Candado por cola.
//  2) Que se pierda algo que entró a la cola MIENTRAS se estaba vaciando (se
//     cierra un día justo en ese momento). Antes se sobrescribía la lista
//     entera. → Ahora se vuelve a leer al final y solo se sacan los que de
//     verdad se lograron, por su número propio.
const __colasOcupadas = {};

setInterval(sincronizarPendientes, 30000);
setInterval(reintentarComisiones, 30000);
setInterval(reintentarCobros, 30000);
setInterval(reintentarCaja, 30000);
reintentarCaja();
reintentarCobros();
reintentarComisiones();
setInterval(subirVentasMayoreo, 30000);
subirVentasMayoreo();
setInterval(subirMovsMayoreo, 30000);
subirMovsMayoreo();
setInterval(sincronizarPendientesAdmin, 30000);

// ── CUÁNTO HAY SIN SUBIR (a la vista de todos, siempre arriba) ──────────────
// Antes el numerito solo contaba una parte de lo pendiente (y distinto según el rol). Ahora
// cuenta TODO lo que está guardado en el teléfono esperando señal, y se puede tocar para subirlo.
const COLAS_PENDIENTES = ['vt_pending_days','vt_pending_pedidos','vt_pending_devoluciones','adm_pending_ops',
  'caja_fallidas','cobros_fallidos','com_fallidas','recep_pending','may_movs_pendientes','may_ventas_pendientes'];
let __subiendoAhora = false;
setInterval(pintarPillPendientes, 3000);
window.addEventListener('online', pintarPillPendientes);
window.addEventListener('offline', pintarPillPendientes);


// ============================================================
// AUTENTICACIÓN UNIFICADA (vendedor / administrador / dueño)
// ============================================================
// ============================================================
// INSTALAR LA APP (botón en la pantalla de login)
// Solo aparece si el teléfono puede instalarla de verdad. Si ya está instalada,
// o si el navegador no lo soporta, el botón no se muestra. No afecta nada más.
// ============================================================
let promptInstalacion = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();              // evitamos el aviso automático del navegador
  promptInstalacion = e;           // lo guardamos para usarlo con nuestro botón
  const zona = document.getElementById('zonaInstalar');
  if(zona && !appYaInstalada()) zona.style.display = 'block';
});

window.addEventListener('appinstalled', () => {
  promptInstalacion = null;
  const zona = document.getElementById('zonaInstalar');
  if(zona) zona.style.display = 'none';
});
document.getElementById('loginPassword').addEventListener('keydown', e=>{ if(e.key==='Enter') intentarLogin(); });

// ---- MAYOREO (mini-app) ----
let __mayCarrito = [];
let __reservaEnVenta = null;

// ----- FOTOS DE MAYOREO -----
const MAY_BUCKET = 'fotos-mayoreo';

// 👥 CLIENTES: compras + cumplimiento de reservas
let __clientesMay=[];

// 📣 AVISAR NOVEDADES a los clientes que dejaron su WhatsApp al reservar.
const LINK_TIENDA_AVISO = 'https://catalogo-er.github.io/MAYOREO/';
let __avisarNumeros=[];
let __reservasMay={};
// Cuelgues y promesas rechazadas que no atrapó ningún try/catch:
window.addEventListener('error', function(e){ try{ registrarError('cuelgue', (e&&e.message)||'error', (e&&e.filename)?(e.filename+':'+e.lineno):''); }catch(_){} });
window.addEventListener('unhandledrejection', function(e){ try{ const r=e&&e.reason; registrarError('promesa', (r&&r.message)||String(r||'rechazo'), (r&&r.stack)||''); }catch(_){} });
window.addEventListener('online', function(){ flushErrores(); });
// Captura automática de los avisos ROJOS (la mayoría de fallos usan alert("No se pudo…")):
(function(){
  if(window.__alertHook) return; window.__alertHook=true;
  const _alert = window.alert ? window.alert.bind(window) : function(){};
  const rxErr = /(no se pudo|no se completó|no se complet|se revirti|no se guard|no subi|servidor no aplic|necesitas internet|no se puede|falta (crear|el|la)|no aplicó el cambio)/i;
  window.alert = function(m){ try{ if(m && rxErr.test(String(m))) registrarError('aviso', String(m)); }catch(_){} return _alert(m); };
})();

// Calcula la sugerencia inteligente y la muestra editable, con casillas para aprobar por producto.
let __repoFilas = {};

// Transfiere (traslado bodega→puesto) SOLO las filas marcadas, con la cantidad que quedó en el input.
// Vuelve a leer el stock real de bodega justo antes de mover, para no dejar negativos.
let __repoTransfiriendo = false;

// ══════════════════════════════════════════════════════════════════
// 📥 RECEPCIÓN DEL PUESTO
// El vendedor va anotando lo que le llevan al puesto (producto + cantidad). Se guarda en la tabla
// `recepciones` (offline: se encola y se sube al volver el internet). El dueño lo compara, por
// puesto y día, con lo que el sistema le ENVIÓ (movimientos de ingreso/traslado con destino ese
// puesto). Función de comparación PURA (conciliarRecepcion) para poder probarla.
// ══════════════════════════════════════════════════════════════════

// ---------- Autocomplete del buscador de recepción (vendedor) ----------
const recepAcInput = document.getElementById('recepProductoTexto');
const recepAcHidden = document.getElementById('recepProductoId');
const recepAcList = document.getElementById('recepProductoList');
let recepAcMatches = [];
if(recepAcInput){
  recepAcInput.addEventListener('input', ()=>{
    recepAcHidden.value='';
    const q = recepAcInput.value.trim().toLowerCase();
    if(!q){ recepAcList.style.display='none'; recepAcMatches=[]; return; }
    recepAcMatches = PRODUCTOS.filter(p=>coincideNombre(p.nombre, q)).slice(0,30);
    if(recepAcMatches.length===0){ recepAcList.style.display='none'; return; }
    recepAcList.innerHTML = recepAcMatches.map((p,i)=>`<div data-i="${i}">${p.nombre}</div>`).join('');
    recepAcList.style.display='block';
  });
  recepAcList.addEventListener('mousedown', e=>{
    const div = e.target.closest('div[data-i]'); if(!div) return;
    const p = recepAcMatches[Number(div.dataset.i)];
    recepAcInput.value=p.nombre; recepAcHidden.value=p.id; recepAcList.style.display='none';
  });
  document.addEventListener('click', e=>{ if(!e.target.closest('#recepProductoTexto') && !e.target.closest('#recepProductoList')) recepAcList.style.display='none'; });
}

// Guarda lo mostrado en la conciliación para poder limpiar de golpe.
let __conciliacionData = [];
let __apSugerencias=[];

// ── PESTAÑAS DEL MENÚ QUE EL DUEÑO DECIDE ESCONDER ──────────────────────────
// La lista se guarda en la base (tabla "ajustes"), así que lo que el dueño esconde
// se esconde en TODOS los teléfonos. Si esa tabla todavía no existe, se guarda solo
// en este teléfono y la pantalla lo avisa claramente.
let PESTANAS_OCULTAS = [];
let AJUSTES_COMPARTIDOS = false;   // ¿se pudieron leer de la base?

const PESTANAS_DEL_MENU = [
  {grupo:'Gestión', tabs:[
    {k:'hoy',           n:'📅 Resumen del día'},
    {k:'inventario',    n:'📦 Inventario'},     {k:'movimientos',  n:'🔁 Movimientos'},
    {k:'reposicion',    n:'🚚 Reposición'},     {k:'recepcion',    n:'📥 Recepción vs envío'},
    {k:'compras',       n:'🛒 Compras'},        {k:'pedidos',      n:'📝 Pedidos'},
    {k:'ventasvendedor',n:'🧾 Ventas por vendedor'}, {k:'articulo', n:'🔎 Buscar artículo'},
    {k:'conciliacion',  n:'⚖️ Conciliación'},   {k:'dinero',       n:'💵 Dinero'},
    {k:'deudas',        n:'🤝 Deudas'},         {k:'comisionadmin',n:'📊 Cobro Admin'},
    {k:'historial',     n:'🕘 Historial'},      {k:'estadisticas', n:'🗂️ Ventas registradas'},
    {k:'analizador',    n:'🎛️ Sala de Control'},{k:'analisisprod', n:'📈 Análisis de productos'},
    {k:'mayoreo',       n:'🏷️ Mayoreo'},        {k:'cobraradmin',  n:'💰 Cobrar'},
    {k:'errores',       n:'🚨 Errores'}
  ]},
  {grupo:'Vendedor', tabs:[
    {k:'v:vender',      n:'🛒 Vender'},         {k:'v:ventadeldia',n:'🧾 Venta del día'},
    {k:'v:inventario',  n:'📦 Mi inventario'},  {k:'v:pedir',      n:'📝 Pedir'},
    {k:'v:recepcion',   n:'📥 Recepción'},      {k:'v:cobrar',     n:'💰 Cobrar'},
    {k:'v:devoluciones',n:'↩️ Devoluciones'},   {k:'v:historial',  n:'🕘 Historial'},
    {k:'v:mayoreo',     n:'🏷️ Mayoreo'}
  ]}
];
// Estas no se pueden esconder: sin ellas no se puede trabajar ni volver atrás.
const PESTANAS_INTOCABLES = new Set(['admin','usuarios','v:vender']);
let STOCK_MINIMOS = normalizarMinimos(lsGet('ajuste_stock_minimos', null));
let __hoyYaAbierto = false;

iniciarApp();
