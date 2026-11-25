// 视频通话的界面：整屏的通话、缩成顶上一粒的「通话中」、他打过来时的来电卡。
// 通话本身只是一个开始时刻（存在数据里），所以划掉小鹿、挂到后台、换一台设备，回来都还在通话中；只有你点挂断才结束。
import {useEffect,useRef,useState,useSyncExternalStore} from 'react';
import {ChevronDown,ImagePlus,Phone,SwitchCamera,Video,VideoOff} from 'lucide-react';
import {S,box,putImage,setPersona,useVer,who,type Persona} from './db';
import {callDecline,callEnd,callStart,clock,lines,onCall,ringing} from './engine';
import {blip,onPip,pipBlocked,pipCall,pipCan,pipEnter,pipLeave,pipOn} from './alive';
import {Avatar,Pic} from './App';
import {say} from './pages';

/* 界面上的状态（只在这台设备上）：整屏还是缩着、是不是正在拨出去 */
let full=false,dialing='';
let dialT=0;
const subs=new Set<()=>void>();
const emit=()=>subs.forEach(f=>f());
const useUi=()=>useSyncExternalStore(f=>{subs.add(f);return()=>{subs.delete(f);};},()=>(full?'1':'0')+dialing);
/** 从聊天里点视频：没在通话就拨过去，在通话就回到通话画面 */
export function callOpen(pid:string){
  const on=onCall();
  if(on){if(on.id!==pid)say(`正在和${on.name}通话，先挂断那边`);else expand();return;}
  if(dialing)return;
  dialing=pid;full=true;emit();
  // 响两三声他就接
  dialT=window.setTimeout(()=>{const id=dialing;dialing='';if(!callStart(id))full=false;emit();},1600+Math.random()*2200);
}
const hang=(pid:string)=>{clearTimeout(dialT);if(dialing){dialing='';}else callEnd(pid);full=false;emit();};
// 缩小：应用里留一个可以拖的小窗；浏览器肯给系统小窗（画中画）的话顺手开一个，切到别的 app 它也浮着
const shrink=()=>{full=false;emit();if(pipCan()&&!pipBlocked())void pipEnter();};
const expand=()=>{full=true;emit();if(pipOn())void pipLeave();};
let spot:{x:number;y:number}|null=null;

export function CallLayer(){
  useVer();useUi();
  const [,tick]=useState(0);
  const on=onCall(),ring=ringing(),p=dialing?who(dialing):on;
  useEffect(()=>{if(!on&&!ring)return;const t=setInterval(()=>tick(n=>n+1),1000);return()=>clearInterval(t);},[!!on,!!ring]);
  useEffect(()=>onPip(()=>tick(n=>n+1)),[]);
  // 系统小窗里画的内容跟着通话走；挂断了就收掉
  const since=on?box(on.id).call?.at??0:0,shot=on?on.callPic??on.avatar:undefined;
  useEffect(()=>{pipCall(on&&since?{name:on.name,pic:shot,at:since}:null);},[on?.id,on?.name,shot,since]);
  // 他打过来：隔一会儿响一下、震一下，直到接了、拒了或者响完
  useEffect(()=>{if(!ring||on)return;const beep=()=>{if(document.hidden)return;blip();try{navigator.vibrate?.([180,120,180]);}catch{/* */}};beep();const t=setInterval(beep,2400);return()=>clearInterval(t);},[ring?.id,!!on]);
  return <>
    {p&&full&&<CallScreen p={p} since={dialing?0:box(p.id).call?.at??0}/>}
    {on&&!full&&!pipOn()&&<Mini p={on} since={since}/>}
    {ring&&!on&&!dialing&&<div className="ringveil" role="dialog" aria-modal="true" aria-label={`${ring.name}邀请你视频通话`}>
      <div className="ringcard">
        <Avatar id={ring.avatar} name={ring.name} size={92}/>
        <b>{ring.name}</b><span>邀请你视频通话</span>
        <div className="ringkeys">
          <button className="no" onClick={()=>callDecline(ring.id)}><i><Phone size={26} strokeWidth={2}/></i>拒绝</button>
          <button className="yes" onClick={()=>{if(callStart(ring.id))expand();}}><i><Video size={26} strokeWidth={2}/></i>接听</button>
        </div>
      </div>
    </div>}
  </>;
}

