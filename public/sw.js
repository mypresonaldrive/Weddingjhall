// Gatherhall PWA: push delivery + resilient static caching (hashed assets only).
const STATIC='gh-static-v2';
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil((async()=>{const names=await caches.keys();await Promise.all(names.filter(n=>n!==STATIC).map(n=>caches.delete(n)));await self.clients.claim();})()));
self.addEventListener('push',event=>{
 let d={};try{d=event.data?event.data.json():{};}catch{e=>0}
 const title=d.title||'Gatherhall';
 event.waitUntil(self.registration.showNotification(title,{body:d.body||'',icon:'/favicon.svg',badge:'/favicon.svg',data:{url:d.url||'/'}}));
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();
 const url=(event.notification.data&&event.notification.data.url)||'/';
 event.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(list=>{
  for(const client of list){if(new URL(client.url).origin===location.origin)return client.focus();}
  return clients.openWindow(url);
 }));
});
self.addEventListener('fetch',event=>{
 const u=new URL(event.request.url);
 if(event.request.method!=='GET'||u.origin!==location.origin)return;
 if(u.pathname.startsWith('/api/'))return; // never cache API or auth data
 if(u.pathname.startsWith('/assets/')){ // hashed by build: cache-first, revalidate on miss
  event.respondWith((async()=>{const cache=await caches.open(STATIC);const hit=await cache.match(event.request);if(hit)return hit;const res=await fetch(event.request);if(res.ok)cache.put(event.request,res.clone());return res;})());
 }
});
