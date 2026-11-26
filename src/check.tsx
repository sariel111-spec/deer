// 报备：两个人互相说一声「我在做什么」。
// 你的：点一句常用的（或自己写），聊天里是一张小卡，他照常回你；到了日程的钟点，最上面多一条「日程」可以直接点。
// 他的：你指定他哪几组字卡算报备，他主动发来的话出自这几组，就也是一张报备小卡，记在这里。
import {useEffect,useMemo,useState} from 'react';
import {ChevronDown,ChevronLeft,Plus,SlidersHorizontal,X} from 'lucide-react';
import {S,box,list,pushMsg,setBox,setPrefs,uid,useVer,type Msg,type Persona,type Plan} from './db';
import {hisCheck,sent} from './engine';
import {Avatar,backTo} from './App';
import {Sheet,say} from './pages';
import {ymd} from './note';

export const quickDefault=['起床了','出门了','到了','在吃饭','在忙','下班了','到家了','要睡了'];
export const quickOf=()=>S().prefs.quick??quickDefault;
const hm=(t:number)=>new Date(t).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',hour12:false});
const mins=(s:string)=>{const [h,m]=s.split(':').map(Number);return (h||0)*60+(m||0);};
const endOf=(x:Plan)=>mins(x.to)>mins(x.from)?mins(x.to):24*60;   // 写成跨过半夜的，今天这一段算到零点
const week='日一二三四五六';
const daysText=(d:number[])=>d.length===7?'每天':[1,2,3,4,5].every(x=>d.includes(x))&&d.length===5?'周一到周五':'周'+[1,2,3,4,5,6,0].filter(x=>d.includes(x)).map(x=>week[x]).join(' ');
const dayHead=(t:number)=>{const d=new Date(t),n=new Date();return `${d.getFullYear()===n.getFullYear()?'':d.getFullYear()+'年'}${d.getMonth()+1}月${d.getDate()}日 周${week[d.getDay()]}`;};

/** 今天的日程，按开始的钟点排 */
export const plansToday=(d=new Date())=>(S().prefs.plan??[]).filter(x=>x.days.includes(d.getDay())).sort((a,b)=>mins(a.from)-mins(b.from));
/** 正在进行的那条日程（提前十分钟就算） */
export function planNow(d=new Date()){const n=d.getHours()*60+d.getMinutes();return plansToday(d).find(x=>n>=mins(x.from)-10&&n<endOf(x));}
const planKey=(x:Plan)=>x.id+'@'+ymd();
const planText=(x:Plan)=>`${x.name} ${x.from}–${x.to}`;

/** 报备一句：聊天里落一张小卡，他照常回；这里记一笔（自动合并的记录，不算「这台设备改过设置」） */
export function tell(p:Persona,text:string,plan?:Plan){
  const x=text.trim();if(!x)return false;
  const now=Date.now(),m=pushMsg({pid:p.id,from:'me',kind:'text',text:x,at:now,ck:true});sent(p.id);
  setBox(p.id,{checks:[...box(p.id).checks,{at:now,text:x,id:m.id,...(plan?{plan:planKey(plan)}:{})}].slice(-400)},true);
  return true;
}

/** 报备的那一小块：日程（到点才有）、常用的几句、自己写。报备页和聊天里的小面板都用它 */
export function Tell({p,done}:{p:Persona;done:(t:string)=>void}){
  useVer();
  const [t,setT]=useState('');
  const now=planNow(),told=!!now&&box(p.id).checks.some(c=>c.plan===planKey(now));
  const go=(x:string,pl?:Plan)=>{if(tell(p,x,pl)){setT('');done(x);}};
  return <div className="ck-tell">
    {now&&!told&&<button className="ck-now" onClick={()=>go(planText(now),now)}><span><small>日程 · {now.from}–{now.to}</small>{now.name}</span><b>告诉他</b></button>}
    <div className="chips" role="group" aria-label="常用的报备">{quickOf().map(q=><button key={q} className="chip" onClick={()=>go(q)}>{q}</button>)}</div>
    <form className="newdeck" onSubmit={e=>{e.preventDefault();go(t);}}>
      <input value={t} onChange={e=>setT(e.target.value)} placeholder="或者自己写" aria-label="自己写一句报备" enterKeyHint="send" maxLength={200}/>
      <button className="btn sm" disabled={!t.trim()}>发送</button>
    </form>
  </div>;
}

