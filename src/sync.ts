import {useSyncExternalStore} from 'react';
import {adopt,delKey,dropImageCache,dump,getKey,onChange,readKey,setKey,storageDown,type Reading,type Letter,type Box,type Deck,type Dump,type Grave,type Msg,type Pack,type Persona,type State} from './db';

/* 同步：把数据放进你自己的一个私有 GitHub 仓库。
   不是整包覆盖——每台设备先把云端的拿下来和本机的合并，再把合并后的结果传上去；
   数据拆成小文件（资料和字卡一份、每位的聊天各一份、每位的小功能各一份、图片各一份），哪份变了传哪份。 */

type Remote={repo:string;token:string;auto:boolean};
// 只有本地开发时才允许把接口指到别处（测试用的假 GitHub）；线上永远只连 api.github.com
const BASE=import.meta.env.DEV&&localStorage.getItem('cx-api')||'https://api.github.com';
type Synced={tree:Record<string,string>;at:number;cloudAt:number};
export type SyncState={on:boolean;repo:string;auto:boolean;busy:boolean;at:number;cloudAt:number;localAt:number;err:string;note:string};

let remote:Remote|null=null,synced:Synced={tree:{},at:0,cloudAt:0};
let st:SyncState={on:false,repo:'',auto:true,busy:false,at:0,cloudAt:0,localAt:0,err:'',note:''};
const subs=new Set<()=>void>();
const put=(p:Partial<SyncState>)=>{st={...st,...p};subs.forEach(f=>f());};
export const useSync=()=>useSyncExternalStore(f=>{subs.add(f);return()=>{subs.delete(f);};},()=>st);

class Fail extends Error{constructor(public code:number,msg:string){super(msg);}}
const explain=(e:unknown)=>{
  if(e instanceof Fail){
    if(e.code===401)return '令牌不对，或者已经过期了';
    if(e.code===404)return '找不到这个仓库，或者令牌没有被允许访问它';
    if(e.code===403)return /rate limit/i.test(e.message)?'请求太频繁，过几分钟再试':'令牌没有写入这个仓库的权限（需要 Contents：Read and write）';
    if(e.code===422||e.code===409)return '云端刚好被另一台设备更新了，再同步一次就好';
    return `GitHub 返回了 ${e.code}`;
  }
  return navigator.onLine===false?'现在没有网络':'连不上 GitHub，检查一下网络';
};
async function api<T>(r:Remote,path:string,init?:{method?:string;body?:unknown}):Promise<T>{
  const res=await fetch(BASE+'/repos/'+r.repo+path,{method:init?.method??'GET',cache:'no-store',
    headers:{Accept:'application/vnd.github+json',Authorization:'Bearer '+r.token,'X-GitHub-Api-Version':'2022-11-28',...(init?.body?{'Content-Type':'application/json'}:{})},
    body:init?.body?JSON.stringify(init.body):undefined});
  if(!res.ok)throw new Fail(res.status,await res.text().catch(()=>''));
  return res.json() as Promise<T>;
}

/* ───────── 文件 ───────── */

const enc=new TextEncoder(),dec=new TextDecoder();
// 键按字母排好再写，两台设备写出来的文本才会一模一样
const canon=(v:unknown):string=>v===null||typeof v!=='object'?JSON.stringify(v)??'null'
  :Array.isArray(v)?'['+v.map(canon).join(',')+']'
  :'{'+Object.keys(v as object).sort().filter(k=>(v as Record<string,unknown>)[k]!==undefined).map(k=>JSON.stringify(k)+':'+canon((v as Record<string,unknown>)[k])).join(',')+'}';
