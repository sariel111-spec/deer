import {useEffect,useMemo,useRef,useState} from 'react';
import {CalendarHeart,ChevronLeft,Droplet,Mail,MapPin,MessageCircleQuestion,Plus,Sparkles,SquarePen,Timer,Trash2,type LucideIcon} from 'lucide-react';
import {box,list,pushMsg,putImage,setBox,uid,useVer,type Day,type Persona} from './db';
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
import {QuizPage} from './quiz';

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
/* 问问他：帮我选 / 问卷 两个合在一页。默契并进了问卷（题库里的「二选一」，等他交卷时先点你猜的） */
const hubs=[['pick','帮我选'],['quiz','问卷']] as const;
function AskHub({p,start}:{p:Persona;start:'pick'|'quiz'}){
  // 地址最后一段是哪一份答卷：#/f/quiz/<谁>/<哪一份>
  const open=start==='quiz'?location.hash.split('/')[4]??'':'';
  return <Sub p={p} title={open?'问卷':'问问他'}>
    {!open&&<div className="seg" role="tablist" aria-label="问他什么">{hubs.map(([id,n])=><button key={id} role="tab" aria-selected={start===id} onClick={()=>{if(start!==id)location.replace('#/f/'+id+'/'+p.id);}}>{n}</button>)}</div>}
    {start==='pick'?<PickPage p={p}/>:<QuizPage p={p} open={open}/>}
  </Sub>;
}

// 已经拿掉的页面：旧地址直接带回主页
function Away({to}:{to:string}){useEffect(()=>{location.replace(to);},[to]);return null;}

export function Feature({id,p}:{id:string;p:Persona}){
  useVer();
  switch(id){
    case 'mail':return <MailBox p={p}/>;case 'days':return <DaysPage p={p}/>;case 'today':return <Away to={'#/us/'+p.id}/>;
    case 'pick':case 'ask':case 'match':case 'quiz':return <AskHub p={p} start={id==='pick'||id==='ask'?'pick':'quiz'}/>;case 'draw':return <TarotPage p={p}/>;
    case 'check':return <CheckPage p={p}/>;case 'focus':return <FocusPage p={p}/>;case 'cycle':return <CyclePage p={p}/>;
    case 'feed':return <Away to={'#/us/'+p.id}/>;case 'fav':case 'album':return <Away to={'#/us/'+p.id}/>;
    default:return <Sub p={p} title="功能"><p className="empty">没有这个页面。</p></Sub>;
  }
}
