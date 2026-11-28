// 安卓安装包（一个壳，里面装的还是这个网站）里才用到的原生能力。这个文件只在壳里才会被加载。
import {LocalNotifications} from '@capacitor/local-notifications';
import {App} from '@capacitor/app';
import {Directory,Encoding,Filesystem} from '@capacitor/filesystem';
import {Share} from '@capacitor/share';
import {Capacitor,registerPlugin} from '@capacitor/core';
import {err,slog} from './slog';

// 安装包自己带的一个小插件（1.1 起）：打开系统里这个 app 的通知设置 / 应用设置。老的安装包没有，按钮就不出现
/** 安装包自己报的情况（1.3 起才有后面几样）：v 版本号；maker 手机牌子；battery 系统的省电有没有放过小鹿；awake 现在是不是握着「别睡」的锁 */
export type Info={keep?:boolean;v?:number;maker?:string;sdk?:number;battery?:boolean;awake?:boolean};
const Deer=registerPlugin<{openNotify():Promise<void>;openApp():Promise<void>;info():Promise<Info>;keepOn(o:{title:string;text:string;awake?:number}):Promise<void>;keepOff():Promise<void>;askBattery():Promise<{how?:string}>;openLaunch():Promise<{how?:string}>;
  plan(o:{items:object[]}):Promise<{left?:number}>;unplan():Promise<void>;due():Promise<{shown?:number;left?:number}>;addListener(ev:'tap',f:(x:{pid?:string;to?:string})=>void):Promise<unknown>}>('Deer');
// 1.4 起：时间表交给安装包自己收着、自己到点弹（网页不在、小鹿被划掉也行）。问一次记住
let ver=-1;
const V=async()=>ver>=0?ver:(ver=(await info()).v??0);
export const info=async():Promise<Info>=>{try{return canOpen()?await Deer.info():{};}catch{return {};}};
/** 请系统别对小鹿省电（弹系统自己的那一张）；打开这台手机自己的「自启动 / 应用启动管理」（1.3 起） */
export const askBattery=async()=>{try{const r=await Deer.askBattery();slog('电池不限制：去问了（'+(r.how??'')+'）');}catch(e){slog('电池不限制出错 '+err(e));}};
export const openLaunch=async()=>{try{const r=await Deer.openLaunch();slog('自启动那一页：'+(r.how==='app'?'没找到，开了应用设置':'开了 '+(r.how??'')));return r.how??'';}catch(e){slog('自启动那一页出错 '+err(e));return '';}};
/** 他有话快到的这一阵别让手机睡（毫秒；0＝松开）。只在常驻开着时有用 */
export const stayAwake=async(ms:number)=>{try{await Deer.keepOn({title:'待机中',text:'他找你的时候会弹出来',awake:Math.max(0,Math.round(ms))});if(ms>0)slog(`不让手机睡 ${Math.round(ms/1000)} 秒`);}catch(e){slog('不让睡出错 '+err(e));}};
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
export async function plan(items:{at:number;title:string;body:string;pid:string;ring?:number;miss?:boolean}[]){
  await cancelPlan();
  planned=[];
  if(!items.length)return;
  const now=Date.now(),list=[...items].sort((a,b)=>a.at-b.at).slice(0,48),last:Record<string,number>={};
  try{localStorage.setItem(WHO,JSON.stringify(list.map(x=>x.pid)));}catch{/* */}
  if(await V()>=4){
    // 来电和它后面那条「未接」用同一个号：没接的话，「邀请你视频通话」原地换成「未接视频通话」
    const callNo:Record<string,number>={};
    const its=list.map((x,i)=>{
      const near=x.at-(last[x.pid]??-1e9)<20000;last[x.pid]=x.at;
      let id=PLAN+i;if(x.ring)callNo[x.pid]=id;else if(x.miss&&callNo[x.pid])id=callNo[x.pid];
      planned.push({id,pid:x.pid,body:x.body,soft:near});
      return {k:`${x.pid}|${Math.round(x.at)}|${i}`,id,at:Math.round(Math.max(x.at,now+800)),title:x.title,body:x.body,pid:x.pid,to:/信$/.test(x.body)?'mail':'',ch:x.ring?'cx-call':x.miss||near?SOFT:MSG,ring:x.ring??0};});
    try{await channels();const r=await Deer.plan({items:its});slog(`交给安装包 ${r.left??its.length} 条：${list.slice(0,4).map(x=>Math.round((x.at-now)/1000)+'秒后'+(x.ring?'（来电）':'')).join('、')}`);}
    catch(e){slog('交给安装包出错 '+err(e));}
    return;
  }
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
  if(await V()>=4){try{const r=await Deer.due();slog(`到点「${body.slice(0,4)}」：${r.shown?'页面醒着，叫安装包弹了':'安装包已经弹过'}`);}catch(e){slog('到点叫安装包出错 '+err(e));}return;}
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
  try{if(await V()>=4)await Deer.unplan();}catch{/* */}
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
export function onTap(f:(extra:{pid?:string;to?:string})=>void){void LocalNotifications.addListener('localNotificationActionPerformed',e=>f((e.notification.extra??{}) as {pid?:string;to?:string}));
  // 安装包自己弹的那些（1.4 起）点了走这边
  void V().then(v=>{if(v>=4)void Deer.addListener('tap',x=>f(x??{}));});}
/** 返回键：能往回就往回（开着的小页会先关），到头了就回桌面，不把小鹿关掉 */
export function backButton(){void App.addListener('backButton',({canGoBack})=>{if(canGoBack)history.back();else void App.minimizeApp();});}
/** 把一个文件交出去（存到「文件」、发给别人）：壳里的网页自己下载不了文件 */
export async function saveFile(name:string,data:string,base64=false){
  const r=await Filesystem.writeFile({path:name,data,directory:Directory.Cache,...(base64?{}:{encoding:Encoding.UTF8})});
  await Share.share({title:name,files:[r.uri]});
}
