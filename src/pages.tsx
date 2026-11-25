import {useEffect,useRef,useState,useSyncExternalStore} from 'react';
import {Bookmark,ChevronLeft,ChevronRight,Clock,EyeOff,Grid3x3,Heart,Image as ImageIcon,Layers,MessageCircle,Plus,Search,Trash2,X} from 'lucide-react';
import {S,accents,addCards,addDeck,clearMsgs,dropDeck,dropPersona,exportAll,importAll,list,putImage,readCards,setCard,setDeck,setPersona,setPrefs,shareDeck,uses,useVer,whens,wipe,
  type Deck,type Persona,type Use,type When} from './db';
import {askNotify,audioLive,audioOn,notify,status} from './alive';
import {nudge} from './engine';
import {Avatar,Pic,dayLabel,go} from './App';

/* ───────── 小零件 ───────── */

let toast='',toastT=0;const tsubs=new Set<()=>void>();
export function say(t:string){toast=t;tsubs.forEach(f=>f());clearTimeout(toastT);toastT=window.setTimeout(()=>{toast='';tsubs.forEach(f=>f());},2400);}
export function Toast(){
  const t=useSyncExternalStore(f=>{tsubs.add(f);return()=>{tsubs.delete(f);};},()=>toast);
  return t?<div className="toast" role="status">{t}</div>:null;
}
export function Sheet({title,close,plain,children}:{title:string;close:()=>void;plain?:boolean;children:React.ReactNode}){
  useEffect(()=>{const on=(e:KeyboardEvent)=>{if(e.key==='Escape')close();};addEventListener('keydown',on);return()=>removeEventListener('keydown',on);},[close]);
  return <div className="veil" onPointerDown={e=>{if(e.target===e.currentTarget)close();}}>
    <section className={`sheet${plain?' plain':''}`} role="dialog" aria-modal="true" aria-label={title||'操作'}>
      <i className="grab" aria-hidden="true"/>
      {title&&<header><h2>{title}</h2><button className="ico sm" onClick={close} aria-label="关上"><X size={20}/></button></header>}
      {children}
    </section>
  </div>;
}
function Switch({on,set,label,note}:{on:boolean;set:(v:boolean)=>void;label:string;note?:string}){
  return <label className="line"><span>{label}{note&&<small>{note}</small>}</span><input type="checkbox" className="switch" checked={on} onChange={e=>set(e.target.checked)}/></label>;
}
function Num({label,value,set,min=0,max=9999,unit}:{label:string;value:number;set:(n:number)=>void;min?:number;max?:number;unit:string}){
  return <label className="line"><span>{label}</span><span className="num"><input type="number" inputMode="numeric" value={value} min={min} max={max}
    onChange={e=>{const n=Number(e.target.value);if(Number.isFinite(n))set(Math.max(min,Math.min(max,n)));}}/>{unit}</span></label>;
}
const download=(name:string,text:string,type='application/json')=>{
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),2000);
};

/* ───────── 资料与节奏 ───────── */

