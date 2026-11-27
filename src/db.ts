import {useSyncExternalStore} from 'react';

/* ───────── 数据的形状 ───────── */

export type When='all'|'morning'|'noon'|'evening'|'night';
export type Use='both'|'reply'|'pro';
export const whens:{id:When;name:string;from:number;to:number}[]=[
  {id:'all',name:'全天',from:0,to:24},{id:'morning',name:'早上',from:5,to:11},{id:'noon',name:'中午',from:11,to:14},
  {id:'evening',name:'晚上',from:18,to:23},{id:'night',name:'深夜',from:23,to:5},
];
export const uses:{id:Use;name:string}[]=[{id:'both',name:'回复和主动都用'},{id:'reply',name:'只在回复时用'},{id:'pro',name:'只在他主动找我时用'}];

export type Card={id:string;t:string;off?:boolean};
// 一个字卡分组。分组是公用的：哪几位在用，记在每个人自己的 decks 里
export type Deck={id:string;name:string;when:When;use:Use;cards:Card[];created:number;updated:number;only?:string[]};   // only：这个分组只属于这几个名字的人，新加的人不会自动用上
export type Persona={
  id:string;name:string;bio:string;avatar?:string;accent:string;wall?:string;photo?:string;homeBg?:string;callPic?:string;since:string;decks:string[];
  min:number;max:number;burst:number;ghost:number;join:boolean;joinMax:number;   // 回复：最快/最慢（秒）、一次最多几条、已读不回的概率、是否拼接
  pro:boolean;proMin:number;proMax:number;quietFrom:number;quietTo:number;stick?:boolean;calls?:boolean;        // 主动：间隔（分钟）、他睡觉的钟点；stick：他也会发表情包；calls：他也会打视频过来
  nextAt:number;replyAt:number;readAt:number;created:number;updated:number;
  fu?:Record<string,number>;   // 每一项是什么时候改的。同步时各项各听各的后改——在手机上换了头像，不会因为电脑上之后改了别的就被换回去
};
export type Msg={id:string;pid:string;from:'me'|'ta';kind:'text'|'img'|'tip';text:string;at:number;re?:string;like?:boolean;seen?:number;fav?:boolean;src?:string;u?:number;react?:string;st?:boolean;ck?:boolean};   // react：贴在这条上的表情；st：这是一张表情包；ck：这是一条报备（聊天里显示成小卡）
export type Prefs={theme:'auto'|'light'|'dark';bubble:'ins'|'mono'|'accent'|'line';v?:number;myName:string;myAvatar?:string;last:string;audio:boolean;notify:boolean;sound:boolean;at?:number;
  mode?:'pip'|'loop'|'osc'|'both';pipAuto?:boolean;awake?:boolean;cloud?:string;   // 保活方式、画中画自动进入、屏幕常亮（都只管这台设备）；cloud：云端推送服务的地址（跟着同步走）
  plan?:Plan[];quick?:string[];dayAt?:number;hl?:string[];hlOrd?:boolean;hlPic?:Record<string,string>};   // hl：主页那一排放哪几个功能（和 plan / quick 一起按 dayAt 同步）
