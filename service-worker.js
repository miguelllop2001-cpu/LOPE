const CACHE='mi-negocio-v90';
self.addEventListener('install',e=>{self.skipWaiting();e.waitUntil(caches.open(CACHE).then(c=>c.addAll(['./','./index.html','./manifest.json']).catch(()=>{})));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ns=>Promise.all(ns.filter(n=>n!==CACHE).map(n=>caches.delete(n)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',e=>{const r=e.request;if(r.method!=='GET')return;if(r.url.includes('supabase.co'))return;e.respondWith(fetch(r).then(res=>{if(res.ok&&r.url.startsWith(self.location.origin)){const c=res.clone();caches.open(CACHE).then(x=>x.put(r,c));}return res;}).catch(()=>caches.match(r).then(m=>m||caches.match('./index.html'))));});
