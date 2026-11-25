import {createRoot} from 'react-dom/client';
import './styles.css';
import {App} from './App';
import {boot} from './db';
import {start} from './alive';
import {tick} from './engine';
import './update';

void boot().then(()=>{
  createRoot(document.getElementById('root')!).render(<App/>);
  void start(tick);
});
