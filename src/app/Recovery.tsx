import {Component, type ErrorInfo, type ReactNode} from 'react';
import {Button} from '@/components/ui/button';
import {isStorageError, reopenDatabase} from '../storage/recovery';
import ui from '../shared/ui.module.css';

/** Больше трёх сбоев хранилища за минуту — восстановление бессмысленно, нужен перезапуск. */
const MAX_ATTEMPTS=3, WINDOW_MS=60000;
interface State {error:unknown;recovering:boolean;generation:number}

/**
 * Граница ошибок над всем приложением: без неё React 19 снимает корень целиком, и остаётся пустая страница,
 * которую в Mini App нельзя перезагрузить иначе как полным закрытием.
 * Ошибка хранилища (WebKit после сна WebView отдаёт `UnknownError` на чтение IndexedDB) лечится переоткрытием базы
 * и перемонтированием дерева по новому поколению: живые запросы подписываются заново, маршрут остаётся в адресе.
 */
export class Recovery extends Component<{children:ReactNode},State>{
 state:State={error:null,recovering:false,generation:0};
 private attempts:number[]=[];
 static getDerivedStateFromError(error:unknown):Partial<State>{return {error}}
 componentDidCatch(error:unknown,info:ErrorInfo){
  console.warn('Экран упал, приложение восстанавливается',error,info.componentStack);
  const now=Date.now();
  this.attempts=this.attempts.filter(at=>now-at<WINDOW_MS);
  if(!isStorageError(error)||this.attempts.length>=MAX_ATTEMPTS)return;
  this.attempts.push(now);
  this.setState({recovering:true});
  reopenDatabase().then(
   ()=>this.setState(state=>({error:null,recovering:false,generation:state.generation+1})),
   failure=>{console.warn('Не удалось переоткрыть локальную базу',failure);this.setState({recovering:false})},
  );
 }
 render(){
  const {error,recovering,generation}=this.state;
  if(error&&recovering)return <div className={ui.app}><main className={`${ui.screen} ${ui.roomy}`} data-testid="recovering"><p className={ui.muted} role="status">Восстанавливаем доступ к данным…</p></main></div>;
  if(error)return (
   <div className={ui.app}>
    <main className={`${ui.screen} ${ui.roomy}`} data-testid="recovery-failed">
     <h1 className="text-2xl font-semibold mb-2">Не удалось показать экран</h1>
     <p className={ui.muted}>Данные на устройстве сохранены. Перезапуск обычно помогает.</p>
     <Button size="xl" className="mt-4" onClick={()=>location.reload()}>Перезапустить</Button>
    </main>
   </div>
  );
  return <div key={generation} className="contents">{this.props.children}</div>;
 }
}
