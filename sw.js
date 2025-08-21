const VERSION='v2';
const CACHE_STATIC='static-'+VERSION;
const CORE=['./','index.html','css/style.css','js/app.js','js/verifier.js','js/compiler.worker.js','js/utils.js','offline.html'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE_STATIC).then(c=>c.addAll(CORE)));self.skipWaiting();});
self.addEventListener('activate',e=>{e.waitUntil((async()=>{ const keys=await caches.keys(); await Promise.all(keys.filter(k=>k!==CACHE_STATIC).map(k=>caches.delete(k))); await self.clients.claim(); })());});
async function staleWhileRevalidate(event){
	const cache = await caches.open(CACHE_STATIC);
	const cached = await cache.match(event.request);
	const fetchPromise = fetch(event.request).then(r=>{ cache.put(event.request, r.clone()); return r; }).catch(()=>cached||caches.match('offline.html'));
	return cached || fetchPromise;
}
self.addEventListener('fetch',e=>{
	const req=e.request;
	if(req.method!=='GET') return;
	const url=new URL(req.url);
	if(url.origin===location.origin){
		e.respondWith(staleWhileRevalidate(e));
	} else {
		// сеть для RPC/API
		e.respondWith(fetch(req).catch(()=>new Response('Network error',{status:503})));
	}
});
self.addEventListener('message',e=>{
	if(e.data==='skipWaiting') self.skipWaiting();
});