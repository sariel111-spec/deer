import {useEffect,useLayoutEffect,useMemo,useRef,useState,useSyncExternalStore} from 'react';
import {Bookmark,Check,ChevronDown,ChevronLeft,ChevronRight,EyeOff,Grid3x3,GripHorizontal,Heart,Mail,Menu,Pin,Plus,Search,Trash2,X} from 'lucide-react';
import {S,storage,addCards,addDeck,addPersona,box,clearMsgs,deckFn,dropCards,dropDeck,dropPersona,dupCards,exportAll,fns,importAll,list,putImage,readCards,setCard,setDeck,setPersona,setPrefs,shareDeck,unread,uses,useVer,whens,wipe,
  type Deck,type Fn,type Persona,type Use,type When} from './db';
import {onPush,pushLink,pushLive,pushOff,pushOn,pushPrep,pushSet,pushTest,pushUnlink} from './push';
import {apply,askNotify,audioLive,audioOn,lastAway,notify,onPip,pipEnter,pipLeave,pipSlot,setMode,status,wakeLive} from './alive';
import {lines,nudge} from './engine';
import {connect,defaultRepo,disconnect,setAuto,syncNow,useSync} from './sync';
import {Avatar,Pic,backTo,dayLabel,go,nav} from './App';
import {feats,homeDefault} from './more';
import {BackClose,auto,enter,useBackClose,useDismiss,useDragClose,useTwice} from './ui';
import {Over} from './over';
import {useInstall} from './help';
import {isShell,shellSave,shellOpen,setShellKeep,shellSync} from './native';
import {cyPhase} from './cyc';
import {NoteCard,keepToday,noteNew,todayLine} from './note';

/* ───────── 小零件 ───────── */

let toast='',toastT=0;const tsubs=new Set<()=>void>();
export function say(t:string){toast=t;tsubs.forEach(f=>f());clearTimeout(toastT);toastT=window.setTimeout(()=>{toast='';tsubs.forEach(f=>f());},2400);}
if(typeof window!=='undefined')addEventListener('cx-say',e=>say(String((e as CustomEvent).detail??'')));
export function Toast(){
  const t=useSyncExternalStore(f=>{tsubs.add(f);return()=>{tsubs.delete(f);};},()=>toast);
  return t?<div className="toast" role="status">{t}</div>:null;
}
export function Sheet({title,close,plain,children}:{title:string;close:()=>void;plain?:boolean;children:React.ReactNode}){
  const out=useDismiss(close);
  useEffect(()=>{const on=(e:KeyboardEvent)=>{if(e.key==='Escape')close();};addEventListener('keydown',on);return()=>removeEventListener('keydown',on);},[close]);
  const [el,drag]=useDragClose<HTMLElement>(close);
  useBackClose(close);
  return <Over><div className="veil" {...out}>
    <section ref={el} className={`sheet${plain?' plain':''}`} role="dialog" aria-modal="true" aria-label={title||'操作'}>
      <i className="grab" aria-hidden="true" {...drag}/>
      {title&&<header {...drag}><h2>{title}</h2><button className="ico sm" onClick={close} aria-label="关上"><X size={20}/></button></header>}
      {children}
    </section>
  </div></Over>;
}
export function Switch({on,set,label,note}:{on:boolean;set:(v:boolean)=>void;label:string;note?:string}){
  return <label className="line"><span>{label}{note&&<small>{note}</small>}</span><input type="checkbox" className="switch" checked={on} onChange={e=>set(e.target.checked)}/></label>;
}
// 一个能打数字的小格子。打字的时候不去改她打的字：数字在范围里就直接算数；离开这一格时再收进范围（空着就还是原来的数）
function NumIn({value,set,min,max,label}:{value:number;set:(n:number)=>void;min:number;max:number;label:string}){
  const [t,setT]=useState<string|null>(null),fresh=useRef(false);   // fresh：刚点进来那一下把数字全选上，直接打就是换掉它
  const done=()=>{fresh.current=false;if(t!==null&&t!==''){const n=Math.max(min,Math.min(max,Number(t)));if(n!==value)set(n);}setT(null);};
  return <input type="text" inputMode="numeric" pattern="[0-9]*" autoComplete="off" value={t??String(value)} aria-label={label}
    onFocus={e=>{setT(String(value));fresh.current=true;try{e.target.select();}catch{/* */}}} onMouseUp={e=>{if(fresh.current){fresh.current=false;e.preventDefault();}}}
    onChange={e=>{const v=e.target.value.replace(/\D/g,'').slice(0,String(max).length);setT(v);const n=Number(v);if(v!==''&&n>=min&&n<=max&&n!==value)set(n);}}
    onBlur={done} onKeyDown={e=>{if(e.key==='Enter')(e.target as HTMLInputElement).blur();}}/>;
}
export function Num({label,value,set,min=0,max=9999,unit}:{label:string;value:number;set:(n:number)=>void;min?:number;max?:number;unit:string}){
  return <label className="line"><span>{label}</span><span className="num"><NumIn value={value} set={set} min={min} max={max} label={label}/>{unit}</span></label>;
}
/** 一行两个数：从几到几（回复要等多久、隔多久主动找你）。前一个改大了，后一个跟着抬；后一个不能比前一个小 */
export function Range({label,a,b,set,min,max,unit}:{label:string;a:number;b:number;set:(a:number,b:number)=>void;min:number;max:number;unit:string}){
  return <div className="line"><span>{label}</span><span className="num">
    <NumIn value={a} set={n=>set(n,Math.max(n,b))} min={min} max={max} label={`${label}，最少`}/>–
    <NumIn value={b} set={n=>set(a,Math.max(n,a))} min={a} max={max} label={`${label}，最多`}/>{unit}</span></div>;
}
const shareable=(f:File)=>{try{return /iphone|ipad|ipod/i.test(navigator.userAgent)&&!!navigator.canShare?.({files:[f]});}catch{return false;}};
const download=(name:string,text:string,type='application/json')=>{
  if(shellSave(name,text))return;   // 安卓安装包里：交给系统的分享面板（存到「文件」、发给别人）
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),2000);
};

/* ───────── 资料与节奏 ───────── */

