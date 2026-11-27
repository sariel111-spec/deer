// 占牌 · 问他：一场对话。我说一句 → 他用牌回 → 我把牌读成他的话 → 拿不准补一张 → 顺着聊 → 收尾。
// 牌阵（他在做什么 / 是不是 / 二选一 / 他今天过得怎么样）是梦占式的：不用开场，结果记成「我看到的」。
import {useEffect,useMemo,useRef,useState} from 'react';
import {Anchor,ArrowUp,Baby,Bird,BookOpen,Castle,Cloud,Clover,Cross,Dog,Fence,Fish,Flower,Flower2,Hand,Heart,House,Key,LayoutGrid,Mail,Moon,Mountain,Origami,Rat,Sailboat,Signpost,Star,Sun,TreeDeciduous,User,X,type LucideIcon} from 'lucide-react';
import {S,addPack,box,putImage,setBox,setPack,uid,useVer,type More,type Persona,type TCard,type Talk,type Turn} from './db';
import {Pic,dayLabel} from './App';
import {Sheet,say} from './pages';
import {auto,enter,useTwice} from './ui';
import {lines} from './engine';
import {aiHand,dsChat,dsKey,onPhone,type Msg as AiMsg} from './ai';
import {askKinds,cards,shuffle,spreads,type AskKind,type Drawn} from './tarot';
import {facets,mj} from './tarotmj';
import {Back,Face,Ritual} from './tarotpage';
import {HE,LTOTAL,ME,doingAsp,flow,hereOf,kindName,lcards,lfacets,lguide,lhint,lname,lread,lshuffle,lspreadIds,lspreads,whoOf,ynOf,ynWord,type LAspect,type LSpread} from './leno';

export const SIT=2*3600e3;   // 一场：两小时内接着聊都算同一场
type Deck='t'|'l';

/* ── 雷诺曼牌面：白底、编号、一枚线条图形、牌名。和塔罗同一套画法；也可以换成自己的图 ── */
type G=(p:{size:number})=>React.ReactElement;
const I=(C:LucideIcon):G=>({size})=><C size={size} strokeWidth={1.3} aria-hidden="true"/>;
const P=(...d:string[]):G=>({size})=><svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.3} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d.map((x,i)=><path key={i} d={x}/>)}</svg>;
const glyphs:G[]=[
  P('M7 21h10','M8.5 21c0-4 1-6.2 3-8-2.2 0-4 .6-5 2l-2-2.2 4.2-5.6.8-3.2 2.2 2.2c4 1 6.3 4 6.3 8.8 0 2.2-.4 4.2-1 6'),I(Clover),I(Sailboat),I(House),I(TreeDeciduous),I(Cloud),
  P('M6 20c4 0 6.5-1.6 6.5-3.8S7.5 14 7.5 11s3-4 6-4 5-.8 5-3','M18.5 4h.01'),P('M9 3h6l3 5-2 13H8L6 8z','M12 8v5','M10 10h4'),I(Flower2),
  P('M5 21l9-16','M14 5c3.4-1.4 6.4.1 7.4 3.1-2.6-1.4-5.4-1.2-8.2.6'),P('M4 20l5-5','M9 15c3.2-3-.2-7 3.8-9s7 2 4 5-6-1-3-3'),I(Bird),I(Baby),
  P('M4 5l4 3h8l4-3-1 8-7 8-7-8z','M9.5 12h.01','M14.5 12h.01'),P('M12 21a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15z','M6.6 8.2a2.5 2.5 0 1 1 3-2.6','M17.4 8.2a2.5 2.5 0 1 0-3-2.6','M9.5 12.5h.01','M14.5 12.5h.01','M11 16h2'),
  I(Star),I(Origami),I(Dog),I(Castle),I(Fence),I(Mountain),I(Signpost),I(Rat),I(Heart),
  P('M12 21a6 6 0 1 0 0-12 6 6 0 0 0 0 12z','M9.5 6L12 3l2.5 3L12 9z'),I(BookOpen),I(Mail),I(User),
  P('M12 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z','M7.4 13.5C6.2 9 8 3.6 12 3.6s5.8 5.4 4.6 9.9','M5 21c0-3.4 3-5.8 7-5.8s7 2.4 7 5.8'),
  I(Flower),I(Sun),I(Moon),I(Key),I(Fish),I(Anchor),I(Cross),
];
const lpack=()=>(S().packs??[]).find(k=>k.use==='leno');
const lfaceId=(c:number)=>lpack()?.ids[c]||'';
function setLFaces(ids:string[]){const k=lpack();if(k)setPack(k.id,{ids});else{const n=addPack('雷诺曼牌面',[]);setPack(n.id,{use:'leno',his:false,ids});}}
export function LFace({c}:{c:number}){
  const Gl=glyphs[c],id=lfaceId(c);
  return <span className="tr-face"><span className="tr-art"><small>{c+1}</small><Gl size={30}/><b>{lcards[c].name}</b></span>{id&&<Pic id={id} className="tr-img"/>}</span>;
}

/* ── 数据 ── */
const talksOf=(pid:string)=>box(pid).talks??[];
const lastAt=(t:Talk)=>Math.max(t.at,...t.turns.map(x=>x.u??x.at));
export const liveTalk=(pid:string):Talk|undefined=>{const ts=talksOf(pid),t=ts[ts.length-1];return t&&!t.end&&Date.now()-lastAt(t)<SIT?t:undefined;};
const saveTalk=(pid:string,t:Talk)=>{const ts=talksOf(pid),n={...t,u:Date.now()};setBox(pid,{talks:(ts.some(x=>x.id===t.id)?ts.map(x=>x.id===t.id?n:x):[...ts,n]).slice(-200)});};
const patchTurn=(pid:string,tid:string,id:string,patch:Partial<Turn>)=>{const t=talksOf(pid).find(x=>x.id===tid);if(t)saveTalk(pid,{...t,turns:t.turns.map(x=>x.id===id?{...x,...patch,u:Date.now()}:x)});};
export const dropTalk=(pid:string,id:string)=>{const b=box(pid);setBox(pid,{talks:(b.talks??[]).filter(x=>x.id!==id),talksGone:[...(b.talksGone??[]),id].slice(-400)});};
function draw(deck:Deck,n:number,rev:boolean,skip:number[]=[]):TCard[]{
  return deck==='t'?shuffle(rev).filter(d=>!skip.includes(d.c)).slice(0,n):lshuffle(skip).slice(0,n).map(c=>({c}));
}
const ls=(k:string,d:string)=>{try{return localStorage.getItem(k)??d;}catch{return d;}};
const lsSet=(k:string,v:string)=>{try{localStorage.setItem(k,v);}catch{/* */}};
const NS:Record<Deck,number[]>={t:[1,2,3],l:[3,2,4,5]};

