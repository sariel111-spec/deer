import {S,box,list,mapMsgs,packsFor,poke,pushMsg,setBox,setMsg,setPersona,uid,who,whens,unread,type Letter,type Msg,type Persona,type When} from './db';
import {notify,remind,blip,badge,clearNotes} from './alive';
import {pushWas,type Ahead} from './push';
import {isShell} from './native';
import {at0,cyDecks,cyPhase,cyTips,ymd} from './cyc';

const rand=(a:number,b:number)=>a+Math.random()*Math.max(0,b-a);
const inWin=(w:When,t:number)=>{const x=whens.find(y=>y.id===w)!;const h=new Date(t).getHours();return x.from<x.to?h>=x.from&&h<x.to:h>=x.from||h<x.to;};
const asleep=(p:Persona,t:number)=>{const h=new Date(t).getHours();return p.quietFrom===p.quietTo?false:p.quietFrom<p.quietTo?h>=p.quietFrom&&h<p.quietTo:h>=p.quietFrom||h<p.quietTo;};

// 他平时能用的分组：他启用的那些，去掉她指定给经期的（那些话只在那几天由他主动说，不随口说，也不进信和每日一句）
export const plain=(p:Persona)=>{const cy=new Set(cyDecks(box(p.id).cycle));return S().decks.filter(d=>p.decks.includes(d.id)&&!cy.has(d.id));};
// 这一刻他能用的字卡：他启用的分组里，时段对得上、没被屏蔽的
export function pool(p:Persona,mode:'reply'|'pro',t=Date.now()){
  return plain(p).filter(d=>(d.use==='both'||d.use===mode)&&inWin(d.when,t))
    .flatMap(d=>d.cards.filter(c=>!c.off).map(c=>({id:d.id+'/'+c.id,t:c.t})));
}
const recent=new Map<string,string[]>();
const glue=['，',' ','…'];
// 同一个人、同一个时刻，在哪台设备上算出来的都是同一句、同一个下一次：手机和电脑各自替他排话，也不会说成两句
const seeded=(key:string)=>{
  let h=2166136261;for(let i=0;i<key.length;i++){h^=key.charCodeAt(i);h=Math.imul(h,16777619);}
  let a=h>>>0;
  return()=>{a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};
};
const proId=(p:Persona,at:number)=>'p'+p.id.slice(-5)+Math.round(at).toString(36);
// rnd：给了就按它来抽（主动消息用，结果只由「谁、几点」决定）；不给就随手抽，并避开最近说过的
function draw(p:Persona,mode:'reply'|'pro',t:number,rnd?:()=>number,avoid?:Set<string>):{text:string;src:string}|null{
  const all=pool(p,mode,t);if(!all.length)return null;
  if(rnd){
    // avoid：最近说过的那些先不抽（抽完了才回头用）
    const ok=avoid?all.filter(c=>!avoid.has(c.id)):all;
    const left=ok.length?[...ok]:[...all],n=Math.min(left.length,p.join?1+Math.floor(rnd()*Math.max(1,p.joinMax)):1);
    const cs=Array.from({length:n},()=>left.splice(Math.floor(rnd()*left.length),1)[0]);
    if(avoid)for(const c of cs)avoid.add(c.id);
    return {text:cs.map(c=>c.t).reduce((a,b)=>a+glue[Math.floor(rnd()*glue.length)]+b),src:cs.map(c=>c.id).join(',')};
  }
  const rec=recent.get(p.id)??[];
  const keep=Math.min(12,Math.floor(all.length/2));
  const one=()=>{
    const fresh=all.filter(c=>!rec.includes(c.id));
    const c=(fresh.length?fresh:all)[Math.floor(Math.random()*(fresh.length||all.length))];
    rec.push(c.id);while(rec.length>keep)rec.shift();return c;
  };
  const n=p.join?1+Math.floor(Math.random()*Math.max(1,p.joinMax)):1;
  const cs=Array.from({length:Math.min(n,all.length)},one);
  recent.set(p.id,rec);
  return {text:cs.map(c=>c.t).reduce((a,b)=>a+glue[Math.floor(Math.random()*glue.length)]+b),src:cs.map(c=>c.id).join(',')};
}

