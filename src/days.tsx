// 纪念日：顶上一块「在一起」，下面的日子分「快到了 / 走过的」。点开一个日子看大数字，能存成一张图
import {useEffect,useRef,useState} from 'react';
import {ChevronLeft,ImagePlus,Plus} from 'lucide-react';
import {S,box,putImage,setBox,setPersona,uid,useVer,type Day,type Persona} from './db';
import {Avatar,Pic,backTo} from './App';
import {Sheet,Switch,say} from './pages';
import {auto,enter,useTwice} from './ui';
import {arrange,count,dots,full,lunarOk,lunarText,md,miles,span,week,ymd,type Count} from './daycalc';
import {dayImage,saveImage,type DayCard} from './dayimg';

const SINCE='since';
type Row=Day&{fixed?:boolean};
/** 右边那个大数字旁边的小字 */
const tail=(c:Count)=>c.kind==='today'?'就是今天':c.kind==='soon'?'天后':'天';
/** 列表里第二行：下一次是哪天、周几、第几年；过去的日子写从哪天起 */
function sub(d:Row,c:Count,today:string){
  if(c.kind==='past')return dots(d.date)+' 起';
  const when=`${md(c.on,today)} ${week(c.on)}`;
  return [d.yearly&&d.lunar?lunarText(d.date):'',when,c.times?`${c.times} ${c.unit}`:''].filter(Boolean).join(' · ');
}
const monthDay=(s:string)=>{const [,m,d]=s.split('-').map(Number);return `${m}月${d}日`;};
const NAMES=['他的生日','我的生日','第一次见面','第一次说话','第一次说喜欢'];

export function DaysPage({p}:{p:Persona}){
  useVer();
  const b=box(p.id),me=S().prefs,today=ymd();
  const [open,setOpen]=useState<string>(''),[ed,setEd]=useState<Day|null>(null),[edSince,setEdSince]=useState(false);
  const since:Row|null=p.since?{id:SINCE,name:'在一起',date:p.since,yearly:false,fixed:true}:null;
  const {soon,past}=arrange(b.days,today);
  const sc=since?count(since,today):null,next=since?miles(p.since,today,1)[0]:undefined;
  const add=()=>setEd({id:uid(),name:'',date:today,yearly:true});
  const shown:Row|null=open===SINCE?since:b.days.find(x=>x.id===open)??null;
  const row=({d,c}:{d:Day;c:Count})=><li key={d.id} className={c.kind==='today'?'on':''}><button onClick={()=>setOpen(d.id)}>
    {d.img&&<span className="dy-thumb"><Pic id={d.img}/></span>}
    <span className="who"><b>{d.name}</b><span>{sub(d,c,today)}</span></span>
    <span className="big">{c.kind!=='today'&&<b>{c.n}</b>}<small>{tail(c)}</small></span>
  </button></li>;
  return <main className="page sub dy" style={{'--accent':p.accent} as React.CSSProperties}>
    <header className="bar"><a className="ico" href={'#/us/'+p.id} onClick={backTo('#/us/'+p.id)} aria-label="返回"><ChevronLeft size={28} strokeWidth={1.8}/></a><h1>纪念日</h1>
      <button className="ico" onClick={add} aria-label="添加一个日子"><Plus size={26} strokeWidth={1.7}/></button></header>
    {since&&sc?<button className="dy-hero" onClick={()=>setOpen(SINCE)} aria-label={`在一起的第 ${sc.n} 天，点开看`}>
      <span className="dy-two"><Avatar id={me.myAvatar} name={me.myName} size={56}/><Avatar id={p.avatar} name={p.name} size={56}/></span>
      <small>在一起</small>
      {sc.kind==='soon'?<><b>{sc.n}</b><span>天后 · {dots(p.since)}</span></>:<><b>{sc.kind==='today'?1:sc.n}</b><span>天 · 从 {dots(p.since)}</span></>}
      {next&&<em>{next.n===0?`今天是${next.label}`:`再过 ${next.n} 天 · ${next.label}`}</em>}
    </button>
    :<div className="dy-hero none">
      <span className="dy-two"><Avatar id={me.myAvatar} name={me.myName} size={56}/><Avatar id={p.avatar} name={p.name} size={56}/></span>
      <p>还没写下在一起的那一天</p>
      <button className="chip" onClick={()=>setEdSince(true)}>定一个日子</button>
    </div>}
    {soon.length>0&&<><h2 className="dy-sec">快到了</h2><ul className="days">{soon.map(row)}</ul></>}
    {past.length>0&&<><h2 className="dy-sec">走过的</h2><ul className="days">{past.map(row)}</ul></>}
    {!b.days.length&&<div className="dy-empty"><p>生日、第一次见面、想一起倒数的日子，都可以记在这里。</p><button className="btn" onClick={add}>加一个日子</button></div>}
    {shown&&<Detail p={p} d={shown} close={()=>setOpen('')} edit={()=>{const d=shown;setOpen('');if(d.fixed)setEdSince(true);else setEd(d);}}/>}
    {ed&&<Edit p={p} day={ed} close={()=>setEd(null)}/>}
    {edSince&&<Since p={p} close={()=>setEdSince(false)}/>}
  </main>;
}

