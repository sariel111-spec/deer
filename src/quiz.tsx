// 问卷：把想问他的写成一份（题库里点一下，或者自己写、整段贴进来），发给他；他答一会儿，交卷了看答卷。
// 等他的时候可以先点一下你猜他会选的，交卷了看对上几题
import {useEffect,useRef,useState} from 'react';
import {X} from 'lucide-react';
import {S,box,setBox,type Persona,type QSheet} from './db';
import {lines,sendSheet} from './engine';
import {Sheet,say} from './pages';
import {enter,useTwice} from './ui';
import {split} from './pickcalc';
import {OPT_MAX,Q_MAX,again,handed,kindOf,onNo,parse,presets,tally,title,uniq,type Draft} from './quizcalc';
import {saveImage} from './dayimg';
import {sheetImage} from './quizimg';

type Paper={name:string;qs:Draft[];sid:string};
const key=(pid:string)=>'cx-quiz:'+pid;
const day=(at:number)=>{const d=new Date(at),n=new Date();return (d.getFullYear()===n.getFullYear()?'':d.getFullYear()+'年')+(d.getMonth()+1)+'月'+d.getDate()+'日';};
const same=(a:Draft[],b:Draft[])=>a.length===b.length&&a.every((x,i)=>x.q===b[i].q&&x.opts.join('\n')===b[i].opts.join('\n'));
const blank=():Paper=>({name:'',qs:[],sid:''});
const asks=['我们是怎么认识的','第一次说话是哪一天','他最常叫我什么','我最喜欢他哪一点','他生气的时候是什么样子','他最常说的一句话','最想和他一起去的地方','一首像他的歌','他让我改变了什么','还没来得及对他说的话'];

export function QuizPage({p,open}:{p:Persona;open:string}){
  const b=box(p.id),sheets=b.sheets??[];
  if(open)return <Paper0 p={p} s={sheets.find(x=>x.id===open)}/>;
  return <Compose p={p} sheets={sheets} old={b.answers}/>;
}

