// 雷诺曼：36 张，不分正逆，靠几张连起来读。
// 牌意是照通行的雷诺曼含义、按梦角传讯/梦占的读法自己写的：他在做什么、他的心情、对你、场景线索；
// 负面的牌另写一句「在梦向里怎么读」（多半是他在担心、心疼、嘴硬，而不是坏消息）。
import type {Drawn} from './tarot';
import {cards as tcards,suitOf} from './tarot';

export type LKind='act'|'mood'|'who'|'thing'|'when';
export const kindName:Record<LKind,string>={act:'行动',mood:'情绪',who:'人',thing:'事物',when:'时间地点'};
export type LCard={n:number;name:string;kw:string[];kind:LKind;yn:1|0|-1;doing:string;mood:string;love:string;scene:string;note:string};
// 牌名|关键词|类型|是否|他在做什么|他的心情|对你|场景线索|梦向里怎么读
const rows=`
骑士|消息 到来 主动|act|1|正往你这边来，带着话要说|急切，坐不住|想第一个到你身边，替你挡在前面|门口、路上；很快|
四叶草|小幸运 开心 轻松|mood|1|碰上了件小小的好事，在偷着乐|轻快，心情好|想逗你笑，把这点好运分给你|草地、路边；一小会儿|
船|出发 远行 靠近|act|1|在路上，朝着你这边过来|期待，带点想念|想跨过这段距离来找你|水边、车站、远方|
房子|家 安稳 归属|when|0|在家里待着，收拾、歇着|踏实，放松|想给你一个可以回来的地方|家里、屋子里|
树|慢慢来 扎根 身体|thing|0|在按自己的步调过日子，养精神|平和，不急|想陪你久一点，慢慢长在一起|树下、户外；很长的时间|
云|看不清 迷糊 犹豫|mood|-1|有点理不清头绪，在想事情|迷茫，心里没底|不是不想说，是还没想明白怎么说|阴天、雾里|挨着它的那张牌，是他还没看清的地方，不是坏消息。
蛇|弯绕 欲望 警觉|mood|-1|在绕着弯想办法，或者盯着什么不放|戒备，又有点上头|想缠着你，也怕你被别的牵走|弯路、细长的东西|梦向里少读成「第三者」，多是他的占有欲，或者他在担心你。
棺材|结束 休息 停下|act|-1|一件事刚收尾，在歇着，或者睡了|累，安静下来了|这个话题他想先放一放，让你也歇歇|床上、关着的房间；夜里|多半是前一张牌那件事结束了，也常指这一轮话说完了。
花束|礼物 心意 夸奖|thing|1|在准备一份心意，或者在夸你|欣赏，心里软软的|想送你东西，想让你被好好对待|花店、桌上的花|
镰刀|突然 决断 切开|act|-1|突然做了个决定，或者手上的事被打断了|干脆，有点冲|想替你一刀斩掉让你烦的事|锋利的东西；一下子|说的是快和断，不是伤你。
鞭子|反复 纠结 较劲|mood|-1|同一件事翻来覆去在想，或者在练、在重复|拧着，跟自己较劲|在意才会来回想，嘴上可能还要和你拌两句|健身、打扫；一遍又一遍|落在你这边时，多是你在自责、内耗。
鸟|聊天 念叨 小紧张|act|0|在说话、在回消息，叽叽喳喳地念叨|有点紧张，话多|想和你一句一句聊下去|电话、窗边；成对的|
孩子|新的 单纯 小小的|thing|0|在玩，在试一件新鲜的事|天真，没设防|把你当小朋友宠，也想对你撒娇|游乐的地方；刚开始|
狐狸|机灵 试探 留一手|mood|-1|在动小脑筋，装作不在意地打量|嘴硬，藏着一点|在试探你的心意，想听你先说|上班的地方；精明的人|梦向里多是他嘴硬、耍小聪明逗你，不是骗你。
熊|保护 靠山 占有|who|1|在护着什么、撑着场面，或者在吃东西|有底气，稳|保护欲上来了，想把你圈在怀里|餐桌、厚实温暖的地方|
星星|愿望 指引 夜晚|when|1|在看夜空，在许愿，在想以后|安心，有盼头|你是他许的那个愿|夜里、屏幕前、露天|
鹳|改变 好转 搬动|act|1|在挪地方、换状态，事情在往好里变|松了口气|想帮你从现在的状态里好起来|换季、搬家、回来|
狗|陪伴 忠诚 朋友|who|1|就在旁边守着，等你|安稳，黏人|哪儿也不去，就陪着你|身边、熟悉的地方|
塔|独处 距离 规矩|when|0|一个人待在高处，或者埋在公事里|有点孤单，端着|隔着距离看着你，想你但没开口|高楼、单位、学校|
花园|外面 人群 公开|when|0|在外面，人多的地方，或者在应酬|体面，放不太开|想把你带到人前，大大方方地介绍|公园、聚会、网上|
山|阻碍 僵住 慢|thing|-1|被一件难事挡着，一时过不来|闷，使不上劲|不是不想来，是被事情拦住了，要等一等|山、很远；拖得久|说的是慢和等，不是不要你。
路口|选择 分心 两条路|act|0|在两件事之间拿主意|犹豫|想听你说，你更想要哪一个|路口、岔道|也常是在说你：最近心思分到了别处。
老鼠|消耗 不安 一点点少|mood|-1|被琐事一点点磨着，或者在偷吃零食|焦虑，心里不踏实|在担心，怕你受委屈、怕你不好好吃饭|厨房、角落；不知不觉|他不安的时候，最需要你一句准话。
心|爱 心动 真心|mood|1|在想你|满的，软的|就是爱你，没有别的话|心口、贴近的地方|
戒指|承诺 约定 绑定|thing|1|在认真答应一件事，或者想起你们约好的|郑重|想把你和他定下来|圆的东西；反复出现的|
书|秘密 学习 还没说|thing|0|在看书、查东西，或者心里压着一件没说的事|沉着，装着事|你写给他的那些他都收着；有件事他还没告诉你|书桌、书架；一大摞|
信|文字 消息 留言|thing|0|在写、在读你发的东西|认真，逐字地看|你的信他收到了，想好好回你|手机、纸、信箱|
男士|他|who|0|他本人||||默认代表他。旁边的牌在说他。
女士|你|who|0|在看着你、在说你||||默认代表你。旁边的牌在说你。
百合|安宁 成熟 长久|mood|1|安安静静地待着，心很定|平静，温柔|想和你过细水长流的日子|冬天、安静的屋子|
太阳|开心 明朗 成了|mood|1|精神很好，在外面，笑着|高兴，亮堂堂的|见到你就高兴，全都摆在明面上|白天、晴天|核对的时候出它，就是「对」。
月亮|情绪 想念 夜里|mood|0|夜里睡不着，在想你|柔软，容易多想|想被你看见，想入你的梦|晚上、月光下|
钥匙|确定 答案 打开|thing|1|找到办法了，在开一扇门|笃定|答案是肯定的，他就认这个|门、锁；关键的那一下|
鱼|很多 流动 给予|thing|1|在忙进忙出，手头的东西很多|充实，大方|想把好的都给你，多少都不嫌多|水里、商店；数量多|也有人读成「分出去的」：你的喜欢流去了别处，他看在眼里。
锚|稳定 停靠 不走|act|1|停在一个地方，守着手上的事|踏实，认定了|认准你了，不挪窝|岸边、工位；一直|
十字架|担子 心疼 必经|mood|-1|在扛一件不轻松的事|沉，心疼|他知道你难受，想替你分一点|医院、要紧的场合|落在他的感受上，是心疼你，不是他不好。
`.trim().split('\n').map(r=>r.split('|'));
export const LTOTAL=36;
export const lcards:LCard[]=rows.map((r,i)=>({n:i+1,name:r[0],kw:r[1].split(' '),kind:r[2] as LKind,yn:Number(r[3]) as 1|0|-1,doing:r[4],mood:r[5],love:r[6],scene:r[7],note:r[8]??''}));
if(import.meta.env.DEV&&lcards.length!==LTOTAL)console.error('雷诺曼张数不对',lcards.length);
export const HE=27,ME=28;   // 男士、女士在牌里的位置（从 0 数）

