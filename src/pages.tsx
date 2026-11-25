import {useEffect,useRef,useState,useSyncExternalStore} from 'react';
import {Check,ChevronDown,ChevronLeft,ChevronRight,EyeOff,Menu,Plus,Search,Trash2,X} from 'lucide-react';
import {S,accents,addCards,addDeck,addPersona,box,clearMsgs,dropDeck,dropPersona,exportAll,importAll,list,putImage,readCards,setCard,setDeck,setPersona,setPrefs,shareDeck,unread,uses,useVer,whens,wipe,
  type Deck,type Persona,type Use,type When} from './db';
import {onPush,pushLink,pushLive,pushOff,pushOn,pushPrep,pushSet,pushTest,pushUnlink} from './push';
import {apply,askNotify,audioLive,audioOn,lastAway,notify,onPip,pipEnter,pipLeave,pipSlot,setMode,status,wakeLive} from './alive';
import {lines,nudge} from './engine';
import {connect,defaultRepo,disconnect,setAuto,syncNow,useSync} from './sync';
import {Avatar,Pic,backTo,dayLabel,go,nav} from './App';
import {feats} from './more';

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
export function Num({label,value,set,min=0,max=9999,unit}:{label:string;value:number;set:(n:number)=>void;min?:number;max?:number;unit:string}){
  return <label className="line"><span>{label}</span><span className="num"><input type="number" inputMode="numeric" value={value} min={min} max={max}
    onChange={e=>{const n=Number(e.target.value);if(Number.isFinite(n))set(Math.max(min,Math.min(max,n)));}}/>{unit}</span></label>;
}
const shareable=(f:File)=>{try{return /iphone|ipad|ipod/i.test(navigator.userAgent)&&!!navigator.canShare?.({files:[f]});}catch{return false;}};
const download=(name:string,text:string,type='application/json')=>{
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),2000);
};

/* ───────── 资料与节奏 ───────── */

