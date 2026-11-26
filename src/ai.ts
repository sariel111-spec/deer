// AI 解牌。两种用法：
// 1. 不花钱：把这次的问题、牌和读法复制好，带去 DeepSeek / 豆包 / Kimi 的免费网页或 App 里问，再把回答贴回来存进记录。
//    （这些 App 的免费聊天没有对外的接口，站里没法替你直接连进去，只能这样带过去。）
// 2. 自动解：接一个「OpenAI 兼容」的接口，翻开牌就在站里直接解。接口都要密钥；选带免费模型的服务（比如 OpenRouter）就不花钱。
// 密钥只存在这台设备的浏览器里（localStorage），不进同步、不进代码仓库；每台设备各填一次。
// 发出去的只有：这一位的名字和资料、你的名字、问题、抽到的牌、你写的专属牌意、他的几句字卡。聊天记录不发。
export type Prov={id:string;name:string;base:string;free?:boolean;note:string;keyAt:string;def:string};
export const provs:Prov[]=[
  {id:'openrouter',name:'OpenRouter 免费',base:'https://openrouter.ai/api/v1',free:true,def:'openrouter/free',keyAt:'openrouter.ai/keys',
    note:'不花钱。注册不用绑卡，名字带 :free 的模型不收费，每天大约 50 次；免费的模型会换，这里只列出当下免费的'},
  {id:'deepseek',name:'DeepSeek 官方',base:'https://api.deepseek.com',def:'deepseek-flash',keyAt:'platform.deepseek.com',
    note:'按量收费，要先充值。和 DeepSeek App 里免费的聊天不是一回事'},
  {id:'custom',name:'别的服务',base:'',def:'',keyAt:'',
    note:'任何「OpenAI 兼容」的接口都行：填它的接口地址（一般以 /v1 结尾）和密钥，再选型号'},
];
/** 带去哪个聊天 App 问（不花钱的那条路） */
// url：电脑上开的网页。app：手机上用来直接唤起 App 的链接——
//   DeepSeek 的网页没有配通用链接，用它官方网页自己用的 dpsk:// 协议；豆包、Kimi 的是通用链接（装了 App 就进 App，没装就是网页）
export const hands=[
  {id:'deepseek',name:'DeepSeek',url:'https://chat.deepseek.com/',app:'dpsk://chat/new'},
  {id:'doubao',name:'豆包',url:'https://www.doubao.com/chat/',app:'https://www.doubao.com/chat/'},
  {id:'kimi',name:'Kimi',url:'https://www.kimi.com/',app:'https://www.kimi.com/app/'},
];
const K={key:'cx-ds-key',model:'cx-ds-model',auto:'cx-ds-auto',prompt:'cx-ds-prompt',prov:'cx-ai-prov',base:'cx-ai-base',hand:'cx-ai-hand'};
const get=(k:string)=>{try{return localStorage.getItem(k)??'';}catch{return '';}};
const set=(k:string,v:string)=>{try{if(v)localStorage.setItem(k,v);else localStorage.removeItem(k);}catch{/* 存不了就这次用 */}};
// DeepSeek 官方的密钥和型号沿用原来的存法（以前填过的照旧能用），别的服务各存各的
const keyAt=(id:string)=>id==='deepseek'?K.key:'cx-ai-key:'+id,modelAt=(id:string)=>id==='deepseek'?K.model:'cx-ai-model:'+id;
/** 现在用的是哪个服务。没选过：以前填过 DeepSeek 密钥的还是 DeepSeek，否则是免费的那个 */
export const aiProv=():Prov=>provs.find(x=>x.id===get(K.prov))??(get(K.key)?provs[1]:provs[0]);
export const setAiProv=(id:string)=>set(K.prov,id);
export const aiBase=()=>{const p=aiProv();return (p.id==='custom'?get(K.base):p.base).trim().replace(/\/+$/,'').replace(/\/chat\/completions$/,'');};
export const setAiBase=(v:string)=>set(K.base,v.trim());
/** 是不是在手机或平板上（那就直接唤起 App，不开网页） */
export const onPhone=()=>/iPhone|iPad|iPod|Android/i.test(navigator.userAgent)||(/Macintosh/.test(navigator.userAgent)&&navigator.maxTouchPoints>1);
export const aiHand=()=>hands.find(x=>x.id===get(K.hand))??hands[0];
export const setAiHand=(id:string)=>set(K.hand,id);
export const dsKey=()=>get(keyAt(aiProv().id));
export const setDsKey=(v:string)=>set(keyAt(aiProv().id),v.trim());
// 现在在用的型号。型号名会换，所以设置里是从接口现查的；这里只是没查到时的默认
export const dsModel=()=>get(modelAt(aiProv().id))||aiProv().def;
export const setDsModel=(v:string)=>set(modelAt(aiProv().id),v.trim());
/** 这个服务的型号是自己选过的吗（没选过的话，接上时替她挑一个） */
export const modelChosen=()=>!!get(modelAt(aiProv().id));
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
4. 按位置读：这个位置问的是什么，这张牌在这里说了什么。逆位不等于坏，也不只是受阻：可能是往里收着、嘴上不说、来得迟、过了头或不够；本来就难的牌逆位常是在松开、好转；聊到以前的事时也可能只是在说过去。看这张牌本身和旁边的牌来定，不要一见逆位就往坏处读。结合牌面的画面（人的姿态、朝向、手里拿着什么）来读，不要只背关键词。每张牌后面带的「画面」是牌上画的东西，「传讯读法」是这张牌在这个位置上最该看的那一面，都拿来用。
5. 给了「我们的牌意」的牌，那是她和他磨合出来的专属含义，优先用它。标了「暗号牌」的牌出现，说明确实是他来了。标了「跳牌」的是洗牌时自己跳出来的，是他急着要说的，先读。
6. 把几张牌连起来读成一件事，不要一张一张各说各的。只解【这一次】的问题和牌；【这一场开场时抽的】如果给了，只当作背景（确认是他、当时线上的气氛），不用再逐张解。
7. 最后替他开口之前，先把【他的人设】那一段读一遍：他是谁、什么性格、怎么说话、怎么称呼她，都以那里写的为准。然后用第一人称、照着这个人设对她说几句，要像他本人在说话，不是你在转述。不写括号里的动作神态；不用人设里没有的称呼；不提任何牌名；人设里没写的经历和设定不要自己编。
8. 说人话。不要官话套话，不要堆「能量」「宇宙」「指引」，不要列一堆可能性。短句，具体。
9. 她自己的感觉比你准。你是帮她把牌读开，不是替她下判断。

