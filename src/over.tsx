import {useLayoutEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
// 浮层（底部弹出的那一张、大图、一句的小卡）一律挂到最外面去画。
// 留在页面里的话，iPhone 上页面是个能滚的盒子，浮层出不了这个盒子的层级，会被底下那排导航压住（按钮被挡住点不到）
const calm=()=>typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion:reduce)').matches;
// 自动化测试里不留影子（影子上也有 .sheet，会和真的那张混在一起）；要测影子时把 window.__ghost 设成 1
const ghostOff=()=>calm()||(navigator.webdriver&&!(window as unknown as {__ghost?:number}).__ghost);
export function Over({children}:{children:React.ReactNode}){
  const mark=useRef<HTMLElement>(null),host=useRef<HTMLDivElement>(null);
  const [acc,setAcc]=useState<string|null>(null);
  useLayoutEffect(()=>{setAcc(mark.current?getComputedStyle(mark.current).getPropertyValue('--accent').trim():'');},[]);
  // 关掉的那一刻：真的那张照常拿走（底下的页面马上能点），原地留一张不能点的影子，往下落着淡出去
  useLayoutEffect(()=>()=>{
    const el=host.current;if(!el||ghostOff()||document.documentElement.dataset.turn)return;   // 换页带走的小页不留影子
    try{
      const tops=[...el.querySelectorAll<HTMLElement>('.sheet')].map(x=>x.scrollTop);
      const g=el.cloneNode(true) as HTMLDivElement;
      g.classList.add('out');g.setAttribute('aria-hidden','true');g.inert=true;
      for(const x of g.querySelectorAll('[id]'))x.removeAttribute('id');
      document.body.appendChild(g);
      g.querySelectorAll<HTMLElement>('.sheet').forEach((x,i)=>{x.scrollTop=tops[i]??0;});
      setTimeout(()=>g.remove(),260);
    }catch{/* 留不了影子就直接关 */}
  },[]);
  return <><i ref={mark} hidden/>{acc!==null&&createPortal(<div ref={host} className="over" style={acc?{'--accent':acc} as React.CSSProperties:undefined}>{children}</div>,document.body)}</>;
}