export function PersonaSheet({p,close}:{p:Persona;close:()=>void}){
  useVer();
  const st=S();
  const pick=useRef<HTMLInputElement>(null),wall=useRef<HTMLInputElement>(null);
  const [sure,setSure]=useState(false);
  const set=(patch:Partial<Persona>)=>setPersona(p.id,patch);
  const hours=Array.from({length:24},(_,h)=>h);
  return <Sheet title="资料与节奏" close={close}>
    <div className="me-row">
      <button className="pick" onClick={()=>pick.current?.click()} aria-label="换他的头像"><Avatar id={p.avatar} name={p.name} size={76}/><span>换头像</span></button>
      <input ref={pick} type="file" accept="image/*" hidden onChange={async e=>{const f=e.target.files?.[0];if(f)set({avatar:await putImage(f,512)});}}/>
    </div>
    <label className="field"><span>名字</span><input value={p.name} onChange={e=>set({name:e.target.value})}/></label>
    <label className="field"><span>签名</span><input value={p.bio} onChange={e=>set({bio:e.target.value})} placeholder="显示在名字下面的一句话"/></label>
    <label className="field"><span>在一起的日子</span><input type="date" value={p.since} onChange={e=>set({since:e.target.value})}/></label>
    <div className="field"><span>点缀色</span><div className="swatches">{accents.map(c=><button key={c} style={{background:c}} aria-label={'颜色 '+c} aria-pressed={p.accent===c} onClick={()=>set({accent:c})}/>)}</div></div>
    <div className="field"><span>聊天背景</span><div className="rowbtn">
      <button className="chip" onClick={()=>wall.current?.click()}>{p.wall?'换一张':'放一张照片'}</button>
      {p.wall&&<button className="chip" onClick={()=>set({wall:undefined})}>不要背景</button>}
      <input ref={wall} type="file" accept="image/*" hidden onChange={async e=>{const f=e.target.files?.[0];if(f)set({wall:await putImage(f,1600)});}}/>
    </div></div>

    <h3>他回复的节奏</h3>
    <Num label="最快" value={p.min} set={n=>set({min:n,max:Math.max(n,p.max)})} min={1} max={600} unit="秒"/>
    <Num label="最慢" value={p.max} set={n=>set({max:Math.max(n,p.min)})} min={1} max={3600} unit="秒"/>
    <Num label="一次最多回" value={p.burst} set={n=>set({burst:n})} min={1} max={6} unit="条"/>
    <Num label="已读不回" value={Math.round(p.ghost*100)} set={n=>set({ghost:n/100})} min={0} max={90} unit="%"/>
    <Switch on={p.join} set={v=>set({join:v})} label="把几张字卡拼成一句" note="随机抽几张，用逗号、空格或省略号连起来"/>
    {p.join&&<Num label="最多拼" value={p.joinMax} set={n=>set({joinMax:n})} min={2} max={5} unit="张"/>}

    <h3>他主动找你</h3>
    <Switch on={p.pro} set={v=>set({pro:v,nextAt:0})} label="会主动发消息"/>
    {p.pro&&<>
      <Num label="最短隔" value={p.proMin} set={n=>set({proMin:n,proMax:Math.max(n,p.proMax),nextAt:0})} min={1} max={1440} unit="分钟"/>
      <Num label="最长隔" value={p.proMax} set={n=>set({proMax:Math.max(n,p.proMin),nextAt:0})} min={1} max={2880} unit="分钟"/>
      <div className="line"><span>他睡觉的时间<small>这段时间不会主动找你</small></span><span className="num">
        <select value={p.quietFrom} onChange={e=>set({quietFrom:+e.target.value,nextAt:0})} aria-label="几点睡">{hours.map(h=><option key={h} value={h}>{h}:00</option>)}</select>到
        <select value={p.quietTo} onChange={e=>set({quietTo:+e.target.value,nextAt:0})} aria-label="几点醒">{hours.map(h=><option key={h} value={h}>{h}:00</option>)}</select></span></div>
      <button className="chip" onClick={()=>{if(!nudge(p.id))say('他还没有能用的字卡');}}>现在让他说一句试试</button>
    </>}

    <h3>他用哪些字卡</h3>
    {st.decks.length?<div className="chips">{st.decks.map(d=><button key={d.id} className="chip" aria-pressed={p.decks.includes(d.id)} onClick={()=>shareDeck(d.id,p.id,!p.decks.includes(d.id))}>{d.name}<small>{d.cards.length}</small></button>)}</div>
      :<p className="hint">还没有字卡分组。<a href="#/cards" onClick={close}>去加一个</a></p>}

    <h3>别的</h3>
    <div className="rowbtn">
      <button className="chip" onClick={()=>{clearMsgs(p.id);say('聊天记录清空了');}}>清空聊天记录</button>
      <button className="chip danger" onClick={()=>{if(!sure){setSure(true);return;}dropPersona(p.id);close();go('#/inbox');}}>{sure?'再点一次，连记录一起删掉':'删掉这一位'}</button>
    </div>
  </Sheet>;
}

/* ───────── 主页 ───────── */

const sleeping=(p:Persona)=>{const h=new Date().getHours();return p.quietFrom===p.quietTo?false:p.quietFrom<p.quietTo?h>=p.quietFrom&&h<p.quietTo:h>=p.quietFrom||h<p.quietTo;};
// 今日一句：每天从他的字卡里固定抽一张，当天不变
function todayLine(p:Persona){
  const all=S().decks.filter(d=>p.decks.includes(d.id)).flatMap(d=>d.cards.filter(c=>!c.off).map(c=>c.t));
  if(!all.length)return '';
  const key=new Date().toDateString()+p.id;let h=0;for(const ch of key)h=(h*31+ch.charCodeAt(0))>>>0;
  return all[h%all.length];
}
const backs=[['','纯色'],['dots','点阵'],['mist','雾']] as const;