// plan：我每周固定的日程；quick：报备的常用短语（没改过就是默认那几句）；dayAt：这两样最后一次改的时刻（同步用）
/** 一条固定的日程：周几（0 是周日）、几点到几点 */
export type Plan={id:string;name:string;days:number[];from:string;to:string};
export type Pack={id:string;name:string;ids:string[];his?:boolean;who?:string[];use?:'tarot';created:number;updated:number};   // 一组表情包；ids 里是本机图片或图片链接；his=false 表示他不发这一组；who：只给这几位用（不写就是所有人）
export type State={personas:Persona[];decks:Deck[];prefs:Prefs;dead?:Record<string,number>;stickers?:string[];packs?:Pack[]};   // dead：删掉的人和分组，同步时别的设备也跟着删
export type Grave={dead:string[];cleared:number};   // 一位的聊天里删掉的消息、清空的时刻
// 每一位各自的小功能数据，单独存一份（x:<pid>），不和聊天记录混在一起
// 一封信。re：回的是哪一封；我寄出的信上带着 due（他的回信几点到）、plan（回信写的什么，寄出时就定好，这样每台设备收到的是同一封）、got（回信到了）；
// star 收藏；kept 写了没寄；pro 他主动写来的；ai 解读
export type Letter={id:string;from:'me'|'ta';text:string;at:number;read?:boolean;re?:string;due?:number;plan?:string;got?:boolean;star?:boolean;kept?:boolean;pro?:boolean;ai?:string;u?:number;img?:string;planImg?:string};   // u：这封信上次被改动的时刻（收藏、解读），同步时同一封听后改的那边；img：夹在信里的照片；planImg：他回信时会夹的那张（寄出时就定好）
export type Diary={id:string;at:number;text:string;mood:string;note?:string};
export type Day={id:string;name:string;date:string;yearly:boolean};
export type Post={id:string;text:string;img?:string;at:number;liked?:boolean;cmt?:string};
// 一次塔罗：kind 是牌阵，cards 是抽到的牌（c 第几张、r 逆位），said 是他当时说的那句，note 是你写的感想
// ok：「对一对」牌阵里你觉得对不对得上
export type Reading={id:string;at:number;kind:'day'|'one'|'heart'|'time'|'link'|'match';date?:string;q?:string;cards:{c:number;r?:boolean}[];said?:string;note?:string;sent?:boolean;ok?:boolean;jump?:{c:number;r?:boolean};ai?:string};   // jump：洗牌时跳出来的那张；ai：AI 解出来的话
export type Box={letters:Letter[];mailDue:number;diary:Diary[];days:Day[];lines:{date:string;text:string;like?:boolean;u?:number;at?:number}[];lineSeen?:string;answers:Record<string,string>;
  draw?:{date:string;luck:string;text:string;i:number};checks:{at:number;text:string;id?:string;plan?:string}[];ckDecks?:string[];listen:number;   // checks.id：聊天里那条消息；checks.plan：这条报的是哪天的哪条日程；ckDecks：他哪几组字卡算报备
  focus:{n:number;min:number};
  cycle:{starts:string[];len:number;gap:number;ends?:Record<string,string>;decks?:string[];soon?:string[];remind?:boolean};posts:Post[];at?:number;fu?:Record<string,number>;   // fu：每一项设置是什么时候改的（同步时各项各听各的后改）
  
  call?:{at:number};ring?:{at:number};
  mailGone?:string[];mailPace?:number;mailLen?:number;mailPro?:number;mailNext?:{at:number;text:string;img?:string};mailPics?:string[];mailCall?:string;mailSign?:string;   // mailCall：他在信里怎么称呼你；mailSign：他的落款
    // 信箱：删掉的信（同步时别的设备也跟着删）、回信多快、多长、他会不会主动写信、下一封主动的信
  tarot?:Reading[];tarotRev?:boolean;tarotGone?:string[];tarotMine?:Record<string,string>;tarotAbout?:string;tarotSign?:number[]};   // tarotGone：删掉的那几次（同步时别的设备也跟着删）；tarotMine：你们自己磨合出来的牌意（第几张牌 → 你写的话）   // tarot：塔罗的记录；tarotRev=false 表示只抽正位   // call：视频通话从什么时候开始（一直到你挂断）；ring：他正打过来
export const blankBox=():Box=>({letters:[],mailDue:0,diary:[],days:[],lines:[],answers:{},checks:[],listen:0,focus:{n:0,min:0},cycle:{starts:[],len:5,gap:28},posts:[]});

export const accents=['#8A6A52','#000000','#3D6BE0','#D4526E','#5B8C6A','#8B6FD1','#E08A3C'];
const APP='cx-site';

/* ───────── 存到本机 ───────── */

/* iPhone 把页面放到后台再回来，和本机数据库的连接有时会断：之后的读写要么报错、要么一直不回话。
   所以这里每一次读写都盯着：事务真正落盘才算成功；出错或者几秒没动静，就丢掉旧连接重新连上再来。
   写不进去的不会被悄悄吞掉——记下来接着重试，同时在 localStorage 里留一份救急的，下次打开先用它。 */