type Row={key:string;at:number;who:'me'|'ta'|'plan';text:string;back?:string;sub?:string};
/** 他回的第一句：这条报备之后、你下一次开口之前 */
function backOf(ms:Msg[],i:number){
  for(let k=i+1;k<ms.length;k++){
    const m=ms[k];if(m.at-ms[i].at>3*3600000)break;
    if(m.from==='me'){if(m.kind!=='tip')break;continue;}
    if(m.kind==='text')return m.text;if(m.kind==='img'&&m.st)return '[表情]';
  }
}
function rowsOf(p:Persona):Row[]{
  const ms=list(p.id),at=new Map(ms.map((m,i)=>[m.id,i])),out:Row[]=[];
  for(const c of box(p.id).checks){
    const i=c.id?at.get(c.id):undefined;
    if(i!==undefined&&ms[i].kind==='tip')continue;   // 在聊天里撤回了的不算
    out.push({key:'m'+c.at+c.text,at:c.at,who:'me',text:c.text,back:i===undefined?undefined:backOf(ms,i)});
  }
  for(const m of ms)if(hisCheck(m,p))out.push({key:m.id,at:m.at,who:'ta',text:m.text});
  return out.sort((a,b)=>a.at-b.at);
}

export function CheckPage({p}:{p:Persona}){
  const ver=useVer();
  const [conf,setConf]=useState(false),[older,setOlder]=useState(false);
  const [,tick]=useState(0);
  useEffect(()=>{const id=setInterval(()=>tick(x=>x+1),30000);return()=>clearInterval(id);},[]);   // 到了日程的钟点，页面自己跟上
  const all=useMemo(()=>rowsOf(p),[p.id,ver]);   // eslint-disable-line react-hooks/exhaustive-deps
  const today=ymd(),d0=new Date();d0.setHours(0,0,0,0);
  // 今天：报备 + 今天的日程，照钟点从早到晚。已经报过的日程不再单列
  const told=new Set(box(p.id).checks.map(c=>c.plan).filter(Boolean));
  const plans:Row[]=plansToday().filter(x=>!told.has(planKey(x))&&x!==planNow()).map(x=>({key:'p'+x.id,at:d0.getTime()+mins(x.from)*60000,who:'plan',text:x.name,sub:`${x.from}–${x.to}`}));
  const day=[...all.filter(r=>ymd(new Date(r.at))===today),...plans].sort((a,b)=>a.at-b.at);
  const past=useMemo(()=>{
    const g=new Map<string,Row[]>();
    for(const r of all){const k=ymd(new Date(r.at));if(k===today)continue;g.set(k,[...(g.get(k)??[]),r]);}
    return [...g.entries()].sort((a,b)=>a[0]<b[0]?1:-1);
  },[all,today]);
  const line=(r:Row)=><li key={r.key} className={r.who}>
    <time>{r.who==='plan'?r.sub!.slice(0,5):hm(r.at)}</time>
    {r.who==='ta'&&<Avatar id={p.avatar} name={p.name} size={22}/>}
    <div><p>{r.text}</p>{r.back&&<small>{p.name}：{r.back}</small>}{r.who==='plan'&&<small>日程 · 到 {r.sub!.slice(6)}</small>}</div>
  </li>;
  return <main className="page sub ck" style={{'--accent':p.accent} as React.CSSProperties}>
    <header className="bar"><a className="ico" href={'#/us/'+p.id} onClick={backTo('#/us/'+p.id)} aria-label="返回"><ChevronLeft size={28} strokeWidth={1.8}/></a><h1>报备</h1>
      <button className="ico" onClick={()=>setConf(true)} aria-label="报备的设置"><SlidersHorizontal size={22} strokeWidth={1.7}/></button></header>
    <Tell p={p} done={()=>say('告诉他了')}/>
    <h3>今天</h3>
    {day.length?<ul className="ck-line">{day.map(line)}</ul>:<p className="hint">今天还没有报备。</p>}
    {past.length>0&&<button className="ck-more" aria-expanded={older} onClick={()=>setOlder(!older)}>更早<ChevronDown size={16} strokeWidth={1.8}/></button>}
    {older&&past.map(([k,rs])=><section key={k} className="ck-day"><h3>{dayHead(rs[0].at)}</h3><ul className="ck-line">{rs.map(line)}</ul></section>)}
    {conf&&<Conf p={p} close={()=>setConf(false)}/>}
  </main>;
}

