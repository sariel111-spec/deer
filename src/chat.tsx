import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {Bookmark,Camera,ChevronDown,ChevronLeft,Copy,Dices,EyeOff,Hand,Heart,Image as ImageIcon,Info,Mail,MapPin,Plus,RefreshCw,Reply,Search,Smile,Trash2,Undo2,Video,X} from 'lucide-react';
import {S,addPack,dropPack,list,packsFor,pushMsg,putImage,setCard,setMsg,setPack,setPrefs,useVer,type Msg,type Pack,type Persona} from './db';
import {hisCheck,isTyping,onCall,pool,read,redraw,sent,setActive} from './engine';
import {Tell} from './check';
import {callOpen} from './call';
import {PersonaSheet,Sheet,say} from './pages';
import {Avatar,Pic,dayLabel} from './App';

const hhmm=(t:number)=>new Date(t).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',hour12:false});
const brief=(t:number)=>{const s=(Date.now()-t)/1000;return s<60?'刚刚':s<3600?Math.floor(s/60)+' 分钟前':s<86400?Math.floor(s/3600)+' 小时前':Math.floor(s/86400)+' 天前';};
export const peek=(m:Msg)=>m.kind==='img'?(m.st?'[表情]':'[图片]'):m.text;
const quick=['❤️','😂','😮','😢','😡','👍'];
const emojis=['❤️','🥺','😘','😊','😂','🥰','😭','😴','🤍','🫶','👀','😡','🙈','✨','🌙','☀️','🍚','🧋','🐻','🦌','🌸','☔','🎧','💤'];
const PAGE=120;
const draftKey=(pid:string)=>'cx-draft-'+pid;

// ins 气泡的颜色：整屏一条上紫下蓝的渐变，每个气泡按它此刻在屏幕上的高低取其中一段
const STOPS:[number,number,number,number][]=[[0,0xB3,0x2B,0xF7],[.42,0x7B,0x45,0xF6],[1,0x3A,0x82,0xF7]];
const tint=(t:number)=>{
  t=Math.max(0,Math.min(1,t));
  const i=t<=STOPS[1][0]?0:1,a=STOPS[i],b=STOPS[i+1],k=(t-a[0])/(b[0]-a[0]);
  return `rgb(${Math.round(a[1]+(b[1]-a[1])*k)},${Math.round(a[2]+(b[2]-a[2])*k)},${Math.round(a[3]+(b[3]-a[3])*k)})`;
};
function paint(host:HTMLElement|null){
  if(!host||document.documentElement.dataset.bubble!=='ins')return;
  const r=host.getBoundingClientRect();if(!r.height)return;
  for(const el of host.querySelectorAll<HTMLElement>('.row.me .bubble:not(.pic)')){
    const b=el.getBoundingClientRect();
    if(b.bottom<r.top-240||b.top>r.bottom+240)continue;
    el.style.setProperty('--b1',tint((b.top-r.top)/r.height));el.style.setProperty('--b2',tint((b.bottom-r.top)/r.height));
  }
}

