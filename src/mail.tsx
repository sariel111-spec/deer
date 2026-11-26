// 信箱：给他写信，过一阵收到他的回信（几句字卡连成一封）。慢一点的传讯。
// 信封列表 → 拆开 → 信纸；写信有草稿、可以写了不寄；回信看得到原信；可以请 AI 读一读。
import {useEffect,useMemo,useRef,useState} from 'react';
import {Bookmark,ChevronLeft,Ellipsis,SlidersHorizontal,SquarePen} from 'lucide-react';
import {S,box,setBox,uid,type Letter,type Persona} from './db';
import {mailLens,mailPaces,mailPros,planProMail,sendLetter} from './engine';
import {MAIL_PROMPT,dsAuto,type Msg as AiMsg} from './ai';
import {AiBlock} from './aiui';
import {Sub} from './more';
import {Sheet,say} from './pages';
import {letterImage} from './mailimg';

type View={k:'list'}|{k:'write';re?:string}|{k:'read';id:string};
const WK='日一二三四五六';
const two=(n:number)=>String(n).padStart(2,'0');
const md=(t:number)=>{const d=new Date(t);return `${two(d.getMonth()+1)}/${two(d.getDate())}`;};
const full=(t:number)=>{const d=new Date(t);return `${d.getFullYear()}/${two(d.getMonth()+1)}/${two(d.getDate())} 星期${WK[d.getDay()]}`;};
const near=(t:number)=>{const d=new Date(t),n=new Date(),day=(x:Date)=>new Date(x.getFullYear(),x.getMonth(),x.getDate()).getTime(),g=Math.round((day(n)-day(d))/864e5);
  return g===0?'今天':g===1?'昨天':d.getFullYear()===n.getFullYear()?`${d.getMonth()+1}月${d.getDate()}日`:`${d.getFullYear()}年${d.getMonth()+1}月${d.getDate()}日`;};
const first=(l:Letter)=>l.text.split('\n').map(x=>x.trim()).filter(Boolean)[0]??'';
const waiting=(l:Letter)=>l.from==='me'&&!!l.due&&!!l.plan&&!l.got;
/** 他在信里怎么称呼你、他的落款：没设就用名字 */
const callOf=(p:Persona)=>box(p.id).mailCall?.trim()||S().prefs.myName;
const signOf=(p:Persona)=>box(p.id).mailSign?.trim()||p.name;
const draftKey=(pid:string)=>'cx-mail-draft:'+pid;
const loadDraft=(pid:string):{t:string;re?:string}=>{try{const d=JSON.parse(localStorage.getItem(draftKey(pid))||'null');if(d&&typeof d.t==='string')return d;}catch{/* */}return {t:''};};
const saveDraft=(pid:string,t:string,re?:string)=>{try{if(t.trim())localStorage.setItem(draftKey(pid),JSON.stringify({t,re}));else localStorage.removeItem(draftKey(pid));}catch{/* 存不了就算了 */}};

/** 邮戳：一个细圈，里面是状态和日期 */
const Post=({top,t}:{top:string;t:number})=><span className="ml-post" aria-hidden="true"><i>{top}</i><b>{md(t)}</b></span>;

