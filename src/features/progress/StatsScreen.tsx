import {ChartNoAxesColumn} from 'lucide-react';
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card';
import {Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle} from '@/components/ui/empty';
import {Progress} from '@/components/ui/progress';
import {BackBar} from '../../app/TopBar';
import {SKILL_NAMES} from '../../domain/stats';
import {useNow} from '../../shared/clock';
import {CARDS, CLOZES, dayMonth, PHRASES, withCount, WORDS} from '../../shared/format';
import {useStats} from '../../shared/store';
import ui from '../../shared/ui.module.css';

export function StatsScreen(){
 const now=useNow();
 const stats=useStats(now);
 if(!stats)return <><BackBar title="Статистика"/><main className={ui.screen}/></>;
 const peak=Math.max(1,...stats.days.map(day=>day.answers));
 return (
  <>
   <BackBar title="Статистика"/>
   <main className={ui.screen}>
    {stats.totals.answers===0?(
     <Empty>
      <EmptyHeader>
       <EmptyMedia variant="icon"><ChartNoAxesColumn/></EmptyMedia>
       <EmptyTitle>Ответов пока нет</EmptyTitle>
       <EmptyDescription>Статистика появится после первого занятия.</EmptyDescription>
      </EmptyHeader>
     </Empty>
    ):null}

    <h2 className="mt-0">Последние 7 дней</h2>
    <Card className="mb-3">
     <CardContent className="flex flex-col gap-2.5">
      {stats.days.map(day=>(
       <div key={day.date} className="flex flex-col gap-1">
        <div className="flex items-center justify-between text-sm">
         <span>{dayMonth(day.date)}</span>
         <span className="text-muted-foreground">{day.answers} отв. · {day.cards} карт.</span>
        </div>
        <Progress value={(day.answers/peak)*100} className="h-2.5"/>
       </div>
      ))}
     </CardContent>
    </Card>

    <h2>Сроки повторений</h2>
    <div className={ui.tiles}>
     <Card size="sm"><CardContent>
      <div className="text-[30px] leading-tight font-bold text-primary">{stats.due.today}</div>
      <div className="text-sm text-muted-foreground">готовы сегодня</div>
     </CardContent></Card>
     <Card size="sm"><CardContent>
      <div className="text-[30px] leading-tight font-bold text-primary">{stats.due.week}</div>
      <div className="text-sm text-muted-foreground">в ближайшую неделю</div>
     </CardContent></Card>
    </div>

    <h2>Состояние карточек</h2>
    <Card className="mb-3"><CardContent className="flex flex-col gap-1.5">
     {([['Не начаты',stats.groups.fresh],['В изучении',stats.groups.learning],
        ['На повторении',stats.groups.review],['Закреплены (интервал от 21 дня)',stats.groups.solid]] as const).map(([label,value])=>(
      <p key={label} className="m-0 flex items-center justify-between"><span>{label}</span><b>{value}</b></p>
     ))}
    </CardContent></Card>

    <h2>Навыки</h2>
    <Card className="mb-3">
     <CardHeader><CardTitle className="sr-only">Доля успешных ответов по навыкам</CardTitle></CardHeader>
     <CardContent className="flex flex-col gap-2.5">
      {stats.skills.map(skill=>(
       <div key={skill.type} className="flex flex-col gap-1">
        <div className="flex items-center justify-between text-sm">
         <span>{SKILL_NAMES[skill.type]}</span>
         <span className="text-muted-foreground">{skill.rate===null?'Ещё не проверяли':`${Math.round(skill.rate*100)}% из ${withCount(skill.attempts,['попытки','попыток','попыток'])}`}</span>
        </div>
        <Progress value={(skill.rate??0)*100} className="h-2.5"/>
       </div>
      ))}
      <p className="m-0 text-sm text-muted-foreground">Это доля успешных последних ответов по типу проверки, а не оценка вероятности запоминания или освоения грамматической темы.</p>
     </CardContent>
    </Card>

    <p className={`${ui.small} ${ui.muted}`}>
     Всего записано {withCount(stats.totals.answers,['ответ','ответа','ответов'])} по {withCount(stats.totals.cards,CARDS)}{stats.totals.byKind.phrase||stats.totals.byKind.cloze?` (${withCount(stats.totals.byKind.word,WORDS)} · ${withCount(stats.totals.byKind.phrase,PHRASES)} · ${withCount(stats.totals.byKind.cloze,CLOZES)})`:''}.
    </p>
   </main>
  </>
 );
}