/* 点开一个日子 */
function Detail({p,d,close,edit}:{p:Persona;d:Row;close:()=>void;edit:()=>void}){
  const me=S().prefs,today=ymd(),c=count(d,today);
  const [pic,setPic]=useState<{url:string;file:File}|null>(null),[busy,setBusy]=useState(false);
  useEffect(()=>()=>{if(pic)URL.revokeObjectURL(pic.url);},[pic]);
  const ms=d.fixed?miles(d.date,today,3):!d.yearly&&c.kind==='past'?miles(d.date,today,1):[];
  const lines:string[]=[];
  if(c.kind==='past'){lines.push(`${full(d.date)} 起`);lines.push(`走过 ${span(d.date,today)}`);}
  else if(d.yearly){lines.push(`${c.kind==='today'?'今天':'下一次'}：${full(c.on)}${c.times?` · ${c.times} ${c.unit}`:''}`);if(d.lunar)lines.push(`每年${lunarText(d.date)}`);else lines.push(`每年 ${monthDay(d.date)}`);}
  else lines.push(full(d.date));
  const card=():DayCard=>({name:d.name,img:d.img,me:{id:me.myAvatar,name:me.myName},him:{id:p.avatar,name:p.name},foot:`${me.myName} & ${p.name}`,
    ...(c.kind==='today'&&!d.fixed?{}:c.kind==='soon'?{n:c.n,post:'天后'}:{n:c.kind==='today'?1:c.n,pre:'第',post:'天'}),
    line:c.kind==='past'||(d.fixed&&c.kind==='today')?`从 ${dots(d.date)} 起`:`${dots(c.on)} ${week(c.on)}${c.times?` · ${c.times} ${c.unit}`:''}`});
  const draw=async()=>{
    if(busy)return;setBusy(true);
    try{const blob=await dayImage(card()),ext=blob.type==='image/jpeg'?'jpg':'png';
      setPic({url:URL.createObjectURL(blob),file:new File([blob],`${d.name}-${today.replace(/-/g,'')}.${ext}`,{type:blob.type})});}
    catch{say('这次没画出来，再试一次');}
    setBusy(false);
  };
  if(pic)return <Sheet title="存成图片" close={close}>
    <img className="dy-card" src={pic.url} alt={`${d.name}的纪念卡`}/>
    <div className="rowbtn two"><button className="btn ghost" onClick={()=>setPic(null)}>返回</button><button className="btn" onClick={async()=>{if(await saveImage(pic.file,pic.url))say('存下来了');}}>存下来</button></div>
  </Sheet>;
  return <Sheet title={d.name} close={close}>
    {d.img&&<Pic id={d.img} className="dy-cover" alt=""/>}
    <div className={`dy-num${c.kind==='today'&&!d.fixed?' on':''}`}>{(c.kind!=='today'||d.fixed)&&<b>{d.fixed&&c.kind==='today'?1:c.n}</b>}<small>{d.fixed&&c.kind!=='soon'?'天':tail(c)}</small></div>
    <ul className="dy-lines">{lines.map(x=><li key={x}>{x}</li>)}{ms.map(m=><li key={m.label}>{m.n===0?`今天是${m.label}`:`再过 ${m.n} 天是${m.label}（${md(m.on,today)}）`}</li>)}</ul>
    <div className="rowbtn two"><button className="btn ghost" onClick={edit}>改一改</button><button className="btn" onClick={draw} disabled={busy}>{busy?'在画…':'存成图片'}</button></div>
  </Sheet>;
}

