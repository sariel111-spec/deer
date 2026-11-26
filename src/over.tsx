import {useLayoutEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
// 浮层（底部弹出的那一张、大图、一句的小卡）一律挂到最外面去画。
// 留在页面里的话，iPhone 上页面是个能滚的盒子，浮层出不了这个盒子的层级，会被底下那排导航压住（按钮被挡住点不到）
export function Over({children}:{children:React.ReactNode}){
  const mark=useRef<HTMLElement>(null);
  const [acc,setAcc]=useState<string|null>(null);
  useLayoutEffect(()=>{setAcc(mark.current?getComputedStyle(mark.current).getPropertyValue('--accent').trim():'');},[]);
  return <><i ref={mark} hidden/>{acc!==null&&createPortal(<div className="over" style={acc?{'--accent':acc} as React.CSSProperties:undefined}>{children}</div>,document.body)}</>;
}