const tname=(d:TCard)=>cards[d.c].name+(d.r?'·逆':'');
const cname=(deck:Deck,d:TCard,p:Persona)=>deck==='t'?tname(d):lname(d.c,box(p.id).lenoWho,p.name);
const kws=(deck:Deck,d:TCard)=>deck==='t'?(d.r?cards[d.c].rev:cards[d.c].up).slice(0,3).join(' · '):lcards[d.c].kw.join(' · ');
const isSpread=(k:Turn['kind']):k is LSpread=>k==='doing'||k==='yn'||k==='ab'||k==='day3';
const spAsp=(k:LSpread,c:number,i:number):LAspect=>k==='doing'?doingAsp(c,i):k==='day3'?'doing':'kw';
/** 一场的标题：第一句话，没有就数句数 */
export const talkTitle=(t:Talk)=>t.turns.find(x=>x.q)?.q||(t.turns.some(x=>isSpread(x.kind))?lspreads[t.turns.find(x=>isSpread(x.kind))!.kind as LSpread].name:'和他聊了一会儿');
export const talkSub=(t:Talk,p:Persona)=>{const n=t.turns.filter(x=>x.kind==='say').length;return n?`${n} 句 · ${t.turns.filter(x=>x.read).length} 句读过了`:t.turns.map(x=>x.cards.map(d=>cname(x.deck,d,p)).join(' ')).join('　');};