export function PersonaSheet({p,close}:{p:Persona;close:()=>void}){
  useVer();
  const st=S();
  const pick=useRef<HTMLInputElement>(null),wall=useRef<HTMLInputElement>(null),bg=useRef<HTMLInputElement>(null);
  const preset=backs.some(x=>x[0]===(p.homeBg??''));
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
    <div className="field"><span>主页背景</span><div className="rowbtn">
      {backs.map(([id,n])=><button key={id} className="chip" aria-pressed={(p.homeBg??'')===id} onClick={()=>set({homeBg:id||undefined})}>{n}</button>)}
      <button className="chip" aria-pressed={!!p.homeBg&&!preset} onClick={()=>bg.current?.click()}>照片</button>
      <input ref={bg} type="file" accept="image/*" hidden onChange={async e=>{const f=e.target.files?.[0];if(f)set({homeBg:await putImage(f,1600)});}}/>
    </div></div>

    <h3>他回复的节奏</h3>
    <Num label="最快" value={p.min} set={n=>set({min:n,max:Math.max(n,p.max)})} min={1} max={600} unit="秒"/>
    <Num label="最慢" value={p.max} set={n=>set({max:Math.max(n,p.min)})} min={1} max={3600} unit="秒"/>
    <Num label="一次最多回" value={p.burst} set={n=>set({burst:n})} min={1} max={6} unit="条"/>
    <Num label="已读不回" value={Math.round(p.ghost*100)} set={n=>set({ghost:n/100})} min={0} max={90} unit="%"/>
    <Switch on={p.join} set={v=>set({join:v})} label="把几张字卡拼成一句" note="随机抽几张，用逗号、空格或省略号连起来"/>
    <Switch on={p.stick!==false} set={v=>set({stick:v})} label="他也会发表情包" note="从聊天里的表情包库随手挑一张"/>
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

// 今日一句：每天从他的字卡里固定抽一张，当天不变
export function todayLine(p:Persona){
  const all=S().decks.filter(d=>p.decks.includes(d.id)).flatMap(d=>d.cards.filter(c=>!c.off).map(c=>c.t));
  if(!all.length)return '';
  const key=new Date().toDateString()+p.id;let h=0;for(const ch of key)h=(h*31+ch.charCodeAt(0))>>>0;
  return all[h%all.length];
}
const backs=[['','纯色'],['dots','点阵'],['mist','雾']] as const;

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
    <div className="newdeck"><input value={name} onChange={e=>setName(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')add();}} placeholder="再添加一位，写下他的名字" aria-label="新一位的名字"/><button className="btn sm" onClick={add} disabled={!name.trim()}>添加</button></div>
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
  const favN=ms.filter(m=>m.fav).length,chatN=ms.filter(m=>m.kind!=='tip').length;
  const line=todayLine(p);
  const preset=backs.some(x=>x[0]===(p.homeBg??''));
  const others=st.personas.filter(x=>x.id!==p.id).reduce((n,x)=>n+unread(x),0);
  const dot:Record<string,boolean>={mail:b.letters.some(l=>l.from==='ta'&&!l.read)};
  return <main className={`page home${p.homeBg?' has-bg':''}${preset?' bg-'+(p.homeBg||'none'):''}`} style={{'--accent':p.accent} as React.CSSProperties}>
    {p.homeBg&&!preset&&<Pic id={p.homeBg} className="home-bg"/>}
    <header className="bar">
      {nav.from.startsWith('#/c/')&&<a className="ico back" href={nav.from} onClick={backTo(nav.from)} aria-label="回到聊天"><ChevronLeft size={28} strokeWidth={1.8}/></a>}
      <button className="namebtn" onClick={()=>setSw(true)} aria-label={`现在是 ${p.name}，点开换一位`}><b>{p.name}</b><ChevronDown size={18} strokeWidth={2}/>{others>0&&<i/>}</button>
      <button className="ico" onClick={()=>setEdit(true)} aria-label="资料与节奏"><Menu size={25} strokeWidth={1.7}/></button>
    </header>

    <section className="profile">
      <div className="face">
        {line&&<a className="note" href={`#/f/today/${p.id}`} aria-label={`今日一句：${line}`}>{line}</a>}
        <button onClick={()=>setEdit(true)} aria-label="换他的头像和资料"><Avatar id={p.avatar} name={p.name} size={86}/></button>
        <button className="mebadge" onClick={()=>mine.current?.click()} aria-label="换我的头像"><Avatar id={st.prefs.myAvatar} name={st.prefs.myName} size={32}/></button>
        <input ref={mine} type="file" accept="image/*" hidden onChange={async e=>{const f=e.target.files?.[0];if(f)setPrefs({myAvatar:await putImage(f,512)});}}/>
      </div>
      <div className="pinfo">
        <b>{st.prefs.myName} &amp; {p.name}</b>
        <dl className="stats">
          <div><dd>{days||'—'}</dd><dt>天</dt></div>
          <div><dd>{chatN}</dd><dt>消息</dt></div>
          <div><dd>{favN}</dd><dt>收藏</dt></div>
        </dl>
      </div>
    </section>
    {p.bio&&<p className="bio">{p.bio}</p>}
    <p className="bio">{p.since?`${p.since.replace(/-/g,'.')} 起`:<button className="linkish" onClick={()=>setEdit(true)}>写下在一起的日子</button>}</p>
    <div className="rowbtn two"><a className="btn ghost" href={'#/c/'+p.id}>发消息</a><button className="btn ghost" onClick={()=>setEdit(true)}>编辑主页</button></div>

    <ul className="apps" aria-label="功能">
      {feats.map(f=><li key={f.id}>{f.id==='pace'
        ?<button onClick={()=>setEdit(true)}><span><f.icon size={23} strokeWidth={1.5}/></span>{f.name}</button>
        :<a href={`#/f/${f.id}/${p.id}`}><span><f.icon size={23} strokeWidth={1.5}/>{dot[f.id]&&<i/>}</span>{f.name}</a>}</li>)}
    </ul>
    {edit&&<PersonaSheet p={p} close={()=>setEdit(false)}/>}
    {sw&&<Switcher p={p} close={()=>setSw(false)}/>}
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

export function Settings(){
  useVer();
  const st=S(),pf=st.prefs;
  const [s,setS]=useState(status());
  const file=useRef<HTMLInputElement>(null);
  const [sure,setSure]=useState(false);
  useEffect(()=>{const t=setInterval(()=>setS(status()),1500);return()=>clearInterval(t);},[]);
  const slot=useRef<HTMLDivElement>(null);
  useEffect(()=>onPip(()=>setS(status())),[]);
  useEffect(()=>{pipSlot(slot.current);return()=>pipSlot(null);},[st.prefs.audio]);
  const [bak,setBak]=useState<File|null>(null);
  const [check,setCheck]=useState(false);
  const mode=st.prefs.mode??'loop',away=lastAway();
  const [pl,setPl]=useState(pushLive());
  const [addr,setAddr]=useState('');
  useEffect(()=>{void pushPrep();return onPush(()=>setPl(pushLive()));},[]);
  return <main className="page">
    <header className="bar"><h1>设置</h1></header>

    <h3>我</h3>
    <label className="field"><span>我的名字</span><input value={pf.myName} onChange={e=>setPrefs({myName:e.target.value})}/></label>

    <h3>外观</h3>
    <div className="line"><span>明暗</span><div className="seg sm">{([['auto','跟随系统'],['light','浅色'],['dark','深色']] as const).map(([id,n])=><button key={id} aria-pressed={pf.theme===id} onClick={()=>setPrefs({theme:id})}>{n}</button>)}</div></div>
    <div className="line"><span>我的气泡</span><div className="seg sm">{([['ins','ins'],['mono','黑白'],['accent','点缀色'],['line','细边']] as const).map(([id,n])=><button key={id} aria-pressed={pf.bubble===id} onClick={()=>setPrefs({bubble:id})}>{n}</button>)}</div></div>
    <Switch on={pf.sound} set={v=>setPrefs({sound:v})} label="收到消息时响一声"/>

    <h3>云端推送</h3>
    <p className="hint">他要说的话，到点由云端推到手机。小鹿不用留在后台，也不占声音：听歌、刷视频、锁屏、把小鹿划掉，都收得到。</p>
    {pushSet()?<>
      <Switch on={pl} set={async v=>{const e=v?await pushOn():(await pushOff(),'');setPl(pushLive());setS(status());say(e||(v?'云端推送开好了':'云端推送关掉了'));}} label="云端推送" note={pl?'开着。离开小鹿时，他接下来的几句话会交给云端按时送到':'开了之后，下面的后台保活可以不用开'}/>
      {pl&&<div className="rowbtn"><button className="chip" onClick={async()=>{const p=st.personas.find(x=>x.id===pf.last)??st.personas[0];if(!p)return;say(await pushTest(p.name,lines(p,1)[0]??'在吗',p.id)?'发出去了，几秒内会弹出来':'没发出去，过一会儿再试');}}>推一条试试</button></div>}
      {pl&&pf.audio&&<p className="hint">云端推送开着，下面的后台保活可以关掉了：不占声音，也更省电。</p>}
      {!pl&&<div className="rowbtn"><button className="linkish" onClick={async()=>{await pushUnlink();setPl(false);}}>换一个云端地址</button></div>}
    </>:<>
      <div className="newdeck"><input value={addr} onChange={e=>setAddr(e.target.value)} placeholder="云端服务的地址，https:// 开头" inputMode="url" autoCapitalize="off" autoCorrect="off" spellCheck={false} aria-label="云端服务的地址"/>
        <button className="btn" disabled={!addr.trim()} onClick={async()=>{const e=await pushLink(addr);say(e||'连上了。把下面的开关打开就行');if(!e)setAddr('');}}>连上</button></div>
      <p className="hint">填一次就行，同步会把它带到你别的设备上。</p>
    </>}

    <h3>后台保活</h3>
    <p className="hint">为了让他在你没盯着页面的时候也能找到你，这里一层一层兜着。哪一层在这台设备上不亮，就靠别的层。</p>
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

    <h3>同步</h3>
    <SyncPanel/>

    <h3>备份</h3>
    <p className="hint">不用同步的话，所有东西只存在这台设备上。换手机或清浏览器之前，先导出一份备份。</p>
    <div className="rowbtn">
      <button className="chip" aria-pressed={!!bak} onClick={async()=>{
        if(bak){try{await navigator.share({files:[bak]});}catch{/* 她取消了 */}setBak(null);return;}
        const name=`备份-${new Date().toISOString().slice(0,10)}.json`,text=await exportAll(),f=new File([text],name,{type:'application/json'});
        if(shareable(f)){setBak(f);say('备份准备好了，再点一次存到「文件」');}else{download(name,text);say('备份文件下载了');}
      }}>{bak?'存到「文件」':'导出备份'}</button>
      <button className="chip" onClick={()=>file.current?.click()}>导入备份</button>
      <input ref={file} type="file" accept="application/json,.json" hidden onChange={async e=>{const f=e.target.files?.[0];e.target.value='';if(!f)return;try{await importAll(await f.text());say('导入好了');}catch(x){say(x instanceof Error?x.message:'这个文件读不了');}}}/>
      <button className="chip danger" onClick={async()=>{if(!sure){setSure(true);return;}await disconnect();await wipe();setSure(false);go('#/');}}>{sure?'再点一次，清空这台设备':'清空这台设备上的数据'}</button>
    </div>
    <p className="foot">回复是从你放进去的字卡里随机抽的。</p>
  </main>;
}

