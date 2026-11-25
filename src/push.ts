// 云端推送：小鹿不用留在后台。
// 离开前台的那一刻，把「他接下来要说的话」连同时间交给云端；到点由云端把通知推到手机。
// 回到前台时把还没发的收回来，聊天里补上的就是通知里的那几句。
import {S,setPrefs} from './db';
import {setHold} from './alive';

// 云端服务的地址（cloud/worker.js 部署出来的那个）。在设置里填一次，跟着同步带到别的设备
export const pushUrl=()=>((import.meta.env.DEV&&localStorage.getItem('cx-push-url'))||S().prefs.cloud||'').replace(/\/+$/,'');

export type Ahead={at:number;title:string;body:string;pid:string;badge?:number};
type Sub={endpoint:string;keys:{p256dh:string;auth:string}};
const FLAG='cx-push';
let sub:Sub|null=null,key='',keyOf='',plan:()=>Ahead[]=()=>[],flying:AbortController|null=null;
const subs=new Set<()=>void>();
export const onPush=(f:()=>void)=>{subs.add(f);return()=>{subs.delete(f);};};
const changed=()=>subs.forEach(f=>f());

const ios=()=>/iphone|ipad|ipod/i.test(navigator.userAgent)||(navigator.maxTouchPoints>1&&/macintosh/i.test(navigator.userAgent));
const standalone=()=>matchMedia('(display-mode: standalone)').matches||!!(navigator as Navigator&{standalone?:boolean}).standalone;
const able=()=>'serviceWorker' in navigator&&'PushManager' in window&&'Notification' in window;
/** 这个站配了云端推送（设置里要不要出现这一项） */
export const pushSet=()=>!!pushUrl();
/** 这台设备上云端推送开着 */
export const pushLive=()=>!!sub;
/** 这台设备开过云端推送（刚打开、订阅还没取回来的那一小会儿也算） */
export const pushWas=()=>!!sub||localStorage.getItem(FLAG)==='1';

const b64u=(b:ArrayBuffer|null)=>b?btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''):'';
const unb64u=(s:string)=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
const swReady=()=>Promise.race([navigator.serviceWorker.ready,new Promise<null>(ok=>setTimeout(()=>ok(null),4000))]);
const post=(path:string,data:object,o:{keepalive?:boolean;signal?:AbortSignal}={})=>
  // 用 text/plain 发：浏览器不用先问一遍能不能发，页面快被收走的那一下也送得出去
  fetch(pushUrl()+path,{method:'POST',headers:{'content-type':'text/plain'},body:JSON.stringify({...data,sub,home:location.origin+location.pathname}),...o});
const asSub=(s:PushSubscription):Sub|null=>{const j=s.toJSON();return j.endpoint&&j.keys?.p256dh&&j.keys?.auth?{endpoint:j.endpoint,keys:{p256dh:j.keys.p256dh,auth:j.keys.auth}}:null;};

/** 提前把钥匙和后台线程备好：点「开启」的那一下才来得及在同一次点按里订上 */
export async function pushPrep(){
  const u=pushUrl();
  if(keyOf!==u){key='';keyOf=u;}
  if(!u||!able()||key)return;
  try{const k=(await fetch(u+'/key').then(r=>r.json()) as {key:string}).key||'';if(keyOf===u)key=k;}catch{/* 一会儿再试 */}
}
/** 填上云端服务的地址：先问一声它在不在，在才记下来。返回空串是成功 */
export async function pushLink(input:string):Promise<string>{
  const u=input.trim().replace(/\/+$/,'');
  if(!/^https:\/\/[\w.-]+(\/[\w./-]*)?$/.test(u)&&!(import.meta.env.DEV&&/^http:\/\/127\.0\.0\.1:\d+$/.test(u)))return '地址要以 https:// 开头';
  try{
    const k=(await fetch(u+'/key').then(r=>r.json()) as {key?:string}).key;
    if(typeof k!=='string'||k.length<80)return '这个地址不是小鹿的云端服务';
    setPrefs({cloud:u});key=k;keyOf=u;changed();return '';
  }catch{return '连不上这个地址，检查一下有没有填错';}
}
/** 换地址：先把这台设备从原来的云端退掉 */
export async function pushUnlink(){await pushOff();setPrefs({cloud:''});key='';keyOf='';changed();}