// 小功能里用：从他所有能用的字卡里随手抽 n 句（不分时段、不记重复）
export function lines(p:Persona,n=1):string[]{
  const all=plain(p).flatMap(d=>d.cards.filter(c=>!c.off).map(c=>c.t));
  const out:string[]=[];
  while(out.length<n&&all.length)out.push(all.splice(Math.floor(Math.random()*all.length),1)[0]);
  return out;
}
/* 信箱。回信等多久（分钟）、写多长（几句字卡）、主动来信隔多久（分钟） */
export const mailPaces=[{name:'一会儿',note:'20 分钟到 3 小时',r:[20,180]},{name:'半天',note:'3 到 10 小时',r:[180,600]},{name:'隔天',note:'10 到 24 小时',r:[600,1440]}];
export const mailLens=[{name:'短',note:'三五句',r:[3,5]},{name:'中',note:'六到九句',r:[6,9]},{name:'长',note:'十来句',r:[10,14]}];
export const mailPros=[{name:'不会',note:'只回你写的信',r:[0,0]},{name:'偶尔',note:'三到七天一封',r:[4320,10080]},{name:'常常',note:'一两天一封',r:[1440,2880]}];
const pickOf=<T,>(a:T[],i:number|undefined,d:number)=>a[i??d]??a[d];
// 他在睡觉的钟点信不送到，顺延到他醒来
const awakeAt=(p:Persona,t:number)=>{let x=t;for(let i=0;i<96&&asleep(p,x);i++)x+=15*60000;return x;};
// 一封信里的字卡不重复；他最近三封信（和已经定好还没送到的）用过的也尽量避开，免得连着几封都差不多
const letterText=(p:Persona,len:number|undefined)=>{
  const [a,z]=pickOf(mailLens,len,1).r,n=a+Math.floor(Math.random()*(z-a+1)),b=box(p.id);
  const all=[...new Set(plain(p).flatMap(d=>d.cards.filter(c=>!c.off).map(c=>c.t)))];
  const used=new Set([...b.letters.filter(l=>l.from==='ta').slice(-3).map(l=>l.text),...b.letters.filter(l=>l.plan&&!l.got).map(l=>l.plan!),b.mailNext?.text??''].flatMap(t=>t.split('\n')));
  const fresh=all.filter(t=>!used.has(t)),pool=fresh.length>=n?fresh:all,out:string[]=[];
  while(out.length<n&&pool.length)out.push(pool.splice(Math.floor(Math.random()*pool.length),1)[0]);
  return out.join('\n');
};
/** 他这封信夹不夹照片：照片库里有才夹，大约三封里一封；最近夹过的、已经排好要夹的先不挑 */
function letterPic(p:Persona):string|undefined{
  const b=box(p.id),pics=b.mailPics??[];
  if(!pics.length||Math.random()>=.36)return;
  const used=new Set([...b.letters.filter(l=>l.from==='ta'&&l.img).slice(-4).map(l=>l.img!),...b.letters.filter(l=>l.planImg&&!l.got).map(l=>l.planImg!),b.mailNext?.img??'']);
  const fresh=pics.filter(x=>!used.has(x)),pool=fresh.length?fresh:pics;
  return pool[Math.floor(Math.random()*pool.length)];
}
/** 寄出一封信：回信的时间和内容当场定好，存在这封信上，到点再送到 */
export function sendLetter(p:Persona,text:string,re?:string,img?:string):Letter{
  const b=box(p.id),now=Date.now(),[a,z]=pickOf(mailPaces,b.mailPace,0).r,plan=letterText(p,b.mailLen);
  const pic=plan?letterPic(p):undefined;
  const l:Letter={id:uid(),from:'me',text,at:now,read:true,...(re?{re}:{}),...(img?{img}:{}),...(plan?{due:awakeAt(p,now+rand(a,z)*60000),plan}:{}),...(pic?{planImg:pic}:{})};
  setBox(p.id,{letters:[...b.letters,l]});
  return l;
}
const nextPro=(p:Persona,from:number,pro:number|undefined,len:number|undefined)=>{const [a,z]=pickOf(mailPros,pro,0).r,text=a?letterText(p,len):'';if(!text)return undefined;const img=letterPic(p);return {at:awakeAt(p,from+rand(a,z)*60000),text,...(img?{img}:{})};};
/** 改了「他会不会主动写信」之后：重新排下一封 */
export function planProMail(p:Persona){const b=box(p.id);setBox(p.id,{mailNext:nextPro(p,Date.now(),b.mailPro,b.mailLen)});}
// 到点的信送到：你寄出的信各回一封；他主动写的按间隔来
function mail(p:Persona,now:number){
  const b=box(p.id),gone=new Set(b.mailGone??[]),have=new Set(b.letters.map(l=>l.id));
  const add:Letter[]=[];let letters=b.letters,first=0,pro=false,patch:Partial<typeof b>={};
  const due=letters.filter(l=>l.from==='me'&&l.due&&l.plan&&!l.got&&now>=l.due);
  if(due.length){
    for(const l of due){const id='r'+l.id;if(!have.has(id)&&!gone.has(id)){add.push({id,from:'ta',text:l.plan!,at:l.due!,re:l.id,...(l.planImg?{img:l.planImg}:{})});first=first?Math.min(first,l.due!):l.due!;}}
    const ids=new Set(due.map(l=>l.id));letters=letters.map(l=>ids.has(l.id)?{...l,got:true}:l);
  }
  // 更新之前寄出、还没等到回信的那一封
  if(b.mailDue&&now>=b.mailDue){const t=letterText(p,b.mailLen);if(t){add.push({id:uid(),from:'ta',text:t,at:now});first=first||b.mailDue;}patch.mailDue=0;}
  if(pickOf(mailPros,b.mailPro,0).r[0]){
    if(!b.mailNext){const n=nextPro(p,now,b.mailPro,b.mailLen);if(n)patch.mailNext=n;}   // 没有字卡时排不出来，就先不排
    else if(now>=b.mailNext.at){
      const id='p'+b.mailNext.at;if(!have.has(id)&&!gone.has(id)){add.push({id,from:'ta',text:b.mailNext.text,at:b.mailNext.at,pro:true,...(b.mailNext.img?{img:b.mailNext.img}:{})});pro=!first;first=first||b.mailNext.at;}
      patch.mailNext=nextPro(p,now,b.mailPro,b.mailLen);
    }
  }
  if(!add.length&&!due.length&&!Object.keys(patch).length)return;
  setBox(p.id,{...patch,letters:[...letters,...add].sort((x,y)=>x.at-y.at)},!('mailDue' in patch));
  // 聊天里也留一行（点了进信箱）：从推送点进来落在聊天页，也看得到信到了。id 跟着信走，别的设备同步过来不会重复
  for(const l of add){const id='ml'+l.id;if(!list(p.id).some(m=>m.id===id))pushMsg({pid:p.id,from:'ta',kind:'tip',text:l.pro?'给你写了一封信':'给你回了一封信',at:Math.max(Math.min(l.at,now),(list(p.id).at(-1)?.at??0)+1),id});}
  // 正开着小鹿（又不在信箱里）：屏幕下方说一声就够了，不再同时弹一条系统通知
  const inApp=add.length>0&&!document.hidden&&first>=backAt&&!location.hash.startsWith('#/f/mail/'+p.id);
  if(add.length&&!inApp&&!(pushWas()&&first<backAt))notify(p,pro?'给你写了一封信':'给你回了一封信','mail');
  if(inApp)dispatchEvent(new CustomEvent('cx-say',{detail:`${p.name} ${pro?'给你写了一封信':'给你回了一封信'}`}));
}

