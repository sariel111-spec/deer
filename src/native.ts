// 是不是在安卓安装包（壳）里跑。壳会在页面里放一个 window.Capacitor；普通浏览器、iPhone 主屏幕上没有，下面的东西就都不做。
import {S,setPrefs} from './db';
import {slog} from './slog';
type Shell=typeof import('./shell');
const w=()=>window as unknown as {Capacitor?:{isNativePlatform?:()=>boolean};__shell?:Shell};
export const isShell=()=>{try{return !!w().Capacitor?.isNativePlatform?.();}catch{return false;}};
let mod:Promise<Shell>|null=null;
/** 壳里用的那些原生能力（用到才加载）。测试时可以放一个假的 window.__shell 顶替 */
export const shell=():Promise<Shell>=>mod??=(w().__shell?Promise.resolve(w().__shell!):import('./shell'));
let ok=false,can=false,keepCan=false;
let inf:import('./shell').Info={};
/** 安装包报的情况（1.3 起：版本、手机牌子、电池是不是不限制）。回到小鹿时会再问一遍 */
export const shellInfo=()=>inf;
export async function shellRefresh(){if(!isShell())return inf;try{inf=await (await shell()).info();}catch{/* */}return inf;}
export const shellBattery=()=>{void shell().then(m=>m.askBattery());};
export const shellLaunch=()=>{void shell().then(m=>m.openLaunch());};
const KEEP='cx-shell-keep2',TRY='cx-shell-keep-try';
// 这一页是不是这次打开 app 以后的第一页（网站自己刷新一下不算重新打开；sessionStorage 跟着 app 进程走）
const firstPage=(()=>{try{const had=sessionStorage.getItem('cx-shell-alive');sessionStorage.setItem('cx-shell-alive','1');return !had;}catch{return false;}})();
let checked=false;
/** 后台常驻：这个安装包有没有（1.2 起）、她开着没有（默认开，只记在这台手机上） */
export const shellKeep=():'on'|'off'|undefined=>!keepCan?undefined:localStorage.getItem(KEEP)==='0'?'off':'on';
/** 照现在的开关把常驻开起来 / 停掉。上一次开的时候 app 闪退过（记号还在），就自动关掉不再试 */
async function keepSync(){
  if(!keepCan)return;
  const m=await shell(),want=shellOn()&&shellKeep()==='on';
  if(!want){await m.keep(false);return;}
  // 开之前记一笔时间，开稳了（一秒半后还活着）就擦掉。重新打开 app 时发现十秒内的那一笔还在＝上次一开就闪退了，自动关掉不再试
  if(!checked){checked=true;
    try{const t=Number(localStorage.getItem(TRY))||0;if(firstPage&&t&&Date.now()-t<10000){localStorage.removeItem(TRY);localStorage.setItem(KEEP,'0');slog('常驻：上次一开就闪退，自动关掉了');await m.keep(false);return;}}catch{/* */}
  }
  try{localStorage.setItem(TRY,String(Date.now()));}catch{/* */}
  await m.keep(true);
  setTimeout(()=>{try{localStorage.removeItem(TRY);}catch{/* */}},1500);
}
export async function setShellKeep(on:boolean){try{localStorage.setItem(KEEP,on?'1':'0');localStorage.removeItem(TRY);}catch{/* */}await keepSync();}
/** 这个安装包能不能直接打开系统设置（1.1 起） */
export const shellCan=()=>can;
export const shellOpen=(what:'notify'|'app')=>{void shell().then(m=>what==='notify'?m.openNotify():m.openApp());};
/** 壳里通知的权限拿到了没有（打开时问一次系统，之后记着） */
export const shellGranted=()=>ok;
export async function shellAsk(){ok=await (await shell()).ask();setTimeout(()=>void keepSync(),300);return ok;}
/** 通知的开关变了以后叫一下：关了通知就不用常驻了 */
export const shellSync=()=>{setTimeout(()=>void keepSync(),300);};
/** 人不在、页面还醒着时，到点的那句话当场弹 */
export const shellFire=(pid:string,title:string,body:string,extra:object,key:string,quiet=false)=>{if(shellOn())void shell().then(m=>m.fire(pid,title,body,extra,key,quiet));};
/** 壳里：他要说的话照「通知」的开关走，人不在的时候由手机到点自己弹，不需要云端 */
export const shellOn=()=>isShell()&&!!S().prefs.notify&&ok;