/** 开启。要在一次点按里调用。返回空串是成功，否则是给人看的原因 */
export async function pushOn():Promise<string>{
  if(!pushSet())return '云端推送还没有配好';
  if(!able())return ios()&&!standalone()?'iPhone 上要先把小鹿加到主屏幕，再从主屏幕的图标打开来开':'这台设备的系统不支持推送（iPhone 要 iOS 16.4 以上）';
  if(Notification.permission==='denied')return '通知被关掉了，去系统设置里允许小鹿发通知再来开';
  try{
    // 问权限必须是这次点按里的第一件事，iPhone 才肯弹出那个询问
    if(Notification.permission!=='granted'&&(await Notification.requestPermission())!=='granted')return '没有拿到通知权限，去系统设置里允许小鹿发通知';
    const reg=await swReady();if(!reg)return '后台线程还没准备好，过几秒再点一次';
    if(!key)await pushPrep();
    if(!key)return '连不上云端，检查一下网络再试';
    let s=await reg.pushManager.getSubscription();
    // 云端换过钥匙的话，旧的订阅收不到，退掉重订
    if(s&&b64u(s.options.applicationServerKey)!==key){await s.unsubscribe();s=null;}
    s??=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:unb64u(key)});
    const got=asSub(s);if(!got)return '系统没有给出推送地址';
    sub=got;
    const r=await post('/plan',{items:[]});
    if(!r.ok){sub=null;return '云端没有收下这台设备，过一会儿再试';}
    localStorage.setItem(FLAG,'1');setPrefs({notify:true});changed();return '';
  }catch(e){
    sub=null;
    return /denied|NotAllowed|permission/i.test(String(e))?'没有拿到通知权限，去系统设置里允许小鹿发通知':'没有订上，再点一次试试';
  }
}
export async function pushOff(){
  try{if(sub)await post('/leave',{});}catch{/* 云端那份过期了会自己清 */}
  try{const reg=await swReady();await (await reg?.pushManager.getSubscription())?.unsubscribe();}catch{/* */}
  sub=null;localStorage.removeItem(FLAG);setHold(false);changed();
}
/** 立刻推一条到这台设备，看通不通 */
export async function pushTest(title:string,body:string,pid:string):Promise<boolean>{
  if(!sub)return false;
  try{const r=await post('/test',{title,body,pid});return r.ok&&!!(await r.json() as {ok?:boolean}).ok;}catch{return false;}
}

// 离开：交出去
function hand(){
  if(!sub)return;
  flying?.abort();flying=null;
  void post('/plan',{items:plan()},{keepalive:true}).then(r=>{if(r.ok&&document.hidden)setHold(true);}).catch(()=>{});
}
// 回来：收回来，顺手把已经弹过的通知清掉
function back(){
  setHold(false);
  if(!sub)return;
  flying?.abort();const c=flying=new AbortController();
  void post('/plan',{items:[]},{signal:c.signal}).catch(()=>{}).finally(()=>{if(flying===c)flying=null;});
  void swReady().then(reg=>reg?.getNotifications()).then(ns=>ns?.forEach(n=>n.close())).catch(()=>{});
}

export async function startPush(ahead:()=>Ahead[]){
  plan=ahead;
  if(!able())return;
  document.addEventListener('visibilitychange',()=>{if(document.hidden)hand();else back();});
  addEventListener('pagehide',hand);
  if(!pushSet())return;
  void pushPrep();
  if(localStorage.getItem(FLAG)!=='1')return;
  try{
    const reg=await swReady();if(!reg)return;
    let s=await reg.pushManager.getSubscription();
    // 开过、但系统把订阅收走了：通知权限还在的话悄悄续上
    if(!s&&Notification.permission==='granted'){await pushPrep();if(key)s=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:unb64u(key)});}
    sub=s?asSub(s):null;
    if(sub){changed();if(document.hidden)hand();else back();}
  }catch{/* 这次没续上，下次打开再试 */}
}