export function Chat({p}:{p:Persona}){
  useVer();
  const st=S(),all=list(p.id),typing=isTyping(p.id);
  const [limit,setLimit]=useState(PAGE);
  const ms=all.slice(-limit);
  const [text,setText]=useState(()=>{try{return localStorage.getItem(draftKey(p.id))??'';}catch{return '';}});
  const [re,setRe]=useState<Msg|null>(null);
  const [menu,setMenu]=useState<Msg|null>(null);
  const [edit,setEdit]=useState(false),[more,setMore]=useState(false),[ck,setCk]=useState(false);
  const [panel,setPanel]=useState(''),[manage,setManage]=useState('');   // panel：''关着、'emo' 或某个表情包分组的 id
  const [q,setQ]=useState<string|null>(null);
  const [view,setView]=useState('');
  const [away,setAway]=useState(0),[up,setUp]=useState(false),[flash,setFlash]=useState('');
  const sc=useRef<HTMLDivElement>(null),end=useRef<HTMLDivElement>(null),file=useRef<HTMLInputElement>(null),box=useRef<HTMLTextAreaElement>(null);
  // near：贴着底（跟着最新一条走）。只有你自己往上翻才会松开；图片载出来把内容撑高不算
  const near=useRef(true),keep=useRef(0),count=useRef(all.length),inner=useRef<HTMLDivElement>(null),lastTop=useRef(0);
  const toEnd=()=>{const el=sc.current;if(el){el.scrollTop=el.scrollHeight;lastTop.current=el.scrollTop;}};
  const packs=packsFor(p.id),shown=packs.find(k=>k.id===panel);

  useEffect(()=>{setActive(p.id);if(S().prefs.last!==p.id)setPrefs({last:p.id});return()=>setActive('');},[p.id]);
  // 新消息：人在底部（或是自己发的）就跟到底；在翻旧记录就不打扰，只在角上记个数
  useEffect(()=>{
    if(!document.hidden)read(p.id);
    const fresh=all.length-count.current,last=all.at(-1);count.current=all.length;
    if(near.current||(fresh>0&&last?.from==='me')){near.current=true;toEnd();}
    else if(fresh>0&&last?.from==='ta')setAway(n=>n+fresh);
  },[all.length,typing,p.id]);
  // 一进来就在最新一条。之后头像、图片、表情包陆续载出来会把内容撑高，下面的观察器会一直把它按在底部
  useLayoutEffect(()=>{near.current=true;toEnd();},[p.id]);
  useEffect(()=>{
    // 刚打开的头两秒多按几次：有的手机第一帧量出来的高度还不准
    const ts=[60,200,500,1000,2000].map(ms=>setTimeout(()=>{if(near.current&&!keep.current)toEnd();},ms));
    return()=>ts.forEach(clearTimeout);
  },[p.id]);
  const raf=useRef(0);
  const repaint=()=>{cancelAnimationFrame(raf.current);raf.current=requestAnimationFrame(()=>paint(sc.current));};
  useLayoutEffect(()=>{paint(sc.current);repaint();});
  // 图片载出来、表情面板打开，内容会变高或窗口变矮：原本贴着底的话继续贴着
  useEffect(()=>{
    if(typeof ResizeObserver!=='function')return;
    const ro=new ResizeObserver(()=>{if(near.current&&!keep.current)toEnd();repaint();});
    if(inner.current)ro.observe(inner.current);if(sc.current)ro.observe(sc.current);
    return()=>ro.disconnect();
  },[p.id,q===null]);
  // 往上翻到头再多拿一段，位置不跳
  useLayoutEffect(()=>{const el=sc.current;if(el&&keep.current){el.scrollTop+=el.scrollHeight-keep.current;lastTop.current=el.scrollTop;keep.current=0;}},[limit]);
  useEffect(()=>{const el=box.current;if(el){el.style.height='auto';el.style.height=Math.min(120,el.scrollHeight)+'px';}
    try{if(text)localStorage.setItem(draftKey(p.id),text);else localStorage.removeItem(draftKey(p.id));}catch{/* 存不了草稿不要紧 */}},[text,p.id]);
  const onScroll=()=>{
    const el=sc.current;if(!el)return;
    repaint();
    const d=el.scrollHeight-el.scrollTop-el.clientHeight,wentUp=el.scrollTop<lastTop.current-2;
    lastTop.current=el.scrollTop;
    // 往上翻了才算离开底部；内容自己变高（图片载出来）不算
    if(d<140)near.current=true;else if(wentUp)near.current=false;
    setUp(d>480&&!near.current);if(near.current&&away)setAway(0);
    if(wentUp&&el.scrollTop<120&&limit<all.length&&!keep.current){keep.current=el.scrollHeight;setLimit(l=>l+PAGE);}
  };
  const bottom=()=>{near.current=true;setAway(0);const el=sc.current;if(el)el.scrollTo({top:el.scrollHeight,behavior:'smooth'});};
  const jump=(id:string)=>{
    const i=all.findIndex(m=>m.id===id);if(i<0){say('那条消息已经不在了');return;}
    setQ(null);if(all.length-i>limit)setLimit(all.length-i+20);
    setTimeout(()=>{document.getElementById('m-'+id)?.scrollIntoView({block:'center'});setFlash(id);setTimeout(()=>setFlash(''),1400);},60);
  };

  // 从报备页点一条过来：停在那一句上（而不是最底下）
  useEffect(()=>{let id='';try{id=sessionStorage.getItem('cx-jump')??'';sessionStorage.removeItem('cx-jump');}catch{/* */}
    if(!id||!list(p.id).some(m=>m.id===id))return;
    const t=setTimeout(()=>{near.current=false;jump(id);},260);return()=>clearTimeout(t);},[p.id]);   // eslint-disable-line react-hooks/exhaustive-deps
  const push=(m:Pick<Msg,'kind'|'text'>&Partial<Msg>)=>{pushMsg({pid:p.id,from:'me',at:Date.now(),re:re?.id,...m});setRe(null);sent(p.id);};
  const send=()=>{const t=text.trim();if(!t)return;push({kind:'text',text:t});setText('');box.current?.focus();};
  const sendPic=async(f?:File|null)=>{
    if(!f)return;
    try{push({kind:'img',text:await putImage(f)});}catch{say('这张图片读不了，换一张试试');}
  };
  const openMenu=(m:Msg)=>{try{getSelection()?.removeAllRanges();}catch{/* */}(document.activeElement as HTMLElement|null)?.blur?.();setMenu(m);};
  useEffect(()=>{const on=(e:KeyboardEvent)=>{if(e.key!=='Escape'||manage||menu||more||edit||ck)return;if(view)setView('');else if(re)setRe(null);else if(panel)setPanel('');};addEventListener('keydown',on);return()=>removeEventListener('keydown',on);},[view,re,panel,manage,menu,more,edit,ck]);
  const pat=()=>{pushMsg({pid:p.id,from:'me',kind:'tip',text:`你拍了拍 ${p.name}`,at:Date.now()});setMore(false);sent(p.id);};
  const lastTa=[...all].reverse().find(m=>m.from==='ta');
  const calling=onCall()?.id===p.id;
  const status=calling?'视频通话中':typing?'正在输入…':lastTa&&Date.now()-lastTa.at<5*60000?'在线':lastTa?brief(lastTa.at)+'在线':p.bio||'在线';
  const last=all.filter(m=>m.kind!=='tip').at(-1);
  const empty=pool(p,'reply').length===0;
  const found=q?.trim()?all.filter(m=>m.kind==='text'&&m.text.includes(q.trim())).reverse().slice(0,200):[];

  // 长按菜单里的动作
  const act={
    react:(m:Msg,e:string)=>{setMsg(p.id,m.id,{react:(m.react??(m.like?'❤️':''))===e?'':e,like:false});setMenu(null);},
    reply:(m:Msg)=>{setRe(m);setMenu(null);box.current?.focus();},
    copy:(m:Msg)=>{void navigator.clipboard?.writeText(m.text);say('复制了');setMenu(null);},
    fav:(m:Msg)=>{setMsg(p.id,m.id,{fav:!m.fav});say(m.fav?'从收藏里拿掉了':'收藏了');setMenu(null);},
    again:(m:Msg)=>{if(!redraw(p.id,m.id))say('他没有别的字卡可换');setMenu(null);},
    mute:(m:Msg)=>{for(const s of (m.src??'').split(',')){const [d,c]=s.split('/');if(d&&c)setCard(d,c,{off:true});}say('这句先收起来了，在字卡里可以恢复');setMenu(null);},
    unsend:(m:Msg)=>{setMsg(p.id,m.id,{kind:'tip',text:'你撤回了一条消息',re:undefined,react:'',like:false,fav:false,st:false});setMenu(null);},
    drop:(m:Msg)=>{setMsg(p.id,m.id,null);setMenu(null);},
  };

  return <main className="chat" style={{'--accent':p.accent} as React.CSSProperties}>
    {p.wall&&<Pic id={p.wall} className="wall"/>}
    {q===null?<header className="bar chat-bar">
      <a className="ico" href="#/inbox" aria-label="回到消息列表"><ChevronLeft size={28} strokeWidth={1.8}/></a>
      <a className="peer" href={'#/us/'+p.id}><Avatar id={p.avatar} name={p.name} size={34}/><span><b>{p.name}</b><small className={calling?'live':undefined}>{status}</small></span></a>
      <button className={`ico${calling?' live':''}`} onClick={()=>callOpen(p.id)} aria-label={calling?'回到视频通话':'视频通话'}><Video size={25} strokeWidth={1.7}/></button>
      <button className="ico" onClick={()=>setQ('')} aria-label="搜索聊天记录"><Search size={23} strokeWidth={1.7}/></button>
      <button className="ico" onClick={()=>setEdit(true)} aria-label="资料与节奏"><Info size={24} strokeWidth={1.7}/></button>
    </header>:<header className="bar chat-bar searching">
      <label className="find wide"><Search size={16}/><input value={q} onChange={e=>setQ(e.target.value)} placeholder={`搜和${p.name}的聊天`} aria-label="搜索聊天记录" autoFocus/></label>
      <button className="send" onClick={()=>setQ(null)}>取消</button>
    </header>}

    {q!==null?<div className="thread results">
      {q.trim()?found.length?<ul>{found.map(m=><li key={m.id}><button onClick={()=>jump(m.id)}>
        <Avatar id={m.from==='me'?st.prefs.myAvatar:p.avatar} name={m.from==='me'?st.prefs.myName:p.name} size={36}/>
        <span className="who"><b>{m.from==='me'?st.prefs.myName:p.name}<small>{dayLabel(m.at)}</small></b><span>{mark(m.text,q.trim())}</span></span></button></li>)}</ul>
        :<p className="empty">没有搜到「{q.trim()}」。</p>:<p className="empty">输入一个词，找你们说过的话。</p>}
    </div>
    :<div className="mid"><div className="thread" ref={sc} onScroll={onScroll} onClick={()=>{if(panel)setPanel('');}}><div ref={inner}>
      {limit>=all.length&&<div className="hello">
        <Avatar id={p.avatar} name={p.name} size={84}/>
        <b>{p.name}</b>{p.bio&&<span>{p.bio}</span>}
        <button className="chip" onClick={()=>setEdit(true)}>编辑资料</button>
      </div>}
      {ms.map((m,i)=>{
        const prev=ms[i-1],next=ms[i+1];
        const gap=!prev||m.at-prev.at>10*60000;
        const top=gap||prev.from!==m.from||prev.kind==='tip',bottom=!next||next.from!==m.from||next.kind==='tip'||next.at-m.at>10*60000;
        return <Bubble key={m.id} m={m} p={p} gap={gap} top={top} bottom={bottom} lit={flash===m.id} quoted={m.re?all.find(x=>x.id===m.re):undefined}
          onReply={()=>{setRe(m);box.current?.focus();}} onMenu={()=>openMenu(m)} onView={()=>setView(m.text)} onJump={jump}/>;
      })}
      {typing&&<div className="row ta bottom top"><Avatar id={p.avatar} name={p.name} size={28}/><div className="bubble dots" aria-label={`${p.name}正在输入`}><i/><i/><i/></div></div>}
      {last?.from==='me'&&!typing&&<p className="seen">{last.seen?`已读 ${hhmm(last.seen)}`:'已送达'}</p>}
      {empty&&<div className="nudge"><p>他还没有能用的字卡，现在说不了话。</p><a className="chip" href="#/cards">去加字卡</a></div>}
      <div ref={end}/>
    </div></div>
    {(up||away>0)&&<button className="down" onClick={bottom} aria-label={away?`${away} 条新消息，回到底部`:'回到底部'}><ChevronDown size={22} strokeWidth={1.8}/>{away>0&&<i>{away}</i>}</button>}</div>}

    {q===null&&<footer className="composer">
      {re&&<div className="replying"><span>回复 {re.from==='me'?'自己':p.name}<em>{peek(re)}</em></span><button className="ico sm" onClick={()=>setRe(null)} aria-label="取消回复"><X size={18}/></button></div>}
      <div className="pill">
        <button className="cam" onClick={()=>file.current?.click()} aria-label="发一张图片"><Camera size={19} strokeWidth={2}/></button>
        <input ref={file} type="file" accept="image/*" hidden onChange={e=>{void sendPic(e.target.files?.[0]);e.target.value='';}}/>
        <textarea ref={box} rows={1} value={text} onChange={e=>setText(e.target.value)} placeholder="发消息…" aria-label={`给${p.name}发消息`}
          onPaste={e=>{const f=Array.from(e.clipboardData.files).find(x=>x.type.startsWith('image/'));if(f){e.preventDefault();void sendPic(f);}}}
          enterKeyHint="send" onFocus={()=>setPanel('')}
          onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();send();}}}/>
        <button className="ico sm" onClick={()=>{box.current?.blur();setPanel(v=>v?'':packs.length&&!text.trim()?packs[0].id:'emo');}} aria-label="表情" aria-pressed={!!panel}><Smile size={23} strokeWidth={1.7}/></button>
        {text.trim()?<button className="send" onClick={send}>发送</button>:<>
          <button className="ico sm" onClick={()=>setMore(true)} aria-label="更多"><Plus size={25} strokeWidth={1.7}/></button>
          <button className="ico sm" onClick={()=>push({kind:'text',text:'❤️'})} aria-label="发一颗心"><Heart size={23} strokeWidth={1.7}/></button>
        </>}
      </div>
      {panel&&<div className="panel">
        <div className="ptabs" role="tablist" aria-label="表情">
          <button role="tab" aria-selected={panel==='emo'} onClick={()=>setPanel('emo')}>Emoji</button>
          {packs.map(k=><button key={k.id} role="tab" aria-selected={panel===k.id} onClick={()=>setPanel(k.id)}>{k.name}</button>)}
          <button className="ico sm" onClick={()=>{const k=addPack(`表情包 ${packs.length+1}`,[p.id]);setPanel(k.id);setManage(k.id);}} aria-label="新建一个表情包分组"><Plus size={20} strokeWidth={1.7}/></button>
          {shown&&<button className="tidy" onClick={()=>setManage(shown.id)}>管理</button>}
        </div>
        {panel==='emo'||!shown?<div className="emos" role="group" aria-label="Emoji">{emojis.map(e=><button key={e} onClick={()=>{setText(t=>t+e);}}>{e}</button>)}</div>
        :<div className="packs" role="group" aria-label={shown.name}>
          {shown.ids.map(id=><button key={id} onClick={()=>push({kind:'img',text:id,st:true})} aria-label="发这张表情包"><Pic id={id}/></button>)}
          {!shown.ids.length&&<p className="hint">这一组还是空的。点右上角「管理」加表情包。</p>}
        </div>}
      </div>}
    </footer>}

    {menu&&<Ctx m={menu} close={()=>setMenu(null)} act={act}/>}
    {manage&&(st.packs??[]).some(k=>k.id===manage)&&<PackSheet k={(st.packs??[]).find(k=>k.id===manage)!} close={()=>setManage('')} gone={()=>{setManage('');setPanel('emo');}}/>}
    {view&&<button className="viewer" onClick={()=>setView('')} aria-label="关掉大图"><Pic id={view} alt="大图"/></button>}
    {more&&<Sheet title="" close={()=>setMore(false)} plain>
      <ul className="apps tools">
        <li><button onClick={pat}><span><Hand size={23} strokeWidth={1.5}/></span>拍一拍</button></li>
        <li><button onClick={()=>{setMore(false);setCk(true);}}><span><MapPin size={23} strokeWidth={1.5}/></span>报备</button></li>
        <li><a href={`#/f/pick/${p.id}`}><span><Dices size={23} strokeWidth={1.5}/></span>帮我选</a></li>
        <li><a href={`#/f/mail/${p.id}`}><span><Mail size={23} strokeWidth={1.5}/></span>写信</a></li>
      </ul>
    </Sheet>}
    {ck&&<Sheet title="报备" close={()=>setCk(false)}><Tell p={p} done={()=>setCk(false)}/><p className="hint"><a href={`#/f/check/${p.id}`}>看今天的报备</a></p></Sheet>}
    {edit&&<PersonaSheet p={p} close={()=>setEdit(false)}/>}
  </main>;
}

