import {S,box,list,mapMsgs,packsFor,poke,pushMsg,setBox,setMsg,setPersona,uid,who,whens,unread,type Letter,type Persona,type When} from './db';
import {notify,blip,badge,clearNotes} from './alive';
import {pushWas,type Ahead} from './push';

const rand=(a:number,b:number)=>a+Math.random()*Math.max(0,b-a);
const inWin=(w:When,t:number)=>{const x=whens.find(y=>y.id===w)!;const h=new Date(t).getHours();return x.from<x.to?h>=x.from&&h<x.to:h>=x.from||h<x.to;};
const asleep=(p:Persona,t:number)=>{const h=new Date(t).getHours();return p.quietFrom===p.quietTo?false:p.quietFrom<p.quietTo?h>=p.quietFrom&&h<p.quietTo:h>=p.quietFrom||h<p.quietTo;};

// 这一刻他能用的字卡：他启用的分组里，时段对得上、没被屏蔽的
export function pool(p:Persona,mode:'reply'|'pro',t=Date.now()){
  return S().decks.filter(d=>p.decks.includes(d.id)&&(d.use==='both'||d.use===mode)&&inWin(d.when,t))
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
  const all=S().decks.filter(d=>p.decks.includes(d.id)).flatMap(d=>d.cards.filter(c=>!c.off).map(c=>c.t));
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
const letterText=(p:Persona,len:number|undefined)=>{const [a,b]=pickOf(mailLens,len,1).r;return lines(p,a+Math.floor(Math.random()*(b-a+1))).join('\n');};
/** 寄出一封信：回信的时间和内容当场定好，存在这封信上，到点再送到 */
export function sendLetter(p:Persona,text:string,re?:string):Letter{
  const b=box(p.id),now=Date.now(),[a,z]=pickOf(mailPaces,b.mailPace,0).r,plan=letterText(p,b.mailLen);
  const l:Letter={id:uid(),from:'me',text,at:now,read:true,...(re?{re}:{}),...(plan?{due:awakeAt(p,now+rand(a,z)*60000),plan}:{})};
  setBox(p.id,{letters:[...b.letters,l]});
  return l;
}
const nextPro=(p:Persona,from:number,pro:number|undefined,len:number|undefined)=>{const [a,z]=pickOf(mailPros,pro,0).r,text=a?letterText(p,len):'';return text?{at:awakeAt(p,from+rand(a,z)*60000),text}:undefined;};
/** 改了「他会不会主动写信」之后：重新排下一封 */
export function planProMail(p:Persona){const b=box(p.id);setBox(p.id,{mailNext:nextPro(p,Date.now(),b.mailPro,b.mailLen)});}
// 到点的信送到：你寄出的信各回一封；他主动写的按间隔来
function mail(p:Persona,now:number){
  const b=box(p.id),gone=new Set(b.mailGone??[]),have=new Set(b.letters.map(l=>l.id));
  const add:Letter[]=[];let letters=b.letters,first=0,pro=false,patch:Partial<typeof b>={};
  const due=letters.filter(l=>l.from==='me'&&l.due&&l.plan&&!l.got&&now>=l.due);
  if(due.length){
    for(const l of due){const id='r'+l.id;if(!have.has(id)&&!gone.has(id)){add.push({id,from:'ta',text:l.plan!,at:l.due!,re:l.id});first=first?Math.min(first,l.due!):l.due!;}}
    const ids=new Set(due.map(l=>l.id));letters=letters.map(l=>ids.has(l.id)?{...l,got:true}:l);
  }
  // 更新之前寄出、还没等到回信的那一封
  if(b.mailDue&&now>=b.mailDue){const t=letterText(p,b.mailLen);if(t){add.push({id:uid(),from:'ta',text:t,at:now});first=first||b.mailDue;}patch.mailDue=0;}
  if(pickOf(mailPros,b.mailPro,0).r[0]){
    if(!b.mailNext){const n=nextPro(p,now,b.mailPro,b.mailLen);if(n)patch.mailNext=n;}   // 没有字卡时排不出来，就先不排
    else if(now>=b.mailNext.at){
      const id='p'+b.mailNext.at;if(!have.has(id)&&!gone.has(id)){add.push({id,from:'ta',text:b.mailNext.text,at:b.mailNext.at,pro:true});pro=!first;first=first||b.mailNext.at;}
      patch.mailNext=nextPro(p,now,b.mailPro,b.mailLen);
    }
  }
  if(!add.length&&!due.length&&!Object.keys(patch).length)return;
  setBox(p.id,{...patch,letters:[...letters,...add].sort((x,y)=>x.at-y.at)});
  if(add.length&&!(pushWas()&&first<backAt))notify(p,pro?'给你写了一封信':'给你回了一封信');
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
  if(unread(p)>0){setPersona(pid,{readAt:Math.max(Date.now(),list(pid).at(-1)?.at??0)});clearNotes(pid);}
  badge();
}

// late：这句是离开期间该到的、现在补上的。云端推送开着的话当时已经推过，不再弹一遍通知
function arrive(p:Persona,text:string,src:string,at:number,re?:string,sticker=false,late=false,id?:string){
  // 这一句别的设备已经替他说过、同步过来了：不再说一遍
  if(id){unhold(id);if(list(p.id).some(m=>m.id===id))return;}
  // 补发的话不能排到已有消息的前面
  at=Math.max(at,(list(p.id).at(-1)?.at??0)+1);
  if(sticker){pushMsg({pid:p.id,from:'ta',kind:'img',text,at,st:true,...(id?{id}:{})});text='[表情]';}
  else pushMsg({pid:p.id,from:'ta',kind:'text',text,at,src,re,...(id?{id}:{})});
  const here=!document.hidden&&active===p.id;
  if(here){setPersona(p.id,{readAt:Math.max(Date.now(),at)});if(!late)blip();}
  else if(!(late&&pushWas()))notify(p,text);
  badge();
}

/* 你发了一条之后 */
export function sent(pid:string){
  const p=who(pid);if(!p)return;
  const now=Date.now(),d=rand(p.min,p.max)*1000;
  const seenIn=rand(500,Math.min(2600,Math.max(700,d*.5)));
  setTimeout(()=>seen(pid),seenIn);
  // 已读不回：这一次就停在已读
  if(Math.random()<p.ghost){if(p.replyAt)setPersona(pid,{replyAt:0});return;}
  // 正聊着的时候不插进一条主动消息：把下一次主动的时间从现在重新算
  setPersona(pid,{...(!p.replyAt||p.replyAt<now?{replyAt:now+Math.max(1400,d)}:{}),...(p.pro?{nextAt:nextTime(p,now)}:{})});
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
    busy.delete(p.id);return;
  }
  let i=0;
  const step=()=>{
    const now=who(p.id)??p,got=plan.lines[i];
    if(got)arrive(now,got.text,got.src,Date.now(),i===0?plan.quote:undefined,!!got.st,false,rid(p,plan.at,i));
    i++;
    if(got&&i<n){setTyping(p.id,true);setTimeout(step,rand(900,2400));}
    else{setTyping(p.id,false);busy.delete(p.id);}
  };
  step();
}

