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
export type Deck={id:string;name:string;when:When;use:Use;cards:Card[];created:number;updated:number};
export type Persona={
  id:string;name:string;bio:string;avatar?:string;accent:string;wall?:string;since:string;decks:string[];
  min:number;max:number;burst:number;ghost:number;join:boolean;joinMax:number;   // 回复：最快/最慢（秒）、一次最多几条、已读不回的概率、是否拼接
  pro:boolean;proMin:number;proMax:number;quietFrom:number;quietTo:number;        // 主动：间隔（分钟）、他睡觉的钟点
  nextAt:number;replyAt:number;readAt:number;created:number;updated:number;
};
export type Msg={id:string;pid:string;from:'me'|'ta';kind:'text'|'img';text:string;at:number;re?:string;like?:boolean;seen?:number;fav?:boolean;src?:string};
export type Prefs={theme:'auto'|'light'|'dark';bubble:'mono'|'accent'|'line';myName:string;myAvatar?:string;last:string;audio:boolean;notify:boolean;sound:boolean};
export type State={personas:Persona[];decks:Deck[];prefs:Prefs};

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
const blank=():State=>({personas:[],decks:[],prefs:{theme:'auto',bubble:'mono',myName:'我',last:'',audio:false,notify:false,sound:false}});
let state:State=blank();
const msgs=new Map<string,Msg[]>();
let ver=0;
const subs=new Set<()=>void>();
const emit=()=>{ver++;subs.forEach(f=>f());};
const sub=(f:()=>void)=>{subs.add(f);return()=>{subs.delete(f);};};
export const useVer=()=>useSyncExternalStore(sub,()=>ver);
export const poke=emit;
export const S=()=>state;
export const list=(pid:string)=>msgs.get(pid)??[];
export const who=(pid:string)=>state.personas.find(p=>p.id===pid);

const bc=typeof BroadcastChannel==='function'?new BroadcastChannel('cx-site'):null;
let saveT=0;
const save=()=>{emit();clearTimeout(saveT);saveT=window.setTimeout(()=>{void setKey('state',state).then(()=>bc?.postMessage('state'));},120);};
const saveMsgs=(pid:string)=>{emit();void setKey('m:'+pid,list(pid)).then(()=>bc?.postMessage('m:'+pid));};

export async function boot(){
  const s=await getKey<State>('state');
  if(s&&Array.isArray(s.personas))state={...blank(),...s,prefs:{...blank().prefs,...s.prefs}};
  for(const p of state.personas)msgs.set(p.id,(await getKey<Msg[]>('m:'+p.id))??[]);
  // 别的标签页或后台线程改了东西，这边跟着读
  if(bc)bc.onmessage=async e=>{
    if(e.data==='state'){const n=await getKey<State>('state');if(n){state=n;emit();}}
    else if(typeof e.data==='string'&&e.data.startsWith('m:')){msgs.set(e.data.slice(2),(await getKey<Msg[]>(e.data))??[]);emit();}
  };
  addEventListener('pagehide',()=>{void setKey('state',state);});
  void navigator.storage?.persist?.();
  emit();
}
export async function reload(){
  const n=await getKey<State>('state');if(n&&Array.isArray(n.personas))state={...blank(),...n,prefs:{...blank().prefs,...n.prefs}};
  for(const p of state.personas)msgs.set(p.id,(await getKey<Msg[]>('m:'+p.id))??[]);
  emit();
}

/* ───────── 改东西 ───────── */

