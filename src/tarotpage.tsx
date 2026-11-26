import {useEffect,useMemo,useRef,useState} from 'react';
import {Anchor,BellRing,BookOpen,ChevronLeft,ChevronsUp,Crown,Droplets,Feather,Flower2,Globe,Heart,Infinity as InfinityIcon,KeyRound,Lamp,Leaf,Link as LinkIcon,Moon,MoonStar,Orbit,Scale,Shuffle,
  Star,Sun,Sword,Trash2,Wand,WandSparkles,Wine,Zap,type LucideIcon} from 'lucide-react';
import {S,addPack,box,pushMsg,putImage,setBox,setPack,uid,useVer,type Persona,type Reading} from './db';
import {lines,sent} from './engine';
import {Avatar,Pic,dayLabel} from './App';
import {Sheet,Switch,say} from './pages';
import {Sub} from './more';
import {aiBase,aiHand,aiProv,bestOf,hands,modelChosen,onPhone,provs,setAiBase,setAiHand,setAiProv,DEFAULT_PROMPT,dsAuto,dsChat,dsKey,dsModel,dsModels,dsPrompt,promptEdited,setDsAuto,setDsKey,setDsModel,setDsPrompt,type Msg as AiMsg} from './ai';
import {TOTAL,askKinds,asks,cards,groups,markOf,shuffleWithout,spreads,suitOf,toneOf,voiceAt,type AskKind,type Drawn,type SpreadId} from './tarot';
import {aspectAt,facets,flowOf,guide,mj,readAt,type Aspect} from './tarotmj';

const ymd=(d=new Date())=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

/* ── 牌面 ──
   内置的是一套线条牌面（角上是数字，中间一个图形，底下是牌名）。
   也可以换成自己的牌面图：图存在你的数据里（一个只给塔罗用的图片分组），跟着同步走 */
const major:LucideIcon[]=[Feather,WandSparkles,Moon,Flower2,Crown,KeyRound,Heart,ChevronsUp,InfinityIcon,Lamp,Orbit,Scale,Anchor,Leaf,Droplets,LinkIcon,Zap,Star,MoonStar,Sun,BellRing,Globe];
const Coin=({size=24,strokeWidth=1.3}:{size?:number;strokeWidth?:number})=><svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
  <circle cx="12" cy="12" r="9.5"/><path d="M12 6.4l1.7 3.5 3.8.5-2.8 2.7.7 3.8-3.4-1.8-3.4 1.8.7-3.8-2.8-2.7 3.8-.5z"/></svg>;
const suits=[Wand,Wine,Sword] as const;
const Glyph=({c,size}:{c:number;size:number})=>{
  const s=suitOf(c);
  if(s===3)return <Coin size={size}/>;
  const I=s<0?major[c]:suits[s];
  return <I size={size} strokeWidth={1.3} aria-hidden="true"/>;
};
const facePack=()=>(S().packs??[]).find(k=>k.use==='tarot');
const faceId=(c:number)=>facePack()?.ids[c]||'';
function setFaces(ids:string[]){
  const k=facePack();
  if(k)setPack(k.id,{ids});
  else{const n=addPack('塔罗牌面',[]);setPack(n.id,{use:'tarot',his:false,ids});}
}
const hasFaces=()=>!!facePack()?.ids.some(Boolean);

function Face({c,r}:{c:number;r?:boolean}){
  const id=faceId(c);
  return <span className={`tr-face${r?' rev':''}`}>
    <span className="tr-art"><small>{markOf(c)}</small><Glyph c={c} size={30}/><b>{cards[c].name}</b></span>
    {id&&<Pic id={id} className="tr-img"/>}
  </span>;
}
const Back=()=><span className="tr-back" aria-hidden="true"><i/></span>;

