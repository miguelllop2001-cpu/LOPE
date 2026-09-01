// Service Worker de "Mi Negocio" — guarda la app (HTML/CSS/JS) en el teléfono
// para que abra aunque no haya internet, incluso si la abres por primera vez ese día.
// IMPORTANTE: esto NO reemplaza la sincronización con Supabase (eso ya lo hace app.html
// con su propio sistema de cola). Esto solo permite que la página misma cargue sin red.

const CACHE_NAME = 'mi-negocio-v121';
const ARCHIVOS_DEL_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ARCHIVOS_DEL_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((nombres) =>
      Promise.all(nombres.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();
});

// Estrategia: intenta la red primero (para que siempre tengas la última versión cuando
// hay señal); si falla (sin internet), usa la copia guardada. Las llamadas a Supabase
// (otro dominio) nunca se cachean — la app misma ya maneja eso con su cola de pendientes.
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return; // otras direcciones (CDNs) pasan directo

  // Solo manejamos los ARCHIVOS PROPIOS de la app. Todo lo demás (llamadas de datos a Supabase:
  // /rest, /auth, /storage, /realtime) pasa directo, aunque la app esté alojada en el mismo
  // dominio de Supabase. Así nunca cacheamos datos ni tokens por error.
  const esArchivoApp = /\/(index\.html|app\.html|manifest\.json|icon-192\.png|icon-512\.png|service-worker\.js)$/.test(url.pathname);
  const esNavegacion = event.request.mode === 'navigate';
  if (!esArchivoApp && !esNavegacion) return;

  event.respondWith(
    fetch(event.request)
      .then((respuesta) => {
        const copia = respuesta.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copia));
        return respuesta;
      })
      .catch(() => caches.match(event.request).then((r) => r || caches.match('./index.html')))
  );
});