let dbp:Promise<IDBDatabase>|null=null;
const nap=(ms:number)=>new Promise<void>(r=>setTimeout(r,ms));
const hp={at:0,fails:0,reopened:0,down:false};
const open=()=>{
  if(dbp)return dbp;
  const mine:Promise<IDBDatabase>=new Promise<IDBDatabase>((ok,no)=>{
    const t=setTimeout(()=>no(new Error('open timeout')),4000);
    let r:IDBOpenDBRequest;
    try{r=indexedDB.open('cx-site',1);}catch(e){clearTimeout(t);no(e);return;}
    r.onupgradeneeded=()=>r.result.createObjectStore('kv');
    r.onsuccess=()=>{
      clearTimeout(t);const d=r.result;
      // 连接被系统掐掉、或者别处要升级：这条连接作废，下次读写重新连
      d.onclose=()=>{if(dbp===mine)dbp=null;};
      d.onversionchange=()=>{try{d.close();}catch{/* */}if(dbp===mine)dbp=null;};
      ok(d);
    };
    r.onerror=()=>{clearTimeout(t);no(r.error);};
  });
  dbp=mine;
  mine.catch(()=>{if(dbp===mine)dbp=null;});
  return mine;
};
const once=async<T>(mode:IDBTransactionMode,fn:(s:IDBObjectStore)=>IDBRequest):Promise<T>=>{
  const using=dbp??open(),d=await using;
  return new Promise<T>((ok,no)=>{
    let out:T,done=false;
    const fail=(e:unknown)=>{if(done)return;done=true;clearTimeout(t);if(dbp===using){dbp=null;hp.reopened++;try{d.close();}catch{/* */}}no(e);};
    const t=setTimeout(()=>fail(new Error('idb timeout')),4000);
    try{
      const tr=d.transaction('kv',mode),q=fn(tr.objectStore('kv'));
      q.onsuccess=()=>{out=q.result as T;};
      tr.oncomplete=()=>{if(done)return;done=true;clearTimeout(t);ok(out);};
      tr.onabort=()=>fail(tr.error??q.error??new Error('idb abort'));
      tr.onerror=()=>fail(tr.error??q.error??new Error('idb error'));
    }catch(e){fail(e);}
  });
};
const tx=async<T>(mode:IDBTransactionMode,fn:(s:IDBObjectStore)=>IDBRequest,tries=3):Promise<T>=>{
  let err:unknown;
  for(let i=0;i<tries;i++){
    try{const v=await once<T>(mode,fn);if(mode==='readwrite'){hp.at=Date.now();hp.down=false;}return v;}
    catch(e){err=e;hp.fails++;if(i<tries-1)await nap(150*(i+1));}
  }
  throw err;
};
/** 读一项。读不出来会抛错——「没有这一项」和「这次没读出来」是两回事，不能混 */
export const readKey=<T,>(k:string)=>tx<T|undefined>('readonly',s=>s.get(k));
/** 读一项，读不出来当作没有（只给丢了也能重新拿到的东西用，比如图片） */
export const getKey=<T,>(k:string)=>readKey<T>(k).catch(()=>undefined);
/** 写一项。返回有没有真的写进去 */
export const setKey=(k:string,v:unknown)=>tx('readwrite',s=>s.put(v,k)).then(()=>true,()=>false);
export const delKey=(k:string)=>tx('readwrite',s=>s.delete(k)).then(()=>true,()=>false);
const allKeys=()=>tx<IDBValidKey[]>('readonly',s=>s.getAllKeys()).catch(()=>[] as IDBValidKey[]);
/** 本机存储现在好不好（设置里能看到） */
export const storage=()=>({...hp,waiting:pend.size});

export const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,7);
const blank=():State=>({personas:[],decks:[],prefs:{theme:'auto',bubble:'ins',v:2,myName:'我',last:'',audio:false,notify:false,sound:false}});
let state:State=blank();
const msgs=new Map<string,Msg[]>();
const boxes=new Map<string,Box>();
const graves=new Map<string,Grave>();
export const grave=(pid:string):Grave=>graves.get(pid)??{dead:[],cleared:0};
let ver=0;
const subs=new Set<()=>void>();
const emit=()=>{ver++;subs.forEach(f=>f());};
const sub=(f:()=>void)=>{subs.add(f);return()=>{subs.delete(f);};};
export const useVer=()=>useSyncExternalStore(sub,()=>ver);
export const poke=emit;
export const S=()=>state;
export const list=(pid:string)=>msgs.get(pid)??[];
export const who=(pid:string)=>state.personas.find(p=>p.id===pid);
const pics=new Map<string,string>();
const empty=blankBox();
export const box=(pid:string):Box=>boxes.get(pid)??empty;

const bc=typeof BroadcastChannel==='function'?new BroadcastChannel('cx-site'):null;
let saveT=0;
let rev=0;const hooks=new Set<()=>void>();
const touch=()=>{rev++;hooks.forEach(f=>f());};
export const onChange=(f:()=>void)=>{hooks.add(f);return()=>{hooks.delete(f);};};

/* ── 只管这台设备的设置（保活、通知、声音、明暗、云端地址…）另外在 localStorage 里留一份。
   它是同步写的，最不容易丢；打开时以它为准。这样哪怕大的那份数据没存上，你关掉的开关也不会自己回来 ── */