function Compose({p,sheets,old}:{p:Persona;sheets:QSheet[];old:Record<string,string>}){
  // 写到一半去别处再回来，还在（只留在这一次打开里）
  const [d,setD]=useState<Paper>(()=>{try{const v=JSON.parse(sessionStorage.getItem(key(p.id))??'null') as Paper|null;if(v&&Array.isArray(v.qs))return {name:String(v.name??''),sid:String(v.sid??''),qs:v.qs.filter(x=>x&&typeof x.q==='string'&&Array.isArray(x.opts)).slice(0,Q_MAX)};}catch{/* */}return blank();});
  const [tq,setTq]=useState(''),[to,setTo]=useState(''),[ed,setEd]=useState(-1),[,tick]=useState(0);
  const qIn=useRef<HTMLTextAreaElement>(null),oIn=useRef<HTMLInputElement>(null);
  useEffect(()=>{try{sessionStorage.setItem(key(p.id),JSON.stringify(d));}catch{/* */}},[d,p.id]);
  // 列表里「他在答」的那几份，到点自己变成交卷
  const waiting=sheets.some(s=>!handed(s));
  useEffect(()=>{if(!waiting)return;const id=setInterval(()=>tick(x=>x+1),1000);return()=>clearInterval(id);},[waiting]);
  const stop=()=>{setEd(-1);setTq('');setTo('');};
  const add=()=>{
    const q=tq.trim();if(!q)return;
    const o=uniq(split(to)).slice(0,OPT_MAX);
    // 一行一题地贴进来的、或者题目里自己带着「：选项/选项」的，按那样拆；不然就是上面一题、下面选项
    const got:Draft[]=/[\n\r]/.test(q)||!o.length?parse(q):[{q:q.replace(/[:：]\s*$/,'').slice(0,40),opts:o}];
    if(!got.length)return;
    if(got.length===1&&got[0].opts.length===1){say('选项至少写两个；不写就是让他说一句');return;}
    if(ed>=0&&got.length===1){setD(x=>({...x,sid:'',qs:x.qs.map((y,i)=>i===ed?{...got[0],...(y.many&&got[0].opts.length>2?{many:true}:{})}:y)}));stop();return;}
    const room=Q_MAX-d.qs.length,fresh=got.filter(g=>!d.qs.some(y=>y.q===g.q));
    if(!fresh.length){say('这一题已经有了');return;}
    if(room<=0){say(`一份最多 ${Q_MAX} 题`);return;}
    if(fresh.length>room)say(`一份最多 ${Q_MAX} 题，后面的没加上`);
    setD(x=>({...x,sid:'',qs:[...x.qs,...fresh.slice(0,room)]}));stop();
  };
  const edit=(i:number)=>{if(ed===i){stop();return;}const y=d.qs[i];setEd(i);setTq(y.q);setTo(y.opts.join(' '));qIn.current?.focus();};
  const drop=(i:number)=>{setD(x=>({...x,sid:'',qs:x.qs.filter((_,k)=>k!==i)}));stop();};
  // 题库：空着（或者放着的还是没动过的题库）就换成这一组；自己已经写了题，就加在后面
  const load=(id:string)=>{
    const ps=presets.find(x=>x.id===id)!,cur=presets.find(x=>x.id===d.sid),clean=!d.qs.length||(!!cur&&same(cur.qs,d.qs));
    stop();
    if(d.sid===id&&clean){setD(blank());return;}
    if(clean){setD({name:ps.name,qs:ps.qs.map(q=>({...q,opts:[...q.opts]})),sid:id});return;}
    const fresh=ps.qs.filter(g=>!d.qs.some(y=>y.q===g.q)).slice(0,Q_MAX-d.qs.length);
    if(!fresh.length){say(d.qs.length>=Q_MAX?`一份最多 ${Q_MAX} 题`:'这几题已经有了');return;}
    setD(x=>({...x,sid:'',qs:[...x.qs,...fresh.map(q=>({...q,opts:[...q.opts]}))]}));say(`「${ps.name}」加在后面了`);
  };
  const send=()=>{
    if(!d.qs.length)return;
    if(d.qs.some(q=>kindOf(q)==='say')&&!lines(p,1).length){say(`${p.name}还没有字卡，「说一句」的题答不上来`);return;}
    const id=sendSheet(p,d.name,d.qs);
    setD(blank());stop();try{sessionStorage.removeItem(key(p.id));}catch{/* */}
    location.hash='#/f/quiz/'+p.id+'/'+id;
  };
  const olds=asks.map((q,i)=>({q,a:(old[i]??'').trim()})).filter(x=>x.a);
  const hist=[...sheets].reverse();
  return <>
    <div className="pk-quick qz-sets" role="group" aria-label="题库">{presets.map(x=><button key={x.id} className="chip" aria-pressed={d.sid===x.id} onClick={()=>load(x.id)}>{x.name}</button>)}</div>
    {d.qs.length>0&&<input className="pk-q" value={d.name} maxLength={20} onChange={e=>setD(x=>({...x,name:e.target.value}))} placeholder="这份问卷叫什么（可以不写）" aria-label="这份问卷叫什么"/>}
    {d.qs.length>0&&<ol className="qz-list">{d.qs.map((q,i)=><li key={i+q.q} className={ed===i?'ed':''}>
      <button onClick={()=>edit(i)} aria-label={`第 ${i+1} 题：${q.q}。点一下改`}><b>{q.q}</b>
        {q.opts.length?<span className="pk-opts">{q.opts.map(o=><span key={o}>{o}</span>)}{kindOf(q)==='many'&&ed!==i&&<small>可多选</small>}</span>:<small>让他说一句</small>}</button>
      {ed===i&&q.opts.length>2&&<button className="qz-many" aria-pressed={!!q.many} onClick={()=>setD(x=>({...x,sid:'',qs:x.qs.map((y,k)=>k===i?{...y,many:!y.many}:y)}))}>可多选</button>}
      <button className="ico sm" onClick={()=>drop(i)} aria-label={`去掉第 ${i+1} 题`}><X size={17} strokeWidth={1.7}/></button>
    </li>)}</ol>}
    <textarea ref={qIn} className="qz-in" rows={1} value={tq} onChange={e=>setTq(e.target.value)} onKeyDown={e=>{if(enter(e)&&!/[\n\r]/.test(tq)){e.preventDefault();if(to.trim()||/[:：].+/.test(tq)||!tq.trim())add();else oIn.current?.focus();}}} placeholder={d.qs.length?'再问一题':'问他什么，比如 今天想我了吗'} aria-label="问他什么"/>
    <div className="newdeck qz-add"><input ref={oIn} value={to} onChange={e=>setTo(e.target.value)} onKeyDown={e=>{if(enter(e))add();}} placeholder="选项，用空格隔开；不写就让他说一句" aria-label="这一题的选项"/><button className="btn sm" onClick={add} disabled={!tq.trim()}>{ed>=0?'改好了':'加上'}</button></div>
    {!d.qs.length&&<p className="lede">把想问{p.name}的写成一份问卷，他答完交卷。上面的题库点一下就能用，也可以自己写；整段贴进来也行，一行一题，选项写在冒号后面。</p>}
    {d.qs.length>0&&<button className="btn wide" onClick={send}>发给他</button>}
    {hist.length>0&&<ul className="qz-hist" aria-label="问过的问卷">{hist.map(s=>{const t=tally(s),done=handed(s);return <li key={s.id}><a href={'#/f/quiz/'+p.id+'/'+s.id}>
      <span className="pk-row"><b>{title(s)}</b><time>{day(s.at)}</time></span>
      <small>{s.qs.length} 题 · {done?(t.n?`对上 ${t.hit} / ${t.n}`:'已交卷'):`${p.name}在答`}</small></a></li>;})}</ul>}
    {olds.length>0&&<details className="pk-log qz-old"><summary>以前写下的 · {olds.length}</summary>
      <ul className="qa">{olds.map(x=><li key={x.q}><div><b>{x.q}</b><p>{x.a}</p></div></li>)}</ul>
      <button className="linkish" onClick={()=>{void navigator.clipboard?.writeText(olds.map(x=>x.q+'\n'+x.a).join('\n\n')).then(()=>say('复制好了'),()=>say('没复制上，可以长按选中'));}}>全部复制</button>
    </details>}
  </>;
}

