// 后台保活：让页面在后台尽量活着，他主动找你时能弹出通知。
// 一层一层来，哪层在这台设备上不管用，就靠下一层兜着：
// 1 计时放在 Worker 里（后台标签页的主线程计时会被压得很慢）
// 2 一段听不见的循环音频 + 媒体会话，让系统把页面当成「正在播放」而不去冻结它
// 3 Web Lock，告诉浏览器这页还有事没做完
// 4 Service Worker：发系统通知、点通知回到对话；浏览器肯给的话，定期在后台醒来替他把话送到
// 5 回到页面的那一刻补上离开期间他该说的话（这一层任何设备都有效）
import {S,getImage,list,onChange,reload,setPrefs,unread,type Persona} from './db';
import {isShell,shell,shellAsk,shellGranted,shellCan,shellOn} from './native';

let reg:ServiceWorkerRegistration|null=null;
let onTick=()=>{};
let audio:HTMLAudioElement|null=null,locked=false,persisted=false,periodic=false;

/* ── 保活方式一：一段听不见的循环音频 ──
   音频做成五分钟一圈：太短的话 iPhone 的灵动岛每循环一次会闪一下 */
function silentWav(){
  const rate=8000,n=rate*300,buf=new ArrayBuffer(44+n),v=new DataView(buf);
  const w=(o:number,s:string)=>{for(let i=0;i<s.length;i++)v.setUint8(o+i,s.charCodeAt(i));};
  w(0,'RIFF');v.setUint32(4,36+n,true);w(8,'WAVEfmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);
  v.setUint32(24,rate,true);v.setUint32(28,rate,true);v.setUint16(32,1,true);v.setUint16(34,8,true);w(36,'data');v.setUint32(40,n,true);
  new Uint8Array(buf,44).fill(128);
  return URL.createObjectURL(new Blob([buf],{type:'audio/wav'}));
}
async function loopOn(on:boolean){
  if(!on){
    // 关就关干净：停掉、把声音文件卸掉、把锁屏上的播放条也撤掉
    if(audio){
      const a=audio;audio=null;a.pause();a.removeAttribute('src');a.load();
      try{navigator.mediaSession.metadata=null;navigator.mediaSession.playbackState='none';for(const k of ['play','pause','stop'] as const)navigator.mediaSession.setActionHandler(k,null);}catch{/* 没有也行 */}
    }
    return true;
  }
  if(!audio){
    audio=new Audio(silentWav());audio.loop=true;audio.setAttribute('playsinline','');
    // 被系统停掉就自己接着放
    audio.addEventListener('pause',()=>{if(want().loop)setTimeout(()=>{void audio?.play().catch(()=>{});},600);});
    try{
      navigator.mediaSession.metadata=new MediaMetadata({title:'在等你的消息',artist:document.title});
      for(const a of ['play','pause','stop'] as const)navigator.mediaSession.setActionHandler(a,()=>{void audio?.play().catch(()=>{});});
    }catch{/* 没有媒体会话也行 */}
  }
  try{await audio.play();try{navigator.mediaSession.playbackState='playing';}catch{/* */}return true;}catch{return false;}
}
export const audioLive=()=>!!audio&&!audio.paused;

/* ── 保活方式二：振荡器。一个小到听不见的持续音，锁屏上不会出现播放条 ── */
let oc:AudioContext|null=null,osc:OscillatorNode|null=null;
async function oscOn(on:boolean){
  if(!on){try{osc?.stop();}catch{/* */}osc=null;void oc?.close().catch(()=>{});oc=null;return true;}
  try{
    if(!oc){
      oc=new AudioContext();const g=oc.createGain();g.gain.value=0.0002;
      osc=oc.createOscillator();osc.type='sine';osc.frequency.value=30;osc.connect(g).connect(oc.destination);osc.start();
    }
    if(oc.state!=='running')await oc.resume();
    return oc.state==='running';
  }catch{return false;}
}
export const oscLive=()=>oc?.state==='running';

/* ── 保活方式三：画中画。把一张小卡片（他的头像、名字、最新一句）画在画布上，当成视频放进系统小窗；
   小窗开着，系统就不会把页面停掉，而且完全不占声音 ── */
type PV=HTMLVideoElement&{webkitSupportsPresentationMode?:(m:string)=>boolean;webkitSetPresentationMode?:(m:string)=>void;webkitPresentationMode?:string;autoPictureInPicture?:boolean};
let pc:HTMLCanvasElement|null=null,pv:PV|null=null,pipLive=false,armed=true,clip='';
const face=new Map<string,HTMLImageElement>();
const pipSubs=new Set<()=>void>();
export const onPip=(f:()=>void)=>{pipSubs.add(f);return()=>{pipSubs.delete(f);};};
const pipSet=(v:boolean)=>{if(pipLive!==v){pipLive=v;pipSubs.forEach(f=>f());}};
export const pipOn=()=>pipLive;
let can:boolean|null=null;
export const pipCan=()=>{
  if(can!==null)return can;
  const v=document.createElement('video') as PV;
  return can=!!(document.pictureInPictureEnabled||v.webkitSupportsPresentationMode?.('picture-in-picture'))&&typeof HTMLCanvasElement.prototype.captureStream==='function';
};
let beat=0;
/* 视频通话的系统小窗：画他的通话画面、名字和通话时长，切到别的 app 也浮着 */
let calling:{name:string;pic?:string;at:number}|null=null;
export function pipCall(v:{name:string;pic?:string;at:number}|null){
  const was=!!calling;calling=v;
  if(!pipCan()||pipBlocked())return;
  if(!v&&!was)return;
  pipSetup();
  const [w,h]=v?[360,480]:[640,200];
  if(pc&&(pc.width!==w||pc.height!==h)){pc.width=w;pc.height=h;}
  pipDraw();
  if(v)void pv?.play().catch(()=>{});
  else if(!S().prefs.audio){if(pipLive)void pipLeave();pv?.pause();}
}
const clock=(ms:number)=>{const s=Math.max(0,Math.floor(ms/1000)),h=Math.floor(s/3600),m=Math.floor(s%3600/60),pad=(n:number)=>String(n).padStart(2,'0');return (h?h+':'+pad(m):pad(m))+':'+pad(s%60);};
function drawCall(c:CanvasRenderingContext2D,W:number,H:number){
  const v=calling!;
  c.fillStyle='#1C1C1E';c.fillRect(0,0,W,H);
  const im=v.pic?face.get(v.pic):undefined;
  if(im?.complete&&im.naturalWidth){const k=Math.max(W/im.naturalWidth,H/im.naturalHeight),w=im.naturalWidth*k,h=im.naturalHeight*k;c.drawImage(im,(W-w)/2,(H-h)/2,w,h);}
  else{
    c.fillStyle='#2C2C2E';c.beginPath();c.arc(W/2,H/2-30,78,0,Math.PI*2);c.fill();
    c.fillStyle='#fff';c.font='600 66px system-ui,-apple-system,"PingFang SC",sans-serif';c.textAlign='center';c.textBaseline='middle';c.fillText([...v.name][0]??'·',W/2,H/2-26);
    if(v.pic&&!face.has(v.pic)){const i=new Image();face.set(v.pic,i);void getImage(v.pic).then(u=>{i.src=u;});}
  }
  const g=c.createLinearGradient(0,H-170,0,H);g.addColorStop(0,'rgba(0,0,0,0)');g.addColorStop(1,'rgba(0,0,0,.72)');c.fillStyle=g;c.fillRect(0,H-170,W,170);
  c.textAlign='center';c.textBaseline='alphabetic';c.fillStyle='#fff';
  c.font='600 30px system-ui,-apple-system,"PingFang SC",sans-serif';c.fillText(v.name,W/2,H-62,W-40);
  c.font='500 24px system-ui,-apple-system,sans-serif';c.fillText(clock(Date.now()-v.at),W/2+10,H-26);
  c.fillStyle='#34C759';c.beginPath();c.arc(W/2-c.measureText(clock(Date.now()-v.at)).width/2-8,H-34,6,0,Math.PI*2);c.fill();
  beat^=1;c.fillStyle=beat?'#000':'#010101';c.fillRect(W-2,H-2,2,2);
}
function pipDraw(){
  if(!pc)return;
  const c=pc.getContext('2d');if(!c)return;
  if(calling){drawCall(c,pc.width,pc.height);return;}
  const W=pc.width,H=pc.height,dark=document.documentElement.dataset.theme==='dark'||(document.documentElement.dataset.theme!=='light'&&matchMedia('(prefers-color-scheme: dark)').matches);
  const st=S();
  // 画谁：最近说过话的那位，没有就画上次打开的那位
  let p=st.personas.find(x=>x.id===st.prefs.last)??st.personas[0],last:{text:string;at:number}|undefined;
  for(const x of st.personas){const m=list(x.id).filter(y=>y.from==='ta'&&y.kind!=='tip').at(-1);if(m&&(!last||m.at>last.at)){last={text:m.kind==='img'?(m.st?'[表情]':'[图片]'):m.text,at:m.at};p=x;}}
  c.fillStyle=dark?'#000':'#fff';c.fillRect(0,0,W,H);
  if(!p)return;
  const n=unread(p),r=58,cx=34+r,cy=H/2;
  c.save();c.beginPath();c.arc(cx,cy,r,0,Math.PI*2);c.closePath();c.clip();
  const im=p.avatar?face.get(p.avatar):undefined;
  if(im?.complete&&im.naturalWidth){const k=Math.max(2*r/im.naturalWidth,2*r/im.naturalHeight),w=im.naturalWidth*k,h=im.naturalHeight*k;c.drawImage(im,cx-w/2,cy-h/2,w,h);}
  else{c.fillStyle=dark?'#262626':'#EFEFEF';c.fillRect(cx-r,cy-r,2*r,2*r);c.fillStyle=dark?'#fff':'#000';c.font='600 46px system-ui,-apple-system,"PingFang SC",sans-serif';c.textAlign='center';c.textBaseline='middle';c.fillText([...p.name][0]??'·',cx,cy+2);
    if(p.avatar&&!face.has(p.avatar)){const i=new Image();face.set(p.avatar,i);void getImage(p.avatar).then(u=>{i.src=u;});}}
  c.restore();
  const x0=cx+r+26,maxW=W-x0-28;
  c.textAlign='left';c.textBaseline='alphabetic';c.fillStyle=dark?'#fff':'#000';c.font='700 34px system-ui,-apple-system,"PingFang SC",sans-serif';
  c.fillText(p.name,x0,cy-22,maxW-(n?64:0));
  if(n){const t=String(n),tw=Math.max(40,c.measureText(t).width*0.7+26);c.fillStyle='#3A82F7';c.beginPath();c.roundRect?.(W-28-tw,cy-54,tw,40,20);c.fill();c.fillStyle='#fff';c.font='600 24px system-ui,sans-serif';c.textAlign='center';c.fillText(t,W-28-tw/2,cy-25);c.textAlign='left';}
  c.fillStyle=dark?'#A8A8A8':'#737373';c.font='400 28px system-ui,-apple-system,"PingFang SC",sans-serif';
  let line=last?.text.replace(/\s+/g,' ')??'在等你的消息';while(line.length>1&&c.measureText(line).width>maxW)line=line.slice(0,-2)+'…';
  c.fillText(line,x0,cy+26);
  // 每一拍动一个像素，画面在变，系统才当它是一段在放的视频
  beat^=1;c.fillStyle=dark?(beat?'#000':'#010101'):(beat?'#fff':'#fefefe');c.fillRect(W-2,H-2,2,2);
}
const HIDE='position:fixed;left:0;bottom:0;width:2px;height:2px;opacity:.01;pointer-events:none;z-index:-1';
/** 设置页里给小窗留一块预览的位置：视频真的显示在页面上，iPhone 才更愿意让它进小窗 */
export function pipSlot(el:HTMLElement|null){
  if(!pipCan()||(!el&&!pv))return;
  pipSetup();const v=pv!;
  if(el){v.style.cssText='display:block;width:100%;border-radius:14px;pointer-events:none';el.appendChild(v);void v.play().catch(()=>{});}
  else{v.style.cssText=HIDE;document.body.appendChild(v);if(S().prefs.audio||calling)void v.play().catch(()=>{});else v.pause();}
}
const isIOS=()=>/iphone|ipad|ipod/i.test(navigator.userAgent)||(navigator.maxTouchPoints>1&&/macintosh/i.test(navigator.userAgent));
const standalone=()=>matchMedia('(display-mode: standalone)').matches||!!(navigator as Navigator&{standalone?:boolean}).standalone;
/** iPhone 上「添加到主屏幕」的 app 里，系统不让网页开画中画（Safari 里可以） */
export const pipBlocked=()=>isIOS()&&standalone();
function pipSetup(){
  if(pv)return;
  pc=document.createElement('canvas');pc.width=640;pc.height=200;pipDraw();
  const v=document.createElement('video') as PV;
  v.muted=true;v.playsInline=true;v.setAttribute('playsinline','');v.setAttribute('muted','');v.loop=true;
  v.style.cssText=HIDE;
  try{v.srcObject=pc.captureStream(8);}catch{/* 这台设备给不了画布视频 */}
  v.addEventListener('enterpictureinpicture',()=>pipSet(true));
  v.addEventListener('leavepictureinpicture',()=>{pipSet(false);void v.play().catch(()=>{});});
  v.addEventListener('webkitpresentationmodechanged',()=>pipSet(v.webkitPresentationMode==='picture-in-picture'));
  v.addEventListener('pause',()=>{if(pipLive&&(S().prefs.audio||calling))setTimeout(()=>{void v.play().catch(()=>{});},300);});
  try{v.autoPictureInPicture=true;}catch{/* */}
  document.body.appendChild(v);pv=v;void v.play().catch(()=>{});
}
// 有的系统不肯把「画布直播」放进小窗：录两秒存成一段真视频再试
function makeClip(){
  if(clip||!pc||typeof MediaRecorder!=='function')return;
  try{
    const rec=new MediaRecorder(pc.captureStream(8)),parts:Blob[]=[];
    rec.ondataavailable=e=>{if(e.data.size)parts.push(e.data);};
    rec.onstop=()=>{if(!parts.length||!pv)return;clip=URL.createObjectURL(new Blob(parts,{type:rec.mimeType}));pv.srcObject=null;pv.src=clip;void pv.play().catch(()=>{});};
    rec.start();const id=setInterval(pipDraw,150);setTimeout(()=>{clearInterval(id);try{rec.stop();}catch{/* */}},2200);
  }catch{/* 录不了就算了 */}
}
/** 进入画中画。必须在一次点按里调用。返回空串是成功，否则是给人看的原因 */
export async function pipEnter():Promise<string>{
  if(!pipCan())return pipBlocked()?'主屏幕的 app 里 iPhone 不让开画中画，在 Safari 里打开小鹿就可以':'这个浏览器不支持画中画';
  pipSetup();const v=pv!;
  if(pipLive)return '';
  void v.play().catch(()=>{});
  // 小窗要等视频有了画面才开得出来：刚建好的话等它一下
  if(v.readyState<1)await new Promise<void>(ok=>{const done=()=>ok();v.addEventListener('loadedmetadata',done,{once:true});setTimeout(done,1500);});
  try{
    if(typeof v.requestPictureInPicture==='function')await v.requestPictureInPicture();
    else if(v.webkitSupportsPresentationMode?.('picture-in-picture'))v.webkitSetPresentationMode?.('picture-in-picture');
    else return '这个浏览器不支持画中画';
    return '';
  }catch(e){
    if(pipBlocked())return '主屏幕的 app 里 iPhone 不让开画中画，在 Safari 里打开小鹿就可以';
    if(!clip){makeClip();return '小窗没开出来，正在换一种方式，过两秒再点一次';}
    return /gesture|activation|NotAllowed/i.test(String(e))?'要在点按的那一下才能进入，再点一次':'系统没有让小窗打开';
  }
}
/** 提前把小窗要用的视频备好，点「进入画中画」的那一下才来得及 */
export const pipReady=()=>{if(pipCan())pipSetup();};
export async function pipLeave(){try{if(document.pictureInPictureElement)await document.exitPictureInPicture();else pv?.webkitSetPresentationMode?.('inline');}catch{/* */}}

/* ── 屏幕常亮 ── */
let wl:{release:()=>Promise<void>;released?:boolean}|null=null;
async function wakeOn(on:boolean){
  try{
    if(!on){await wl?.release();wl=null;return true;}
    if(wl&&!wl.released)return true;
    const nv=navigator as Navigator&{wakeLock?:{request:(t:'screen')=>Promise<{release:()=>Promise<void>;released?:boolean}>}};
    if(!nv.wakeLock||document.hidden)return false;
    wl=await nv.wakeLock.request('screen');return true;
  }catch{return false;}
}
export const wakeLive=()=>!!wl&&!wl.released;

/* ── 这一页的声音在系统里算哪一种 ──
   后台保活开着（静音音频 / 振荡器）时要算「正在播放」，系统才不停掉页面；
   其余时候一律算「环境音」：不打断你在别的 app 里听的歌、看的视频，不占锁屏和灵动岛，切到后台就停 */
function voice(){
  const w=want();
  try{(navigator as Navigator&{audioSession?:{type:string}}).audioSession!.type=w.loop||w.osc?'playback':'ambient';}catch{/* 老系统没有这个开关 */}
}

/* ── 总开关 ── */
const want=()=>{const pf=S().prefs,m=pf.mode??'loop';return {loop:pf.audio&&(m==='loop'||m==='both'),osc:pf.audio&&(m==='osc'||m==='both'),pip:pf.audio&&m==='pip'};};
/** 按现在的设置把各层开起来或关掉。声音类的要在一次点按里才开得出来 */
export async function apply():Promise<boolean>{
  const w=want(),on=S().prefs.audio;
  voice();
  const a=await loopOn(w.loop),b=await oscOn(w.osc);
  // 总开关关掉：小窗也收起来，备着的视频也停
  if(!on&&!calling){if(pipLive)await pipLeave();pv?.pause();}
  else if(w.pip||S().prefs.pipAuto)pipSetup();
  void wakeOn(!!S().prefs.awake);
  return a&&b;
}
export async function audioOn(on:boolean){setPrefs({audio:on});return apply();}
export async function setMode(mode:NonNullable<ReturnType<typeof S>['prefs']['mode']>){setPrefs({mode});return apply();}

/* ── 真的在后台活着吗：记下每次切出去多久、其中有多久页面还在跑 ── */
type Away={away:number;alive:number;at:number};
let hidAt=0,aliveMs=0,lastBeat=Date.now();
export const lastAway=():Away|null=>{try{return JSON.parse(localStorage.getItem('cx-away')??'null') as Away|null;}catch{return null;}};
function heartbeat(){
  const now=Date.now();
  if(document.hidden&&hidAt&&now-lastBeat<2600)aliveMs+=now-lastBeat;
  lastBeat=now;
}
function seen(){
  const now=Date.now();
  if(document.hidden){hidAt=now;aliveMs=0;lastBeat=now;return;}
  if(hidAt&&now-hidAt>15000){try{localStorage.setItem('cx-away',JSON.stringify({away:now-hidAt,alive:Math.min(aliveMs,now-hidAt),at:now} satisfies Away));}catch{/* */}}
  hidAt=0;
}

export async function start(tick:()=>void){
  onTick=tick;
  // 一打开就先跑一拍：离开期间该到的话立刻出现在聊天里，不等下一秒
  onTick();
  voice();
  try{
    const w=new Worker(URL.createObjectURL(new Blob(['setInterval(()=>postMessage(0),1000)'],{type:'text/javascript'})));
    w.onmessage=()=>{heartbeat();onTick();if(pv)pipDraw();};
  }catch{setInterval(()=>{heartbeat();onTick();if(pv)pipDraw();},1000);}
  const wake=()=>{onTick();const w=want();if(w.loop&&audio&&audio.paused)void audio.play().catch(()=>{});if(w.osc&&oc&&oc.state!=='running')void oc.resume().catch(()=>{});if((S().prefs.audio||calling)&&pv&&pv.paused)void pv.play().catch(()=>{});if(S().prefs.awake&&!document.hidden)void wakeOn(true);};
  document.addEventListener('visibilitychange',()=>{seen();if(!document.hidden)armed=true;});
  document.addEventListener('visibilitychange',wake);document.addEventListener('resume',wake);
  addEventListener('pageshow',wake);addEventListener('focus',wake);addEventListener('online',wake);
  // 音频要有一次点按才放得出来：设置里开过的，下次进来第一下点按就接上
  if(S().prefs.audio||S().prefs.pipAuto||S().prefs.awake){const once=()=>{removeEventListener('pointerdown',once);void apply();};addEventListener('pointerdown',once);if(S().prefs.audio&&(want().pip||S().prefs.pipAuto))pipSetup();}
  // 画中画自动开启：打开之后的第一下点按顺手进小窗；关掉小窗、离开再回来，下一次点按会再进
  addEventListener('click',()=>{const pf=S().prefs;if(pf.audio&&pf.pipAuto&&armed&&!pipLive&&pipCan()&&!pipBlocked()){armed=false;void pipEnter();}},true);
  if(pipCan()&&!pipBlocked()&&!isIOS()){try{(navigator.mediaSession as MediaSession&{setActionHandler:(a:string,h:()=>void)=>void}).setActionHandler('enterpictureinpicture',()=>{void pipEnter();});}catch{/* 只有部分浏览器有 */}}
  try{void navigator.locks?.request('cx-alive',()=>{locked=true;return new Promise(()=>{});});}catch{/* 没有也行 */}
  try{persisted=!!(await navigator.storage?.persisted?.())||!!(await navigator.storage?.persist?.());}catch{/* */}
  if('serviceWorker' in navigator){
    try{
      reg=await navigator.serviceWorker.register('./sw.js');
      navigator.serviceWorker.addEventListener('message',e=>{
        const d=e.data||{};
        if(d.type==='open'&&d.pid)location.hash=d.to==='mail'?'#/f/mail/'+d.pid:'#/c/'+d.pid;
        if(d.type==='tick')onTick();
        if(d.type==='changed')void reload();
      });
      const ps=(reg as unknown as {periodicSync?:{register:(t:string,o:{minInterval:number})=>Promise<void>}}).periodicSync;
      if(ps){try{await ps.register('cx-tick',{minInterval:15*60*1000});periodic=true;}catch{/* 浏览器没给 */}}
    }catch{/* 本地预览时没有也行 */}
  }
  badge();
  let bt=0;onChange(()=>{clearTimeout(bt);bt=window.setTimeout(badge,400);});
}

export async function askNotify():Promise<boolean>{
  if(isShell()){const ok=await shellAsk();setPrefs({notify:ok});return ok;}
  if(!('Notification' in window))return false;
  const ok=(Notification.permission==='granted')||(await Notification.requestPermission())==='granted';
  setPrefs({notify:ok});return ok;
}
// 云端推送接手的时候（页面在后台、话已经交给云端）：通知由云端弹，这里不再弹一遍
let hold=false;
export const setHold=(v:boolean)=>{hold=v;};
// quiet：紧跟着上一句来的（他一次回了几句）：只把通知上的字换成新的这句，不再弹出来、响一遍
export function notify(p:Persona,text:string,to?:'mail',quiet=false){
  if(hold&&document.hidden)return;
  if(isShell()){if(shellOn())void shell().then(m=>m.show(p.name,text,{pid:p.id,to},'cx-'+p.id,quiet));return;}
  if(!S().prefs.notify||!('Notification' in window)||Notification.permission!=='granted')return;
  const opt={body:text,tag:'cx-'+p.id,icon:'./icon-192.png',badge:'./badge-96.png',data:{pid:p.id,to},renotify:!quiet,silent:quiet} as NotificationOptions;
  if(reg)void reg.showNotification(p.name,opt).catch(()=>{});
  else try{new Notification(p.name,opt);}catch{/* 有的浏览器只许 Service Worker 发 */}
}
/** 不是他说的话的提醒（比如经期快到了）：一样听「通知」的开关；云端已经接手的时候这里不再弹一遍 */
export function remind(title:string,text:string,pid:string){
  if(hold&&document.hidden)return;
  if(isShell()){if(shellOn())void shell().then(m=>m.show(title,text,{pid},'cx-tip-'+pid));return;}
  if(!S().prefs.notify||!('Notification' in window)||Notification.permission!=='granted')return;
  const opt={body:text,tag:'cx-tip-'+pid,icon:'./icon-192.png',badge:'./badge-96.png',data:{pid}} as NotificationOptions;
  if(reg)void reg.showNotification(title,opt).catch(()=>{});
  else try{new Notification(title,opt);}catch{/* 有的浏览器只许 Service Worker 发 */}
}
/** 看过了：把这位已经弹出来的通知收掉（不给 pid 就全收） */
export function clearNotes(pid?:string){
  if(isShell()){void shell().then(m=>m.clearShown(pid));return;}
  void reg?.getNotifications().then(ns=>ns.forEach(n=>{const d=n.data as {pid?:string}|null;if(!pid||d?.pid===pid||(n.tag||'').startsWith('cx-'+pid))n.close();})).catch(()=>{});
}
export function badge(){
  const n=S().personas.reduce((a,p)=>a+unread(p),0);
  try{const nav=navigator as Navigator&{setAppBadge?:(n:number)=>Promise<void>;clearAppBadge?:()=>Promise<void>};if(n)void nav.setAppBadge?.(n);else void nav.clearAppBadge?.();}catch{/* */}
}
let ac:AudioContext|null=null,acT=0;
export function blip(){
  if(!S().prefs.sound||document.hidden)return;
  try{
    ac??=new AudioContext();void ac.resume().catch(()=>{});
    const t=ac.currentTime,o=ac.createOscillator(),g=ac.createGain();
    o.type='sine';o.frequency.setValueAtTime(880,t);o.frequency.exponentialRampToValueAtTime(1320,t+.08);
    g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(.08,t+.01);g.gain.exponentialRampToValueAtTime(.0001,t+.22);
    o.connect(g).connect(ac.destination);o.start(t);o.stop(t+.24);
    // 响完就把声音通道放掉：不留一个一直开着的音频在那儿（iPhone 会把它当成这页在放声音）
    clearTimeout(acT);acT=window.setTimeout(()=>{const c=ac;ac=null;void c?.close().catch(()=>{});},700);
  }catch{/* 没声音也不要紧 */}
}
export const status=()=>({
  installed:standalone(),
  notify:isShell()?(shellGranted()?'granted':'default'):'Notification' in window?Notification.permission:'unsupported',
  shell:isShell(),shellSet:shellCan(),
  sw:!!reg,audio:audioLive(),osc:oscLive(),pip:pipLive,pipCan:pipCan(),pipBlocked:pipBlocked(),wake:wakeLive(),lock:locked,persisted,periodic,
  ios:/iphone|ipad|ipod/i.test(navigator.userAgent)||(navigator.maxTouchPoints>1&&/macintosh/i.test(navigator.userAgent)),
});
