import {useRef} from 'react';
// 点浮层外面的空白关掉它。要等手指抬起来（click）才关：按下那一刻就关的话，浮层先没了，抬手的那一下会落到底下的东西上，顺带把它点开
export function useDismiss(close:()=>void){
  const down=useRef(false);
  return {onPointerDown:(e:React.PointerEvent)=>{down.current=e.target===e.currentTarget;},
    onClick:(e:React.MouseEvent)=>{const hit=down.current&&e.target===e.currentTarget;down.current=false;if(hit)close();}};
}
