import {useEffect,useLayoutEffect,useRef,useState} from 'react';
// 点浮层外面的空白关掉它。要等手指抬起来（click）才关：按下那一刻就关的话，浮层先没了，抬手的那一下会落到底下的东西上，顺带把它点开
export function useDismiss(close:()=>void){
  const down=useRef(false);
  return {onPointerDown:(e:React.PointerEvent)=>{down.current=e.target===e.currentTarget;},
    onClick:(e:React.MouseEvent)=>{const hit=down.current&&e.target===e.currentTarget;down.current=false;if(hit)close();}};
}
// 删东西一律点两次：第一次只是把那个按钮变成「再点一次」，三秒不点就自己变回去
export function useTwice(){
  const [armed,setArmed]=useState(''),t=useRef(0);
  useEffect(()=>()=>clearTimeout(t.current),[]);
  const tap=(key:string,run:()=>void)=>()=>{clearTimeout(t.current);if(armed!==key){setArmed(key);t.current=window.setTimeout(()=>setArmed(''),3000);return;}setArmed('');run();};
  return [armed,tap] as const;
}
// 按住小页最上面那一小条（或标题那一行）往下拖：小页跟着手走，拖过一小段或者甩得够快，松手就关；没拖够就弹回去
export function useDragClose<T extends HTMLElement>(close:()=>void){
  const el=useRef<T>(null),g=useRef({on:false,y:0,dy:0,t:0});
  const put=(dy:number,ease=false)=>{const x=el.current;if(!x)return;x.style.transition=ease?'transform .2s var(--ease)':'none';x.style.transform=dy?`translateY(${dy}px)`:'';};
  const bind={
    onPointerDown:(e:React.PointerEvent)=>{if(e.button!==0||(e.target as HTMLElement).closest('button,a,input'))return;g.current={on:true,y:e.clientY,dy:0,t:performance.now()};try{(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);}catch{/* */}},
    onPointerMove:(e:React.PointerEvent)=>{const d=g.current;if(!d.on)return;d.dy=Math.max(0,e.clientY-d.y);put(d.dy);},
    onPointerUp:()=>{const d=g.current;if(!d.on)return;d.on=false;const fast=d.dy>24&&d.dy/(performance.now()-d.t)>.55;if(d.dy>90||fast)close();else put(0,true);},
    onPointerCancel:()=>{if(g.current.on){g.current.on=false;put(0,true);}},
  };
  return [el,bind] as const;
}
// 回车算不算「发出去」：输入法还在选字的那一下不算（Safari 选字回车时 isComposing 已经是 false，要再看 keyCode）
export const enter=(e:React.KeyboardEvent)=>e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing&&e.keyCode!==229;
// 手机上：小页打开时不自己把键盘叫出来（先看得见整张小页，点了输入框键盘才出来）；电脑上照旧直接能打字
export const auto=typeof matchMedia==='function'&&matchMedia('(hover:hover) and (pointer:fine)').matches;
/* ── 返回键（安卓）/ 从屏幕边上划回去（iPhone）：开着小页、大图、长按菜单时，先关掉它，而不是直接离开这一页 ──
   每开一层就在浏览器历史里垫一格（网址不变）；按返回退掉这一格，这里看到了就把那一层关上。
   用按钮关的话，顺手把垫的那一格退掉。 */
