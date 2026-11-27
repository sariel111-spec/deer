// 安卓安装包里通知这条路上发生了什么，记最近几十行（只存在这台手机上），出问题时她截图给我看
const K='cx-shell-log';
const two=(n:number)=>String(n).padStart(2,'0');
export function slog(text:string){
  try{
    const d=new Date(),list=JSON.parse(localStorage.getItem(K)??'[]') as string[];
    list.push(`${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())} ${text}`);
    localStorage.setItem(K,JSON.stringify(list.slice(-80)));
  }catch{/* 记不下就算了 */}
}
export const slogRead=():string[]=>{try{return JSON.parse(localStorage.getItem(K)??'[]') as string[];}catch{return [];}};
export const slogClear=()=>{try{localStorage.removeItem(K);}catch{/* */}};
export const err=(e:unknown)=>String((e as Error)?.message??e).slice(0,80);