type Ahead={at:number;title:string;body:string;pid:string};
export async function startShell(ahead:()=>Ahead[],freed:(at:number)=>void,setHold:(v:boolean)=>void){
  if(!isShell())return;
  const m=await shell();
  ok=await m.granted();can=m.canOpen();keepCan=await m.canKeep();inf=await m.info();
  slog(`打开小鹿：安装包${(inf.v??0)>=3?'1.3+':keepCan?'1.2':can?'1.1':'1.0'} 通知权限=${ok?'有':'无'} 开关=${S().prefs.notify?'开':'关'} 常驻=${shellKeep()??'没有'}${(inf.v??0)>=3?` 电池不限制=${inf.battery?'是':'否'} 手机=${inf.maker??''}`:''}`);
  m.onAlarm();
  if(S().prefs.notify&&!ok)setPrefs({notify:false});   // 系统里把权限关了：开关跟着显示成没开
  // 刚装好第一次打开：像别的聊天 app 一样问一次要不要通知（只问这一次，之后在设置里自己开关）
  try{if(!localStorage.getItem('cx-shell-asked')){localStorage.setItem('cx-shell-asked','1');if(!S().prefs.notify){ok=await m.ask();if(ok)setPrefs({notify:true});}}}catch{/* */}
  m.backButton();
  m.onTap(x=>{if(x?.pid)location.hash=x.to==='mail'?'#/f/mail/'+x.pid:'#/c/'+x.pid;});
  let gone=0,here=0;
  let beat=0,since=0;
  const away=(why:string)=>{if(!shellOn()){slog('离开（'+why+'）：通知没开，不交');return;}const t=Date.now();if(t-gone<1500)return;gone=t;here=0;
    const list=ahead();slog(`离开（${why}）：接下来有 ${list.length} 条`);void m.plan(list);setHold(true);
    // 1.3 起：半小时内有话要到，就让手机在那之前别睡（息屏了页面也照样走，到点当场弹）；更久以后的交给闹钟
    if((inf.v??0)>=3&&shellKeep()==='on'){const soon=list.filter(x=>x.at-t<30*60000).map(x=>x.at);void m.stayAwake(soon.length?Math.max(...soon)-t+20000:0);}
    // 人不在的时候每半分钟记一笔，看得出页面在后台是不是还醒着
    since=t;clearInterval(beat);beat=window.setInterval(()=>{const s=Math.round((Date.now()-since)/1000);if(s<=600)slog(`后台 ${s} 秒：页面还醒着`);else clearInterval(beat);},30000);};
  const back=()=>{const t=Date.now();if(t-here<1500)return;here=t;const was=gone;if(gone)slog(`回来了（离开了 ${Math.round((t-gone)/1000)} 秒）`);gone=0;clearInterval(beat);setHold(false);void m.cancelPlan().then(()=>freed(Date.now()));void m.clearShown();
    if((inf.v??0)>=3&&was){if(shellKeep()==='on'&&shellOn())void m.stayAwake(0);void shellRefresh();}};
  document.addEventListener('visibilitychange',()=>{if(document.hidden)away('页面隐藏');else back();});
  addEventListener('pagehide',()=>away('页面收起'));
  m.onState(active=>{if(active)back();else away('系统通知');});
  if(document.hidden)away('启动时就在后台');else back();
  void keepSync();
}
/** 存一个文件到手机上。返回 false 表示不在壳里，照原来的办法下载 */
export function shellSave(name:string,data:string,base64=false):boolean{
  if(!isShell())return false;
  void shell().then(m=>m.saveFile(name,data,base64)).catch(()=>{/* 她取消了 */});
  return true;
}