/* ── 抽牌：洗牌 → 牌轮上选 ── */
const STEP=3.6;   // 牌轮上相邻两张差几度
// 洗牌时偶尔会有一张自己跳出来（跳牌）：算作他急着想说的，单独记着
const jumpChance=()=>{const w=(window as unknown as {__trJump?:number}).__trJump;return typeof w==='number'?w:.15;};
function Ritual({n,rev,done,what,pos,skip=[]}:{n:number;rev:boolean;done:(got:Drawn[],jump?:Drawn)=>void;what:string;pos?:string[];skip?:number[]}){
  const [deck,setDeck]=useState(()=>shuffleWithout(rev,skip));
  const N=deck.length;
  const [stage,setStage]=useState<'shuffle'|'pick'>('shuffle');
  const [round,setRound]=useState(0);
  const [took,setTook]=useState<number[]>([]);
  const [jump,setJump]=useState<number|null>(null);
  const jumpRef=useRef<number|null>(null);jumpRef.current=jump;
  const [mid,setMid]=useState(Math.round((N-1)/2));   // 正对着中间的是第几张（键盘抽牌用）
  const max=(N-1)/2*STEP;
  const wheelEl=useRef<HTMLDivElement>(null);
  // 牌轮转到几度。拖动时直接改样式，不经过重新渲染，手指走到哪牌就跟到哪
  const g=useRef({a:0,down:false,x:0,a0:0,moved:0,raf:0,trail:[] as [number,number][]});
  const tookRef=useRef(took);tookRef.current=took;
  const turn=(v:number)=>{
    const s=g.current;s.a=Math.max(-max,Math.min(max,v));
    if(wheelEl.current)wheelEl.current.style.transform=`rotate(${s.a}deg)`;
    return s.a;
  };
  const midOf=()=>Math.max(0,Math.min(N-1,Math.round((N-1)/2-g.current.a/STEP)));
  useEffect(()=>{const t=setTimeout(()=>{if(!skip.length&&Math.random()<jumpChance())setJump(Math.floor(Math.random()*N));setStage('pick');},1150);return()=>clearTimeout(t);},[round]);
  useEffect(()=>()=>cancelAnimationFrame(g.current.raf),[]);
  const again=()=>{if(took.length)return;cancelAnimationFrame(g.current.raf);setJump(null);g.current.a=0;setMid(Math.round((N-1)/2));setDeck(shuffleWithout(rev,skip));setStage('shuffle');setRound(x=>x+1);};
  const pick=(i:number)=>{
    const now=tookRef.current;
    if(now.includes(i)||now.length>=n||i===jumpRef.current)return;
    const next=[...now,i];tookRef.current=next;setTook(next);
    try{navigator.vibrate?.(8);}catch{/* 没有震动也行 */}
    if(next.length===n)setTimeout(()=>done(next.map(k=>deck[k]),jumpRef.current!==null?deck[jumpRef.current]:undefined),520);
  };
  // 牌跟着手指走：横向挪多少像素，牌轮就转过相应的角度
  const radius=()=>{const el=wheelEl.current;return el?parseFloat(getComputedStyle(el).getPropertyValue('--R'))||560:560;};
  const down=(e:React.PointerEvent)=>{
    const s=g.current;cancelAnimationFrame(s.raf);
    const R=radius();
    s.down=true;s.x=e.clientX;s.a0=s.a;s.moved=0;s.trail=[[performance.now(),s.a]];
    const move=(ev:PointerEvent)=>{
      if(!s.down)return;
      const dx=ev.clientX-s.x;
      s.moved=Math.max(s.moved,Math.abs(dx));
      s.trail.push([performance.now(),turn(s.a0+dx/R*57.3)]);if(s.trail.length>12)s.trail.shift();
    };
    const up=()=>{
      s.down=false;
      removeEventListener('pointermove',move);removeEventListener('pointerup',up);removeEventListener('pointercancel',up);
      // 松手后顺着惯性再滑一小段：看最后一百多毫秒里转了多少，算出速度（每帧最多两度多，不会一下甩到头）
      const now=performance.now(),from=s.trail.find(x=>now-x[0]<=140),last=s.trail[s.trail.length-1];
      let v=from&&last&&last[0]-from[0]>=24&&now-last[0]<70?Math.max(-2.2,Math.min(2.2,(last[1]-from[1])/(last[0]-from[0])*16)):0;
      const glide=()=>{const was=s.a;if(Math.abs(v)<.02||turn(was+v)===was){setMid(midOf());return;}v*=.94;s.raf=requestAnimationFrame(glide);};
      if(Math.abs(v)>.05)s.raf=requestAnimationFrame(glide);else setMid(midOf());
    };
    addEventListener('pointermove',move);addEventListener('pointerup',up);addEventListener('pointercancel',up);
  };
  const wheel=(e:React.WheelEvent)=>{const d=Math.abs(e.deltaX)>Math.abs(e.deltaY)?e.deltaX:e.deltaY;turn(g.current.a-d*.06);setMid(midOf());};
  const key=(e:React.KeyboardEvent)=>{
    if(e.key==='ArrowLeft'){e.preventDefault();turn(g.current.a+STEP);setMid(midOf());}
    else if(e.key==='ArrowRight'){e.preventDefault();turn(g.current.a-STEP);setMid(midOf());}
    else if(e.key==='Enter'||e.key===' '){
      // 正中间那张已经抽走了，就抽离它最近的一张
      e.preventDefault();const m=midOf(),free=deck.map((_,i)=>i).filter(i=>!tookRef.current.includes(i)&&i!==jumpRef.current).sort((x,y)=>Math.abs(x-m)-Math.abs(y-m))[0];if(free!==undefined)pick(free);
    }
  };
  const left=n-took.length;
  return <div className="tr-ritual">
    <div className="tr-slots" data-n={n} aria-label={`已经抽了 ${took.length} 张`}>
      {jump!==null&&stage==='pick'&&<span className="tr-slotcol jump"><span className="tr-slot has"><Back/></span><small>跳牌</small></span>}
      {Array.from({length:n},(_,i)=><span key={i} className={`tr-slotcol${i===took.length?' now':''}`}><span className={`tr-slot${i<took.length?' has':''}`}>{i<took.length&&<Back/>}</span>{pos&&n>1&&<small>{pos[i]}</small>}</span>)}
    </div>
    {stage==='shuffle'?<>
      <div className="tr-pile" key={round} aria-hidden="true">{Array.from({length:7},(_,i)=><span key={i} style={{'--i':i} as React.CSSProperties}><Back/></span>)}</div>
      <p className="tr-tip" role="status">正在洗牌…</p>
    </>:<>
      <p className="tr-tip" role="status">{jump!==null&&!took.length?'洗牌时跳出来一张，是他急着想说的。':''}{left<=0?'好了':pos&&n>1?`心里想着${what}，选一张给「${pos[took.length]}」`:`心里想着${what}，选 ${left} 张`}</p>
      <div className="tr-wheelbox" onPointerDown={down} onWheel={wheel} onKeyDown={key} tabIndex={0} role="group"
        aria-label={`牌轮，一共 ${N} 张。左右拖动或按方向键转动，点一张或按回车抽出正中间那张`}>
        <div className="tr-wheel" ref={wheelEl} style={{transform:`rotate(${g.current.a}deg)`}}>
          {deck.map((_,i)=><button key={i} tabIndex={-1} className={`tr-w${took.includes(i)||i===jump?' gone':''}${i===mid?' mid':''}`} aria-label={`第 ${i+1} 张`} disabled={took.includes(i)||i===jump||left<=0}
            style={{transform:`rotate(${(i-(N-1)/2)*STEP}deg) translateY(calc(var(--R) * -1))`}}
            onClick={()=>{if(g.current.moved<8)pick(i);}}><Back/></button>)}
        </div>
      </div>
      <div className="tr-under"><span>左右拖动</span>{!took.length&&<button className="linkish tr-again" onClick={again}><Shuffle size={14} strokeWidth={1.8}/>再洗一次</button>}</div>
    </>}
  </div>;
}

