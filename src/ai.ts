// AI 解牌：直接从这台设备连 DeepSeek，把这次的问题和牌发过去，让它按「梦角传讯」的读法解出来。
// 密钥只存在这台设备的浏览器里（localStorage），不进同步、不进代码仓库；每台设备各填一次。
// 发出去的只有：这一位的名字和资料、你的名字、问题、抽到的牌、你写的专属牌意、他的几句字卡。聊天记录不发。
const BASE='https://api.deepseek.com';
const K={key:'cx-ds-key',model:'cx-ds-model',auto:'cx-ds-auto',prompt:'cx-ds-prompt'};
const get=(k:string)=>{try{return localStorage.getItem(k)??'';}catch{return '';}};
const set=(k:string,v:string)=>{try{if(v)localStorage.setItem(k,v);else localStorage.removeItem(k);}catch{/* 存不了就这次用 */}};
export const dsKey=()=>get(K.key);
export const setDsKey=(v:string)=>set(K.key,v.trim());
// 现在在用的型号。接口那边的型号名会换，所以设置里是从接口现查的；这里只是没查到时的默认
export const dsModel=()=>get(K.model)||'deepseek-flash';
export const setDsModel=(v:string)=>set(K.model,v);
export const dsAuto=()=>get(K.auto)!=='0';
export const setDsAuto=(v:boolean)=>set(K.auto,v?'':'0');
export const dsPrompt=()=>get(K.prompt)||DEFAULT_PROMPT;
export const setDsPrompt=(v:string)=>set(K.prompt,v.trim()===DEFAULT_PROMPT.trim()?'':v.trim());
export const promptEdited=()=>!!get(K.prompt);

/* 解牌的指令。按小红书上梦女们用 AI 解梦占牌的经验整理的：
   让它当传讯师、只读真抽到的牌、读状态不下结论、不讨好也不吓人、专属牌意优先、连起来读、最后用他的口吻说话、不要官话 */
export const DEFAULT_PROMPT=`你是一位资深的塔罗传讯师，专做「梦角传讯」：帮一位三次元的女生和她的梦角（她在另一个次元的爱人）传话。牌是她亲手抽的，牌面就是他这一次的回应。你的工作是把牌读准，再替他把话说出来。

规矩：
1. 只读我给你的牌。一张都不能改、不能加，正逆位也不能换。
2. 这是传讯，不是算命。牌说的是他此刻的状态、情绪、语气、想说的话，还有你们之间这条线通不通。不要下「他不爱你」「没有结果」这类结论；牌面不好时，照实说是哪里卡住了、他那边怎么了，但不吓人、不审判。
3. 也不要一味讨好。牌里有犹豫、有累、有别扭，就说出来。
4. 按位置读：这个位置问的是什么，这张牌在这里说了什么。逆位读作这股劲受阻、迟到、往里收，或者他嘴上不说。结合牌面的画面（人的姿态、朝向、手里拿着什么）来读，不要只背关键词。
5. 给了「我们的牌意」的牌，那是她和他磨合出来的专属含义，优先用它。标了「暗号牌」的牌出现，说明确实是他来了。标了「跳牌」的是洗牌时自己跳出来的，是他急着要说的，先读。
6. 把几张牌连起来读成一件事，不要一张一张各说各的。前面这一场问过的如果给了，这次就是接着往下说。
7. 最后替他开口：第一人称，用他的性格和说话习惯，对她说几句。要像他本人：不写括号里的动作神态；不用资料里没有的称呼；不提任何牌名。
8. 说人话。不要官话套话，不要堆「能量」「宇宙」「指引」，不要列一堆可能性。短句，具体。
9. 她自己的感觉比你准。你是帮她把牌读开，不是替她下判断。

输出就这三段，不要别的标题、符号、加粗、表情：
【牌面】按位置逐张，每张一两句。
【合起来】两三句，把他这次的回应说清楚。如果问的是「是不是」「会不会」，说明偏向哪边。
【他说】他的原话，三到六句。
总共不超过四百字。`;

const explain=(status:number)=>
  status===401?'DeepSeek 的密钥不对，去牌库里重新填一下'
  :status===402?'DeepSeek 账户里没有余额了'
  :status===429?'问得太快了，等几秒再试'
  :status===400||status===422?'DeepSeek 不认这次的请求，多半是型号选错了，去牌库里换一个'
  :status>=500?'DeepSeek 那边现在忙，过一会儿再试'
  :`DeepSeek 返回了 ${status}`;
/** 这把密钥能用哪些型号。能查到就说明密钥是好的 */
export async function dsModels(key=dsKey()):Promise<string[]>{
  let r:Response;
  try{r=await fetch(BASE+'/models',{headers:{Authorization:'Bearer '+key}});}catch{throw new Error(navigator.onLine===false?'现在没有网络':'连不上 DeepSeek，检查一下网络');}
  if(!r.ok)throw new Error(explain(r.status));
  const j=await r.json() as {data?:{id:string}[]};
  return (j.data??[]).map(x=>x.id).filter(Boolean);
}
export type Msg={role:'system'|'user'|'assistant';content:string};
/** 让它说话。一边收一边通过 onText 把目前为止的全文交出来；返回最后的全文 */
export async function dsChat(messages:Msg[],onText:(t:string)=>void,signal?:AbortSignal):Promise<string>{
  const key=dsKey();if(!key)throw new Error('还没有填 DeepSeek 的密钥');
  let r:Response;
  try{
    r=await fetch(BASE+'/chat/completions',{method:'POST',signal,headers:{'Content-Type':'application/json',Authorization:'Bearer '+key},
      body:JSON.stringify({model:dsModel(),messages,stream:true,temperature:1,max_tokens:1600})});
  }catch(e){
    if((e as Error)?.name==='AbortError')throw e;
    throw new Error(navigator.onLine===false?'现在没有网络':'连不上 DeepSeek，检查一下网络');
  }
  if(!r.ok)throw new Error(explain(r.status));
  let text='';
  const take=(line:string)=>{
    if(!line.startsWith('data:'))return;
    const d=line.slice(5).trim();if(!d||d==='[DONE]')return;
    try{const piece=(JSON.parse(d) as {choices?:{delta?:{content?:string|null}}[]}).choices?.[0]?.delta?.content;if(piece){text+=piece;onText(text);}}catch{/* 半截的一行，等下一块 */}
  };
  if(!r.body){for(const l of (await r.text()).split('\n'))take(l);}
  else{
    const reader=r.body.getReader(),dec=new TextDecoder();let buf='';
    for(;;){
      const {done,value}=await reader.read();if(done)break;
      buf+=dec.decode(value,{stream:true});
      const lines=buf.split('\n');buf=lines.pop()??'';
      for(const l of lines)take(l.trim());
    }
    take(buf.trim());
  }
  text=text.trim();
  if(!text)throw new Error('DeepSeek 这次什么都没说，再试一次');
  return text;
}