/* 提前排好的话（只在这台设备上）：离开前台时交给云端推送，回来时聊天里补上的就是同样几句 */
type Line={text:string;src:string;st?:boolean};
type Reply={at:number;lines:Line[];quote?:string};
type Plans={pq:Record<string,(Line&{at:number;call?:boolean})[]>;rq:Record<string,Reply>};
// 最近一次回到前台（或刚打开）的时刻。排好的话如果本该在这之前到，说明当时人不在、云端已经推过：
// 回来立刻补上，不演「正在输入」，也不再弹一遍通知
let backAt=Date.now();
if(typeof document!=='undefined')document.addEventListener('visibilitychange',()=>{if(!document.hidden){backAt=Date.now();if(active)read(active);}});
const plans:Plans=(()=>{try{const v=JSON.parse(localStorage.getItem('cx-plan')??'null') as Plans|null;if(v&&typeof v.pq==='object'&&typeof v.rq==='object')return v;}catch{/* 坏了就重排 */}return {pq:{},rq:{}};})();
const savePlans=()=>{try{localStorage.setItem('cx-plan',JSON.stringify(plans));}catch{/* 存不下也不要紧，回来时现抽 */}};

/* 交给云端的那几句，这台设备自己也记一份账（只在本机）。
   云端到点会把它们推成通知，所以不管之后发生了什么（时间被重排、状态被同步改写、页面被系统收走重开），
   回来时账上到了点的每一句都要出现在聊天里——通知里有的，对话里一定有 */
