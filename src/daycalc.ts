// 纪念日的算法：离今天几天、下一次是哪天、第几年、农历、「在一起」的整数日子。都是纯函数，页面和提醒共用
import type {Day} from './db';

const two=(n:number)=>String(n).padStart(2,'0');
export const ymd=(d=new Date())=>`${d.getFullYear()}-${two(d.getMonth()+1)}-${two(d.getDate())}`;
export const at0=(s:string)=>new Date(s+'T00:00:00').getTime();
export const gap=(a:string,b:string)=>Math.round((at0(b)-at0(a))/864e5);
export const plus=(s:string,n:number)=>{const d=new Date(s+'T00:00:00');d.setDate(d.getDate()+n);return ymd(d);};
const WEEK='日一二三四五六';
export const week=(s:string)=>'周'+WEEK[new Date(s+'T00:00:00').getDay()];
/** 2025.03.14 */
export const dots=(s:string)=>s.replace(/-/g,'.');
/** 3月14日（不是今年的带上年份） */
export const md=(s:string,today=ymd())=>{const [y,m,d]=s.split('-').map(Number);return `${y===Number(today.slice(0,4))?'':y+'年'}${m}月${d}日`;};
/** 2025年3月14日 周五 */
export const full=(s:string)=>{const [y,m,d]=s.split('-').map(Number);return `${y}年${m}月${d}日 ${week(s)}`;};

/* ── 农历：用浏览器自带的中国农历，不带一张大表 ── */
let lf:Intl.DateTimeFormat|null=null;
try{const f=new Intl.DateTimeFormat('zh-CN-u-ca-chinese',{year:'numeric',month:'long',day:'numeric'});if(/月/.test(f.formatToParts(new Date(2024,1,10)).find(x=>x.type==='month')?.value??''))lf=f;}catch{/* 这个浏览器没有农历 */}
/** 这个浏览器算不算得了农历（算不了就不出现「按农历」） */
export const lunarOk=()=>!!lf;
type Lunar={y:number;m:string;d:number;leap:boolean};
const lcache=new Map<string,Lunar|null>();
export function lunarOf(s:string):Lunar|null{
  if(!lf)return null;
  if(lcache.has(s))return lcache.get(s)!;
  let v:Lunar|null=null;
  try{const p=lf.formatToParts(new Date(s+'T12:00:00')),get=(t:string)=>p.find(x=>x.type===t)?.value??'';
    const m=get('month'),d=Number(get('day')),y=Number(get('relatedYear'))||Number(s.slice(0,4));
    if(m&&d)v={y,m:m.replace('闰',''),d,leap:m.startsWith('闰')};}catch{/* */}
  lcache.set(s,v);return v;
}
const LD=['初一','初二','初三','初四','初五','初六','初七','初八','初九','初十','十一','十二','十三','十四','十五','十六','十七','十八','十九','二十','廿一','廿二','廿三','廿四','廿五','廿六','廿七','廿八','廿九','三十'];
const LM:Record<string,string>={'一月':'正月','十一月':'冬月','十二月':'腊月'};
/** 农历十月十四 */
export const lunarText=(s:string)=>{const l=lunarOf(s);return l?`农历${LM[l.m]??l.m}${LD[l.d-1]??l.d}`:'';};
/** 从 from 那天起（含），下一个农历月日和 s 相同的公历日子。闰月里的日子按平常那个月过；三十遇上只有廿九的月就过廿九 */
export function lunarNext(s:string,from=ymd()):string{
  const o=lunarOf(s);if(!o)return solarNext(s,from);
  for(let i=0,d=from;i<400;i++,d=plus(d,1)){
    const l=lunarOf(d);if(!l||l.leap||l.m!==o.m)continue;
    if(l.d===o.d)return d;
    if(o.d===30&&l.d===29&&lunarOf(plus(d,1))?.d===1)return d;
  }
  return solarNext(s,from);
}
/** 从 from 那天起（含），下一个公历月日和 s 相同的日子。2 月 29 日在平年过 2 月 28 日 */
export function solarNext(s:string,from=ymd()):string{
  const [,m,d]=s.split('-').map(Number),y0=Number(from.slice(0,4));
  for(let y=y0;y<y0+3;y++){
    const leap=(y%4===0&&y%100!==0)||y%400===0,dd=m===2&&d===29&&!leap?28:d,t=`${y}-${two(m)}-${two(dd)}`;
    if(t>=from)return t;
  }
  return from;
}

