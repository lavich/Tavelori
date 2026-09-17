import {describe, expect, it} from 'vitest';
import {groupByCourse} from '../src/features/lessons/courses';
import type {CatalogEntry} from '../src/content/schema';
import type {Course} from '../src/domain/types';
import type {LessonView} from '../src/storage/queries';

const iso='2026-09-16T09:00:00.000Z';
const course=(id:string,over:Partial<Course>={}):Course=>({id,title:id,origin:'content',subscribed:false,schedule:{startDate:null,weekdays:[]},newWordsPerDay:10,createdAt:iso,updatedAt:iso,...over});
const lesson=(id:string,courseId:string|undefined,wordCount=10):LessonView=>({id,courseId,title:id,targetDate:null,status:'upcoming',createdAt:iso,updatedAt:iso,wordCount});
const entry=(id:string,courseId:string):CatalogEntry=>({id,courseId,language:'el',title:id,wordCount:5,version:'v1',url:`content/packages/${id}@v1.json`,bytes:100,status:'upcoming',targetDate:null,media:{count:0,bytes:0}});

describe('группировка уроков по курсам',()=>{
 it('подписанные курсы идут первыми, локальный последним, неизвестный между ними',()=>{
  const groups=groupByCourse(
   [course('leeke',{subscribed:true,createdAt:'2026-09-01T00:00:00.000Z'}),course('other',{createdAt:'2026-09-02T00:00:00.000Z'}),course('my',{origin:'local',subscribed:true})],
   [lesson('l1','leeke'),lesson('own','my'),lesson('ghost',undefined)],
   [entry('l2','leeke'),entry('o1','other')],
  );
  expect(groups.map(group=>group.id)).toEqual(['leeke','other','unknown','my']);
 });
 it('в группе курса лежат его установленные уроки и доступные записи каталога',()=>{
  const [leeke]=groupByCourse([course('leeke',{subscribed:true,source:'Школа'})],[lesson('l1','leeke',12)],[entry('l2','leeke'),entry('x','чужой')]);
  expect(leeke.source).toBe('Школа');
  expect(leeke.lessons.map(item=>item.id)).toEqual(['l1']);
  expect(leeke.available.map(item=>item.id)).toEqual(['l2']);
 });
 it('пустой курс без уроков и без каталога не показывается',()=>{
  expect(groupByCourse([course('leeke'),course('my',{origin:'local'})],[],[]).map(group=>group.id)).toEqual([]);
 });
 it('урок исчезнувшего из каталога курса остаётся в своей группе',()=>{
  const groups=groupByCourse([course('gone',{subscribed:true,title:'Старый курс'})],[lesson('l1','gone')],[]);
  expect(groups.map(group=>[group.id,group.title,group.available.length])).toEqual([['gone','Старый курс',0]]);
 });
});
