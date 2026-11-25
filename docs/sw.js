// 后台线程：发通知、点通知回到对话、离线也能打开；页面不在的时候替他把该说的话送到
const CACHE='cx-v2';
self.addEventListener('install',()=>self.skipWaiting());
// 换缓存的名字时把旧的整个清掉（旧的里面攒了很多带时间戳的重复页面）
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
// 页面本身不管网址后面带什么（?v=、?t=），都算同一份，只留最新的一份
const keyOf=r=>{const u=new URL(r.url);return r.mode==='navigate'||/\/(index\.html)?$/.test(u.pathname)?u.origin+u.pathname.replace(/index\.html$/,''):r.url;};
self.addEventListener('fetch',e=>{
  const r=e.request;
  if(r.method!=='GET'||new URL(r.url).origin!==location.origin)return;
  const k=keyOf(r);
  e.respondWith(fetch(r).then(res=>{if(res.ok){const c=res.clone();caches.open(CACHE).then(x=>x.put(k,c));}return res;}).catch(()=>caches.match(k).then(m=>m||caches.match(new URL('./',location.href).href))));
});
self.addEventListener('notificationclick',e=>{
  e.notification.close();
  const pid=e.notification.data&&e.notification.data.pid;
  e.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(cs=>{
    if(cs.length){cs[0].postMessage({type:'open',pid});return cs[0].focus();}
    return self.clients.openWindow('./#/c/'+(pid||''));
  }));
});

// 后台线程不碰你的数据：它只负责叫醒还开着的页面，让页面自己把该到的话补上。
// （他离开期间该说的话，由云端推送按时送到；回到小鹿时页面会把同样的几句补进聊天里）
async function background(){
  const cs=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  cs.forEach(c=>c.postMessage({type:'tick'}));
}
self.addEventListener('periodicsync',e=>{if(e.tag==='cx-tick')e.waitUntil(background());});
// 推送：带内容的直接弹出来；不带内容的当作「叫醒」，醒来自己看看有没有该送的话
self.addEventListener('push',e=>{
  let d=null;try{d=e.data&&e.data.json();}catch(_){d=null;}
  // 图标上的数字跟着这一条走
  try{if(d&&typeof d.badge==='number'&&self.navigator&&self.navigator.setAppBadge)self.navigator.setAppBadge(d.badge).catch(()=>{});}catch(_){}
  e.waitUntil(d&&d.title?self.registration.showNotification(d.title,{body:d.body||'',tag:d.tag||'cx-push',icon:'./icon-192.png',badge:'./icon-192.png',data:{pid:d.pid}}):background());
});