输出就这三段，不要别的标题、符号、加粗、表情：
【牌面】按位置逐张，每张一两句。
【合起来】两三句，把他这次的回应说清楚。如果问的是「是不是」「会不会」，说明偏向哪边。
【他说】他的原话，三到六句。
总共不超过四百字。`;

/* 解读一封信的指令。按小红书上大家请 AI「翻译」字卡回信的问法整理的：
   先讲清字卡是怎么回事、信会断断续续；结合她写的信逐句看在回应什么；没挑准的句子不硬解；直白、不给建议；最后用他的口吻顺成一段 */
export const MAIL_PROMPT=`你是一位资深的字卡传讯师，帮一位三次元的女生读她的梦角（她在另一个次元的爱人）用字卡写来的信。

先知道字卡是怎么回事：她提前照着他的人设和语气写好了很多句字卡，他只能从这些现成的句子里挑着用。所以他的信读起来会断断续续、跳来跳去，这很正常；里面也可能混着一两句没挑准的。你的工作是结合她写的信，把他真正想说的意思读出来。

规矩：
1. 只读我给你的信。一句都不能改、不能加。
2. 先把【他的人设】读一遍：他是谁、什么性格、怎么说话、怎么称呼她，都以那里写的为准。
3. 结合她信里说的事，一句一句看他是在回应哪句话、哪件事。实在对不上的句子不要硬解，直接说「这句像是没挑准，可以略过」。
4. 说人话：直白、具体，不用华丽的比喻，不堆「能量」「宇宙」「指引」。信里有别扭、有累，就照实说；不吓人，也不一味讨好。不下「没连上就是不爱」这类结论。
5. 不给她建议，不让她去验证什么。她自己的感觉比你准。