const layers:{id:number;close:()=>void;alive:boolean}[]=[];let lastLayer=0,pend=0,owed=0,skip=0;const waiters:(()=>void)[]=[];
const sheetOf=()=>{try{return Number((history.state as {sheet?:number}|null)?.sheet)||0;}catch{return 0;}};
const flush=()=>{if(!pend&&!skip)waiters.splice(0).forEach(f=>f());};
if(typeof window!=='undefined')addEventListener('popstate',()=>{
  if(skip>0){skip--;flush();return;}
  const top=sheetOf();let shut=false;
  for(let i=layers.length-1;i>=0;i--)if(layers[i].id>top){
    const l=layers[i];layers.splice(i,1);shut=true;l.close();
    // 关掉以后那一层其实还在（同一张小页换了内容，比如从「加一条日程」退回「报备的设置」）：给它重新垫一格，下一次返回还是先关它
    setTimeout(()=>{if(l.alive&&!layers.includes(l)){try{history.pushState({...(history.state as object|null),sheet:l.id},'');layers.push(l);}catch{/* */}}},0);
  }
  // 落在一张早就关了的小页留下的那一格上（点小页里的链接走掉时会留下一格）：再退一格，不让这一下返回白按
  if(!shut&&top&&!layers.some(l=>l.id===top)){skip++;history.back();}
});
export function useBackClose(close:()=>void){
  const fn=useRef(close);fn.current=close;
  // 在画出来之前就垫好那一格：iPhone 划回去时垫在下面的截图，是垫这一格那一刻屏幕上的样子（还没盖上这一层）
  useLayoutEffect(()=>{
    const id=lastLayer=Math.max(Date.now(),lastLayer+1),me={id,close:()=>fn.current(),alive:true};
    try{
      const st={...(history.state as object|null),sheet:id};
      // 上一层刚关、这一层紧接着开（小页换小页）：接着用那一格，不退了再垫
      if(pend){clearTimeout(pend);pend=0;owed=0;history.replaceState(st,'');}else history.pushState(st,'');
    }catch{return;}
    layers.push(me);
    return()=>{
      me.alive=false;
      const i=layers.indexOf(me);if(i<0)return;   // 是返回键关的：那一格已经退掉了
      layers.splice(i,1);
      if(sheetOf()<id)return;                     // 页面已经走到别处去了：不动历史
      owed++;clearTimeout(pend);
      pend=window.setTimeout(()=>{pend=0;const n=owed;owed=0;if(n>0&&sheetOf()){skip++;history.go(-n);}else flush();},0);
    };
  },[]);
}
/** 放进任何一层浮层里：这一层也算进「返回先关它」 */
export function BackClose({close}:{close:()=>void}){useBackClose(close);return null;}
/** 要离开这一页（history.back 之类）之前：等开着的小页把自己垫的那一格退完，不然这一下只退掉了小页那一格 */
export function afterSheets(f:()=>void){
  if(!layers.length&&!pend&&!skip){f();return;}
  let done=false;const run=()=>{if(!done){done=true;f();}};
  waiters.push(run);setTimeout(run,500);
}
// 键盘出来的时候（iPhone 上键盘是盖在页面上的，页面自己不会变矮，系统还会把整页往上推，推多少看光标在哪——
// 聊天里字打到好几行时，整个页面就会从底下跳上去、输入框和键盘之间空出一截）：
// 这里把整个小鹿收进「键盘上面看得见的那一块」里：高度＝看得见的高度（--vvh），系统把页面推走了就拉回来。
// 这样顶上的标题一直在，输入框一直贴着键盘，字多了只是输入框自己往上长。
// --kb 是键盘盖住了页面底部多高，底部弹出的小页用它把自己顶到键盘上面。
export function watchKeyboard(){
  const vv=window.visualViewport;if(!vv)return;
  const root=document.documentElement;let last='',was=false;
  const on=()=>{
    const zoomed=Math.abs((vv.scale||1)-1)>.01,gap=window.innerHeight-vv.height,up=!zoomed&&gap>90;
    const kb=up?Math.max(0,Math.round(gap-vv.offsetTop)):0,key=up?`${Math.round(vv.height)}|${Math.round(vv.offsetTop)}|${kb}`:'';
    if(key===last)return;last=key;
    root.style.setProperty('--kb',(kb>90?kb:0)+'px');
    if(up){
      root.style.setProperty('--vvh',Math.round(vv.height)+'px');root.classList.add('kb');
      // 系统把页面往上推了：推回去（收矮以后光标本来就在看得见的地方，不需要推）。推不回去的那一点用位移补上
      if(vv.offsetTop>0){try{window.scrollTo(0,0);}catch{/* */}}
      root.style.setProperty('--vvt',Math.max(0,Math.round(vv.offsetTop))+'px');
      // 键盘刚出来：正在打字的那一格要在看得见的地方
      if(!was)requestAnimationFrame(()=>{const a=document.activeElement as HTMLElement|null;if(a&&/^(INPUT|TEXTAREA)$/.test(a.tagName))try{a.scrollIntoView({block:'nearest'});}catch{/* */}});
    }else{root.style.removeProperty('--vvh');root.style.removeProperty('--vvt');root.classList.remove('kb');}
    was=up;
  };
  vv.addEventListener('resize',on);vv.addEventListener('scroll',on);on();
}
