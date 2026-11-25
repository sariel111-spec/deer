// 后台保活：让页面在后台尽量活着，他主动找你时能弹出通知。
// 一层一层来，哪层在这台设备上不管用，就靠下一层兜着：
// 1 计时放在 Worker 里（后台标签页的主线程计时会被压得很慢）
// 2 一段听不见的循环音频 + 媒体会话，让系统把页面当成「正在播放」而不去冻结它
// 3 Web Lock，告诉浏览器这页还有事没做完
// 4 Service Worker：发系统通知、点通知回到对话；浏览器肯给的话，定期在后台醒来替他把话送到
// 5 回到页面的那一刻补上离开期间他该说的话（这一层任何设备都有效）
import {S,reload,setPrefs,unread,type Persona} from './db';

let reg:ServiceWorkerRegistration|null=null;
let onTick=()=>{};
let audio:HTMLAudioElement|null=null,locked=false,persisted=false,periodic=false;

function silentWav(){
  const rate=8000,n=rate*2,buf=new ArrayBuffer(44+n),v=new DataView(buf);
  const w=(o:number,s:string)=>{for(let i=0;i<s.length;i++)v.setUint8(o+i,s.charCodeAt(i));};
  w(0,'RIFF');v.setUint32(4,36+n,true);w(8,'WAVEfmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);
  v.setUint32(24,rate,true);v.setUint32(28,rate,true);v.setUint16(32,1,true);v.setUint16(34,8,true);w(36,'data');v.setUint32(40,n,true);
  new Uint8Array(buf,44).fill(128);
  return URL.createObjectURL(new Blob([buf],{type:'audio/wav'}));
}
export async function audioOn(on:boolean){
  setPrefs({audio:on});
  if(!on){audio?.pause();audio=null;try{navigator.mediaSession.playbackState='none';}catch{/* 没有也行 */}return false;}
  if(!audio){
    audio=new Audio(silentWav());audio.loop=true;audio.setAttribute('playsinline','');
    // 被系统停掉就自己接着放
    audio.addEventListener('pause',()=>{if(S().prefs.audio)setTimeout(()=>{void audio?.play().catch(()=>{});},600);});
    try{
      navigator.mediaSession.metadata=new MediaMetadata({title:'在等你的消息',artist:document.title});
      for(const a of ['play','pause','stop'] as const)navigator.mediaSession.setActionHandler(a,()=>{void audio?.play().catch(()=>{});});
    }catch{/* 没有媒体会话也行 */}
  }
  try{await audio.play();try{navigator.mediaSession.playbackState='playing';}catch{/* */}return true;}catch{return false;}
}
export const audioLive=()=>!!audio&&!audio.paused;

export async function start(tick:()=>void){
  onTick=tick;
  try{
    const w=new Worker(URL.createObjectURL(new Blob(['setInterval(()=>postMessage(0),1000)'],{type:'text/javascript'})));
    w.onmessage=()=>onTick();
  }catch{setInterval(()=>onTick(),1000);}
  const wake=()=>{onTick();if(S().prefs.audio&&audio&&audio.paused)void audio.play().catch(()=>{});};
  document.addEventListener('visibilitychange',wake);document.addEventListener('resume',wake);
  addEventListener('pageshow',wake);addEventListener('focus',wake);addEventListener('online',wake);
  // 音频要有一次点按才放得出来：设置里开过的，下次进来第一下点按就接上
  if(S().prefs.audio){const once=()=>{removeEventListener('pointerdown',once);void audioOn(true);};addEventListener('pointerdown',once);}
  try{void navigator.locks?.request('cx-alive',()=>{locked=true;return new Promise(()=>{});});}catch{/* 没有也行 */}
  try{persisted=!!(await navigator.storage?.persisted?.())||!!(await navigator.storage?.persist?.());}catch{/* */}
  if('serviceWorker' in navigator){
    try{
      reg=await navigator.serviceWorker.register('./sw.js');
      navigator.serviceWorker.addEventListener('message',e=>{
        const d=e.data||{};
        if(d.type==='open'&&d.pid)location.hash='#/c/'+d.pid;
        if(d.type==='tick')onTick();
        if(d.type==='changed')void reload();
      });
      const ps=(reg as unknown as {periodicSync?:{register:(t:string,o:{minInterval:number})=>Promise<void>}}).periodicSync;
      if(ps){try{await ps.register('cx-tick',{minInterval:15*60*1000});periodic=true;}catch{/* 浏览器没给 */}}
    }catch{/* 本地预览时没有也行 */}
  }
  badge();
}

export async function askNotify():Promise<boolean>{
  if(!('Notification' in window))return false;
  const ok=(Notification.permission==='granted')||(await Notification.requestPermission())==='granted';
  setPrefs({notify:ok});return ok;
}
export function notify(p:Persona,text:string){
  if(!S().prefs.notify||!('Notification' in window)||Notification.permission!=='granted')return;
  const opt={body:text,tag:'cx-'+p.id,icon:'./icon-192.png',badge:'./icon-192.png',data:{pid:p.id},renotify:true} as NotificationOptions;
  if(reg)void reg.showNotification(p.name,opt).catch(()=>{});
  else try{new Notification(p.name,opt);}catch{/* 有的浏览器只许 Service Worker 发 */}
}
export function badge(){
  const n=S().personas.reduce((a,p)=>a+unread(p),0);
  try{const nav=navigator as Navigator&{setAppBadge?:(n:number)=>Promise<void>;clearAppBadge?:()=>Promise<void>};if(n)void nav.setAppBadge?.(n);else void nav.clearAppBadge?.();}catch{/* */}
}
let ac:AudioContext|null=null;
export function blip(){
  if(!S().prefs.sound)return;
  try{
    ac??=new AudioContext();const t=ac.currentTime,o=ac.createOscillator(),g=ac.createGain();
    o.type='sine';o.frequency.setValueAtTime(880,t);o.frequency.exponentialRampToValueAtTime(1320,t+.08);
    g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(.08,t+.01);g.gain.exponentialRampToValueAtTime(.0001,t+.22);
    o.connect(g).connect(ac.destination);o.start(t);o.stop(t+.24);
  }catch{/* 没声音也不要紧 */}
}
export const status=()=>({
  installed:matchMedia('(display-mode: standalone)').matches||!!(navigator as Navigator&{standalone?:boolean}).standalone,
  notify:'Notification' in window?Notification.permission:'unsupported',
  sw:!!reg,audio:audioLive(),lock:locked,persisted,periodic,
  ios:/iphone|ipad|ipod/i.test(navigator.userAgent)||(navigator.maxTouchPoints>1&&/macintosh/i.test(navigator.userAgent)),
});