export const setPrefs=(p:Partial<Prefs>)=>{state={...state,prefs:{...state.prefs,...p}};save();};
export function addPersona(name:string):Persona{
  const now=Date.now();
  const p:Persona={id:uid(),name,bio:'',accent:accents[0],since:'',decks:state.decks.map(d=>d.id),
    min:3,max:12,burst:2,ghost:.06,join:false,joinMax:2,pro:true,proMin:40,proMax:180,quietFrom:1,quietTo:8,
    nextAt:0,replyAt:0,readAt:now,created:now,updated:now};
  state={...state,personas:[...state.personas,p],prefs:{...state.prefs,last:p.id}};msgs.set(p.id,[]);save();return p;
}
export const setPersona=(id:string,patch:Partial<Persona>)=>{state={...state,personas:state.personas.map(p=>p.id===id?{...p,...patch,updated:Date.now()}:p)};save();};
export function dropPersona(id:string){
  state={...state,personas:state.personas.filter(p=>p.id!==id),prefs:{...state.prefs,last:state.prefs.last===id?'':state.prefs.last}};
  msgs.delete(id);void delKey('m:'+id);save();
}
export function addDeck(name:string):Deck{
  const now=Date.now();
  const d:Deck={id:uid(),name,when:'all',use:'both',cards:[],created:now,updated:now};
  // 新分组默认所有人公用，之后可以在分组里改成只给某几位
  state={...state,decks:[...state.decks,d],personas:state.personas.map(p=>({...p,decks:[...p.decks,d.id]}))};save();return d;
}
export const setDeck=(id:string,patch:Partial<Deck>)=>{state={...state,decks:state.decks.map(d=>d.id===id?{...d,...patch,updated:Date.now()}:d)};save();};
export function dropDeck(id:string){
  state={...state,decks:state.decks.filter(d=>d.id!==id),personas:state.personas.map(p=>({...p,decks:p.decks.filter(x=>x!==id)}))};save();
}
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

export function pushMsg(m:Omit<Msg,'id'>&{id?:string}):Msg{
  const full={...m,id:m.id??uid()} as Msg;
  msgs.set(m.pid,[...list(m.pid),full]);saveMsgs(m.pid);return full;
}
export const setMsg=(pid:string,id:string,patch:Partial<Msg>|null)=>{
  msgs.set(pid,patch?list(pid).map(m=>m.id===id?{...m,...patch}:m):list(pid).filter(m=>m.id!==id));saveMsgs(pid);
};
export const mapMsgs=(pid:string,fn:(m:Msg)=>Msg)=>{msgs.set(pid,list(pid).map(fn));saveMsgs(pid);};
export const clearMsgs=(pid:string)=>{msgs.set(pid,[]);saveMsgs(pid);};
export const unread=(p:Persona)=>list(p.id).filter(m=>m.from==='ta'&&m.at>p.readAt).length;

/* ───────── 图片：缩小后存在本机 ───────── */

export async function putImage(file:Blob,max=1280):Promise<string>{
  const bmp=await createImageBitmap(file);
  const k=Math.min(1,max/Math.max(bmp.width,bmp.height));
  const c=document.createElement('canvas');c.width=Math.round(bmp.width*k);c.height=Math.round(bmp.height*k);
  c.getContext('2d')!.drawImage(bmp,0,0,c.width,c.height);bmp.close?.();
  const id=uid();await setKey('a:'+id,c.toDataURL('image/jpeg',.86));return id;
}
const pics=new Map<string,string>();
export async function getImage(id:string):Promise<string>{
  if(pics.has(id))return pics.get(id)!;
  const v=(await getKey<string>('a:'+id))??'';if(v)pics.set(id,v);return v;
}

/* ───────── 备份 ───────── */

export async function exportAll():Promise<string>{
  const out:Record<string,unknown>={app:APP,v:1,state};
  for(const k of await allKeys())if(typeof k==='string'&&(k.startsWith('m:')||k.startsWith('a:')))out[k]=await getKey(k);
  return JSON.stringify(out);
}
export async function importAll(text:string){
  const j=JSON.parse(text) as Record<string,unknown>;
  if(j.app!==APP||!j.state)throw new Error('这不是这个网站的备份文件');
  for(const [k,v] of Object.entries(j))if(k.startsWith('m:')||k.startsWith('a:'))await setKey(k,v);
  await setKey('state',j.state);pics.clear();await reload();
}
export async function wipe(){for(const k of await allKeys())await delKey(String(k));state=blank();msgs.clear();pics.clear();emit();}