/** 洗牌：36 张打乱，用系统给的真随机数。skip 是已经在桌上的牌 */
export function lshuffle(skip:number[]=[]):number[]{
  const n=LTOTAL,buf=new Uint32Array(n);
  try{crypto.getRandomValues(buf);}catch{for(let i=0;i<n;i++)buf[i]=Math.floor(Math.random()*2**32);}
  const deck=Array.from({length:n},(_,c)=>c);
  for(let i=n-1;i>0;i--){const j=buf[i]%(i+1);[deck[i],deck[j]]=[deck[j],deck[i]];}
  return deck.filter(c=>!skip.includes(c));
}

/* 牌阵。都是梦角圈实际在用的摆法：三张一行、是非三张、二选一各两张、早中晚。
   不放前任/断联那类带「第三方」「危机」位置的现占牌阵 */
export type LSpread='doing'|'yn'|'ab'|'day3';
export const lspreads:Record<LSpread,{name:string;when:string;pos:string[];ask?:'q'|'ab'}>={
  doing:{name:'他在做什么 · 三张',when:'想知道他这会儿在忙什么、心情怎么样',pos:['他在做的事','他的心情','再多一点']},
  day3:{name:'他今天过得怎么样 · 三张',when:'晚上问一问他的一天',pos:['早上','白天','晚上']},
  yn:{name:'是不是 · 三张',when:'问一个能用是或不是回答的问题。问得直接一点，带上时间',pos:['眼下','答案','之后'],ask:'q'},
  ab:{name:'二选一 · 各两张',when:'拿不定主意，让他帮你看看。写下两个选项',pos:['甲','甲','乙','乙'],ask:'ab'},
};
export const lspreadIds:LSpread[]=['doing','day3','yn','ab'];
export const ynWord=(v:number)=>v>0?'是':v<0?'不是':'看旁边';
/** 是非三张：中间那张说了算；中间是中性牌就看两边 */
export function ynOf(cs:number[]):{word:string;why:string}{
  const [a,b,c]=cs.map(x=>lcards[x]);
  if(!b)return {word:'',why:''};
  if(b.yn)return {word:b.yn>0?'是':'不是',why:`中间的${b.name}是${b.yn>0?'肯定':'否定'}的牌。`};
  const s=(a?.yn??0)+(c?.yn??0);
  return {word:s>0?'偏向是':s<0?'偏向不是':'还说不准',why:`中间的${b.name}是中性牌，要看两边：${[a,c].filter(Boolean).map(x=>`${x!.name}${x!.yn>0?'偏肯定':x!.yn<0?'偏否定':'中性'}`).join('，')}。`};
}
/** 二选一：各看两张的倾向 */
export function abOf(cs:number[],a:string,b:string):string{
  const sa=cs.slice(0,2).reduce((s,c)=>s+lcards[c].yn,0),sb=cs.slice(2,4).reduce((s,c)=>s+lcards[c].yn,0);
  return sa===sb?'两边差不多，听你自己更想要哪个。':`牌更偏向「${sa>sb?a:b}」。`;
}