const mark=(t:string,q:string)=>{const i=t.indexOf(q);return i<0?t:<>{t.slice(0,i)}<mark>{q}</mark>{t.slice(i+q.length)}</>;};
const Item=({on,label,icon,red}:{on:()=>void;label:string;icon:React.ReactNode;red?:boolean})=><button className={red?'danger':''} onClick={on}>{label}{icon}</button>;

/* 管理一个表情包分组：改名、批量上传、贴链接导入、删 */
function PackSheet({k,close,gone}:{k:Pack;close:()=>void;gone:()=>void}){
  const file=useRef<HTMLInputElement>(null),people=S().personas;
  const [links,setLinks]=useState<string|null>(null),[sure,setSure]=useState(false),[busy,setBusy]=useState(false);
  const upload=async(fs:FileList|null)=>{
    setBusy(true);const got:string[]=[];
    for(const f of Array.from(fs??[])){try{got.push(await putImage(f,480));}catch{/* 跳过读不了的 */}}
    setBusy(false);if(got.length)setPack(k.id,{ids:[...k.ids,...got]});say(got.length?`加了 ${got.length} 张`:'这些图片读不了');
  };
  const paste=()=>{
    const got=[...new Set((links??'').split(/[\s,，]+/).map(x=>x.trim()).filter(x=>/^https?:\/\/\S+$/.test(x)))].filter(x=>!k.ids.includes(x));
    if(got.length)setPack(k.id,{ids:[...k.ids,...got]});setLinks(null);say(got.length?`加了 ${got.length} 张`:'没有找到能用的图片链接');
  };
  return <Sheet title="表情包分组" close={close}>
    <label className="field"><span>名字</span><input value={k.name} onChange={e=>setPack(k.id,{name:e.target.value})} maxLength={12}/></label>
    <div className="rowbtn"><button className="chip" onClick={()=>file.current?.click()} disabled={busy}>{busy?'正在加…':'批量上传'}</button><button className="chip" aria-pressed={links!==null} onClick={()=>setLinks(v=>v===null?'':null)}>链接导入</button></div>
    <input ref={file} type="file" accept="image/*" multiple hidden onChange={e=>{void upload(e.target.files);e.target.value='';}}/>
    {links!==null&&<><textarea className="bulk tall" rows={4} value={links} onChange={e=>setLinks(e.target.value)} placeholder={'一行一个图片链接\nhttps://…/1.png'} aria-label="图片链接，一行一个" autoFocus/><button className="btn" onClick={paste} disabled={!links.trim()}>导入</button></>}
    <div className="field"><span>谁在用</span><div className="chips">{people.map(x=>{const on=!k.who||k.who.includes(x.id);return <button key={x.id} className="chip who-chip" aria-pressed={on} onClick={()=>{
      const now=new Set(k.who??people.map(y=>y.id));if(on)now.delete(x.id);else now.add(x.id);
      setPack(k.id,{who:people.filter(y=>now.has(y.id)).map(y=>y.id)});
    }}><Avatar id={x.avatar} name={x.name} size={22}/>{x.name}</button>;})}</div></div>
    <p className="hint">点亮谁，谁的聊天里就有这一组；在谁的聊天里新建的，默认只给谁用。</p>
    <label className="line"><span>他也会发这一组</span><input type="checkbox" className="switch" checked={k.his!==false} onChange={e=>setPack(k.id,{his:e.target.checked})}/></label>
    {k.ids.length>0&&<div className="packs edit">{k.ids.map(id=><button key={id} onClick={()=>setPack(k.id,{ids:k.ids.filter(x=>x!==id)})} aria-label="删掉这张"><Pic id={id}/><i><X size={12} strokeWidth={2.4}/></i></button>)}</div>}
    <div className="rowbtn"><button className="chip danger" onClick={()=>{if(!sure){setSure(true);return;}dropPack(k.id);gone();}}>{sure?'再点一次，删掉这一组':'删掉这一组'}</button></div>
  </Sheet>;
}

