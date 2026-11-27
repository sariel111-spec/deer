// 安卓安装包（一个壳，里面装的还是这个网站）里才用到的原生能力。这个文件只在壳里才会被加载。
import {LocalNotifications} from '@capacitor/local-notifications';
import {App} from '@capacitor/app';
import {Directory,Encoding,Filesystem} from '@capacitor/filesystem';
import {Share} from '@capacitor/share';
import {Capacitor,registerPlugin} from '@capacitor/core';

// 安装包自己带的一个小插件（1.1 起）：打开系统里这个 app 的通知设置 / 应用设置。老的安装包没有，按钮就不出现
const Deer=registerPlugin<{openNotify():Promise<void>;openApp():Promise<void>}>('Deer');
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
    // 系统对「同一个号再发一次」只换字、不再弹也不再响。不是紧跟着的那种，先把旧的那条收掉，这一条才会重新弹出来
    if(!quiet)await LocalNotifications.removeDeliveredNotifications({notifications:[{id,title:'',body:''}]}).catch(()=>{});
    await LocalNotifications.schedule({notifications:[{id,title,body,extra,smallIcon:ICON,channelId:quiet?SOFT:MSG}]});
  }catch{/* 弹不出来也不影响聊天 */}
}
/** 人离开的时候：把接下来该到的话按时刻交给手机，到点由系统弹出来（小鹿被划掉也照样弹） */
const PLAN=910000000,WHO='cx-shell-plan';
export async function plan(items:{at:number;title:string;body:string;pid:string}[]){
  await cancelPlan();
  if(!items.length)return;
  const now=Date.now(),list=[...items].sort((a,b)=>a.at-b.at).slice(0,48),last:Record<string,number>={};
  try{localStorage.setItem(WHO,JSON.stringify(list.map(x=>x.pid)));}catch{/* */}
  try{await channels();await LocalNotifications.schedule({notifications:list.map((x,i)=>{
    const near=x.at-(last[x.pid]??-1e9)<20000;last[x.pid]=x.at;   // 他一次说几句：第一句弹出来，后面几句安静地跟上
    return {id:PLAN+i,title:x.title,body:x.body,extra:{pid:x.pid,to:/信$/.test(x.body)?'mail':undefined},smallIcon:ICON,channelId:near?SOFT:MSG,
      schedule:{at:new Date(Math.max(x.at,now+1500)),allowWhileIdle:true}};})});}catch{/* */}
}
/** 人回来了：还没到点的收回来 */
export async function cancelPlan(){
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
export function onTap(f:(extra:{pid?:string;to?:string})=>void){void LocalNotifications.addListener('localNotificationActionPerformed',e=>f((e.notification.extra??{}) as {pid?:string;to?:string}));}
/** 返回键：能往回就往回（开着的小页会先关），到头了就回桌面，不把小鹿关掉 */
export function backButton(){void App.addListener('backButton',({canGoBack})=>{if(canGoBack)history.back();else void App.minimizeApp();});}
/** 把一个文件交出去（存到「文件」、发给别人）：壳里的网页自己下载不了文件 */
export async function saveFile(name:string,data:string,base64=false){
  const r=await Filesystem.writeFile({path:name,data,directory:Directory.Cache,...(base64?{}:{encoding:Encoding.UTF8})});
  await Share.share({title:name,files:[r.uri]});
}