export function PersonaSheet({p,close}:{p:Persona;close:()=>void}){
  useVer();
  const st=S();
  const pick=useRef<HTMLInputElement>(null),wall=useRef<HTMLInputElement>(null),face=useRef<HTMLInputElement>(null);
  const [sure,setSure]=useState(''),[allDecks,setAllDecks]=useState(st.decks.length<=8);
  const set=(patch:Partial<Persona>)=>setPersona(p.id,patch);
  const hours=Array.from({length:24},(_,h)=>h);
  const photo=(key:'avatar'|'wall'|'callPic',size:number)=>async(e:React.ChangeEvent<HTMLInputElement>)=>{const f=e.target.files?.[0];e.target.value='';if(!f)return;try{set({[key]:await putImage(f,size)});}catch{say('这张图片读不了，换一张试试');}};
  // 一行一张图：有图时右边是小缩略图（点它换一张）和「不要」，没图时只有一个「放一张」
  const picRow=(label:string,id:string|undefined,ref:React.RefObject<HTMLInputElement|null>,key:'wall'|'callPic')=><div className="line"><span>{label}</span><span className="pact">
    {id&&<button className="linkish" onClick={()=>set({[key]:undefined})}>不要</button>}
    {id?<button className="pthumb" onClick={()=>ref.current?.click()} aria-label={`换一张${label}`}><Pic id={id} alt=""/></button>:<button className="linkish" onClick={()=>ref.current?.click()}>放一张</button>}
    <input ref={ref} type="file" accept="image/*" hidden onChange={photo(key,1600)}/></span></div>;
  const mine=st.decks.filter(d=>p.decks.includes(d.id));
  const twice=(k:string,run:()=>void)=>()=>{if(sure!==k){setSure(k);return;}setSure('');run();};
  return <Sheet title="资料与节奏" close={close}>
    <div className="me-row">
      <button className="pick" onClick={()=>pick.current?.click()} aria-label="换他的头像"><Avatar id={p.avatar} name={p.name} size={76}/><span>换头像</span></button>
      <input ref={pick} type="file" accept="image/*" hidden onChange={photo('avatar',512)}/>
    </div>
    <label className="prow"><span>名字</span><input value={p.name} onChange={e=>set({name:e.target.value})}/></label>
    <label className="prow"><span>签名</span><input value={p.bio} onChange={e=>set({bio:e.target.value})} placeholder="一句话"/></label>
    <label className="prow"><span>在一起</span><input type="date" value={p.since} onChange={e=>set({since:e.target.value})}/></label>
    {picRow('聊天背景',p.wall,wall,'wall')}
    {picRow('通话画面',p.callPic,face,'callPic')}

    <h3>回复</h3>
    <Range label="隔多久回" a={p.min} b={p.max} set={(a,b)=>set({min:a,max:b})} min={1} max={3600} unit="秒"/>
    <Num label="一次最多" value={p.burst} set={n=>set({burst:n})} min={1} max={6} unit="条"/>
    <Num label="已读不回" value={Math.round(p.ghost*100)} set={n=>set({ghost:n/100})} min={0} max={90} unit="%"/>
    <Switch on={p.join} set={v=>set({join:v})} label="把字卡拼成一句"/>
    {p.join&&<Num label="最多拼" value={p.joinMax} set={n=>set({joinMax:n})} min={2} max={5} unit="张"/>}
    <Switch on={p.stick!==false} set={v=>set({stick:v})} label="发表情包"/>

    <h3>主动找你</h3>
    <Switch on={p.pro} set={v=>set({pro:v,nextAt:0})} label="主动发消息"/>
    {p.pro&&<>
      <Range label="隔多久" a={p.proMin} b={p.proMax} set={(a,b)=>set({proMin:a,proMax:b,nextAt:0})} min={1} max={2880} unit="分钟"/>
      <div className="line"><span>睡觉</span><span className="num">
        <select value={p.quietFrom} onChange={e=>set({quietFrom:+e.target.value,nextAt:0})} aria-label="几点睡">{hours.map(h=><option key={h} value={h}>{h}:00</option>)}</select>–
        <select value={p.quietTo} onChange={e=>set({quietTo:+e.target.value,nextAt:0})} aria-label="几点醒">{hours.map(h=><option key={h} value={h}>{h}:00</option>)}</select></span></div>
      <Switch on={p.calls!==false} set={v=>set({calls:v})} label="打视频过来"/>
      <button className="trow" onClick={()=>{if(!nudge(p.id))say('他还没有能用的字卡');}}>让他现在说一句</button>
    </>}

    <h3>字卡</h3>
    {!st.decks.length?<p className="hint">还没有字卡分组。<a className="linkish" href="#/cards" onClick={close}>去加一个</a></p>
      :allDecks?<div className="chips">{st.decks.map(d=><button key={d.id} className="chip" aria-pressed={p.decks.includes(d.id)} onClick={()=>shareDeck(d.id,p.id,!p.decks.includes(d.id))}>{d.name}<small>{d.cards.length}</small></button>)}</div>
      :<button className="line pmore" onClick={()=>setAllDecks(true)} aria-expanded={false}><span>{mine.length?`${mine.length} 个分组，${mine.reduce((n,d)=>n+d.cards.length,0)} 张`:'还没选'}<small>{mine.slice(0,4).map(d=>d.name).join('、')}{mine.length>4?' …':''}</small></span><ChevronDown size={18} strokeWidth={1.6}/></button>}

    <div className="trows">
      <button className="trow danger" onClick={twice('clear',()=>{clearMsgs(p.id);say('聊天记录清空了');})}>{sure==='clear'?'再点一次，清空聊天记录':'清空聊天记录'}</button>
      <button className="trow danger" onClick={twice('drop',()=>{dropPersona(p.id);close();go('#/inbox');})}>{sure==='drop'?'再点一次，连记录一起删掉':'删掉这一位'}</button>
    </div>
  </Sheet>;
}

/** 主页照片的大图：左右划（电脑上按方向键、或点两边的箭头）看上一张下一张，点一下关掉；底下一行小字是哪天的 */
function PicView({pics,i,go,close}:{pics:{id:string;at:number}[];i:number;go:(i:number)=>void;close:()=>void}){
  const sw=useRef<{x:number;y:number}|null>(null);
  useBackClose(close);
  const step=(d:number)=>{const n=i+d;if(n>=0&&n<pics.length)go(n);};
  useEffect(()=>{const k=(e:KeyboardEvent)=>{if(e.key==='Escape')close();else if(e.key==='ArrowLeft')step(-1);else if(e.key==='ArrowRight')step(1);};
    addEventListener('keydown',k);return()=>removeEventListener('keydown',k);});
  return <Over><div className="viewer" role="dialog" aria-modal="true" aria-label={`照片，第 ${i+1} 张，共 ${pics.length} 张`} onClick={close}
    onTouchStart={e=>{const t=e.touches[0];sw.current=e.touches.length===1?{x:t.clientX,y:t.clientY}:null;}}
    onTouchEnd={e=>{const a=sw.current,t=e.changedTouches[0];sw.current=null;if(!a)return;const dx=t.clientX-a.x,dy=t.clientY-a.y;
      if(Math.abs(dx)>48&&Math.abs(dx)>Math.abs(dy)*1.4)step(dx<0?1:-1);}}>
    <Pic id={pics[i].id} alt="大图"/>
    {i>0&&<button className="pv-side l" onClick={e=>{e.stopPropagation();step(-1);}} aria-label="上一张"><ChevronLeft size={26} strokeWidth={1.6}/></button>}
    {i<pics.length-1&&<button className="pv-side r" onClick={e=>{e.stopPropagation();step(1);}} aria-label="下一张"><ChevronRight size={26} strokeWidth={1.6}/></button>}
    <small className="pv-cap">{dayLabel(pics[i].at)}{pics.length>1?` · ${i+1} / ${pics.length}`:''}</small>
  </div></Over>;
}

/* ───────── 主页 ───────── */

// 今日一句：每天从他的字卡里固定抽一张，当天不变

function Switcher({p,close}:{p:Persona;close:()=>void}){
  const st=S();
  const [name,setName]=useState('');
  const add=()=>{const n=name.trim();if(!n)return;const x=addPersona(n);close();go('#/us/'+x.id);};
  return <Sheet title="换一位" close={close}>
    <ul className="people">{st.personas.map(x=>{const n=unread(x);
      return <li key={x.id}><a href={'#/us/'+x.id} onClick={close} aria-current={x.id===p.id?'true':undefined}>
        <Avatar id={x.avatar} name={x.name} size={48}/><span className="who"><b>{x.name}</b><span>{n?`${n} 条新消息`:x.bio||'　'}</span></span>
        {x.id===p.id&&<Check size={20} strokeWidth={2}/>}
      </a></li>;})}</ul>
    <div className="newdeck"><input value={name} onChange={e=>setName(e.target.value)} onKeyDown={e=>{if(enter(e))add();}} placeholder="再添加一位，写下他的名字" aria-label="新一位的名字"/><button className="btn sm" onClick={add} disabled={!name.trim()}>添加</button></div>
  </Sheet>;
}