export type Count={
  kind:'today'|'soon'|'past';
  /** 还有几天（soon）/ 第几天（past，起头那天算第 1 天）/ 0（today） */
  n:number;
  /** 这一次（每年的：最近的下一次；一次性的：那一天） */
  on:string;
  /** 每年的：这是第几年（算不出来或者不该显示就没有） */
  times?:number;
  /** 岁 / 周年 */
  unit?:string;
};
const isBirth=(name:string)=>/生日|诞辰|生辰|诞生/.test(name);
export function count(d:Pick<Day,'name'|'date'|'yearly'|'lunar'>,today=ymd()):Count{
  if(d.yearly){
    const on=d.lunar?lunarNext(d.date,today):solarNext(d.date,today),n=gap(today,on);
    const y0=d.lunar?lunarOf(d.date)?.y:Number(d.date.slice(0,4)),y1=d.lunar?lunarOf(on)?.y:Number(on.slice(0,4));
    let times=y0&&y1?y1-y0:0;const birth=isBirth(d.name);
    // 不知道哪年出生、随手填了个年份的生日：不到十岁的不显示岁数
    if(times<1||times>150||(birth&&times<10))times=0;
    return {kind:n===0?'today':'soon',n,on,...(times?{times,unit:birth?'岁':'周年'}:{})};
  }
  const k=gap(d.date,today);
  return k===0?{kind:'today',n:0,on:d.date}:k>0?{kind:'past',n:k+1,on:d.date}:{kind:'soon',n:-k,on:d.date};
}

/** 走过多久：1 年 8 个月 14 天（从 a 到 b，按日历算） */
export function span(a:string,b=ymd()):string{
  const x=new Date(a+'T00:00:00'),y=new Date(b+'T00:00:00');if(y<x)return '';
  let ys=y.getFullYear()-x.getFullYear(),ms=y.getMonth()-x.getMonth(),ds=y.getDate()-x.getDate();
  if(ds<0){ms--;ds+=new Date(y.getFullYear(),y.getMonth(),0).getDate();}
  if(ms<0){ys--;ms+=12;}
  return [ys?ys+' 年':'',ms?ms+' 个月':'',ds||(!ys&&!ms)?ds+' 天':''].filter(Boolean).join(' ');
}

const CN=['','一','两','三','四','五','六','七','八','九','十'];
const years=(n:number)=>n<=10?CN[n]+'周年':n+' 周年';
export type Mile={on:string;n:number;label:string};
/** 「在一起」接下来的整数日子：整百天、520、999、1314，和每一个周年。按日期排，today 当天的也算（n=0） */
export function miles(since:string,today=ymd(),many=1):Mile[]{
  if(!since||since>today)return [];
  const dayNo=gap(since,today)+1,out:Mile[]=[];
  const nums=new Set<number>([520,999,1314]);
  for(let h=Math.ceil(dayNo/100)*100,i=0;i<4;i++,h+=100)nums.add(h);
  for(const N of nums)if(N>=dayNo)out.push({on:plus(since,N-1),n:N-dayNo,label:`第 ${N} 天`});
  for(let i=0,from=today;i<2;i++){const on=solarNext(since,from),k=Number(on.slice(0,4))-Number(since.slice(0,4));if(k>=1)out.push({on,n:gap(today,on),label:years(k)});from=plus(on,1);}
  return out.sort((a,b)=>a.n-b.n||(/周年/.test(a.label)?-1:1)).slice(0,many);
}

/** 排好的两段：快到了（今天、还没到、每年的），走过的（过去的一次性日子，近的在前） */
export function arrange<T extends Pick<Day,'name'|'date'|'yearly'|'lunar'>>(days:T[],today=ymd()){
  const all=days.map(d=>({d,c:count(d,today)}));
  return {soon:all.filter(x=>x.c.kind!=='past').sort((a,b)=>a.c.n-b.c.n),past:all.filter(x=>x.c.kind==='past').sort((a,b)=>a.c.n-b.c.n)};
}

export type Tip={at:number;text:string;key:string};
/** 该提醒的事：前一天晚上八点「明天是…」，当天早上九点「今天是…」；「在一起」的整数日子只在当天说。返回 today 和 tomorrow 两天里的 */
export function tips(o:{since?:string;sinceTip?:boolean;days:Day[]},today=ymd()):Tip[]{
  const out:Tip[]=[],tm=plus(today,1);
  for(const d of o.days){
    if(d.remind===false)continue;
    const c=count(d,today);if(c.kind==='past')continue;
    const tail=c.times?`（${c.times} ${c.unit}）`:'';
    if(c.on===today)out.push({at:at0(today)+9*3600e3,text:`今天是「${d.name}」${tail}`,key:d.id+'|'+today});
    else if(c.on===tm)out.push({at:at0(today)+20*3600e3,text:`明天是「${d.name}」${tail}`,key:d.id+'|'+today+'|e'});
    // 明天的那一条「今天是」也排上（人不在的时候交给云端 / 手机闹钟）
    if(c.on===tm)out.push({at:at0(tm)+9*3600e3,text:`今天是「${d.name}」${tail}`,key:d.id+'|'+tm});
  }
  if(o.since&&o.sinceTip!==false)for(const day of [today,tm]){const m=miles(o.since,day,1)[0];if(m&&m.n===0)out.push({at:at0(day)+9*3600e3,text:`今天是在一起的${m.label}`,key:'since|'+day});}
  return out.sort((a,b)=>a.at-b.at);
}
