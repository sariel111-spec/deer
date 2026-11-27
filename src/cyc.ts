// 经期：只管算（不画东西），页面和「他主动找你」都用这里
import type {Box} from './db';
export type Cy=Box['cycle'];
const pad=(n:number)=>String(n).padStart(2,'0');
export const ymd=(d:Date|number=new Date())=>{const x=new Date(d);return `${x.getFullYear()}-${pad(x.getMonth()+1)}-${pad(x.getDate())}`;};
export const at0=(s:string)=>new Date(s+'T00:00:00').getTime();
export const diff=(a:string,b:string)=>Math.round((at0(b)-at0(a))/864e5);
export const plus=(s:string,n:number)=>{const d=new Date(at0(s));d.setDate(d.getDate()+n);return ymd(d);};
const avg=(a:number[])=>a.reduce((x,y)=>x+y,0)/a.length;
export type Period={s:string;e:string;done:boolean};   // done：结束那天是她自己记的（不是按天数估的）

/** 把记录读成能用的样子。today 可以传别的日子（他主动找你时，要问的是「那一刻」算不算经期） */
export function cyRead(c:Cy,today=ymd()){
  const starts=[...new Set(c.starts)].filter(s=>s<=today).sort();
  // 用几天来算：记够了就按最近几次的平均（最多看六次），不够就按她填的
  const gaps=starts.slice(1).map((s,i)=>diff(starts[i],s)).filter(g=>g>=15&&g<=60).slice(-6);
  const lens=starts.map(s=>{const e=c.ends?.[s];return e&&e<=today?diff(s,e)+1:0;}).filter(n=>n>=1&&n<=15).slice(-6);
  const gap=gaps.length>=2?Math.round(avg(gaps)):c.gap,len=lens.length>=2?Math.round(avg(lens)):c.len;
  const periods:Period[]=starts.map((s,i)=>{
    const mine=c.ends?.[s],ok=!!mine&&mine>=s&&mine<=today;
    let e=ok?mine!:plus(s,len-1);
    const nx=starts[i+1];if(nx&&e>=nx)e=plus(nx,-1);   // 不会盖到下一次头上
    return {s,e,done:ok};
  });
  const last=periods.at(-1);
  const inside=!!last&&today<=last.e;
  const next=last?plus(last.s,gap):'';
  return {periods,last,gap,len,auto:{gap:gaps.length>=2,len:lens.length>=2},inside,day:inside&&last?diff(last.s,today)+1:0,
    ended:!!last&&last.done&&last.e===today,next,wait:next?diff(today,next):0};
}
/** 这一天对他来说是什么日子：in 经期里；soon 快来了（预计的前两天到晚了三天以内，还没记「来了」）；'' 平常 */
export function cyPhase(c:Cy,day=ymd()):'in'|'soon'|''{
  if(!c.starts.length)return '';
  const r=cyRead(c,day);
  if(r.inside)return 'in';
  return r.next&&r.wait<=2&&r.wait>=-3?'soon':'';
}
/** 月历上要标的日子：p 记过的经期，f 预计的（只标今天以后的，往后排六次） */
export function cyMarks(c:Cy,today=ymd()){
  const r=cyRead(c,today),m=new Map<string,'p'|'f'>();
  for(const p of r.periods)for(let d=p.s;d<=p.e;d=plus(d,1))m.set(d,'p');
  if(r.last)for(let k=1;k<=6;k++){const s=plus(r.last.s,r.gap*k);for(let i=0;i<r.len;i++){const d=plus(s,i);if(d>today&&!m.has(d))m.set(d,'f');}}
  return m;
}
/** 她给他指定的经期字卡分组（两种日子的都算）：这些分组的话只在那几天由他主动说，平时不随口说 */
export const cyDecks=(c:Cy)=>[...(c.decks??[]),...(c.soon??[])];