export function MailBox({p}:{p:Persona}){
  const b=box(p.id),all=b.letters;
  const [view,setView]=useState<View>({k:'list'}),[tab,setTab]=useState<'all'|'in'|'out'|'star'>('all'),[pace,setPace]=useState(false);
  const patch=(id:string,x:Partial<Letter>)=>setBox(p.id,{letters:box(p.id).letters.map(l=>l.id===id?{...l,...x,u:Date.now()}:l)});
  const drop=(id:string)=>{const now=box(p.id);setBox(p.id,{letters:now.letters.filter(l=>l.id!==id),mailGone:[...(now.mailGone??[]),id].slice(-400)});setView({k:'list'});say('删掉了');};
  const open=all.find(l=>view.k==='read'&&l.id===view.id);
  if(view.k==='write')return <Write p={p} re={all.find(l=>l.id===view.re)} close={()=>setView({k:'list'})}/>;
  if(view.k==='read'&&open)return <Read key={open.id} p={p} l={open} all={all} patch={patch} drop={drop} go={setView}/>;
  const shown=[...all].reverse().filter(l=>tab==='all'||(tab==='in'?l.from==='ta':tab==='out'?l.from==='me':!!l.star));
  const draft=loadDraft(p.id).t.trim();
  return <Sub p={p} title="信箱" cls="ml" act={<>
    <button className="ico" onClick={()=>setPace(true)} aria-label="信的设置"><SlidersHorizontal size={22} strokeWidth={1.7}/></button>
    <button className="ico" onClick={()=>setView({k:'write'})} aria-label="写一封信"><SquarePen size={23} strokeWidth={1.7}/></button></>}>
    {all.length>0&&<div className="chips ml-tabs" role="radiogroup" aria-label="看哪些信">
      {([['all','全部'],['in','来信'],['out','寄出'],['star','收藏']] as const).map(([id,n])=><button key={id} role="radio" aria-checked={tab===id} aria-pressed={tab===id} className="chip" onClick={()=>setTab(id)}>{n}</button>)}
    </div>}
    {draft&&<button className="ml-draft" onClick={()=>setView({k:'write'})}><small>写到一半的信</small><span>{draft.split('\n')[0]}</span></button>}
    {shown.length?<ul className="ml-list">{shown.map(l=>{const his=l.from==='ta',fresh=his&&!l.read;return <li key={l.id}>
      <button className={`ml-env${fresh?' new':''}`} onClick={()=>setView({k:'read',id:l.id})} aria-label={`${his?`${p.name} 的来信`:`寄给 ${p.name} 的信`}${fresh?'，还没拆':''}：${first(l)}`}>
        <small className="ml-to">{his?(l.pro?`${p.name} 写来的`:`${p.name} 的回信`):l.kept?'写了没寄':`寄给 ${p.name}`}</small>
        <b>{fresh?'还没拆开':first(l)}</b>
        <small className="ml-when">{near(l.at)}{waiting(l)?' · 回信在路上':l.got?' · 已回信':''}</small>
        {l.star&&<Bookmark className="ml-star" size={14} strokeWidth={1.8} fill="currentColor"/>}
        <Post top={his?'已送达':l.kept?'没寄出':'已寄出'} t={l.at}/>
      </button></li>;})}</ul>
      :all.length?<p className="empty">这里还没有信。</p>
      :<div className="ml-none"><p>还没有信。<br/>写一封寄给 {p.name}，过一阵他会回你一封。</p><button className="btn" onClick={()=>setView({k:'write'})}>写第一封信</button></div>}
    {pace&&<Pace p={p} close={()=>setPace(false)}/>}
  </Sub>;
}

/* 回信的节奏 */
function Pace({p,close}:{p:Persona;close:()=>void}){
  const b=box(p.id);
  const Row=({title,items,cur,set}:{title:string;items:{name:string;note:string}[];cur:number;set:(i:number)=>void})=><>
    <h3>{title}</h3>
    <div className="chips" role="radiogroup" aria-label={title}>{items.map((x,i)=><button key={x.name} role="radio" aria-checked={cur===i} aria-pressed={cur===i} className="chip" onClick={()=>set(i)}>{x.name}<small>{x.note}</small></button>)}</div>
  </>;
  const [call,setCall]=useState(b.mailCall??''),[sign,setSign]=useState(b.mailSign??'');
  return <Sheet title="信的设置" close={close}>
    <h3>称呼和落款</h3>
    <label className="ml-field"><span>他在信里叫你</span><input value={call} onChange={e=>setCall(e.target.value.slice(0,12))} onBlur={()=>{if(call.trim()!==(b.mailCall??''))setBox(p.id,{mailCall:call.trim()});}} placeholder={S().prefs.myName} aria-label="他在信里叫你"/></label>
    <label className="ml-field"><span>他的落款</span><input value={sign} onChange={e=>setSign(e.target.value.slice(0,12))} onBlur={()=>{if(sign.trim()!==(b.mailSign??''))setBox(p.id,{mailSign:sign.trim()});}} placeholder={p.name} aria-label="他的落款"/></label>
    <Row title="他多久回信" items={mailPaces} cur={b.mailPace??0} set={i=>setBox(p.id,{mailPace:i})}/>
    <Row title="回信写多长" items={mailLens} cur={b.mailLen??1} set={i=>setBox(p.id,{mailLen:i})}/>
    <Row title="他会主动写信吗" items={mailPros} cur={b.mailPro??0} set={i=>{setBox(p.id,{mailPro:i});planProMail(p);}}/>
    <p className="hint">信是用 {p.name} 的字卡连成的。他睡觉的钟点不送信。</p>
  </Sheet>;
}

