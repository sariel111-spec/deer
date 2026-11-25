import {useEffect,useRef,useState} from 'react';
import {ChevronLeft,Heart,House,Image as ImageIcon,Info,Layers,MessageCircle,Settings2,SquarePen,X} from 'lucide-react';
import {S,addPersona,getImage,list,pushMsg,putImage,setMsg,setPrefs,unread,useVer,who,type Msg,type Persona} from './db';
import {isTyping,pool,read,sent,setActive} from './engine';
import {Cards,Settings,Home,PersonaSheet,Sheet,say,Toast} from './pages';

export const go=(h:string)=>{location.hash=h;};
const hhmm=(t:number)=>new Date(t).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',hour12:false});
export const dayLabel=(t:number)=>{
  const d=new Date(t),n=new Date();
  const days=Math.round((new Date(n.getFullYear(),n.getMonth(),n.getDate()).getTime()-new Date(d.getFullYear(),d.getMonth(),d.getDate()).getTime())/864e5);
  const day=days===0?'今天':days===1?'昨天':days<7?'周'+'日一二三四五六'[d.getDay()]:`${d.getFullYear()===n.getFullYear()?'':d.getFullYear()+'年'}${d.getMonth()+1}月${d.getDate()}日`;
  return day+' '+hhmm(t);
};
const brief=(t:number)=>{const s=(Date.now()-t)/1000;return s<60?'刚刚':s<3600?Math.floor(s/60)+' 分钟前':s<86400?Math.floor(s/3600)+' 小时前':Math.floor(s/86400)+' 天前';};

export function Pic({id,className,alt=''}:{id?:string;className?:string;alt?:string}){
  const [src,setSrc]=useState('');
  useEffect(()=>{let on=true;setSrc('');if(id)void getImage(id).then(v=>{if(on)setSrc(v);});return()=>{on=false;};},[id]);
  return src?<img className={className} src={src} alt={alt}/>:null;
}
export function Avatar({id,name,size=40}:{id?:string;name:string;size?:number}){
  return <span className="avatar" style={{width:size,height:size,fontSize:size*.42}} aria-hidden="true">
    {id?<Pic id={id}/>:<b>{[...name][0]??'·'}</b>}
  </span>;
}

