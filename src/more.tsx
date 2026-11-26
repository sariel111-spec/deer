import {useEffect,useMemo,useRef,useState} from 'react';
import {CalendarHeart,ChevronLeft,Droplet,Mail,MapPin,MessageCircleQuestion,Plus,Sparkles,SquarePen,Timer,Trash2,type LucideIcon} from 'lucide-react';
import {S,box,list,pushMsg,putImage,setBox,uid,useVer,type Day,type Persona} from './db';
import {lines,sent} from './engine';
import {Avatar,Pic,backTo,dayLabel} from './App';
import {Num,Sheet,say} from './pages';
import {useTwice} from './ui';
import {TarotPage} from './tarotpage';
import {MailBox} from './mail';
import {CheckPage} from './check';

// 主页上摆出来的全部功能。顺序就是宫格里的顺序
export const feats:{id:string;name:string;icon:LucideIcon}[]=[
  {id:'mail',name:'信箱',icon:Mail},{id:'check',name:'报备',icon:MapPin},{id:'draw',name:'塔罗',icon:Sparkles},{id:'days',name:'纪念日',icon:CalendarHeart},
  {id:'ask',name:'问问他',icon:MessageCircleQuestion},{id:'focus',name:'专注',icon:Timer},{id:'cycle',name:'经期',icon:Droplet},
];
/** 主页那一排默认放哪几个（没自己挑过的时候） */
export const homeDefault=['mail','check','draw','days','ask'];

const ymd=(d=new Date())=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const at0=(s:string)=>new Date(s+'T00:00:00').getTime();
const gap=(a:string,b:string)=>Math.round((at0(b)-at0(a))/864e5);
const mmss=(s:number)=>`${String(Math.floor(s/60)).padStart(2,'0')}:${String(Math.floor(s%60)).padStart(2,'0')}`;
const md=(t:number)=>{const d=new Date(t);return `${d.getMonth()+1}月${d.getDate()}日 周${'日一二三四五六'[d.getDay()]}`;};

export function Sub({p,title,act,children,cls=''}:{p:Persona;title:string;act?:React.ReactNode;children:React.ReactNode;cls?:string}){
  return <main className={`page sub ${cls}`} style={{'--accent':p.accent} as React.CSSProperties}>
    <header className="bar"><a className="ico" href={'#/us/'+p.id} onClick={backTo('#/us/'+p.id)} aria-label="返回"><ChevronLeft size={28} strokeWidth={1.8}/></a><h1>{title}</h1>{act}</header>
    {children}
  </main>;
}
const AddBtn=({on,label,pen}:{on:()=>void;label:string;pen?:boolean})=><button className="ico" onClick={on} aria-label={label}>{pen?<SquarePen size={23} strokeWidth={1.7}/>:<Plus size={26} strokeWidth={1.7}/>}</button>;

