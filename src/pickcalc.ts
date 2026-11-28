// 帮我选里不碰页面的两件事：把一次写的好几个选项拆开；转的那几下怎么走
export const PICK_MAX=12;
/** 一次写了好几个（顿号、逗号、分号、斜杠、换行；没有英文字母时空格也算）就拆开 */
export function split(text:string):string[]{
  const seps=/[a-zA-Z]/.test(text)?/[，,、；;\n\r/|｜]|\s{2,}|　/:/[，,、；;\n\r/|｜\s　]/;
  return text.split(seps).map(x=>x.trim().slice(0,20)).filter(Boolean);
}
/** 转的那几下：每一步亮哪一个、亮多久。先快后慢，最后停在 target 上 */
export function steps(n:number,target:number):{i:number;ms:number}[]{
  const total=n*2+target+1,out:{i:number;ms:number}[]=[];
  for(let k=0;k<total;k++){const t=k/(total-1||1);out.push({i:k%n,ms:Math.round(70+230*t*t*t)});}
  return out;
}