/* 设置：常用的几句、我的日程、他的报备 */
function Conf({p,close}:{p:Persona;close:()=>void}){
  useVer();
  const st=S(),quick=quickOf(),plan=st.prefs.plan??[],b=box(p.id);
  const [q,setQ]=useState(''),[ed,setEd]=useState<Plan|null>(null);
  const addQ=()=>{const x=q.trim();if(!x)return;if(!quick.includes(x))setPrefs({quick:[...quick,x]});setQ('');};
  const decks=st.decks.filter(d=>p.decks.includes(d.id)),on=b.ckDecks??[];
  const flip=(id:string)=>setBox(p.id,{ckDecks:on.includes(id)?on.filter(x=>x!==id):[...on,id]});
  if(ed)return <Sheet title={plan.some(x=>x.id===ed.id)?'改这条日程':'加一条日程'} close={()=>setEd(null)}><PlanForm it={ed} isNew={!plan.some(x=>x.id===ed.id)}
    save={x=>{setPrefs({plan:plan.some(y=>y.id===x.id)?plan.map(y=>y.id===x.id?x:y):[...plan,x]});setEd(null);}}
    drop={()=>{setPrefs({plan:plan.filter(y=>y.id!==ed.id)});setEd(null);}}/></Sheet>;
  return <Sheet title="报备的设置" close={close}>
    <h3>常用的几句</h3>
    <div className="chips" role="group" aria-label="常用的几句">{quick.map(x=><button key={x} className="chip ck-x" onClick={()=>setPrefs({quick:quick.filter(y=>y!==x)})} aria-label={`去掉「${x}」`}>{x}<X size={13} strokeWidth={2}/></button>)}</div>
    <form className="newdeck" onSubmit={e=>{e.preventDefault();addQ();}}><input value={q} onChange={e=>setQ(e.target.value)} placeholder="加一句，比如 去图书馆了" aria-label="加一句常用的" maxLength={40}/><button className="btn sm" disabled={!q.trim()}>加上</button></form>
    {st.prefs.quick&&<p className="hint"><button className="linkish" onClick={()=>setPrefs({quick:undefined})}>换回默认的那几句</button></p>}

    <h3>我的日程</h3>
    <p className="lede">每周固定的事，比如上课、上班。到了钟点，点一下就告诉他。</p>
    {plan.length>0&&<ul className="ck-plans">{[...plan].sort((x,y)=>mins(x.from)-mins(y.from)).map(x=><li key={x.id}><button onClick={()=>setEd(x)}><span>{x.name}<small>{daysText(x.days)} · {x.from}–{x.to}</small></span></button></li>)}</ul>}
    <button className="chip ck-add" onClick={()=>setEd({id:uid(),name:'',days:[],from:'09:00',to:'10:00'})}><Plus size={15} strokeWidth={2}/>加一条日程</button>

    <h3>{p.name} 的报备</h3>
    <p className="lede">选他哪几组字卡算报备。选了，他主动找你时会不时从这几组里说一句。</p>
    <div className="chips" role="group" aria-label="他哪几组字卡算报备">{decks.map(d=><button key={d.id} className="chip" aria-pressed={on.includes(d.id)} onClick={()=>flip(d.id)}>{d.name}<small>{d.cards.filter(c=>!c.off).length}</small></button>)}</div>
    {!decks.length&&<p className="hint">他还没有字卡。</p>}
  </Sheet>;
}

function PlanForm({it,isNew,save,drop}:{it:Plan;isNew:boolean;save:(x:Plan)=>void;drop:()=>void}){
  const [x,setX]=useState(it),[sure,setSure]=useState(false);
  const ok=x.name.trim()&&x.days.length>0&&/^\d\d:\d\d$/.test(x.from)&&/^\d\d:\d\d$/.test(x.to)&&x.from!==x.to;
  const day=(d:number)=>setX({...x,days:x.days.includes(d)?x.days.filter(y=>y!==d):[...x.days,d]});
  return <form className="ck-form" onSubmit={e=>{e.preventDefault();if(ok)save({...x,name:x.name.trim()});}}>
    <label className="field"><span>做什么</span><input value={x.name} onChange={e=>setX({...x,name:e.target.value})} placeholder="上课、上班、健身…" aria-label="这条日程做什么" maxLength={30} autoFocus={isNew}/></label>
    <div className="field"><span>周几</span><div className="ck-days" role="group" aria-label="周几">{[1,2,3,4,5,6,0].map(d=><button type="button" key={d} aria-pressed={x.days.includes(d)} onClick={()=>day(d)} aria-label={'周'+week[d]}>{week[d]}</button>)}</div></div>
    <div className="ck-times">
      <label className="field"><span>从</span><input type="time" value={x.from} onChange={e=>setX({...x,from:e.target.value})} aria-label="几点开始" required/></label>
      <label className="field"><span>到</span><input type="time" value={x.to} onChange={e=>setX({...x,to:e.target.value})} aria-label="几点结束" required/></label>
    </div>
    <button className="btn" disabled={!ok}>存下来</button>
    {!isNew&&<button type="button" className="btn ghost danger" onClick={()=>sure?drop():setSure(true)}>{sure?'再点一次，删掉这条日程':'删掉这条日程'}</button>}
  </form>;
}