async function blobSha(text:string){
  const body=enc.encode(text),head=enc.encode(`blob ${body.length}\0`),all=new Uint8Array(head.length+body.length);
  all.set(head);all.set(body,head.length);
  return [...new Uint8Array(await crypto.subtle.digest('SHA-1',all))].map(b=>b.toString(16).padStart(2,'0')).join('');
}
const unb64=(c:string)=>dec.decode(Uint8Array.from(atob(c.replace(/\s/g,'')),ch=>ch.charCodeAt(0)));
type Shared={personas:Persona[];decks:Deck[];packs?:Pack[];dead:Record<string,number>;prefs:{myName:string;myAvatar?:string;bubble:State['prefs']['bubble'];at?:number;cloud?:string;plan?:State['prefs']['plan'];quick?:string[];dayAt?:number;hl?:string[];hlOrd?:boolean;hlPic?:Record<string,string>}};
type Chat={msgs:Msg[];grave:Grave};
const F={state:'data/state.json',m:(id:string)=>`data/m/${id}.json`,x:(id:string)=>`data/x/${id}.json`,a:(id:string)=>`data/a/${id}.txt`};
function files(d:Dump):Record<string,string>{
  const pf=d.state.prefs,out:Record<string,string>={};
  out[F.state]=canon({personas:d.state.personas,decks:d.state.decks,packs:d.state.packs??[],dead:d.state.dead??{},prefs:{myName:pf.myName,myAvatar:pf.myAvatar,bubble:pf.bubble,at:pf.at,cloud:pf.cloud||undefined,plan:pf.plan,quick:pf.quick,dayAt:pf.dayAt,hl:pf.hl,hlOrd:pf.hlOrd,hlPic:pf.hlPic}} satisfies Shared);
  for(const p of d.state.personas){
    out[F.m(p.id)]=canon({msgs:d.msgs[p.id]??[],grave:d.graves[p.id]??{dead:[],cleared:0}} satisfies Chat);
    if(d.boxes[p.id]?.at)out[F.x(p.id)]=canon({...d.boxes[p.id],ring:undefined,call:undefined});   // 响铃、通话中只是这台设备此刻的事，不上传
  }
  return out;
}
const presets=new Set(['dots','mist']);
function imageIds(d:Dump){
  const ids=new Set<string>();const add=(x?:string)=>{if(x&&!presets.has(x)&&!/^https?:/.test(x))ids.add(x);};
  add(d.state.prefs.myAvatar);for(const x of Object.values(d.state.prefs.hlPic??{}))add(x);for(const k of d.state.packs??[])for(const x of k.ids)add(x);
  for(const p of d.state.personas){
    add(p.avatar);add(p.wall);add(p.photo);add(p.homeBg);add(p.callPic);
    for(const m of d.msgs[p.id]??[])if(m.kind==='img')add(m.text);
    for(const x of d.boxes[p.id]?.posts??[])add(x.img);
    const bx=d.boxes[p.id];for(const l of bx?.letters??[]){add(l.img);add(l.planImg);}
    for(const x of bx?.mailPics??[])add(x);add(bx?.mailNext?.img);
  }
  return ids;
}

/* ───────── 合并 ───────── */

