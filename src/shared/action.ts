import {useState} from 'react';

/** Текст жалобы для пользователя по упавшему исключению. */
export type Describe=(error:unknown)=>string;

/**
 * Асинхронное действие экрана с одинаковой дисциплиной во всех местах: пока идёт — `busy` (кнопка заблокирована),
 * при запуске прошлая жалоба снимается, упавшее попадает в `problem`, и `busy` снимается в любом исходе.
 * Забыть снять `busy` или показать жалобу от прошлой попытки здесь уже нельзя.
 *
 * `describe` задаёт формулировку: по умолчанию это сообщение исключения, а для не-`Error` — `fallback`.
 * `setProblem` открыт для мест, где жалоба появляется без исключения — например, когда очередь на сегодня пуста.
 */
export function useAction(fallback:string){
 const [busy,setBusy]=useState(false);
 const [problem,setProblem]=useState('');
 const run=async(action:()=>Promise<unknown>,describe:Describe=error=>error instanceof Error?error.message:fallback)=>{
  setBusy(true);setProblem('');
  try{await action()}
  catch(error){setProblem(describe(error))}
  finally{setBusy(false)}
 };
 return {busy,problem,setProblem,run};
}
