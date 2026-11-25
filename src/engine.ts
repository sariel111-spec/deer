import {S,box,list,mapMsgs,packsFor,poke,pushMsg,setBox,setMsg,setPersona,uid,who,whens,unread,type Persona,type When} from './db';
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
function draw(p:Persona,mode:'reply'|'pro',t:number):{text:string;src:string}|null{
  const all=pool(p,mode,t);if(!all.length)return null;
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
// 你写了信之后，过一阵他回一封：几句字卡连成一封
function mail(p:Persona,now:number){
  const b=box(p.id);if(!b.mailDue||now<b.mailDue)return;
  const ls=lines(p,3+Math.floor(Math.random()*3));
  if(!ls.length){setBox(p.id,{mailDue:0});return;}
  setBox(p.id,{mailDue:0,letters:[...b.letters,{id:uid(),from:'ta',text:ls.join('\n'),at:now}]});
  if(!(pushWas()&&b.mailDue<backAt))notify(p,'给你回了一封信');
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
function arrive(p:Persona,text:string,src:string,at:number,re?:string,sticker=false,late=false){
  // 补发的话不能排到已有消息的前面
  at=Math.max(at,(list(p.id).at(-1)?.at??0)+1);
  if(sticker){pushMsg({pid:p.id,from:'ta',kind:'img',text,at,st:true});text='[表情]';}
  else pushMsg({pid:p.id,from:'ta',kind:'text',text,at,src,re});
  const here=!document.hidden&&active===p.id;
  if(here){setPersona(p.id,{readAt:Math.max(Date.now(),at)});blip();}
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
function replyLine(p:Persona,i:number,t:number):Line|null{
  const packs=packsFor(p.id).filter(k=>k.his!==false).flatMap(k=>k.ids);
  // 有表情包的话，他偶尔回一张（不会连着第一句就发）
  if(i>0&&p.stick!==false&&packs.length&&Math.random()<.22)return {text:packs[Math.floor(Math.random()*packs.length)],src:'',st:true};
  return draw(p,'reply',t);
}
function replyPlan(p:Persona,at:number):Reply{
  const n=1+Math.floor(Math.random()*Math.max(1,p.burst)),lines:Line[]=[];
  for(let i=0;i<n;i++){const l=replyLine(p,i,at);if(!l)break;lines.push(l);}
  const mine=list(p.id).filter(m=>m.from==='me'&&m.kind!=='tip');
  return {at,lines,quote:mine.length&&Math.random()<.12?mine[mine.length-1].id:undefined};
}
// planned：离开前台时提前排好、交给云端推送过的那几句
function reply(p:Persona,planned?:Reply){
  if(busy.has(p.id))return;busy.add(p.id);
  seen(p.id);
  if(planned&&planned.at<backAt){
    // 离开期间他已经回了：按原定的时刻一口气补上
    planned.lines.forEach((l,i)=>arrive(who(p.id)??p,l.text,l.src,planned.at+i*1500,i===0?planned.quote:undefined,!!l.st,true));
    busy.delete(p.id);return;
  }
  const now0=planned??replyPlan(p,Date.now()),n=now0.lines.length;
  let i=0;
  const step=()=>{
    const now=who(p.id)??p,got=now0.lines[i];
    if(got)arrive(now,got.text,got.src,Date.now(),i===0?now0.quote:undefined,!!got.st);
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
function missed(p:Persona,at:number){
  pushMsg({pid:p.id,from:'ta',kind:'tip',text:'未接视频通话',at:Math.max(Math.min(at,Date.now()),(list(p.id).at(-1)?.at??0)+1)});
  badge();
}
// 他打过来：还来得及就响；人回来得太晚、或者正和别人通着话，就记一条未接
function ring(p:Persona,at:number){
  if(Date.now()-at>=RING||onCall()){missed(p,at);return;}
  setBox(p.id,{ring:{at}});
  if(!(at<backAt&&pushWas()))notify(p,'邀请你视频通话');
}
const maybeCall=(p:Persona)=>p.calls!==false&&!onCall()&&!box(p.id).ring&&Math.random()<.08?{text:'',src:'',call:true as const}:null;

/* 他主动找你 */
export function nextTime(p:Persona,from:number){
  let t=from+rand(p.proMin,Math.max(p.proMin,p.proMax))*60000;
  for(let k=0;k<30&&asleep(p,t);k++){const d=new Date(t);d.setMinutes(0,0,0);d.setHours(d.getHours()+1);t=d.getTime()+rand(2,40)*60000;}
  return t;
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
    const got=q.length&&q[0].at===at?q.shift()!:maybeCall(p)??draw(p,'pro',at);
    if(got&&'call' in got&&got.call)ring(p,at);
    else if(got)arrive(p,got.text,got.src,Math.min(at,now),undefined,false,at<backAt);
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
  for(const p of S().personas){
    // 你发了话，他还没回
    if(p.replyAt&&!busy.has(p.id)){
      let r=plans.rq[p.id];
      if(!r||r.at!==p.replyAt)r=plans.rq[p.id]=replyPlan(p,p.replyAt);
      r.lines.forEach((l,i)=>out.push({at:Math.max(r.at,now)+i*1500,title:p.name,body:l.st?'[表情]':l.text,pid:p.id,badge:1}));
    }else delete plans.rq[p.id];
    // 他主动找你：排三句，和回来时「最多补三条」对得上
    if(p.pro&&p.nextAt){
      let q=plans.pq[p.id]??[];
      if(q.length&&q[0].at!==p.nextAt)q=[];
      while(q.length<3){
        const at=q.length?nextTime(p,q[q.length-1].at):p.nextAt;
        if(at>now+48*3600e3)break;
        const got=(q.some(x=>x.call)?null:maybeCall(p))??draw(p,'pro',at);if(!got)break;
        q.push({at,...got});
      }
      if(q.length)plans.pq[p.id]=q;else delete plans.pq[p.id];
      q.forEach(x=>out.push({at:Math.max(x.at,now),title:p.name,body:x.call?'邀请你视频通话':x.text,pid:p.id,badge:1}));
    }else delete plans.pq[p.id];
    // 他的回信
    const due=box(p.id).mailDue;
    if(due)out.push({at:Math.max(due,now),title:p.name,body:'给你回了一封信',pid:p.id});
  }
  for(const id of Object.keys(plans.pq))if(!who(id))delete plans.pq[id];
  for(const id of Object.keys(plans.rq))if(!who(id))delete plans.rq[id];
  savePlans();
  out.sort((a,b)=>a.at-b.at);
  // 每到一句，图标上的数字加一
  let n=S().personas.reduce((a,p)=>a+unread(p),0);
  for(const x of out)if(x.badge){n++;x.badge=n;}
  return out;
}

export function tick(){
  const now=Date.now();
  for(const p of S().personas){
    if(p.replyAt){
      if(now>=p.replyAt){const r=plans.rq[p.id],planned=r&&r.at===p.replyAt?r:undefined;if(r){delete plans.rq[p.id];savePlans();}setPersona(p.id,{replyAt:0});reply(p,planned);}
      else if(p.replyAt-now<Math.min(6000,(p.min*1000)*.8+1200))setTyping(p.id,true);
    }
    if(!busy.has(p.id)&&!p.replyAt)proactive(p,now);
    mail(p,now);
    // 响了很久没人接
    const r=box(p.id).ring;
    if(r&&now-r.at>=RING){setBox(p.id,{ring:undefined});missed(p,r.at+RING);}
  }
}
// 这句不满意：给同一条消息换一句
export function redraw(pid:string,id:string){const p=who(pid);if(!p)return false;const got=draw(p,'reply',Date.now());if(!got)return false;setMsg(pid,id,{text:got.text,src:got.src});return true;}
// 立刻让他说一句（设置里试一试用）
export function nudge(pid:string){const p=who(pid);if(!p)return false;const got=draw(p,'pro',Date.now());if(!got)return false;arrive(p,got.text,got.src,Date.now());return true;}