type Held={pid:string;at:number;id:string;kind:'pro'|'reply'|'call';text:string;src:string;st?:boolean;re?:string};
let held:Held[]=(()=>{try{const v=JSON.parse(localStorage.getItem('cx-held')??'[]') as Held[];return Array.isArray(v)?v.filter(h=>h&&typeof h.id==='string'&&typeof h.at==='number'):[];}catch{return [];}})();
const saveHeld=()=>{try{localStorage.setItem('cx-held',JSON.stringify(held));}catch{/* */}};
const unhold=(id:string)=>{if(held.some(h=>h.id===id)){held=held.filter(h=>h.id!==id);saveHeld();}};
// grace：页面醒着的时候先让正常的流程去说（带「正在输入」的那种），过了这几秒还没出现的才由这里补
function settle(now:number,grace:number){
  if(!held.length)return;
  // 人不在的时候到点的（比回来的那一刻早）：回来立刻补，不等
  const isDue=(h:Held)=>h.at<=now&&(h.at<=now-grace||h.at<backAt);
  const due=held.filter(isDue);if(!due.length)return;
  held=held.filter(h=>!isDue(h));saveHeld();
  for(const h of due){
    const p=who(h.pid);if(!p)continue;
    if(h.kind==='call'){ring(p,h.at);continue;}
    if(h.kind==='reply')seen(h.pid);
    arrive(p,h.text,h.src,h.at,h.re,!!h.st,true,h.id);
  }
}
/** 云端确认已经把没发的收回去了：账上还没到点的不会再推，划掉 */
export function released(at=Date.now()){if(held.some(h=>h.at>at)){held=held.filter(h=>h.at<=at);saveHeld();}}

/* 正在输入、当前打开的是谁 */
const typing=new Set<string>();
export const isTyping=(pid:string)=>typing.has(pid);
const setTyping=(pid:string,on:boolean)=>{if(on===typing.has(pid))return;if(on)typing.add(pid);else typing.delete(pid);poke();};
let active='';
export function setActive(pid:string){active=pid;if(pid)read(pid);}
export function read(pid:string){
  const p=who(pid);if(!p)return;
  // 已读记到最后一条为止：别的设备钟快几秒、补发的话排在后面，也都算看过了
  if(unread(p)>0){setPersona(pid,{readAt:Math.max(Date.now(),list(pid).at(-1)?.at??0)},true);clearNotes(pid);}
  badge();
}

// late：这句是离开期间该到的、现在补上的。云端推送开着的话当时已经推过，不再弹一遍通知
function arrive(p:Persona,text:string,src:string,at:number,re?:string,sticker=false,late=false,id?:string,quiet=false){
  // 这一句还在云端手里（交出去以后还没确认收回来）：云端到点会自己弹通知，这里就不再弹一遍
  const cloud=!!id&&pushWas()&&held.some(h=>h.id===id);
  // 这一句别的设备已经替他说过、同步过来了：不再说一遍
  if(id){unhold(id);if(list(p.id).some(m=>m.id===id))return;}
  // 补发的话不能排到已有消息的前面
  at=Math.max(at,(list(p.id).at(-1)?.at??0)+1);
  if(sticker){pushMsg({pid:p.id,from:'ta',kind:'img',text,at,st:true,...(id?{id}:{})});text='[表情]';}
  else pushMsg({pid:p.id,from:'ta',kind:'text',text,at,src,re,...(id?{id}:{})});
  const here=!document.hidden&&active===p.id;
  if(here){setPersona(p.id,{readAt:Math.max(Date.now(),at)},true);if(!late)blip();}
  // 这一句交给过手机的闹钟（安装包）、人还没回来、页面却还醒着：自己当场弹，不干等闹钟
  else if(cloud){if(isShell()&&document.hidden)notify(p,text,undefined,quiet);}
  else if(!(late&&pushWas()))notify(p,text,undefined,quiet);
  badge();
}