/* ── 一次的结果：牌、牌意（你们自己的在前）、他说的话和语气、你的感想 ── */
const posOf=(r:Reading,i:number)=>spreads[r.kind].pos[i]??'补牌';
const textOf=(r:Reading)=>`塔罗｜${r.q||spreads[r.kind].name}\n`+r.cards.map((d,i)=>`${posOf(r,i)}：${cards[d.c].name}（${d.r?'逆位':'正位'}）`).join('\n');
// 你们自己磨合出来的牌意：每位各自一份
function MineSheet({p,c,close}:{p:Persona;c:number;close:()=>void}){
  const mine=box(p.id).tarotMine??{};
  const [t,setT]=useState(mine[c]??'');
  return <Sheet title={`${cards[c].name} · 我们的牌意`} close={close}>
    <p className="hint first">和 {p.name} 聊多了，这张牌在你们之间会有自己的意思：指的是谁、他在做什么、什么心情、想说什么。写在这里，以后抽到这张会先显示你写的。</p>
    <textarea className="bulk tall" rows={5} value={t} onChange={e=>setT(e.target.value.slice(0,400))} placeholder={`比如：在我们这儿，这张是他在…\n行为 / 状态 / 地点 / 吃的，想到什么记什么`} aria-label="我们的牌意" autoFocus/>
    <button className="btn" onClick={()=>{setBox(p.id,{tarotMine:{...mine,[c]:t.trim()}});say(t.trim()?'记下了':'清掉了');close();}}>记下</button>
  </Sheet>;
}
// 不靠 AI 也能看的「合起来看」：逆位多不多、大牌多不多、哪种花色占上风
/** 读牌小抄：自己当传讯师时照着看 */
function GuideSheet({close}:{close:()=>void}){
  return <Sheet title="读牌小抄" close={close}><ol className="tr-guide">{guide.map(([t,x])=><li key={t}><b>{t}</b><p>{x}</p></li>)}</ol></Sheet>;
}
function sumOf(ds:Drawn[]):string[]{
  if(ds.length<2)return [];
  const out:string[]=[],revN=ds.filter(d=>d.r).length,big=ds.filter(d=>d.c<22).length;
  if(revN===0)out.push('全是正位：话说得直接。');else if(revN===ds.length)out.push('全是逆位：这次多半是往里收着说的，或者在说以前的事，逐张看。');else if(revN*2>ds.length)out.push('逆位偏多：他这次说得含蓄，逐张看。');
  if(big*2>=ds.length&&big>=2)out.push('大牌多：说的是要紧的事。');
  const n=[0,0,0,0];for(const d of ds){const k=suitOf(d.c);if(k>=0)n[k]++;}
  const top=Math.max(...n);
  if(top>=2&&n.filter(x=>x===top).length===1)out.push(['权杖多：重点在行动和热度。','圣杯多：重点在感情和心意。','宝剑多：重点在想法和怎么说。','星币多：重点在现实和过日子。'][n.indexOf(top)]);
  const flow=flowOf(ds);if(flow)out.push(flow);
  return out;
}
const fullText=(r:Reading)=>textOf(r)+(r.ai?'\n\n'+r.ai:'')+(r.note?'\n\n我的感想：'+r.note:'');
// 发给 AI 的内容：这一位是谁、问了什么、抽到什么、你们的专属牌意、暗号牌、这一场前面问过的、他的几句字卡（学语气用）
function askOf(p:Persona,r:Reading,recent:Reading[]):AiMsg[]{
  const b=box(p.id),mine=b.tarotMine??{},sign=new Set(b.tarotSign??[]),sp=spreads[r.kind];
  const card=(d:Drawn,label:string,i=-1)=>{const a=i>=0?readAt(d,aspectAt[r.kind][i]??'say'):null;
    return `【${label}】${cards[d.c].name}（${d.r?'逆位':'正位'}）｜画面：${mj[d.c].pic}｜常见含义：${(d.r?cards[d.c].rev:cards[d.c].up).join('、')}`+(a?`｜传讯读法（${a.label}）：${a.text}`:'')+(mine[d.c]?`｜我们的牌意：${mine[d.c]}`:'')+(sign.has(d.c)?'｜暗号牌':'');};
  const voice=lines(p,6);
  const u=[
    '【他的人设】（先读这一段，最后替他说话时照着它来）',
    `梦角：${p.name}${p.bio?'。'+p.bio:''}`,
    b.tarotAbout?`他的资料和说话习惯：${b.tarotAbout}`:'',
    voice.length?`他平时说话的样子（学语气用，不要照抄）：${voice.join(' / ')}`:'',
    `她的名字：${S().prefs.myName}`,
    '【这一次】',
    `牌阵：${sp.name}（${sp.pos.join('、')}）`,
    `她的问题：${r.q||(r.kind==='day'?'今天的一张牌：他今天想让她知道什么':r.kind==='match'?'开场对信息：请他用三张牌说说自己，看看连上的是不是他':r.kind==='link'?'看看这次连得怎么样：线上的气氛、她的状态、他的状态、他的第一句回应':'没有写问题，就是想听他说说话')}`,
    '牌：',...(r.jump?[card(r.jump,'跳牌')]:[]),...r.cards.map((d,i)=>card(d,posOf(r,i),i)),
    recent.length?'【这一场开场时抽的】（只当背景，不用再逐张解）\n'+recent.map(x=>`- ${spreads[x.kind].name}：${x.cards.map((d,i)=>`${posOf(x,i)} ${cards[d.c].name}${d.r?'（逆位）':''}`).join('，')}`).join('\n'):'',
  ].filter(Boolean).join('\n');
  return [{role:'system',content:dsPrompt()},{role:'user',content:u}];
}
// closedFrom：从第几张起还扣着（刚抽出来的是 0，补牌是原来的张数；不给就是全都翻开）
function Result({p,r,closedFrom,recent=[],onFlipped,onMore,onAgain,onNext,onSetup}:{p:Persona;r:Reading;closedFrom?:number;recent?:Reading[];onFlipped?:()=>void;onMore?:()=>void;onAgain?:()=>void;onNext?:()=>void;onSetup?:()=>void}){
  const sp=spreads[r.kind],bx=box(p.id),mine=bx.tarotMine??{},sign=new Set(bx.tarotSign??[]);
  // 跳牌排在最前面，后面是牌阵里的各个位置和补牌
  const items:{d:Drawn;label:string;a:Aspect}[]=[...(r.jump?[{d:r.jump,label:'跳牌',a:'say' as Aspect}]:[]),...r.cards.map((d,i)=>({d,label:posOf(r,i),a:aspectAt[r.kind][i]??'say'}))],off=r.jump?1:0;
  const [open,setOpen]=useState<boolean[]>(()=>items.map((_,i)=>closedFrom===undefined||(closedFrom>0&&i<closedFrom+off)));
  const [note,setNote]=useState(r.note??''),[writing,setWriting]=useState(false),[edit,setEdit]=useState<number|null>(null);
  const [ai,setAi]=useState(r.ai??''),[busy,setBusy]=useState(false),[err,setErr]=useState(''),[tips,setTips]=useState(false),[hand,setHand]=useState(false),[back,setBack]=useState(''),[carried,setCarried]=useState('');
  const ctl=useRef<AbortController|null>(null);
  useEffect(()=>()=>ctl.current?.abort(),[]);
  const isOpen=(i:number)=>open[i]??false,all=items.every((_,i)=>isOpen(i));
  const patch=(x:Partial<Reading>)=>setBox(p.id,{tarot:(box(p.id).tarot??[]).map(y=>y.id===r.id?{...y,...x}:y)});
  const read=async()=>{
    if(!dsKey()){void carry();return;}
    ctl.current?.abort();const c=ctl.current=new AbortController();
    setBusy(true);setErr('');setAi('');
    try{const t=await dsChat(askOf(p,r,recent),setAi,c.signal);setAi(t);patch({ai:t});}
    catch(e){if((e as Error)?.name!=='AbortError'){setErr((e as Error)?.message||'这次没解出来，再试一次');setAi(r.ai??'');}}
    finally{if(ctl.current===c)setBusy(false);}
  };
  // 不花钱的那条路：把指令、问题和牌复制好，带去聊天 App 里问，再把回答贴回来
  // 带过去的内容一场只拼一次（里面他的几句字卡是随机挑的，重拼会变）
  const H=aiHand(),carryText=()=>{if(carried)return carried;const m=askOf(p,r,recent),t=m[0].content+'\n\n——\n'+m[1].content;setCarried(t);return t;};
  const carry=async()=>{
    const t=carryText();setHand(true);
    try{await navigator.clipboard.writeText(t);say(`复制好了，去 ${H.name} 贴上发送`);}catch{say('这里不让自动复制：点开「看要带过去的内容」，长按全选复制');}
  };
  const pasteBack=async()=>{
    try{const t=(await navigator.clipboard.readText()).trim();if(!t)say('剪贴板是空的');else if(t===carried.trim())say(`剪贴板里还是带过去的内容，先去复制 ${H.name} 的回答`);else setBack(t);}
    catch{say('这里不让读剪贴板：长按上面的框，自己贴上');}
  };
  // 点了「打开 App」两秒后人还在这页：多半是没装，提醒一下旁边有网页版
  const jumped=()=>{setTimeout(()=>{if(document.visibilityState==='visible'&&document.hasFocus())say(`没跳到 ${H.name} App？点旁边的「网页版」`);},2200);};
  const keep=()=>{const t=back.trim();if(!t)return;setAi(t);setErr('');patch({ai:t});setBack('');setHand(false);say('存进这次的记录了');};
  const flip=(i:number)=>{
    if(isOpen(i))return;const next=items.map((_,k)=>k===i?true:isOpen(k));setOpen(next);
    // 最后一张翻开：接了 AI 的话直接开始解
    if(next.every(Boolean)){onFlipped?.();if(dsKey()&&dsAuto())void read();}
  };
  const tell=()=>{
    if(r.sent)return;
    pushMsg({pid:p.id,from:'me',kind:'text',text:textOf(r),at:Date.now()});sent(p.id);patch({sent:true});say('发到聊天里了');
  };
  const copy=async()=>{try{await navigator.clipboard.writeText(fullText({...r,ai:ai||r.ai}));say('复制好了');}catch{say('这个浏览器不让复制，长按文字自己选吧');}};
  const voice=r.cards[voiceAt[r.kind]]??r.cards[0],extra=r.cards.length-sp.pos.length,sum=all?sumOf(items.map(x=>x.d)):[];
  return <div className="tr-result">
    {r.q&&<p className="tr-q">{r.q}</p>}
    <div className="tr-spread" data-n={items.length}>
      {items.map(({d,label},i)=><div key={i} className="tr-col">
        <small>{label}</small>
        <button className={`tr-card${isOpen(i)?' open':''}`} onClick={()=>flip(i)} disabled={isOpen(i)} aria-label={isOpen(i)?`${label}：${cards[d.c].name}，${d.r?'逆位':'正位'}`:`翻开${label}这张`}>
          <span className="tr-flip"><span className="tr-side tr-b"><Back/></span><span className="tr-side tr-f"><Face c={d.c} r={d.r}/></span></span>
        </button>
      </div>)}
    </div>
    {!all&&<p className="tr-tip" role="status">轻触翻开</p>}
    <ol className="tr-read">
      {items.map(({d,label,a},i)=>{if(!isOpen(i))return null;const at=readAt(d,a);return <li key={i}>
        <header><small>{label}</small><b>{cards[d.c].name}</b><i className={d.r?'rev':''}>{d.r?'逆位':'正位'}</i>{sign.has(d.c)&&<i className="sign">暗号牌</i>}
          <button className="linkish" onClick={()=>setEdit(d.c)}>{mine[d.c]?'改我们的牌意':'写我们的牌意'}</button></header>
        {mine[d.c]&&<p className="tr-mine"><small>我们的牌意</small>{mine[d.c]}</p>}
        <p className="tr-pic">{mj[d.c].pic}</p>
        {at&&<p className="tr-at"><small>{at.label}</small>{at.text}</p>}
        <p className="tr-keys">{(d.r?cards[d.c].rev:cards[d.c].up).join(' · ')}</p>
        {!at&&<p className="tr-line">{d.r?cards[d.c].revLine:cards[d.c].upLine}</p>}
        {label==='跳牌'&&<p className="tr-link">洗牌时自己跳出来的：他急着想让你知道的。</p>}
        <details className="tr-more"><summary>这张牌的其他读法</summary><dl>{[...(at&&a!=='me'?[['一句话',d.r?cards[d.c].revLine:cards[d.c].upLine] as [string,string]]:[]),...facets(d.c)].map(([k,v])=><div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl></details>
      </li>;})}
    </ol>
    {items.some((x,i)=>isOpen(i))&&<p className="tr-revtip">{items.some((x,i)=>isOpen(i)&&x.d.r)&&'有逆位：不等于不好，也不一定是不顺。看这张牌自己的逆位读法，拿不准就补一张。'}<button className="linkish" onClick={()=>setTips(true)}>读牌小抄</button></p>}
    {all&&<>
      {items.some(x=>sign.has(x.d.c))&&<p className="tr-signed">他的暗号牌出现了：是他。</p>}
      {sum.length>0&&<p className="tr-sum"><small>合起来看</small>{sum.join('')}</p>}
      {r.said&&<div className="said"><Avatar id={p.avatar} name={p.name} size={28}/><div><span>{r.said}</span>{voice&&<small className="tr-tone">语气 · {toneOf(voice)}</small>}</div></div>}
      {(ai||busy||err)&&<section className="tr-ai" aria-live="polite" aria-busy={busy}>
        <h4>解读<small>当作参考，以你自己的感觉为准</small></h4>
        {ai?<p>{ai}</p>:busy&&<p className="tr-wait">正在读牌…</p>}
        {err&&<p className="tr-err" role="alert">{err}</p>}
      </section>}
      {r.kind==='match'&&(r.ok===undefined?<div className="tr-ok"><p>这几张说的，像他吗？<small>三张里有两张像，就算对上了。</small></p>
        <div className="rowbtn"><button className="chip on" onClick={()=>patch({ok:true})}>对上了，是他</button><button className="chip" onClick={()=>patch({ok:false})}>没对上</button></div></div>
        :r.ok?<div className="tr-okd"><p>对上了，是他。</p>{onNext&&<button className="btn" onClick={onNext}>开始问他</button>}</div>
        :<div className="tr-okd"><p>{onAgain?'这次没对上。静一静，再连一次。':'这次没对上。先到这儿吧，心静下来换个时间再连，不用为了连上反复抽。'}</p>{onAgain&&<button className="chip" onClick={onAgain}>再连一次</button>}</div>)}
      {r.note&&!writing&&<p className="tr-note"><small>我的感想</small>{r.note}</p>}
      {writing&&<div className="tr-write">
        <textarea className="bulk" rows={3} value={note} onChange={e=>setNote(e.target.value)} placeholder="看到这几张牌，想到了什么" aria-label="我的感想" autoFocus/>
        <div className="rowbtn"><button className="chip on" onClick={()=>{patch({note:note.trim()||undefined});setWriting(false);}}>记下</button><button className="chip" onClick={()=>{setNote(r.note??'');setWriting(false);}}>算了</button></div>
      </div>}
      {hand&&<section className="tr-hand">
        <h4>带去 {H.name} 解<small>不用密钥，不花钱</small></h4>
        <ol><li>这次的问题、牌、读法、{p.name} 的人设和解牌的指令已经复制好了。</li><li>打开 {H.name}，新开一个对话，贴上发送。</li><li>把它的回答复制回来，贴在下面，存进这次的记录。</li></ol>
        <div className="rowbtn">
          {onPhone()&&!H.app.startsWith('http')?<><a className="chip on" href={H.app} onClick={jumped}>打开 {H.name} App</a><a className="chip" href={H.url} target="_blank" rel="noopener noreferrer">网页版</a></>
            :<a className="chip on" href={onPhone()?H.app:H.url} target="_blank" rel="noopener noreferrer">打开 {H.name}{onPhone()?' App':''}</a>}
          <button className="chip" onClick={()=>void carry()}>再复制一次</button></div>
        {!p.bio&&!box(p.id).tarotAbout&&onSetup&&<button className="linkish tr-auto" onClick={onSetup}>还没写 {p.name} 的资料，AI 学不了他的口吻。去牌库写几句</button>}
        <textarea className="bulk" rows={4} value={back} onChange={e=>setBack(e.target.value)} placeholder={`把 ${H.name} 的回答贴在这里`} aria-label="贴回来的解读"/>
        <div className="rowbtn"><button className="chip" onClick={()=>void pasteBack()}>从剪贴板贴上</button><button className="chip on" disabled={!back.trim()} onClick={keep}>存进记录</button><button className="chip" onClick={()=>setHand(false)}>先不了</button></div>
        <details className="tr-more"><summary>看要带过去的内容</summary><textarea className="bulk" rows={6} readOnly value={carried} aria-label="带过去的内容"/></details>
        {onSetup&&<button className="linkish tr-auto" onClick={onSetup}>想翻开就自动解、不用切 App？去牌库接一个免费的接口</button>}
      </section>}
      {!writing&&<div className="rowbtn tr-acts">
        <button className="chip" onClick={()=>void read()} disabled={busy}>{busy?'正在读牌…':dsKey()?(ai?'重新解读':'AI 解牌'):`带去 ${H.name} 解`}</button>
        {dsKey()&&err&&!hand&&<button className="chip" onClick={()=>void carry()}>带去 {H.name} 解</button>}
        {onMore&&r.kind!=='day'&&extra<2&&<button className="chip" onClick={onMore} disabled={busy}>补一张</button>}
        {r.sent?<a className="chip" href={'#/c/'+p.id}>去聊天看看</a>:<button className="chip" onClick={tell}>发到聊天</button>}
        <button className="chip" onClick={()=>setWriting(true)}>{r.note?'改感想':'写一句感想'}</button>
        <button className="chip" onClick={()=>void copy()}>复制</button>
      </div>}
    </>}
    {edit!==null&&<MineSheet p={p} c={edit} close={()=>setEdit(null)}/>}
    {tips&&<GuideSheet close={()=>setTips(false)}/>}
  </div>;
}

/* ── 牌库：78 张的牌意，换牌面 ── */
function Library({p,close}:{p:Persona;close:()=>void}){
  const b=box(p.id);
  const [see,setSee]=useState<number|null>(null),[busy,setBusy]=useState(''),[edit,setEdit]=useState<number|null>(null),[tips,setTips]=useState(false);
  const mine=b.tarotMine??{},sign=b.tarotSign??[];
  const toggleSign=(cs:number[])=>{const on=cs.every(c=>sign.includes(c));setBox(p.id,{tarotSign:on?sign.filter(c=>!cs.includes(c)):[...new Set([...sign,...cs])]});};
  // AI 解牌的设置。密钥只在这台设备上
  const [prov,setProv]=useState(aiProv().id),[hand,setHand]=useState(aiHand().id),[base,setBase]=useState(aiBase());
  const [key,setKey]=useState(dsKey()),[typed,setTyped]=useState(''),[models,setModels]=useState<string[]>([]),[model,setModel]=useState(dsModel()),[auto,setAuto]=useState(dsAuto()),[linking,setLinking]=useState(false);
  const [about,setAbout]=useState(b.tarotAbout??''),[showP,setShowP]=useState(false),[pr,setPr]=useState(dsPrompt());
  const pv=provs.find(x=>x.id===prov)??provs[0];
  useEffect(()=>{if(key)void dsModels(key).then(setModels).catch(()=>{});},[key,prov]);
  const pickProv=(id:string)=>{setAiProv(id);setProv(id);setKey(dsKey());setModel(dsModel());setModels([]);setTyped('');setBase(aiBase());};
  const link=async()=>{const k=typed.trim();if(!k||linking)return;setLinking(true);
    try{const ms=await dsModels(k);setDsKey(k);setKey(k);setTyped('');setModels(ms);if(ms.length&&(!modelChosen()||!ms.includes(dsModel()))){const m=bestOf(ms);setDsModel(m);setModel(m);}say('接上了。以后翻开牌就会自动解读');}
    catch(e){say((e as Error).message);}
    setLinking(false);};
  const one=useRef<HTMLInputElement>(null),many=useRef<HTMLInputElement>(null);
  const change=async(c:number,f?:File)=>{
    if(!f)return;
    try{const id=await putImage(f,640,.82);const ids=Array.from({length:TOTAL},(_,i)=>faceId(i));ids[c]=id;setFaces(ids);say('换好了');}
    catch{say('这张图片读不了，换一张试试');}
  };
  const bulk=async(fs:FileList|null)=>{
    const list=Array.from(fs??[]).filter(f=>f.type.startsWith('image/')).sort((x,y)=>x.name.localeCompare(y.name,undefined,{numeric:true}));
    if(!list.length)return;
    if(list.length!==TOTAL){say(`选了 ${list.length} 张，一整套要正好 ${TOTAL} 张`);return;}
    const ids:string[]=[];
    try{
      for(let i=0;i<list.length;i++){setBusy(`正在放入 ${i+1} / ${TOTAL}`);ids.push(await putImage(list[i],640,.82));}
      setFaces(ids);say('整套牌面换好了');
    }catch{say('有图片没放进去，这次没有换');}
    setBusy('');
  };
  return <>
    <header className="bar"><button className="ico" onClick={close} aria-label="回到塔罗"><ChevronLeft size={28} strokeWidth={1.8}/></button><h1>牌库</h1><button className="linkish tr-guidebtn" onClick={()=>setTips(true)}>读牌小抄</button></header>
    {tips&&<GuideSheet close={()=>setTips(false)}/>}
    <Switch on={b.tarotRev!==false} set={v=>setBox(p.id,{tarotRev:v})} label="也抽逆位" note="关掉的话，抽到的牌都按正位来读"/>
    <h3>AI 解牌</h3>
    <p className="hint">两种用法，都会带上你的问题、抽到的牌和传讯读法，最后用 {p.name} 的口吻对你说几句。</p>
    <h4 className="tr-h4">不花钱 · 带去聊天 App<small>不用密钥</small></h4>
    <p className="hint">翻开牌后点「带去 {hands.find(x=>x.id===hand)?.name} 解」：内容会自动复制好，打开它免费的网页或 App 贴上发送，再把回答贴回来，就存进这次的记录里。这些 App 的免费聊天不对外开放接口，所以只能这样带过去，要切一下 App。</p>
    <div className="chips" role="radiogroup" aria-label="带去哪个 App">{hands.map(h=><button key={h.id} role="radio" aria-checked={hand===h.id} aria-pressed={hand===h.id} className="chip" onClick={()=>{setAiHand(h.id);setHand(h.id);}}>{h.name}</button>)}</div>
    <h4 className="tr-h4">自动解 · 接一个接口<small>不用切 App</small></h4>
    <p className="hint">接上以后，牌一翻开就在这里直接解。接口都要一把密钥；选免费的服务就不花钱。密钥只存在这台设备上，不同步、不进代码；每台设备各填一次。</p>
    <div className="chips" role="radiogroup" aria-label="用哪个服务">{provs.map(x=><button key={x.id} role="radio" aria-checked={prov===x.id} aria-pressed={prov===x.id} className="chip" onClick={()=>pickProv(x.id)}>{x.name}{x.id==='deepseek'&&'（收费）'}</button>)}</div>
    <p className="hint tr-pnote">{pv.note}{pv.keyAt&&<>。密钥在 <b>{pv.keyAt}</b> 里创建</>}</p>
    {prov==='custom'&&<input className="tr-base" value={base} onChange={e=>setBase(e.target.value)} onBlur={()=>setAiBase(base)} placeholder="接口地址，比如 https://api.xxx.com/v1" autoComplete="off" autoCapitalize="off" spellCheck={false} inputMode="url" aria-label="接口地址"/>}
    {key?<>
      <div className="line"><span>{pv.name}<small>已经接上{model?' · '+model:''}</small></span><button className="chip" onClick={()=>{setDsKey('');setKey('');setModels([]);}}>换密钥</button></div>
      <Switch on={auto} set={v=>{setDsAuto(v);setAuto(v);}} label="翻开就自动解牌" note="关掉的话，要解的时候自己点「AI 解牌」"/>
      {models.length>1&&<div className="chips tr-models" role="radiogroup" aria-label="用哪个型号">{models.map(m=><button key={m} role="radio" aria-checked={model===m} aria-pressed={model===m} className="chip" onClick={()=>{setDsModel(m);setModel(m);}}>{m}</button>)}</div>}
      {prov==='custom'&&models.length<=1&&<input className="tr-base" defaultValue={model} onBlur={e=>{setDsModel(e.target.value);setModel(e.target.value.trim());}} placeholder="型号的名字" autoComplete="off" autoCapitalize="off" spellCheck={false} aria-label="型号"/>}
    </>:<div className="newdeck"><input type="password" value={typed} onChange={e=>setTyped(e.target.value)} placeholder={`${pv.id==='custom'?'这个服务':pv.name.split(' ')[0]} 的 API 密钥`} autoComplete="off" autoCapitalize="off" spellCheck={false} aria-label="接口的密钥"/>
      <button className="btn" disabled={!typed.trim()||linking||(prov==='custom'&&!base.trim())} onClick={()=>{if(prov==='custom')setAiBase(base);void link();}}>{linking?'正在连…':'接上'}</button></div>}
    <label className="tr-field"><span>{p.name} 的资料<small>他是谁、什么性格、怎么说话、怎么叫你。AI 会照着这个来学他的口吻；他的字卡也会自动带几句过去</small></span>
      <textarea className="bulk" rows={4} value={about} onChange={e=>setAbout(e.target.value.slice(0,1500))} onBlur={()=>{if(about.trim()!==(b.tarotAbout??''))setBox(p.id,{tarotAbout:about.trim()});}} placeholder="比如：出自哪部作品，冷淡但护短，说话短、不爱用语气词，叫我「小朋友」" aria-label="他的资料"/></label>
    <div className="rowbtn"><button className="linkish" aria-expanded={showP} onClick={()=>setShowP(v=>!v)}>{showP?'收起解牌的指令':'看看解牌的指令'}</button></div>
    {showP&&<div className="tr-prompt">
      <textarea className="bulk" rows={12} value={pr} onChange={e=>setPr(e.target.value)} aria-label="解牌的指令"/>
      <div className="rowbtn"><button className="chip on" onClick={()=>{setDsPrompt(pr);say('指令存好了');}}>存下来</button>{(promptEdited()||pr!==DEFAULT_PROMPT)&&<button className="chip" onClick={()=>{setDsPrompt('');setPr(DEFAULT_PROMPT);say('换回默认的指令了');}}>用回默认的</button>}</div>
    </div>}
    <h3>暗号牌</h3>
    <p className="hint">和 {p.name} 约好的记号：抽到暗号牌，就当作是他来了。可以整组设（比如他是火象就设权杖），也可以点开某一张单独设。{sign.length?`现在设了 ${sign.length} 张。`:''}</p>
    <h3>牌面</h3>
    <p className="hint">{hasFaces()?'现在用的是你自己的牌面。':'现在用的是内置的线条牌面。'}想用别的，可以一次选一整套 {TOTAL} 张图（按文件名排序：大阿卡纳 0–21，然后权杖、圣杯、宝剑、星币各 14 张），也可以点开某一张单独换。</p>
    <div className="rowbtn">
      <button className="chip" disabled={!!busy} onClick={()=>many.current?.click()}>{busy||'换一整套牌面'}</button>
      {hasFaces()&&!busy&&<button className="chip" onClick={()=>{setFaces([]);say('换回内置牌面了');}}>用回内置牌面</button>}
    </div>
    <input ref={many} type="file" accept="image/*" multiple hidden onChange={e=>{void bulk(e.target.files);e.target.value='';}} aria-label="选一整套牌面图"/>
    {groups.map(gr=><section key={gr.name} className="tr-group">
      <h3>{gr.name}<button className="linkish" onClick={()=>toggleSign(Array.from({length:gr.to-gr.from},(_,k)=>gr.from+k))}>{Array.from({length:gr.to-gr.from},(_,k)=>gr.from+k).every(c=>sign.includes(c))?'取消整组暗号':'整组设为暗号'}</button></h3>
      <div className="tr-grid">{Array.from({length:gr.to-gr.from},(_,k)=>gr.from+k).map(c=><button key={c} className={(mine[c]?'mine':'')+(sign.includes(c)?' sign':'')} onClick={()=>setSee(c)} aria-label={cards[c].name+(mine[c]?'，写了我们的牌意':'')+(sign.includes(c)?'，暗号牌':'')}><Face c={c}/></button>)}</div>
    </section>)}
    {see!==null&&<Sheet title={cards[see].name} close={()=>setSee(null)}>
      <div className="tr-detail">
        <span className="tr-big"><Face c={see}/></span>
        <dl>
          <dt>正位</dt><dd><span className="tr-keys">{cards[see].up.join(' · ')}</span>{cards[see].upLine}</dd>
          <dt>逆位</dt><dd><span className="tr-keys">{cards[see].rev.join(' · ')}</span>{cards[see].revLine}</dd>
        </dl>
      </div>
      <p className="tr-pic">{mj[see].pic}</p>
      <dl className="tr-facets">{facets(see).map(([k,v])=><div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
      {mine[see]&&<p className="tr-mine"><small>我们的牌意</small>{mine[see]}</p>}
      <div className="rowbtn">
        <button className="chip" onClick={()=>setEdit(see)}>{mine[see]?'改我们的牌意':'写我们的牌意'}</button>
        <button className="chip" aria-pressed={sign.includes(see)} onClick={()=>toggleSign([see])}>{sign.includes(see)?'取消暗号牌':'设为暗号牌'}</button>
        <button className="chip" onClick={()=>one.current?.click()}>换这张的牌面</button>
        {faceId(see)&&<button className="chip" onClick={()=>{const ids=Array.from({length:TOTAL},(_,i)=>faceId(i));ids[see]='';setFaces(ids);}}>这张用回内置的</button>}
      </div>
      <input ref={one} type="file" accept="image/*" hidden onChange={e=>{const f=e.target.files?.[0];e.target.value='';void change(see,f);}} aria-label="选这张牌的牌面图"/>
    </Sheet>}
    {edit!==null&&<MineSheet p={p} c={edit} close={()=>setEdit(null)}/>}
  </>;
}

/* ── 塔罗 ── */
type Tab='day'|'ask'|'log';
/** 上次问问题用的牌阵（开场的对一对不算） */
const lastKind=():AskKind=>{try{const k=localStorage.getItem('cx-tarot-kind') as AskKind|null;if(k&&k!=='match'&&askKinds.includes(k))return k;}catch{/* */}return 'one';};
const SIT=2*3600e3;   // 两小时内算同一场
export function TarotPage({p}:{p:Persona}){
  useVer();
  const b=box(p.id),all=b.tarot??[],rev=b.tarotRev!==false,today=ymd();
  const [tab,setTab]=useState<Tab>('day'),[lib,setLib]=useState(false);
  // 这一场开过场了吗（两小时内对上过）。没开过就先停在「对一对」上；对了两次都没对上，就不再催着连
  const now=Date.now(),opened=all.some(r=>r.kind==='match'&&r.ok&&now-r.at<SIT),missN=all.filter(r=>r.kind==='match'&&r.ok===false&&now-r.at<SIT).length;
  const [q,setQ]=useState(''),[kind,setKind]=useState<AskKind>(()=>opened||missN>=2?lastKind():'match');
  const [going,setGoing]=useState<SpreadId|null>(null);     // 正在抽的是哪种牌阵
  const [more,setMore]=useState('');                        // 正在给哪一次补牌
  const [fresh,setFresh0]=useState<{id:string;from:number}|null>(null);   // 哪一次还有牌扣着、从第几张起
  const setFresh=(id:string,from=0)=>setFresh0(id?{id,from}:null),closed=(id:string)=>fresh?.id===id?fresh.from:undefined;
  const [shown,setShown]=useState('');                      // 「问他」里正在看的那一次
  const [see,setSee]=useState<Reading|null>(null),[sure,setSure]=useState(false);
  const dayRec=all.find(r=>r.kind==='day'&&r.date===today);
  const askRec=all.find(r=>r.id===shown);
  const tips=useMemo(()=>[...asks].sort(()=>Math.random()-.5).slice(0,3),[shown]);
  const save=(k:SpreadId,got:Drawn[],jump?:Drawn)=>{
    const ask=q.trim();
    const r:Reading={id:uid(),at:Date.now(),kind:k,cards:got,said:lines(p,1)[0],...(jump?{jump}:{}),...(k==='day'?{date:today}:ask&&k!=='match'?{q:ask}:{})};
    setBox(p.id,{tarot:[...(box(p.id).tarot??[]),r].slice(-300)});
    setFresh(r.id);setGoing(null);if(k!=='day'){setShown(r.id);setQ('');}
  };
  const add=(id:string,got:Drawn[])=>{const had=(box(p.id).tarot??[]).find(x=>x.id===id)?.cards.length??0;setBox(p.id,{tarot:(box(p.id).tarot??[]).map(x=>x.id===id?{...x,cards:[...x.cards,...got]}:x)});setFresh(id,had);setMore('');};
  const drop=(r:Reading)=>{const now=box(p.id);setBox(p.id,{tarot:(now.tarot??[]).filter(x=>x.id!==r.id),tarotGone:[...(now.tarotGone??[]),r.id].slice(-400)});setSee(null);setSure(false);if(shown===r.id)setShown('');};
  // 这一场前面问过的（两小时内、最近三次）：AI 解牌时带上，这次就是接着往下说
  // 解牌时带上的背景：只有这一场开场的对一对、连线（各取最近一次，没对上的不带）。之前问过的别的问题不带
  const recentOf=(r:Reading)=>{
    if(r.kind==='day'||r.kind==='match'||r.kind==='link')return [];
    const near=all.filter(x=>x.id!==r.id&&x.at<r.at&&r.at-x.at<SIT),last=(k:SpreadId)=>near.filter(x=>x.kind===k&&x.ok!==false).slice(-1);
    return [...last('match'),...last('link')];
  };
  const choose=(k:AskKind)=>{setKind(k);if(k!=='match')try{localStorage.setItem('cx-tarot-kind',k);}catch{/* */}};
  if(lib)return <main className="page sub tr" style={{'--accent':p.accent} as React.CSSProperties}><Library p={p} close={()=>setLib(false)}/></main>;
  const busy=!!going||!!more;
  return <Sub p={p} title="塔罗" cls="tr" act={<button className="ico" onClick={()=>setLib(true)} aria-label="牌库和牌面"><BookOpen size={23} strokeWidth={1.7}/></button>}>
    <div className="seg" role="tablist" aria-label="塔罗">
      {([['day','今日'],['ask','问他'],['log','记录']] as const).map(([id,n])=><button key={id} role="tab" aria-selected={tab===id} disabled={busy&&tab!==id} onClick={()=>{if(!busy)setTab(id);}}>{n}</button>)}
    </div>

    {tab==='day'&&(dayRec?<>
      <p className="lede">{p.name} 今天给你的牌。明天再来抽新的。</p>
      <Result key={dayRec.id} p={p} r={dayRec} closedFrom={closed(dayRec.id)} onFlipped={()=>setFresh('')} onSetup={()=>setLib(true)}/>
    </>:going==='day'?<Ritual n={1} rev={rev} what="他" done={(got,jump)=>save('day',got,jump)}/>:<>
      <p className="lede">一天一张，看看 {p.name} 今天想让你知道什么。</p>
      <button className="tr-start" onClick={()=>setGoing('day')} aria-label="抽今天的牌"><Back/><span>抽今天的牌</span></button>
    </>)}

    {tab==='ask'&&(more&&askRec?<>
      {askRec.q&&<p className="tr-q">{askRec.q}</p>}
      <Ritual n={1} rev={rev} what="刚才没说清的地方" skip={askRec.cards.map(d=>d.c)} done={got=>add(askRec.id,got)}/>
      <div className="rowbtn center"><button className="linkish" onClick={()=>setMore('')}>先不补了</button></div>
    </>:going&&going!=='day'?<>
      {q.trim()&&going!=='match'&&<p className="tr-q">{q.trim()}</p>}
      <Ritual n={spreads[going].pos.length} pos={spreads[going].pos} rev={rev} what={q.trim()&&going!=='match'?'这个问题':'他'} done={(got,jump)=>save(going,got,jump)}/>
      <div className="rowbtn center"><button className="linkish" onClick={()=>setGoing(null)}>先不抽了</button></div>
    </>:askRec?<>
      <Result key={askRec.id+askRec.cards.length} p={p} r={askRec} closedFrom={closed(askRec.id)} recent={recentOf(askRec)} onFlipped={()=>setFresh('')} onMore={()=>setMore(askRec.id)} onSetup={()=>setLib(true)}
        onAgain={askRec.kind==='match'&&missN<2?()=>{setShown('');setFresh('');setGoing('match');}:undefined}
        onNext={()=>{setShown('');setFresh('');setKind(lastKind());}}/>
      {!(askRec.kind==='match'&&askRec.ok)&&<div className="rowbtn center"><button className="linkish" onClick={()=>{setShown('');setFresh('');}}>接着问</button></div>}
    </>:<>
      <div className="tr-kinds" role="radiogroup" aria-label="牌阵">
        {askKinds.map(k=><button key={k} role="radio" aria-checked={kind===k} className={kind===k?'on':''} onClick={()=>choose(k)}><b>{spreads[k].name}{spreads[k].tag&&<i>{spreads[k].tag}</i>}{k==='match'&&opened&&<i className="done">这一场对过了</i>}</b><small>{spreads[k].when}</small></button>)}
      </div>
      {kind==='match'?<p className="lede tr-lede2">心里想着 {p.name}，请他用三张牌说说自己。{missN>=2&&'今天已经对过两次了，不用勉强。'}</p>:<>
        <p className="lede tr-lede2">心里想着 {p.name}，问一个问题。不写也可以。</p>
        <textarea className="bulk tall" rows={2} value={q} onChange={e=>setQ(e.target.value.slice(0,80))} placeholder={`想问 ${p.name} 什么`} aria-label="想问的问题"/>
        <div className="chips tr-tips" aria-label="不知道问什么">{tips.map(t=><button key={t} className="chip" onClick={()=>setQ(t)}>{t}</button>)}</div>
      </>}
      <button className="btn wide" onClick={()=>setGoing(kind)}>洗牌</button>
    </>)}

    {tab==='log'&&(all.length?<ul className="rows tr-log">{[...all].reverse().map(r=><li key={r.id}><button onClick={()=>{setSee(r);setSure(false);}}>
      <span className="who"><b>{r.q||spreads[r.kind].name}</b><span>{r.cards.map(d=>cards[d.c].name+(d.r?'·逆':'')).join('　')}</span></span>
      <small>{dayLabel(r.at).split(' ')[0]}</small>
    </button></li>)}</ul>:<p className="empty">还没有记录。抽过的牌会留在这里。</p>)}

    {see&&<Sheet title={see.q?'问他':spreads[see.kind].name} close={()=>setSee(null)}>
      <small className="when">{dayLabel(see.at)} · {spreads[see.kind].name}</small>
      <Result key={see.id+(all.find(x=>x.id===see.id)?.note??'')} p={p} r={all.find(x=>x.id===see.id)??see} recent={recentOf(see)} onSetup={()=>{setSee(null);setLib(true);}}/>
      <div className="rowbtn"><button className="chip danger" onClick={()=>{if(!sure){setSure(true);return;}drop(see);}}><Trash2 size={15} strokeWidth={1.8}/>{sure?'再点一次，删掉这次':'删掉这次'}</button></div>
    </Sheet>}
  </Sub>;
}
