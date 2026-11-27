import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {flushSync} from 'react-dom';
import {House,Layers,MessageCircle,Settings2,SquarePen} from 'lucide-react';
import {S,addPersona,getImage,peekImage,importAll,list,storageDown,unread,useVer,who} from './db';
import {isTyping} from './engine';
import {Cards,Settings,Home,Sheet,SyncPanel,say,Toast} from './pages';
import {Chat,peek} from './chat';
import {Feature} from './more';
import {CallLayer} from './call';
import {auto,enter} from './ui';

export const go=(h:string)=>{location.hash=h;};
const hhmm=(t:number)=>new Date(t).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',hour12:false});
export const dayLabel=(t:number)=>{
  const d=new Date(t),n=new Date();
  const days=Math.round((new Date(n.getFullYear(),n.getMonth(),n.getDate()).getTime()-new Date(d.getFullYear(),d.getMonth(),d.getDate()).getTime())/864e5);
  const day=days===0?'今天':days===1?'昨天':days<7?'周'+'日一二三四五六'[d.getDay()]:`${d.getFullYear()===n.getFullYear()?'':d.getFullYear()+'年'}${d.getMonth()+1}月${d.getDate()}日`;
  return day+' '+hhmm(t);
};
const brief=(t:number)=>{const s=(Date.now()-t)/1000;return s<60?'刚刚':s<3600?Math.floor(s/60)+' 分钟前':s<86400?Math.floor(s/3600)+' 小时前':Math.floor(s/86400)+' 天前';};

/* ── 换页 ──
   点出来的（不算底栏那四个之间）：新旧两页原地淡入淡出，不挪位置。
   不是点出来的（iPhone 从屏幕边上划回去、浏览器的前进后退）：系统自己有动画，这里当场换好、什么都不加——
   划回去之后再淡一遍，就会看到上一页的影子在新页面上闪一下。
   回到上一页时停在离开时滚到的位置（系统划回去时垫在下面的那张截图就是那个位置，对不上会跳）。 */
const tap={at:0,tabs:false,used:true},edge={x:-1,at:0};
if(typeof window!=='undefined'){
  addEventListener('click',e=>{tap.at=performance.now();tap.used=false;tap.tabs=!!(e.target as HTMLElement|null)?.closest?.('.tabs');},true);
  // 手指从屏幕边上起步、横着走了一段或者被系统接了过去：这是在划回去，不是点
  addEventListener('touchstart',e=>{const t=e.touches[0];edge.x=e.touches.length===1&&(t.clientX<=30||t.clientX>=innerWidth-30)?t.clientX:-1;},{capture:true,passive:true});
  addEventListener('touchmove',e=>{if(edge.x>=0&&Math.abs(e.touches[0].clientX-edge.x)>12)edge.at=performance.now();},{capture:true,passive:true});
  addEventListener('touchcancel',()=>{if(edge.x>=0)edge.at=performance.now();edge.x=-1;},{capture:true,passive:true});
  addEventListener('touchend',()=>{edge.x=-1;},{capture:true,passive:true});
}
type VT=Document&{startViewTransition?:(f:()=>void)=>unknown};
// 上一页是哪儿。从聊天点进功能页、主页，返回时回到聊天而不是一律回主页
export const nav={from:''};
// 浏览器历史里的每一页编一个号（记在 history.state 里）：号变小了就是往回走。每一页离开时滚到哪儿，照这个号记着
const stamp=():number|undefined=>{try{const v=(history.state as {i?:unknown}|null)?.i;return typeof v==='number'?v:undefined;}catch{return undefined;}};
const route={shown:typeof location!=='undefined'?location.hash:'',i:0,top:0,tops:new Map<number,number>(),set:null as ((h:string)=>void)|null};
if(typeof window!=='undefined'){const v=stamp();if(v===undefined){try{history.replaceState({...(history.state as object|null),i:0},'');}catch{/* */}}else route.i=v;}
function turn(){
  const to=location.hash;if(to===route.shown||!route.set)return;
  const now=performance.now(),sc=document.querySelector<HTMLElement>('main.page');
  if(sc)route.tops.set(route.i,sc.scrollTop);
  let v=stamp(),old=false;
  if(v===undefined){v=Math.max(route.i,...route.tops.keys())+1;try{history.replaceState({...(history.state as object|null),i:v},'');}catch{/* */}}   // 新走到的一页
  else old=true;                                                                                       // 历史里已有的一页：往回或者往前
  route.top=old?route.tops.get(v)??0:0;route.i=v;
  nav.from=route.shown;route.shown=to;
  const d=document as VT,w=window as unknown as {__ghost?:number};
  const byHand=!tap.used&&now-tap.at<200&&now-edge.at>900;tap.used=true;   // 点出来的换页紧跟着那一下点（几十毫秒）；手指划一趟回去至少要两三百毫秒，所以隔得久的不算点出来的
  const fade=byHand&&!tap.tabs&&typeof d.startViewTransition==='function'&&!matchMedia('(prefers-reduced-motion:reduce)').matches&&!(navigator.webdriver&&!w.__ghost);
  // 当场换好：等到下一帧再换的话，划回去松手后会先露一下刚才那一页。换页时开着的小页跟着旧页面一起走，不留下落的影子（over.tsx 看这个记号）
  const root=document.documentElement,update=()=>{root.dataset.turn='1';try{flushSync(()=>route.set!(to));}finally{delete root.dataset.turn;}};
  if(fade){try{d.startViewTransition!(update);return;}catch{/* 不行就直接换 */}}
  update();
}
export const backTo=(fallback:string)=>(e:React.MouseEvent)=>{if(nav.from&&nav.from!==location.hash){e.preventDefault();history.back();}else if(!fallback)e.preventDefault();};
// 读过一次的图当场就画（peekImage）；第一次用到的才去库里取。now：头像这样的小图，和页面同一帧画出来
export function Pic({id,className,alt='',now}:{id?:string;className?:string;alt?:string;now?:boolean}){
  const [got,setGot]=useState<{id?:string;src:string}>({src:''});
  const have=id?peekImage(id):'',src=have||(got.id===id?got.src:'');
  useEffect(()=>{let on=true;if(id&&!peekImage(id))void getImage(id).then(v=>{if(on)setGot({id,src:v});});return()=>{on=false;};},[id]);
  return src?<img className={className} src={src} alt={alt} draggable={false} referrerPolicy="no-referrer" decoding={now?'sync':undefined}/>:null;
}
export function Avatar({id,name,size=40}:{id?:string;name:string;size?:number}){
  return <span className="avatar" style={{width:size,height:size,fontSize:size*.42}} aria-hidden="true">
    {id?<Pic id={id} now/>:<b>{[...name][0]??'·'}</b>}
  </span>;
}