/* 纪念日 */
function count(d:{date:string;yearly:boolean}){
  const today=ymd();
  if(d.yearly){const n=new Date(),o=new Date(d.date+'T00:00:00');let next=new Date(n.getFullYear(),o.getMonth(),o.getDate());
    if(ymd(next)<today)next=new Date(n.getFullYear()+1,o.getMonth(),o.getDate());const k=gap(today,ymd(next));return {n:k,label:k?'天后':'就是今天'};}
  const k=gap(d.date,today);return k>=0?{n:k+1,label:'天了'}:{n:-k,label:'天后'};
}
function DaysPage({p}:{p:Persona}){
  const b=box(p.id);
  const [ed,setEd]=useState<Day|null>(null),[armed,twice]=useTwice();
  const all:(Day&{fixed?:boolean})[]=[...(p.since?[{id:'since',name:'在一起',date:p.since,yearly:false,fixed:true}]:[]),...b.days];
  const save=()=>{if(!ed||!ed.name.trim()||!ed.date)return;setBox(p.id,{days:b.days.some(x=>x.id===ed.id)?b.days.map(x=>x.id===ed.id?ed:x):[...b.days,ed]});setEd(null);};
  return <Sub p={p} title="纪念日" act={<AddBtn on={()=>setEd({id:uid(),name:'',date:ymd(),yearly:true})} label="添加一个日子"/>}>
    {all.length?<ul className="days">{all.map(d=>{const c=count(d);return <li key={d.id}><button onClick={()=>{if(d.fixed)say('这个日子在「编辑主页」里改');else setEd(d);}}>
      <span className="who"><b>{d.name}</b><span>{d.date.replace(/-/g,'.')}{d.yearly?' · 每年':''}</span></span>
      <span className="big">{c.n>0&&<b>{c.n}</b>}<small>{c.label}</small></span>
    </button></li>;})}</ul>:<p className="empty">生日、第一次见面、想一起倒数的日子，都可以放在这里。</p>}
    {ed&&<Sheet title="日子" close={()=>setEd(null)}>
      <label className="field"><span>名字</span><input value={ed.name} onChange={e=>setEd({...ed,name:e.target.value})} onKeyDown={e=>{if(e.key==='Enter'&&!e.nativeEvent.isComposing)save();}} placeholder="比如 他的生日" autoFocus={!ed.name}/></label>
      <label className="field"><span>哪一天</span><input type="date" value={ed.date} onChange={e=>setEd({...ed,date:e.target.value})}/></label>
      <label className="line"><span>每年都过</span><input type="checkbox" className="switch" checked={ed.yearly} onChange={e=>setEd({...ed,yearly:e.target.checked})}/></label>
      <button className="btn" onClick={save} disabled={!ed.name.trim()||!ed.date}>存下</button>
      {b.days.some(x=>x.id===ed.id)&&<div className="rowbtn"><button className="chip danger" onClick={twice('day',()=>{setBox(p.id,{days:b.days.filter(x=>x.id!==ed.id)});setEd(null);})}>{armed==='day'?'再点一次，删掉这个日子':'删掉这个日子'}</button></div>}
    </Sheet>}
  </Sub>;
}

