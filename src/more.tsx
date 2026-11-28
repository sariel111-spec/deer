import {useEffect,useMemo,useRef,useState} from 'react';
import {CalendarHeart,ChevronLeft,Droplet,Mail,MapPin,MessageCircleQuestion,Plus,Sparkles,SquarePen,Timer,Trash2,type LucideIcon} from 'lucide-react';
import {S,box,list,pushMsg,putImage,setBox,uid,useVer,type Day,type Persona} from './db';
import {lines,sent} from './engine';
import {Avatar,Pic,backTo,dayLabel} from './App';
import {Num,Sheet,say} from './pages';
import {auto,enter,useTwice} from './ui';
import {CyclePage} from './cycle';
import {TarotPage} from './tarotpage';
import {MailBox} from './mail';
import {CheckPage} from './check';
import {DaysPage} from './days';
import {PickPage} from './pick';

// 主页上摆出来的全部功能。顺序就是宫格里的顺序
export const feats:{id:string;name:string;icon:LucideIcon}[]=[
  {id:'mail',name:'信箱',icon:Mail},{id:'check',name:'报备',icon:MapPin},{id:'draw',name:'占牌',icon:Sparkles},{id:'days',name:'纪念日',icon:CalendarHeart},
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

/* 问卷 */
const asks=['我们是怎么认识的','第一次说话是哪一天','他最常叫我什么','我最喜欢他哪一点','他生气的时候是什么样子','他最常说的一句话','最想和他一起去的地方','一首像他的歌','他让我改变了什么','还没来得及对他说的话'];
function AskPage({p}:{p:Persona}){
  const b=box(p.id),has=(i:number)=>!!(b.answers[i]??'').trim();
  // 一次只问一题：进来停在第一道还没写的；写过的排在下面，一问一答，点哪条都能回去改
  const [cur,setCur]=useState(()=>asks.findIndex((_,i)=>!has(i)));
  const n=asks.filter((_,i)=>has(i)).length;
  const rest=(from:number)=>{for(let k=1;k<=asks.length;k++){const i=(from+k)%asks.length;if(!has(i)&&i!==from)return i;}return -1;};
  const next=cur<0?-1:rest(cur);
  const done=asks.map((_,i)=>i).filter(i=>has(i)&&i!==cur);
  return <>
    <p className="q1-n">{n} / {asks.length}</p>
    {cur>=0?<div className="q1">
      <label><b>{asks[cur]}</b>
        <textarea rows={3} value={b.answers[cur]??''} onChange={e=>setBox(p.id,{answers:{...b.answers,[cur]:e.target.value}})} placeholder="写在这里"/></label>
      {(has(cur)||next>=0)&&<button className={`btn${has(cur)?'':' ghost'}`} onClick={()=>setCur(next)}>{has(cur)?(next>=0?'下一题':'写好了'):'先跳过'}</button>}
    </div>:<p className="lede center">{n===asks.length?'十个问题都写完了。点哪一条都可以改。':'先写到这里。点下面哪一条都可以改。'}{n<asks.length&&<button className="linkish" onClick={()=>setCur(asks.findIndex((_,i)=>!has(i)))}>接着写</button>}</p>}
    {done.length>0&&<ul className="qa">{done.map(i=><li key={i}><button onClick={()=>setCur(i)}><b>{asks[i]}</b><p>{b.answers[i]}</p></button></li>)}</ul>}
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
    case 'pick':case 'ask':case 'match':case 'quiz':return <AskHub p={p} start={id==='ask'?'pick':id==='quiz'?'ask':id}/>;case 'draw':return <TarotPage p={p}/>;
    case 'check':return <CheckPage p={p}/>;case 'focus':return <FocusPage p={p}/>;case 'cycle':return <CyclePage p={p}/>;
    case 'feed':return <Away to={'#/us/'+p.id}/>;case 'fav':case 'album':return <Away to={'#/us/'+p.id}/>;
    default:return <Sub p={p} title="功能"><p className="empty">没有这个页面。</p></Sub>;
  }
}
