// 经期：记得快（来了 / 结束了各点一下）、能回看（一张月历）、预测跟着记录走、他知道。
// 不做排卵期和症状打卡——这是他陪着你的地方，不是健康 app。
import {useRef,useState} from 'react';
import {ChevronLeft,ChevronRight,SlidersHorizontal} from 'lucide-react';
import {S,box,deckFn,setBox,useVer,type Persona} from './db';
import {cySay,cyTell} from './engine';
import {Avatar,backTo} from './App';
import {Num,Sheet,Switch,say} from './pages';
import {useTwice} from './ui';
import {cyMarks,cyRead,diff,plus,ymd,type Cy} from './cyc';

const md=(s:string)=>`${+s.slice(5,7)}月${+s.slice(8)}日`;
const R=96,C=2*Math.PI*R;

export function CyclePage({p}:{p:Persona}){
  useVer();
  const c=box(p.id).cycle,today=ymd(),r=cyRead(c,today),marks=cyMarks(c,today);
  const set=(patch:Partial<Cy>)=>setBox(p.id,{cycle:{...c,...patch}});
  const [conf,setConf]=useState(false),[sel,setSel]=useState(''),[mon,setMon]=useState(today.slice(0,7)),[armed,twice]=useTwice();
  const on=r.inside&&!r.ended;   // 正在经期里（今天刚记了结束的不算）
  const his=cySay(p,today);
  // 顶上：一个大数字，外面一圈细环。环上深的一段是经期那几天，小圆点是今天走到哪了
  const gone=r.last?diff(r.last.s,today):0,frac=r.last?Math.min(.999,gone/r.gap):0,ang=frac*2*Math.PI-Math.PI/2;
  const big=!r.last?'—':on?`第 ${r.day} 天`:r.wait>0?String(r.wait):r.wait===0?'今天':`晚 ${-r.wait} 天`;
  const cap=!r.last?'还没有记录':on?'经期中':r.wait>0?`天后 · 大约 ${md(r.next)}`:r.wait===0?'大概就是今天':`原本大约 ${md(r.next)}`;
  // 告诉他来了：记下来，他马上回一句（他有「经期中」的字卡分组的话）。补记以前的日子不惊动他
  const start=(d:string)=>{if(c.starts.includes(d))return;set({starts:[...c.starts,d].sort()});setSel('');
    if(d===today&&cyTell(p.id))return;
    say(d===today?'记下了':`${md(d)} 记下了`);};
  const endAt=(s:string,d:string)=>{set({ends:{...c.ends,[s]:d}});setSel('');say(d===today?'记下了，这几天辛苦了':`记到 ${md(d)} 结束`);};
  const drop=(s:string)=>{const ends={...c.ends};delete ends[s];set({starts:c.starts.filter(x=>x!==s),ends});setSel('');say('删掉了');};
  // 月历
  const [y,m]=mon.split('-').map(Number),first=new Date(y,m-1,1),n=new Date(y,m,0).getDate(),lead=(first.getDay()+6)%7;
  const step=(k:number)=>{const d=new Date(y,m-1+k,1);setMon(ymd(d).slice(0,7));setSel('');};
  // 月历可以左右划着翻月
  const sw=useRef<{x:number;y:number}|null>(null);
  const swipe={onTouchStart:(e:React.TouchEvent)=>{const t=e.touches[0];sw.current=e.touches.length===1?{x:t.clientX,y:t.clientY}:null;},
    onTouchEnd:(e:React.TouchEvent)=>{const a=sw.current,t=e.changedTouches[0];sw.current=null;if(!a)return;const dx=t.clientX-a.x,dy=t.clientY-a.y;if(Math.abs(dx)>56&&Math.abs(dx)>Math.abs(dy)*1.6)step(dx<0?1:-1);}};
  const stats:[string,string][]=r.last?[[`${r.gap} 天`,r.auto.gap?'平均相隔':'相隔'],[`${r.len} 天`,r.auto.len?'平均一次':'一次'],[md(r.last.s),'上次']]:[];
  // 点了某一天：这一天能做什么
  const hit=sel?r.periods.find(x=>sel>=x.s&&sel<=x.e):undefined;
  const prev=sel&&!hit?[...r.periods].reverse().find(x=>x.s<sel&&diff(x.s,sel)<15):undefined;   // 前面不远有一次：可以说「那次到这天才结束」
  return <main className="page sub cy" style={{'--accent':p.accent} as React.CSSProperties}>
    <header className="bar"><a className="ico" href={'#/us/'+p.id} onClick={backTo('#/us/'+p.id)} aria-label="返回"><ChevronLeft size={28} strokeWidth={1.8}/></a><h1>经期</h1>
      <button className="ico" onClick={()=>setConf(true)} aria-label="经期的设置"><SlidersHorizontal size={22} strokeWidth={1.7}/></button></header>
    <div className="cy-top">
      <svg viewBox="0 0 220 220" aria-hidden="true">
        <circle cx="110" cy="110" r={R} className="cy-track"/>
        {r.last&&<circle cx="110" cy="110" r={R} className="cy-arc" strokeDasharray={`${C*Math.min(1,r.len/r.gap)} ${C}`} transform="rotate(-90 110 110)"/>}
        {r.last&&<circle cx={110+R*Math.cos(ang)} cy={110+R*Math.sin(ang)} r="5.5" className="cy-now"/>}
      </svg>
      <div className="cy-num" aria-live="polite"><b>{big}</b><span>{cap}</span></div>
    </div>
    {on?<button className="btn wide ghost" onClick={()=>endAt(r.last!.s,today)}>今天结束了</button>
      :!r.ended&&<button className="btn wide" onClick={()=>start(today)}>今天来了</button>}
    {his&&<div className="said"><Avatar id={p.avatar} name={p.name} size={28}/><span>{his}</span></div>}
    {stats.length>0&&<dl className="cy-stats">{stats.map(([v,k])=><div key={k}><dd>{v}</dd><dt>{k}</dt></div>)}</dl>}

    <div className="cy-cal">
      <header><button className="ico sm" onClick={()=>step(-1)} aria-label="上个月"><ChevronLeft size={20} strokeWidth={1.7}/></button>
        <button className="cy-mon" onClick={()=>{setMon(today.slice(0,7));setSel('');}} aria-label={`${y}年${m}月${mon===today.slice(0,7)?'':'，点一下回到这个月'}`}>{y}年{m}月</button>
        <button className="ico sm" onClick={()=>step(1)} aria-label="下个月"><ChevronRight size={20} strokeWidth={1.7}/></button></header>
      <div className="cy-grid" role="group" aria-label={`${y}年${m}月`} {...swipe}>
        {['一','二','三','四','五','六','日'].map(w=><small key={w}>{w}</small>)}
        {Array.from({length:lead},(_,i)=><i key={'x'+i}/>)}
        {Array.from({length:n},(_,i)=>{const d=`${mon}-${String(i+1).padStart(2,'0')}`,k=marks.get(d);
          return <button key={d} className={`${k??''}${d===today?' now':''}`} aria-pressed={sel===d} disabled={d>today} onClick={()=>setSel(sel===d?'':d)}
            aria-label={`${md(d)}${d===today?'，今天':''}${k==='p'?'，经期':k==='f'?'，预计经期':''}`}>{i+1}</button>;})}
      </div>
      {sel?<div className="cy-act" role="group" aria-label={md(sel)}><b>{md(sel)}</b>
          {hit?<>{!(hit.done&&hit.e===sel)&&<button className="trow" onClick={()=>endAt(hit.s,sel)}>这天结束</button>}
              <button className="trow danger" onClick={twice('drop',()=>drop(hit.s))}>{armed==='drop'?'再点一次，删掉这一次':'删掉这一次'}</button></>
            :<><button className="trow" onClick={()=>start(sel)}>这天开始</button>
              {prev&&<button className="trow" onClick={()=>endAt(prev.s,sel)}>上一次到这天才结束</button>}</>}
        </div>
        :<p className="cy-key"><i className="p"/>经期<i className="f"/>预计</p>}
    </div>
    <p className="foot">预计的日子只是往后数，不是医学判断。</p>
    {conf&&<Conf p={p} close={()=>setConf(false)}/>}
  </main>;
}