/* 一份答卷 */
function Paper0({p,s}:{p:Persona;s?:QSheet}){
  const [now,setNow]=useState(Date.now()),[armed,twice]=useTwice(),[busy,setBusy]=useState(false),[pic,setPic]=useState<{url:string;file:File}|null>(null);
  const done=!!s&&handed(s,now);
  useEffect(()=>{if(!s||done)return;const id=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(id);},[s?.id,done]);
  useEffect(()=>()=>{if(pic)URL.revokeObjectURL(pic.url);},[pic]);
  const back='#/f/quiz/'+p.id;
  if(!s)return <><p className="empty">这份问卷不在了。</p><p className="center"><a className="linkish" href={back}>回到问卷</a></p></>;
  const t=tally(s),me=S().prefs.myName,canGuess=!done&&s.qs.some(q=>q.k==='one');
  const guess=(qi:number,oi:number)=>{
    const cur=box(p.id).sheets?.find(x=>x.id===s.id);if(!cur||handed(cur))return;
    const qs=cur.qs.map((q,i)=>{if(i!==qi)return q;const {mine,...rest}=q;return mine===oi?rest:{...rest,mine:oi};});
    setBox(p.id,{sheets:(box(p.id).sheets??[]).map(x=>x.id===s.id?{...x,qs,u:Date.now()}:x)});
  };
  const drop=()=>{const bx=box(p.id);setBox(p.id,{sheets:(bx.sheets??[]).filter(x=>x.id!==s.id),sheetsGone:[...(bx.sheetsGone??[]),s.id].slice(-200)});say('删掉了');location.replace(back);};
  const redo=()=>{try{sessionStorage.setItem(key(p.id),JSON.stringify({name:s.name??'',qs:again(s),sid:''}));}catch{/* */}location.hash=back;};
  // 敞开问的题更适合交给牌：把这一题带到占牌的输入框里
  const toDraw=(q:string)=>{try{sessionStorage.setItem('cx-ask-draw:'+p.id,JSON.stringify({q,at:Date.now()}));}catch{/* */}location.hash='#/f/draw/'+p.id;};
  const draw=async()=>{
    if(busy)return;setBusy(true);
    try{const blob=await sheetImage(s,me,p.name,day(s.at));setPic({url:URL.createObjectURL(blob),file:new File([blob],`问卷-${title(s).slice(0,12)}.png`,{type:blob.type})});}
    catch{say('这次没画出来，再试一次');}
    setBusy(false);
  };
  return <>
    <div className="qz-head"><a className="linkish" href={back}>全部问卷</a><h2>{title(s)}</h2>
      <p role="status">{day(s.at)} · {done?`${p.name} 填写`:`${p.name}在答 · 第 ${onNo(s,now)} / ${s.qs.length} 题`}{done&&t.n>0?` · 对上 ${t.hit} / ${t.n}`:''}</p></div>
    {canGuess&&<p className="lede">等他交卷的时候，可以先点一下你猜他会选的，交卷了看对上几题。</p>}
    <ol className="qz-paper">{s.qs.map((q,i)=><li key={i}>
      <b>{q.q}{done&&q.k==='one'&&q.mine!==undefined&&<small>{q.got?.[0]===q.mine?'猜对了':'没猜中'}</small>}{q.k==='many'&&<small>可多选</small>}{done&&q.k==='say'&&<small><button className="qz-draw" onClick={()=>toDraw(q.q)}>拿去占</button></small>}</b>
      {q.k==='say'?(done?<p className="qz-say">{(q.said??[]).map((x,k)=><span key={k}>{x}</span>)}</p>:<span className="dots" aria-label="还没说"><i/><i/><i/></span>)
        :<span className="pk-opts qz-ops">{(q.opts??[]).map((o,k)=>{
          const his=done&&!!q.got?.includes(k),mine=q.mine===k;
          return !done&&q.k==='one'?<button key={o} className={mine?'mine':''} aria-pressed={mine} onClick={()=>guess(i,k)}>{o}</button>
            :<span key={o} className={(his?'on':'')+(mine?' mine':'')} aria-label={his||mine?`${o}（${[his&&p.name+'选的',mine&&'你猜的'].filter(Boolean).join('，')}）`:undefined}>{o}</span>;})}</span>}
    </li>)}</ol>
    <div className="rowbtn qz-acts">
      {done&&<button className="chip" onClick={draw} disabled={busy}>{busy?'在画…':'存成图片'}</button>}
      {done&&<button className="chip" onClick={redo}>再问一次</button>}
      <button className="chip danger" onClick={twice('drop',drop)}>{armed==='drop'?'再点一次，删除':done?'删除':'不问了'}</button>
    </div>
    {pic&&<Sheet title="存成图片" close={()=>setPic(null)}>
      <img className="dy-card qz-card" src={pic.url} alt={`${title(s)}的答卷`}/>
      <div className="rowbtn two"><button className="btn ghost" onClick={()=>setPic(null)}>返回</button><button className="btn" onClick={async()=>{if(await saveImage(pic.file,pic.url))say('存下来了');}}>存下来</button></div>
    </Sheet>}
  </>;
}