/* ── 视频通话：接通之后一直挂着，只有你能挂。开始的时刻存着，划掉小鹿、锁屏、换设备，回来都还在通话中 ── */
const RING=45000;
export const onCall=()=>S().personas.find(p=>box(p.id).call);
export const ringing=()=>S().personas.find(p=>{const r=box(p.id).ring;return !!r&&Date.now()-r.at<RING;});
export const clock=(ms:number)=>{const s=Math.max(0,Math.floor(ms/1000)),h=Math.floor(s/3600),m=Math.floor(s%3600/60),pad=(n:number)=>String(n).padStart(2,'0');return (h?h+':'+pad(m):pad(m))+':'+pad(s%60);};
const long=(ms:number)=>{const s=Math.max(1,Math.round(ms/1000));return s<60?`${s} 秒`:s<3600?`${Math.floor(s/60)} 分 ${s%60} 秒`:`${Math.floor(s/3600)} 小时 ${Math.floor(s%3600/60)} 分`;};
export function callStart(pid:string){if(onCall()||!who(pid))return false;setBox(pid,{call:{at:Date.now()},ring:undefined});return true;}
export function callEnd(pid:string){
  const c=box(pid).call;if(!c)return;
  setBox(pid,{call:undefined});
  pushMsg({pid,from:'me',kind:'tip',text:`视频通话 ${long(Date.now()-c.at)}`,at:Date.now()});
}
export function callDecline(pid:string){
  if(!box(pid).ring)return;
  setBox(pid,{ring:undefined});
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
  setBox(p.id,{ring:{at}});
  if(!(at<backAt&&pushWas()))notify(p,'邀请你视频通话');
}
// 他在某个时刻主动做的那件事：多数时候是一句话，偶尔是一通视频。只由「谁、几点」决定
const proLine=(p:Persona,at:number,noCall:boolean)=>{
  const call=!noCall&&p.calls!==false&&!onCall()&&!box(p.id).ring&&seeded(p.id+'|c|'+Math.round(at))()<.08;
  return call?{text:'',src:'',call:true as const}:draw(p,'pro',at,seeded(p.id+'|d|'+Math.round(at)));
};