const DEV='cx-dev';
const devKeys=['theme','audio','notify','sound','mode','pipAuto','awake','v','cloud','last'] as const;
let devText='';
const ls={get:(k:string)=>{try{return localStorage.getItem(k);}catch{return null;}},set:(k:string,v:string)=>{try{localStorage.setItem(k,v);return true;}catch{return false;}},del:(k:string)=>{try{localStorage.removeItem(k);}catch{/* */}}};
function mirror(){
  if(!ready)return;
  const o:Record<string,unknown>={};for(const k of devKeys)if(state.prefs[k]!==undefined)o[k]=state.prefs[k];
  const t=JSON.stringify(o);if(t!==devText){devText=t;ls.set(DEV,t);}
}
const withDev=(pf:Prefs):Prefs=>{
  try{const o=JSON.parse(ls.get(DEV)??'null') as Partial<Prefs>|null;if(o&&typeof o==='object'){const out={...pf} as Record<string,unknown>;for(const k of devKeys)if(k in o)out[k]=o[k];return out as unknown as Prefs;}}catch{/* 坏了就不用它 */}
  return pf;
};

/* ── 存盘 ── */
const pend=new Set<string>();   // 还没写进去的
let retryT=0,broken=false,ready=false;   // ready：本机的数据已经完整读进来了。在这之前内存里是空的，绝不能往任何地方写
/** 打开时本机的数据没读出来：这时候什么都不往回写，免得把好的数据盖掉 */
export const storageDown=()=>broken;
const valueOf=(k:string):unknown=>k==='state'?state:k.startsWith('m:')?msgs.get(k.slice(2)):k.startsWith('x:')?boxes.get(k.slice(2)):k.startsWith('d:')?graves.get(k.slice(2)):undefined;
const RESCUE='cx-rescue:';
async function persist(k:string,tell=true):Promise<boolean>{
  if(broken||!ready)return false;
  const v=valueOf(k);
  if(v===undefined){pend.delete(k);ls.del(RESCUE+k);return true;}
  const ok=await tx('readwrite',s=>s.put(v,k),2).then(()=>true,()=>false);
  if(ok){
    // 期间又改过的话，后面那次写会再来一遍；这里只在内容没再变时才算清账
    if(valueOf(k)===v){pend.delete(k);ls.del(RESCUE+k);}
    if(tell&&(k==='state'||k.startsWith('m:')||k.startsWith('x:')))bc?.postMessage(k);
    if(!pend.size&&hp.down){hp.down=false;emit();}
    return true;
  }
  // 没写进去：记着重试，并在 localStorage 里留一份救急的（下次打开先用它）
  pend.add(k);
  try{ls.set(RESCUE+k,JSON.stringify({t:Date.now(),v:valueOf(k)}));}catch{/* 太大放不下就只靠重试 */}
  if(!hp.down){hp.down=true;emit();}
  retry(1500);
  return false;
}
function retry(ms:number){
  if(retryT)return;
  retryT=window.setTimeout(async()=>{retryT=0;for(const k of [...pend])await persist(k);if(pend.size)retry(4000);},ms);
}
// 存盘：第一下改动立刻写，紧跟着的一连串改动合成一次再写（刚做完一件事就刷新、被系统收走，也不会丢）
let dirty=false;
const write=()=>{mirror();void persist('state');};
const flush=()=>{if(!saveT)return;clearTimeout(saveT);saveT=0;if(dirty){dirty=false;write();}};
const save=()=>{touch();emit();mirror();if(saveT){dirty=true;return;}write();saveT=window.setTimeout(flush,120);};
// 页面要被收走（切到后台、关掉、刷新）的那一下，把还没落盘的改动立刻写下去
if(typeof document!=='undefined'){
  addEventListener('pagehide',flush);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)flush();else void wakeStore();});
  addEventListener('pageshow',()=>{void wakeStore();});
}
// 回到前台：先摸一下数据库还通不通。不通就重连；重连也不行，说明这一页的连接彻底坏了——
// 没存上的那些已经留在 localStorage 里，刷新一次页面就能恢复，所以直接刷新
let waking=false;
async function wakeStore(){
  if(waking||broken||!ready)return;waking=true;
  try{
    const alive=await tx('readonly',s=>s.count(),2).then(()=>true,()=>false);
    if(alive){if(pend.size){clearTimeout(retryT);retryT=0;retry(0);}return;}
    let last=0;try{last=+(sessionStorage.getItem('cx-store-reload')??0);}catch{/* */}
    if(Date.now()-last>60000&&!document.hidden){
      try{sessionStorage.setItem('cx-store-reload',String(Date.now()));}catch{/* */}
      for(const k of ['state',...pend])try{const v=valueOf(k);if(v!==undefined)ls.set(RESCUE+k,JSON.stringify({t:Date.now(),v}));}catch{/* */}
      location.reload();
    }
  }finally{waking=false;}
}
const saveMsgs=(pid:string)=>{touch();emit();void persist('m:'+pid);};
/** quiet：自动发生的事（每天记一句、信到了、他打来）不算「这台设备改过」，不动 at——
 *  同步时小功能整份听 at 晚的那边，自动写的东西要是也抢这个「晚」，会把另一台设备上真正改过的东西盖掉 */