/* 长按一条消息：背景虚掉，上面一条表情，下面一张小菜单 */
type Acts=Record<'reply'|'copy'|'fav'|'again'|'mute'|'unsend'|'drop',(m:Msg)=>void>&{react:(m:Msg,e:string)=>void};
function Ctx({m,close,act}:{m:Msg;close:()=>void;act:Acts}){
  useEffect(()=>{const on=(e:KeyboardEvent)=>{if(e.key==='Escape')close();};addEventListener('keydown',on);return()=>removeEventListener('keydown',on);},[close]);
  const mine=m.from==='me',tip=m.kind==='tip',now=m.react??(m.like?'❤️':'');
  return <div className={`ctx ${m.from}`} role="dialog" aria-modal="true" aria-label="消息操作" onPointerDown={e=>{if(e.target===e.currentTarget)close();}}>
    {!tip&&<div className="reacts" role="group" aria-label="贴一个表情">{quick.map(e=><button key={e} aria-pressed={now===e} onClick={()=>act.react(m,e)}>{e}</button>)}</div>}
    <div className={`bubble ghost${m.kind==='img'?' pic':''}${m.st?' st':''}${tip?' tipb':''}`}>{m.kind==='img'?<Pic id={m.text}/>:m.text}</div>
    <div className="cmenu">
      <small>{dayLabel(m.at)}</small>
      {!tip&&<Item on={()=>act.reply(m)} label="回复" icon={<Reply size={18} strokeWidth={1.7}/>}/>}
      {m.kind==='text'&&<Item on={()=>act.copy(m)} label="复制" icon={<Copy size={18} strokeWidth={1.7}/>}/>}
      {!tip&&<Item on={()=>act.fav(m)} label={m.fav?'取消收藏':'收藏'} icon={<Bookmark size={18} strokeWidth={1.7} fill={m.fav?'currentColor':'none'}/>}/>}
      {!mine&&m.kind==='text'&&<Item on={()=>act.again(m)} label="换一句" icon={<RefreshCw size={18} strokeWidth={1.7}/>}/>}
      {!mine&&m.kind==='text'&&m.src&&<Item on={()=>act.mute(m)} label="这句以后不说" icon={<EyeOff size={18} strokeWidth={1.7}/>}/>}
      {mine&&!tip?<Item on={()=>act.unsend(m)} label="撤回" icon={<Undo2 size={18} strokeWidth={1.7}/>} red/>
        :<Item on={()=>act.drop(m)} label="删除" icon={<Trash2 size={18} strokeWidth={1.7}/>} red/>}
    </div>
  </div>;
}

