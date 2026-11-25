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
};
export type Msg={id:string;pid:string;from:'me'|'ta';kind:'text'|'img'|'tip';text:string;at:number;re?:string;like?:boolean;seen?:number;fav?:boolean;src?:string;u?:number;react?:string;st?:boolean};   // react：贴在这条上的表情；st：这是一张表情包
export type Prefs={theme:'auto'|'light'|'dark';bubble:'ins'|'mono'|'accent'|'line';v?:number;myName:string;myAvatar?:string;last:string;audio:boolean;notify:boolean;sound:boolean;at?:number;
  mode?:'pip'|'loop'|'osc'|'both';pipAuto?:boolean;awake?:boolean;cloud?:string};   // 保活方式、画中画自动进入、屏幕常亮（都只管这台设备）；cloud：云端推送服务的地址（跟着同步走）
export type Pack={id:string;name:string;ids:string[];his?:boolean;who?:string[];created:number;updated:number};   // 一组表情包；ids 里是本机图片或图片链接；his=false 表示他不发这一组；who：只给这几位用（不写就是所有人）
export type State={personas:Persona[];decks:Deck[];prefs:Prefs;dead?:Record<string,number>;stickers?:string[];packs?:Pack[]};   // dead：删掉的人和分组，同步时别的设备也跟着删
export type Grave={dead:string[];cleared:number};   // 一位的聊天里删掉的消息、清空的时刻
// 每一位各自的小功能数据，单独存一份（x:<pid>），不和聊天记录混在一起
export type Letter={id:string;from:'me'|'ta';text:string;at:number;read?:boolean};
export type Diary={id:string;at:number;text:string;mood:string;note?:string};
export type Day={id:string;name:string;date:string;yearly:boolean};
export type Post={id:string;text:string;img?:string;at:number;liked?:boolean;cmt?:string};
export type Box={letters:Letter[];mailDue:number;diary:Diary[];days:Day[];lines:{date:string;text:string}[];answers:Record<string,string>;
  draw?:{date:string;luck:string;text:string;i:number};checks:{at:number;text:string}[];listen:number;focus:{n:number;min:number};
  cycle:{starts:string[];len:number;gap:number};posts:Post[];at?:number;
  call?:{at:number};ring?:{at:number}};   // call：视频通话从什么时候开始（一直到你挂断）；ring：他正打过来
export const blankBox=():Box=>({letters:[],mailDue:0,diary:[],days:[],lines:[],answers:{},checks:[],listen:0,focus:{n:0,min:0},cycle:{starts:[],len:5,gap:28},posts:[]});

export const accents=['#8A6A52','#000000','#3D6BE0','#D4526E','#5B8C6A','#8B6FD1','#E08A3C'];
const APP='cx-site';

/* ───────── 存到本机 ───────── */

