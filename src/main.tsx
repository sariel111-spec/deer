import {createRoot} from 'react-dom/client';
import './styles.css';
import {App} from './App';
import {boot,importDecks} from './db';
import {startSync} from './sync';
import {say} from './pages';
import {start} from './alive';
import {tick} from './engine';
import './update';

// 从别处带着字卡过来：网址 # 后面跟着一包分组（只在本机解开，不会发到任何服务器），收下后立刻把网址擦干净
function carried(){
  const m=location.hash.match(/^#cards=(.+)$/);if(!m)return;
  history.replaceState(null,'',location.pathname+'#/cards');
  try{
    const bin=atob(m[1].replace(/-/g,'+').replace(/_/g,'/'));
    const groups=JSON.parse(new TextDecoder().decode(Uint8Array.from(bin,c=>c.charCodeAt(0)))) as {name:string;cards:string[];only?:string[]}[];
    const r=importDecks(groups);
    setTimeout(()=>say(`搬进来 ${r.decks} 个分组，新加了 ${r.added} 张`),600);
  }catch{setTimeout(()=>say('带过来的字卡读不了'),600);}
}

void boot().then(()=>{
  carried();
  createRoot(document.getElementById('root')!).render(<App/>);
  void start(tick);
  void startSync();
});