/* ── 我们的牌意：两副牌共用。可以从某一句直接记（带上出处），按小标签分条 ── */
const tags=['指代','在做什么','心情','地点','时间','吃的','穿的'];
export function MineSheet2({p,deck,c,seed,close}:{p:Persona;deck:Deck;c:number;seed?:string;close:()=>void}){
  const b=box(p.id),mine=(deck==='t'?b.tarotMine:b.lenoMine)??{},old=mine[c]??'';
  const [t,setT]=useState(()=>seed&&!old.includes(seed)?(old?old+'\n':'')+seed:old);
  const name=deck==='t'?cards[c].name:lcards[c].name;
  const save=()=>{const v=t.trim();setBox(p.id,deck==='t'?{tarotMine:{...mine,[c]:v}}:{lenoMine:{...mine,[c]:v}});say(v?'记下了':'清掉了');close();};
  return <Sheet title={`${name} · 我们的牌意`} close={close}>
    <p className="hint first">和 {p.name} 聊多了，这张牌在你们之间会有自己的意思。写在这里，以后抽到会先显示你写的。</p>
    <div className="chips" aria-label="加一条">{tags.map(g=><button key={g} className="chip" onClick={()=>setT(v=>(v&&!v.endsWith('\n')?v+'\n':v)+`【${g}】`)}>{g}</button>)}</div>
    <textarea className="bulk tall" rows={6} value={t} onChange={e=>setT(e.target.value.slice(0,600))} placeholder={'比如：【在做什么】在我们这儿，这张是他在…'} aria-label="我们的牌意" autoFocus={auto}/>
    <button className="btn" onClick={save}>记下</button>
  </Sheet>;
}
/** 这张牌在你们的对话里出现过几次、最近几次你读成了什么 */
function readsOf(pid:string,deck:Deck,c:number):{n:number;last:{at:number;read:string}[]}{
  const hit:{at:number;read:string}[]=[];let n=0;
  for(const t of talksOf(pid))for(const x of t.turns){
    const has=(x.deck===deck&&x.cards.some(d=>d.c===c))||(x.more??[]).some(m=>m.deck===deck&&m.c===c);
    if(has){n++;if(x.read)hit.push({at:x.at,read:x.read});}
  }
  return {n,last:hit.slice(-3).reverse()};
}
export function CardSheet({p,deck,d,close,children}:{p:Persona;deck:Deck;d:TCard;close:()=>void;children?:React.ReactNode}){
  useVer();
  const [edit,setEdit]=useState(false);
  const b=box(p.id),mine=((deck==='t'?b.tarotMine:b.lenoMine)??{})[d.c],c=d.c,rs=readsOf(p.id,deck,c),w=deck==='l'?whoOf(c,b.lenoWho):'';
  return <Sheet title={deck==='t'?cards[c].name+(d.r?' · 逆位':''):`${c+1} · ${lcards[c].name}`} close={close}>
    <div className="tr-detail"><span className="tr-big">{deck==='t'?<Face c={c} r={d.r}/>:<LFace c={c}/>}</span>
      {deck==='t'?<dl><dt>正位</dt><dd><span className="tr-keys">{cards[c].up.join(' · ')}</span>{cards[c].upLine}</dd><dt>逆位</dt><dd><span className="tr-keys">{cards[c].rev.join(' · ')}</span>{cards[c].revLine}</dd></dl>
        :<dl><dt>{kindName[lcards[c].kind]}牌</dt><dd><span className="tr-keys">{lcards[c].kw.join(' · ')}</span>{w?`在你们这儿，这张代表${w==='he'?p.name:'你'}。`:`问是不是时：${ynWord(lcards[c].yn)}。`}</dd></dl>}
    </div>
    {deck==='t'&&<p className="tr-pic">{mj[c].pic}</p>}
    <dl className="tr-facets">{(deck==='t'?facets(c):lfacets(c)).map(([k,v])=><div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
    {mine&&<p className="tr-mine"><small>我们的牌意</small>{mine}</p>}
    {rs.n>0&&<div className="tk-reads"><small>在你们的对话里出现过 {rs.n} 次</small>{rs.last.map(x=><p key={x.at}><i>{dayLabel(x.at).split(' ')[0]}</i>{x.read}</p>)}</div>}
    <div className="rowbtn"><button className="chip" onClick={()=>setEdit(true)}>{mine?'改我们的牌意':'写我们的牌意'}</button>{children}</div>
    {edit&&<MineSheet2 p={p} deck={deck} c={c} close={()=>setEdit(false)}/>}
  </Sheet>;
}

/* ── AI 只做校对：先自己读，再让它对一遍 ── */
const PROOF=`你是一位熟悉塔罗和雷诺曼、也熟悉「梦角传讯」的校对者。下面是她自己和梦角用牌聊天的记录：她每说一句，他用牌回应，她已经把牌读成了他的话。你的任务是校对，不是替她重解。
规则：
1. 前提：他爱她。所有牌都在这个前提下读；负面的牌多半是担心、心疼、嘴硬、拿不准，不要读成不爱、离开或第三者。
2. 塔罗看画面和正逆位（逆位不等于坏：往里收、迟一点、过头或不够）；雷诺曼不分正逆，几张连成一句。写了「我们的牌意」的牌，以它为准。
3. 逐句看：她的读法站得住，就说「读得通」，并指出是牌上的哪一点支持它；可能读偏的地方，说清是哪张牌、还可以怎么读，给一两个备选，不要全盘推翻。
4. 不要替她抽牌，不要编没出现的牌，不要预测未来，不要劝她怀疑这段关系。
5. 最后照他的人设，用他的口吻把整场话顺成一小段，不要比她读到的多出新的意思。
格式：先「逐句」，再「整场」两三句，再「他的话」。简短，口语。`;
function proofOf(p:Persona,t:Talk):AiMsg[]{
  const b=box(p.id),voice=lines(p,6);
  const mine=(deck:Deck,c:number)=>((deck==='t'?b.tarotMine:b.lenoMine)??{})[c];
  const one=(deck:Deck,d:TCard)=>`${cname(deck,d,p)}（${kws(deck,d)}${mine(deck,d.c)?`；我们的牌意：${mine(deck,d.c)}`:''}）`;
  const rows=t.turns.map((x,i)=>{
    const head=x.kind==='here'?'开场 · 在吗':x.kind==='bye'?'道别':isSpread(x.kind)?`牌阵 · ${lspreads[x.kind].name}${x.q?`：${x.q}`:''}${x.kind==='ab'?`：${x.a} / ${x.b}`:''}`:`她：${x.q||'（没说话，请他先开口）'}`;
    return [`${i+1}. ${head}`,`牌（${x.deck==='t'?'塔罗':'雷诺曼'}）：${x.cards.map(d=>one(x.deck,d)).join('，')}`,
      ...(x.more??[]).map(m=>`${m.why==='jump'?'跳牌（洗牌时自己跳出来的）':`补牌（${m.why==='ok'?'核对':m.why==='go'?'接着说':'关键词'}）`}：${one(m.deck,m)}`),
      x.read?`她读成：${x.read}`:'她还没读这一句'].join('\n');
  });
  const u=['【他的人设】',`梦角：${p.name}${p.bio?'。'+p.bio:''}`,b.tarotAbout?`他的资料和说话习惯：${b.tarotAbout}`:'',voice.length?`他平时说话的样子（学语气用，不要照抄）：${voice.join(' / ')}`:'',`她的名字：${S().prefs.myName}`,'【这一场】',...rows].filter(Boolean).join('\n');
  return [{role:'system',content:PROOF},{role:'user',content:u}];
}
function Proof({p,t,close}:{p:Persona;t:Talk;close:()=>void}){
  const H=aiHand(),text=useMemo(()=>{const m=proofOf(p,t);return m[0].content+'\n\n——\n'+m[1].content;},[t.id]);
  const [back,setBack]=useState(''),[ai,setAi]=useState(t.ai??''),[busy,setBusy]=useState(false);
  const copy=async()=>{try{await navigator.clipboard.writeText(text);say(`复制好了，去 ${H.name} 贴上发送`);}catch{say('这里不让自动复制：点开下面的内容，长按全选复制');}};
  const keep=(v:string)=>{const s=v.trim();if(!s)return;setAi(s);saveTalk(p.id,{...(talksOf(p.id).find(x=>x.id===t.id)??t),ai:s});setBack('');say('存进这一场的记录了');};
  const run=async()=>{setBusy(true);try{keep(await dsChat(proofOf(p,t),setAi));}catch(e){say((e as Error)?.message||'这次没对出来，再试一次');}setBusy(false);};
  return <Sheet title="让 AI 对一遍" close={close}>
    <p className="hint first">它只校对你已经读出来的话：哪句读得通、哪张牌可能读偏了。不替你重解。</p>
    {ai&&<p className="tk-ai">{ai}</p>}
    {dsKey()&&<div className="rowbtn"><button className="chip on" disabled={busy} onClick={()=>void run()}>{busy?'正在对…':ai?'重新对一遍':'现在对一遍'}</button></div>}
    <section className="tr-hand">
      <h4>带去 {H.name}<small>不用密钥，不花钱</small></h4>
      <ol><li>点「复制」，这一场的话、牌和校对的指令就带上了。</li><li>打开 {H.name}，新开一个对话，贴上发送。</li><li>把它的回答贴回下面，存进这一场。</li></ol>
      <div className="rowbtn"><button className="chip on" onClick={()=>void copy()}>复制</button>
        {onPhone()&&!H.app.startsWith('http')?<><a className="chip" href={H.app}>打开 {H.name} App</a><a className="chip" href={H.url} target="_blank" rel="noopener noreferrer">网页版</a></>:<a className="chip" href={onPhone()?H.app:H.url} target="_blank" rel="noopener noreferrer">打开 {H.name}</a>}</div>
      <textarea className="bulk" rows={4} value={back} onChange={e=>setBack(e.target.value)} placeholder={`把 ${H.name} 的回答贴在这里`} aria-label="贴回来的校对"/>
      <div className="rowbtn"><button className="chip on" onClick={()=>back.trim()?keep(back):say('先把回答贴进来')}>存进这一场</button></div>
      <details className="tr-more"><summary>看要带过去的内容</summary><textarea className="bulk" rows={6} readOnly value={text} aria-label="带过去的内容"/></details>
    </section>
  </Sheet>;
}

/* ── 一句 ── */
type Shut=Set<string>;
function Cd({deck,d,shut,on,label,cap}:{deck:Deck;d:TCard;shut:boolean;on:()=>void;label:string;cap?:string}){
  return <button className={'tk-cd'+(shut?' shut':'')} onClick={on} aria-label={shut?'翻开这张牌':label}>
    <span className="tk-c">{shut?<Back/>:deck==='t'?<Face c={d.c} r={d.r}/>:<LFace c={d.c}/>}</span>{cap&&<small>{shut?' ':cap}</small>}
  </button>;
}
function TurnView({p,tid,x,shut,open,see,live,onMore,onMine}:{p:Persona;tid:string;x:Turn;shut:Shut;open:(k:string)=>void;see:(deck:Deck,d:TCard)=>void;live:boolean;onMore:()=>void;onMine:(deck:Deck,d:TCard,seed:string)=>void}){
  const b=box(p.id),sp=isSpread(x.kind)?lspreads[x.kind]:null,more=x.more??[];
  const key=(i:number,m=false)=>`${x.id}:${m?'m':''}${i}`,allOpen=x.cards.every((_,i)=>!shut.has(key(i)))&&more.every((_,i)=>!shut.has(key(i,true)));
  const [writing,setWriting]=useState(false),[text,setText]=useState(x.read??''),[tip,setTip]=useState(false);
  const save=()=>{const v=text.trim();patchTurn(p.id,tid,x.id,{read:v||undefined});setWriting(false);};
  const pos=(i:number)=>sp?(x.kind==='ab'?(i<2?x.a:x.b)||sp.pos[i]:sp.pos[i]):undefined;
  const capOf=(m:More)=>m.why==='ok'?`核对 · ${ynWord(lcards[m.c].yn)}`:m.why==='jump'?'跳牌':m.why==='go'?'接着说':`${cards[x.cards[m.on??0]?.c??0].name}的关键词`;
  const hint=x.deck==='l'?lhint(x.cards.map(d=>d.c),!!x.q,b.lenoWho,p.name):x.cards.map(d=>`${tname(d)}：${d.r?cards[d.c].revLine:cards[d.c].upLine}`);
  const mineOf=(deck:Deck,c:number)=>((deck==='t'?b.tarotMine:b.lenoMine)??{})[c];
  const mines=[...x.cards.map(d=>[x.deck,d] as const),...more.map(m=>[m.deck,m as TCard] as const)].filter(([k,d])=>mineOf(k,d.c));
  const yn=x.kind==='yn'?ynOf(x.cards.map(d=>d.c)):null;
  const label=sp?'我看到的':x.kind==='here'?'':'他说';
  return <div className={'tk-turn'+(sp?' sp':'')} data-kind={x.kind}>
    {sp?<p className="tk-sph"><b>{sp.name.split(' · ')[0]}</b>{x.q&&<span>{x.q}</span>}{x.kind==='ab'&&<span>{x.a} / {x.b}</span>}</p>
      :x.kind==='here'?<p className="tk-cap">在吗</p>:x.kind==='bye'?<p className="tk-cap">道别</p>:x.q?<p className="tk-me">{x.q}</p>:<p className="tk-cap">请他先说</p>}
    <div className={'tk-cards'+(x.kind==='ab'?' ab':'')}>
      {x.cards.map((d,i)=>[x.kind==='ab'&&i===2&&<span key="th" className="tk-cd theme" aria-label={`主题牌：${p.name}`}><span className="tk-c"><LFace c={x.th??b.lenoWho?.he??HE}/></span><small>{p.name}</small></span>,
        <Cd key={i} deck={x.deck} d={d} shut={shut.has(key(i))} cap={pos(i)} label={cname(x.deck,d,p)} on={()=>shut.has(key(i))?open(key(i)):see(x.deck,d)}/>])}
      {more.map((m,i)=><Cd key={'m'+i} deck={m.deck} d={m} shut={shut.has(key(i,true))} cap={capOf(m)} label={cname(m.deck,m,p)} on={()=>shut.has(key(i,true))?open(key(i,true)):see(m.deck,m)}/>)}
    </div>
    {allOpen&&<>
      <p className="tk-names">{[...x.cards.map(d=>cname(x.deck,d,p)),...more.map(m=>cname(m.deck,m,p))].join(' · ')}</p>
      {yn&&<p className="tk-yn"><b>{yn.word}</b>{yn.why}</p>}
      {x.kind==='here'?<>
        <p className="tk-tip">{hereOf(x.cards[0],(b.tarotSign??[]).includes(x.cards[0].c))}</p>
        {x.ok===undefined?<div className="rowbtn center"><button className="chip on" onClick={()=>patchTurn(p.id,tid,x.id,{ok:true})}>是他</button><button className="chip" onClick={()=>patchTurn(p.id,tid,x.id,{ok:false})}>不像他</button></div>
          :<p className="tk-cap">{x.ok?'是他。想说什么就说吧。':'这次没对上。隔一会儿再来，别反复抽。'}</p>}
      </>:<>
        {tip&&<div className="tk-hint">
          <ul className="tk-lines">
            {x.cards.map((d,i)=>{const w=x.deck==='l'?whoOf(d.c,b.lenoWho):'';return <li key={i}><i>{sp?pos(i):x.deck==='t'?tname(d):lcards[d.c].name}</i>{x.deck==='t'?`${kws('t',d)}。${d.r?cards[d.c].revLine:cards[d.c].upLine}`
              :<>{sp&&`${lname(d.c,b.lenoWho,p.name)}：`}{w==='he'?`${p.name}本人，旁边的牌在说他`:w==='me'?'你，旁边的牌在说你':lread(d.c,sp?spAsp(x.kind as LSpread,d.c,i):'doing')}{x.kind==='doing'&&<em>{kindName[lcards[d.c].kind]}牌</em>}</>}</li>;})}
            {more.map((m,i)=><li key={'m'+i}><i>{m.deck==='t'?tname(m):lcards[m.c].name}</i>{m.why==='ok'?`核对：${ynWord(lcards[m.c].yn)}`:kws(m.deck,m)}</li>)}
          </ul>
          {x.deck==='l'&&!sp&&<ul className="tk-tips">{hint.map(h=><li key={h}>{h}</li>)}</ul>}
          {x.kind==='ab'&&<p>每边两张各自连成一句，再看哪一句更像 {p.name} 会说的。牌没有绝对的好坏。</p>}
          {mines.map(([k,d])=><p key={k+d.c} className="tr-mine"><small>我们的牌意 · {k==='t'?cards[d.c].name:lcards[d.c].name}</small>{mineOf(k,d.c)}</p>)}
        </div>}
        {x.read&&!writing?<button className={sp?'tk-note':'tk-he'} onClick={()=>live&&setWriting(true)} aria-label={`${label}：${x.read}${live?'，点一下改':''}`}>{x.read}</button>
          :live||writing?<form className="tk-read" onSubmit={e=>{e.preventDefault();save();}}>
            <textarea rows={1} value={text} onChange={e=>{setText(e.target.value.slice(0,400));e.target.style.height='auto';e.target.style.height=e.target.scrollHeight+'px';}} onKeyDown={e=>{if(enter(e)){e.preventDefault();save();}}} placeholder={sp?'我看到的…':'他说…'} aria-label={sp?'我看到的':'我读到的，他这句话是'}/>
            {(text.trim()||x.read)&&<button className="tk-save">记下</button>}
          </form>:null}
        {live&&!writing&&<p className="tk-acts">
          <button aria-expanded={tip} onClick={e=>{const el=e.currentTarget.closest('.tk-turn');setTip(v=>!v);setTimeout(()=>el?.scrollIntoView({block:'nearest',behavior:'smooth'}),60);}}>{tip?'收起牌意':'牌意'}</button>
          {more.filter(m=>m.why!=='jump').length<2&&<button onClick={onMore}>补一张</button>}
          {x.read&&<button onClick={()=>onMine(x.deck,x.cards[0],`${dayLabel(x.at).split(' ')[0]}「${x.q||'他先说'}」→ ${x.read}`)}>记进牌意</button>}
        </p>}
      </>}
    </>}
  </div>;
}

/** 整场的对话（记录里看的时候也用这个，那时不能再改） */
export function TalkLog({p,t,live=false,shut,open,onMore,extra=[]}:{p:Persona;t:Talk;live?:boolean;shut?:Shut;open?:(k:string)=>void;onMore?:(x:Turn)=>void;extra?:{at:number;node:React.ReactNode}[]}){
  const [see,setSee]=useState<{deck:Deck;d:TCard}|null>(null),[mine,setMine]=useState<{deck:Deck;d:TCard;seed:string;pick?:boolean;x?:Turn}|null>(null);
  const none=useMemo(()=>new Set<string>(),[]);
  const items=[...t.turns.map(x=>({at:x.at,node:<TurnView key={x.id} p={p} tid={t.id} x={x} live={live} shut={shut??none} open={open??(()=>{})} see={(deck,d)=>setSee({deck,d})} onMore={()=>onMore?.(x)}
    onMine={(deck,d,seed)=>setMine({deck,d,seed,pick:x.cards.length+(x.more?.length??0)>1,x})}/>})),...extra].sort((a,b)=>a.at-b.at);
  return <>
    {items.map(i=>i.node)}
    {see&&<CardSheet p={p} deck={see.deck} d={see.d} close={()=>setSee(null)}/>}
    {mine&&(mine.pick&&mine.x?<Sheet title="记到哪一张" close={()=>setMine(null)}>
      <div className="tr-kinds">{[...mine.x.cards.map(d=>[mine.x!.deck,d] as const),...(mine.x.more??[]).map(m=>[m.deck,m as TCard] as const)].map(([k,d],i)=><button key={i} onClick={()=>setMine({deck:k,d,seed:mine.seed})}><b>{cname(k,d,p)}</b><small>{kws(k,d)}</small></button>)}</div>
    </Sheet>:<MineSheet2 p={p} deck={mine.deck} c={mine.d.c} seed={mine.seed} close={()=>setMine(null)}/>)}
  </>;
}

/* ── 问他 ── */
export function TalkView({p,opened,misses,rev,session,onSpread,onLib}:{p:Persona;opened:boolean;misses:number;rev:boolean;session:{at:number;node:React.ReactNode}[];onSpread:(k:AskKind,q:string)=>void;onLib:()=>void}){
  useVer();
  const b=box(p.id),t=liveTalk(p.id);
  const [deck,setDeck0]=useState<Deck>(()=>ls('cx-talk-deck','t')==='l'?'l':'t');
  const [ns,setNs]=useState<Record<Deck,number>>(()=>({t:Number(ls('cx-talk-n-t','1'))||1,l:Number(ls('cx-talk-n-l','3'))||3}));
  const [text,setText]=useState(''),[a,setA]=useState(''),[bb,setBb]=useState(''),[armed,setArmed]=useState<AskKind|LSpread|null>(null),[err,setErr]=useState('');
  const [hand,setHand0]=useState(()=>ls('cx-talk-hand','')==='1');
  const setHand=(v:boolean)=>{setHand0(v);lsSet('cx-talk-hand',v?'1':'');};
  const [picking,setPicking]=useState<{deck:Deck;n:number;skip:number[];pos?:string[];go:(cs:TCard[],jump?:Drawn)=>void}|null>(null);
  const [shut,setShut]=useState<Shut>(()=>new Set()),[skip,setSkip]=useState(false),[menu,setMenu]=useState(false),[moreOf,setMoreOf]=useState<Turn|null>(null),[proof,setProof]=useState(false),[bye,setBye]=useState(false),[guide,setGuide]=useState(false);
  const end=useRef<HTMLDivElement>(null);
  const setDeck=(d:Deck)=>{setDeck0(d);lsSet('cx-talk-deck',d);};
  const n=ns[deck],cycle=()=>{const list=[...NS[deck]].sort(),v=list[(list.indexOf(n)+1)%list.length];setNs({...ns,[deck]:v});lsSet('cx-talk-n-'+deck,String(v));};
  const hereOk=!!t?.turns.some(x=>x.kind==='here'&&x.ok),hereMiss=(t?.turns.filter(x=>x.kind==='here'&&x.ok===false).length??0)+misses,hereWait=!!t?.turns.some(x=>x.kind==='here'&&x.ok===undefined);
  const open=opened||hereOk||skip||!!t?.turns.some(x=>x.kind==='say');
  // 对上过三场以后，开场默认换成轻的「在吗」一张
  const wins=(b.tarot??[]).filter(r=>r.kind==='match'&&r.ok).length+(b.talks??[]).filter(x=>x.turns.some(y=>y.kind==='here'&&y.ok)).length;
  const down=()=>setTimeout(()=>end.current?.scrollIntoView({block:'end',behavior:'smooth'}),60);
  const put=(turn:Omit<Turn,'id'|'at'>)=>{
    const cur=liveTalk(p.id)??{id:uid(),at:Date.now(),turns:[]},x:Turn={...turn,id:uid(),at:Date.now()};
    saveTalk(p.id,{...cur,turns:[...cur.turns,x]});setShut(s=>new Set([...s,...x.cards.map((_,i)=>`${x.id}:${i}`),...(x.more??[]).map((_,i)=>`${x.id}:m${i}`)]));down();
  };
  // 抽牌：默认快抽（整副重洗，直接出牌）；点亮小手就自己洗牌、在牌轮上自己选，洗牌时跳出来的那张记成「跳牌」
  const pull=(d:Deck,k:number,skip:number[],go:(cs:TCard[],jump?:Drawn)=>void,pos?:string[])=>{
    if(hand)setPicking({deck:d,n:k,skip,pos,go:(cs,jump)=>{setPicking(null);go(cs,jump);}});else go(draw(d,k,rev,skip));
  };
  const make=(d:Deck,k:number,rest:Omit<Turn,'id'|'at'|'cards'|'deck'>,skip:number[]=[],pos?:string[])=>
    pull(d,k,skip,(cs,jump)=>put({...rest,deck:d,cards:cs,...(jump?{more:[{...jump,deck:d,why:'jump' as const}]}:{})}),pos);
  const reset=()=>{setText('');setA('');setBb('');setArmed(null);setErr('');};
  const send=()=>{
    const q=text.trim();setErr('');
    if(armed==='yn'){if(!q){setErr('先写下想问的事');return;}make('l',3,{kind:'yn',q},[],lspreads.yn.pos);reset();return;}
    if(armed==='ab'){if(!a.trim()||!bb.trim()){setErr('两个选项都写上');return;}const th=b.lenoWho?.he??HE;make('l',4,{kind:'ab',th,a:a.trim(),b:bb.trim(),q:q||undefined},[th],[a.trim(),a.trim(),bb.trim(),bb.trim()]);reset();return;}
    if(armed&&armed!=='doing'&&armed!=='day3'){onSpread(armed,q);reset();return;}
    if(!open){say('先看看他在不在，或者点「不开场，直接说」');return;}
    if(q&&t?.turns.some(x=>x.kind==='say'&&x.q===q))say('这句刚问过了。牌不合心意，也先别重抽');
    make(deck,n,{kind:'say',q:q||undefined});reset();
  };
  const choose=(k:AskKind|LSpread)=>{
    setMenu(false);setErr('');
    if(k==='match'){onSpread('match','');return;}
    if(k==='doing'||k==='day3'){make('l',3,{kind:k},[],lspreads[k].pos);return;}
    setArmed(k);
  };
  const addMore=(x:Turn,m:Omit<More,'c'|'r'>)=>{
    const cur=liveTalk(p.id);if(!cur)return;
    const used=(dk:Deck)=>[...(x.deck===dk?x.cards:[]),...(x.more??[]).filter(y=>y.deck===dk)].map(d=>d.c);
    setMoreOf(null);
    pull(m.deck,1,used(m.deck),cs=>{
      const now=liveTalk(p.id)?.turns.find(y=>y.id===x.id)??x,i=(now.more??[]).length;
      patchTurn(p.id,cur.id,x.id,{more:[...(now.more??[]),{...m,...cs[0]}]});setShut(s=>new Set([...s,`${x.id}:m${i}`]));down();
    });
  };
  const finish=(withCard:boolean)=>{
    setBye(false);const cur=liveTalk(p.id);if(!cur)return;
    const close=()=>{const now=liveTalk(p.id);if(now)saveTalk(p.id,{...now,end:Date.now()});say('这一场记下了，在「记录」里');};
    if(withCard)pull(deck,deck==='t'?1:3,[],cs=>{put({deck,kind:'bye',cards:cs});close();});
    else close();
  };
  const hereGo=()=>pull('t',1,[],cs=>put({deck:'t',kind:'here',cards:cs}));
  const done=talksOf(p.id).slice(-1)[0],justEnded=!t&&done?.end&&Date.now()-done.end<10*60e3?done:undefined;
  const says=t?.turns.filter(x=>x.kind==='say').length??0,reads=t?.turns.filter(x=>x.read).length??0;
  useEffect(()=>{if(t)down();},[]);
  if(picking)return <div className="tk-rit">
    <Ritual key={picking.deck+picking.n} n={picking.n} rev={rev} what={p.name} pos={picking.pos} skip={picking.deck==='t'?picking.skip:[]} noJump={picking.n===1&&picking.skip.length>0}
      src={picking.deck==='l'?()=>lshuffle(picking.skip).map(c=>({c})):undefined} done={picking.go}/>
    <div className="rowbtn center"><button className="linkish" onClick={()=>setPicking(null)}>先不抽了</button></div>
  </div>;
  const sp=armed&&(armed in lspreads)?lspreads[armed as LSpread]:null,tsp=armed&&!sp?spreads[armed as AskKind]:null;
  return <div className="tk">
    {!t&&!justEnded&&!session.length&&<p className="lede">心里想着 {p.name}，对他说一句话。他用牌回你，你把牌读成他的话。<button className="linkish" onClick={()=>setGuide(true)}>怎么自己传讯</button></p>}
    {justEnded&&<><TalkLog p={p} t={justEnded}/><p className="tk-cap">这一场聊完了。<button className="linkish" onClick={()=>setProof(true)}>让 AI 对一遍</button></p></>}
    {t?<TalkLog p={p} t={t} live shut={shut} open={k=>{setShut(s=>{const v=new Set(s);v.delete(k);return v;});down();}} onMore={setMoreOf} extra={session}/>:session.map(s=>s.node)}
    {t&&(says>0||reads>0)&&<p className="tk-acts end">
      {reads>0&&<button className="linkish" onClick={()=>setProof(true)}>让 AI 对一遍</button>}
      <button className="linkish" onClick={()=>setBye(true)}>先聊到这</button>
    </p>}
    {!open&&!hereWait&&<div className="tk-open">
      <p className="lede">{hereMiss>=2?'今天试过两次了，不用勉强。':`先看看 ${p.name} 在不在。`}</p>
      {hereMiss<2&&<div className="rowbtn center">
        {wins>=3?<><button className="btn sm" onClick={()=>hereGo()}>在吗 · 一张</button><button className="chip" onClick={()=>onSpread('match','')}>对一对 · 三张</button></>
          :<><button className="btn sm" onClick={()=>onSpread('match','')}>对一对 · 三张</button><button className="chip" onClick={()=>hereGo()}>在吗 · 一张</button></>}
      </div>}
      <button className="linkish" onClick={()=>setSkip(true)}>不开场，直接说</button>
    </div>}
    <div ref={end}/>
    <form className="tk-bar" onSubmit={e=>{e.preventDefault();send();}}>
      {(sp||tsp)&&<div className="tk-armed"><span><b>{(sp??tsp)!.name}</b><small>{(sp??tsp)!.when}</small></span><button type="button" className="ico" onClick={reset} aria-label="不用这个牌阵了"><X size={18} strokeWidth={1.8}/></button></div>}
      {armed==='ab'&&<div className="tk-ab"><input value={a} onChange={e=>{setA(e.target.value.slice(0,20));setErr('');}} placeholder="选项一" aria-label="选项一"/><input value={bb} onChange={e=>{setBb(e.target.value.slice(0,20));setErr('');}} placeholder="选项二" aria-label="选项二"/></div>}
      {err&&<p className="tk-err" role="alert">{err}</p>}
      <div className="tk-in">
        {!armed&&<><button type="button" className="tk-deck" onClick={()=>setDeck(deck==='t'?'l':'t')} aria-label={`现在用${deck==='t'?'塔罗':'雷诺曼'}。点一下换成${deck==='t'?'雷诺曼':'塔罗'}`}>{deck==='t'?'塔罗':'雷诺曼'}</button>
          <button type="button" className="tk-n" onClick={cycle} aria-label={`他一次回 ${n} 张。点一下换`}>{n} 张</button></>}
        <input value={text} onChange={e=>{setText(e.target.value.slice(0,80));setErr('');}} enterKeyHint="send" placeholder={armed==='yn'?'想问的事，比如：这周他会来梦里吗':armed==='ab'?'为了什么事在选（可不写）':tsp?`想问 ${p.name} 什么（可不写）`:`对 ${p.name} 说…`} aria-label={armed?'想问的事':'对他说'}/>
        {armed||text.trim()?<button className="tk-send">{armed?'抽牌':'发送'}</button>:<>
          <button type="button" className="ico" aria-pressed={hand} onClick={()=>setHand(!hand)} aria-label={hand?'现在是自己洗牌、自己选。点一下换回快抽':'现在是快抽。点一下改成自己洗牌、自己选'} title="自己抽牌"><Hand size={22} strokeWidth={1.6}/></button>
          <button type="button" className="ico" onClick={()=>setMenu(true)} aria-label="牌阵"><LayoutGrid size={22} strokeWidth={1.6}/></button>
        </>}
      </div>
    </form>
    {menu&&<Sheet title="牌阵" close={()=>setMenu(false)}>
      <p className="hint first">想看他的状态、问一件具体的事时用。牌阵不用开场，结果记成你看到的，不算他说的话。</p>
      <div className="tk-lead"><button onClick={()=>{setMenu(false);if(!open){say('先看看他在不在，或者点「不开场，直接说」');return;}make(deck,n,{kind:'say'});}}><b>请他先说</b><small>你不说话，让他先开口</small></button></div>
      <h3>雷诺曼</h3>
      <div className="tr-kinds">{lspreadIds.map(k=><button key={k} onClick={()=>choose(k)}><b>{lspreads[k].name}</b><small>{lspreads[k].when}</small></button>)}</div>
      <h3>塔罗</h3>
      <div className="tr-kinds">{askKinds.map(k=><button key={k} onClick={()=>choose(k)}><b>{spreads[k].name}{spreads[k].tag&&<i>{spreads[k].tag}</i>}</b><small>{spreads[k].when}</small></button>)}</div>
      <div className="rowbtn"><button className="linkish" onClick={()=>{setMenu(false);onLib();}}>牌库和读牌小抄</button></div>
    </Sheet>}
    {moreOf&&<Sheet title="补一张" close={()=>setMoreOf(null)}>
      <div className="tr-kinds">
        <button onClick={()=>addMore(moreOf,{deck:'l',why:'ok'})}><b>核对</b><small>问他「我读得对吗」。补一张雷诺曼，只看是或不是</small></button>
        <button onClick={()=>addMore(moreOf,{deck:moreOf.deck,why:'go'})}><b>接着说</b><small>让他顺着这句再多说一点</small></button>
        {moreOf.deck==='t'&&moreOf.cards.map((d,i)=><button key={i} onClick={()=>addMore(moreOf,{deck:'l',why:'kw',on:i})}><b>关键词 · {cards[d.c].name}</b><small>给这张塔罗补一张雷诺曼，抓它在说的重点</small></button>)}
      </div>
    </Sheet>}
    {bye&&<Sheet title="先聊到这" close={()=>setBye(false)}>
      <p className="hint first">和 {p.name} 说一声再走。可以让他用牌道个别，也可以直接收起来。</p>
      <div className="rowbtn two"><button className="chip on" onClick={()=>finish(true)}>抽牌道别</button><button className="chip" onClick={()=>finish(false)}>直接结束</button></div>
    </Sheet>}
    {proof&&(t??justEnded)&&<Proof p={p} t={(t??justEnded)!} close={()=>setProof(false)}/>}
    {guide&&<FlowSheet close={()=>setGuide(false)}/>}
  </div>;
}
export function FlowSheet({close}:{close:()=>void}){
  return <Sheet title="怎么自己传讯" close={close}><ol className="tr-guide">{flow.map(([t,x])=><li key={t}><b>{t}</b><p>{x}</p></li>)}</ol></Sheet>;
}

/* ── 牌库 · 雷诺曼 ── */
export function LenoLib({p}:{p:Persona}){
  useVer();
  const b=box(p.id),who=b.lenoWho??{},mine=b.lenoMine??{};
  const [see,setSee]=useState<number|null>(null),[tips,setTips]=useState(false),[busy,setBusy]=useState('');
  const one=useRef<HTMLInputElement>(null),many=useRef<HTMLInputElement>(null);
  const setWho=(k:'he'|'me',v:number)=>setBox(p.id,{lenoWho:{...who,[k]:v}});
  const all=()=>Array.from({length:LTOTAL},(_,i)=>lfaceId(i));
  const change=async(c:number,f?:File)=>{if(!f)return;try{const id=await putImage(f,640,.82),ids=all();ids[c]=id;setLFaces(ids);say('换好了');}catch{say('这张图片读不了，换一张试试');}};
  const bulk=async(fs:FileList|null)=>{
    const list=Array.from(fs??[]).filter(f=>f.type.startsWith('image/')).sort((x,y)=>x.name.localeCompare(y.name,undefined,{numeric:true}));
    if(!list.length)return;
    if(list.length!==LTOTAL){say(`选了 ${list.length} 张，一整套要正好 ${LTOTAL} 张`);return;}
    const ids:string[]=[];
    try{for(let i=0;i<list.length;i++){setBusy(`正在放入 ${i+1} / ${LTOTAL}`);ids.push(await putImage(list[i],640,.82));}setLFaces(ids);say('整套牌面换好了');}catch{say('有图片没放进去，这次没有换');}
    setBusy('');
  };
  const has=all().some(Boolean);
  return <>
    <p className="lede">36 张，不分正逆。画面简单，适合问日常的小事。<button className="linkish" onClick={()=>setTips(true)}>雷诺曼怎么读</button></p>
    <h3>代表牌</h3>
    <p className="hint">牌里出现代表牌，旁边的牌就是在说这个人。默认男士牌是 {p.name}、女士牌是你，也可以和他商量着换。</p>
    <div className="prow"><label htmlFor="lw-he">{p.name}</label><select id="lw-he" value={who.he??HE} onChange={e=>setWho('he',Number(e.target.value))}>{lcards.map((x,i)=><option key={i} value={i} disabled={i===(who.me??ME)}>{x.n} {x.name}</option>)}</select></div>
    <div className="prow"><label htmlFor="lw-me">你</label><select id="lw-me" value={who.me??ME} onChange={e=>setWho('me',Number(e.target.value))}>{lcards.map((x,i)=><option key={i} value={i} disabled={i===(who.he??HE)}>{x.n} {x.name}</option>)}</select></div>
    <h3>牌面</h3>
    <p className="hint">{has?'现在用的是你自己的牌面。':'现在用的是内置的线条牌面。'}想换可以一次选一整套 {LTOTAL} 张图（按 1–36 的文件名排序），也可以点开某一张单独换。</p>
    <div className="rowbtn"><button className="chip" disabled={!!busy} onClick={()=>many.current?.click()}>{busy||'换一整套牌面'}</button>{has&&!busy&&<button className="chip" onClick={()=>{setLFaces([]);say('换回内置牌面了');}}>用回内置牌面</button>}</div>
    <input ref={many} type="file" accept="image/*" multiple hidden onChange={e=>{void bulk(e.target.files);e.target.value='';}} aria-label="选一整套雷诺曼牌面图"/>
    <section className="tr-group"><h3>36 张</h3>
      <div className="tr-grid">{lcards.map((x,c)=><button key={c} className={mine[c]?'mine':''} onClick={()=>setSee(c)} aria-label={`${x.n} ${x.name}${mine[c]?'，写了我们的牌意':''}`}><LFace c={c}/></button>)}</div>
    </section>
    {see!==null&&<CardSheet p={p} deck="l" d={{c:see}} close={()=>setSee(null)}>
      <button className="chip" onClick={()=>one.current?.click()}>换这张的牌面</button>
      {lfaceId(see)&&<button className="chip" onClick={()=>{const ids=all();ids[see]='';setLFaces(ids);}}>这张用回内置的</button>}
      <input ref={one} type="file" accept="image/*" hidden onChange={e=>{const f=e.target.files?.[0];e.target.value='';void change(see,f);}} aria-label="选这张牌的牌面图"/>
    </CardSheet>}
    {tips&&<Sheet title="雷诺曼怎么读" close={()=>setTips(false)}><ol className="tr-guide">{lguide.map(([t,x])=><li key={t}><b>{t}</b><p>{x}</p></li>)}</ol></Sheet>}
  </>;
}

/** 记录里点开一场 */
export function TalkSheet({p,t,close}:{p:Persona;t:Talk;close:()=>void}){
  useVer();
  const [armed,tap]=useTwice(),[proof,setProof]=useState(false);
  const cur=talksOf(p.id).find(x=>x.id===t.id)??t;
  return <Sheet title="和他聊的这一场" close={close}>
    <small className="when">{dayLabel(cur.at)} · {cur.turns.length} 段</small>
    <div className="tk in-sheet"><TalkLog p={p} t={cur}/></div>
    {cur.ai&&<p className="tk-ai"><small>AI 对过的</small>{cur.ai}</p>}
    <div className="rowbtn"><button className="chip" onClick={()=>setProof(true)}>让 AI 对一遍</button>
      <button className="chip danger" onClick={tap('d',()=>{dropTalk(p.id,cur.id);close();})}>{armed==='d'?'再点一次，删掉这一场':'删掉这一场'}</button></div>
    {proof&&<Proof p={p} t={cur} close={()=>setProof(false)}/>}
  </Sheet>;
}