export function App(){
  useVer();
  const [hash,setHash]=useState(location.hash);
  // popstate 比 hashchange 早到（划回去松手的那一刻就到）：两个都听，先到的那个换页，后到的发现已经换过了就不动
  useEffect(()=>{route.set=setHash;addEventListener('popstate',turn);addEventListener('hashchange',turn);return()=>{route.set=null;removeEventListener('popstate',turn);removeEventListener('hashchange',turn);};},[]);
  useLayoutEffect(()=>{const sc=document.querySelector<HTMLElement>('main.page');if(sc&&route.top>0)sc.scrollTop=route.top;route.top=0;},[hash]);
  const st=S(),theme=st.prefs.theme;
  useEffect(()=>{document.documentElement.dataset.theme=theme;document.documentElement.dataset.bubble=st.prefs.bubble;},[theme,st.prefs.bubble]);

  const [,a,b,c]=hash.replace(/^#\/?/,'/').split('/');
  let page:React.ReactNode;
  if(storageDown())return <div className="app"><main className="page down" role="status"><p>这台设备上的数据这一下没读出来，正在重试…</p><p className="hint">你的记录没有动。几秒后还是这样的话，把小鹿划掉重新打开一次。</p><button className="btn" onClick={()=>location.reload()}>重新打开</button></main></div>;
  if(!st.personas.length)page=<Welcome/>;
  else if(a==='inbox')page=<Inbox/>;
  else if(a==='cards')page=<Cards deckId={b}/>;
  else if(a==='set')page=<Settings sec={b}/>;
  else if(a==='f'){const p=who(c)??who(st.prefs.last)??st.personas[0];page=<Feature key={b+p.id} id={b} p={p}/>;}
  else if(a==='c'){const p=who(b)??who(st.prefs.last)??st.personas[0];page=<Chat key={p.id} p={p}/>;}
  else{const p=(a==='us'?who(b):undefined)??who(st.prefs.last)??st.personas[0];page=<Home key={p.id} p={p}/>;}
  const home=a!=='inbox'&&a!=='cards'&&a!=='set'&&a!=='c'&&a!=='f';
  const tabs=st.personas.length>0&&a!=='c'&&a!=='f'&&!(a==='cards'&&b);
  const n=st.personas.reduce((x,p)=>x+unread(p),0);
  return <div className="app">
    {page}
    {tabs&&<nav className="tabs" aria-label="主导航">
      <a href="#/" aria-current={home?'page':undefined} aria-label="主页"><House size={25} strokeWidth={home?2.2:1.6}/></a>
      <a href={st.personas.length===1?'#/c/'+st.personas[0].id:'#/inbox'} aria-current={a==='inbox'?'page':undefined} aria-label={`消息${n?`，${n} 条未读`:''}`}><MessageCircle size={25} strokeWidth={a==='inbox'?2.2:1.6}/>{n>0&&<i/>}</a>
      <a href="#/cards" aria-current={a==='cards'?'page':undefined} aria-label="字卡"><Layers size={25} strokeWidth={a==='cards'?2.2:1.6}/></a>
      <a href="#/set" aria-current={a==='set'?'page':undefined} aria-label="设置"><Settings2 size={25} strokeWidth={a==='set'?2.2:1.6}/></a>
    </nav>}
    <CallLayer/>
    <Toast/>
  </div>;
}

function Welcome(){
  const [name,setName]=useState(''),[sync,setSync]=useState(false);
  const back=useRef<HTMLInputElement>(null);
  const start=()=>{const n=name.trim();if(!n)return;const p=addPersona(n);go('#/us/'+p.id);};
  return <main className="welcome">
    <img src="./icon-192.png" alt="" width={84} height={84}/>
    <h1>想和谁说话</h1>
    <p>先写下他的名字。头像、字卡、回复的节奏，进去之后都可以慢慢调。</p>
    <input value={name} onChange={e=>setName(e.target.value)} onKeyDown={e=>{if(enter(e))start();}} placeholder="他的名字" aria-label="他的名字" autoFocus/>
    <button className="btn" onClick={start} disabled={!name.trim()}>开始</button>
    <small>所有内容只存在这台设备上。回复是从你放进去的字卡里随机抽的。</small>
    <button className="linkish" onClick={()=>setSync(true)}>在别的设备上用过？连接同步把数据拿回来</button>
    <button className="linkish" onClick={()=>back.current?.click()}>或者导入一份备份文件</button>
    <input ref={back} type="file" accept="application/json,.json" hidden onChange={async e=>{const f=e.target.files?.[0];e.target.value='';if(!f)return;try{await importAll(await f.text());say('导入好了');}catch(x){say(x instanceof Error?x.message:'这个文件读不了');}}}/>
    {sync&&<Sheet title="同步" close={()=>setSync(false)}><SyncPanel/></Sheet>}
  </main>;
}

function Inbox(){
  const st=S();
  const [add,setAdd]=useState(false);
  const rows=[...st.personas].sort((x,y)=>(list(y.id).at(-1)?.at??y.created)-(list(x.id).at(-1)?.at??x.created));
  return <main className="page">
    <header className="bar"><h1>{st.prefs.myName}</h1><button className="ico" onClick={()=>setAdd(true)} aria-label="添加一位"><SquarePen size={23} strokeWidth={1.7}/></button></header>
    <h2 className="label">消息</h2>
    <ul className="inbox">{rows.map(p=>{
      const last=list(p.id).at(-1),n=unread(p);
      return <li key={p.id}><a href={'#/c/'+p.id} className={n?'new':''}>
        <Avatar id={p.avatar} name={p.name} size={56}/>
        <span className="who"><b>{p.name}</b>
          <span>{isTyping(p.id)?'正在输入…':last?<>{last.from==='me'&&last.kind!=='tip'?'你：':''}{peek(last)} · {brief(last.at)}</>:'还没有说过话'}</span></span>
        {n>0&&<i aria-label={`${n} 条未读`}>{n}</i>}
      </a></li>;
    })}</ul>
    {add&&<NewPersona close={()=>setAdd(false)}/>}
  </main>;
}
function NewPersona({close}:{close:()=>void}){
  const [name,setName]=useState('');
  const ok=()=>{const n=name.trim();if(!n)return;const p=addPersona(n);close();go('#/c/'+p.id);};
  return <Sheet title="添加一位" close={close}>
    <label className="field"><span>他的名字</span><input value={name} onChange={e=>setName(e.target.value)} onKeyDown={e=>{if(enter(e))ok();}} autoFocus={auto}/></label>
    <p className="hint">现有的字卡分组会默认都给他用，之后可以在「字卡」里改成只给某几位。</p>
    <button className="btn" onClick={ok} disabled={!name.trim()}>添加</button>
  </Sheet>;
}