export function Home({p}:{p:Persona}){
  useVer();
  const st=S(),ms=list(p.id),b=box(p.id);
  const [edit,setEdit]=useState(false);
  const [sw,setSw]=useState(false);
  const mine=useRef<HTMLInputElement>(null);
  useEffect(()=>{if(st.prefs.last!==p.id)setPrefs({last:p.id});},[p.id]);
  const days=p.since?Math.max(1,Math.floor((Date.now()-new Date(p.since+'T00:00:00').getTime())/864e5)+1):0;
  const chatN=ms.filter(m=>m.kind!=='tip').length;
  // 主页那一排：自己挑过就按挑的，没挑过用默认的几个。顺序：自己拖过（或动过图钉）之后照自己排的；在那之前照功能表，和以前一样
  const known=(st.prefs.hl??homeDefault).filter(id=>feats.some(f=>f.id===id));
  const pinned=st.prefs.hlOrd?known:feats.map(f=>f.id).filter(id=>known.includes(id)),row=pinned.map(id=>feats.find(f=>f.id===id)!);
  const setHl=(ids:string[])=>setPrefs({hl:ids,hlOrd:true});
  // 在 ☰ 里按住 ≡ 上下拖，换那一排的顺序。拖的时候不挪真的位置（只用位移画出来），松手才存：这样手指按着的那个东西一直在原处，不会拖到一半断掉
  const [drag,setDrag]=useState<{id:string;from:number;dy:number;h:number}|null>(null),dragY=useRef(0);
  const dragTo=drag?Math.max(0,Math.min(pinned.length-1,drag.from+Math.round(drag.dy/drag.h))):-1;
  const move=(from:number,to:number)=>{if(to===from||to<0||to>=pinned.length)return;const a=[...pinned];a.splice(to,0,a.splice(from,1)[0]);setHl(a);};
  const grip=(id:string,i:number)=>({
    onPointerDown:(e:React.PointerEvent<HTMLButtonElement>)=>{if(e.button!==0)return;e.preventDefault();try{e.currentTarget.setPointerCapture(e.pointerId);}catch{/* */}dragY.current=e.clientY;setDrag({id,from:i,dy:0,h:e.currentTarget.closest('li')?.offsetHeight||55});},
    onPointerMove:(e:React.PointerEvent)=>{if(drag?.id===id)setDrag({...drag,dy:e.clientY-dragY.current});},
    onPointerUp:()=>{if(drag){move(drag.from,dragTo);setDrag(null);}},
    onPointerCancel:()=>setDrag(null),
    onKeyDown:(e:React.KeyboardEvent)=>{if(e.key==='ArrowUp'){e.preventDefault();move(i,i-1);}else if(e.key==='ArrowDown'){e.preventDefault();move(i,i+1);}},
    onContextMenu:(e:React.MouseEvent)=>e.preventDefault(),
  });
  const shift=(i:number):React.CSSProperties|undefined=>{
    if(!drag)return undefined;
    if(i===drag.from)return {transform:`translateY(${Math.max(-drag.from*drag.h,Math.min((pinned.length-1-drag.from)*drag.h,drag.dy))}px)`};
    const d=drag.from<dragTo&&i>drag.from&&i<=dragTo?-drag.h:drag.from>dragTo&&i>=dragTo&&i<drag.from?drag.h:0;
    return {transform:`translateY(${d}px)`,transition:'transform .16s var(--ease)'};
  };
  // 看的是照片还是收藏：离开主页再回来，还停在刚才那一栏
  const [menu,setMenu]=useState(false),[tab,setTab0]=useState<'pics'|'fav'>(()=>{try{return sessionStorage.getItem('cx-htab')==='fav'?'fav':'pics';}catch{return 'pics';}});
  const setTab=(t:'pics'|'fav')=>{setTab0(t);try{sessionStorage.setItem('cx-htab',t);}catch{/* */}};
  // 大图：view 是照片格子里的第几张（-1 没在看）；face 是在看他的头像
  const [view,setView]=useState(-1),[face,setFace]=useState(false);
  // 照片多的时候先画前面一些，往下滑到底再接着画（不然一进主页就要把几百张图全读出来）
  const [shown,setShown]=useState(36),more=useRef<HTMLDivElement>(null);
  // 那一排划到了哪儿：进了某个功能再回来，还停在那儿，不自己划回开头
  const hlEl=useRef<HTMLUListElement>(null);
  useLayoutEffect(()=>{const x=hlEl.current,v=hlAt[p.id];if(x&&v)x.scrollLeft=v;},[p.id]);
  // 那一排的封面：默认是一个小图标，长按（电脑上右键）可以换成自己的照片
  const covers=st.prefs.hlPic??{},[cover,setCover]=useState(''),held=useRef({t:0,fired:false}),cfile=useRef<HTMLInputElement>(null);
  const setCov=(id:string,img?:string)=>{const next={...covers};if(img)next[id]=img;else delete next[id];setPrefs({hlPic:next});};
  // 照片：聊天里发过的图、信里夹的照片（新的在前）
  const pics=[...ms.filter(m=>m.kind==='img'&&!m.st).map(m=>({id:m.text,at:m.at})),...b.letters.filter(l=>l.img&&(l.from==='me'||l.read)).map(l=>({id:l.img!,at:l.at})),...b.posts.filter(x=>x.img).map(x=>({id:x.img!,at:x.at}))].sort((x,y)=>y.at-x.at);
  // 收藏：收藏的话、收藏的信、喜欢的一句，照时间排
  type Fav={key:string;at:number;kind:'msg'|'mail'|'line';text:string;img?:string;who:string;to?:string;jump?:string};
  const favs:Fav[]=[
    ...ms.filter(m=>m.fav).map(m=>({key:m.id,at:m.at,kind:'msg' as const,text:m.kind==='img'?'':m.text,img:m.kind==='img'?m.text:undefined,who:m.from==='me'?st.prefs.myName:p.name,to:'#/c/'+p.id,jump:m.id})),
    ...b.letters.filter(l=>l.star).map(l=>({key:l.id,at:l.at,kind:'mail' as const,text:l.text.split('\n').find(x=>x.trim())??'',who:l.from==='me'?`寄给 ${p.name} 的信`:`${p.name} 的信`,to:`#/f/mail/${p.id}/r/${l.id}`})),
    ...b.lines.filter(x=>x.like).map(x=>({key:'l'+x.date,at:new Date(x.date+'T12:00:00').getTime(),kind:'line' as const,text:x.text,who:'一句'})),
  ].sort((x,y)=>y.at-x.at);
  useEffect(()=>{const el=more.current;if(!el||!('IntersectionObserver' in window))return;
    const io=new IntersectionObserver(es=>{if(es.some(e=>e.isIntersecting))setShown(n=>n+36);},{rootMargin:'400px'});io.observe(el);return()=>io.disconnect();},[tab,shown,pics.length]);
  const line=todayLine(p);
  const [note,setNote]=useState(false);
  useEffect(()=>{keepToday(p);},[p.id,line]);
  const others=st.personas.filter(x=>x.id!==p.id).reduce((n,x)=>n+unread(x),0);
  const dot:Record<string,boolean>={mail:b.letters.some(l=>l.from==='ta'&&!l.read),cycle:!!cyPhase(b.cycle)};   // 经期：快来了、或者正在经期里，那个圆圈亮着
  return <main className="page home" style={{'--accent':p.accent} as React.CSSProperties}>
    <header className="bar">
      {nav.from.startsWith('#/c/')&&<a className="ico back" href={nav.from} onClick={backTo(nav.from)} aria-label="回到聊天"><ChevronLeft size={28} strokeWidth={1.8}/></a>}
      <button className="namebtn" onClick={()=>setSw(true)} aria-label={`现在是 ${p.name}，点开换一位`}><b>{p.name}</b><ChevronDown size={18} strokeWidth={2}/>{others>0&&<i/>}</button>
      <button className="ico" onClick={()=>setMenu(true)} aria-label="更多"><Menu size={25} strokeWidth={1.7}/></button>
    </header>

    <section className="profile">
      <div className="face">
        {/* 今天的一句：和 ins 的便签一样，一个和头像差不多宽的小气泡，居中压在头像上沿；字多了只露三行，点开看全 */}
        {line&&<button className="note" onClick={()=>setNote(true)} aria-label={`${p.name} 今天的一句：${line}${noteNew(p)?'（还没看过）':''}`}><span>{line}</span>{noteNew(p)&&<i className="note-dot" aria-hidden="true"/>}</button>}
        <div className="face-a">
          {/* 点头像：有照片就看大图（换头像在「编辑主页」里）；还没有照片就去放一张 */}
          <button onClick={()=>p.avatar?setFace(true):setEdit(true)} aria-label={p.avatar?`看 ${p.name} 的头像`:'给他放一张头像'}><Avatar id={p.avatar} name={p.name} size={86}/></button>
          <button className="mebadge" onClick={()=>mine.current?.click()} aria-label="换我的头像"><Avatar id={st.prefs.myAvatar} name={st.prefs.myName} size={32}/></button>
          <input ref={mine} type="file" accept="image/*" hidden onChange={async e=>{const f=e.target.files?.[0];if(f)setPrefs({myAvatar:await putImage(f,512)});}}/>
        </div>
      </div>
      <div className="pinfo">
        <b>{st.prefs.myName} &amp; {p.name}</b>
        {/* 三个数都能点：天 → 纪念日，消息 → 聊天，信 → 信箱（ins 上点数字也是进到那一栏） */}
        <dl className="stats">
          <a href={`#/f/days/${p.id}`} aria-label={`在一起 ${days||0} 天，去看纪念日`}><dd>{days||'—'}</dd><dt>天</dt></a>
          <a href={`#/c/${p.id}`} aria-label={`${chatN} 条消息，去聊天`}><dd>{chatN}</dd><dt>消息</dt></a>
          <a href={`#/f/mail/${p.id}`} aria-label={`${b.letters.length} 封信，去信箱`}><dd>{b.letters.length}</dd><dt>信</dt></a>
        </dl>
      </div>
    </section>
    {p.bio&&<p className="bio">{p.bio}</p>}
    <p className="bio">{p.since?`${p.since.replace(/-/g,'.')} 起`:<button className="linkish" onClick={()=>setEdit(true)}>写下在一起的日子</button>}</p>
    <div className="rowbtn two"><a className="btn ghost" href={'#/c/'+p.id}>发消息</a><button className="btn ghost" onClick={()=>setEdit(true)}>编辑主页</button></div>

    {row.length>0&&<ul className="hl" aria-label="常用的" ref={hlEl} onScroll={e=>{hlAt[p.id]=e.currentTarget.scrollLeft;}}>
      {row.map(f=><li key={f.id}><a href={`#/f/${f.id}/${p.id}`} className={dot[f.id]?'new':''} onPointerDown={e=>{if(e.button!==0)return;held.current.fired=false;held.current.t=window.setTimeout(()=>{held.current.fired=true;try{navigator.vibrate?.(8);}catch{/* */}setCover(f.id);},480);}}
        onPointerUp={()=>clearTimeout(held.current.t)} onPointerLeave={()=>clearTimeout(held.current.t)} onPointerCancel={()=>clearTimeout(held.current.t)}
        onClick={e=>{if(held.current.fired){e.preventDefault();held.current.fired=false;}}} onContextMenu={e=>{e.preventDefault();clearTimeout(held.current.t);held.current.fired=true;setCover(f.id);}}
        aria-label={`${f.name}${dot[f.id]?'，有新的':''}`}>
        <span>{covers[f.id]?<Pic id={covers[f.id]} alt="" now/>:<f.icon size={20} strokeWidth={1.4}/>}</span>{f.name}</a></li>)}
    </ul>}

    <div className="seg htabs" role="tablist" aria-label="看什么">
      <button role="tab" aria-selected={tab==='pics'} onClick={()=>setTab('pics')} aria-label="照片"><Grid3x3 size={22} strokeWidth={tab==='pics'?2:1.5}/></button>
      <button role="tab" aria-selected={tab==='fav'} onClick={()=>setTab('fav')} aria-label="收藏"><Bookmark size={22} strokeWidth={tab==='fav'?2:1.5}/></button>
    </div>
    {tab==='pics'?(pics.length?<><div className="grid hgrid">{pics.slice(0,shown).map((x,i)=><button key={x.id+i} onClick={()=>setView(i)} aria-label={`看大图，${dayLabel(x.at)}`}><Pic id={x.id} alt="" now={i<9}/></button>)}</div>
        {pics.length>shown&&<div ref={more} className="hmore" aria-hidden="true"/>}</>
      :<p className="empty">你们发过的照片会排在这里。</p>)
    :(favs.length?<ul className="hfav">{favs.map(f=>{
        const body=<>{f.img?<Pic id={f.img} className="favpic" alt="收藏的图片"/>:<p>{f.text}</p>}<small>{f.kind==='mail'&&<Mail size={12} strokeWidth={1.8} aria-hidden="true"/>}{f.kind==='line'&&<Heart size={12} strokeWidth={1.8} aria-hidden="true"/>}{f.who} · {f.kind==='line'?`${new Date(f.at).getMonth()+1}月${new Date(f.at).getDate()}日`:dayLabel(f.at)}</small></>;
        return <li key={f.key}>{f.to?<a href={f.to} onClick={()=>{if(f.jump)try{sessionStorage.setItem('cx-jump',f.jump);}catch{/* */}}}>{body}</a>:<button onClick={()=>setNote(true)}>{body}</button>}</li>;})}</ul>
      :<p className="empty">聊天里长按一句话点「收藏」，它就留在这里。</p>)}
    {view>=0&&pics[view]&&<PicView pics={pics} i={view} go={setView} close={()=>setView(-1)}/>}
    {face&&p.avatar&&<Over><BackClose close={()=>setFace(false)}/><button className="viewer" onClick={()=>setFace(false)} aria-label="关掉大图"><Pic id={p.avatar} alt={`${p.name} 的头像`}/></button></Over>}
    <input ref={cfile} type="file" accept="image/*" hidden onChange={async e=>{const f=e.target.files?.[0];e.target.value='';const id=cover;setCover('');if(f&&id)try{setCov(id,await putImage(f,400));}catch{say('这张图片读不了，换一张试试');}}}/>
    {cover&&<Sheet title="" plain close={()=>setCover('')}>
      <ul className="ml-menu">
        <li><button onClick={()=>cfile.current?.click()}>换封面</button></li>
        {covers[cover]&&<li><button onClick={()=>{setCov(cover);setCover('');}}>用回图标</button></li>}
        <li><button onClick={()=>{setHl(pinned.filter(x=>x!==cover));setCover('');}}>从这一排拿掉</button></li>
      </ul>
    </Sheet>}
    {menu&&<Sheet title="" plain close={()=>setMenu(false)}>
      <ul className={`hmenu${drag?' sorting':''}`}>
        {row.map((f,i)=><li key={f.id} className={drag?.id===f.id?'drag':''} style={shift(i)}><a href={`#/f/${f.id}/${p.id}`}><f.icon size={22} strokeWidth={1.5}/>{f.name}</a>
          <button className="grip" {...grip(f.id,i)} aria-label={`按住上下拖，挪 ${f.name} 的位置（现在第 ${i+1} 个）`}><GripHorizontal size={20} strokeWidth={1.6}/></button>
          <button aria-pressed onClick={()=>setHl(pinned.filter(x=>x!==f.id))} aria-label={`把 ${f.name} 从主页那一排拿掉`}><Pin size={18} strokeWidth={1.6} fill="currentColor"/></button></li>)}
        {feats.filter(f=>!pinned.includes(f.id)).map(f=><li key={f.id}><a href={`#/f/${f.id}/${p.id}`}><f.icon size={22} strokeWidth={1.5}/>{f.name}</a>
          <button aria-pressed={false} onClick={()=>setHl([...pinned,f.id])} aria-label={`把 ${f.name} 放到主页那一排`}><Pin size={18} strokeWidth={1.6}/></button></li>)}
      </ul>
      <p className="hint center">图钉亮着的排在主页，按住 <GripHorizontal size={13} strokeWidth={1.8} style={{verticalAlign:'-2px'}}/> 拖动换顺序；长按主页上的圆圈换封面。</p>
    </Sheet>}
    {edit&&<PersonaSheet p={p} close={()=>setEdit(false)}/>}
    {note&&<NoteCard p={p} close={()=>setNote(false)}/>}
    {sw&&<Switcher p={p} close={()=>setSw(false)}/>}
  </main>;
}