function Conf({p,close}:{p:Persona;close:()=>void}){
  useVer();
  const st=S(),c=box(p.id).cycle,r=cyRead(c);
  const set=(patch:Partial<Cy>)=>setBox(p.id,{cycle:{...c,...patch}});
  const mine=st.decks.filter(d=>p.decks.includes(d.id)),picked=new Set([...(c.decks??[]),...(c.soon??[])]),[wide,setWide]=useState(false),cat=mine.filter(d=>wide||picked.has(d.id)||deckFn(d)==='cycle');
  const row=(key:'soon'|'decks',label:string)=>{const on=c[key]??[];
    return <><h3>{label}</h3><div className="chips" role="group" aria-label={label}>{[...cat].sort((a,b)=>Number(on.includes(b.id))-Number(on.includes(a.id))).map(d=>
      <button key={d.id} className="chip" aria-pressed={on.includes(d.id)} onClick={()=>{
        if(on.includes(d.id)){set({[key]:on.filter(x=>x!==d.id)});return;}
        // 选走以后他平时就不说这组了：要是这是他平时唯一能说的一组，先不让选，免得他平时没话可说
        const taken=new Set([...(c.decks??[]),...(c.soon??[]),d.id]);
        if(!mine.some(x=>!taken.has(x.id)&&x.cards.some(k=>!k.off))){say('这是他平时唯一能说的分组，先留给平时用');return;}
        set({[key]:[...on,d.id]});}}>{d.name}<small>{d.cards.length}</small></button>)}</div></>;};
  return <Sheet title="经期的设置" close={close}>
    <Num label="一次大概" value={c.len} set={n=>set({len:n})} min={1} max={15} unit="天"/>
    <Num label="两次相隔" value={c.gap} set={n=>set({gap:n})} min={15} max={60} unit="天"/>
    <p className="hint">{r.auto.gap||r.auto.len?`记录够了，现在按最近几次的平均算（相隔 ${r.gap} 天、一次 ${r.len} 天）。`:'记够两次以后，会改成按你最近几次的平均来算。'}</p>
    <Switch on={c.remind!==false} set={v=>set({remind:v})} label="快到的时候提醒我"/>
    {cat.length?<>
      {row('soon','经期前，他说')}
      {row('decks','经期中，他说')}
      <p className="hint">选了分组，那几天他每天主动说一句；你点「今天来了」，他会马上回一句。选中的分组平时他不会说，所以请选专门写给经期的。</p>
    </>:<p className="hint">{mine.length?'还没有「经期」这一类的分组。':'他还没有字卡分组。有了以后，可以在这里指定经期那几天他说哪些话。'}</p>}
    {!wide&&mine.length>cat.length&&<p className="hint"><button className="linkish" onClick={()=>setWide(true)}>从全部分组里选</button>（选上的会归到「经期」这一类）</p>}
  </Sheet>;
}
