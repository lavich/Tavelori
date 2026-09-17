import {Component, type ErrorInfo, type ReactNode} from 'react';
import {reportError} from '../reporting/reporting';
import {isStorageError, reopenDatabase} from '../storage/recovery';
import {CrashScreen} from './CrashScreen';
import ui from '../shared/ui.module.css';

const MAX_ATTEMPTS=3, WINDOW_MS=60000;
interface State {error:unknown;recovering:boolean;generation:number;reportId:string|null}

/**
 * Граница ошибок над приложением: без неё React снимает корень целиком, а перезагрузить Mini App нельзя.
 * Ошибка хранилища лечится переоткрытием базы и перемонтированием дерева по поколению; маршрут остаётся в адресе.
 * Любое падение уходит отчётом категории «ui»; остальное показывает экран сбоя с перезапуском и диагностикой.
 * Граница ничего не пишет в базу: активное занятие уже лежит в IndexedDB, после перезапуска «Сегодня» предложит продолжить.
 */
export class Recovery extends Component<{children:ReactNode},State>{
 state:State={error:null,recovering:false,generation:0,reportId:null};
 private attempts:number[]=[];
 static getDerivedStateFromError(error:unknown):Partial<State>{return {error}}
 componentDidCatch(error:unknown,info:ErrorInfo){
  console.warn('Экран упал, приложение восстанавливается',error,info.componentStack);
  this.setState({reportId:reportError(error,{category:'ui'})});
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
  if(error)return <CrashScreen testId="recovery-failed" title="Не удалось показать экран" description="Данные на устройстве сохранены. Перезапуск обычно помогает." error={error} reportId={this.state.reportId}/>;
  return <div key={generation} className="contents">{this.props.children}</div>;
 }
}