const hlAt:Record<string,number>={};   // 主页那一排各自划到的位置（这一次打开期间记着）

/* ───────── 字卡 ───────── */

export function Cards({deckId}:{deckId?:string}){
  useVer();
  const st=S();
  const d=st.decks.find(x=>x.id===deckId);
  const file=useRef<HTMLInputElement>(null);
  const [name,setName]=useState(''),[add,setAdd]=useState(false),[q,setQ]=useState(''),[kind,setKind0]=useState<'all'|Fn>(()=>{try{const v=sessionStorage.getItem('cx-ctab');return v==='chat'||v==='check'||v==='cycle'?v:'all';}catch{return 'all';}});
  const setKind=(k:'all'|Fn)=>{setKind0(k);try{sessionStorage.setItem('cx-ctab',k);}catch{/* */}};
  const dups=useMemo(()=>dupCards(),[st.decks]),[dup,setDup]=useState(false);
  if(d)return <DeckPage d={d}/>;
  const make=()=>{const n=name.trim();if(!n)return;const x=addDeck(n,kind==='all'?undefined:kind);setName('');setAdd(false);go('#/cards/'+x.id);};
  // 搜字卡：在所有分组里找这几个字；分组的名字对得上也算
  const term=q.trim(),hits=term?st.decks.flatMap(x=>x.cards.filter(c=>c.t.includes(term)).map(c=>({deck:x,c}))):[];
  const named=term?st.decks.filter(x=>x.name.includes(term)):[];
  const fnOf=new Map(st.decks.map(x=>[x.id,deckFn(x)])),tabs=st.decks.length>8||st.decks.some(x=>fnOf.get(x.id)!=='chat');
  const shownDecks=st.decks.filter(x=>kind==='all'||!tabs||fnOf.get(x.id)===kind);
  const mark=(t:string)=>{const i=t.indexOf(term);return i<0?t:<>{t.slice(0,i)}<mark>{term}</mark>{t.slice(i+term.length)}</>;};
  const load=async(f?:File)=>{
    if(!f)return;
    const groups=readCards(await f.text());
    if(!groups.length){say('这个文件里没读到字卡');return;}
    let n=0;for(const g of groups){const x=addDeck(groups.length===1&&g.name==='导入的分组'?f.name.replace(/\.[^.]+$/,''):g.name);n+=addCards(x.id,g.lines.join('\n')).added;}
    say(`导入了 ${groups.length} 个分组，共 ${n} 张`);
  };
  const row=(x:Deck)=>{
    const users=st.personas.filter(p=>p.decks.includes(x.id));
    return <li key={x.id}><a href={'#/cards/'+x.id}>
      <span className="who"><b>{x.name}</b><span>{x.cards.length} 张{fnOf.get(x.id)!=='chat'&&<> · {fns.find(f=>f.id===fnOf.get(x.id))?.name}</>}{x.when!=='all'&&<> · {whens.find(w=>w.id===x.when)?.name}</>}{x.use!=='both'&&<> · {x.use==='pro'?'只用于主动':'只用于回复'}</>}</span></span>
      <span className="users">{users.length?users.slice(0,4).map(p=><Avatar key={p.id} id={p.avatar} name={p.name} size={24}/>):<small>没人在用</small>}{users.length>1&&<em>公用</em>}</span>
      <ChevronRight size={18} strokeWidth={1.6}/>
    </a></li>;
  };
  return <main className="page">
    <header className="bar"><h1>字卡</h1><button className="ico" onClick={()=>setAdd(true)} aria-label="新建分组或导入"><Plus size={26} strokeWidth={1.7}/></button>
      <input ref={file} type="file" accept=".txt,.json,text/plain,application/json" hidden onChange={e=>{void load(e.target.files?.[0]);e.target.value='';}}/></header>
    {st.decks.length>0&&<label className="find wide cfind"><Search size={16}/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="搜字卡" aria-label="搜字卡" enterKeyHint="search"/>{q&&<button type="button" onClick={()=>setQ('')} aria-label="清掉"><X size={16}/></button>}</label>}
    {term?<>
      {named.length>0&&<ul className="decks">{named.map(row)}</ul>}
      {hits.length?<><h3 className="cfound">{hits.length} 张</h3><ul className="chits">{hits.slice(0,80).map(h=><li key={h.deck.id+h.c.id}><a href={'#/cards/'+h.deck.id} onClick={()=>{try{sessionStorage.setItem('cx-find',term);}catch{/* */}}} className={h.c.off?'off':''}><p>{mark(h.c.t)}</p><small>{h.deck.name}{h.c.off?' · 停用了':''}</small></a></li>)}</ul>
        {hits.length>80&&<p className="hint center">只列出前 80 张，再多写几个字能找得更准。</p>}</>
        :!named.length&&<p className="empty">没有带「{term}」的字卡。</p>}
    </>:<>
      {tabs&&<div className="seg ctabs" role="tablist" aria-label="看哪些分组">{([['all','全部'],...fns.map(f=>[f.id,f.name])] as ['all'|Fn,string][]).map(([id,n])=><button key={id} role="tab" aria-selected={kind===id} onClick={()=>setKind(id)}>{n}</button>)}</div>}
      {dups.length>0&&<p className="cdup"><span>有 {dups.length} 句话重复了</span><button className="linkish" onClick={()=>setDup(true)}>整理</button></p>}
      {st.decks.length?(shownDecks.length?<ul className="decks">{shownDecks.map(row)}</ul>:<p className="empty">还没有「{fns.find(f=>f.id===kind)?.name}」的分组。点右上角的 + 新建一个，或者打开一个分组把用途改过来。</p>)
        :<div className="ml-none"><p>他说的每一句话，都是从字卡里抽出来的。<br/>先建一个分组，把他会说的话一行一句放进去。</p><button className="btn" onClick={()=>setAdd(true)}>建第一个分组</button></div>}
    </>}
    {dup&&<DupSheet groups={dups} close={()=>setDup(false)}/>}
    {add&&<Sheet title={tabs&&kind!=='all'&&kind!=='chat'?`新分组 · ${fns.find(f=>f.id===kind)?.name}`:'新分组'} close={()=>setAdd(false)}>
      <form className="newdeck" onSubmit={e=>{e.preventDefault();make();}}><input value={name} onChange={e=>setName(e.target.value)} placeholder={kind==='check'?'分组的名字，比如 他的报备':kind==='cycle'?'分组的名字，比如 经期中':'分组的名字，比如 日常'} aria-label="新分组的名字" autoFocus={auto}/><button className="btn sm" disabled={!name.trim()}>新建</button></form>
      <p className="hint"><button type="button" className="linkish" onClick={()=>{setAdd(false);file.current?.click();}}>或者从文件导入</button>（一行一句的文本，或别的传讯网站导出的文件）</p>
    </Sheet>}
  </main>;
}
/* 去重：所有分组放在一起比。每句话留哪几张她说了算——点亮的留下，没点亮的删掉 */
type Dup=ReturnType<typeof dupCards>[number];
function DupSheet({groups,close}:{groups:Dup[];close:()=>void}){
  const st=S(),[armed,twice]=useTwice();
  const key=(x:Dup['at'][number])=>x.d.id+'/'+x.c.id;
  // 默认：每句留最前面那一张。和它在同一个分组里的、或者同一种用途又有同一个人在用的，算真的重复，默认删掉；
  // 给不同的人用、用途不一样（比如一张在日常、一张在报备）的，默认各留一张
  const users=(id:string)=>st.personas.filter(p=>p.decks.includes(id)).map(p=>p.id);
  const same=(a:Dup['at'][number],b:Dup['at'][number])=>a.d.id===b.d.id||(deckFn(a.d)===deckFn(b.d)&&users(a.d.id).some(u=>users(b.d.id).includes(u)));
  const [off,setOff]=useState<Set<string>>(()=>{const v=new Set<string>();
    for(const g of groups){const kept:Dup['at']=[];for(const x of g.at){if(kept.some(k=>same(k,x)))v.add(key(x));else kept.push(x);}}
    return v;});
  const n=(g:Dup)=>g.at.filter(x=>off.has(key(x))).length,total=groups.reduce((a,g)=>a+n(g),0);
  const sorted=useMemo(()=>[...groups].sort((a,b)=>Number(n(b)>0)-Number(n(a)>0)),[groups]);   // eslint-disable-line react-hooks/exhaustive-deps
  const flip=(g:Dup,x:Dup['at'][number])=>{const k=key(x),v=new Set(off);
    if(v.has(k))v.delete(k);else{if(g.at.filter(y=>!v.has(key(y))).length<=1){say('每句话至少留一张');return;}v.add(k);}
    setOff(v);};
  const run=()=>{dropCards(groups.flatMap(g=>g.at.filter(x=>off.has(key(x))).map(x=>({d:x.d.id,c:x.c.id}))));say(`删掉了 ${total} 张重复的`);close();};
  return <Sheet title="重复的字卡" close={close}>
    <p className="hint first">所有分组放在一起比过了。点亮的留下，没点亮的删掉；给不同的人用、用途不一样的分组，默认各留一张。</p>
    <ul className="dups">{sorted.slice(0,120).map(g=><li key={key(g.at[0])}>
      <p>{g.t}</p>
      <div className="chips">{g.at.map(x=><button key={key(x)} className="chip" aria-pressed={!off.has(key(x))} onClick={()=>flip(g,x)} aria-label={`${x.d.name} 里的这一张：${off.has(key(x))?'会删掉，点一下留着':'留着，点一下删掉'}`}>{x.d.name}</button>)}</div>
    </li>)}</ul>
    {sorted.length>120&&<p className="hint center">只列出前 120 句，剩下的 {sorted.length-120} 句照同样的办法一起处理。</p>}
    <button className="btn" disabled={!total} onClick={twice('go',run)}>{!total?'没有要删的':armed==='go'?`再点一次，删掉 ${total} 张`:`去重 · 删掉 ${total} 张`}</button>
  </Sheet>;
}
function DeckPage({d}:{d:Deck}){
  const st=S();
  const [text,setText]=useState('');
  // 从「搜字卡」点过来的：带着要找的那几个字
  const [q,setQ]=useState(()=>{try{const v=sessionStorage.getItem('cx-find')??'';sessionStorage.removeItem('cx-find');return v;}catch{return '';}});
  const [sure,setSure]=useState(false);
  const [armed,twice]=useTwice();
  const add=()=>{const r=addCards(d.id,text);setText('');say(r.added?`加了 ${r.added} 张${r.dup?`，${r.dup} 张重复的没加`:''}`:r.dup?'这些都已经有了':'先写点什么');};
  const all=q.trim()?d.cards.filter(c=>c.t.includes(q.trim())):d.cards,fn=deckFn(d);
  // 字卡上千张的时候先画前面一段，往下滑到底再接着画（不然一点开要等它把一千多行全画完）
  const [lim,setLim]=useState(150),tail=useRef<HTMLDivElement>(null);
  useEffect(()=>{const x=tail.current;if(!x||typeof IntersectionObserver!=='function')return;const io=new IntersectionObserver(es=>{if(es.some(e=>e.isIntersecting))setLim(n=>n+300);},{rootMargin:'600px'});io.observe(x);return()=>io.disconnect();},[all.length>lim]);
  const shown=all.slice(0,lim);
  return <main className="page deck">
    <header className="bar"><a className="ico" href="#/cards" aria-label="回到字卡"><ChevronLeft size={28} strokeWidth={1.8}/></a><input className="title-in" value={d.name} onChange={e=>setDeck(d.id,{name:e.target.value})} aria-label="分组名字"/>
      <button className="ico" onClick={()=>download(d.name+'.txt',d.cards.map(c=>c.t).join('\n'),'text/plain')} aria-label="导出这个分组">导出</button></header>

    <h3>谁在用</h3>
    <div className="chips">{st.personas.map(p=><button key={p.id} className="chip who-chip" aria-pressed={p.decks.includes(d.id)} onClick={()=>shareDeck(d.id,p.id,!p.decks.includes(d.id))}><Avatar id={p.avatar} name={p.name} size={22}/>{p.name}</button>)}</div>
    <p className="hint">点亮几位，这个分组就由他们公用；改字卡时所有人一起变。</p>

    <h3>用途</h3>
    <div className="chips" role="radiogroup" aria-label="用途">{fns.map(f=><button key={f.id} className="chip" role="radio" aria-checked={fn===f.id} aria-pressed={fn===f.id} onClick={()=>setDeck(d.id,{fn:f.id})}>{f.name}</button>)}</div>
    {fn!=='chat'&&<p className="hint">{fn==='check'?'在「报备」的设置里选他的报备字卡时，直接从这一类里挑。':'在「经期」的设置里选经期前、经期中他说的话时，直接从这一类里挑。'}</p>}

    <h3>什么时候用</h3>
    <div className="chips">{whens.map(w=><button key={w.id} className="chip" aria-pressed={d.when===w.id} onClick={()=>setDeck(d.id,{when:w.id as When})}>{w.name}{w.id!=='all'&&<small>{w.from}–{w.to}点</small>}</button>)}</div>
    <div className="chips">{uses.map(u=><button key={u.id} className="chip" aria-pressed={d.use===u.id} onClick={()=>setDeck(d.id,{use:u.id as Use})}>{u.name}</button>)}</div>

    <h3>加字卡</h3>
    <textarea className="bulk" rows={4} value={text} onChange={e=>setText(e.target.value)} placeholder={'一行一句，可以一次贴很多行\n在吗\n想你了\n今天过得怎么样'} aria-label="要加的字卡，一行一句"/>
    <button className="btn sm" onClick={add} disabled={!text.trim()}>加进去</button>

    <div className="list-head"><h3>{d.cards.length} 张</h3><label className="find"><Search size={15}/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="搜" aria-label="搜字卡"/></label></div>
    <ul className="cards">{shown.map(c=><li key={c.id} className={c.off?'off':''}>
      <span>{c.t}</span>
      <button className="ico sm" onClick={()=>setCard(d.id,c.id,{off:!c.off})} aria-label={c.off?'恢复这张':'先不用这张'} aria-pressed={!!c.off}><EyeOff size={17} strokeWidth={1.7}/></button>
      <button className={`ico sm${armed===c.id?' danger':''}`} onClick={twice(c.id,()=>setCard(d.id,c.id,null))} aria-label={armed===c.id?'再点一次，删掉这张':'删掉这张'}>{armed===c.id?<small>再点一次</small>:<Trash2 size={17} strokeWidth={1.7}/>}</button>
    </li>)}</ul>
    {all.length>lim&&<div ref={tail} className="hmore" aria-hidden="true"/>}
    {!shown.length&&<p className="empty">{d.cards.length?'没有搜到。':'这个分组还是空的。'}</p>}
    <button className="chip danger" onClick={()=>{if(!sure){setSure(true);return;}dropDeck(d.id);go('#/cards');}}>{sure?'再点一次就删掉整个分组':'删掉这个分组'}</button>
  </main>;
}