/* 他主动找你 */
export function nextTime(p:Persona,from:number){
  const r=seeded(p.id+'|n|'+Math.round(from)),between=(a:number,b:number)=>a+r()*Math.max(0,b-a);
  let t=from+between(p.proMin,Math.max(p.proMin,p.proMax))*60000;
  for(let k=0;k<30&&asleep(p,t);k++){const d=new Date(t);d.setMinutes(0,0,0);d.setHours(d.getHours()+1);t=d.getTime()+between(2,40)*60000;}
  return Math.round(t);
}
function proactive(p:Persona,now:number){
  if(!p.pro){if(p.nextAt)setPersona(p.id,{nextAt:0});return;}
  if(!p.nextAt){setPersona(p.id,{nextAt:nextTime(p,now)});return;}
  if(now<p.nextAt)return;
  // 提前排好的（交给云端推送过的）优先用，这样聊天里出现的就是通知里那几句
  let q=plans.pq[p.id]??[];
  if(q.length&&q[0].at!==p.nextAt)q=[];
  // 离开很久回来：最多补三条，时间按他本来要发的时刻记
  let at=p.nextAt,sentN=0;
  while(at<=now&&sentN<3){
    const got=q.length&&q[0].at===at?q.shift()!:proLine(p,at,false);
    if(got&&'call' in got&&got.call)ring(p,at);
    else if(got)arrive(p,got.text,got.src,Math.min(at,now),undefined,false,at<backAt,proId(p,at));
    sentN++;at=q.length?q[0].at:nextTime(p,at);
  }
  if(at<=now){q=[];at=nextTime(p,now);}
  if(q.length)plans.pq[p.id]=q;else delete plans.pq[p.id];
  savePlans();
  setPersona(p.id,{nextAt:at});
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
        const got=proLine(p,at,q.some(x=>x.call));if(!got)break;
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
      if(now>=p.replyAt&&!busy.has(p.id)){const at=p.replyAt,r=plans.rq[p.id],planned=r&&r.at===at?r:undefined;if(r){delete plans.rq[p.id];savePlans();}setPersona(p.id,{replyAt:0});reply(p,at,planned);}
      else if(p.replyAt-now<Math.min(6000,(p.min*1000)*.8+1200))setTyping(p.id,true);
    }
    if(!busy.has(p.id)&&!p.replyAt)proactive(p,now);
    mail(p,now);
    // 响了很久没人接
    const r=box(p.id).ring;
    if(r&&now-r.at>=RING){setBox(p.id,{ring:undefined});missed(p,r.at+RING,callId(p,r.at));}
  }
}
// 这句不满意：给同一条消息换一句
export function redraw(pid:string,id:string){const p=who(pid);if(!p)return false;const got=draw(p,'reply',Date.now());if(!got)return false;setMsg(pid,id,{text:got.text,src:got.src});return true;}
// 立刻让他说一句（设置里试一试用）
export function nudge(pid:string){const p=who(pid);if(!p)return false;const got=draw(p,'pro',Date.now());if(!got)return false;arrive(p,got.text,got.src,Date.now());return true;}