let dbp:Promise<IDBDatabase>|null=null;
const open=()=>dbp??=new Promise<IDBDatabase>((ok,no)=>{
  const r=indexedDB.open('cx-site',1);
  r.onupgradeneeded=()=>r.result.createObjectStore('kv');
  r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error);
});
const tx=async<T>(mode:IDBTransactionMode,fn:(s:IDBObjectStore)=>IDBRequest):Promise<T>=>{
  const d=await open();
  return new Promise<T>((ok,no)=>{const q=fn(d.transaction('kv',mode).objectStore('kv'));q.onsuccess=()=>ok(q.result as T);q.onerror=()=>no(q.error);});
};
export const getKey=<T,>(k:string)=>tx<T|undefined>('readonly',s=>s.get(k)).catch(()=>undefined);
export const setKey=(k:string,v:unknown)=>tx('readwrite',s=>s.put(v,k)).catch(()=>undefined);
export const delKey=(k:string)=>tx('readwrite',s=>s.delete(k)).catch(()=>undefined);
const allKeys=()=>tx<IDBValidKey[]>('readonly',s=>s.getAllKeys()).catch(()=>[] as IDBValidKey[]);

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
// 存盘：第一下改动立刻写，紧跟着的一连串改动合成一次再写（刚做完一件事就刷新、被系统收走，也不会丢）
let dirty=false;
const write=()=>{void setKey('state',state).then(()=>bc?.postMessage('state'));};
const flush=()=>{if(!saveT)return;clearTimeout(saveT);saveT=0;if(dirty){dirty=false;write();}};
const save=()=>{touch();emit();if(saveT){dirty=true;return;}write();saveT=window.setTimeout(flush,120);};
// 页面要被收走（切到后台、关掉、刷新）的那一下，把还没落盘的改动立刻写下去
if(typeof document!=='undefined'){addEventListener('pagehide',flush);document.addEventListener('visibilitychange',()=>{if(document.hidden)flush();});}
const saveMsgs=(pid:string)=>{touch();emit();void setKey('m:'+pid,list(pid)).then(()=>bc?.postMessage('m:'+pid));};
export const setBox=(pid:string,patch:Partial<Box>)=>{const b={...blankBox(),...boxes.get(pid),...patch,at:Date.now()};boxes.set(pid,b);touch();emit();void setKey('x:'+pid,b).then(()=>bc?.postMessage('x:'+pid));};
const loadBox=async(pid:string)=>{boxes.set(pid,{...blankBox(),...(await getKey<Box>('x:'+pid))});const g=await getKey<Grave>('d:'+pid);if(g)graves.set(pid,g);};
const bury=(pid:string,g:Grave)=>{graves.set(pid,g);void setKey('d:'+pid,g);};

const tidyUp=(st:State):State=>st.stickers?.length?{...st,stickers:[],packs:[...(st.packs??[]),{id:uid(),name:'默认',ids:st.stickers,created:Date.now(),updated:Date.now()}]}:st;
export async function boot(){
  const s=await getKey<State>('state');
  if(s&&Array.isArray(s.personas))state={...blank(),...s,prefs:{...blank().prefs,...s.prefs,...(s.prefs?.v?{}:{bubble:'ins' as const,v:2})}};
  state=tidyUp(state);
  for(const p of state.personas){msgs.set(p.id,(await getKey<Msg[]>('m:'+p.id))??[]);await loadBox(p.id);}
  // 别的标签页或后台线程改了东西，这边跟着读
  if(bc)bc.onmessage=async e=>{
    if(e.data==='state'){const n=await getKey<State>('state');if(n){state=n;emit();}}
    else if(typeof e.data==='string'&&e.data.startsWith('m:')){msgs.set(e.data.slice(2),(await getKey<Msg[]>(e.data))??[]);emit();}
    else if(typeof e.data==='string'&&e.data.startsWith('x:')){await loadBox(e.data.slice(2));emit();}
  };
  addEventListener('pagehide',()=>{void setKey('state',state);});
  void navigator.storage?.persist?.();
  emit();
}
export async function reload(){
  const n=await getKey<State>('state');if(n&&Array.isArray(n.personas))state={...blank(),...n,prefs:{...blank().prefs,...n.prefs}};
  for(const p of state.personas){msgs.set(p.id,(await getKey<Msg[]>('m:'+p.id))??[]);await loadBox(p.id);}
  emit();
}

/* ───────── 改东西 ───────── */