function merge(l:Dump,r:{state?:Shared;m:Record<string,Chat>;x:Record<string,Box>}):Dump{
  let state=l.state;
  if(r.state){
    const dead={...l.state.dead};for(const [id,t] of Object.entries(r.state.dead??{}))dead[id]=Math.max(dead[id]??0,t);
    // 同一个人、同一个分组：谁改得晚听谁的；删掉的不再回来
    const pick=<T extends {id:string;updated:number;created:number}>(a:T[],b:T[])=>{
      const m=new Map<string,T>();for(const x of [...a,...b]){const o=m.get(x.id);if(!o||x.updated>o.updated)m.set(x.id,x);}
      return [...m.values()].filter(x=>!dead[x.id]).sort((x,y)=>x.created-y.created||(x.id<y.id?-1:1));
    };
    const decks=pick(l.state.decks,r.state.decks??[]),has=new Set(decks.map(d=>d.id));
    // 已读到哪儿：两边取靠后的那个。在一台设备上看过，另一台不会因为自己别的改动更晚就把红点带回来
    const seenAt=new Map<string,number>();for(const x of [...l.state.personas,...(r.state.personas??[])])seenAt.set(x.id,Math.max(seenAt.get(x.id)??0,x.readAt??0));
    // 一个人的资料：每一项各听各的后改（fu 记着每项什么时候改的）。在手机上换了头像，电脑上之后改了别的，两样都留着。
    // 没记在 fu 里的改动（没更新的旧版本改的）分不清改了哪项，只好算在整个人头上：那一边更晚就整份听它的，和以前一样
    const lp=new Map(l.state.personas.map(p=>[p.id,p])),rp=new Map((r.state.personas??[]).map(p=>[p.id,p]));
    const ldk=new Set(l.state.decks.map(d=>d.id)),rdk=new Set((r.state.decks??[]).map(d=>d.id));
    const AUTO=new Set(['id','created','updated','fu','readAt','nextAt','replyAt']);
    const loose=(p:Persona)=>p.updated>Math.max(0,...Object.values(p.fu??{}))?p.updated:0;
    const blend=(w:Persona):Persona=>{
      const a=lp.get(w.id),b=rp.get(w.id);if(!a||!b)return w;
      const o=w===a?b:a,lw=loose(w),lo=loose(o),out={...w} as Persona&Record<string,unknown>,fu:Record<string,number>={...w.fu};
      let decksFrom=w;
      for(const k of Object.keys(o.fu??{})){
        if(AUTO.has(k))continue;
        if(Math.max(o.fu![k],lo)>Math.max(w.fu?.[k]??0,lw)){out[k]=(o as unknown as Record<string,unknown>)[k];fu[k]=o.fu![k];if(k==='decks')decksFrom=o;}
      }
      // 字卡分组：另一边有、这一边的设备还根本不认识的分组（刚在那边新建的），并进来，不算「被去掉了」
      const other=decksFrom===w?o:w,known=decksFrom===a?ldk:rdk;
      const extra=other.decks.filter(id=>!out.decks.includes(id)&&!known.has(id));
      if(extra.length)out.decks=[...out.decks,...extra];
      // 自动的几样：他下一次开口取排得晚的；等着回的那一句，本机有就听本机的
      out.nextAt=out.pro?Math.max(a.nextAt||0,b.nextAt||0):0;out.replyAt=a.replyAt||b.replyAt||0;
      if(Object.keys(fu).length)out.fu=fu;
      return out;
    };
    const personas=pick(l.state.personas,r.state.personas??[]).map(blend).map(p=>p.decks.every(x=>has.has(x))?p:{...p,decks:p.decks.filter(x=>has.has(x))})
      .map(p=>(seenAt.get(p.id)??0)>p.readAt?{...p,readAt:seenAt.get(p.id)!}:p);
    const mine=(r.state.prefs?.at??0)>(l.state.prefs.at??0)?{myName:r.state.prefs.myName,myAvatar:r.state.prefs.myAvatar,bubble:r.state.prefs.bubble,at:r.state.prefs.at}:{};
    // 云端推送的地址：新的那边说了算；但没更新的旧版本不认识这一项，别让它把地址冲掉
    const cloud=(mine.at?r.state.prefs.cloud:l.state.prefs.cloud)||l.state.prefs.cloud||r.state.prefs?.cloud;
    // 日程和报备短语有自己的时刻：谁后改听谁。没更新的旧版本不认识这两项（它那边 dayAt 是空的），不会把它们冲掉
    const day=(r.state.prefs?.dayAt??0)>(l.state.prefs.dayAt??0)?{plan:r.state.prefs.plan,quick:r.state.prefs.quick,hl:r.state.prefs.hl,hlOrd:r.state.prefs.hlOrd,hlPic:r.state.prefs.hlPic,dayAt:r.state.prefs.dayAt}:{};
    const prefs={...l.state.prefs,...mine,...day,...(cloud?{cloud}:{})};
    if(prefs.last&&!personas.some(p=>p.id===prefs.last))prefs.last='';
    const packs=pick(l.state.packs??[],r.state.packs??[]);
    state={...l.state,personas,decks,packs,dead,prefs};
  }
  const msgs:Record<string,Msg[]>={},boxes:Record<string,Box>={},graves:Record<string,Grave>={};
  for(const p of state.personas){
    const lm=l.msgs[p.id]??[],lg=l.graves[p.id]??{dead:[],cleared:0},rc=r.m[p.id];
    if(rc){
      // 聊天：两边的消息并在一起，按时间排；删掉的、清空之前的不要
      const g:Grave={dead:[...new Set([...lg.dead,...(rc.grave?.dead??[])])].slice(-4000),cleared:Math.max(lg.cleared,rc.grave?.cleared??0)};
      const gone=new Set(g.dead),m=new Map<string,Msg>();
      for(const x of [...lm,...(rc.msgs??[])]){const o=m.get(x.id);if(!o||(x.u??0)>(o.u??0))m.set(x.id,x);}
      msgs[p.id]=[...m.values()].filter(x=>!gone.has(x.id)&&x.at>g.cleared).sort((a,b)=>a.at-b.at||(a.id<b.id?-1:1));graves[p.id]=g;
    }else{msgs[p.id]=lm;graves[p.id]=lg;}
    const lb=l.boxes[p.id],rb=r.x[p.id];
    const b=rb&&(rb.at??0)>(lb?.at??0)?rb:lb,o=b===rb?lb:rb;
    if(b&&o){
      // 小功能整份听新的那边；只有塔罗的记录、专属牌意和信箱里的信两边并起来——在手机上抽的牌、写的信，不会因为电脑上别的改动更晚就没了
      const gone=[...new Set([...(o.tarotGone??[]),...(b.tarotGone??[])])].slice(-400),dead=new Set(gone),m=new Map<string,Reading>();
      for(const x of [...(o.tarot??[]),...(b.tarot??[])])if(!dead.has(x.id))m.set(x.id,x);
      const tarot=[...m.values()].sort((x,y)=>x.at-y.at||(x.id<y.id?-1:1)).slice(-300),mine={...o.tarotMine,...b.tarotMine};
      // 信：按封合并。同一封两边都有时听后改的那边，但「读过了」「回信到了」只要一边是就算
      const mgone=[...new Set([...(o.mailGone??[]),...(b.mailGone??[])])].slice(-400),mdead=new Set(mgone),lm=new Map<string,Letter>();
      for(const x of o.letters??[])if(!mdead.has(x.id))lm.set(x.id,x);
      for(const x of b.letters??[])if(!mdead.has(x.id)){const y=lm.get(x.id),w=y&&(y.u??0)>(x.u??0)?y:x;lm.set(x.id,y?{...w,...(x.read||y.read?{read:true}:{}),...(x.got||y.got?{got:true}:{})}:x);}
      const letters=[...lm.values()].sort((x,y)=>x.at-y.at||(x.id<y.id?-1:1));
      // 每天的一句：按日子并起来（同一天听后点过喜欢的那边）
      // 同一天两台设备各定了一句：两边都记了时刻的，听先定下的那句（两边会一致）；分不清先后的，这台设备上显示的那句不换。喜欢听后点的那边
      const dm=new Map<string,Box['lines'][number]>();
      for(const x of rb!.lines??[])dm.set(x.date,x);
      for(const x of lb!.lines??[]){
        const y=dm.get(x.date);if(!y){dm.set(x.date,x);continue;}
        const text=x.at&&y.at&&y.at<x.at?y:x,lk=(y.u??0)>(x.u??0)?y:x;
        dm.set(x.date,{date:x.date,text:text.text,...(text.at?{at:text.at}:{}),...(lk.like?{like:true}:{}),...(lk.u?{u:lk.u}:{})});
      }
      const lines=[...dm.values()].sort((x,y)=>x.date<y.date?-1:1).slice(-400);
      // 报备：两边的并起来（同一刻同一句算一条）
      const cm=new Map<string,Box['checks'][number]>();
      for(const x of [...(o.checks??[]),...(b.checks??[])])cm.set(x.at+'|'+x.text,x);
      const checks=[...cm.values()].sort((x,y)=>x.at-y.at).slice(-400);
      // 自动写的几样不抢「谁晚」（见 db.ts 的 setBox quiet），所以各自有规则：看过今天这一句取晚的那天；下一封主动来信取排得晚的；响铃 / 通话只认本机
      const seen=[b.lineSeen,o.lineSeen].filter(Boolean).sort().at(-1);
      const mn=b.mailNext&&o.mailNext?(o.mailNext.at>b.mailNext.at?o.mailNext:b.mailNext):(b.at??0)===(o.at??0)?b.mailNext??o.mailNext:b.mailNext;
      // 其余的设置（信的节奏、他的照片库、他的报备组、纪念日…）：每一项各听各的后改。没记时刻的改动（旧版本改的）算在整格头上
      const MERGED=new Set(['at','fu','letters','lines','checks','tarot','tarotGone','tarotMine','mailGone','lineSeen','mailNext','ring','call']);
      const looseB=(x:Box)=>(x.at??0)>Math.max(0,...Object.values(x.fu??{}))?(x.at??0):0,lB=looseB(b),lO=looseB(o);
      const one:Record<string,unknown>={},fu:Record<string,number>={...b.fu};
      for(const k of Object.keys(o.fu??{})){
        if(MERGED.has(k))continue;
        if(Math.max(o.fu![k],lO)>Math.max(b.fu?.[k]??0,lB)){one[k]=(o as unknown as Record<string,unknown>)[k];fu[k]=o.fu![k];}
      }
      boxes[p.id]={...b,...(one as Partial<Box>),...(Object.keys(fu).length?{fu}:{}),lineSeen:seen,mailNext:mn,ring:lb?.ring,call:lb?.call,letters,lines,checks,...(mgone.length?{mailGone:mgone}:{}),...(tarot.length?{tarot}:{}),...(gone.length?{tarotGone:gone}:{}),...(Object.keys(mine).length?{tarotMine:mine}:{})};
    }else if(b)boxes[p.id]=b===rb?{...b,ring:undefined,call:undefined}:b;
  }
  return {state,msgs,boxes,graves};
}