export const setBox=(pid:string,patch:Partial<Box>,quiet=false)=>{const old=boxes.get(pid),now=Date.now(),b={...blankBox(),...old,...patch,at:quiet?(old?.at||1):now,...(quiet?{}:{fu:{...old?.fu,...Object.fromEntries(Object.keys(patch).map(k=>[k,now]))}})};boxes.set(pid,b);touch();emit();void persist('x:'+pid);};
const bury=(pid:string,g:Grave)=>{graves.set(pid,g);void persist('d:'+pid,false);};

const tidyUp=(st:State):State=>st.stickers?.length?{...st,stickers:[],packs:[...(st.packs??[]),{id:uid(),name:'默认',ids:st.stickers,created:Date.now(),updated:Date.now()}]}:st;
// 上次没写进数据库、留在 localStorage 里救急的那几份：它们比数据库里的新
function rescued<T>(k:string):T|undefined{
  try{const j=JSON.parse(ls.get(RESCUE+k)??'null') as {t:number;v:T}|null;return j&&typeof j==='object'&&'v' in j?j.v:undefined;}catch{return undefined;}
}
const shape=(s:State):State=>({...blank(),...s,prefs:{...blank().prefs,...s.prefs}});
async function load(){
  const saved=rescued<State>('state')??await readKey<State>('state');
  let st=saved&&Array.isArray(saved.personas)?shape(saved):blank();
  if(saved&&!saved.prefs?.v)st.prefs={...st.prefs,bubble:'ins',v:2};
  st={...st,prefs:withDev(st.prefs)};
  // 这一版起：后台保活那一组（保活、画中画自动开启、屏幕常亮）统一回到关着的状态，只有你自己去设置里打开才算开
  if((st.prefs.v??0)<3)st.prefs={...st.prefs,audio:false,pipAuto:false,awake:false,v:3};
  st=tidyUp(st);
  const m=new Map<string,Msg[]>(),x=new Map<string,Box>(),g=new Map<string,Grave>();
  for(const p of st.personas){
    m.set(p.id,rescued<Msg[]>('m:'+p.id)??(await readKey<Msg[]>('m:'+p.id))??[]);
    x.set(p.id,{...blankBox(),...(rescued<Box>('x:'+p.id)??await readKey<Box>('x:'+p.id))});
    const gr=rescued<Grave>('d:'+p.id)??await readKey<Grave>('d:'+p.id);if(gr)g.set(p.id,gr);
  }
  // 全部读齐了才换上去：读到一半失败的话，内存里原来的东西一点不动
  state=st;msgs.clear();boxes.clear();graves.clear();
  m.forEach((v,k)=>msgs.set(k,v));x.forEach((v,k)=>boxes.set(k,v));g.forEach((v,k)=>graves.set(k,v));
}
export async function boot(){
  try{await load();}
  catch{
    // 没读出来：先不显示、不写入，隔一会儿再读；读出来了就刷新一次，从干净的状态开始
    broken=true;
    const again=async()=>{try{await readKey('state');location.reload();}catch{setTimeout(()=>{void again();},2500);}};
    setTimeout(()=>{void again();},1500);
    emit();return;
  }
  ready=true;
  mirror();
  // 把救急的那几份、还有上面改过的设置写回数据库
  void persist('state',false);
  try{for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k?.startsWith(RESCUE)&&k!==RESCUE+'state')void persist(k.slice(RESCUE.length),false);}}catch{/* */}
  // 别的标签页改了东西，这边跟着读。读不出来就保持原样，绝不拿空的顶上
  if(bc)bc.onmessage=async e=>{
    if(broken||typeof e.data!=='string')return;
    try{
      if(e.data==='state'){const n=await readKey<State>('state');if(n&&Array.isArray(n.personas)&&!pend.has('state')){state={...shape(n),prefs:withDev(shape(n).prefs)};emit();}}
      else if(e.data.startsWith('m:')){const n=await readKey<Msg[]>(e.data);if(n&&!pend.has(e.data)){msgs.set(e.data.slice(2),n);emit();}}
      else if(e.data.startsWith('x:')){const n=await readKey<Box>(e.data);if(n&&!pend.has(e.data)){boxes.set(e.data.slice(2),{...blankBox(),...n});emit();}}
    }catch{/* 这次没读到，下次再说 */}
  };
  addEventListener('pagehide',()=>{mirror();void persist('state');});
  void navigator.storage?.persist?.();
  emit();
}
export async function reload(){
  if(broken)return;
  try{await load();}catch{/* 没读出来就保持原样 */}
  emit();
}