export function Home({p}:{p:Persona}){
  useVer();
  const st=S(),ms=list(p.id);
  const [tab,setTab]=useState<'fav'|'pic'>('fav');
  const [edit,setEdit]=useState(false);
  const [now,setNow]=useState(new Date());
  const mine=useRef<HTMLInputElement>(null),photo=useRef<HTMLInputElement>(null),bg=useRef<HTMLInputElement>(null);
  useEffect(()=>{const t=setInterval(()=>setNow(new Date()),20000);return()=>clearInterval(t);},[]);
  useEffect(()=>{if(st.prefs.last!==p.id)setPrefs({last:p.id});},[p.id]);
  const days=p.since?Math.max(1,Math.floor((Date.now()-new Date(p.since+'T00:00:00').getTime())/864e5)+1):0;
  const favs=ms.filter(m=>m.fav).reverse(),pics=ms.filter(m=>m.kind==='img').reverse();
  const tail=ms.slice(-2),line=todayLine(p),asleep=sleeping(p);
  const lastTa=[...ms].reverse().find(m=>m.from==='ta');
  const shot=p.photo??pics[0]?.text;
  const preset=backs.some(b=>b[0]===(p.homeBg??''));
  const top=useRef<HTMLDivElement>(null);
  const jump=(t:'fav'|'pic')=>{setTab(t);setTimeout(()=>top.current?.scrollIntoView({behavior:'smooth',block:'start'}),30);};
  return <main className={`page home${p.homeBg?' has-bg':''}${preset?' bg-'+(p.homeBg||'none'):''}`} style={{'--accent':p.accent} as React.CSSProperties}>
    {p.homeBg&&!preset&&<Pic id={p.homeBg} className="home-bg"/>}
    <header className="bar">
      <h1>{p.name}</h1>
      <span className="clock">{now.toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',hour12:false})}<small>{now.getMonth()+1}月{now.getDate()}日 周{'日一二三四五六'[now.getDay()]}</small></span>
    </header>

    <ul className="stories" aria-label="换一位">
      {st.personas.map(x=>{const n=list(x.id).filter(m=>m.from==='ta'&&m.at>x.readAt).length;
        return <li key={x.id}><a href={'#/us/'+x.id} className={`${n?'ring':''}${x.id===p.id?' on':''}`} aria-current={x.id===p.id?'true':undefined}><Avatar id={x.avatar} name={x.name} size={60}/><span>{x.name}</span></a></li>;})}
      <li><a href="#/inbox" className="add"><span className="avatar" style={{width:60,height:60}}><Plus size={24} strokeWidth={1.5}/></span><span>添加</span></a></li>
    </ul>

    <section className="profile">
      <div className="duo">
        <button className="pick" onClick={()=>mine.current?.click()} aria-label="换我的头像"><Avatar id={st.prefs.myAvatar} name={st.prefs.myName} size={72}/></button>
        <input ref={mine} type="file" accept="image/*" hidden onChange={async e=>{const f=e.target.files?.[0];if(f)setPrefs({myAvatar:await putImage(f,512)});}}/>
        <Heart className="duo-heart" size={14} fill="currentColor" strokeWidth={0}/>
        <button className="pick" onClick={()=>setEdit(true)} aria-label="换他的头像和资料"><Avatar id={p.avatar} name={p.name} size={72}/></button>
      </div>
      <dl className="stats">
        <div><dd>{days||'—'}</dd><dt>天</dt></div>
        <div><dd>{ms.length}</dd><dt>消息</dt></div>
        <div><dd>{favs.length}</dd><dt>收藏</dt></div>
      </dl>
    </section>
    <p className="names"><b>{st.prefs.myName}</b> &amp; <b>{p.name}</b></p>
    {p.bio&&<p className="bio">{p.bio}</p>}
    <p className="bio">{p.since?`${p.since.replace(/-/g,'.')} 起`:<button className="linkish" onClick={()=>setEdit(true)}>写下在一起的日子</button>}</p>
    <div className="rowbtn two"><a className="btn ghost" href={'#/c/'+p.id}>发消息</a><button className="btn ghost" onClick={()=>setEdit(true)}>编辑主页</button></div>

    <ul className="lights" aria-label="快捷入口">
      <li><a href={'#/c/'+p.id}><span><MessageCircle size={24} strokeWidth={1.5}/></span>聊天</a></li>
      <li><button onClick={()=>jump('fav')}><span><Bookmark size={24} strokeWidth={1.5}/></span>收藏</button></li>
      <li><button onClick={()=>jump('pic')}><span><ImageIcon size={24} strokeWidth={1.5}/></span>图片</button></li>
      <li><a href="#/cards"><span><Layers size={24} strokeWidth={1.5}/></span>字卡</a></li>
      <li><button onClick={()=>setEdit(true)}><span><Clock size={24} strokeWidth={1.5}/></span>节奏</button></li>
    </ul>

    <section className="widgets">
      <a className="w wide chatw" href={'#/c/'+p.id}>
        <small>messages</small>
        {tail.length?tail.map(m=><span key={m.id} className={`mini ${m.from}`}>{m.kind==='img'?'[图片]':m.text}</span>):<span className="w-empty">还没有说过话，去打个招呼</span>}
      </a>
      <div className="w quote"><small>today</small><p>{line||'加了字卡之后，这里每天会有他的一句话'}</p></div>
      <div className="w big"><small>together</small><b>{days||'—'}</b><span>{days?'天':'还没写日子'}</span></div>
      <button className="w photo" onClick={()=>photo.current?.click()} aria-label="换主页上的照片">
        {shot?<span className="polaroid"><Pic id={shot}/></span>:<span className="w-empty"><ImageIcon size={22} strokeWidth={1.4}/>放一张照片</span>}
      </button>
      <input ref={photo} type="file" accept="image/*" hidden onChange={async e=>{const f=e.target.files?.[0];if(f)setPersona(p.id,{photo:await putImage(f,900)});}}/>
      <div className="w state2"><small>right now</small><b>{asleep?'他睡了':'他醒着'}</b><span>{lastTa?`上次找你 ${dayLabel(lastTa.at)}`:'还没找过你'}</span></div>
    </section>

    <div className="bgrow"><small>主页背景</small>
      {backs.map(([id,n])=><button key={id} className="chip" aria-pressed={(p.homeBg??'')===id} onClick={()=>setPersona(p.id,{homeBg:id||undefined})}>{n}</button>)}
      <button className="chip" aria-pressed={!!p.homeBg&&!preset} onClick={()=>bg.current?.click()}>照片</button>
      <input ref={bg} type="file" accept="image/*" hidden onChange={async e=>{const f=e.target.files?.[0];if(f)setPersona(p.id,{homeBg:await putImage(f,1600)});}}/>
    </div>

    <div ref={top} className="seg" role="tablist"><button role="tab" aria-selected={tab==='fav'} onClick={()=>setTab('fav')} aria-label="收藏"><Bookmark size={22} strokeWidth={1.6}/></button><button role="tab" aria-selected={tab==='pic'} onClick={()=>setTab('pic')} aria-label="图片"><Grid3x3 size={22} strokeWidth={1.6}/></button></div>
    {tab==='fav'&&(favs.length?<ul className="favs">{favs.map(m=><li key={m.id}><p>{m.kind==='img'?<Pic id={m.text}/>:m.text}</p><small>{m.from==='me'?st.prefs.myName:p.name} · {dayLabel(m.at)}</small></li>)}</ul>
      :<p className="empty">长按一条消息，选「收藏」，它就会留在这里。</p>)}
    {tab==='pic'&&(pics.length?<div className="grid">{pics.map(m=><Pic key={m.id} id={m.text}/>)}</div>:<p className="empty">聊天里发过的图片会排在这里。</p>)}
    {edit&&<PersonaSheet p={p} close={()=>setEdit(false)}/>}
  </main>;
}

/* ───────── 字卡 ───────── */

export function Cards({deckId}:{deckId?:string}){
  useVer();
  const st=S();
  const d=st.decks.find(x=>x.id===deckId);
  const file=useRef<HTMLInputElement>(null);
  const [name,setName]=useState('');
  if(d)return <DeckPage d={d}/>;
  const make=()=>{const n=name.trim();if(!n)return;const x=addDeck(n);setName('');go('#/cards/'+x.id);};
  const load=async(f?:File)=>{
    if(!f)return;
    const groups=readCards(await f.text());
    if(!groups.length){say('这个文件里没读到字卡');return;}
    let n=0;for(const g of groups){const x=addDeck(groups.length===1&&g.name==='导入的分组'?f.name.replace(/\.[^.]+$/,''):g.name);n+=addCards(x.id,g.lines.join('\n')).added;}
    say(`导入了 ${groups.length} 个分组，共 ${n} 张`);
  };
  return <main className="page">
    <header className="bar"><h1>字卡</h1><button className="ico" onClick={()=>file.current?.click()} aria-label="从文件导入字卡"><Plus size={26} strokeWidth={1.7}/></button>
      <input ref={file} type="file" accept=".txt,.json,text/plain,application/json" hidden onChange={e=>{void load(e.target.files?.[0]);e.target.value='';}}/></header>
    <p className="lede">他说的每一句话，都是从这里随机抽出来的。一个分组可以只给一位用，也可以几位公用。</p>
    <div className="newdeck"><input value={name} onChange={e=>setName(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')make();}} placeholder="新分组的名字，比如 日常" aria-label="新分组的名字"/><button className="btn sm" onClick={make} disabled={!name.trim()}>新建</button></div>
    {st.decks.length?<ul className="decks">{st.decks.map(x=>{
      const users=st.personas.filter(p=>p.decks.includes(x.id));
      return <li key={x.id}><a href={'#/cards/'+x.id}>
        <span className="who"><b>{x.name}</b><span>{x.cards.length} 张{x.when!=='all'&&<> · {whens.find(w=>w.id===x.when)?.name}</>}{x.use!=='both'&&<> · {x.use==='pro'?'只用于主动':'只用于回复'}</>}</span></span>
        <span className="users">{users.length?users.slice(0,4).map(p=><Avatar key={p.id} id={p.avatar} name={p.name} size={24}/>):<small>没人在用</small>}{users.length>1&&<em>公用</em>}</span>
        <ChevronRight size={18} strokeWidth={1.6}/>
      </a></li>;
    })}</ul>:<p className="empty">还没有分组。新建一个，或者点右上角从文件导入（一行一句的文本，或别的传讯网站导出的文件）。</p>}
  </main>;
}
function DeckPage({d}:{d:Deck}){
  const st=S();
  const [text,setText]=useState('');
  const [q,setQ]=useState('');
  const [sure,setSure]=useState(false);
  const add=()=>{const r=addCards(d.id,text);setText('');say(r.added?`加了 ${r.added} 张${r.dup?`，${r.dup} 张重复的没加`:''}`:r.dup?'这些都已经有了':'先写点什么');};
  const shown=q.trim()?d.cards.filter(c=>c.t.includes(q.trim())):d.cards;
  return <main className="page deck">
    <header className="bar"><a className="ico" href="#/cards" aria-label="回到字卡"><ChevronLeft size={28} strokeWidth={1.8}/></a><input className="title-in" value={d.name} onChange={e=>setDeck(d.id,{name:e.target.value})} aria-label="分组名字"/>
      <button className="ico" onClick={()=>download(d.name+'.txt',d.cards.map(c=>c.t).join('\n'),'text/plain')} aria-label="导出这个分组">导出</button></header>

    <h3>谁在用</h3>
    <div className="chips">{st.personas.map(p=><button key={p.id} className="chip who-chip" aria-pressed={p.decks.includes(d.id)} onClick={()=>shareDeck(d.id,p.id,!p.decks.includes(d.id))}><Avatar id={p.avatar} name={p.name} size={22}/>{p.name}</button>)}</div>
    <p className="hint">点亮几位，这个分组就由他们公用；改字卡时所有人一起变。</p>

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
      <button className="ico sm" onClick={()=>setCard(d.id,c.id,null)} aria-label="删掉这张"><Trash2 size={17} strokeWidth={1.7}/></button>
    </li>)}</ul>
    {!shown.length&&<p className="empty">{d.cards.length?'没有搜到。':'这个分组还是空的。'}</p>}
    <button className="chip danger" onClick={()=>{if(!sure){setSure(true);return;}dropDeck(d.id);go('#/cards');}}>{sure?'再点一次就删掉整个分组':'删掉这个分组'}</button>
  </main>;
}

/* ───────── 设置 ───────── */

export function Settings(){
  useVer();
  const st=S(),pf=st.prefs;
  const [s,setS]=useState(status());
  const file=useRef<HTMLInputElement>(null);
  const [sure,setSure]=useState(false);
  useEffect(()=>{const t=setInterval(()=>setS(status()),1500);return()=>clearInterval(t);},[]);
  const Dot=({ok,text}:{ok:boolean;text:string})=><span className={`state${ok?' ok':''}`}><i/>{text}</span>;
  return <main className="page">
    <header className="bar"><h1>设置</h1></header>

    <h3>我</h3>
    <label className="field"><span>我的名字</span><input value={pf.myName} onChange={e=>setPrefs({myName:e.target.value})}/></label>

    <h3>外观</h3>
    <div className="line"><span>明暗</span><div className="seg sm">{([['auto','跟随系统'],['light','浅色'],['dark','深色']] as const).map(([id,n])=><button key={id} aria-pressed={pf.theme===id} onClick={()=>setPrefs({theme:id})}>{n}</button>)}</div></div>
    <div className="line"><span>我的气泡</span><div className="seg sm">{([['ins','ins'],['mono','黑白'],['accent','点缀色'],['line','细边']] as const).map(([id,n])=><button key={id} aria-pressed={pf.bubble===id} onClick={()=>setPrefs({bubble:id})}>{n}</button>)}</div></div>
    <Switch on={pf.sound} set={v=>setPrefs({sound:v})} label="收到消息时响一声"/>

    <h3>后台保活</h3>
    <p className="hint">为了让他在你没盯着页面的时候也能找到你，这里一层一层兜着。哪一层在这台设备上不亮，就靠别的层。</p>
    <div className="line"><span>消息通知<small>他找你时弹系统通知</small></span>
      {s.notify==='granted'&&pf.notify?<Dot ok text="已开"/>:<button className="chip" onClick={async()=>{const ok=await askNotify();setS(status());say(ok?'通知开好了':s.ios&&!s.installed?'iPhone 上要先加到主屏幕，再从主屏幕打开来开通知':'浏览器没有同意，去浏览器的网站设置里允许通知');}}>开启</button>}</div>
    <Switch on={pf.audio} set={async v=>{const ok=await audioOn(v);setS(status());if(v&&!ok)say('点一下页面任意位置，它就会接上');}} label="后台保持运行" note="放一段听不见的声音，让系统别把页面停掉；锁屏上会显示一个播放条"/>
    <div className="states">
      <Dot ok={s.installed} text={s.installed?'已加到主屏幕':'还没加到主屏幕'}/>
      <Dot ok={s.sw} text="后台线程"/>
      <Dot ok={s.audio||audioLive()} text="保持运行"/>
      <Dot ok={s.lock} text="防冻结锁"/>
      <Dot ok={s.periodic} text="定时唤醒"/>
      <Dot ok={s.persisted} text="数据不被清理"/>
    </div>
    {!s.installed&&<p className="hint">{s.ios?'iPhone：用 Safari 打开，点分享 → 添加到主屏幕。加了之后才能收通知。':'在浏览器菜单里选「添加到主屏幕」或「安装应用」，后台会稳很多。'}</p>}
    <div className="rowbtn">
      <button className="chip" onClick={()=>{const p=st.personas[0];if(p){notify(p,'这是一条测试通知');say(pf.notify?'发了，看看有没有弹出来':'先把上面的通知打开');}}}>发一条测试通知</button>
    </div>
    <p className="hint">页面被彻底关掉之后，他这段时间该说的话会在你下次打开时补上，时间照他本来要发的时刻算。</p>

    <h3>数据</h3>
    <p className="hint">所有东西只存在这台设备上。换手机或清浏览器之前，先导出一份备份。</p>
    <div className="rowbtn">
      <button className="chip" onClick={async()=>{download(`备份-${new Date().toISOString().slice(0,10)}.json`,await exportAll());say('备份文件下载了');}}>导出备份</button>
      <button className="chip" onClick={()=>file.current?.click()}>导入备份</button>
      <input ref={file} type="file" accept="application/json,.json" hidden onChange={async e=>{const f=e.target.files?.[0];e.target.value='';if(!f)return;try{await importAll(await f.text());say('导入好了');}catch(x){say(x instanceof Error?x.message:'这个文件读不了');}}}/>
      <button className="chip danger" onClick={async()=>{if(!sure){setSure(true);return;}await wipe();setSure(false);go('#/');}}>{sure?'再点一次，全部清空':'清空所有数据'}</button>
    </div>
    <p className="foot">回复是从你放进去的字卡里随机抽的。</p>
  </main>;
}