/* ───────── 同步 ───────── */

export function SyncPanel(){
  const sy=useSync();
  const [token,setToken]=useState(''),[repo,setRepo]=useState(''),[more,setMore]=useState(false),[busy,setBusy]=useState(false),[err,setErr]=useState(''),[sure,setSure]=useState(false);
  const link=async()=>{setBusy(true);setErr('');const e=await connect(token,repo);setBusy(false);if(e)setErr(e);else{setToken('');say('连上了，数据已经对齐');}};
  if(!sy.on)return <div className="sync">
    <p className="hint">把数据放进你自己 GitHub 上的一个私有仓库。换手机、换电脑，填同一个令牌就都接上；两台设备各聊各的，也会合到一起，不会互相盖掉。</p>
    <label className="field"><span>GitHub 令牌</span><input type="password" autoComplete="off" spellCheck={false} value={token} onChange={e=>setToken(e.target.value)} placeholder="粘贴你自己的令牌" onKeyDown={e=>{if(e.key==='Enter')void link();}}/></label>
    {more&&<label className="field"><span>仓库（不填就用你名下的 {defaultRepo}）</span><input value={repo} onChange={e=>setRepo(e.target.value)} placeholder={`用户名/${defaultRepo}`} autoCapitalize="off" spellCheck={false}/></label>}
    {err&&<p className="warn" role="alert">{err}</p>}
    <div className="rowbtn"><button className="btn sm" onClick={()=>void link()} disabled={busy||!token.trim()}>{busy?'正在连接…':'连接'}</button>{!more&&<button className="chip" onClick={()=>setMore(true)}>用别的仓库</button>}</div>
    <p className="hint">令牌只存在这台设备上，不会进备份文件。没有仓库时会替你新建一个私有的 {defaultRepo}；如果令牌不许新建，就先在 GitHub 上建好这个私有仓库，再给令牌它的 Contents 读写权限。</p>
  </div>;
  const state=sy.busy?'正在同步…':sy.err?sy.err:sy.note||'已连接';
  return <div className="sync">
    <div className="line"><span>{sy.repo}<small className={sy.err&&!sy.busy?'bad':''}>{state}</small></span><button className="chip" onClick={()=>void syncNow(true)} disabled={sy.busy}>现在同步</button></div>
    <dl className="times">
      <div><dt>上次同步</dt><dd>{sy.at?dayLabel(sy.at):'还没有'}</dd></div>
      <div><dt>云端更新</dt><dd>{sy.cloudAt?dayLabel(sy.cloudAt):'—'}</dd></div>
      <div><dt>本机改动</dt><dd>{sy.localAt?(sy.localAt>sy.at?'有新的，等着传':'都传上去了'):'没有新的'}</dd></div>
    </dl>
    <Switch on={sy.auto} set={v=>void setAuto(v)} label="自动同步" note="本机有改动十几秒后传上去；回到页面和每隔几分钟，也会去拿别的设备的改动"/>
    <div className="rowbtn"><button className="chip danger" onClick={async()=>{if(!sure){setSure(true);return;}await disconnect();setSure(false);say('这台设备不再同步了，云端的数据还在');}}>{sure?'再点一次，断开这台设备':'断开同步'}</button></div>
  </div>;
}