/* 写信 */
function Write({p,re,close}:{p:Persona;re?:Letter;close:()=>void}){
  const me=S().prefs,d=useMemo(()=>loadDraft(p.id),[p.id]);
  // 点「回信」进来、而留着的草稿是给别的信写的：从空白开始（原来的草稿等真的动笔了才会被换掉）
  const ref=re??(d.re?box(p.id).letters.find(l=>l.id===d.re):undefined);
  const [t,setT]=useState(re&&d.re!==re.id?'':d.t),ta=useRef<HTMLTextAreaElement>(null),typed=useRef(false);
  useEffect(()=>{if(typed.current)saveDraft(p.id,t,ref?.id);},[t]);
  useEffect(()=>{const el=ta.current;if(!el)return;el.style.height='auto';el.style.height=Math.max(el.scrollHeight,260)+'px';},[t]);
  const reId=ref?.id;
  const send=()=>{const x=t.trim();if(!x)return;const l=sendLetter(p,x,reId);saveDraft(p.id,'');close();say(l.plan?'寄出去了':`寄出去了。${p.name} 还没有能用的字卡，回不了信`);};
  const keep=()=>{const x=t.trim();if(!x)return;setBox(p.id,{letters:[...box(p.id).letters,{id:uid(),from:'me',text:x,at:Date.now(),read:true,kept:true,...(reId?{re:reId}:{})}]});saveDraft(p.id,'');close();say('留在信箱里了，没有寄出');};
  const pace=mailPaces[box(p.id).mailPace??0]??mailPaces[0];
  return <main className="page sub ml" style={{'--accent':p.accent} as React.CSSProperties}>
    <header className="bar"><button className="ico" onClick={close} aria-label="回到信箱"><ChevronLeft size={28} strokeWidth={1.8}/></button><h1>写信</h1>
      <button className="btn sm" onClick={send} disabled={!t.trim()}>寄出</button></header>
    {ref&&<div className="ml-orig"><small>{ref.from==='ta'?`回 ${p.name} 的这封信`:'接着这封信写'}</small><span>{ref.text}</span></div>}
    <article className="ml-paper write">
      <time>{full(Date.now())}</time>
      <p className="ml-dear">致 {p.name}：</p>
      <textarea ref={ta} className="ml-body" value={t} onChange={e=>{typed.current=true;setT(e.target.value.slice(0,3000));}} placeholder="想说的话，慢慢写" aria-label="信的内容" autoFocus/>
      <p className="ml-sign">{me.myName}</p>
    </article>
    <p className="hint ml-foot">{p.name} 大概 {pace.note}后回信</p>
    <div className="rowbtn center"><button className="linkish" onClick={keep} disabled={!t.trim()}>只是写下来，不寄</button></div>
  </main>;
}