/* ───────── 改东西 ───────── */

export const setPrefs=(p:Partial<Prefs>)=>{state={...state,prefs:{...state.prefs,...p,...('myName' in p||'myAvatar' in p||'bubble' in p||'cloud' in p?{at:Date.now()}:{}),...('plan' in p||'quick' in p||'hl' in p||'hlPic' in p?{dayAt:Date.now()}:{})}};save();};
export function addPersona(name:string):Persona{
  const now=Date.now();
  const p:Persona={id:uid(),name,bio:'',accent:accents[0],since:'',decks:state.decks.filter(d=>!d.only?.length||d.only.includes(name)).map(d=>d.id),
    min:3,max:12,burst:2,ghost:.06,join:false,joinMax:2,pro:true,proMin:40,proMax:180,quietFrom:1,quietTo:8,
    nextAt:0,replyAt:0,readAt:now,created:now,updated:now};
  state={...state,personas:[...state.personas,p],prefs:{...state.prefs,last:p.id}};msgs.set(p.id,[]);save();return p;
}
/** quiet：自动发生的事（读到哪儿、他下一次什么时候开口、等着回的那一句）不算「你改过这个人」，不动 updated，也不记 fu */
export const setPersona=(id:string,patch:Partial<Persona>,quiet=false)=>{
  const now=Date.now(),mark=Object.fromEntries(Object.keys(patch).map(k=>[k,now]));
  state={...state,personas:state.personas.map(p=>p.id===id?(quiet?{...p,...patch}:{...p,...patch,updated:now,fu:{...p.fu,...mark}}):p)};save();
};
const deckTouch=(p:Persona,decks:string[]):Persona=>{const now=Date.now();return {...p,decks,updated:now,fu:{...p.fu,decks:now}};};
export function dropPersona(id:string){
  state={...state,personas:state.personas.filter(p=>p.id!==id),prefs:{...state.prefs,last:state.prefs.last===id?'':state.prefs.last},dead:{...state.dead,[id]:Date.now()}};
  msgs.delete(id);boxes.delete(id);graves.delete(id);void delKey('m:'+id);void delKey('x:'+id);void delKey('d:'+id);save();
}
export function addDeck(name:string):Deck{
  const now=Date.now();
  const d:Deck={id:uid(),name,when:'all',use:'both',cards:[],created:now,updated:now};
  // 新分组默认所有人公用，之后可以在分组里改成只给某几位
  state={...state,decks:[...state.decks,d],personas:state.personas.map(p=>deckTouch(p,[...p.decks,d.id]))};save();return d;
}
export const setDeck=(id:string,patch:Partial<Deck>)=>{state={...state,decks:state.decks.map(d=>d.id===id?{...d,...patch,updated:Date.now()}:d)};save();};
export function dropDeck(id:string){
  state={...state,decks:state.decks.filter(d=>d.id!==id),personas:state.personas.map(p=>({...p,decks:p.decks.filter(x=>x!==id)})),dead:{...state.dead,[id]:Date.now()}};save();
}
export const addPack=(name:string,who?:string[]):Pack=>{const now=Date.now(),k:Pack={id:uid(),name:name.trim()||'表情包',ids:[],...(who?{who}:{}),created:now,updated:now};state={...state,packs:[...(state.packs??[]),k]};save();return k;};
export const setPack=(id:string,patch:Partial<Pack>)=>{state={...state,packs:(state.packs??[]).map(k=>k.id===id?{...k,...patch,updated:Date.now()}:k)};save();};
export const packsFor=(pid:string)=>(state.packs??[]).filter(k=>!k.who||k.who.includes(pid));
export const dropPack=(id:string)=>{state={...state,packs:(state.packs??[]).filter(k=>k.id!==id),dead:{...state.dead,[id]:Date.now()}};save();};
export const shareDeck=(deckId:string,pid:string,on:boolean)=>{
  const p=who(pid);if(!p)return;
  setPersona(pid,{decks:on?[...new Set([...p.decks,deckId])]:p.decks.filter(x=>x!==deckId)});
};
// 一行一句地加，重复的不要
export function addCards(deckId:string,text:string):{added:number;dup:number}{
  const d=state.decks.find(x=>x.id===deckId);if(!d)return {added:0,dup:0};
  const have=new Set(d.cards.map(c=>c.t));
  const lines=text.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  const fresh:Card[]=[];let dup=0;
  for(const t of lines){if(have.has(t)){dup++;continue;}have.add(t);fresh.push({id:uid(),t});}
  if(fresh.length)setDeck(deckId,{cards:[...d.cards,...fresh]});
  return {added:fresh.length,dup};
}
export const setCard=(deckId:string,cardId:string,patch:Partial<Card>|null)=>{
  const d=state.decks.find(x=>x.id===deckId);if(!d)return;
  setDeck(deckId,{cards:patch?d.cards.map(c=>c.id===cardId?{...c,...patch}:c):d.cards.filter(c=>c.id!==cardId)});
};
// 读别处导出的字卡：纯文本一行一句，或各种 JSON（数组、{cards:[]}、{分组名:[…]}）
export function readCards(text:string):{name:string;lines:string[]}[]{
  const lines=(v:unknown):string[]=>Array.isArray(v)?v.map(x=>typeof x==='string'?x:x&&typeof x==='object'?String((x as Record<string,unknown>).t??(x as Record<string,unknown>).text??(x as Record<string,unknown>).content??''):'').map(x=>x.trim()).filter(Boolean):[];
  try{
    const j=JSON.parse(text);
    if(Array.isArray(j)){
      if(j.length&&typeof j[0]==='object'&&j[0]&&Array.isArray((j[0] as Record<string,unknown>).cards))
        return (j as Record<string,unknown>[]).map(g=>({name:String(g.name??'导入的分组'),lines:lines(g.cards)})).filter(g=>g.lines.length);
      return [{name:'导入的分组',lines:lines(j)}];
    }
    if(j&&typeof j==='object'){
      const o=j as Record<string,unknown>;
      if(Array.isArray(o.decks))return (o.decks as Record<string,unknown>[]).map(g=>({name:String(g.name??'导入的分组'),lines:lines(g.cards)})).filter(g=>g.lines.length);
      if(Array.isArray(o.cards))return [{name:String(o.name??'导入的分组'),lines:lines(o.cards)}];
      const groups=Object.entries(o).filter(([,v])=>Array.isArray(v)).map(([k,v])=>({name:k,lines:lines(v)})).filter(g=>g.lines.length);
      if(groups.length)return groups;
    }
  }catch{/* 不是 JSON 就当纯文本 */}
  const ls=text.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  return ls.length?[{name:'导入的分组',lines:ls}]:[];
}

