// 「请 AI 读一读」的那一块，哪里都能用（现在是信箱在用）：
// 接了接口就在这里直接解；没接就把内容复制好带去聊天 App，再把回答贴回来存下
import {useEffect,useRef,useState} from 'react';
import {aiHand,dsChat,dsKey,onPhone,type Msg} from './ai';
import {say} from './pages';

export function AiBlock({name,noBio,build,saved,save,label,again='重新解读',setup,auto,children}:{
  name:string;noBio:boolean;build:()=>Msg[];saved:string;save:(t:string)=>void;label:string;again?:string;setup:string;auto?:boolean;children?:React.ReactNode}){
  const [ai,setAi]=useState(saved),[busy,setBusy]=useState(false),[err,setErr]=useState('');
  const [hand,setHand]=useState(false),[back,setBack]=useState(''),[carried,setCarried]=useState('');
  const ctl=useRef<AbortController|null>(null);
  useEffect(()=>()=>ctl.current?.abort(),[]);
  const H=aiHand();
  const carryText=()=>{if(carried)return carried;const m=build(),t=m[0].content+'\n\n——\n'+m[1].content;setCarried(t);return t;};
  const carry=async()=>{
    const t=carryText();setHand(true);
    try{await navigator.clipboard.writeText(t);say(`复制好了，去 ${H.name} 贴上发送`);}catch{say('这里不让自动复制：点开「看要带过去的内容」，长按全选复制');}
  };
  const read=async()=>{
    if(!dsKey()){void carry();return;}
    ctl.current?.abort();const c=ctl.current=new AbortController();
    setBusy(true);setErr('');setAi('');
    try{const t=await dsChat(build(),setAi,c.signal);setAi(t);save(t);}
    catch(e){if((e as Error)?.name!=='AbortError'){setErr((e as Error)?.message||'这次没解出来，再试一次');setAi(saved);}}
    finally{if(ctl.current===c)setBusy(false);}
  };
  useEffect(()=>{if(auto&&!saved&&dsKey())void read();},[]);   // 刚拆开、又接了接口：直接开始读
  const pasteBack=async()=>{
    try{const t=(await navigator.clipboard.readText()).trim();if(!t)say('剪贴板是空的');else if(t===carried.trim())say(`剪贴板里还是带过去的内容，先去复制 ${H.name} 的回答`);else setBack(t);}
    catch{say('这里不让读剪贴板：长按上面的框，自己贴上');}
  };
  const keep=()=>{const t=back.trim();if(!t)return;setAi(t);setErr('');save(t);setBack('');setHand(false);say('存下来了');};
  const jumped=()=>{setTimeout(()=>{if(document.visibilityState==='visible'&&document.hasFocus())say(`没跳到 ${H.name} App？点旁边的「网页版」`);},2200);};
  return <>
    {(ai||busy||err)&&<section className="tr-ai" aria-live="polite" aria-busy={busy}>
      <h4>解读<small>当作参考，以你自己的感觉为准</small></h4>
      {ai?<p>{ai}</p>:busy&&<p className="tr-wait">正在读…</p>}
      {err&&<p className="tr-err" role="alert">{err}</p>}
    </section>}
    {hand&&<section className="tr-hand">
      <h4>带去 {H.name} 解<small>不用密钥，不花钱</small></h4>
      <ol><li>信的内容、{name} 的人设和解读的指令已经复制好了。</li><li>打开 {H.name}，新开一个对话，贴上发送。</li><li>把它的回答复制回来，贴在下面存下。</li></ol>
      <div className="rowbtn">
        {onPhone()&&!H.app.startsWith('http')?<><a className="chip on" href={H.app} onClick={jumped}>打开 {H.name} App</a><a className="chip" href={H.url} target="_blank" rel="noopener noreferrer">网页版</a></>
          :<a className="chip on" href={onPhone()?H.app:H.url} target="_blank" rel="noopener noreferrer">打开 {H.name}{onPhone()?' App':''}</a>}
        <button className="chip" onClick={()=>void carry()}>再复制一次</button></div>
      {noBio&&<a className="linkish tr-auto" href={setup}>还没写 {name} 的资料，AI 学不了他的口吻。去塔罗的牌库里写几句</a>}
      <textarea className="bulk" rows={4} value={back} onChange={e=>setBack(e.target.value)} placeholder={`把 ${H.name} 的回答贴在这里`} aria-label="贴回来的解读"/>
      <div className="rowbtn"><button className="chip" onClick={()=>void pasteBack()}>从剪贴板贴上</button><button className="chip on" disabled={!back.trim()} onClick={keep}>存下来</button><button className="chip" onClick={()=>setHand(false)}>先不了</button></div>
      <details className="tr-more"><summary>看要带过去的内容</summary><textarea className="bulk" rows={6} readOnly value={carried} aria-label="带过去的内容"/></details>
      <a className="linkish tr-auto" href={setup}>想自动解、不用切 App？去塔罗的牌库里接一个免费的接口</a>
    </section>}
    <div className="rowbtn ml-acts">
      <button className="chip" onClick={()=>void read()} disabled={busy}>{busy?'正在读…':dsKey()?(ai?again:label):`带去 ${H.name} 解`}</button>
      {dsKey()&&err&&!hand&&<button className="chip" onClick={()=>void carry()}>带去 {H.name} 解</button>}
      {children}
    </div>
  </>;
}