/* 你发了一条之后 */
export function sent(pid:string){
  const p=who(pid);if(!p)return;
  const now=Date.now(),d=rand(p.min,p.max)*1000;
  const seenIn=rand(500,Math.min(2600,Math.max(700,d*.5)));
  setTimeout(()=>seen(pid),seenIn);
  // 已读不回：这一次就停在已读
  if(Math.random()<p.ghost){if(p.replyAt)setPersona(pid,{replyAt:0},true);setTyping(pid,false);return;}
  // 正聊着的时候不插进一条主动消息：把下一次主动的时间从现在重新算
  setPersona(pid,{...(!p.replyAt||p.replyAt<now?{replyAt:now+Math.max(1400,d)}:{}),...(p.pro?{nextAt:nextTime(p,now)}:{})},true);
}
function seen(pid:string){
  const now=Date.now();
  if(!list(pid).some(m=>m.from==='me'&&!m.seen))return;
  mapMsgs(pid,m=>m.from==='me'&&!m.seen?{...m,seen:now,u:now}:m);
  // 偶尔给你刚发的那句贴个表情
  const mine=list(pid).filter(m=>m.from==='me'&&m.kind==='text').at(-1);
  if(mine&&!mine.react&&Math.random()<.1)setTimeout(()=>setMsg(pid,mine.id,{react:reacts[Math.floor(Math.random()*reacts.length)]}),rand(600,2200));
}
const reacts=['❤️','❤️','😂','🥺','👍','😮'];
const busy=new Set<string>();
const rid=(p:Persona,at:number,i:number)=>'r'+p.id.slice(-5)+Math.round(at).toString(36)+'.'+i;
function replyLine(p:Persona,i:number,t:number,rnd:()=>number,avoid:Set<string>):Line|null{
  const packs=packsFor(p.id).filter(k=>k.his!==false).flatMap(k=>k.ids);
  // 有表情包的话，他偶尔回一张（不会连着第一句就发）
  if(i>0&&p.stick!==false&&packs.length&&rnd()<.22)return {text:packs[Math.floor(rnd()*packs.length)],src:'',st:true};
  return draw(p,'reply',t,rnd,avoid);
}
// 这一次回什么只由「谁、哪一刻该回」决定：提前排给云端的、回来现算的、别的设备算的，都是同样几句
function replyPlan(p:Persona,at:number):Reply{
  const rnd=seeded(p.id+'|r|'+Math.round(at));
  // 最近说过的先避开
  const avoid=new Set(list(p.id).filter(m=>m.from==='ta'&&m.src).slice(-12).flatMap(m=>m.src!.split(',')));
  const half=Math.floor(pool(p,'reply',at).length/2);while(avoid.size>half)avoid.delete(avoid.values().next().value as string);
  const n=1+Math.floor(rnd()*Math.max(1,p.burst)),lines:Line[]=[];
  for(let i=0;i<n;i++){const l=replyLine(p,i,at,rnd,avoid);if(!l)break;lines.push(l);}
  const mine=list(p.id).filter(m=>m.from==='me'&&m.kind!=='tip');
  return {at,lines,quote:mine.length&&rnd()<.12?mine[mine.length-1].id:undefined};
}
// planned：离开前台时提前排好、交给云端推送过的那几句
function reply(p:Persona,at:number,planned?:Reply){
  if(busy.has(p.id))return;busy.add(p.id);
  seen(p.id);
  const plan=planned??replyPlan(p,at),n=plan.lines.length;
  if(plan.at<backAt){
    // 离开期间他已经回了：按原定的时刻一口气补上
    plan.lines.forEach((l,i)=>arrive(who(p.id)??p,l.text,l.src,plan.at+i*1500,i===0?plan.quote:undefined,!!l.st,true,rid(p,plan.at,i)));
    setTyping(p.id,false);busy.delete(p.id);return;
  }
  // 这几句里已经在聊天里的（别的设备替他说过、或者同步把「还没回」的标记又带了回来）：直接跳过，不为它们再冒一次三个点
  const said=()=>new Set(list(p.id).slice(-60).map(m=>m.id));
  let i=0,told=false;   // told：这一轮已经弹过一次通知了，后面连着的几句只换通知上的字，不再响一遍
  const step=()=>{
    const now=who(p.id)??p,had=said();
    while(i<n&&had.has(rid(p,plan.at,i)))i++;
    const got=plan.lines[i];
    if(got)arrive(now,got.text,got.src,Date.now(),i===0?plan.quote:undefined,!!got.st,false,rid(p,plan.at,i),told);
    if(got)told=true;
    i++;
    while(i<n&&had.has(rid(p,plan.at,i)))i++;
    if(got&&i<n){setTyping(p.id,true);setTimeout(step,rand(900,2400));}
    else{setTyping(p.id,false);busy.delete(p.id);}
  };
  step();
}
/** 这一刻该回的那几句，是不是已经都在聊天里了 */
const replied=(p:Persona,at:number)=>list(p.id).slice(-60).some(m=>m.id===rid(p,at,0));