/* 缩小后的小窗：他的画面加通话时长，可以拖到不挡事的地方，点一下回到整屏 */
function Mini({p,since}:{p:Persona;since:number}){
  const [pos,setPos]=useState(spot);
  const d=useRef({on:false,moved:false,x:0,y:0,ox:0,oy:0});
  const down=(e:React.PointerEvent<HTMLButtonElement>)=>{const r=e.currentTarget.getBoundingClientRect();d.current={on:true,moved:false,x:e.clientX,y:e.clientY,ox:r.left,oy:r.top};e.currentTarget.setPointerCapture(e.pointerId);};
  const move=(e:React.PointerEvent<HTMLButtonElement>)=>{
    const s=d.current;if(!s.on)return;
    const dx=e.clientX-s.x,dy=e.clientY-s.y;if(!s.moved&&Math.abs(dx)<6&&Math.abs(dy)<6)return;
    s.moved=true;const w=e.currentTarget.offsetWidth,h=e.currentTarget.offsetHeight;
    spot={x:Math.max(8,Math.min(innerWidth-w-8,s.ox+dx)),y:Math.max(8,Math.min(innerHeight-h-8,s.oy+dy))};setPos(spot);
  };
  const up=()=>{const s=d.current;if(s.on&&!s.moved)expand();s.on=false;};
  const pic=p.callPic??p.avatar;
  return <button className="callmini" style={pos?{left:pos.x,top:pos.y,right:'auto'}:undefined} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={()=>{d.current.on=false;}}
    onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();expand();}}} aria-label={`正在和${p.name}视频通话，回到通话画面`}>
    {pic?<Pic id={pic}/>:<Avatar id={undefined} name={p.name} size={52}/>}
    <time>{clock(Date.now()-since)}</time>
  </button>;
}