function Bubble({m,p,gap,top,bottom,lit,quoted,onReply,onMenu,onView,onJump}:{m:Msg;p:Persona;gap:boolean;top:boolean;bottom:boolean;lit:boolean;quoted?:Msg;onReply:()=>void;onMenu:()=>void;onView:()=>void;onJump:(id:string)=>void}){
  const [dx,setDx]=useState(0);
  const g=useRef({x:0,y:0,on:false,held:0,moved:false,fired:false});
  const mine=m.from==='me',react=m.react??(m.like?'❤️':'');
  const card=m.kind==='text'&&(m.ck||hisCheck(m,p));   // 报备：一张小卡，不是普通气泡
  const fire=()=>{g.current.fired=true;g.current.on=false;try{navigator.vibrate?.(8);}catch{/* */}onMenu();};
  const down=(e:React.PointerEvent)=>{
    if(e.button!==0)return;
    g.current={x:e.clientX,y:e.clientY,on:true,moved:false,fired:false,held:window.setTimeout(()=>{if(!g.current.moved)fire();},460)};
  };
  const move=(e:React.PointerEvent)=>{
    const s=g.current;if(!s.on)return;
    const x=e.clientX-s.x,y=e.clientY-s.y;
    if(Math.abs(x)>8||Math.abs(y)>8){s.moved=true;clearTimeout(s.held);}
    // 往对面拖一小段就是回复
    if(e.pointerType!=='mouse'&&Math.abs(x)>Math.abs(y))setDx(Math.max(-72,Math.min(72,mine?Math.min(0,x):Math.max(0,x))));
  };
  const up=()=>{const s=g.current;clearTimeout(s.held);if(s.on&&Math.abs(dx)>52)onReply();s.on=false;setDx(0);};
  if(m.kind==='tip'){
    const rec=m.text.includes('视频通话');
    if(m.id.startsWith('ml'))return <>{gap&&<time className="stamp">{dayLabel(m.at)}</time>}<p id={'m-'+m.id} className="tip rec"><a href={'#/f/mail/'+m.pid}><Mail size={15} strokeWidth={1.8} aria-hidden="true"/>{m.text} · 去信箱看</a></p></>;
    return <>{gap&&<time className="stamp">{dayLabel(m.at)}</time>}<p id={'m-'+m.id} className={rec?'tip rec':'tip'} onContextMenu={e=>{e.preventDefault();onMenu();}} onDoubleClick={onMenu}>{rec&&<Video size={15} strokeWidth={1.8} aria-hidden="true"/>}{m.text}</p></>;
  }
  return <>
    {gap&&<time className="stamp">{dayLabel(m.at)}</time>}
    <div id={'m-'+m.id} className={`row ${m.from}${top?' top':''}${bottom?' bottom':''}${lit?' lit':''}`}>
      {!mine&&(bottom?<Avatar id={p.avatar} name={p.name} size={28}/>:<span className="gutter"/>)}
      <div className="stack" style={dx?{transform:`translateX(${dx}px)`,transition:'none'}:undefined}>
        {quoted&&<button className="quote" onClick={()=>onJump(quoted.id)} aria-label="回到被回复的那句">{peek(quoted)}</button>}
        <div className={`bubble${m.kind==='img'?' pic':''}${m.st?' st':''}${card?' ck':''}`} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
          onClick={()=>{if(m.kind==='img'&&!m.st&&!g.current.fired&&!g.current.moved)onView();}}
          onDoubleClick={()=>setMsg(p.id,m.id,{react:react==='❤️'?'':'❤️',like:false})} onContextMenu={e=>{e.preventDefault();clearTimeout(g.current.held);fire();}}>
          {card&&<small className="ck-tag"><MapPin size={12} strokeWidth={2} aria-hidden="true"/>报备</small>}
          {m.kind==='img'?<Pic id={m.text} alt={m.st?'表情包':'图片'}/>:m.text}
          {react&&<i className="liked" aria-label={`贴了 ${react}`}>{react}</i>}
        </div>
      </div>
    </div>
  </>;
}
