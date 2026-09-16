import {addDays} from './learning';
import type {Lesson, Schedule} from './types';

const numberOf=(title:string)=>title.match(/\d+(?:\.\d+)*/)?.[0].split('.').map(Number);
/** «1.9» < «1.10» < «2.1»; уроки без номера идут после, по дате создания, затем по id. */
export function lessonOrder(a:Lesson,b:Lesson):number{
 const na=numberOf(a.title), nb=numberOf(b.title);
 if(na&&nb){
  for(let i=0;i<Math.min(na.length,nb.length);i++) if(na[i]!==nb[i])return na[i]-nb[i];
  if(na.length!==nb.length)return na.length-nb.length;
 }else if(na||nb)return na?-1:1;
 return a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id);
}

export const isoWeekday=(day:string)=>new Date(`${day}T00:00:00Z`).getUTCDay()||7;
export const scheduleSet=(schedule:Schedule)=>!!schedule.startDate&&schedule.weekdays.length>0;
/** Ближайший день расписания начиная с `day` — включительно или строго после него. */
export function nextLessonDay(day:string,weekdays:number[],inclusive:boolean):string{
 let cursor=inclusive?day:addDays(day,1);
 for(let step=0;step<7&&!weekdays.includes(isoWeekday(cursor));step++)cursor=addDays(cursor,1);
 return cursor;
}

/** Копии уроков с датами по расписанию в исходном порядке массива; исходные объекты не меняются. */
export function scheduleLessons(lessons:Lesson[],schedule:Schedule):Lesson[]{
 const {weekdays}=schedule;
 let cursor=scheduleSet(schedule)?nextLessonDay(schedule.startDate!,weekdays,true):null;
 const dated=new Map<string,Lesson>();
 for(const lesson of [...lessons].sort(lessonOrder)){
  if(lesson.targetDate){
   dated.set(lesson.id,{...lesson,dateSource:'manual'});
   if(cursor){const after=nextLessonDay(lesson.targetDate,weekdays,false);if(after>cursor)cursor=after}
  }else if(!cursor||lesson.status==='completed'){
   dated.set(lesson.id,{...lesson});
  }else{
   dated.set(lesson.id,{...lesson,targetDate:cursor,dateSource:'schedule'});
   cursor=nextLessonDay(cursor,weekdays,false);
  }
 }
 return lessons.map(lesson=>dated.get(lesson.id)!);
}
