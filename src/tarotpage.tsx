import {useEffect,useMemo,useRef,useState} from 'react';
import {Anchor,BellRing,BookOpen,ChevronLeft,ChevronsUp,Crown,Droplets,Feather,Flower2,Globe,Heart,Infinity as InfinityIcon,KeyRound,Lamp,Leaf,Link as LinkIcon,Moon,MoonStar,Orbit,Scale,Shuffle,
  Star,Sun,Sword,Trash2,Wand,WandSparkles,Wine,Zap,type LucideIcon} from 'lucide-react';
import {S,addPack,box,pushMsg,putImage,setBox,setPack,uid,useVer,type Persona,type Reading} from './db';
import {lines,sent} from './engine';
import {Avatar,Pic,dayLabel} from './App';
import {Sheet,Switch,say} from './pages';
import {Sub} from './more';
import {TOTAL,askKinds,asks,cards,groups,markOf,shuffleWithout,spreads,suitOf,toneOf,voiceAt,type AskKind,type Drawn,type SpreadId} from './tarot';

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
function Ritual({n,rev,done,what,pos,skip=[]}:{n:number;rev:boolean;done:(got:Drawn[])=>void;what:string;pos?:string[];skip?:number[]}){
  const [deck,setDeck]=useState(()=>shuffleWithout(rev,skip));
  const N=deck.length;
  const [stage,setStage]=useState<'shuffle'|'pick'>('shuffle');
  const [round,setRound]=useState(0);
  const [took,setTook]=useState<number[]>([]);
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
  useEffect(()=>{const t=setTimeout(()=>setStage('pick'),1150);return()=>clearTimeout(t);},[round]);
  useEffect(()=>()=>cancelAnimationFrame(g.current.raf),[]);
  const again=()=>{if(took.length)return;cancelAnimationFrame(g.current.raf);g.current.a=0;setMid(Math.round((N-1)/2));setDeck(shuffleWithout(rev,skip));setStage('shuffle');setRound(x=>x+1);};
  const pick=(i:number)=>{
    const now=tookRef.current;
    if(now.includes(i)||now.length>=n)return;
    const next=[...now,i];tookRef.current=next;setTook(next);
    try{navigator.vibrate?.(8);}catch{/* 没有震动也行 */}
    if(next.length===n)setTimeout(()=>done(next.map(k=>deck[k])),520);
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
      e.preventDefault();const m=midOf(),free=deck.map((_,i)=>i).filter(i=>!tookRef.current.includes(i)).sort((x,y)=>Math.abs(x-m)-Math.abs(y-m))[0];if(free!==undefined)pick(free);
    }
  };
  const left=n-took.length;
  return <div className="tr-ritual">
    <div className="tr-slots" data-n={n} aria-label={`已经抽了 ${took.length} 张`}>
      {Array.from({length:n},(_,i)=><span key={i} className={`tr-slotcol${i===took.length?' now':''}`}><span className={`tr-slot${i<took.length?' has':''}`}>{i<took.length&&<Back/>}</span>{pos&&n>1&&<small>{pos[i]}</small>}</span>)}
    </div>
    {stage==='shuffle'?<>
      <div className="tr-pile" key={round} aria-hidden="true">{Array.from({length:7},(_,i)=><span key={i} style={{'--i':i} as React.CSSProperties}><Back/></span>)}</div>
      <p className="tr-tip" role="status">正在洗牌…</p>
    </>:<>
      <p className="tr-tip" role="status">{left<=0?'好了':pos&&n>1?`心里想着${what}，选一张给「${pos[took.length]}」`:`心里想着${what}，选 ${left} 张`}</p>
      <div className="tr-wheelbox" onPointerDown={down} onWheel={wheel} onKeyDown={key} tabIndex={0} role="group"
        aria-label={`牌轮，一共 ${N} 张。左右拖动或按方向键转动，点一张或按回车抽出正中间那张`}>
        <div className="tr-wheel" ref={wheelEl} style={{transform:`rotate(${g.current.a}deg)`}}>
          {deck.map((_,i)=><button key={i} tabIndex={-1} className={`tr-w${took.includes(i)?' gone':''}${i===mid?' mid':''}`} aria-label={`第 ${i+1} 张`} disabled={took.includes(i)||left<=0}
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
    <textarea className="bulk tall" rows={5} value={t} onChange={e=>setT(e.target.value.slice(0,400))} placeholder={`比如：${cards[c].up[0]}。在我们这儿，是他…`} aria-label="我们的牌意" autoFocus/>
    <button className="btn" onClick={()=>{setBox(p.id,{tarotMine:{...mine,[c]:t.trim()}});say(t.trim()?'记下了':'清掉了');close();}}>记下</button>
  </Sheet>;
}
// closedFrom：从第几张起还扣着（刚抽出来的是 0，补牌是原来的张数；不给就是全都翻开）
function Result({p,r,closedFrom,onFlipped,onMore,onAgain}:{p:Persona;r:Reading;closedFrom?:number;onFlipped?:()=>void;onMore?:()=>void;onAgain?:()=>void}){
  const sp=spreads[r.kind],mine=box(p.id).tarotMine??{};
  const [open,setOpen]=useState<boolean[]>(()=>r.cards.map((_,i)=>closedFrom===undefined||i<closedFrom));
  const [note,setNote]=useState(r.note??''),[writing,setWriting]=useState(false),[edit,setEdit]=useState<number|null>(null);
  const isOpen=(i:number)=>open[i]??false,all=r.cards.every((_,i)=>isOpen(i));
  const patch=(x:Partial<Reading>)=>setBox(p.id,{tarot:(box(p.id).tarot??[]).map(y=>y.id===r.id?{...y,...x}:y)});
  const flip=(i:number)=>{if(isOpen(i))return;const next=r.cards.map((_,k)=>k===i?true:isOpen(k));setOpen(next);if(next.every(Boolean))onFlipped?.();};
  const tell=()=>{
    if(r.sent)return;
    pushMsg({pid:p.id,from:'me',kind:'text',text:textOf(r),at:Date.now()});sent(p.id);patch({sent:true});say('发到聊天里了');
  };
  const voice=r.cards[voiceAt[r.kind]]??r.cards[0],extra=r.cards.length-sp.pos.length;
  return <div className="tr-result">
    {r.q&&<p className="tr-q">{r.q}</p>}
    <div className="tr-spread" data-n={r.cards.length}>
      {r.cards.map((d,i)=><div key={i} className="tr-col">
        <small>{posOf(r,i)}</small>
        <button className={`tr-card${isOpen(i)?' open':''}`} onClick={()=>flip(i)} disabled={isOpen(i)} aria-label={isOpen(i)?`${posOf(r,i)}：${cards[d.c].name}，${d.r?'逆位':'正位'}`:`翻开${posOf(r,i)}这张`}>
          <span className="tr-flip"><span className="tr-side tr-b"><Back/></span><span className="tr-side tr-f"><Face c={d.c} r={d.r}/></span></span>
        </button>
      </div>)}
    </div>
    {!all&&<p className="tr-tip" role="status">轻触翻开</p>}
    <ol className="tr-read">
      {r.cards.map((d,i)=>isOpen(i)&&<li key={i}>
        <header><small>{posOf(r,i)}</small><b>{cards[d.c].name}</b><i className={d.r?'rev':''}>{d.r?'逆位':'正位'}</i>
          <button className="linkish" onClick={()=>setEdit(d.c)}>{mine[d.c]?'改我们的牌意':'写我们的牌意'}</button></header>
        {mine[d.c]&&<p className="tr-mine"><small>我们的牌意</small>{mine[d.c]}</p>}
        <p className="tr-keys">{(d.r?cards[d.c].rev:cards[d.c].up).join(' · ')}</p>
        <p className="tr-line">{d.r?cards[d.c].revLine:cards[d.c].upLine}</p>
        {r.kind==='link'&&i===0&&<p className="tr-link">{d.r?'线上有点杂音。慢一点，一句一句来。':'线是通的，可以说话。'}</p>}
      </li>)}
    </ol>
    {all&&<>
      {r.said&&<div className="said"><Avatar id={p.avatar} name={p.name} size={28}/><div><span>{r.said}</span>{voice&&<small className="tr-tone">语气 · {toneOf(voice)}</small>}</div></div>}
      {r.kind==='match'&&(r.ok===undefined?<div className="tr-ok"><p>这几张说的，像他吗？</p>
        <div className="rowbtn"><button className="chip on" onClick={()=>patch({ok:true})}>对上了，是他</button><button className="chip" onClick={()=>{patch({ok:false});onAgain?.();}}>没对上{onAgain?'，再连一次':''}</button></div></div>
        :<p className="tr-okd">{r.ok?'对上了，是他。':'这次没对上。'}</p>)}
      {r.note&&!writing&&<p className="tr-note"><small>我的感想</small>{r.note}</p>}
      {writing&&<div className="tr-write">
        <textarea className="bulk" rows={3} value={note} onChange={e=>setNote(e.target.value)} placeholder="看到这几张牌，想到了什么" aria-label="我的感想" autoFocus/>
        <div className="rowbtn"><button className="chip on" onClick={()=>{patch({note:note.trim()||undefined});setWriting(false);}}>记下</button><button className="chip" onClick={()=>{setNote(r.note??'');setWriting(false);}}>算了</button></div>
      </div>}
      {!writing&&<div className="rowbtn tr-acts">
        {onMore&&r.kind!=='day'&&extra<2&&<button className="chip" onClick={onMore}>补一张</button>}
        {r.sent?<a className="chip" href={'#/c/'+p.id}>去聊天看看</a>:<button className="chip" onClick={tell}>发到聊天</button>}
        <button className="chip" onClick={()=>setWriting(true)}>{r.note?'改感想':'写一句感想'}</button>
      </div>}
    </>}
    {edit!==null&&<MineSheet p={p} c={edit} close={()=>setEdit(null)}/>}
  </div>;
}

/* ── 牌库：78 张的牌意，换牌面 ── */
function Library({p,close}:{p:Persona;close:()=>void}){
  const b=box(p.id);
  const [see,setSee]=useState<number|null>(null),[busy,setBusy]=useState(''),[edit,setEdit]=useState<number|null>(null);
  const mine=b.tarotMine??{};
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
    <header className="bar"><button className="ico" onClick={close} aria-label="回到塔罗"><ChevronLeft size={28} strokeWidth={1.8}/></button><h1>牌库</h1></header>
    <Switch on={b.tarotRev!==false} set={v=>setBox(p.id,{tarotRev:v})} label="也抽逆位" note="关掉的话，抽到的牌都按正位来读"/>
    <h3>牌面</h3>
    <p className="hint">{hasFaces()?'现在用的是你自己的牌面。':'现在用的是内置的线条牌面。'}想用别的，可以一次选一整套 {TOTAL} 张图（按文件名排序：大阿卡纳 0–21，然后权杖、圣杯、宝剑、星币各 14 张），也可以点开某一张单独换。</p>
    <div className="rowbtn">
      <button className="chip" disabled={!!busy} onClick={()=>many.current?.click()}>{busy||'换一整套牌面'}</button>
      {hasFaces()&&!busy&&<button className="chip" onClick={()=>{setFaces([]);say('换回内置牌面了');}}>用回内置牌面</button>}
    </div>
    <input ref={many} type="file" accept="image/*" multiple hidden onChange={e=>{void bulk(e.target.files);e.target.value='';}} aria-label="选一整套牌面图"/>
    {groups.map(gr=><section key={gr.name} className="tr-group">
      <h3>{gr.name}</h3>
      <div className="tr-grid">{Array.from({length:gr.to-gr.from},(_,k)=>gr.from+k).map(c=><button key={c} className={mine[c]?'mine':''} onClick={()=>setSee(c)} aria-label={cards[c].name+(mine[c]?'，写了我们的牌意':'')}><Face c={c}/></button>)}</div>
    </section>)}
    {see!==null&&<Sheet title={cards[see].name} close={()=>setSee(null)}>
      <div className="tr-detail">
        <span className="tr-big"><Face c={see}/></span>
        <dl>
          <dt>正位</dt><dd><span className="tr-keys">{cards[see].up.join(' · ')}</span>{cards[see].upLine}</dd>
          <dt>逆位</dt><dd><span className="tr-keys">{cards[see].rev.join(' · ')}</span>{cards[see].revLine}</dd>
        </dl>
      </div>
      {mine[see]&&<p className="tr-mine"><small>我们的牌意</small>{mine[see]}</p>}
      <div className="rowbtn">
        <button className="chip" onClick={()=>setEdit(see)}>{mine[see]?'改我们的牌意':'写我们的牌意'}</button>
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
const lastKind=():AskKind=>{try{const k=localStorage.getItem('cx-tarot-kind') as AskKind|null;if(k&&askKinds.includes(k))return k;}catch{/* */}return 'one';};
export function TarotPage({p}:{p:Persona}){
  useVer();
  const b=box(p.id),all=b.tarot??[],rev=b.tarotRev!==false,today=ymd();
  const [tab,setTab]=useState<Tab>('day'),[lib,setLib]=useState(false);
  const [q,setQ]=useState(''),[kind,setKind]=useState<AskKind>(lastKind);
  const [going,setGoing]=useState<SpreadId|null>(null);     // 正在抽的是哪种牌阵
  const [more,setMore]=useState('');                        // 正在给哪一次补牌
  const [fresh,setFresh0]=useState<{id:string;from:number}|null>(null);   // 哪一次还有牌扣着、从第几张起
  const setFresh=(id:string,from=0)=>setFresh0(id?{id,from}:null),closed=(id:string)=>fresh?.id===id?fresh.from:undefined;
  const [shown,setShown]=useState('');                      // 「问他」里正在看的那一次
  const [see,setSee]=useState<Reading|null>(null),[sure,setSure]=useState(false);
  const dayRec=all.find(r=>r.kind==='day'&&r.date===today);
  const askRec=all.find(r=>r.id===shown);
  const tips=useMemo(()=>[...asks].sort(()=>Math.random()-.5).slice(0,3),[shown]);
  const save=(k:SpreadId,got:Drawn[],keepQ='')=>{
    const ask=keepQ||q.trim();
    const r:Reading={id:uid(),at:Date.now(),kind:k,cards:got,said:lines(p,1)[0],...(k==='day'?{date:today}:ask?{q:ask}:{})};
    setBox(p.id,{tarot:[...(box(p.id).tarot??[]),r].slice(-300)});
    setFresh(r.id);setGoing(null);if(k!=='day'){setShown(r.id);setQ('');}
  };
  const add=(id:string,got:Drawn[])=>{const had=(box(p.id).tarot??[]).find(x=>x.id===id)?.cards.length??0;setBox(p.id,{tarot:(box(p.id).tarot??[]).map(x=>x.id===id?{...x,cards:[...x.cards,...got]}:x)});setFresh(id,had);setMore('');};
  const drop=(r:Reading)=>{const now=box(p.id);setBox(p.id,{tarot:(now.tarot??[]).filter(x=>x.id!==r.id),tarotGone:[...(now.tarotGone??[]),r.id].slice(-400)});setSee(null);setSure(false);if(shown===r.id)setShown('');};
  const choose=(k:AskKind)=>{setKind(k);try{localStorage.setItem('cx-tarot-kind',k);}catch{/* */}};
  if(lib)return <main className="page sub tr" style={{'--accent':p.accent} as React.CSSProperties}><Library p={p} close={()=>setLib(false)}/></main>;
  const busy=!!going||!!more;
  return <Sub p={p} title="塔罗" cls="tr" act={<button className="ico" onClick={()=>setLib(true)} aria-label="牌库和牌面"><BookOpen size={23} strokeWidth={1.7}/></button>}>
    <div className="seg" role="tablist" aria-label="塔罗">
      {([['day','今日'],['ask','问他'],['log','记录']] as const).map(([id,n])=><button key={id} role="tab" aria-selected={tab===id} disabled={busy&&tab!==id} onClick={()=>{if(!busy)setTab(id);}}>{n}</button>)}
    </div>

    {tab==='day'&&(dayRec?<>
      <p className="lede">{p.name} 今天给你的牌。明天再来抽新的。</p>
      <Result key={dayRec.id} p={p} r={dayRec} closedFrom={closed(dayRec.id)} onFlipped={()=>setFresh('')}/>
    </>:going==='day'?<Ritual n={1} rev={rev} what="他" done={got=>save('day',got)}/>:<>
      <p className="lede">一天一张，看看 {p.name} 今天想让你知道什么。</p>
      <button className="tr-start" onClick={()=>setGoing('day')} aria-label="抽今天的牌"><Back/><span>抽今天的牌</span></button>
    </>)}

    {tab==='ask'&&(more&&askRec?<>
      {askRec.q&&<p className="tr-q">{askRec.q}</p>}
      <Ritual n={1} rev={rev} what="刚才没说清的地方" skip={askRec.cards.map(d=>d.c)} done={got=>add(askRec.id,got)}/>
      <div className="rowbtn center"><button className="linkish" onClick={()=>setMore('')}>先不补了</button></div>
    </>:going&&going!=='day'?<>
      {q.trim()&&<p className="tr-q">{q.trim()}</p>}
      <Ritual n={spreads[going].pos.length} pos={spreads[going].pos} rev={rev} what={q.trim()?'这个问题':'他'} done={got=>save(going,got)}/>
      <div className="rowbtn center"><button className="linkish" onClick={()=>setGoing(null)}>先不抽了</button></div>
    </>:askRec?<>
      <Result key={askRec.id+askRec.cards.length} p={p} r={askRec} closedFrom={closed(askRec.id)} onFlipped={()=>setFresh('')} onMore={()=>setMore(askRec.id)}
        onAgain={()=>{setQ(askRec.q??'');setShown('');setFresh('');setGoing('match');}}/>
      <div className="rowbtn center"><button className="linkish" onClick={()=>{setShown('');setFresh('');}}>接着问</button></div>
    </>:<>
      <p className="lede">心里想着 {p.name}，问一个问题。不写也可以。</p>
      <textarea className="bulk tall" rows={2} value={q} onChange={e=>setQ(e.target.value.slice(0,80))} placeholder={`想问 ${p.name} 什么`} aria-label="想问的问题"/>
      <div className="chips tr-tips" aria-label="不知道问什么">{tips.map(t=><button key={t} className="chip" onClick={()=>setQ(t)}>{t}</button>)}</div>
      <div className="tr-kinds" role="radiogroup" aria-label="牌阵">
        {askKinds.map(k=><button key={k} role="radio" aria-checked={kind===k} className={kind===k?'on':''} onClick={()=>choose(k)}><b>{spreads[k].name}</b><small>{spreads[k].hint}</small></button>)}
      </div>
      <button className="btn wide" onClick={()=>setGoing(kind)}>洗牌</button>
    </>)}

    {tab==='log'&&(all.length?<ul className="rows tr-log">{[...all].reverse().map(r=><li key={r.id}><button onClick={()=>{setSee(r);setSure(false);}}>
      <span className="who"><b>{r.q||spreads[r.kind].name}</b><span>{r.cards.map(d=>cards[d.c].name+(d.r?'·逆':'')).join('　')}</span></span>
      <small>{dayLabel(r.at).split(' ')[0]}</small>
    </button></li>)}</ul>:<p className="empty">还没有记录。抽过的牌会留在这里。</p>)}

    {see&&<Sheet title={see.q?'问他':spreads[see.kind].name} close={()=>setSee(null)}>
      <small className="when">{dayLabel(see.at)} · {spreads[see.kind].name}</small>
      <Result key={see.id+(all.find(x=>x.id===see.id)?.note??'')} p={p} r={all.find(x=>x.id===see.id)??see}/>
      <div className="rowbtn"><button className="chip danger" onClick={()=>{if(!sure){setSure(true);return;}drop(see);}}><Trash2 size={15} strokeWidth={1.8}/>{sure?'再点一次，删掉这次':'删掉这次'}</button></div>
    </Sheet>}
  </Sub>;
}
