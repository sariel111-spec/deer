// 把一封信画成一张图（存下来、发出去用）。永远是白纸黑字，不跟深色模式走。
export type LetterPic={date:string;stamp:string;stampDate:string;dear:string;body:string;sign:string};
const FONT='"Songti SC","Noto Serif SC","Source Han Serif SC",STSong,SimSun,serif';
/** 按宽度折行：中文逐字折，英文和数字尽量整词；标点不放在行首 */
function wrap(c:CanvasRenderingContext2D,text:string,max:number):string[]{
  const out:string[]=[];
  for(const para of text.split('\n')){
    if(!para){out.push('');continue;}
    const parts=para.match(/[A-Za-z0-9'’\-_.@#%:/]+|\s+|./gu)??[];
    let line='';
    for(const w of parts){
      if(c.measureText(line+w).width<=max||!line){line+=w;continue;}
      if(/^[，。！？、；：,.!?;:）)」』”’…~～]$/.test(w)){line+=w;continue;}
      out.push(line.trimEnd());line=w.trimStart();
    }
    out.push(line);
  }
  return out;
}
export async function letterImage(l:LetterPic):Promise<Blob>{
  const W=1080,P=96,S=2;
  try{await Promise.race([document.fonts?.ready,new Promise(r=>setTimeout(r,800))]);}catch{/* */}
  const m=document.createElement('canvas').getContext('2d')!;
  const body=`${42}px ${FONT}`,LH=88;
  m.font=body;const rows=wrap(m,l.body,W-P*2);
  const top=P+70,dearY=top+110,bodyY=dearY+40,endY=bodyY+rows.length*LH,signY=endY+84,H=signY+P;
  const cv=document.createElement('canvas');cv.width=W*S;cv.height=H*S;
  const c=cv.getContext('2d')!;c.scale(S,S);
  c.fillStyle='#fff';c.fillRect(0,0,W,H);
  c.strokeStyle='#E3E3E3';c.lineWidth=2;c.strokeRect(36,36,W-72,H-72);
  c.textBaseline='alphabetic';
  // 邮戳
  c.save();c.translate(W-P-58,P+44);c.rotate(-12*Math.PI/180);c.strokeStyle='#9A9A9A';c.fillStyle='#8A8A8A';c.lineWidth=2;c.beginPath();c.arc(0,0,62,0,Math.PI*2);c.stroke();
  c.textAlign='center';c.font='20px -apple-system,"PingFang SC","Helvetica Neue",sans-serif';c.fillText(l.stamp,0,-8);c.font='600 26px -apple-system,"PingFang SC","Helvetica Neue",sans-serif';c.fillText(l.stampDate,0,26);c.restore();
  c.fillStyle='#8E8E8E';c.textAlign='right';c.font=`30px ${FONT}`;c.fillText(l.date,W-P-150,top);
  c.fillStyle='#111';c.textAlign='left';c.font=`40px ${FONT}`;c.fillText(l.dear,P,dearY);
  c.font=body;
  rows.forEach((t,i)=>{const y=bodyY+i*LH+56;c.fillStyle='#111';c.fillText(t,P,y);c.fillStyle='#E3E3E3';c.fillRect(P,y+22,W-P*2,2);});
  c.fillStyle='#111';c.textAlign='right';c.font=`38px ${FONT}`;c.fillText(l.sign,W-P,signY);
  return new Promise((ok,no)=>cv.toBlob(b=>b?ok(b):no(new Error('画不出来')),'image/png'));
}