/* ───────── 同步一次 ───────── */

type Tree={sha:string;tree:{path:string;type:string;sha:string}[]};
let again=false,dirty=false;
const have=new Set<string>();   // 本机确定有的图片
async function round(r:Remote){
  const info=await api<{default_branch:string;permissions?:{push?:boolean}}>(r,'');
  if(info.permissions&&info.permissions.push===false)throw new Fail(403,'no push');
  const br=info.default_branch||'main';
  let head:string;
  try{head=(await api<{object:{sha:string}}>(r,`/git/ref/heads/${br}`)).object.sha;}
  catch(e){
    // 全新的空仓库：先放一个说明文件，仓库才有第一条记录
    if(!(e instanceof Fail)||(e.code!==409&&e.code!==404))throw e;
    await api(r,'/contents/README.md',{method:'PUT',body:{message:'init',content:btoa('private data, written by the site. do not edit by hand.\n')}});
    head=(await api<{object:{sha:string}}>(r,`/git/ref/heads/${br}`)).object.sha;
  }
  const commit=await api<{tree:{sha:string};committer?:{date?:string}}>(r,`/git/commits/${head}`);
  const tree=await api<Tree>(r,`/git/trees/${commit.tree.sha}?recursive=1`);
  const cloud:Record<string,string>={};for(const t of tree.tree)if(t.type==='blob'&&t.path.startsWith('data/'))cloud[t.path]=t.sha;
  const read=async(path:string)=>unb64((await api<{content:string}>(r,`/git/blobs/${cloud[path]}`)).content);

  // 云端和本机内容不一样的文件，都先拿下来合并，再决定传什么。
  // 不只看「云端在上次同步之后变没变」：万一这台设备手里的是一份旧数据，直接传上去会把云端新的盖掉——
  // 先合并的话，两边各自多出来的都留得住
  const before=dump(),mine=files(before),mineSha:Record<string,string>={};
  for(const [path,text] of Object.entries(mine))mineSha[path]=await blobSha(text);
  const part:{state?:Shared;m:Record<string,Chat>;x:Record<string,Box>}={m:{},x:{}};
  for(const path of Object.keys(cloud)){
    if(path.startsWith('data/a/')||cloud[path]===mineSha[path])continue;
    const id=path.startsWith('data/m/')||path.startsWith('data/x/')?path.slice(7,-5):'';
    // 已经删掉的人：云端留着的旧文件不用再看
    if(id&&before.state.dead?.[id])continue;
    const text=await read(path);
    if(path===F.state)part.state=JSON.parse(text) as Shared;
    else if(path.startsWith('data/m/'))part.m[id]=JSON.parse(text) as Chat;
    else if(path.startsWith('data/x/'))part.x[id]=JSON.parse(text) as Box;
  }
  // 下载期间本机可能又有新消息：到这一步才取本机的数据来合并，合并完立刻放回去
  const merged=merge(dump(),part);
  const pulled=(!!part.state||Object.keys(part.m).length>0||Object.keys(part.x).length>0)&&await adopt(merged);

  // 图片：本机缺的拿下来，云端缺的传上去
  const up:{path:string;mode:string;type:string;content?:string;sha?:string}[]=[],pushed:Record<string,string>={};
  for(const id of imageIds(merged)){
    const path=F.a(id);
    if(!have.has(id)){
      if(await getKey<string>('a:'+id))have.add(id);
      else if(cloud[path]){if(await setKey('a:'+id,await read(path))){dropImageCache(id);have.add(id);}}
    }
    if(have.has(id)&&!cloud[path]){
      const data=await getKey<string>('a:'+id);if(!data)continue;
      const b=await api<{sha:string}>(r,'/git/blobs',{method:'POST',body:{content:data,encoding:'utf-8'}});
      up.push({path,mode:'100644',type:'blob',sha:b.sha});pushed[path]=b.sha;
    }
  }
  const out=files(merged);
  for(const [path,text] of Object.entries(out)){
    const sha=await blobSha(text);
    if(cloud[path]!==sha){up.push({path,mode:'100644',type:'blob',content:text});pushed[path]=sha;}
  }
  let cloudAt=Date.parse(commit.committer?.date??'')||0;
  if(up.length){
    const nt=await api<{sha:string}>(r,'/git/trees',{method:'POST',body:{base_tree:commit.tree.sha,tree:up}});
    const nc=await api<{sha:string}>(r,'/git/commits',{method:'POST',body:{message:`sync ${new Date().toISOString().slice(0,16).replace('T',' ')} (${up.length})`,tree:nt.sha,parents:[head]}});
    await api(r,`/git/refs/heads/${br}`,{method:'PATCH',body:{sha:nc.sha}});
    cloudAt=Date.now();
  }
  synced={tree:{...cloud,...pushed},at:Date.now(),cloudAt};
  await setKey('synced',synced);
  return {pulled,sent:up.length};
}
const clash=(e:unknown)=>e instanceof Fail&&(e.code===422||e.code===409);
const nap=(ms:number)=>new Promise(r=>setTimeout(r,ms));
type Locks={request:<T>(n:string,o:{ifAvailable:boolean},f:(l:unknown)=>Promise<T>)=>Promise<T>};
export async function syncNow(manual=false):Promise<boolean>{
  if(!remote||storageDown())return false;
  if(st.busy){again=true;return false;}
  put({busy:true,err:''});dirty=false;
  const r=remote;
  const work=async()=>{
    // 另一台设备（或另一个标签页）刚好抢先传了：等一小会儿重来，最多三次
    for(let i=0;;i++){
      try{return await round(r);}
      catch(e){if(!clash(e)||i>=2)throw e;await nap(700+Math.random()*1800);}
    }
  };
  try{
    // 同一台设备开着几个页面时，只让其中一个去同步，别自己和自己撞
    const locks=(navigator as Navigator&{locks?:Locks}).locks;
    const res=locks?await locks.request('cx-sync',{ifAvailable:true},async l=>l?work():null):await work();
    if(!res){put({busy:false});plan(6000);return false;}
    put({busy:false,at:synced.at,cloudAt:synced.cloudAt,note:res.sent&&res.pulled?'两边的改动合到一起了':res.sent?'本机的改动传上去了':res.pulled?'把别的设备的改动拿下来了':manual?'已经是最新的':st.note});
    if(again||dirty){again=false;plan(4000);}
    return true;
  }catch(e){
    again=false;
    if(clash(e)){put({busy:false,note:'别的设备正在同步，稍后自动再试'});plan(8000+Math.random()*6000);return false;}
    put({busy:false,err:explain(e)});return false;
  }
}

