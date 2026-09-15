import {useEffect, useState} from 'react';
import {BackBar} from '../../app/TopBar';
import {useSnapshot} from '../../shared/store';
import {saveSettings} from '../../storage/ops';

const ZONES=['Asia/Nicosia','Europe/Athens','Europe/Moscow','Europe/Berlin','Europe/London','UTC'];
export function SettingsScreen(){
 const {data}=useSnapshot();
 const [daily,setDaily]=useState('10');
 const [size,setSize]=useState('20');
 const [zone,setZone]=useState('Asia/Nicosia');
 const [problem,setProblem]=useState('');
 const [saved,setSaved]=useState(false);
 useEffect(()=>{
  setDaily(String(data.settings.newWordsPerDay));
  setSize(String(data.settings.sessionSize));
  setZone(data.settings.timezone);
 },[data.settings]);
 const submit=async(event:React.FormEvent)=>{
  event.preventDefault();
  const perDay=Number(daily), sessionSize=Number(size);
  if(!Number.isInteger(perDay)||perDay<0||perDay>100)return setProblem('Дневной лимит — целое число от 0 до 100.');
  if(!Number.isInteger(sessionSize)||sessionSize<2||sessionSize>100)return setProblem('Размер занятия — целое число от 2 до 100.');
  setProblem('');
  await saveSettings({...data.settings,newWordsPerDay:perDay,sessionSize,timezone:zone});
  setSaved(true);
 };
 return (
  <>
   <BackBar title="Настройки"/>
   <main className="screen">
    <form onSubmit={submit}>
     <label htmlFor="daily">Новых слов в день</label>
     <input id="daily" type="number" min={0} max={100} value={daily} onChange={event=>{setDaily(event.target.value);setSaved(false)}}/>
     <label htmlFor="size">Упражнений в занятии</label>
     <input id="size" type="number" min={2} max={100} value={size} onChange={event=>{setSize(event.target.value);setSaved(false)}}/>
     <label htmlFor="zone">Часовой пояс</label>
     <select id="zone" value={zone} onChange={event=>{setZone(event.target.value);setSaved(false)}}>
      {ZONES.map(item=><option key={item} value={item}>{item}</option>)}
     </select>
     {problem&&<p className="error" role="alert">{problem}</p>}
     <button className="btn" type="submit" style={{marginTop:16}}>Сохранить</button>
     {saved&&<p className="small" role="status" style={{color:'var(--ok)'}}>Сохранено. Новые значения применятся к следующим занятиям, история ответов не изменилась.</p>}
    </form>
   </main>
  </>
 );
}