export const setPrefs=(p:Partial<Prefs>)=>{state={...state,prefs:{...state.prefs,...p,...('myName' in p||'myAvatar' in p||'bubble' in p||'cloud' in p?{at:Date.now()}:{})}};save();};
export function addPersona(name:string):Persona{
  const now=Date.now();
  const p:Persona={id:uid(),name,bio:'',accent:accents[0],since:'',decks:state.decks.filter(d=>!d.only?.length||d.only.includes(name)).map(d=>d.id),
    min:3,max:12,burst:2,ghost:.06,join:false,joinMax:2,pro:true,proMin:40,proMax:180,quietFrom:1,quietTo:8,
    nextAt:0,replyAt:0,readAt:now,created:now,updated:now};
  state={...state,personas:[...state.personas,p],prefs:{...state.prefs,last:p.id}};msgs.set(p.id,[]);save();return p;
}
export const setPersona=(id:string,patch:Partial<Persona>)=>{state={...state,personas:state.personas.map(p=>p.id===id?{...p,...patch,updated:Date.now()}:p)};save();};
export function dropPersona(id:string){
  state={...state,personas:state.personas.filter(p=>p.id!==id),prefs:{...state.prefs,last:state.prefs.last===id?'':state.prefs.last},dead:{...state.dead,[id]:Date.now()}};
  msgs.delete(id);boxes.delete(id);graves.delete(id);void delKey('m:'+id);void delKey('x:'+id);void delKey('d:'+id);save();
}
export function addDeck(name:string):Deck{
  const now=Date.now();
  const d:Deck={id:uid(),name,when:'all',use:'both',cards:[],created:now,updated:now};
  // 新分组默认所有人公用，之后可以在分组里改成只给某几位
  state={...state,decks:[...state.decks,d],personas:state.personas.map(p=>({...p,decks:[...p.decks,d.id]}))};save();return d;
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
      state={...state,decks:[...state.decks,d],personas:state.personas.map(p=>fits(p)?{...p,decks:[...p.decks,d!.id]}:p)};
    }
    added+=addCards(d.id,cards.join('\n')).added;n++;
  }
  save();return {decks:n,added};
}

/* ───────── 同步用：整份拿出来、整份放回去 ───────── */
export type Dump={state:State;msgs:Record<string,Msg[]>;boxes:Record<string,Box>;graves:Record<string,Grave>};
export const dump=():Dump=>({state,msgs:Object.fromEntries(msgs),boxes:Object.fromEntries(boxes),graves:Object.fromEntries(graves)});
// 合并后的结果放回本机。只写真的变了的部分，不算作「本机有新改动」
export async function adopt(d:Dump){
  const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
  const gone=state.personas.filter(p=>!d.state.personas.some(x=>x.id===p.id));
  for(const p of gone){msgs.delete(p.id);boxes.delete(p.id);graves.delete(p.id);await delKey('m:'+p.id);await delKey('x:'+p.id);await delKey('d:'+p.id);}
  if(!same(state,d.state)){state=d.state;await setKey('state',state);bc?.postMessage('state');}
  for(const p of d.state.personas){
    const m=d.msgs[p.id]??[];if(!same(list(p.id),m)){msgs.set(p.id,m);await setKey('m:'+p.id,m);bc?.postMessage('m:'+p.id);}
    const b=d.boxes[p.id];if(b&&!same(boxes.get(p.id),b)){boxes.set(p.id,b);await setKey('x:'+p.id,b);bc?.postMessage('x:'+p.id);}
    const g=d.graves[p.id];if(g&&!same(graves.get(p.id),g)){graves.set(p.id,g);await setKey('d:'+p.id,g);}
  }
  emit();
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

export async function putImage(file:Blob,max=1280):Promise<string>{
  const bmp=await createImageBitmap(file);
  const k=Math.min(1,max/Math.max(bmp.width,bmp.height));
  const c=document.createElement('canvas');c.width=Math.round(bmp.width*k);c.height=Math.round(bmp.height*k);
  c.getContext('2d')!.drawImage(bmp,0,0,c.width,c.height);bmp.close?.();
  const id=uid();await setKey('a:'+id,c.toDataURL('image/jpeg',.86));return id;
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
  await setKey('state',j.state);pics.clear();await reload();touch();
}
export async function wipe(){for(const k of await allKeys())await delKey(String(k));state=blank();msgs.clear();boxes.clear();graves.clear();pics.clear();emit();}
