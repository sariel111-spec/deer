import {useEffect,useRef,useState} from 'react';
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
// 键盘占了屏幕下面多高：记成 --kb，底部弹出的小页用它把自己顶到键盘上面（iPhone 上键盘是盖在页面上的，页面自己不会变矮）
export function watchKeyboard(){
  const vv=window.visualViewport;if(!vv)return;
  let last=-1;
  const on=()=>{const kb=Math.max(0,Math.round(window.innerHeight-vv.height-vv.offsetTop)),v=kb>90?kb:0;if(v!==last){last=v;document.documentElement.style.setProperty('--kb',v+'px');}};
  vv.addEventListener('resize',on);vv.addEventListener('scroll',on);on();
}
