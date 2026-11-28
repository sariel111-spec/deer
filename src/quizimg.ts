// 把一份答卷画成一张图：白底，题目、选项（他选的涂实，你猜的描一圈）、他说的话，按内容多长画多长
import type {QSheet} from './db';
import {tally,title} from './quizcalc';

const FONT='-apple-system,"PingFang SC","Helvetica Neue","Noto Sans SC",system-ui,sans-serif';
type Op={kind:'text';text:string;x:number;y:number;font:string;color:string}|{kind:'pill';text:string;x:number;y:number;w:number;on:boolean;ring:boolean}|{kind:'bar';x:number;y:number;h:number};
const rr=(c:CanvasRenderingContext2D,x:number,y:number,w:number,h:number,r:number)=>{c.beginPath();c.moveTo(x+r,y);c.arcTo(x+w,y,x+w,y+h,r);c.arcTo(x+w,y+h,x,y+h,r);c.arcTo(x,y+h,x,y,r);c.arcTo(x,y,x+w,y,r);c.closePath();};
/** 一段字按宽度折行（中文按字折，英文数字尽量不拆开） */
function wrap(c:CanvasRenderingContext2D,text:string,max:number):string[]{
  const out:string[]=[];
  for(const para of text.split('\n')){
    const parts=para.match(/[a-zA-Z0-9]+|\s+|[\s\S]/gu)??[];let line='';
    for(const t of parts){
      if(c.measureText(line+t).width<=max||!line){line+=t;continue;}
      out.push(line.trimEnd());line=t.trimStart();
    }
    out.push(line);
  }
  return out;
}
export async function sheetImage(s:QSheet,me:string,him:string,date:string):Promise<Blob>{
  const W=1080,P=96,IN=W-P*2;
  try{await Promise.race([document.fonts?.ready,new Promise(r=>setTimeout(r,800))]);}catch{/* */}
  const m=document.createElement('canvas').getContext('2d')!,ops:Op[]=[];
  const text=(t:string,x:number,y:number,font:string,color:string)=>ops.push({kind:'text',text:t,x,y,font,color});
  const F={h:`600 58px ${FONT}`,meta:`400 30px ${FONT}`,q:`600 38px ${FONT}`,op:`400 32px ${FONT}`,say:`400 36px ${FONT}`,foot:`400 28px ${FONT}`};
  let y=P+70;
  m.font=F.h;for(const l of wrap(m,title(s),IN)){text(l,P,y,F.h,'#111');y+=76;}
  const t=tally(s);
  y-=14;text(`${date} · ${him} 填写${t.n?` · 对上 ${t.hit} / ${t.n}`:''}`,P,y,F.meta,'#8E8E8E');y+=96;
  for(const q of s.qs){
    m.font=F.q;for(const l of wrap(m,q.q,IN)){text(l,P,y,F.q,'#111');y+=54;}
    y-=22;   // 题目最后一行的基线往下 32：选项（或他说的话）贴着自己的题，离下一题远
    if(q.k==='say'){
      m.font=F.say;const ls=(q.said??[]).flatMap(x=>wrap(m,x,IN-34));
      ops.push({kind:'bar',x:P,y,h:ls.length*56-8});
      for(const l of ls){text(l,P+34,y+38,F.say,'#333');y+=56;}
      y+=92;continue;
    }
    m.font=F.op;let x=P;
    (q.opts??[]).forEach((o,i)=>{
      const w=Math.min(IN,Math.ceil(m.measureText(o).width)+60);
      if(x+w>P+IN&&x>P){x=P;y+=80;}
      ops.push({kind:'pill',text:o,x,y,w,on:!!q.got?.includes(i),ring:q.mine===i});x+=w+16;
    });
    y+=64+100;
  }
  y-=30;
  y+=10;const footY=y;y+=P-10;
  const H=Math.ceil(y),S=W*2*H*2>15e6?1:2,cv=document.createElement('canvas');cv.width=W*S;cv.height=H*S;
  const c=cv.getContext('2d')!;c.scale(S,S);
  c.fillStyle='#fff';c.fillRect(0,0,W,H);c.strokeStyle='#E9E9E9';c.lineWidth=2;c.strokeRect(36,36,W-72,H-72);
  c.textBaseline='alphabetic';
  for(const o of ops){
    if(o.kind==='text'){c.textAlign='left';c.font=o.font;c.fillStyle=o.color;c.fillText(o.text,o.x,o.y);}
    else if(o.kind==='bar'){c.fillStyle='#111';c.fillRect(o.x,o.y,4,o.h);}
    else{
      rr(c,o.x,o.y,o.w,64,32);
      if(o.on){c.fillStyle='#111';c.fill();}else{c.strokeStyle=o.ring?'#111':'#DBDBDB';c.lineWidth=o.ring?3:2;c.stroke();}
      if(o.on&&o.ring){rr(c,o.x-7,o.y-7,o.w+14,78,39);c.strokeStyle='#111';c.lineWidth=2;c.stroke();}
      c.font=F.op;c.textAlign='center';c.fillStyle=o.on?'#fff':o.ring?'#111':'#8E8E8E';c.fillText(o.text,o.x+o.w/2,o.y+43,o.w-36);
    }
  }
  c.textAlign='center';c.font=F.foot;c.fillStyle='#B4B4B4';c.fillText(`${me} 问 · ${him} 答`,W/2,footY,IN);
  return new Promise((ok,no)=>cv.toBlob(b=>b?ok(b):no(new Error('画不出来')),'image/png'));
}
