// 后台线程：发通知、点通知回到对话、离线也能打开；页面不在的时候替他把该说的话送到
const CACHE='cx-v1';
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
self.addEventListener('fetch',e=>{
  const r=e.request;
  if(r.method!=='GET'||new URL(r.url).origin!==location.origin)return;
  e.respondWith(fetch(r).then(res=>{if(res.ok){const c=res.clone();caches.open(CACHE).then(x=>x.put(r,c));}return res;}).catch(()=>caches.match(r).then(m=>m||caches.match('./index.html'))));
});
self.addEventListener('notificationclick',e=>{
  e.notification.close();
  const pid=e.notification.data&&e.notification.data.pid;
  e.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(cs=>{
    if(cs.length){cs[0].postMessage({type:'open',pid});return cs[0].focus();}
    return self.clients.openWindow('./#/c/'+(pid||''));
  }));
});

const db=()=>new Promise((ok,no)=>{const r=indexedDB.open('cx-site',1);r.onupgradeneeded=()=>r.result.createObjectStore('kv');r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error);});
const get=(d,k)=>new Promise(ok=>{const q=d.transaction('kv').objectStore('kv').get(k);q.onsuccess=()=>ok(q.result);q.onerror=()=>ok(undefined);});
const put=(d,k,v)=>new Promise(ok=>{const q=d.transaction('kv','readwrite').objectStore('kv').put(v,k);q.onsuccess=()=>ok();q.onerror=()=>ok();});
const WIN={all:[0,24],morning:[5,11],noon:[11,14],evening:[18,23],night:[23,5]};
const inWin=(w,t)=>{const [a,b]=WIN[w]||WIN.all;const h=new Date(t).getHours();return a<b?h>=a&&h<b:h>=a||h<b;};
const rand=(a,b)=>a+Math.random()*Math.max(0,b-a);
const asleep=(p,t)=>{const h=new Date(t).getHours();return p.quietFrom===p.quietTo?false:p.quietFrom<p.quietTo?h>=p.quietFrom&&h<p.quietTo:h>=p.quietFrom||h<p.quietTo;};
function nextTime(p,from){let t=from+rand(p.proMin,Math.max(p.proMin,p.proMax))*60000;for(let k=0;k<30&&asleep(p,t);k++){const d=new Date(t);d.setMinutes(0,0,0);d.setHours(d.getHours()+1);t=d.getTime()+rand(2,40)*60000;}return t;}
function draw(st,p,t){
  const all=st.decks.filter(d=>p.decks.includes(d.id)&&(d.use==='both'||d.use==='pro')&&inWin(d.when,t)).flatMap(d=>d.cards.filter(c=>!c.off).map(c=>({id:d.id+'/'+c.id,t:c.t})));
  if(!all.length)return null;
  const n=p.join?1+Math.floor(Math.random()*Math.max(1,p.joinMax)):1,cs=[];
  for(let i=0;i<Math.min(n,all.length);i++)cs.push(all[Math.floor(Math.random()*all.length)]);
  const glue=['，',' ','…'];
  return {text:cs.map(c=>c.t).reduce((a,b)=>a+glue[Math.floor(Math.random()*glue.length)]+b),src:cs.map(c=>c.id).join(',')};
}
// 页面还开着就让页面自己来；页面不在了，这里直接替他把话写进记录并弹通知
async function background(){
  const cs=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  if(cs.some(c=>c.visibilityState==='visible')){cs.forEach(c=>c.postMessage({type:'tick'}));return;}
  const d=await db(),st=await get(d,'state');
  if(!st||!Array.isArray(st.personas))return;
  const now=Date.now();let changed=false;
  for(const p of st.personas){
    if(!p.pro||!p.nextAt||now<p.nextAt||p.replyAt)continue;
    const list=(await get(d,'m:'+p.id))||[];
    let at=p.nextAt,n=0;
    while(at<=now&&n<3){
      const got=draw(st,p,at);
      if(got){
        list.push({id:now.toString(36)+Math.random().toString(36).slice(2,7),pid:p.id,from:'ta',kind:'text',text:got.text,at:Math.max(Math.min(at,now),(list.length?list[list.length-1].at:0)+1),src:got.src});
        if(st.prefs&&st.prefs.notify)await self.registration.showNotification(p.name,{body:got.text,tag:'cx-'+p.id,icon:'./icon-192.png',badge:'./icon-192.png',data:{pid:p.id},renotify:true});
      }
      n++;at=nextTime(p,at);
    }
    if(at<=now)at=nextTime(p,now);
    p.nextAt=at;await put(d,'m:'+p.id,list);changed=true;
  }
  if(changed){await put(d,'state',st);cs.forEach(c=>c.postMessage({type:'changed'}));}
}
self.addEventListener('periodicsync',e=>{if(e.tag==='cx-tick')e.waitUntil(background());});
// 推送：带内容的直接弹出来；不带内容的当作「叫醒」，醒来自己看看有没有该送的话
self.addEventListener('push',e=>{
  let d=null;try{d=e.data&&e.data.json();}catch(_){d=null;}
  // 图标上的数字跟着这一条走
  try{if(d&&typeof d.badge==='number'&&self.navigator&&self.navigator.setAppBadge)self.navigator.setAppBadge(d.badge).catch(()=>{});}catch(_){}
  e.waitUntil(d&&d.title?self.registration.showNotification(d.title,{body:d.body||'',tag:d.tag||'cx-push',icon:'./icon-192.png',badge:'./icon-192.png',data:{pid:d.pid}}):background());
});