/* ───────── 连接、自动 ───────── */

let timer=0;
const plan=(ms:number)=>{clearTimeout(timer);timer=window.setTimeout(()=>{void syncNow();},ms);};
const cleanRepo=(x:string)=>x.trim().replace(/^https?:\/\/github\.com\//i,'').replace(/\.git$/,'').replace(/^\/+|\/+$/g,'');
export const defaultRepo='deer-data';
// 只填令牌也行：先问 GitHub 这个令牌是谁的，再找（或新建）那个人名下的私有仓库 deer-data
export async function connect(token:string,repo=''):Promise<string>{
  token=token.trim();if(!token)return '还没有填令牌';
  const probe:Remote={repo:'',token,auto:true};
  let name=cleanRepo(repo);
  try{
    if(!name||!name.includes('/')){
      const res=await fetch(BASE+'/user',{cache:'no-store',headers:{Accept:'application/vnd.github+json',Authorization:'Bearer '+token}});
      if(!res.ok)throw new Fail(res.status,'');
      name=((await res.json()) as {login:string}).login+'/'+(name||defaultRepo);
    }
    if(!/^[\w.-]+\/[\w.-]+$/.test(name))return '仓库要写成 用户名/仓库名 这样';
    probe.repo=name;
    let info:{private?:boolean;permissions?:{push?:boolean}};
    try{info=await api(probe,'');}
    catch(e){
      if(!(e instanceof Fail)||e.code!==404)throw e;
      // 还没有这个仓库：替你建一个私有的。令牌不许建仓库的话，就请你自己建
      const mk=await fetch(BASE+'/user/repos',{method:'POST',cache:'no-store',headers:{Accept:'application/vnd.github+json',Authorization:'Bearer '+token,'Content-Type':'application/json'},
        body:JSON.stringify({name:name.split('/')[1],private:true,auto_init:true,description:'private data'})});
      if(!mk.ok)return `没找到私有仓库 ${name}，这个令牌也不能替你新建。请先在 GitHub 上建一个叫 ${name.split('/')[1]} 的私有仓库，并让令牌可以访问它`;
      info={private:true};
    }
    if(info.private===false)return '这个仓库是公开的，聊天记录会被所有人看到。请换一个私有仓库';
    if(info.permissions&&info.permissions.push===false)return '令牌没有写入这个仓库的权限（需要 Contents：Read and write）';
  }catch(e){return explain(e);}
  remote=probe;synced={tree:{},at:0,cloudAt:0};have.clear();
  await setKey('remote',remote);await delKey('synced');
  put({on:true,repo:remote.repo,auto:true,at:0,cloudAt:0,err:'',note:''});
  await syncNow(true);
  return st.err;
}
export async function disconnect(){remote=null;synced={tree:{},at:0,cloudAt:0};clearTimeout(timer);await delKey('remote');await delKey('synced');put({on:false,repo:'',at:0,cloudAt:0,err:'',note:'',busy:false});}
export async function setAuto(auto:boolean){if(!remote)return;remote={...remote,auto};await setKey('remote',remote);put({auto});if(auto)plan(500);}
export async function startSync(){
  if(storageDown())return;
  // 连接信息这一下没读出来的话，等一会儿再读，不当成「没连过」
  try{remote=(await readKey<Remote>('remote'))??null;}catch{setTimeout(()=>{void startSync();},3000);return;}
  synced=(await getKey<Synced>('synced'))??{tree:{},at:0,cloudAt:0};
  if(remote)put({on:true,repo:remote.repo,auto:remote.auto!==false,at:synced.at,cloudAt:synced.cloudAt});
  // 本机一有改动，过十几秒传一次；回到页面、每隔几分钟，也看看云端有没有新的
  onChange(()=>{put({localAt:Date.now()});dirty=true;if(remote&&remote.auto!==false)plan(12000);});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&remote&&remote.auto!==false&&Date.now()-st.at>30000)plan(800);});
  setInterval(()=>{if(!document.hidden&&remote&&remote.auto!==false&&!st.busy)void syncNow();},180000);
  if(remote&&remote.auto!==false)plan(1500);
}
