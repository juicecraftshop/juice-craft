// Only immutable, public build assets are cached. Auth, API and HTML stay online.
const CACHE='juicecraft-assets-v1';
const root=new URL('./',self.location.href);
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url);
 if(request.method!=='GET'||url.origin!==root.origin||!url.pathname.startsWith(root.pathname+'assets/')||!/-[\w-]+\.(js|css|woff2?|ttf)$/.test(url.pathname))return;
 event.respondWith((async()=>{
  let cache;try{cache=await caches.open(CACHE);const hit=await cache.match(request);if(hit)return hit}catch{}
  const response=await fetch(request);
  if(cache&&response.ok&&response.type==='basic'){
   const copy=response.clone();event.waitUntil((async()=>{try{await cache.put(request,copy);const keys=await cache.keys();for(const old of keys.slice(0,Math.max(0,keys.length-60)))await cache.delete(old)}catch{}})());
  }
  return response;
 })());
});