export function App(){
  useVer();
  const [hash,setHash]=useState(location.hash);
  useEffect(()=>{const on=()=>setHash(location.hash);addEventListener('hashchange',on);return()=>removeEventListener('hashchange',on);},[]);
  const st=S(),theme=st.prefs.theme;
  useEffect(()=>{document.documentElement.dataset.theme=theme;document.documentElement.dataset.bubble=st.prefs.bubble;},[theme,st.prefs.bubble]);

  const [,a,b]=hash.replace(/^#\/?/,'/').split('/');
  let page:React.ReactNode;
  if(!st.personas.length)page=<Welcome/>;
  else if(a==='inbox')page=<Inbox/>;
  else if(a==='cards')page=<Cards deckId={b}/>;
  else if(a==='set')page=<Settings/>;
  else if(a==='c'){const p=who(b)??who(st.prefs.last)??st.personas[0];page=<Chat key={p.id} p={p}/>;}
  else{const p=(a==='us'?who(b):undefined)??who(st.prefs.last)??st.personas[0];page=<Home key={p.id} p={p}/>;}
  const home=a!=='inbox'&&a!=='cards'&&a!=='set'&&a!=='c';
  const tabs=st.personas.length>0&&a!=='c'&&!(a==='cards'&&b);
  const n=st.personas.reduce((x,p)=>x+unread(p),0);
  return <div className="app">
    {page}
    {tabs&&<nav className="tabs" aria-label="主导航">
      <a href="#/" aria-current={home?'page':undefined} aria-label="主页"><House size={25} strokeWidth={home?2.2:1.6}/></a>
      <a href="#/inbox" aria-current={a==='inbox'?'page':undefined} aria-label={`消息${n?`，${n} 条未读`:''}`}><MessageCircle size={25} strokeWidth={a==='inbox'?2.2:1.6}/>{n>0&&<i/>}</a>
      <a href="#/cards" aria-current={a==='cards'?'page':undefined} aria-label="字卡"><Layers size={25} strokeWidth={a==='cards'?2.2:1.6}/></a>
      <a href="#/set" aria-current={a==='set'?'page':undefined} aria-label="设置"><Settings2 size={25} strokeWidth={a==='set'?2.2:1.6}/></a>
    </nav>}
    <Toast/>
  </div>;
}

function Welcome(){
  const [name,setName]=useState('');
  const start=()=>{const n=name.trim();if(!n)return;const p=addPersona(n);go('#/us/'+p.id);};
  return <main className="welcome">
    <img src="./icon-192.png" alt="" width={84} height={84}/>
    <h1>想和谁说话</h1>
    <p>先写下他的名字。头像、字卡、回复的节奏，进去之后都可以慢慢调。</p>
    <input value={name} onChange={e=>setName(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')start();}} placeholder="他的名字" aria-label="他的名字" autoFocus/>
    <button className="btn" onClick={start} disabled={!name.trim()}>开始</button>
    <small>所有内容只存在这台设备上。回复是从你放进去的字卡里随机抽的。</small>
  </main>;
}

function Inbox(){
  const st=S();
  const [add,setAdd]=useState(false);
  const rows=[...st.personas].sort((x,y)=>(list(y.id).at(-1)?.at??y.created)-(list(x.id).at(-1)?.at??x.created));
  return <main className="page">
    <header className="bar"><h1>{st.prefs.myName}</h1><button className="ico" onClick={()=>setAdd(true)} aria-label="添加一位"><SquarePen size={23} strokeWidth={1.7}/></button></header>
    <h2 className="label">消息</h2>
    <ul className="inbox">{rows.map(p=>{
      const last=list(p.id).at(-1),n=unread(p);
      return <li key={p.id}><a href={'#/c/'+p.id} className={n?'new':''}>
        <Avatar id={p.avatar} name={p.name} size={56}/>
        <span className="who"><b>{p.name}</b>
          <span>{isTyping(p.id)?'正在输入…':last?<>{last.from==='me'?'你：':''}{last.kind==='img'?'[图片]':last.text} · {brief(last.at)}</>:'还没有说过话'}</span></span>
        {n>0&&<i aria-label={`${n} 条未读`}>{n}</i>}
      </a></li>;
    })}</ul>
    {add&&<NewPersona close={()=>setAdd(false)}/>}
  </main>;
}
function NewPersona({close}:{close:()=>void}){
  const [name,setName]=useState('');
  const ok=()=>{const n=name.trim();if(!n)return;const p=addPersona(n);close();go('#/c/'+p.id);};
  return <Sheet title="添加一位" close={close}>
    <label className="field"><span>他的名字</span><input value={name} onChange={e=>setName(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')ok();}} autoFocus/></label>
    <p className="hint">现有的字卡分组会默认都给他用，之后可以在「字卡」里改成只给某几位。</p>
    <button className="btn" onClick={ok} disabled={!name.trim()}>添加</button>
  </Sheet>;
}

/* ───────── 对话 ───────── */

function Chat({p}:{p:Persona}){
  useVer();
  const ms=list(p.id),typing=isTyping(p.id);
  const [text,setText]=useState('');
  const [re,setRe]=useState<Msg|null>(null);
  const [menu,setMenu]=useState<Msg|null>(null);
  const [edit,setEdit]=useState(false);
  const end=useRef<HTMLDivElement>(null),file=useRef<HTMLInputElement>(null),box=useRef<HTMLTextAreaElement>(null);
  useEffect(()=>{setActive(p.id);if(S().prefs.last!==p.id)setPrefs({last:p.id});return()=>setActive('');},[p.id]);
  useEffect(()=>{if(!document.hidden)read(p.id);end.current?.scrollIntoView({block:'end'});},[ms.length,typing,p.id]);
  useEffect(()=>{const el=box.current;if(el){el.style.height='auto';el.style.height=Math.min(120,el.scrollHeight)+'px';}},[text]);

  const send=()=>{
    const t=text.trim();if(!t)return;
    pushMsg({pid:p.id,from:'me',kind:'text',text:t,at:Date.now(),re:re?.id});
    setText('');setRe(null);sent(p.id);box.current?.focus();
  };
  const sendPic=async(f?:File)=>{
    if(!f)return;
    try{const id=await putImage(f);pushMsg({pid:p.id,from:'me',kind:'img',text:id,at:Date.now(),re:re?.id});setRe(null);sent(p.id);}
    catch{say('这张图片读不了，换一张试试');}
  };
  const lastTa=[...ms].reverse().find(m=>m.from==='ta');
  const status=typing?'正在输入…':lastTa&&Date.now()-lastTa.at<5*60000?'在线':lastTa?brief(lastTa.at)+'在线':p.bio||'在线';
  const last=ms.at(-1);
  const empty=pool(p,'reply').length===0;

  return <main className="chat" style={{'--accent':p.accent} as React.CSSProperties}>
    {p.wall&&<Pic id={p.wall} className="wall"/>}
    <header className="bar chat-bar">
      <a className="ico" href="#/inbox" aria-label="回到消息列表"><ChevronLeft size={28} strokeWidth={1.8}/></a>
      <a className="peer" href={'#/us/'+p.id}><Avatar id={p.avatar} name={p.name} size={34}/><span><b>{p.name}</b><small>{status}</small></span></a>
      <a className="ico" href={'#/us/'+p.id} aria-label="回到主页"><Info size={24} strokeWidth={1.7}/></a>
    </header>

    <div className="thread">
      <div className="hello">
        <Avatar id={p.avatar} name={p.name} size={84}/>
        <b>{p.name}</b>{p.bio&&<span>{p.bio}</span>}
        <button className="chip" onClick={()=>setEdit(true)}>编辑资料</button>
      </div>
      {ms.map((m,i)=>{
        const prev=ms[i-1],next=ms[i+1];
        const gap=!prev||m.at-prev.at>10*60000;
        const top=gap||prev.from!==m.from,bottom=!next||next.from!==m.from||next.at-m.at>10*60000;
        return <Bubble key={m.id} m={m} p={p} gap={gap} top={top} bottom={bottom} quoted={m.re?ms.find(x=>x.id===m.re):undefined}
          onReply={()=>{setRe(m);box.current?.focus();}} onMenu={()=>setMenu(m)}/>;
      })}
      {typing&&<div className="row ta bottom top"><Avatar id={p.avatar} name={p.name} size={28}/><div className="bubble dots" aria-label={`${p.name}正在输入`}><i/><i/><i/></div></div>}
      {last?.from==='me'&&!typing&&<p className="seen">{last.seen?`已读 ${hhmm(last.seen)}`:'已送达'}</p>}
      {empty&&<div className="nudge"><p>他还没有能用的字卡，现在说不了话。</p><a className="chip" href="#/cards">去加字卡</a></div>}
      <div ref={end}/>
    </div>

    <footer className="composer">
      {re&&<div className="replying"><span>回复 {re.from==='me'?'自己':p.name}<em>{re.kind==='img'?'[图片]':re.text}</em></span><button className="ico sm" onClick={()=>setRe(null)} aria-label="取消回复"><X size={18}/></button></div>}
      <div className="pill">
        <button className="cam" onClick={()=>file.current?.click()} aria-label="发一张图片"><ImageIcon size={19} strokeWidth={2}/></button>
        <input ref={file} type="file" accept="image/*" hidden onChange={e=>{void sendPic(e.target.files?.[0]);e.target.value='';}}/>
        <textarea ref={box} rows={1} value={text} onChange={e=>setText(e.target.value)} placeholder="发消息…" aria-label={`给${p.name}发消息`}
          onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing&&matchMedia('(hover:hover)').matches){e.preventDefault();send();}}}/>
        {text.trim()?<button className="send" onClick={send}>发送</button>
          :<button className="ico sm" onClick={()=>{pushMsg({pid:p.id,from:'me',kind:'text',text:'❤️',at:Date.now()});sent(p.id);}} aria-label="发一颗心"><Heart size={24} strokeWidth={1.7}/></button>}
      </div>
    </footer>

    {menu&&<Sheet title="" close={()=>setMenu(null)} plain>
      <div className="actions">
        <button onClick={()=>{setRe(menu);setMenu(null);box.current?.focus();}}>回复</button>
        <button onClick={()=>{setMsg(p.id,menu.id,{like:!menu.like});setMenu(null);}}>{menu.like?'取消喜欢':'喜欢'}</button>
        <button onClick={()=>{setMsg(p.id,menu.id,{fav:!menu.fav});say(menu.fav?'已从收藏里拿掉':'收藏了，在主页能看到');setMenu(null);}}>{menu.fav?'取消收藏':'收藏'}</button>
        {menu.kind==='text'&&<button onClick={()=>{void navigator.clipboard?.writeText(menu.text);say('复制了');setMenu(null);}}>复制</button>}
        <button className="danger" onClick={()=>{setMsg(p.id,menu.id,null);setMenu(null);}}>{menu.from==='me'?'撤回':'删除'}</button>
      </div>
    </Sheet>}
    {edit&&<PersonaSheet p={p} close={()=>setEdit(false)}/>}
  </main>;
}

function Bubble({m,p,gap,top,bottom,quoted,onReply,onMenu}:{m:Msg;p:Persona;gap:boolean;top:boolean;bottom:boolean;quoted?:Msg;onReply:()=>void;onMenu:()=>void}){
  const [dx,setDx]=useState(0);
  const g=useRef({x:0,y:0,on:false,held:0,moved:false});
  const mine=m.from==='me';
  const down=(e:React.PointerEvent)=>{
    if(e.button!==0)return;
    g.current={x:e.clientX,y:e.clientY,on:true,moved:false,held:window.setTimeout(()=>{if(!g.current.moved){g.current.on=false;try{navigator.vibrate?.(8);}catch{/* */}onMenu();}},460)};
  };
  const move=(e:React.PointerEvent)=>{
    const s=g.current;if(!s.on)return;
    const x=e.clientX-s.x,y=e.clientY-s.y;
    if(Math.abs(x)>8||Math.abs(y)>8){s.moved=true;clearTimeout(s.held);}
    // 往对面拖一小段就是回复
    if(e.pointerType!=='mouse'&&Math.abs(x)>Math.abs(y))setDx(Math.max(-72,Math.min(72,mine?Math.min(0,x):Math.max(0,x))));
  };
  const up=()=>{const s=g.current;clearTimeout(s.held);if(s.on&&Math.abs(dx)>52)onReply();s.on=false;setDx(0);};
  return <>
    {gap&&<time className="stamp">{dayLabel(m.at)}</time>}
    <div className={`row ${m.from}${top?' top':''}${bottom?' bottom':''}`}>
      {!mine&&(bottom?<Avatar id={p.avatar} name={p.name} size={28}/>:<span className="gutter"/>)}
      <div className="stack" style={dx?{transform:`translateX(${dx}px)`,transition:'none'}:undefined}>
        {quoted&&<div className="quote">{quoted.kind==='img'?'[图片]':quoted.text}</div>}
        <div className={`bubble${m.kind==='img'?' pic':''}`} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
          onDoubleClick={()=>setMsg(p.id,m.id,{like:!m.like})} onContextMenu={e=>{e.preventDefault();clearTimeout(g.current.held);g.current.on=false;onMenu();}}>
          {m.kind==='img'?<Pic id={m.text} alt="图片"/>:m.text}
          {m.like&&<i className="liked" aria-label="喜欢了"><Heart size={11} fill="currentColor" strokeWidth={0}/></i>}
        </div>
      </div>
    </div>
  </>;
}

