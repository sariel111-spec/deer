// 是不是在安卓安装包（壳）里跑。壳会在页面里放一个 window.Capacitor；普通浏览器、iPhone 主屏幕上没有，下面的东西就都不做。
import {S,setPrefs} from './db';
type Shell=typeof import('./shell');
const w=()=>window as unknown as {Capacitor?:{isNativePlatform?:()=>boolean};__shell?:Shell};
export const isShell=()=>{try{return !!w().Capacitor?.isNativePlatform?.();}catch{return false;}};
let mod:Promise<Shell>|null=null;
/** 壳里用的那些原生能力（用到才加载）。测试时可以放一个假的 window.__shell 顶替 */
export const shell=():Promise<Shell>=>mod??=(w().__shell?Promise.resolve(w().__shell!):import('./shell'));
let ok=false,can=false;
/** 这个安装包能不能直接打开系统设置（1.1 起） */
export const shellCan=()=>can;
export const shellOpen=(what:'notify'|'app')=>{void shell().then(m=>what==='notify'?m.openNotify():m.openApp());};
/** 壳里通知的权限拿到了没有（打开时问一次系统，之后记着） */
export const shellGranted=()=>ok;
export async function shellAsk(){ok=await (await shell()).ask();return ok;}
/** 壳里：他要说的话照「通知」的开关走，人不在的时候由手机到点自己弹，不需要云端 */
export const shellOn=()=>isShell()&&!!S().prefs.notify&&ok;

type Ahead={at:number;title:string;body:string;pid:string};
export async function startShell(ahead:()=>Ahead[],freed:(at:number)=>void,setHold:(v:boolean)=>void){
  if(!isShell())return;
  const m=await shell();
  ok=await m.granted();can=m.canOpen();
  if(S().prefs.notify&&!ok)setPrefs({notify:false});   // 系统里把权限关了：开关跟着显示成没开
  // 刚装好第一次打开：像别的聊天 app 一样问一次要不要通知（只问这一次，之后在设置里自己开关）
  try{if(!localStorage.getItem('cx-shell-asked')){localStorage.setItem('cx-shell-asked','1');if(!S().prefs.notify){ok=await m.ask();if(ok)setPrefs({notify:true});}}}catch{/* */}
  m.backButton();
  m.onTap(x=>{if(x?.pid)location.hash=x.to==='mail'?'#/f/mail/'+x.pid:'#/c/'+x.pid;});
  let gone=0,here=0;
  const away=()=>{if(!shellOn())return;const t=Date.now();if(t-gone<1500)return;gone=t;here=0;void m.plan(ahead());setHold(true);};
  const back=()=>{const t=Date.now();if(t-here<1500)return;here=t;gone=0;setHold(false);void m.cancelPlan().then(()=>freed(Date.now()));void m.clearShown();};
  document.addEventListener('visibilitychange',()=>{if(document.hidden)away();else back();});
  addEventListener('pagehide',away);
  m.onState(active=>{if(active)back();else away();});
  if(document.hidden)away();else back();
}
/** 存一个文件到手机上。返回 false 表示不在壳里，照原来的办法下载 */
export function shellSave(name:string,data:string,base64=false):boolean{
  if(!isShell())return false;
  void shell().then(m=>m.saveFile(name,data,base64)).catch(()=>{/* 她取消了 */});
  return true;
}