/* ───────── 设置 ───────── */
const Dot=({ok,text}:{ok:boolean;text:string})=><span className={`state${ok?' ok':''}`}><i/>{text}</span>;
const modes=[['pip','画中画'],['loop','静音音频'],['osc','振荡器'],['both','两者都开']] as const;
const modeNote=(ios:boolean)=>({
  pip:'开一个系统小窗，页面在后台就不会被停掉。完全不占声音，听歌、刷视频都不受影响。需要点一下「进入画中画」。',
  loop:ios?'循环放一段听不见的声音，锁屏上会多一个播放条。iPhone 上它和别的声音不能同时在：它一开，你正在听的歌会停；你在别的 app 一放歌或视频，它就被系统停掉，保活也跟着断。':'循环放一段听不见的声音。最通用；锁屏上会多一个播放条，也可能把你正在听的歌停掉。',
  osc:ios?'一个小到听不见的持续音，不会打断你听的歌，锁屏上也没有播放条。但 iPhone 一切到后台就会把它停掉，基本留不住。':'用一个小到听不见的持续音保持活跃，锁屏上不出现播放条；部分机型切到后台仍会被系统收回。',
  both:ios?'静音音频和振荡器一起开。和静音音频一样，会和你听的歌、看的视频抢声音。':'静音音频和振荡器一起开，最不容易掉。',
});
const span=(ms:number)=>{const s=Math.round(ms/1000);return s<60?`${s} 秒`:s<3600?`${Math.floor(s/60)} 分 ${s%60} 秒`:`${Math.floor(s/3600)} 小时 ${Math.floor(s%3600/60)} 分`;};