/** 这张牌在这里代表谁（代表牌）：他 / 你 / 都不是 */
export const whoOf=(c:number,who?:{he?:number;me?:number}):''|'he'|'me'=>c===(who?.he??HE)?'he':c===(who?.me??ME)?'me':'';
export const lname=(c:number,who:{he?:number;me?:number}|undefined,he:string)=>{const w=whoOf(c,who);return w==='he'?`${lcards[c].name}（${he}）`:w==='me'?`${lcards[c].name}（你）`:lcards[c].name;};
/** 某个位置上先读哪一面 */
export type LAspect='doing'|'mood'|'love'|'kw'|'you';
export function lread(c:number,a:LAspect):string{
  const x=lcards[c];
  if(a==='doing')return x.doing;
  if(a==='mood')return x.mood||x.doing;
  if(a==='love')return x.love||x.doing;
  return x.kw.join('、');
}
export const lfacets=(c:number):[string,string][]=>{const x=lcards[c];return ([['关键词',x.kw.join(' · ')],['他在做什么',x.doing],['他的心情',x.mood],['他对你',x.love],['场景线索',x.scene],['梦向里',x.note]] as [string,string][]).filter(r=>r[1]);};

/** 聊天里他回的三张：你这句话 · 他的感受 · 他想做的（圈里「传话」的读法）。不是三张就不标位置 */
export const sayPos=['你这句话','他的感受','他想做的'];
const sayAsp:LAspect[]=['you','mood','love'];
/** 「给个提示」：不替你写成一句话，只把每张牌在它那个位置上的意思摆出来 */
export function lhint(cs:number[],withText:boolean,who:{he?:number;me?:number}|undefined,he:string):string[]{
  if(cs.length===3&&withText)return cs.map((c,i)=>`${sayPos[i]} · ${lname(c,who,he)}：${lread(c,sayAsp[i])}`);
  if(cs.length===3)return [`中间的${lname(cs[1],who,he)}是主题：${lcards[cs[1]].doing}。`,`两边在形容它：${lcards[cs[0]].name}（${lcards[cs[0]].kw.join('、')}）、${lcards[cs[2]].name}（${lcards[cs[2]].kw.join('、')}）。`,'从左到右连成一句话。'];
  return cs.map(c=>`${lname(c,who,he)}：${lcards[c].doing}`);
}

