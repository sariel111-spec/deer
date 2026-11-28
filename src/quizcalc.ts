// 问卷里不碰页面的那几件事：把写的、贴的字拆成题；题库；他怎么答；答到第几题；对上几题
import type {QItem,QSheet} from './db';
import {split} from './pickcalc';

export const Q_MAX=10,OPT_MAX=6;
/** 还没发出去的一题：只有题目、选项、能不能多选 */
export type Draft={q:string;opts:string[];many?:boolean};

// 抄来的题前面常带着序号：1. / 1、/ (1) / ① / Q1. / 一个小圆点
const clean=(s:string)=>s.replace(/^\s*(?:\d{1,3}\s*[.、．)）]|[（(]\d{1,3}[）)]|[①-⑳]|[-·•*]\s+|Q\d{1,3}\s*[.、．:：])\s*/i,'').trim();
/** 一行字拆成一题：「题目：选项/选项」。没有冒号、或者冒号后面拆不出两个选项，就是让他说一句的题 */
export function parseLine(line:string):Draft|null{
  const t=clean(line);if(!t)return null;
  const m=/^(.{1,60}?)[:：]\s*(.+)$/.exec(t);
  if(m){const opts=uniq(split(m[2])).slice(0,OPT_MAX);if(opts.length>=2)return {q:m[1].trim().slice(0,40),opts};}
  return {q:t.replace(/[:：]\s*$/,'').slice(0,40),opts:[]};
}
/** 贴进来的一串：一行一题 */
export const parse=(text:string):Draft[]=>text.split(/[\n\r]+/).map(parseLine).filter((x):x is Draft=>!!x&&!!x.q);
export const uniq=(a:string[])=>[...new Set(a)];
/** 一题写成一行字（改题的时候放回输入框） */
export const kindOf=(d:Draft):QItem['k']=>d.opts.length<2?'say':d.many&&d.opts.length>2?'many':'one';

export type Preset={id:string;name:string;qs:Draft[]};
const L=(...a:string[]):Draft[]=>a.map(x=>parseLine(x)!);
/** 题库：几组三五题的小问卷，点一下就填好，填好了还能改 */
export const presets:Preset[]=[
  {id:'own',name:'占有欲',qs:L('会不会查我的手机：会/不会','我和朋友出去玩没带你，会失落吗：会/不会/有一点','介意我和别的男生聊得开心吗：介意/不介意/嘴上不介意','我很晚还没回消息，你会：一直等/先睡了/打电话过来')},
  {id:'today',name:'今天',qs:L('今天想我了吗：想了/一直在想/忙忘了','今天过得怎么样：挺好/一般/有点累','现在最想做什么：见我/睡觉/吃东西/发呆','今天想对我说的一句话')},
  {id:'us',name:'我们',qs:L('你觉得我们现在是什么关系：恋人/家人/最好的朋友/说不清','对我们现在的相处：很满意/想再近一点/有话想说','最想和我一起做的事：旅行/宅在家/吃好吃的/什么都行','最喜欢我哪一点')},
  {id:'link',name:'连上了吗',qs:L('我现在在哪里：屋里/外面/路上','我现在是：躺着/坐着/站着/走来走去','我今天吃过饭了吗：吃了/还没','我现在的心情：开心/一般/不太好')},
  {id:'ab',name:'二选一',qs:[['猫','狗'],['山','海'],['早起','熬夜'],['甜的','咸的'],['电影','音乐'],['夏天','冬天'],['出门','待在家'],['咖啡','茶'],['打字','语音'],['计划好','随便走']].map(([a,b])=>({q:`${a}还是${b}`,opts:[a,b]}))},
  {id:'open',name:'敞开问',qs:L('你是怎么看待我的','现在最想对我说什么','想我的时候会做什么','对我们的以后怎么想')},
];

/** 整份要答多久（毫秒）：一题二三十秒，整份一到五分钟 */
export function span(n:number,rnd=Math.random){
  let s=0;for(let i=0;i<n;i++)s+=18+rnd()*24;
  return Math.round(Math.min(300,Math.max(60,s))*1000);
}
/** 他怎么答：发出去的那一刻就定好（每台设备看到的是同一份），到交卷才给看。say(n)：从他的字卡里拿 n 句 */
export function answer(qs:Draft[],say:(n:number)=>string[],rnd=Math.random):QItem[]{
  return qs.map(d=>{
    const k=kindOf(d);
    if(k==='say'){const got=say(rnd()<.4?2:1);return {q:d.q,k,said:got.length?got:['……']};}
    if(k==='one')return {q:d.q,k,opts:[...d.opts],got:[Math.floor(rnd()*d.opts.length)]};
    const n=d.opts.length,want=1+Math.floor(rnd()*Math.min(3,n-1)),idx=d.opts.map((_,i)=>i);
    for(let i=n-1;i>0;i--){const j=Math.floor(rnd()*(i+1));[idx[i],idx[j]]=[idx[j],idx[i]];}
    return {q:d.q,k,opts:[...d.opts],got:idx.slice(0,want).sort((a,b)=>a-b)};
  });
}
/** 交卷了没有（到点就算，不等后台那一下） */
export const handed=(s:QSheet,now=Date.now())=>!!s.got||now>=s.due;
/** 他正答到第几题（从 1 数） */
export const onNo=(s:QSheet,now=Date.now())=>Math.min(s.qs.length,Math.max(1,Math.floor((now-s.at)/Math.max(1,s.due-s.at)*s.qs.length)+1));
/** 你先猜了的那几题里，对上几题 */
export function tally(s:QSheet){
  let n=0,hit=0;
  for(const q of s.qs)if(q.k==='one'&&q.mine!==undefined){n++;if(q.got?.[0]===q.mine)hit++;}
  return {n,hit};
}
/** 问过的一份放回去再问：只留题目和选项 */
export const again=(s:QSheet):Draft[]=>s.qs.map(q=>({q:q.q,opts:[...(q.opts??[])],...(q.k==='many'?{many:true}:{})}));
/** 列表、聊天卡上用的名字：没起名字就用第一题 */
export const title=(s:{name?:string;qs:{q:string}[]})=>s.name?.trim()||s.qs[0]?.q||'问卷';
/** 他这一题答的是什么（聊天卡上那一行） */
export const shown=(q:QItem)=>q.k==='say'?(q.said??[]).join(' '):(q.got??[]).map(i=>q.opts?.[i]).filter(Boolean).join('、');
