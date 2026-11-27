// 头像上的那一句（照 ins 的便签做的）：一天一句，是他的一张字卡。
// 点开是一张小卡：这一句、回他、喜欢；往日的每一句都留着。
import {useEffect,useState} from 'react';
import {ChevronLeft,Heart,Send} from 'lucide-react';
import {S,box,list,pushMsg,setBox,type Persona} from './db';
import {plain,sent} from './engine';
import {Avatar} from './App';
import {useDismiss} from './ui';
import {Over} from './over';

export const ymd=(d=new Date())=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
/** 今天的这一句。当天定下来之后就不变（哪怕之后又改了字卡）；没有字卡就是空的 */
export function todayLine(p:Persona){
  const kept=box(p.id).lines.find(x=>x.date===ymd());if(kept)return kept.text;
  // 指定成「他的报备」的那几组是说「此刻在做什么」的，不拿来当一整天的那一句（只剩这几组时才用）
  const ck=new Set(box(p.id).ckDecks??[]),of=(skip:boolean)=>plain(p).filter(d=>!(skip&&ck.has(d.id))).flatMap(d=>d.cards.filter(c=>!c.off).map(c=>c.t));
  let all=of(true);if(!all.length)all=of(false);
  if(!all.length)return '';
  const key=new Date().toDateString()+p.id;let h=0;for(const ch of key)h=(h*31+ch.charCodeAt(0))>>>0;
  return all[h%all.length];
}
/** 把今天的这一句记进往日（不用点开也记）。返回今天这一句 */
export function keepToday(p:Persona){
  const line=todayLine(p),b=box(p.id),today=ymd();
  if(line&&!b.lines.some(x=>x.date===today))setBox(p.id,{lines:[...b.lines,{date:today,text:line,at:Date.now()}].slice(-400)},true);
  return line;
}
export const noteNew=(p:Persona)=>box(p.id).lineSeen!==ymd();
const nice=(date:string)=>{const [y,m,d]=date.split('-').map(Number),n=new Date();return y===n.getFullYear()?`${m}月${d}日`:`${y}年${m}月${d}日`;};

export function NoteCard({p,close}:{p:Persona;close:()=>void}){
  const today=ymd(),b=box(p.id),line=todayLine(p),mine=b.lines.find(x=>x.date===today);
  const [past,setPast]=useState(false),[only,setOnly]=useState(false),[t,setT]=useState(''),out=useDismiss(close);
  useEffect(()=>{if(box(p.id).lineSeen!==today)setBox(p.id,{lineSeen:today},true);},[]);
  useEffect(()=>{const on=(e:KeyboardEvent)=>{if(e.key==='Escape')close();};addEventListener('keydown',on);return()=>removeEventListener('keydown',on);},[close]);
  const like=(date:string)=>setBox(p.id,{lines:box(p.id).lines.map(x=>x.date===date?{...x,like:!x.like,u:Date.now()}:x)},true);
  // 回他这一句：这一句先作为他的话进到聊天里，你的回复引用着它，他照常回你
  const send=()=>{
    const x=t.trim();if(!x||!line)return;
    const id='nt'+p.id+today,now=Date.now();
    if(!list(p.id).some(m=>m.id===id))pushMsg({pid:p.id,from:'ta',kind:'text',text:line,at:now,id});
    pushMsg({pid:p.id,from:'me',kind:'text',text:x,at:now+1,re:id});sent(p.id);
    close();location.hash='#/c/'+p.id;
  };
  const olds=b.lines.filter(x=>x.date!==today).reverse(),anyLike=olds.some(x=>x.like),shown=only?olds.filter(x=>x.like):olds;
  return <Over><div className="veil nt-veil" {...out}>
    <section className="sheet nt" role="dialog" aria-modal="true" aria-label={past?'往日的每一句':`${p.name} 今天的一句`}>
      <i className="grab" aria-hidden="true"/>
      {past?<>
        <header><button className="ico sm" onClick={()=>setPast(false)} aria-label="回到今天这一句"><ChevronLeft size={24} strokeWidth={1.8}/></button><h2>往日</h2><span/></header>
        {anyLike&&<div className="chips" role="radiogroup" aria-label="看哪些">
          <button className="chip" role="radio" aria-checked={!only} aria-pressed={!only} onClick={()=>setOnly(false)}>全部</button>
          <button className="chip" role="radio" aria-checked={only} aria-pressed={only} onClick={()=>setOnly(true)}>喜欢的</button></div>}
        {shown.length?<ul className="nt-list">{shown.map(x=><li key={x.date}>
          <p>{x.text}<small>{nice(x.date)}</small></p>
          <button className="ico sm" onClick={()=>like(x.date)} aria-pressed={!!x.like} aria-label={x.like?'取消喜欢':'喜欢这一句'}><Heart size={19} strokeWidth={1.7} fill={x.like?'currentColor':'none'}/></button>
        </li>)}</ul>:<p className="empty">{olds.length?'还没有点过喜欢的。':'明天起，每天的一句都会留在这里。'}</p>}
      </>:<>
        <div className="nt-face"><p className="nt-bubble">{line}</p><Avatar id={p.avatar} name={p.name} size={96}/></div>
        <p className="nt-who">{p.name} · 今天</p>
        <form className="nt-row" onSubmit={e=>{e.preventDefault();send();}}>
          <input value={t} onChange={e=>setT(e.target.value.slice(0,300))} placeholder={`回 ${p.name}…`} aria-label="回他这一句" enterKeyHint="send"/>
          {t.trim()?<button className="ico" type="submit" aria-label="发出去"><Send size={22} strokeWidth={1.8}/></button>
            :<button className="ico" type="button" onClick={()=>like(today)} disabled={!mine} aria-pressed={!!mine?.like} aria-label={mine?.like?'取消喜欢':'喜欢这一句'}><Heart size={24} strokeWidth={1.7} fill={mine?.like?'currentColor':'none'}/></button>}
        </form>
        <button className="linkish nt-past" onClick={()=>setPast(true)}>往日</button>
      </>}
    </section>
  </div></Over>;
}