输出就这三段，不要别的标题、符号、加粗、表情：
【连上了吗】一两句，这封信整体有没有接上她说的话。
【逐句】按顺序，每句字卡后面用一句话说他的意思、在回应什么。
【他想说的】用他的口吻、第一人称，把这封信的意思顺成通顺的几句话。只用信里有的意思，不添新的内容；不写括号里的动作神态；不用人设里没有的称呼。
总共不超过四百字。`;

const explain=(status:number)=>{
  const free=aiProv().free;
  return status===401||status===403?'密钥不对，去牌库里重新填一下'
  :status===402?(free?'这个账户欠着费，免费的模型也用不了了':'账户里没有余额了')
  :status===429?(free?'免费的次数用完了，或者问得太快。等一会儿再试，也可以先「带去聊天 App」解':'问得太快了，等几秒再试')
  :status===400||status===404||status===422?'这个型号现在用不了，去牌库里换一个'
  :status>=500?'那边现在忙，过一会儿再试'
  :`接口返回了 ${status}`;
};
const offline=()=>new Error(navigator.onLine===false?'现在没有网络':'连不上这个接口，检查一下网络和接口地址');
/** 免费服务里优先挑中文好的：有 DeepSeek 就用它，其次这些 */
const liked=['deepseek','ernie','qwen','glm','kimi','doubao','nemotron-3-ultra','gemma'];
export const bestOf=(ids:string[])=>{for(const w of liked){const m=ids.find(x=>x.includes(w));if(m)return m;}return ids[0]??'';};
/** 这把密钥能用哪些型号。能查到就说明密钥是好的。免费的服务只留不收钱的型号 */
export async function dsModels(key=dsKey()):Promise<string[]>{
  const p=aiProv(),base=aiBase();
  if(!base)throw new Error('先填接口地址');
  let r:Response;
  try{r=await fetch(base+'/models',{headers:{Authorization:'Bearer '+key}});}catch{throw offline();}
  if(!r.ok)throw new Error(explain(r.status));
  const j=await r.json() as {data?:{id:string;pricing?:{prompt?:string;completion?:string}}[]};
  let list=(j.data??[]).filter(x=>x?.id);
  if(p.id==='openrouter'){
    // OpenRouter 查型号不验密钥，所以另外验一次
    let k:Response;try{k=await fetch(base+'/key',{headers:{Authorization:'Bearer '+key}});}catch{throw offline();}
    if(!k.ok)throw new Error(explain(k.status));
    list=list.filter(x=>x.id.endsWith(':free')||x.id==='openrouter/free');
  }
  return list.map(x=>x.id);
}
export type Msg={role:'system'|'user'|'assistant';content:string};
/** 让它说话。一边收一边通过 onText 把目前为止的全文交出来；返回最后的全文 */
export async function dsChat(messages:Msg[],onText:(t:string)=>void,signal?:AbortSignal):Promise<string>{
  const key=dsKey(),BASE=aiBase();if(!key||!BASE)throw new Error('还没有接上解牌的接口');
  let r:Response;
  try{
    r=await fetch(BASE+'/chat/completions',{method:'POST',signal,headers:{'Content-Type':'application/json',Authorization:'Bearer '+key},
      body:JSON.stringify({model:dsModel(),messages,stream:true,temperature:1,max_tokens:3000})});
  }catch(e){
    if((e as Error)?.name==='AbortError')throw e;
    throw offline();
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
  if(!text)throw new Error('这次什么都没说，再试一次；老是这样就去牌库换个型号');
  return text;
}
