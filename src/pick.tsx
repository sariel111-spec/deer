// 帮我选：写下选项，让他替你挑一个。「要不要」一点就来；常纠结的可以存成常用；选过的留一小段记录
import {useEffect,useRef,useState} from 'react';
import {Check,X} from 'lucide-react';
import {box,pushMsg,setBox,uid,type Persona} from './db';
import {Avatar} from './App';
import {lines} from './engine';
import {say} from './pages';
import {enter,useTwice} from './ui';
import {PICK_MAX,split,steps} from './pickcalc';

type Draft={q:string;opts:string[];sid:string};
const YESNO=['要','不要'];
const key=(pid:string)=>'cx-pick:'+pid;
const day=(at:number)=>{const d=new Date(at),n=new Date();return (d.getFullYear()===n.getFullYear()?'':d.getFullYear()+'年')+(d.getMonth()+1)+'月'+d.getDate()+'日';};

export function PickPage({p}:{p:Persona}){
  const b=box(p.id),saved=b.pickSaved??[],log=b.pickLog??[];
  // 写到一半去别处再回来，还在（只留在这一次打开里）
  const [d,setD]=useState<Draft>(()=>{try{const v=JSON.parse(sessionStorage.getItem(key(p.id))??'null') as Draft|null;if(v&&Array.isArray(v.opts))return {q:String(v.q??''),opts:v.opts.map(String).slice(0,PICK_MAX),sid:String(v.sid??'')};}catch{/* */}return {q:'',opts:[],sid:''};});
  const [t,setT]=useState(''),[hi,setHi]=useState(-1),[phase,setPhase]=useState<'idle'|'spin'|'think'|'done'>('idle'),[said,setSaid]=useState(''),[posted,setPosted]=useState(false),[armed,twice]=useTwice();
  const timer=useRef(0),box0=useRef<HTMLDivElement>(null);
  useEffect(()=>{try{sessionStorage.setItem(key(p.id),JSON.stringify(d));}catch{/* */}},[d,p.id]);
  useEffect(()=>()=>clearTimeout(timer.current),[]);
  const busy=phase==='spin'||phase==='think';
  const reset=()=>{clearTimeout(timer.current);setHi(-1);setPhase('idle');setSaid('');setPosted(false);};
  const put=(patch:Partial<Draft>)=>{setD(x=>({...x,...patch}));reset();};
  const add=()=>{
    const got=split(t);if(!got.length)return;
    const next=[...d.opts];let dup=0,over=0;
    for(const x of got){if(next.includes(x))dup++;else if(next.length>=PICK_MAX)over++;else next.push(x);}
    if(over)say(`最多 ${PICK_MAX} 个选项`);else if(dup&&next.length===d.opts.length)say('已经有这个了');
    put({opts:next});setT('');
  };
  const run=(opts=d.opts)=>{
    if(opts.length<2||busy)return;
    clearTimeout(timer.current);setSaid('');setPosted(false);
    const target=Math.floor(Math.random()*opts.length);
    const land=()=>{
      setHi(target);setPhase('think');
      timer.current=window.setTimeout(()=>{
        setSaid(lines(p,1)[0]??'就这个');setPhase('done');
        const old=box(p.id).pickLog??[];
        setBox(p.id,{pickLog:[{at:Date.now(),q:d.q.trim(),opts,got:opts[target]},...old].slice(0,30)});
        requestAnimationFrame(()=>box0.current?.scrollIntoView({block:'nearest',behavior:'smooth'}));
      },matchMedia('(prefers-reduced-motion:reduce)').matches?0:650);
    };
    if(matchMedia('(prefers-reduced-motion:reduce)').matches){land();return;}
    setPhase('spin');
    const seq=steps(opts.length,target);let k=0;
    const tick=()=>{setHi(seq[k].i);if(k===seq.length-1){land();return;}timer.current=window.setTimeout(tick,seq[k++].ms);};
    tick();
  };
  const drop=()=>{const next=d.opts.filter((_,i)=>i!==hi);setD(x=>({...x,opts:next}));reset();if(next.length>=2)setTimeout(()=>run(next),60);};
  const load=(s:{id:string;q:string;opts:string[]})=>{if(busy)return;if(d.sid===s.id){put({sid:''});return;}put({q:s.q,opts:[...s.opts],sid:s.id});};
  const keep=()=>{
    const q=d.q.trim(),name=q||d.opts.slice(0,2).join('、')+(d.opts.length>2?'…':'');
    const same=saved.find(s=>s.id===d.sid)??saved.find(s=>s.q===name);
    const item={id:same?.id??uid(),q:name,opts:[...d.opts]};
    setBox(p.id,{pickSaved:same?saved.map(s=>s.id===item.id?item:s):[...saved,item].slice(-12)});
    setD(x=>({...x,sid:item.id}));say(same?'常用的那一份更新了':'存到常用了');
  };
  // 发到聊天：我这边一张小卡（问题、选项、他选的），他那边是刚才说的那句。发完就过去，可以接着聊
  const post=()=>{
    if(posted||hi<0||d.opts[hi]===undefined)return;
    const now=Date.now();
    pushMsg({pid:p.id,from:'me',kind:'text',text:d.q.trim()||'帮我选一个',at:now,seen:now,pk:{opts:[...d.opts],got:d.opts[hi]}});
    if(said)pushMsg({pid:p.id,from:'ta',kind:'text',text:said,at:now+1});
    setPosted(true);location.hash='#/c/'+p.id;
  };
  const cur=saved.find(s=>s.id===d.sid),same=!!cur&&cur.q===(d.q.trim()||cur.q)&&cur.opts.join('\n')===d.opts.join('\n');
  const yesno=d.opts.length===2&&d.opts[0]===YESNO[0]&&d.opts[1]===YESNO[1]&&!d.sid;
  return <>
    <div className="pk-quick" role="group" aria-label="常用的">
      <button className="chip" aria-pressed={yesno} onClick={()=>{if(busy)return;put(yesno?{opts:[]}:{opts:[...YESNO],sid:''});}}>要不要</button>
      {saved.map(s=><button key={s.id} className="chip" aria-pressed={d.sid===s.id} onClick={()=>load(s)}>{s.q}</button>)}
    </div>
    <input className="pk-q" value={d.q} maxLength={30} onChange={e=>setD(x=>({...x,q:e.target.value}))} placeholder="在纠结什么（可以不写）" aria-label="在纠结什么"/>
    <div className="newdeck"><input value={t} onChange={e=>setT(e.target.value)} onKeyDown={e=>{if(enter(e))add();}} placeholder={d.opts.length?'再写一个':'写一个选项，比如 奶茶'} aria-label="一个选项" disabled={busy}/><button className="btn sm" onClick={add} disabled={!t.trim()||busy}>加上</button></div>
    {!d.opts.length&&<p className="lede">纠结的时候，把选项写下来，让他替你挑一个。一次写好几个也行，用顿号或空格隔开。</p>}
    <ul className="opts">{d.opts.map((o,i)=><li key={o} className={i===hi?'on':''}><span>{o}</span>{i===hi&&(phase==='think'||phase==='done')?<small className="pk-his">{p.name}选的</small>:<button className="ico sm" disabled={busy} onClick={()=>put({opts:d.opts.filter(x=>x!==o)})} aria-label={`去掉 ${o}`}><X size={17} strokeWidth={1.7}/></button>}</li>)}</ul>
    {d.opts.length>0&&<button className="btn wide" onClick={()=>run()} disabled={d.opts.length<2||busy}>{busy?'他在想…':phase==='done'?'再选一次':d.opts.length<2?'再写一个才能选':'让他选'}</button>}
    <div ref={box0} aria-live="polite">
      {phase==='think'&&<div className="said"><Avatar id={p.avatar} name={p.name} size={28}/><span className="dots" aria-label="他在想"><i/><i/><i/></span></div>}
      {phase==='done'&&hi>=0&&d.opts[hi]!==undefined&&<><div className="said pk-got"><Avatar id={p.avatar} name={p.name} size={28}/><div><span><b>{d.opts[hi]}</b></span><span>{said}</span></div></div>
        <div className="rowbtn pk-acts">
          {d.opts.length>2&&<button className="chip" onClick={drop}>去掉它再选</button>}
          <button className="chip" onClick={post}>发到聊天</button>
          {!yesno&&!same&&<button className="chip" onClick={keep}>{cur?'更新常用':'存成常用'}</button>}
        </div></>}
    </div>
    {cur&&phase!=='spin'&&phase!=='think'&&<p className="pk-cur"><button className="linkish" onClick={twice('unsave',()=>{setBox(p.id,{pickSaved:saved.filter(s=>s.id!==cur.id)});setD(x=>({...x,sid:''}));say('从常用里拿掉了');})}>{armed==='unsave'?`再点一次，把「${cur.q}」从常用里拿掉`:`把「${cur.q}」从常用里拿掉`}</button></p>}
    {log.length>0&&<details className="pk-log"><summary>选过的 · {log.length}</summary>
      <ul>{log.map(l=><li key={l.at}><button onClick={()=>{if(busy)return;put({q:l.q,opts:[...l.opts],sid:''});document.querySelector('main.page')?.scrollTo({top:0,behavior:'smooth'});}} aria-label={`${l.q||'帮我选'}：${l.opts.join('、')}，他选了 ${l.got}。点一下再用这些选项`}>
        <span className="pk-row"><b>{l.q||'帮我选'}</b><time>{day(l.at)}</time></span>
        <span className="pk-opts">{l.opts.map(o=><span key={o} className={o===l.got?'on':''}>{o===l.got&&<Check size={12} strokeWidth={2.4} aria-hidden="true"/>}{o}</span>)}</span></button></li>)}</ul>
      <button className="linkish" onClick={twice('clear',()=>{setBox(p.id,{pickLog:[]});})}>{armed==='clear'?'再点一次，清掉这些记录':'清掉这些记录'}</button>
    </details>}
  </>;
}
