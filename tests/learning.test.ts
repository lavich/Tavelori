import {expect,it} from 'vitest';
import {createEmptyCard, Rating} from 'ts-fsrs';
import {localDay,daysBetween,makePlan,nextState,chooseType,makeSession} from '../src/domain/learning';
import {defaultSettings,type Word,type Lesson,type Snapshot} from '../src/domain/types';
const now=new Date('2026-09-15T09:00:00Z');
const words:Word[]=Array.from({length:30},(_,i)=>({id:`w${i}`,greek:`λέξη${i}`,russian:`слово${i}`,ipa:'',segments:[],examples:[],sourceMastered:false,verified:false,createdAt:now.toISOString(),updatedAt:now.toISOString()}));
const lesson:Lesson={id:'l',title:'1.2',targetDate:'2026-09-18',status:'upcoming',wordIds:words.map(w=>w.id),createdAt:now.toISOString(),updatedAt:now.toISOString()};
const data:Snapshot={words,lessons:[lesson],events:[],states:[],sessions:[],settings:defaultSettings};
it('allocates ten new words for thirty due on Friday',()=>{const plan=makePlan(data,now);expect(plan.requiredPerDay).toBe(10);expect(plan.newWords).toHaveLength(10)});
it('counts introduced words across sessions and avoids exceeding daily budget',()=>{const states=words.slice(0,10).map(w=>({wordId:w.id,card:createEmptyCard(new Date('2026-09-16')),introducedAt:now.toISOString(),version:1}));expect(makePlan({...data,states},now).newWords).toHaveLength(0)});
it('shares words across dates without double counting',()=>{const plan=makePlan({...data,lessons:[lesson,{...lesson,id:'l2',targetDate:'2026-09-19'}]},now);expect(plan.requiredPerDay).toBe(10)});
it('handles multiple deadlines by cumulative demand',()=>{const plan=makePlan({...data,lessons:[{...lesson,wordIds:words.slice(0,10).map(w=>w.id),targetDate:'2026-09-17'},{...lesson,id:'l2',wordIds:words.slice(10).map(w=>w.id),targetDate:'2026-09-18'}]},now);expect(plan.requiredPerDay).toBe(10)});
it('honors local calendar through DST and UTC midnight',()=>{expect(localDay(new Date('2026-09-15T22:30Z'),'Asia/Nicosia')).toBe('2026-09-16');expect(daysBetween('2026-10-24','2026-10-26')).toBe(2)});
it('schedules a new word without losing FSRS fields',()=>{const state=nextState(undefined,'w0',Rating.Good,now);expect(state.card.due.getTime()).toBeGreaterThan(now.getTime());expect(state.card.reps).toBe(1);expect(state.version).toBe(1)});
it('chooses recognition for an untested word',()=>expect(chooseType('w0',[],{})).toBe('recognition'));

it('never creates recall, including tiny dictionaries and duplicate translations',()=>{
 for(const pool of [words.slice(0,1),words.slice(0,2),words.slice(0,5).map(w=>({...w,russian:'одно значение'}))]){
  const session=makeSession({data:{...data,words:pool},now});
  expect(session.items.every(item=>item.type==='assembly')).toBe(true);
 }
 const single={...words[0],greek:'ναι'};
 const session=makeSession({data:{...data,words:[single]},now});
 expect(session.items[0].type).toBe('spelling');
});
it('puts the only new word after available reviews',()=>{
 const state=nextState(undefined,words[1].id,3,new Date('2026-09-01'));
 const session=makeSession({data:{...data,words:words.slice(0,2),states:[state]},now,wordIds:[words[0].id,words[1].id]});
 expect(session.items.map(item=>item.wordId)).toEqual([words[1].id,words[0].id]);
});