// 一次搬进好几个分组：同名的分组并进去（重复的不要），没有的新建；only 里写了名字的，只给同名的人用
export function importDecks(groups:{name:string;cards:string[];only?:string[]}[]):{decks:number;added:number}{
  let added=0,n=0;
  for(const g of groups){
    const name=String(g.name??'').trim(),cards=(g.cards??[]).map(x=>String(x).trim()).filter(Boolean);
    if(!name||!cards.length)continue;
    let d=state.decks.find(x=>x.name===name);
    if(!d){
      const now=Date.now();
      d={id:uid(),name,when:'all',use:'both',cards:[],created:now,updated:now,...(g.only?.length?{only:g.only}:{})};
      const fits=(p:Persona)=>!g.only?.length||g.only.includes(p.name);
      state={...state,decks:[...state.decks,d],personas:state.personas.map(p=>fits(p)?deckTouch(p,[...p.decks,d!.id]):p)};
    }
    added+=addCards(d.id,cards.join('\n')).added;n++;
  }
  save();return {decks:n,added};
}

/* ───────── 同步用：整份拿出来、整份放回去 ───────── */
export type Dump={state:State;msgs:Record<string,Msg[]>;boxes:Record<string,Box>;graves:Record<string,Grave>};
export const dump=():Dump=>({state,msgs:Object.fromEntries(msgs),boxes:Object.fromEntries(boxes),graves:Object.fromEntries(graves)});
// 合并后的结果放回本机。只写真的变了的部分，不算作「本机有新改动」。返回本机有没有因此变样
export async function adopt(d:Dump):Promise<boolean>{
  if(broken||!ready)return false;
  const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
  // 先一口气把内存里的换好（中间不停顿，这期间到的新消息不会被盖掉），再慢慢落盘
  const jobs:Promise<unknown>[]=[];
  const gone=state.personas.filter(p=>!d.state.personas.some(x=>x.id===p.id));
  for(const p of gone){msgs.delete(p.id);boxes.delete(p.id);graves.delete(p.id);jobs.push(delKey('m:'+p.id),delKey('x:'+p.id),delKey('d:'+p.id));}
  if(!same(state,d.state)){state=d.state;mirror();jobs.push(persist('state'));}
  for(const p of d.state.personas){
    const m=d.msgs[p.id]??[];if(!same(list(p.id),m)){msgs.set(p.id,m);jobs.push(persist('m:'+p.id));}
    const b=d.boxes[p.id];if(b&&!same(boxes.get(p.id),b)){boxes.set(p.id,b);jobs.push(persist('x:'+p.id));}
    const g=d.graves[p.id];if(g&&!same(graves.get(p.id),g)){graves.set(p.id,g);jobs.push(persist('d:'+p.id,false));}
  }
  emit();
  await Promise.all(jobs);
  return jobs.length>0;
}
export const dropImageCache=(id:string)=>{pics.delete(id);};