/* ── 视频通话：接通之后一直挂着，只有你能挂。开始的时刻存着，划掉小鹿、锁屏、换设备，回来都还在通话中 ── */
const RING=45000;
export const onCall=()=>S().personas.find(p=>box(p.id).call);
export const ringing=()=>S().personas.find(p=>{const r=box(p.id).ring;return !!r&&Date.now()-r.at<RING;});
export const clock=(ms:number)=>{const s=Math.max(0,Math.floor(ms/1000)),h=Math.floor(s/3600),m=Math.floor(s%3600/60),pad=(n:number)=>String(n).padStart(2,'0');return (h?h+':'+pad(m):pad(m))+':'+pad(s%60);};
const long=(ms:number)=>{const s=Math.max(1,Math.round(ms/1000));return s<60?`${s} 秒`:s<3600?`${Math.floor(s/60)} 分 ${s%60} 秒`:`${Math.floor(s/3600)} 小时 ${Math.floor(s%3600/60)} 分`;};
export function callStart(pid:string){if(onCall()||!who(pid))return false;setBox(pid,{call:{at:Date.now()},ring:undefined},true);return true;}
export function callEnd(pid:string){
  const c=box(pid).call;if(!c)return;
  setBox(pid,{call:undefined},true);
  pushMsg({pid,from:'me',kind:'tip',text:`视频通话 ${long(Date.now()-c.at)}`,at:Date.now()});
}
export function callDecline(pid:string){
  if(!box(pid).ring)return;
  setBox(pid,{ring:undefined},true);
  pushMsg({pid,from:'me',kind:'tip',text:'你没有接他的视频通话',at:Date.now()});
}
const callId=(p:Persona,at:number)=>'c'+proId(p,at);
function missed(p:Persona,at:number,id:string){
  if(list(p.id).some(m=>m.id===id))return;
  pushMsg({pid:p.id,from:'ta',kind:'tip',text:'未接视频通话',at:Math.max(Math.min(at,Date.now()),(list(p.id).at(-1)?.at??0)+1),id});
  badge();
}
// 他打过来：还来得及就响；人回来得太晚、或者正和别人通着话，就记一条未接
function ring(p:Persona,at:number){
  const id=callId(p,at);unhold(id);
  if(box(p.id).ring?.at===at||list(p.id).some(m=>m.id===id))return;
  if(Date.now()-at>=RING||onCall()){missed(p,at,id);return;}
  setBox(p.id,{ring:{at}},true);
  if(!(at<backAt&&pushWas()))notify(p,'邀请你视频通话');
}
// 他在某个时刻主动做的那件事：多数时候是一句话，偶尔是一通视频。只由「谁、几点」决定
const proLine=(p:Persona,at:number,noCall:boolean,q:{at:number;src?:string}[]=[])=>{
  // 经期：到了那天该说的那一刻，先说那一句（一天只这一句），比视频、报备、随口的都靠前
  const cy=cyLine(p,at,q);if(cy)return cy;
  const call=!noCall&&p.calls!==false&&!onCall()&&!box(p.id).ring&&seeded(p.id+'|c|'+Math.round(at))()<.08;
  if(call)return {text:'',src:'',call:true as const};
  // 指定了「他的报备」是哪几组字卡：他主动找你时，大约三次里有一次是报备（从那几组里抽）。没指定就和以前完全一样
  const ck=ckPool(p,at);
  if(ck.length&&seeded(p.id+'|k|'+Math.round(at))()<1/3){const r=seeded(p.id+'|kd|'+Math.round(at)),c=ck[Math.floor(r()*ck.length)];return {text:c.t,src:c.id};}
  return draw(p,'pro',at,seeded(p.id+'|d|'+Math.round(at)));
};
/** 经期快到了，提醒她一下（前一天、当天各一次，一天最多一次）。页面开着：一条小提示；页面在后台：到点弹一条通知（云端已接手就由云端弹） */
function cyRemind(p:Persona,now:number){
  const day=ymd(now),due=cyTips(box(p.id).cycle,now).find(t=>t.day===day);if(!due)return;
  const k='cx-cy-tip:'+p.id;
  try{if(localStorage.getItem(k)===day)return;}catch{return;}
  if(!document.hidden)dispatchEvent(new CustomEvent('cx-say',{detail:due.text}));
  else if(now>=due.at)remind('经期',due.text,p.id);
  else return;
  try{localStorage.setItem(k,day);}catch{/* 记不下就算了，最多再提醒一次 */}
}
/** 经期那几天他说的那一句：经期前（预计日前两天起）用一组，经期中用另一组，都是她指定的。一天一句，哪一句只由「谁、哪天」定——页面上看到的、他到点主动说的、她一告诉他就回的，是同一句 */
function cyCard(p:Persona,day:string){
  const c=box(p.id).cycle,ph=cyPhase(c,day);if(!ph)return null;
  const ids=(ph==='in'?c.decks:c.soon)??[];if(!ids.length)return null;
  const cards=S().decks.filter(d=>ids.includes(d.id)&&p.decks.includes(d.id)).flatMap(d=>d.cards.filter(x=>!x.off).map(x=>({text:x.t,src:d.id+'/'+x.id})));
  return cards.length?cards[Math.floor(seeded(p.id+'|cyd|'+day)()*cards.length)]:null;
}
/** 这一天他说过经期那句了没有：看聊天记录、交给云端还没落下来的、这一轮已经排好的 */
function cySaid(p:Persona,day:string,q:{at:number;src?:string}[]=[]){
  const all=new Set(cyDecks(box(p.id).cycle)),mine=(src?:string)=>!!src&&all.has(src.split(',')[0].split('/')[0]),d0=at0(day),on=(t:number)=>t>=d0&&t<d0+864e5;
  return q.some(x=>on(x.at)&&mine(x.src))||held.some(h=>h.pid===p.id&&on(h.at)&&mine(h.src))||list(p.id).some(m=>m.from==='ta'&&on(m.at)&&mine(m.src));
}
/** 他主动找你时：到了那天该说的那一刻（上午九点半到晚上七点半之间，由「谁、哪天」定），还没说过，就先说这一句。没指定分组就什么都不做 */
function cyLine(p:Persona,at:number,q:{at:number;src?:string}[]){
  const c=box(p.id).cycle;if(!c.decks?.length&&!c.soon?.length)return null;
  const day=ymd(at),one=cyCard(p,day);if(!one)return null;
  if(at<at0(day)+(9.5+seeded(p.id+'|cy|'+day)()*10)*3600e3||cySaid(p,day,q))return null;
  return one;
}
/** 她刚告诉他「来了」：他马上回一句（就是今天那一句，之后今天不会再说一遍）。没指定「经期中」的分组、或今天已经说过，就不说。返回他说的话 */
export function cyTell(pid:string){
  const p=who(pid);if(!p)return '';
  const day=ymd(),one=cyPhase(box(p.id).cycle,day)==='in'?cyCard(p,day):null;
  if(!one||cySaid(p,day))return '';
  if(plans.pq[p.id]){delete plans.pq[p.id];savePlans();}   // 之前排好的那几句里可能有今天这句：丢掉重排，免得到点再说一遍
  arrive(p,one.text,one.src,Date.now());
  return one.text;
}
/** 经期页上他说的那一句：就是今天那一句；没指定分组、又正在经期，就还是从他平时的话里抽一句（一天里不变） */
export function cySay(p:Persona,day=ymd()){
  const one=cyCard(p,day);if(one)return one.text;
  if(cyPhase(box(p.id).cycle,day)!=='in')return '';
  const all=plain(p).flatMap(d=>d.cards.filter(x=>!x.off).map(x=>x.t));
  return all.length?all[Math.floor(seeded(p.id+'|cys|'+day)()*all.length)]:'';
}
/** 他的报备能用的字卡：你在报备页指定的那几组里、这个时段能说的 */
function ckPool(p:Persona,t:number){
  const ids=box(p.id).ckDecks??[];if(!ids.length)return [];
  return S().decks.filter(d=>ids.includes(d.id)&&p.decks.includes(d.id)&&inWin(d.when,t)).flatMap(d=>d.cards.filter(c=>!c.off).map(c=>({id:d.id+'/'+c.id,t:c.t})));
}
/** 这条是不是他的报备：他主动发来的、出自你指定的那几组字卡 */
export function hisCheck(m:Msg,p:Persona){
  if(m.from!=='ta'||m.kind!=='text'||!m.src||!m.id.startsWith('p'+p.id.slice(-5)))return false;
  const ids=box(p.id).ckDecks??[];
  return ids.length>0&&m.src.split(',').every(s=>ids.includes(s.split('/')[0]));
}

