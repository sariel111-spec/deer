// 安卓安装包（一个壳，里面装的还是这个网站）里才用到的原生能力。这个文件只在壳里才会被加载。
import {LocalNotifications} from '@capacitor/local-notifications';
import {App} from '@capacitor/app';
import {Directory,Encoding,Filesystem} from '@capacitor/filesystem';
import {Share} from '@capacitor/share';
import {Capacitor,registerPlugin} from '@capacitor/core';
import {err,slog} from './slog';

// 安装包自己带的一个小插件（1.1 起）：打开系统里这个 app 的通知设置 / 应用设置。老的安装包没有，按钮就不出现
const Deer=registerPlugin<{openNotify():Promise<void>;openApp():Promise<void>;info():Promise<{keep?:boolean}>;keepOn(o:{title:string;text:string}):Promise<void>;keepOff():Promise<void>}>('Deer');
/** 这个安装包会不会「后台常驻」（1.2 起） */
export const canKeep=async()=>{try{return canOpen()&&!!(await Deer.info()).keep;}catch{return false;}};
/** 后台常驻：通知栏挂一条不响的「待机中」，系统就不会把小鹿停掉，他的话到点由还醒着的页面当场弹 */
export const keep=async(on:boolean)=>{try{if(on)await Deer.keepOn({title:'待机中',text:'他找你的时候会弹出来'});else await Deer.keepOff();slog(on?'常驻：开':'常驻：关');}catch(e){slog('常驻出错 '+err(e));}};
export const canOpen=()=>{try{return Capacitor.isPluginAvailable('Deer');}catch{return false;}};
export const openNotify=()=>Deer.openNotify().catch(()=>{});
export const openApp=()=>Deer.openApp().catch(()=>{});
/** 切到后台 / 回到前台（系统告诉壳的，比网页自己的 visibilitychange 多一道保险） */
export function onState(f:(active:boolean)=>void){void App.addListener('appStateChange',s=>f(s.isActive));}

const ICON='ic_stat_deer';
// 两条通道：他的消息（会弹出来、会响）；紧跟着的下一句（只换字，不再弹、不再响）
const MSG='cx-msg',SOFT='cx-soft';
let made:Promise<void>|null=null;
const channels=()=>made??=(async()=>{try{
  await LocalNotifications.createChannel({id:MSG,name:'他的消息',description:'他找你的时候',importance:4,vibration:true});
  await LocalNotifications.createChannel({id:SOFT,name:'接着说的话',description:'他一次说了几句时，后面的几句不再响',importance:2,vibration:false});
}catch{/* 老系统没有通道，用默认的 */}})();
// 同一位的通知用同一个号：新的一句把上一句换掉，不会越堆越多
const idOf=(key:string)=>{let h=7;for(let i=0;i<key.length;i++)h=(h*31+key.charCodeAt(i))%700000000;return 100000000+h;};
export const granted=async()=>{try{return (await LocalNotifications.checkPermissions()).display==='granted';}catch{return false;}};
export const ask=async()=>{try{return (await LocalNotifications.requestPermissions()).display==='granted';}catch{return false;}};
/** 现在就弹一条。quiet：紧跟着上一句来的，只把字换成新的 */
export async function show(title:string,body:string,extra:object,key:string,quiet=false){
  const id=idOf(key);
  try{
    await channels();
    if(!quiet)await LocalNotifications.removeDeliveredNotifications({notifications:[{id,title:'',body:''}]}).catch(()=>{});
    await LocalNotifications.schedule({notifications:[{id,title,body,extra,smallIcon:ICON,channelId:quiet?SOFT:MSG}]});
    slog(`当场弹「${body.slice(0,4)}」${quiet?'（安静）':''}${document.hidden?' 人不在':''}`);
  }catch(e){slog('当场弹出错 '+err(e));}
}
/** 人离开的时候：把接下来该到的话按时刻交给手机的闹钟，到点由系统弹出来（小鹿被划掉也照样弹）。
 *  小鹿在后台还醒着的话，到点由页面自己当场弹（fire），闹钟晚三秒、只当兜底 */
