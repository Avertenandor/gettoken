const CACHE_NAME='gettoken-cache-v1';
const CORE=['./','index.html','css/style.css','js/app.js','js/verifier.js','js/compiler.worker.js','favicons/favicon-192.png','favicons/favicon-512.png','favicons/favicon.svg','offline.html'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE_NAME).then(c=>c.addAll(CORE)));self.skipWaiting();});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE_NAME).map(k=>caches.delete(k)))));self.clients.claim();});
self.addEventListener('fetch',e=>{const req=e.request;if(req.method!=='GET') return; e.respondWith(fetch(req).then(r=>{const copy=r.clone(); caches.open(CACHE_NAME).then(c=>c.put(req,copy)); return r;}).catch(()=>caches.match(req).then(r=>r||caches.match('offline.html'))));});