/* 「在吗」一张（塔罗）：圈里常见的读法，只当提示，像不像他由你说了算 */
export function hereOf(d:Drawn,sign:boolean):string{
  if(sign)return '他的暗号牌：是他。';
  const c=d.c,s=suitOf(c),rank=s<0?-1:(c-22)%14;   // 0–9 数字牌，10 侍从 11 骑士 12 王后 13 国王
  const nm=tcards[c].name;
  if(c===1)return d.r?'魔术师逆位：线卡了一下，等一会儿再试。':'魔术师：线接得很好。';
  if(nm==='圣杯十'||nm==='宝剑四'||nm==='宝剑十')return '这张常是他在休息，或者手上有事没在。可以晚点再来。';
  if(nm==='圣杯二'&&d.r)return '圣杯二逆位：这会儿没对上，晚点再试。';
  if(rank===11)return d.r?'骑士逆位：他被事情绊着，还没到。':'骑士：他在赶来的路上，稍等一下再问。';
  if(rank>=10)return d.r?'宫廷牌逆位：他可能在忙，或者状态不太好。':'宫廷牌正位：他在，等着你呢。';
  return '看看这张牌的样子，像不像他此刻会有的状态。';
}

/** 雷诺曼怎么读（牌库里的小抄） */
export const lguide:[string,string][]=[
  ['不分正逆','雷诺曼没有逆位。一张牌只有一个意思，好坏要看它挨着谁。'],
  ['不单看一张','至少两张连着读。把每张当成一个词，连词成句：信 + 花园，是「把写下的话拿出去说」。'],
  ['先看图说话','像小时候看图写话：先看牌上画的是什么，再想它放在你们之间是什么。'],
  ['三张怎么读','你说了一句话、他回三张时：第一张是你这句话里的状态，第二张是他听了的感受，第三张是他想为你做的。没说话请他先开口时：中间那张是主题，左右是在形容它。'],
  ['负面的牌往里读','云、老鼠、十字架这些，在梦向里多半是他在担心、心疼、拿不准，不是坏消息。可以对着那一张再补一张。'],
  ['代表牌','男士牌默认是他，女士牌默认是你。也可以和他商量着各换一张，在牌库里改。代表牌出现，旁边的牌就是在说这个人。'],
];
/** 自己传讯的顺序 */
export const flow:[string,string][]=[
  ['开场','心静下来再开始。先看他在不在：新手用「对一对」三张对性格，熟了以后「在吗」一张就够。不像他就隔一会儿再试，别反复抽。'],
  ['对他说','对着他说话，不是对着牌问「他怎么想」。一句话抽一次牌；小事一两张，想听他多说就三张。'],
  ['自己先读','看画面 → 想想刚才聊到哪 → 再看牌意 → 把它写成他的一句话。读不出来就点「给个提示」。'],
  ['拿不准就补一张','核对：问他「我读得对吗」。接着说：让他把这句讲完。关键词：给塔罗补一张雷诺曼，抓重点。一句最多补两张。'],
  ['话题变了就另起','顺着聊可以一直补；换了话题就重新说一句。看不懂了、累了，就先聊到这。'],
  ['收尾','和他说一声再走。聊完可以让 AI 帮你对一遍，看看哪里可能读偏了；哪次读得特别准，记进我们的牌意。'],
];
