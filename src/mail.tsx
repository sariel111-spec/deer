// 信箱：给他写信，过一阵收到他的回信（几句字卡连成一封）。慢一点的传讯。
// 信封列表 → 拆开 → 信纸；写信有草稿、可以写了不寄；回信看得到原信；可以请 AI 读一读。
import {useEffect,useMemo,useRef,useState} from 'react';
import {Bookmark,ChevronLeft,Ellipsis,ImagePlus,Plus,SlidersHorizontal,SquarePen,X} from 'lucide-react';
import {S,box,putImage,setBox,uid,type Letter,type Persona} from './db';
import {mailLens,mailPaces,mailPros,planProMail,sendLetter} from './engine';
import {MAIL_PROMPT,dsAuto,type Msg as AiMsg} from './ai';
import {AiBlock} from './aiui';
import {Pic,nav} from './App';
import {Sheet,say} from './pages';
import {Over} from './over';
import {letterImage} from './mailimg';

// 信箱里的三个页面都写在地址里（…/mail/<pid>、…/w、…/w/<回的那封>、…/e/<接着改的那封>、…/r/<信>），
// 这样系统的返回、手机上的侧滑返回，回到的是信箱列表，而不是一下退出信箱
type View={k:'list'}|{k:'write';re?:string;edit?:string}|{k:'read';id:string};
const baseOf=(pid:string)=>'#/f/mail/'+pid;
const viewOf=():View=>{const [, , , ,d,e]=location.hash.replace(/^#\/?/,'/').split('/');return d==='w'?{k:'write',re:e||undefined}:d==='e'&&e?{k:'write',edit:e}:d==='r'&&e?{k:'read',id:e}:{k:'list'};};
const hashOf=(pid:string,v:View)=>baseOf(pid)+(v.k==='write'?(v.edit?'/e/'+v.edit:'/w'+(v.re?'/'+v.re:'')):v.k==='read'?'/r/'+v.id:'');
/** 去某一页。swap：顶替当前这一页（翻上一封 / 下一封时用，返回仍然回到列表） */
const goTo=(pid:string,v:View,swap=false)=>{const h=hashOf(pid,v);if(swap)location.replace(h);else location.hash=h;};
/** 从写信 / 读信退回去：是从信箱里点进来的就原路返回，不是（比如刷新后直接停在这页）就换成列表 */
const backFrom=(pid:string)=>{if(nav.from.startsWith(baseOf(pid))&&nav.from!==location.hash)history.back();else location.replace(baseOf(pid));};
// 是从哪儿进的信箱（聊天里点进来的，退出时回聊天）
const cameFrom:Record<string,string>={};
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
const loadDraft=(pid:string):{t:string;re?:string;img?:string}=>{try{const d=JSON.parse(localStorage.getItem(draftKey(pid))||'null');if(d&&typeof d.t==='string')return d;}catch{/* */}return {t:''};};
const saveDraft=(pid:string,t:string,re?:string,img?:string)=>{try{if(t.trim()||img)localStorage.setItem(draftKey(pid),JSON.stringify({t,re,img}));else localStorage.removeItem(draftKey(pid));}catch{/* 存不了就算了 */}};

/** 邮戳：一个细圈，里面是状态和日期 */
const Post=({top,t}:{top:string;t:number})=><span className="ml-post" aria-hidden="true"><i>{top}</i><b>{md(t)}</b></span>;

export function MailBox({p}:{p:Persona}){
  const b=box(p.id),all=b.letters;
  const view=viewOf(),setView=(v:View,swap=false)=>goTo(p.id,v,swap);
  const [tab,setTab]=useState<'all'|'in'|'out'|'star'>('all'),[pace,setPace]=useState(false);
  if(nav.from&&!nav.from.startsWith(baseOf(p.id)))cameFrom[p.id]=nav.from;
  const patch=(id:string,x:Partial<Letter>)=>setBox(p.id,{letters:box(p.id).letters.map(l=>l.id===id?{...l,...x,u:Date.now()}:l)});
  const drop=(id:string)=>{const now=box(p.id);setBox(p.id,{letters:now.letters.filter(l=>l.id!==id),mailGone:[...(now.mailGone??[]),id].slice(-400)});backFrom(p.id);say('删掉了');};
  const open=all.find(l=>view.k==='read'&&l.id===view.id);
  if(view.k==='write')return <Write key={view.edit??view.re??''} p={p} re={all.find(l=>l.id===view.re)} edit={all.find(l=>l.id===view.edit&&l.kept)} close={()=>backFrom(p.id)}/>;
  if(view.k==='read'&&open)return <Read key={open.id} p={p} l={open} all={all} patch={patch} drop={drop} go={setView} back={()=>backFrom(p.id)}/>;
  const out=cameFrom[p.id]?.startsWith('#/c/')?cameFrom[p.id]:'#/us/'+p.id;
  const shown=[...all].reverse().filter(l=>tab==='all'||(tab==='in'?l.from==='ta':tab==='out'?l.from==='me':!!l.star));
  const count={in:all.filter(l=>l.from==='ta').length,out:all.filter(l=>l.from==='me').length,star:all.filter(l=>l.star).length};
  // 信跨了不止一个月：按月分开，每个月上面一行小字
  const monthOf=(t:number)=>{const d=new Date(t);return d.getFullYear()===new Date().getFullYear()?`${d.getMonth()+1}月`:`${d.getFullYear()}年${d.getMonth()+1}月`;};
  const months=new Set(shown.map(l=>monthOf(l.at))).size>1;
  const draft=loadDraft(p.id).t.trim();
  return <main className="page sub ml" style={{'--accent':p.accent} as React.CSSProperties}>
    <header className="bar"><a className="ico" href={out} aria-label="返回"><ChevronLeft size={28} strokeWidth={1.8}/></a><h1>信箱</h1>
      <button className="ico" onClick={()=>setPace(true)} aria-label="信的设置"><SlidersHorizontal size={22} strokeWidth={1.7}/></button>
      <button className="ico" onClick={()=>setView({k:'write'})} aria-label="写一封信"><SquarePen size={23} strokeWidth={1.7}/></button></header>
    {all.length>0&&<div className="seg ml-tabs" role="tablist" aria-label="看哪些信">
      {([['all','全部'],['in','来信'],['out','寄出'],['star','收藏']] as const).map(([id,n])=><button key={id} role="tab" aria-selected={tab===id} onClick={()=>setTab(id)}>{n}{id!=='all'&&count[id]>0&&<small>{count[id]}</small>}</button>)}
    </div>}
    {draft&&<button className="ml-draft" onClick={()=>setView({k:'write'})}><small>写到一半的信</small><span>{draft.split('\n')[0]}</span></button>}
    {shown.length?<ul className="ml-list">{shown.map((l,i)=>{const his=l.from==='ta',fresh=his&&!l.read,head=months&&(i===0||monthOf(shown[i-1].at)!==monthOf(l.at));return <li key={l.id}>
      {head&&<h3 className="ml-month">{monthOf(l.at)}</h3>}
      <button className={`ml-env${fresh?' new':''}`} onClick={()=>setView({k:'read',id:l.id})} aria-label={`${his?`${p.name} 的来信`:`寄给 ${p.name} 的信`}${fresh?'，还没拆':''}：${first(l)}`}>
        <small className="ml-to">{his?(l.pro?`${p.name} 写来的`:`${p.name} 的回信`):l.kept?'写了没寄':`寄给 ${p.name}`}{waiting(l)?' · 回信在路上':l.got?' · 已回信':''}{l.img&&!fresh?' · 有照片':''}{l.star&&<Bookmark className="ml-star" size={12} strokeWidth={1.8} fill="currentColor"/>}</small>
        <b>{fresh?'还没拆开':first(l)}</b>
        <Post top={his?'已送达':l.kept?'没寄出':'已寄出'} t={l.at}/>
      </button></li>;})}</ul>
      :all.length?<p className="empty">{tab==='star'?'还没有收藏的信。读信时点右上角的书签就收在这里。':'这里还没有信。'}</p>
      :<div className="ml-none"><p>还没有信。<br/>写一封寄给 {p.name}，过一阵他会回你一封。</p><button className="btn" onClick={()=>setView({k:'write'})}>写第一封信</button></div>}
    {pace&&<Pace p={p} close={()=>setPace(false)}/>}
  </main>;
}

/* 回信的节奏 */
function Pace({p,close}:{p:Persona;close:()=>void}){
  const b=box(p.id);
  const Row=({title,items,cur,set}:{title:string;items:{name:string;note:string}[];cur:number;set:(i:number)=>void})=><>
    <h3 className="ml-row"><span>{title}</span><small>{items[cur]?.note}</small></h3>
    <div className="seg sm ml-seg" role="radiogroup" aria-label={title}>{items.map((x,i)=><button key={x.name} role="radio" aria-checked={cur===i} aria-pressed={cur===i} className="chip" onClick={()=>set(i)}>{x.name}</button>)}</div>
  </>;
  const [call,setCall]=useState(b.mailCall??''),[sign,setSign]=useState(b.mailSign??'');
  const pics=b.mailPics??[],pick=useRef<HTMLInputElement>(null),[busy,setBusy]=useState(false),[gone,setGone]=useState('');
  const addPics=async(fs:File[])=>{if(!fs.length)return;setBusy(true);let n=0,bad=0;
    for(const f of fs.slice(0,40)){try{const id=await putImage(f,1400);setBox(p.id,{mailPics:[...(box(p.id).mailPics??[]),id].slice(-80)});n++;}catch{bad++;}}
    setBusy(false);say(n?`加了 ${n} 张${bad?`，${bad} 张读不了`:''}`:'这些图片读不了，换几张试试');};
  return <Sheet title="信的设置" close={close}>
    <h3>称呼和落款</h3>
    <label className="ml-field"><span>他在信里叫你</span><input value={call} onChange={e=>setCall(e.target.value.slice(0,12))} onBlur={()=>{if(call.trim()!==(b.mailCall??''))setBox(p.id,{mailCall:call.trim()});}} placeholder={S().prefs.myName} aria-label="他在信里叫你"/></label>
    <label className="ml-field"><span>他的落款</span><input value={sign} onChange={e=>setSign(e.target.value.slice(0,12))} onBlur={()=>{if(sign.trim()!==(b.mailSign??''))setBox(p.id,{mailSign:sign.trim()});}} placeholder={p.name} aria-label="他的落款"/></label>
    <Row title="他多久回信" items={mailPaces} cur={b.mailPace??0} set={i=>setBox(p.id,{mailPace:i})}/>
    <Row title="回信写多长" items={mailLens} cur={b.mailLen??1} set={i=>setBox(p.id,{mailLen:i})}/>
    <Row title="他会主动写信吗" items={mailPros} cur={b.mailPro??0} set={i=>{setBox(p.id,{mailPro:i});planProMail(p);}}/>
    <h3>{p.name} 会夹在信里的照片</h3>
    <div className="ml-pics">
      {pics.map(x=><button key={x} className={gone===x?'sure':''} onClick={()=>{if(gone!==x){setGone(x);return;}setGone('');setBox(p.id,{mailPics:(box(p.id).mailPics??[]).filter(y=>y!==x)});}} aria-label={gone===x?'再点一次，拿掉这张':'他的一张照片，点两次拿掉'}><Pic id={x} alt=""/>{gone===x&&<span>再点一次拿掉</span>}</button>)}
      <button className="add" onClick={()=>pick.current?.click()} disabled={busy} aria-label="加照片"><Plus size={22} strokeWidth={1.6}/></button>
    </div>
    <input ref={pick} type="file" accept="image/*" multiple hidden onChange={e=>{const fs=[...(e.target.files??[])];e.target.value='';void addPics(fs);}}/>
    <p className="hint">放几张进来，他偶尔会挑一张夹在信里。</p>
  </Sheet>;
}

/* 写信 */
function Write({p,re,edit,close}:{p:Persona;re?:Letter;edit?:Letter;close:()=>void}){
  const me=S().prefs,d=useMemo(()=>loadDraft(p.id),[p.id]);
  // edit：接着改一封写了没寄的信（不走草稿）。点「回信」进来、而留着的草稿是给别的信写的：从空白开始（原来的草稿等真的动笔了才会被换掉）
  const ref=edit?box(p.id).letters.find(l=>l.id===edit.re):re??(d.re?box(p.id).letters.find(l=>l.id===d.re):undefined);
  const [t,setT]=useState(edit?edit.text:re&&d.re!==re.id?'':d.t),ta=useRef<HTMLTextAreaElement>(null),typed=useRef(false);
  const [img,setImg]=useState(edit?edit.img??'':re&&d.re!==re.id?'':d.img??''),file=useRef<HTMLInputElement>(null);   // 夹在信里的那张照片
  const clip=async(f?:File|null)=>{if(!f)return;try{typed.current=true;setImg(await putImage(f,1400));}catch{say('这张图片读不了，换一张试试');}};
  useEffect(()=>{if(typed.current&&!edit)saveDraft(p.id,t,ref?.id,img||undefined);},[t,img]);
  useEffect(()=>{const on=(e:KeyboardEvent)=>{if(e.key==='Escape'&&!document.querySelector('.veil'))close();};addEventListener('keydown',on);return()=>removeEventListener('keydown',on);},[]);
  // 写完之后回信箱列表：从列表进来的原路返回；从某封信点「回信」进来的，把这一页换成列表
  const done=()=>{if(nav.from===baseOf(p.id))history.back();else location.replace(baseOf(p.id));};
  const gone=(id:string)=>{const now=box(p.id);return {letters:now.letters.filter(x=>x.id!==id),mailGone:[...(now.mailGone??[]),id].slice(-400)};};
  useEffect(()=>{const el=ta.current;if(!el)return;el.style.height='auto';el.style.height=Math.max(el.scrollHeight,260)+'px';},[t]);
  const reId=ref?.id;
  const send=()=>{const x=t.trim();if(!x)return;const l=sendLetter(p,x,reId,img||undefined);
    if(edit){setBox(p.id,gone(edit.id));goTo(p.id,{k:'read',id:l.id},true);}else{saveDraft(p.id,'');done();}
    say(l.plan?'寄出去了':`寄出去了。${p.name} 还没有能用的字卡，回不了信`);};
  const keep=()=>{const x=t.trim();if(!x)return;
    if(edit){setBox(p.id,{letters:box(p.id).letters.map(l=>l.id===edit.id?{...l,text:x,img:img||undefined,u:Date.now()}:l)});close();say('改好了');return;}
    setBox(p.id,{letters:[...box(p.id).letters,{id:uid(),from:'me',text:x,at:Date.now(),read:true,kept:true,...(reId?{re:reId}:{}),...(img?{img}:{})}]});saveDraft(p.id,'');done();say('留在信箱里了，没有寄出');};
  const pace=mailPaces[box(p.id).mailPace??0]??mailPaces[0];
  return <main className="page sub ml" style={{'--accent':p.accent} as React.CSSProperties}>
    <header className="bar"><button className="ico" onClick={close} aria-label="回到信箱"><ChevronLeft size={28} strokeWidth={1.8}/></button><h1>{edit?'接着改':'写信'}</h1>
      <button className="btn sm" onClick={send} disabled={!t.trim()}>寄出</button></header>
    {ref&&<div className="ml-orig"><small>{ref.from==='ta'?`回 ${p.name} 的这封信`:'接着这封信写'}</small><span>{ref.text}</span></div>}
    <article className="ml-paper write">
      <time>{full(Date.now())}</time>
      <p className="ml-dear">致 {p.name}：</p>
      {img&&<div className="ml-photo"><Pic id={img} alt="夹在信里的照片"/><button onClick={()=>{typed.current=true;setImg('');}} aria-label="拿掉这张照片"><X size={15} strokeWidth={2}/></button></div>}
      <textarea ref={ta} className="ml-body" value={t} onChange={e=>{typed.current=true;setT(e.target.value.slice(0,3000));}} placeholder="想说的话，慢慢写" aria-label="信的内容" autoFocus/>
      <p className="ml-sign">{!img&&<button className="ml-clip" onClick={()=>file.current?.click()} aria-label="夹一张照片"><ImagePlus size={20} strokeWidth={1.6}/></button>}{me.myName}</p>
      <input ref={file} type="file" accept="image/*" hidden onChange={e=>{const f=e.target.files?.[0];e.target.value='';void clip(f);}}/>
    </article>
    <p className="hint ml-foot">{p.name} 大概 {pace.note}后回信</p>
    <div className="rowbtn center"><button className="linkish" onClick={keep} disabled={!t.trim()}>{edit?'改好了，先不寄':'只是写下来，不寄'}</button></div>
  </main>;
}

/* 读信 */
function Read({p,l,all,patch,drop,go,back}:{p:Persona;l:Letter;all:Letter[];patch:(id:string,x:Partial<Letter>)=>void;drop:(id:string)=>void;go:(v:View,swap?:boolean)=>void;back:()=>void}){
  const me=S().prefs,his=l.from==='ta';
  const [sealed,setSealed]=useState(his&&!l.read),[fresh,setFresh]=useState(false),[sure,setSure]=useState(false),[pic,setPic]=useState<{url:string;file:File}|null>(null),[drawing,setDrawing]=useState(false),[more,setMore]=useState(false),[whole,setWhole]=useState(false);
  const [zoom,setZoom]=useState(false);
  useEffect(()=>()=>{if(pic)URL.revokeObjectURL(pic.url);},[pic]);
  const i=all.findIndex(x=>x.id===l.id),older=all[i-1],newer=all[i+1];
  const turn=(to?:Letter)=>{if(to)go({k:'read',id:to.id},true);};
  // 电脑上：← → 翻信，Esc 回信箱（开着弹层、正在打字时不管）
  useEffect(()=>{const on=(e:KeyboardEvent)=>{
    if(document.querySelector('.veil')||/^(INPUT|TEXTAREA)$/.test((e.target as HTMLElement)?.tagName??''))return;
    if(e.key==='ArrowLeft')turn(older);else if(e.key==='ArrowRight')turn(newer);else if(e.key==='Escape')back();
  };addEventListener('keydown',on);return()=>removeEventListener('keydown',on);},[older?.id,newer?.id]);
  // 手机上：左右滑翻信。从屏幕最左边起的滑动留给系统的返回手势
  const sw=useRef<{x:number;y:number}|null>(null);
  const touchStart=(e:React.TouchEvent)=>{const t=e.touches[0];sw.current=e.touches.length===1&&t.clientX>28?{x:t.clientX,y:t.clientY}:null;};
  const touchEnd=(e:React.TouchEvent)=>{const a=sw.current,t=e.changedTouches[0];sw.current=null;if(!a||sealed||document.querySelector('.veil')||window.getSelection()?.toString())return;
    const dx=t.clientX-a.x,dy=t.clientY-a.y;if(Math.abs(dx)>64&&Math.abs(dx)>Math.abs(dy)*2)turn(dx<0?newer:older);};
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
  return <main className="page sub ml" style={{'--accent':p.accent} as React.CSSProperties} onTouchStart={touchStart} onTouchEnd={touchEnd}>
    <header className="bar"><button className="ico" onClick={back} aria-label="回到信箱"><ChevronLeft size={28} strokeWidth={1.8}/></button><h1>{his?`${p.name} 的来信`:l.kept?'没寄出的信':`寄给 ${p.name}`}</h1>
      {!sealed&&<><button className="ico" onClick={()=>patch(l.id,{star:!l.star})} aria-label={l.star?'取消收藏':'收藏这封信'} aria-pressed={!!l.star}><Bookmark size={22} strokeWidth={1.7} fill={l.star?'currentColor':'none'}/></button>
        <button className="ico" onClick={()=>{setSure(false);setMore(true);}} aria-label="更多"><Ellipsis size={23} strokeWidth={1.7}/></button></>}</header>
    {sealed?<div className="ml-sealed">
      <button className="ml-big" onClick={unseal} aria-label="拆开这封信"><span className="ml-from">致 {callOf(p)}</span><i aria-hidden="true"/><Post top="已送达" t={l.at}/></button>
      <p>{near(l.at)}送到的{l.pro?'，是他主动写来的':''}</p>
      <button className="btn" onClick={unseal}>拆开这封信</button>
    </div>:<>
      {orig&&<button className={`ml-orig${whole?' open':''}`} onClick={()=>setWhole(v=>!v)} aria-expanded={whole}><small>{his?'你的原信':orig.from==='ta'?`回的是 ${p.name} 的这封信`:'接着这封信写的'}</small><span>{orig.text}</span></button>}
      <article className={`ml-paper${fresh?' fresh':''}`}>
        <Post top={stamp} t={l.at}/>
        <time>{full(l.at)}</time>
        <p className="ml-dear">{dear}</p>
        {l.img&&<button className="ml-photo" onClick={()=>setZoom(true)} aria-label="夹在信里的照片，点开看大图"><Pic id={l.img} alt="夹在信里的照片"/></button>}
        <div className="ml-body">{l.text}</div>
        <p className="ml-sign">{sign}</p>
      </article>
      {!his&&(reply?<button className="ml-next" onClick={()=>go({k:'read',id:reply.id},true)}>{p.name} 回信了，去看</button>:waiting(l)?<p className="ml-way" role="status">{p.name} 的回信在路上</p>:null)}
      {his?<AiBlock name={p.name} noBio={!p.bio&&!box(p.id).tarotAbout} build={build} saved={l.ai??''} save={t=>patch(l.id,{ai:t})} label="解读这封信" setup={'#/f/draw/'+p.id} auto={fresh&&dsAuto()}>
        <button className="chip" onClick={()=>go({k:'write',re:l.id})}>回信</button>
      </AiBlock>:<div className="rowbtn ml-acts">
        {l.kept&&<button className="chip on" onClick={()=>{const n=sendLetter(p,l.text,l.re);const now=box(p.id);setBox(p.id,{letters:now.letters.filter(x=>x.id!==l.id),mailGone:[...(now.mailGone??[]),l.id].slice(-400)});go({k:'read',id:n.id},true);say('寄出去了');}}>现在寄出</button>}
        {l.kept&&<button className="chip" onClick={()=>go({k:'write',edit:l.id})}>接着改</button>}
        {!l.kept&&<button className="chip" onClick={()=>go({k:'write',re:l.id})}>接着写一封</button>}
      </div>}
      {(older||newer)&&<nav className="ml-turn" aria-label="翻信">
        {older?<button className="linkish" onClick={()=>turn(older)}>‹ 上一封</button>:<span/>}
        {newer?<button className="linkish" onClick={()=>turn(newer)}>下一封 ›</button>:<span/>}
      </nav>}
    </>}
    {zoom&&l.img&&<Over><button className="viewer" onClick={()=>setZoom(false)} aria-label="关掉大图"><Pic id={l.img} alt="夹在信里的照片"/></button></Over>}
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