export function pushMsg(m:Omit<Msg,'id'>&{id?:string}):Msg{
  const full={...m,id:m.id??uid()} as Msg;
  msgs.set(m.pid,[...list(m.pid),full]);saveMsgs(m.pid);return full;
}
export const setMsg=(pid:string,id:string,patch:Partial<Msg>|null)=>{
  if(!patch){const g=grave(pid);bury(pid,{...g,dead:[...g.dead,id].slice(-4000)});}
  msgs.set(pid,patch?list(pid).map(m=>m.id===id?{...m,...patch,u:Date.now()}:m):list(pid).filter(m=>m.id!==id));saveMsgs(pid);
};
export const mapMsgs=(pid:string,fn:(m:Msg)=>Msg)=>{msgs.set(pid,list(pid).map(fn));saveMsgs(pid);};
export const clearMsgs=(pid:string)=>{bury(pid,{dead:[],cleared:Date.now()});msgs.set(pid,[]);saveMsgs(pid);};
export const unread=(p:Persona)=>list(p.id).filter(m=>m.from==='ta'&&m.at>p.readAt).length;

/* ───────── 图片：缩小后存在本机 ───────── */

export async function putImage(file:Blob,max=1280,q=.86):Promise<string>{
  const bmp=await createImageBitmap(file);
  const k=Math.min(1,max/Math.max(bmp.width,bmp.height));
  const c=document.createElement('canvas');c.width=Math.round(bmp.width*k);c.height=Math.round(bmp.height*k);
  c.getContext('2d')!.drawImage(bmp,0,0,c.width,c.height);bmp.close?.();
  const id=uid();if(!await setKey('a:'+id,c.toDataURL('image/jpeg',q)))throw new Error('图片没存进去');return id;
}
export async function getImage(id:string):Promise<string>{
  if(/^https?:\/\//.test(id))return id;
  if(pics.has(id))return pics.get(id)!;
  const v=(await getKey<string>('a:'+id))??'';if(v)pics.set(id,v);return v;
}

/* ───────── 备份 ───────── */

export async function exportAll():Promise<string>{
  const out:Record<string,unknown>={app:APP,v:1,state};
  for(const k of await allKeys())if(typeof k==='string'&&(/^[maxd]:/.test(k)))out[k]=await getKey(k);
  return JSON.stringify(out);
}
export async function importAll(text:string){
  const j=JSON.parse(text) as Record<string,unknown>;
  if(j.app!==APP||!j.state)throw new Error('这不是这个网站的备份文件');
  for(const [k,v] of Object.entries(j))if(/^[maxd]:/.test(k))await setKey(k,v);
  await setKey('state',j.state);pics.clear();ls.del(DEV);devText='';for(const k of ['state',...Object.keys(j)])ls.del(RESCUE+k);pend.clear();await reload();mirror();touch();
}
export async function wipe(){for(const k of await allKeys())await delKey(String(k));try{for(const k of Object.keys(localStorage))if(k===DEV||k.startsWith(RESCUE))localStorage.removeItem(k);}catch{/* */}devText='';pend.clear();state=blank();msgs.clear();boxes.clear();graves.clear();pics.clear();emit();}