/* 他主动找你 */
export function nextTime(p:Persona,from:number){
  const r=seeded(p.id+'|n|'+Math.round(from)),between=(a:number,b:number)=>a+r()*Math.max(0,b-a);
  let t=from+between(p.proMin,Math.max(p.proMin,p.proMax))*60000;
  for(let k=0;k<30&&asleep(p,t);k++){const d=new Date(t);d.setMinutes(0,0,0);d.setHours(d.getHours()+1);t=d.getTime()+between(2,40)*60000;}
  return Math.round(t);
}
function proactive(p:Persona,now:number){
  if(!p.pro){if(p.nextAt)setPersona(p.id,{nextAt:0},true);return;}
  if(!p.nextAt){setPersona(p.id,{nextAt:nextTime(p,now)},true);return;}
  if(now<p.nextAt)return;
  // 提前排好的（交给云端推送过的）优先用，这样聊天里出现的就是通知里那几句
  let q=plans.pq[p.id]??[];
  if(q.length&&q[0].at!==p.nextAt)q=[];
  // 离开很久回来：最多补三条，时间按他本来要发的时刻记
  let at=p.nextAt,sentN=0;
  while(at<=now&&sentN<3){
    const got=q.length&&q[0].at===at?q.shift()!:proLine(p,at,false,q);
    if(got&&'call' in got&&got.call)ring(p,at);
    else if(got)arrive(p,got.text,got.src,Math.min(at,now),undefined,false,at<backAt,proId(p,at));
    sentN++;at=q.length?q[0].at:nextTime(p,at);
  }
  if(at<=now){q=[];at=nextTime(p,now);}
  if(q.length)plans.pq[p.id]=q;else delete plans.pq[p.id];
  savePlans();
  setPersona(p.id,{nextAt:at},true);
}

