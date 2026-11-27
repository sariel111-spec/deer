// 把一个日子画成一张图：白底的纪念卡（两个头像、名字、大数字、日期），放了照片的就用照片铺满
import {getImage} from './db';
import {isShell,shellSave} from './native';

const FONT='-apple-system,"PingFang SC","Helvetica Neue","Noto Sans SC",system-ui,sans-serif';
export type DayCard={
  name:string;
  /** 大数字（今天就是这一天的时候没有） */
  n?:number;
  /** 数字前面、后面的小字：第 … 天 / … 天后 */
  pre?:string;post?:string;
  /** 数字下面那一行 */
  line:string;
  /** 最底下一行（两个人的名字） */
  foot:string;
  me:{id?:string;name:string};him:{id?:string;name:string};
  /** 她给这个日子放的照片 */
  img?:string;
};
const load=(src:string)=>new Promise<HTMLImageElement|null>(ok=>{if(!src){ok(null);return;}const i=new Image();i.onload=()=>ok(i);i.onerror=()=>ok(null);i.src=src;});
const pic=async(id?:string)=>id?load(await getImage(id).catch(()=>'')):null;
function coverFit(c:CanvasRenderingContext2D,im:HTMLImageElement,x:number,y:number,w:number,h:number){
  const k=Math.max(w/im.naturalWidth,h/im.naturalHeight),sw=w/k,sh=h/k;
  c.drawImage(im,(im.naturalWidth-sw)/2,(im.naturalHeight-sh)/2,sw,sh,x,y,w,h);
}
function face(c:CanvasRenderingContext2D,im:HTMLImageElement|null,name:string,x:number,y:number,r:number,ring:string){
  c.save();c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.closePath();c.clip();
  if(im)coverFit(c,im,x-r,y-r,r*2,r*2);
  else{c.fillStyle='#F2F2F2';c.fillRect(x-r,y-r,r*2,r*2);c.fillStyle='#8E8E8E';c.font=`500 ${Math.round(r*.84)}px ${FONT}`;c.textAlign='center';c.textBaseline='middle';c.fillText([...name][0]??'·',x,y+2);}
  c.restore();
  c.beginPath();c.arc(x,y,r+3,0,Math.PI*2);c.strokeStyle=ring;c.lineWidth=6;c.stroke();
}
/** 中间那一行：小字 + 大数字 + 小字，整体居中 */
function bigRow(c:CanvasRenderingContext2D,d:DayCard,cx:number,y:number,size:number,ink:string,soft:string){
  c.textBaseline='alphabetic';c.textAlign='left';
  const small=`400 ${Math.round(size*.19)}px ${FONT}`,big=`200 ${size}px ${FONT}`;
  if(d.n===undefined){c.font=`300 ${Math.round(size*.62)}px ${FONT}`;c.fillStyle=ink;c.textAlign='center';c.fillText('就是今天',cx,y-size*.08);return;}
  const num=String(d.n);
  c.font=small;const w1=d.pre?c.measureText(d.pre).width+18:0,w3=d.post?c.measureText(d.post).width+18:0;
  c.font=big;const w2=c.measureText(num).width;
  let x=cx-(w1+w2+w3)/2;
  if(d.pre){c.font=small;c.fillStyle=soft;c.fillText(d.pre,x,y);x+=w1;}
  c.font=big;c.fillStyle=ink;c.fillText(num,x,y);x+=w2+18;
  if(d.post){c.font=small;c.fillStyle=soft;c.fillText(d.post,x,y);}
}
export async function dayImage(d:DayCard):Promise<Blob>{
  const W=1080,H=1350;
  try{await Promise.race([document.fonts?.ready,new Promise(r=>setTimeout(r,800))]);}catch{/* */}
  const [cover,me,him]=await Promise.all([pic(d.img),pic(d.me.id),pic(d.him.id)]);
  const S=cover?1:2,cv=document.createElement('canvas');cv.width=W*S;cv.height=H*S;
  const c=cv.getContext('2d')!;c.scale(S,S);
  if(cover){
    coverFit(c,cover,0,0,W,H);
    const g=c.createLinearGradient(0,H*.3,0,H);g.addColorStop(0,'rgba(0,0,0,0)');g.addColorStop(1,'rgba(0,0,0,.62)');c.fillStyle=g;c.fillRect(0,0,W,H);
    c.textAlign='center';c.textBaseline='alphabetic';c.fillStyle='rgba(255,255,255,.92)';c.font=`500 44px ${FONT}`;c.fillText(d.name,W/2,H-470,W-160);
    bigRow(c,d,W/2,H-240,230,'#fff','rgba(255,255,255,.86)');
    c.textAlign='center';c.fillStyle='rgba(255,255,255,.86)';c.font=`400 34px ${FONT}`;c.fillText(d.line,W/2,H-150,W-160);
    c.fillStyle='rgba(255,255,255,.6)';c.font=`400 26px ${FONT}`;c.fillText(d.foot,W/2,H-84,W-160);
    return new Promise((ok,no)=>cv.toBlob(b=>b?ok(b):no(new Error('画不出来')),'image/jpeg',.92));
  }
  c.fillStyle='#fff';c.fillRect(0,0,W,H);
  c.strokeStyle='#E9E9E9';c.lineWidth=2;c.strokeRect(36,36,W-72,H-72);
  // 两个头像挨着，后面那个压住前面一点
  face(c,me,d.me.name,W/2-66,330,92,'#fff');face(c,him,d.him.name,W/2+66,330,92,'#fff');
  c.textAlign='center';c.textBaseline='alphabetic';c.fillStyle='#8E8E8E';c.font=`400 40px ${FONT}`;c.fillText(d.name,W/2,560,W-200);
  bigRow(c,d,W/2,860,270,'#111','#8E8E8E');
  c.textAlign='center';c.fillStyle='#8E8E8E';c.font=`400 34px ${FONT}`;c.fillText(d.line,W/2,960,W-200);
  c.fillStyle='#B4B4B4';c.font=`400 28px ${FONT}`;c.fillText(d.foot,W/2,H-110,W-200);
  return new Promise((ok,no)=>cv.toBlob(b=>b?ok(b):no(new Error('画不出来')),'image/png'));
}
/** 存这张图：手机上交给系统的分享面板（存到相册 / 发出去），电脑上直接下载。返回 true＝下载了 */
export async function saveImage(file:File,url:string):Promise<boolean>{
  try{if(navigator.canShare?.({files:[file]})){await navigator.share({files:[file]});return false;}}catch(e){if((e as Error)?.name==='AbortError')return false;}
  if(isShell()){
    const b64=await new Promise<string>(ok=>{const r=new FileReader();r.onload=()=>ok(String(r.result).split(',')[1]??'');r.readAsDataURL(file);});
    shellSave(file.name,b64,true);return false;
  }
  const a=document.createElement('a');a.href=url;a.download=file.name;document.body.appendChild(a);a.click();a.remove();return true;
}