/* 加一个 / 改一个日子 */
function Edit({p,day,close}:{p:Persona;day:Day;close:()=>void}){
  const b=box(p.id),had=b.days.some(x=>x.id===day.id);
  const [ed,setEd]=useState<Day>(day),[armed,twice]=useTwice(),file=useRef<HTMLInputElement>(null);
  // 不常动的三样（按农历、提醒、照片）先收着；这个日子已经用了其中哪样，就直接摊开
  const [more,setMore]=useState(!!day.lunar||!!day.img||day.remind===false);
  const ok=!!ed.name.trim()&&/^\d{4}-\d\d-\d\d$/.test(ed.date);
  const save=()=>{if(!ok)return;const v:Day={...ed,name:ed.name.trim(),...(ed.yearly?{}:{lunar:undefined})};setBox(p.id,{days:had?b.days.map(x=>x.id===v.id?v:x):[...b.days,v]});close();};
  const pick=async(e:React.ChangeEvent<HTMLInputElement>)=>{const f=e.target.files?.[0];e.target.value='';if(!f)return;try{setEd({...ed,img:await putImage(f,1600)});}catch{say('这张图片读不了，换一张试试');}};
  return <Sheet title={had?'改这个日子':'加一个日子'} close={close}>
    <label className="field"><span>名字</span><input value={ed.name} maxLength={24} onChange={e=>setEd({...ed,name:e.target.value})} onKeyDown={e=>{if(enter(e))save();}} placeholder="比如 他的生日" autoFocus={!ed.name&&auto}/></label>
    {!ed.name.trim()&&<div className="chips" role="group" aria-label="常用的名字">{NAMES.filter(n=>!b.days.some(x=>x.name===n)).map(n=><button key={n} className="chip" onClick={()=>setEd({...ed,name:n})}>{n}</button>)}</div>}
    <label className="field"><span>哪一天</span><input type="date" value={ed.date} onChange={e=>setEd({...ed,date:e.target.value})}/></label>
    <Switch on={ed.yearly} set={v=>setEd({...ed,yearly:v})} label="每年都过" note={ed.yearly?'生日、纪念日：每年到这一天倒数':'只这一天：没到就倒数，过了就数走过的天数'}/>
    {more?<>
    {ed.yearly&&lunarOk()&&<Switch on={!!ed.lunar} set={v=>setEd({...ed,lunar:v||undefined})} label="按农历过" note={ed.date?lunarText(ed.date)||'这一天算不出农历':'先选日子'}/>}
    <Switch on={ed.remind!==false} set={v=>setEd({...ed,remind:v?undefined:false})} label="到那天提醒我" note="前一天晚上和当天早上各说一声"/>
    <div className="line dy-pic"><span>照片<small>放一张自己的图</small></span>
      <span className="dy-pick">{ed.img&&<Pic id={ed.img} className="dy-mini" alt=""/>}
        <button className="chip" onClick={()=>file.current?.click()}><ImagePlus size={15} strokeWidth={1.9}/>{ed.img?'换一张':'选一张'}</button>
        {ed.img&&<button className="chip" onClick={()=>setEd({...ed,img:undefined})}>拿掉</button>}</span>
      <input ref={file} type="file" accept="image/*" hidden onChange={pick}/></div>
    </>:<button className="dy-more" onClick={()=>setMore(true)}>更多：{[ed.yearly&&lunarOk()?'按农历':'','提醒','照片'].filter(Boolean).join('、')}</button>}
    <button className="btn" onClick={save} disabled={!ok}>存下</button>
    {had&&<div className="rowbtn"><button className="chip danger" onClick={twice('day',()=>{setBox(p.id,{days:b.days.filter(x=>x.id!==ed.id)});close();})}>{armed==='day'?'再点一次，删掉这个日子':'删掉这个日子'}</button></div>}
  </Sheet>;
}

/* 在一起的那一天（和「编辑主页」里的是同一个） */
function Since({p,close}:{p:Persona;close:()=>void}){
  const b=box(p.id),[date,setDate]=useState(p.since||ymd()),[armed,twice]=useTwice();
  const ok=/^\d{4}-\d\d-\d\d$/.test(date);
  return <Sheet title="在一起" close={close}>
    <label className="field"><span>从哪一天起</span><input type="date" value={date} max="2999-12-31" onChange={e=>setDate(e.target.value)}/></label>
    <Switch on={b.sinceTip!==false} set={v=>setBox(p.id,{sinceTip:v?undefined:false})} label="到整数天和周年提醒我" note="第 100、200… 天，520、999、1314，还有每个周年"/>
    <button className="btn" onClick={()=>{if(!ok)return;setPersona(p.id,{since:date});close();}} disabled={!ok}>存下</button>
    {p.since&&<div className="rowbtn"><button className="chip danger" onClick={twice('since',()=>{setPersona(p.id,{since:''});close();})}>{armed==='since'?'再点一次，清掉这一天':'清掉这一天'}</button></div>}
  </Sheet>;
}
