// Service Worker de "Mi Negocio" — guarda la app (pantalla, estilos y programa) en el teléfono.
//
// CÓMO TRABAJA (desde la v172):
//  · La app abre AL MOMENTO desde lo guardado en el teléfono, sin esperar a la red. Antes
//    esperaba a internet cada vez que se abría, y con mala señal eso eran segundos muertos.
//  · Cuando subes una versión nueva, este archivo cambia (el número de abajo). El navegador
//    lo nota solo, descarga TODA la versión nueva por detrás y, cuando la tiene completa,
//    la app muestra un aviso arriba para actualizar con un toque. Nunca se mezclan archivos
//    de dos versiones.
//  · Desde la v174 las dos librerías (Supabase y PapaParse) van DENTRO de la app: al abrir ya
//    no se le pide NADA a ningún servidor de fuera.
//  · Las llamadas de datos a Supabase NUNCA se guardan: de eso se encarga la app con su cola.

const VERSION = '179';
const CACHE_NAME = 'mi-negocio-v218';
const OBLIGATORIOS = [
  './index.html',
  './app.css?v=179',
  './lib-supabase.js?v=179',
  './lib-papaparse.js?v=179',
  './app1-base.js?v=179',
  './app2-gestion.js?v=179',
  './app3-deudas.js?v=179',
  './app4-vendedor.js?v=179',
  './app5-subida.js?v=179',
  './app6-mayoreo.js?v=179',
  './app7-control.js?v=179',
  './app8-arranque.js?v=179',
  './manifest.json'
];
const OPCIONALES = ['./app.html', './icon-192.png', './icon-512.png'];
const ES_ARCHIVO_APP = /\/(index\.html|app\.html|app\.css|app\d-[a-z]+\.js|lib-[a-z]+\.js|manifest\.json|icon-192\.png|icon-512\.png)$/;

// Pide algo a la red, pero sin quedarse esperando para siempre: si en "ms" no llegó, se corta.
// (Sin esto, una petición colgada dejaba la app parada en la pantalla del logo.)
function redConTiempo(req, ms){
  const corte = new AbortController();
  const reloj = setTimeout(() => corte.abort(), ms);
  return fetch(req, {signal: corte.signal}).finally(() => clearTimeout(reloj));
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // Todo o nada: si falta un solo archivo obligatorio, esta versión NO se instala y la app
    // sigue trabajando con la anterior completa. Se vuelve a intentar la próxima vez.
    await cache.addAll(OBLIGATORIOS.map((u) => new Request(u, {cache:'reload'})));
    await Promise.all(OPCIONALES.map((u) => cache.add(new Request(u, {cache:'reload'})).catch(() => {})));
  })());
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const nombres = await caches.keys();
    await Promise.all(nombres.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

// La app pregunta qué versión tiene guardada el teléfono (para saber si debe avisar).
self.addEventListener('message', (event) => {
  if(event.data && event.data.tipo === 'dime-version' && event.source){
    event.source.postMessage({tipo:'version', version: VERSION});
  }
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if(req.method !== 'GET') return;
  const url = new URL(req.url);

  if(url.origin !== self.location.origin) return;       // todo lo demás de fuera pasa directo

  // Solo los ARCHIVOS PROPIOS de la app. Las llamadas de datos (/rest, /auth, /storage...)
  // pasan directo aunque la app esté alojada en el mismo dominio de Supabase.
  const esNavegacion = req.mode === 'navigate';
  if(!ES_ARCHIVO_APP.test(url.pathname) && !esNavegacion) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    let guardada = await cache.match(req);
    if(!guardada && esNavegacion){
      guardada = await cache.match(req, {ignoreSearch:true})
              || (/\/app\.html$/.test(url.pathname) ? null : await cache.match('./index.html'));
    }
    if(guardada) return guardada;                       // ← lo normal: sale al momento
    try{
      const r = await redConTiempo(req, 12000);
      if(r && r.ok) cache.put(req, r.clone());
      return r;
    }catch(e){
      const plan = await cache.match(req, {ignoreSearch:true}) || (esNavegacion ? await cache.match('./index.html') : null);
      if(plan) return plan;
      throw e;
    }
  })());
});
