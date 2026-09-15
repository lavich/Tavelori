import {useEffect, useState} from 'react';
import {Button} from '@/components/ui/button';
import {Field, FieldDescription, FieldGroup, FieldLabel} from '@/components/ui/field';
import {Input} from '@/components/ui/input';
import {Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select';
import {BackBar} from '../../app/TopBar';
import {useSnapshot} from '../../shared/store';
import {saveSettings} from '../../storage/ops';
import ui from '../../shared/ui.module.css';

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
   <main className={ui.screen}>
    <form onSubmit={submit}>
     <FieldGroup>
      <Field data-invalid={problem.includes('лимит')||undefined}>
       <FieldLabel htmlFor="daily">Новых слов в день</FieldLabel>
       <Input id="daily" type="number" min={0} max={100} value={daily}
        aria-invalid={problem.includes('лимит')||undefined}
        onChange={event=>{setDaily(event.target.value);setSaved(false)}}/>
       <FieldDescription>Сколько новых слов Lexi может ввести за сутки.</FieldDescription>
      </Field>
      <Field data-invalid={problem.includes('Размер')||undefined}>
       <FieldLabel htmlFor="size">Упражнений в занятии</FieldLabel>
       <Input id="size" type="number" min={2} max={100} value={size}
        aria-invalid={problem.includes('Размер')||undefined}
        onChange={event=>{setSize(event.target.value);setSaved(false)}}/>
      </Field>
      <Field>
       <FieldLabel htmlFor="zone">Часовой пояс</FieldLabel>
       <Select value={zone} onValueChange={value=>{if(value)setZone(value);setSaved(false)}}>
        <SelectTrigger id="zone" className="w-full"><SelectValue/></SelectTrigger>
        <SelectContent>
         <SelectGroup>
          {ZONES.map(item=><SelectItem key={item} value={item}>{item}</SelectItem>)}
         </SelectGroup>
        </SelectContent>
       </Select>
       <FieldDescription>По этой зоне считаются дни, сроки и дневной лимит.</FieldDescription>
      </Field>
     </FieldGroup>
     {problem&&<p className={ui.error} role="alert">{problem}</p>}
     <Button size="xl" type="submit" className="mt-4">Сохранить</Button>
     {saved&&<p className="mt-2 text-sm text-(--ok)" role="status">Сохранено. Новые значения применятся к следующим занятиям, история ответов не изменилась.</p>}
    </form>
   </main>
  </>
 );
}