/* 帮我选 */
function PickPage({p}:{p:Persona}){
  const [opts,setOpts]=useState<string[]>([]),[t,setT]=useState(''),[hi,setHi]=useState(-1),[done,setDone]=useState(''),[spin,setSpin]=useState(false);
  const add=()=>{const x=t.trim();if(!x||opts.includes(x))return;setOpts([...opts,x]);setT('');setDone('');setHi(-1);};
  const run=()=>{if(opts.length<2||spin)return;setSpin(true);setDone('');let k=0;const end=10+Math.floor(Math.random()*opts.length)+opts.length;
    const id=setInterval(()=>{setHi(k%opts.length);k++;if(k>end){clearInterval(id);setSpin(false);setDone(lines(p,1)[0]??'就这个');}},110);};
  return <>
    {!opts.length&&<p className="lede">纠结的时候，把选项写下来，让他替你挑一个。</p>}
    <div className="newdeck"><input value={t} onChange={e=>setT(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')add();}} placeholder="写一个选项，比如 奶茶" aria-label="一个选项"/><button className="btn sm" onClick={add} disabled={!t.trim()}>加上</button></div>
    <ul className="opts">{opts.map((o,i)=><li key={o} className={i===hi?'on':''}><span>{o}</span><button className="ico sm" onClick={()=>{setOpts(opts.filter(x=>x!==o));setHi(-1);setDone('');}} aria-label={`去掉 ${o}`}><Trash2 size={16} strokeWidth={1.6}/></button></li>)}</ul>
    <button className="btn wide" onClick={run} disabled={opts.length<2||spin}>{spin?'他在想…':'让他选'}</button>
    {done&&hi>=0&&<div className="said" role="status"><Avatar id={p.avatar} name={p.name} size={28}/><div><span>{opts[hi]}</span><span>{done}</span></div></div>}
  </>;
}

/* 问卷 */
const asks=['我们是怎么认识的','第一次说话是哪一天','他最常叫我什么','我最喜欢他哪一点','他生气的时候是什么样子','他最常说的一句话','最想和他一起去的地方','一首像他的歌','他让我改变了什么','还没来得及对他说的话'];
function AskPage({p}:{p:Persona}){
  const b=box(p.id);
  const n=asks.filter((_,i)=>(b.answers[i]??'').trim()).length;
  return <>
    {n===0&&<p className="lede">关于你们的十个问题。写多少算多少，随时可以回来改。</p>}
    <ol className="qa">{asks.map((q,i)=><li key={i}><label><b>{q}</b>
      <textarea rows={2} value={b.answers[i]??''} onChange={e=>setBox(p.id,{answers:{...b.answers,[i]:e.target.value}})} placeholder="写在这里"/></label></li>)}</ol>
  </>;
}

/* 默契 */
const pairs=[['猫','狗'],['山','海'],['早起','熬夜'],['甜的','咸的'],['电影','音乐'],['夏天','冬天'],['出门','待在家'],['咖啡','茶'],['打字','语音'],['计划好','随便走']];
function MatchPage({p}:{p:Persona}){
  const me=S().prefs;
  const [i,setI]=useState(0),[hit,setHit]=useState(0),[pk,setPk]=useState<{me:number;ta:number}|null>(null);
  const choose=(k:number)=>{if(pk)return;const ta=Math.random()<.62?k:1-k;setPk({me:k,ta});if(ta===k)setHit(h=>h+1);setTimeout(()=>{setPk(null);setI(x=>x+1);},1100);};
  const over=i>=pairs.length;
  return <>
    {over?<div className="score"><b>{Math.round(hit/pairs.length*100)}%</b><span>十题里有 {hit} 题选得一样</span><button className="btn" onClick={()=>{setI(0);setHit(0);}}>再来一次</button></div>
    :<><p className="lede">{i===0?'二选一。你选完，看他选的是不是同一个。':`${i+1} / ${pairs.length}`}</p>
      <div className="duel">{pairs[i].map((o,k)=><button key={o} onClick={()=>choose(k)} className={pk?(pk.me===k||pk.ta===k?'on':'dim'):''}>
        <b>{o}</b>{pk&&<span className="pickers">{pk.me===k&&<Avatar id={me.myAvatar} name={me.myName} size={26}/>}{pk.ta===k&&<Avatar id={p.avatar} name={p.name} size={26}/>}</span>}
      </button>)}</div>
      <p className="hint center" role="status">{pk?(pk.me===pk.ta?'一样':'不一样'):'　'}</p></>}
  </>;
}

/* 专注 */
function FocusPage({p}:{p:Persona}){
  const b=box(p.id);
  const [mins,setMins]=useState(25),[end,setEnd]=useState(0),[left,setLeft]=useState(0),[said,setSaid]=useState(''),[armed,twice]=useTwice();
  useEffect(()=>{if(!end)return;const id=setInterval(()=>{const l=Math.max(0,Math.round((end-Date.now())/1000));setLeft(l);
    if(!l){clearInterval(id);setEnd(0);const f=box(p.id).focus;setBox(p.id,{focus:{n:f.n+1,min:f.min+mins}});setSaid(lines(p,1)[0]??'辛苦了');}},500);return()=>clearInterval(id);},[end]);
  const total=mins*60,show=end?left:total,done=end?1-left/total:0;
  return <Sub p={p} title="专注">
    <div className="timer" style={{'--k':done} as React.CSSProperties} role="timer" aria-live="off"><div><b>{mmss(show)}</b><small>{end?`${p.name} 陪着你`:'选个时长'}</small></div></div>
    {!end&&<div className="chips center">{[15,25,45,60].map(m=><button key={m} className="chip" aria-pressed={mins===m} onClick={()=>{setMins(m);setSaid('');}}>{m} 分钟</button>)}</div>}
    {end?<button className="btn wide ghost" onClick={twice('quit',()=>{setEnd(0);say('这次没有记上');})}>{armed==='quit'?'再点一次，放弃这次':'放弃这次'}</button>
      :<button className="btn wide" onClick={()=>{setSaid('');setLeft(total);setEnd(Date.now()+total*1000);}}>开始</button>}
    {said&&<div className="said" role="status"><Avatar id={p.avatar} name={p.name} size={28}/><span>{said}</span></div>}
    <p className="hint center">一共专注了 {b.focus.n} 次 · {b.focus.min} 分钟</p>
  </Sub>;
}

/* 经期 */
function CyclePage({p}:{p:Persona}){
  const b=box(p.id),c=b.cycle,today=ymd(),last=[...c.starts].sort().at(-1);
  const day=last?gap(last,today)+1:0,inside=!!last&&day>=1&&day<=c.len;
  const next=last?(()=>{const d=new Date(at0(last));d.setDate(d.getDate()+c.gap);return ymd(d);})():'';
  const wait=next?gap(today,next):0;
  const care=useMemo(()=>inside?lines(p,1)[0]:'',[inside,p.id]);
  const set=(patch:Partial<typeof c>)=>setBox(p.id,{cycle:{...c,...patch}});
  const [armed,twice]=useTwice();
  return <Sub p={p} title="经期">
    <div className="cyc"><b>{!last?'—':inside?`第 ${day} 天`:wait>0?`${wait}`:wait===0?'今天':`晚了 ${-wait} 天`}</b>
      <span>{!last?'还没有记录':inside?'经期中':wait>0?'天后可能会来':wait===0?'可能今天来':`预计 ${next.replace(/-/g,'.')}`}</span></div>
    <button className="btn wide" onClick={()=>{if(c.starts.includes(today))say('今天已经记过了');else{set({starts:[...c.starts,today]});say('记下了');}}}>今天来了</button>
    {care&&<div className="said"><Avatar id={p.avatar} name={p.name} size={28}/><span>{care}</span></div>}
    <h3>我的周期</h3>
    <Num label="一次大概" value={c.len} set={n=>set({len:n})} min={1} max={15} unit="天"/>
    <Num label="两次相隔" value={c.gap} set={n=>set({gap:n})} min={15} max={60} unit="天"/>
    {c.starts.length>0&&<><h3>记录</h3><ul className="timeline">{[...c.starts].sort().reverse().map(s=><li key={s}><span>{s.replace(/-/g,'.')}</span>
      <button className={`ico sm${armed===s?' danger':''}`} onClick={twice(s,()=>set({starts:c.starts.filter(x=>x!==s)}))} aria-label={armed===s?`再点一次，删掉 ${s} 这次`:`删掉 ${s} 这次`}>{armed===s?<small>再点一次</small>:<Trash2 size={16} strokeWidth={1.6}/>}</button></li>)}</ul></>}
    <p className="foot">只存在这台设备上。预测只是按你填的天数往后数，不是医学判断。</p>
  </Sub>;
}

/* 收藏、相册：都是聊天里攒下来的 */
/* 问问他：帮我选 / 默契 / 问卷 三个小的合在一页 */
const hubs=[['pick','帮我选'],['match','默契'],['ask','问卷']] as const;
function AskHub({p,start}:{p:Persona;start:string}){
  const [t,setT]=useState(hubs.some(h=>h[0]===start)?start:'pick');
  return <Sub p={p} title="问问他">
    <div className="seg" role="tablist" aria-label="问他什么">{hubs.map(([id,n])=><button key={id} role="tab" aria-selected={t===id} onClick={()=>setT(id)}>{n}</button>)}</div>
    {t==='pick'?<PickPage p={p}/>:t==='match'?<MatchPage p={p}/>:<AskPage p={p}/>}
  </Sub>;
}

// 已经拿掉的页面：旧地址直接带回主页
function Away({to}:{to:string}){useEffect(()=>{location.replace(to);},[to]);return null;}

export function Feature({id,p}:{id:string;p:Persona}){
  useVer();
  switch(id){
    case 'mail':return <MailBox p={p}/>;case 'days':return <DaysPage p={p}/>;case 'today':return <Away to={'#/us/'+p.id}/>;
    case 'pick':case 'ask':case 'match':return <AskHub p={p} start={id}/>;case 'draw':return <TarotPage p={p}/>;
    case 'check':return <CheckPage p={p}/>;case 'focus':return <FocusPage p={p}/>;case 'cycle':return <CyclePage p={p}/>;
    case 'feed':return <Away to={'#/us/'+p.id}/>;case 'fav':case 'album':return <Away to={'#/us/'+p.id}/>;
    default:return <Sub p={p} title="功能"><p className="empty">没有这个页面。</p></Sub>;
  }
}