/* 读信 */
function Read({p,l,all,patch,drop,go}:{p:Persona;l:Letter;all:Letter[];patch:(id:string,x:Partial<Letter>)=>void;drop:(id:string)=>void;go:(v:View)=>void}){
  const me=S().prefs,his=l.from==='ta';
  const [sealed,setSealed]=useState(his&&!l.read),[fresh,setFresh]=useState(false),[sure,setSure]=useState(false),[pic,setPic]=useState<{url:string;file:File}|null>(null),[drawing,setDrawing]=useState(false),[more,setMore]=useState(false);
  useEffect(()=>()=>{if(pic)URL.revokeObjectURL(pic.url);},[pic]);
  const i=all.findIndex(x=>x.id===l.id),older=all[i-1],newer=all[i+1];
  const dear=`致 ${his?callOf(p):p.name}：`,sign=his?signOf(p):me.myName;
  const stamp=his?'已送达':l.kept?'没寄出':'已寄出';
  const draw=async()=>{
    if(drawing)return;setDrawing(true);
    try{const blob=await letterImage({date:full(l.at),stamp,stampDate:md(l.at),dear,body:l.text,sign});
      setPic({url:URL.createObjectURL(blob),file:new File([blob],`${his?p.name+'的来信':'寄给'+p.name}-${md(l.at).replace('/','')}.png`,{type:'image/png'})});}
    catch{say('这次没画出来，再试一次');}
    setDrawing(false);
  };
  const savePic=async()=>{
    if(!pic)return;
    try{if(navigator.canShare?.({files:[pic.file]})){await navigator.share({files:[pic.file]});return;}}catch(e){if((e as Error)?.name==='AbortError')return;}
    const a=document.createElement('a');a.href=pic.url;a.download=pic.file.name;document.body.appendChild(a);a.click();a.remove();say('存下来了');
  };
  const orig=l.re?all.find(x=>x.id===l.re):undefined,reply=all.find(x=>x.re===l.id&&x.from!==l.from);
  const unseal=()=>{setSealed(false);setFresh(true);patch(l.id,{read:true});};
  const copy=async()=>{try{await navigator.clipboard.writeText(`${full(l.at)}\n${dear}\n${l.text}\n${sign}`);say('复制好了');}catch{say('这个浏览器不让复制，长按文字自己选吧');}};
  const build=():AiMsg[]=>{
    const b=box(p.id);
    const u=['【他的人设】（先读这一段，最后替他说话时照着它来）',`梦角：${p.name}${p.bio?'。'+p.bio:''}`,b.tarotAbout?`他的资料和说话习惯：${b.tarotAbout}`:'',`她的名字：${me.myName}`,
      orig&&orig.from==='me'?'【她写的信】\n'+orig.text:l.pro?'【她写的信】没有。这封是他主动写来的，不是在回哪一封信。':'【她写的信】原信已经不在了，只看他的这封。',
      '【他的信】（一行是一张字卡）\n'+l.text].filter(Boolean).join('\n');
    return [{role:'system',content:MAIL_PROMPT},{role:'user',content:u}];
  };
  return <main className="page sub ml" style={{'--accent':p.accent} as React.CSSProperties}>
    <header className="bar"><button className="ico" onClick={()=>go({k:'list'})} aria-label="回到信箱"><ChevronLeft size={28} strokeWidth={1.8}/></button><h1>{his?`${p.name} 的来信`:l.kept?'没寄出的信':`寄给 ${p.name}`}</h1>
      {!sealed&&<><button className="ico" onClick={()=>patch(l.id,{star:!l.star})} aria-label={l.star?'取消收藏':'收藏这封信'} aria-pressed={!!l.star}><Bookmark size={22} strokeWidth={1.7} fill={l.star?'currentColor':'none'}/></button>
        <button className="ico" onClick={()=>{setSure(false);setMore(true);}} aria-label="更多"><Ellipsis size={23} strokeWidth={1.7}/></button></>}</header>
    {sealed?<div className="ml-sealed">
      <button className="ml-big" onClick={unseal} aria-label="拆开这封信"><span className="ml-from">来自 {p.name}</span><i aria-hidden="true"/><Post top="已送达" t={l.at}/></button>
      <p>{near(l.at)}送到的{l.pro?'，是他主动写来的':''}</p>
      <button className="btn" onClick={unseal}>拆开这封信</button>
    </div>:<>
      {orig&&<button className="ml-orig" onClick={()=>go({k:'read',id:orig.id})}><small>{his?'你的原信':orig.from==='ta'?`回的是 ${p.name} 的这封信`:'接着这封信写的'}</small><span>{orig.text}</span></button>}
      <article className={`ml-paper${fresh?' fresh':''}`}>
        <Post top={stamp} t={l.at}/>
        <time>{full(l.at)}</time>
        <p className="ml-dear">{dear}</p>
        <div className="ml-body">{l.text}</div>
        <p className="ml-sign">{sign}</p>
      </article>
      {!his&&(reply?<button className="ml-next" onClick={()=>go({k:'read',id:reply.id})}>{p.name} 回信了，去看</button>:waiting(l)?<p className="ml-way" role="status">{p.name} 的回信在路上</p>:null)}
      {his?<AiBlock name={p.name} noBio={!p.bio&&!box(p.id).tarotAbout} build={build} saved={l.ai??''} save={t=>patch(l.id,{ai:t})} label="解读这封信" setup={'#/f/draw/'+p.id} auto={fresh&&dsAuto()}>
        <button className="chip" onClick={()=>go({k:'write',re:l.id})}>回信</button>
      </AiBlock>:<div className="rowbtn ml-acts">
        {l.kept&&<button className="chip on" onClick={()=>{const n=sendLetter(p,l.text,l.re);const now=box(p.id);setBox(p.id,{letters:now.letters.filter(x=>x.id!==l.id),mailGone:[...(now.mailGone??[]),l.id].slice(-400)});go({k:'read',id:n.id});say('寄出去了');}}>现在寄出</button>}
        <button className="chip" onClick={()=>go({k:'write',re:l.id})}>接着写一封</button>
      </div>}
      {(older||newer)&&<nav className="ml-turn" aria-label="翻信">
        {older?<button className="linkish" onClick={()=>go({k:'read',id:older.id})}>‹ 上一封</button>:<span/>}
        {newer?<button className="linkish" onClick={()=>go({k:'read',id:newer.id})}>下一封 ›</button>:<span/>}
      </nav>}
    </>}
    {more&&!pic&&<Sheet title="" plain close={()=>setMore(false)}>
      <ul className="ml-menu">
        <li><button onClick={()=>{setMore(false);void draw();}}>存成图片</button></li>
        <li><button onClick={()=>{setMore(false);void copy();}}>复制文字</button></li>
        <li><button className="danger" onClick={()=>{if(!sure){setSure(true);return;}setMore(false);drop(l.id);}}>{sure?'再点一次，删掉这封信':'删掉这封信'}</button></li>
      </ul>
    </Sheet>}
    {pic&&<Sheet title="存成图片" close={()=>setPic(null)}>
      <img className="ml-pic" src={pic.url} alt={`${his?p.name+' 的来信':'寄给 '+p.name+' 的信'}的图片`}/>
      <button className="btn" onClick={()=>void savePic()}>保存或分享</button>
      <p className="hint center">也可以长按图片存到相册。</p>
    </Sheet>}
  </main>;
}