const PLAN=910000000,WHO='cx-shell-plan',LAG=3000;
type Planned={id:number;pid:string;body:string;soft:boolean;done?:boolean};
let planned:Planned[]=[];
export async function plan(items:{at:number;title:string;body:string;pid:string}[]){
  await cancelPlan();
  planned=[];
  if(!items.length)return;
  const now=Date.now(),list=[...items].sort((a,b)=>a.at-b.at).slice(0,48),last:Record<string,number>={};
  try{localStorage.setItem(WHO,JSON.stringify(list.map(x=>x.pid)));}catch{/* */}
  const ns=list.map((x,i)=>{
    const near=x.at-(last[x.pid]??-1e9)<20000;last[x.pid]=x.at;   // 他一次说几句：第一句弹出来，后面几句安静地跟上
    planned.push({id:PLAN+i,pid:x.pid,body:x.body,soft:near});
    return {id:PLAN+i,title:x.title,body:x.body,extra:{pid:x.pid,to:/信$/.test(x.body)?'mail':undefined},smallIcon:ICON,channelId:near?SOFT:MSG,
      schedule:{at:new Date(Math.max(x.at+LAG,now+1500)),allowWhileIdle:true}};});
  try{
    await channels();await LocalNotifications.schedule({notifications:ns});
    let exact='';try{exact=(await LocalNotifications.checkExactNotificationSetting()).exact_alarm;}catch{/* */}
    slog(`交给闹钟 ${ns.length} 条：${list.slice(0,4).map(x=>Math.round((x.at-now)/1000)+'秒后').join('、')}${exact?' 准点='+exact:''}`);
  }catch(e){slog('交给闹钟出错 '+err(e));}
}
/** 人不在、但页面还醒着，这句话到点了：当场弹。交给过闹钟的那一句用同一个号（顺手把那个闹钟撤掉）；闹钟已经替它弹过了就不再弹 */
export async function fire(pid:string,title:string,body:string,extra:object,key:string,quiet=false){
  const x=planned.find(p=>!p.done&&p.pid===pid&&p.body===body);
  if(!x){await show(title,body,extra,key,quiet);return;}
  x.done=true;
  try{
    const pend=await LocalNotifications.getPending();
    if(!pend.notifications.some(n=>n.id===x.id)){slog(`到点「${body.slice(0,4)}」：闹钟已经弹过`);return;}
    await channels();
    await LocalNotifications.schedule({notifications:[{id:x.id,title,body,extra,smallIcon:ICON,channelId:quiet||x.soft?SOFT:MSG}]});
    slog(`到点「${body.slice(0,4)}」：页面醒着，自己弹了`);
  }catch(e){slog('到点自己弹出错 '+err(e));}
}
/** 人回来了：还没到点的收回来 */
export async function cancelPlan(){
  planned=[];
  try{const p=await LocalNotifications.getPending(),mine=p.notifications.filter(x=>x.id>=PLAN&&x.id<PLAN+1000);if(mine.length)await LocalNotifications.cancel({notifications:mine.map(x=>({id:x.id}))});}catch{/* */}
}
/** 已经弹出来的收掉（给了 pid 就只收这一位的） */
export async function clearShown(pid?:string){
  try{
    if(!pid){await LocalNotifications.removeAllDeliveredNotifications();return;}
    let who:string[]=[];try{who=JSON.parse(localStorage.getItem(WHO)??'[]') as string[];}catch{/* */}
    const ids=new Set([idOf('cx-'+pid),idOf('cx-tip-'+pid),...who.map((x,i)=>x===pid?PLAN+i:-1)]);
    const d=await LocalNotifications.getDeliveredNotifications(),mine=d.notifications.filter(n=>ids.has(n.id));
    if(mine.length)await LocalNotifications.removeDeliveredNotifications({notifications:mine});
  }catch{/* */}
}
/** 点通知：回到那一位的聊天 / 信箱 */
/** 闹钟到点弹出来时（页面还醒着才收得到）记一笔 */
export function onAlarm(){void LocalNotifications.addListener('localNotificationReceived',n=>slog(`闹钟弹了「${String(n.body??'').slice(0,4)}」`));}
export function onTap(f:(extra:{pid?:string;to?:string})=>void){void LocalNotifications.addListener('localNotificationActionPerformed',e=>f((e.notification.extra??{}) as {pid?:string;to?:string}));}
/** 返回键：能往回就往回（开着的小页会先关），到头了就回桌面，不把小鹿关掉 */
export function backButton(){void App.addListener('backButton',({canGoBack})=>{if(canGoBack)history.back();else void App.minimizeApp();});}
/** 把一个文件交出去（存到「文件」、发给别人）：壳里的网页自己下载不了文件 */
export async function saveFile(name:string,data:string,base64=false){
  const r=await Filesystem.writeFile({path:name,data,directory:Directory.Cache,...(base64?{}:{encoding:Encoding.UTF8})});
  await Share.share({title:name,files:[r.uri]});
}