export function Settings({sec=''}:{sec?:string}){
  useVer();
  const st=S(),pf=st.prefs;
  const [s,setS]=useState(status());
  const file=useRef<HTMLInputElement>(null);
  const [sure,setSure]=useState(false);
  useEffect(()=>{const t=setInterval(()=>setS(status()),1500);return()=>clearInterval(t);},[]);
  const slot=useRef<HTMLDivElement>(null);
  useEffect(()=>onPip(()=>setS(status())),[]);
  useEffect(()=>{pipSlot(slot.current);return()=>pipSlot(null);},[st.prefs.audio,sec]);
  const [bak,setBak]=useState<File|null>(null);
  const [check,setCheck]=useState(false);
  const mode=st.prefs.mode??'loop',away=lastAway();
  const [pl,setPl]=useState(pushLive());
  const [addr,setAddr]=useState('');
  const mine=useRef<HTMLInputElement>(null),sy=useSync(),ins=useInstall();
  // 设置分成几页：首页是一张短列表，点一行进那一页（地址里带着，返回键能回来）
  const themeName={auto:'跟随系统',light:'浅色',dark:'深色'}[pf.theme],bubbleName={ins:'ins',mono:'黑白',accent:'点缀色',line:'细边'}[pf.bubble];
  const secs:[string,string,string][]=[['me','我',pf.myName],['look','外观',`${themeName} · ${bubbleName}`],
    ['bg','通知与后台',s.shell?(s.notify==='granted'&&pf.notify?'通知开着':'没开'):pl?'云端推送开着':pf.audio?'后台保活开着':s.notify==='granted'&&pf.notify?'通知开着':'没开'],
    ['sync','同步',sy.on?(sy.busy?'正在同步…':sy.err?'出了点问题':'开着'):'没连'],['backup','备份','']];
  const title=secs.find(x=>x[0]===sec)?.[1];
  useEffect(()=>{void pushPrep();return onPush(()=>setPl(pushLive()));},[]);
  if(!title)return <main className="page">
    <header className="bar"><h1>设置</h1></header>
    <ul className="setlist">{secs.map(([id,n,v])=><li key={id}><a href={'#/set/'+id}><span>{n}</span><small>{v}</small><ChevronRight size={18} strokeWidth={1.6}/></a></li>)}
      <li><a href="#/set/help"><span>使用说明</span><small/><ChevronRight size={18} strokeWidth={1.6}/></a></li>
      {ins.can&&<li><button onClick={()=>void ins.go()}><span>安装到这台设备</span><small>像 app 一样从桌面打开</small><ChevronRight size={18} strokeWidth={1.6}/></button></li>}</ul>
    <p className="foot">回复是从你放进去的字卡里随机抽的。</p>
  </main>;
  return <main className="page sub">
    <header className="bar"><a className="ico" href="#/set" onClick={backTo('#/set')} aria-label="回到设置"><ChevronLeft size={28} strokeWidth={1.8}/></a><h1>{title}</h1></header>
    {sec==='me'&&<>
    <div className="me-row">
      <button className="pick" onClick={()=>mine.current?.click()} aria-label="换我的头像"><Avatar id={pf.myAvatar} name={pf.myName} size={76}/><span>换头像</span></button>
      <input ref={mine} type="file" accept="image/*" hidden onChange={async e=>{const f=e.target.files?.[0];e.target.value='';if(f)try{setPrefs({myAvatar:await putImage(f,512)});}catch{say('这张图片读不了，换一张试试');}}}/>
    </div>
    <label className="field"><span>我的名字</span><input value={pf.myName} onChange={e=>setPrefs({myName:e.target.value})}/></label>
    </>}
    {sec==='look'&&<>
    <div className="line"><span>明暗</span><div className="seg sm">{([['auto','跟随系统'],['light','浅色'],['dark','深色']] as const).map(([id,n])=><button key={id} aria-pressed={pf.theme===id} onClick={()=>setPrefs({theme:id})}>{n}</button>)}</div></div>
    <div className="line"><span>我的气泡</span><div className="seg sm">{([['ins','ins'],['mono','黑白'],['accent','点缀色'],['line','细边']] as const).map(([id,n])=><button key={id} aria-pressed={pf.bubble===id} onClick={()=>setPrefs({bubble:id})}>{n}</button>)}</div></div>
    <Switch on={pf.sound} set={v=>setPrefs({sound:v})} label="收到消息时响一声"/>
    </>}
    {sec==='bg'&&s.shell&&<>
    <p className="hint first">这是装在手机上的安装包：他要说的话，到点由手机自己弹出来，小鹿被划掉也照样弹。不需要云端推送，也不用后台保活。</p>
    <Switch on={s.notify==='granted'&&pf.notify} set={async v=>{if(!v){setPrefs({notify:false});shellSync();setS(status());return;}const ok=await askNotify();setS(status());say(ok?'通知开好了':'系统没有同意。到手机的 设置 → 应用 → 小鹿 → 通知 里打开');}} label="消息通知" note="他找你时弹系统通知"/>
    {s.notify==='granted'&&pf.notify&&<div className="rowbtn"><button className="chip" onClick={()=>{const p=st.personas.find(x=>x.id===pf.last)??st.personas[0];if(p){notify(p,lines(p,1)[0]??'这是一条测试通知');say('发了，看看有没有弹出来');}}}>发一条测试通知</button></div>}
    {s.shellKeep&&s.notify==='granted'&&pf.notify&&<Switch on={s.shellKeep==='on'} set={async v=>{await setShellKeep(v);setS(status());}} label="后台常驻" note="通知栏里一直挂一条不响的「待机中」。开着的话系统不容易把小鹿停掉，他的消息来得更准"/>}
    {s.shellSet&&<div className="rowbtn"><button className="chip" onClick={()=>shellOpen('notify')}>系统的通知设置</button><button className="chip" onClick={()=>shellOpen('app')}>系统的应用设置</button></div>}
    <p className="hint">到了但不从屏幕顶上弹出来：在系统的通知设置里点进「他的消息」，把「横幅」打开（华为、小米默认是关的）。<br/>人不在小鹿里就收不到：在系统的应用设置里把电池改成「不限制」，允许自启动和后台活动。华为在 设置 → 应用和服务 → 应用启动管理 → 小鹿 → 改成手动管理，三项都打开。</p>
    </>}
    {sec==='bg'&&!s.shell&&<>
    <h3>云端推送</h3>
    <p className="hint">他要说的话到点由云端推到手机，小鹿不用留在后台。</p>
    {pushSet()?<>
      <Switch on={pl} set={async v=>{const e=v?await pushOn():(await pushOff(),'');const had=v&&!e&&S().prefs.audio;if(had)await audioOn(false);setPl(pushLive());setS(status());say(e||(v?(had?'云端推送开好了，后台保活替你关掉了':'云端推送开好了'):'云端推送关掉了'));}} label="云端推送" note={pl?'开着。离开小鹿时，他接下来的几句话会交给云端按时送到':'开了之后，下面的后台保活可以不用开'}/>
      {pl&&<div className="rowbtn"><button className="chip" onClick={async()=>{const p=st.personas.find(x=>x.id===pf.last)??st.personas[0];if(!p)return;say(await pushTest(p.name,lines(p,1)[0]??'在吗',p.id)?'发出去了，几秒内会弹出来':'没发出去，过一会儿再试');}}>推一条试试</button></div>}
      {pl&&pf.audio&&<p className="hint">云端推送不需要后台保活，下面那个可以关掉：不占声音，也更省电。</p>}
      {!pl&&<div className="rowbtn"><button className="linkish" onClick={async()=>{await pushUnlink();setPl(false);}}>换一个云端地址</button></div>}
    </>:<>
      <div className="newdeck"><input value={addr} onChange={e=>setAddr(e.target.value)} placeholder="云端服务的地址，https:// 开头" inputMode="url" autoCapitalize="off" autoCorrect="off" spellCheck={false} aria-label="云端服务的地址"/>
        <button className="btn" disabled={!addr.trim()} onClick={async()=>{const e=await pushLink(addr);say(e||'连上了。把下面的开关打开就行');if(!e)setAddr('');}}>连上</button></div>
      <p className="hint">填一次就行，同步会把它带到你别的设备上。</p>
    </>}

    <h3>后台保活</h3>
    <p className="hint">没开云端推送时用：让页面在后台不被系统停掉。</p>
    <div className="line"><span>消息通知<small>他找你时弹系统通知</small></span>
      {s.notify==='granted'&&pf.notify?<Dot ok text="已开"/>:<button className="chip" onClick={async()=>{const ok=await askNotify();setS(status());say(ok?'通知开好了':s.ios&&!s.installed?'iPhone 上要先加到主屏幕，再从主屏幕打开来开通知':'浏览器没有同意，去浏览器的网站设置里允许通知');}}>开启</button>}</div>
    <Switch on={pf.audio} set={async v=>{const ok=await audioOn(v);setS(status());if(v&&!ok)say('点一下页面任意位置，它就会接上');}} label="后台保活" note="让页面在你切到别的 app、锁屏的时候不被系统停掉"/>
    {pf.audio&&<>
      <div className="chips" role="radiogroup" aria-label="保活方式">{modes.map(([id,n])=><button key={id} role="radio" aria-checked={mode===id} aria-pressed={mode===id} className="chip" onClick={async()=>{await setMode(id);setS(status());}}>{n}</button>)}</div>
      <p className="hint">{modeNote(s.ios)[mode]}</p>
    {s.pipBlocked&&<p className="hint">现在是从主屏幕打开的。iPhone 只让 Safari 和真正装进系统的 app 开画中画，添加到主屏幕的网页不行。要用画中画就在 Safari 里打开小鹿（两边的数据靠同步对齐）；在这里用静音音频或振荡器。<button className="linkish" onClick={()=>{void navigator.clipboard?.writeText(location.origin+location.pathname);say('网址复制了，去 Safari 里粘贴打开');}}>复制小鹿的网址</button></p>}
      {s.pipCan&&!s.pipBlocked?<>
      <div className="line"><span>画中画小窗<small>{s.pip?'小窗开着，可以放心切出去':'一个系统小窗，上面是他的头像和最新一句'}</small></span>
        <button className="chip" aria-pressed={s.pip} onClick={async()=>{if(s.pip){await pipLeave();}else{const e=await pipEnter();if(e)say(e);}setS(status());}}>{s.pip?'关掉小窗':'进入画中画'}</button></div>
      <div className="pipview" ref={slot} aria-hidden="true"/>
      <Switch on={!!pf.pipAuto} set={v=>{setPrefs({pipAuto:v});void apply();}} label="画中画自动开启" note="打开小鹿后的第一下点按，顺手进小窗；关掉小窗、离开再回来，下一次点按会再进"/>
    </>:!s.pipBlocked&&<p className="hint">这个浏览器不支持画中画。</p>}
    </>}
    <Switch on={!!pf.awake} set={v=>{setPrefs({awake:v});void apply().then(()=>{setS(status());if(v&&!wakeLive())say('这台设备上屏幕常亮开不了');});}} label="屏幕常亮" note="停在小鹿里的时候屏幕不自动熄灭，比较费电"/>
    <div className="rowbtn"><button className="linkish" onClick={()=>{setS(status());setCheck(v=>!v);}} aria-expanded={check}>查看后台保活是否在运行</button></div>
    {check&&<div className="checkup">
      {pf.audio?<div className="states">
        <Dot ok={s.audio||audioLive()} text="静音音频"/>
        <Dot ok={s.osc} text="振荡器"/>
        <Dot ok={s.pip} text="画中画小窗"/>
        <Dot ok={s.wake} text="屏幕常亮"/>
        <Dot ok={s.installed} text={s.installed?'已加到主屏幕':'还没加到主屏幕'}/>
      </div>:<p className="hint first">后台保活现在是关着的：没有在放声音，没有小窗，切出去之后页面会被系统停掉。{s.wake?'（屏幕常亮还开着。）':''}</p>}
      {pf.audio&&<p className="hint">{away?`上次切出去 ${span(away.away)}，其中 ${span(away.alive)} 页面还在运行（${Math.round(away.alive/away.away*100)}%）。${away.alive/away.away>.9?'保活是有效的。':away.alive/away.away>.3?'中途被系统停过，换一种保活方式试试。':'基本被系统停掉了，换一种保活方式试试。'}`:'还没有记录。切到别的 app 待上十几秒再回来，这里会告诉你那段时间页面有没有活着。'}</p>}
      {pf.audio&&<p className="hint">{s.ios?'iPhone：设置 → 通用 → 画中画，把「自动开启画中画」打开，小窗更稳。':'安卓：把浏览器加进系统的后台白名单、电池设成不限制，后台才留得住。'}</p>}
    </div>}
    {!s.installed&&<p className="hint">{s.ios?'iPhone：用 Safari 打开，点分享 → 添加到主屏幕。加了之后才能收通知。':'在浏览器菜单里选「添加到主屏幕」或「安装应用」，后台会稳很多。'}</p>}
    <div className="rowbtn">
      <button className="chip" onClick={()=>{const p=st.personas[0];if(p){notify(p,'这是一条测试通知');say(pf.notify?'发了，看看有没有弹出来':'先把上面的通知打开');}}}>发一条测试通知</button>
    </div>
    <p className="hint">页面被彻底关掉之后，他这段时间该说的话会在你下次打开时补上，时间照他本来要发的时刻算。</p>
    </>}
    {sec==='sync'&&<SyncPanel/>}
    {sec==='backup'&&<>
    <p className="hint">不用同步的话，所有东西只存在这台设备上。换手机或清浏览器之前，先导出一份备份。</p>
    {(()=>{const h=storage();return <p className="hint" data-store={h.down||h.waiting?'retry':'ok'}>本机存储：{h.down||h.waiting?`有 ${h.waiting} 项这一下没存进去，正在重试（已经另留了一份，不会丢）`:'正常'}{h.reopened?`。这次打开后重新连过 ${h.reopened} 次`:''}</p>;})()}
    <div className="rowbtn">
      <button className="chip" aria-pressed={!!bak} onClick={async()=>{
        if(bak){try{await navigator.share({files:[bak]});}catch{/* 她取消了 */}setBak(null);return;}
        const name=`备份-${new Date().toISOString().slice(0,10)}.json`,text=await exportAll(),f=new File([text],name,{type:'application/json'});
        if(shareable(f)){setBak(f);say('备份准备好了，再点一次存到「文件」');}else{download(name,text);say(isShell()?'备份准备好了，选一个地方存下来':'备份文件下载了');}
      }}>{bak?'存到「文件」':'导出备份'}</button>
      <button className="chip" onClick={()=>file.current?.click()}>导入备份</button>
      <input ref={file} type="file" accept="application/json,.json" hidden onChange={async e=>{const f=e.target.files?.[0];e.target.value='';if(!f)return;try{await importAll(await f.text());say('导入好了');}catch(x){say(x instanceof Error?x.message:'这个文件读不了');}}}/>
      <button className="chip danger" onClick={async()=>{if(!sure){setSure(true);return;}await disconnect();await wipe();setSure(false);go('#/');}}>{sure?'再点一次，清空这台设备':'清空这台设备上的数据'}</button>
    </div>
    </>}
  </main>;
}

