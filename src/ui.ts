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