/* 离开前台时：把接下来要到的话排好，交给云端按时推送 */
export function ahead():Ahead[]{
  const now=Date.now(),out:Ahead[]=[];
  // 上一回交出去、已经到点的先落进聊天里，再重新排
  settle(now,0);
  const book:Held[]=[];
  for(const p of S().personas){
    // 你发了话，他还没回
    if(p.replyAt&&!busy.has(p.id)){
      let r=plans.rq[p.id];
      if(!r||r.at!==p.replyAt)r=plans.rq[p.id]=replyPlan(p,p.replyAt);
      r.lines.forEach((l,i)=>{
        out.push({at:Math.max(r.at,now)+i*1500,title:p.name,body:l.st?'[表情]':l.text,pid:p.id,badge:1});
        book.push({pid:p.id,at:Math.max(r.at,now)+i*1500,id:rid(p,r.at,i),kind:'reply',text:l.text,src:l.src,st:l.st,re:i===0?r.quote:undefined});
      });
    }else delete plans.rq[p.id];
    // 他主动找你：排三句，和回来时「最多补三条」对得上
    if(p.pro&&p.nextAt){
      let q=plans.pq[p.id]??[];
      if(q.length&&q[0].at!==p.nextAt)q=[];
      while(q.length<3){
        const at=q.length?nextTime(p,q[q.length-1].at):p.nextAt;
        if(at>now+48*3600e3)break;
        const got=proLine(p,at,q.some(x=>x.call),q);if(!got)break;
        q.push({at,...got});
      }
      if(q.length)plans.pq[p.id]=q;else delete plans.pq[p.id];
      q.forEach(x=>{
        out.push({at:Math.max(x.at,now),title:p.name,body:x.call?'邀请你视频通话':x.text,pid:p.id,badge:1});
        book.push({pid:p.id,at:Math.max(x.at,now),id:x.call?callId(p,x.at):proId(p,x.at),kind:x.call?'call':'pro',text:x.text,src:x.src});
      });
    }else delete plans.pq[p.id];
    // 他的回信
    const bx=box(p.id);
    for(const l of bx.letters)if(l.from==='me'&&l.due&&l.plan&&!l.got)out.push({at:Math.max(l.due,now),title:p.name,body:'给你回了一封信',pid:p.id});
    if(bx.mailDue)out.push({at:Math.max(bx.mailDue,now),title:p.name,body:'给你回了一封信',pid:p.id});
    if(bx.mailPro&&bx.mailNext)out.push({at:Math.max(bx.mailNext.at,now),title:p.name,body:'给你写了一封信',pid:p.id});
    // 经期快到了的提醒（不是他说的话，不进聊天）
    for(const t of cyTips(bx.cycle,now))if(t.at>now&&t.at<now+72*3600e3)out.push({at:t.at,title:'经期',body:t.text,pid:p.id});
  }
  for(const id of Object.keys(plans.pq))if(!who(id))delete plans.pq[id];
  for(const id of Object.keys(plans.rq))if(!who(id))delete plans.rq[id];
  savePlans();
  held=book.sort((a,b)=>a.at-b.at);saveHeld();
  out.sort((a,b)=>a.at-b.at);
  // 每到一句，图标上的数字加一
  let n=S().personas.reduce((a,p)=>a+unread(p),0);
  for(const x of out)if(x.badge){n++;x.badge=n;}
  return out;
}

export function tick(){
  const now=Date.now();
  tickBody(now);
  // 账上到了点、正常流程却没说出来的，在这里补上
  settle(now,8000);
}
function tickBody(now:number){
  for(const p of S().personas){
    if(p.replyAt){
      if(now>=p.replyAt&&!busy.has(p.id)){const at=p.replyAt,r=plans.rq[p.id],planned=r&&r.at===at?r:undefined;if(r){delete plans.rq[p.id];savePlans();}setPersona(p.id,{replyAt:0},true);reply(p,at,planned);}
      else if(!busy.has(p.id)&&p.replyAt-now<Math.min(6000,(p.min*1000)*.8+1200)&&!replied(p,p.replyAt))setTyping(p.id,true);
    }else if(!busy.has(p.id)&&typing.has(p.id))setTyping(p.id,false);
    if(!busy.has(p.id)&&!p.replyAt)proactive(p,now);
    mail(p,now);
    cyRemind(p,now);
    // 响了很久没人接
    const r=box(p.id).ring;
    if(r&&now-r.at>=RING){setBox(p.id,{ring:undefined},true);missed(p,r.at+RING,callId(p,r.at));}
  }
}
// 这句不满意：给同一条消息换一句
export function redraw(pid:string,id:string){const p=who(pid);if(!p)return false;const got=draw(p,'reply',Date.now());if(!got)return false;setMsg(pid,id,{text:got.text,src:got.src});return true;}
// 立刻让他说一句（设置里试一试用）
export function nudge(pid:string){const p=who(pid);if(!p)return false;const got=draw(p,'pro',Date.now());if(!got)return false;arrive(p,got.text,got.src,Date.now());return true;}