function CallScreen({p,since}:{p:Persona;since:number}){
  const st=S(),live=since>0;
  const [cam,setCam]=useState(()=>{try{return localStorage.getItem('cx-cam')!=='0';}catch{return true;}});
  const [side,setSide]=useState<'user'|'environment'>('user');
  const [seen,setSeen]=useState(!document.hidden);
  const [sub,setSub]=useState('');
  const [pos,setPos]=useState<{x:number;y:number}|null>(null);
  const video=useRef<HTMLVideoElement>(null),pic=useRef<HTMLInputElement>(null),drag=useRef({on:false,x:0,y:0,ox:0,oy:0});
  useEffect(()=>{const f=()=>setSeen(!document.hidden);document.addEventListener('visibilitychange',f);return()=>document.removeEventListener('visibilitychange',f);},[]);
  // 自己的画面：只在接通、开着摄像头、人在前台的时候取，离开就放掉。画面只在这台设备上显示，不会传到任何地方
  useEffect(()=>{
    if(!live||!cam||!seen)return;
    let dead=false,stream:MediaStream|null=null;
    const md=navigator.mediaDevices;
    if(!md?.getUserMedia){setCam(false);return;}
    md.getUserMedia({video:{facingMode:side},audio:false}).then(s=>{
      if(dead){s.getTracks().forEach(t=>t.stop());return;}
      stream=s;const v=video.current;if(v){v.srcObject=s;void v.play().catch(()=>{});}
      try{if(!localStorage.getItem('cx-cam-told')){localStorage.setItem('cx-cam-told','1');say('你的画面只在这台设备上显示，不会传到任何地方');}}catch{/* */}
    }).catch(()=>{if(!dead){setCam(false);say('摄像头没有打开，先用头像代替');}});
    return()=>{dead=true;stream?.getTracks().forEach(t=>t.stop());};
  },[live,cam,side,seen]);
  // 他偶尔说一句，像字幕一样浮一会儿
  useEffect(()=>{
    if(!live)return;
    let t=0,h=0;
    const next=()=>{t=window.setTimeout(()=>{const l=lines(p,1)[0];if(l){setSub(l);h=window.setTimeout(()=>setSub(''),6500);}next();},18000+Math.random()*50000);};
    next();return()=>{clearTimeout(t);clearTimeout(h);};
  },[live,p.id]);
  useEffect(()=>{const on=(e:KeyboardEvent)=>{if(e.key==='Escape'&&live)shrink();};addEventListener('keydown',on);return()=>removeEventListener('keydown',on);},[live]);
  const toggleCam=()=>{const v=!cam;setCam(v);try{localStorage.setItem('cx-cam',v?'1':'0');}catch{/* */}};
  // 自己的小窗可以拖到不挡画面的地方
  const down=(e:React.PointerEvent<HTMLDivElement>)=>{const r=e.currentTarget.getBoundingClientRect(),host=e.currentTarget.parentElement!.getBoundingClientRect();drag.current={on:true,x:e.clientX,y:e.clientY,ox:r.left-host.left,oy:r.top-host.top};e.currentTarget.setPointerCapture(e.pointerId);};
  const move=(e:React.PointerEvent<HTMLDivElement>)=>{
    const d=drag.current;if(!d.on)return;
    const host=e.currentTarget.parentElement!.getBoundingClientRect(),w=e.currentTarget.offsetWidth,h=e.currentTarget.offsetHeight;
    setPos({x:Math.max(10,Math.min(host.width-w-10,d.ox+e.clientX-d.x)),y:Math.max(10,Math.min(host.height-h-10,d.oy+e.clientY-d.y))});
  };
  const up=()=>{drag.current.on=false;};
  return <div className="call" role="dialog" aria-modal="true" aria-label={`和${p.name}视频通话`}>
    {p.callPic?<Pic id={p.callPic} className="chim"/>:p.avatar?<Pic id={p.avatar} className="chim blur"/>:null}
    <header className="call-top">
      {live?<button className="ico" onClick={shrink} aria-label="缩小，回去聊天"><ChevronDown size={28} strokeWidth={1.8}/></button>:<span className="ico"/>}
      <span className="cmid"><b>{p.name}</b><time>{live?clock(Date.now()-since):'正在呼叫…'}</time></span>
      <button className="ico" onClick={()=>pic.current?.click()} aria-label="换他的通话画面"><ImagePlus size={23} strokeWidth={1.7}/></button>
      <input ref={pic} type="file" accept="image/*" hidden onChange={async e=>{const f=e.target.files?.[0];e.target.value='';if(f){try{setPersona(p.id,{callPic:await putImage(f,1600)});}catch{say('这张图片读不了，换一张试试');}}}}/>
    </header>
    {!p.callPic&&<div className="cface"><Avatar id={p.avatar} name={p.name} size={132}/></div>}
    {live&&<div className="cself" style={pos?{left:pos.x,top:pos.y,right:'auto'}:undefined} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
      {cam?<video ref={video} className={side==='user'?'mirror':''} playsInline muted autoPlay/>:<Avatar id={st.prefs.myAvatar} name={st.prefs.myName} size={56}/>}
    </div>}
    {sub&&<p className="csub" aria-live="polite">{sub}</p>}
    <div className="call-keys">
      {live&&<button aria-pressed={!cam} onClick={toggleCam} aria-label={cam?'关掉摄像头':'打开摄像头'}>{cam?<Video size={26} strokeWidth={1.8}/>:<VideoOff size={26} strokeWidth={1.8}/>}</button>}
      <button className="end" onClick={()=>hang(p.id)} aria-label={live?'挂断':'取消呼叫'}><Phone size={28} strokeWidth={2}/></button>
      {live&&<button onClick={()=>setSide(v=>v==='user'?'environment':'user')} disabled={!cam} aria-label="翻转摄像头"><SwitchCamera size={26} strokeWidth={1.8}/></button>}
    </div>
  </div>;
}
