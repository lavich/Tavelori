import {execFileSync} from 'node:child_process';
import {existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync} from 'node:fs';
import {basename, extname, join} from 'node:path';
import {foreignColors, PALETTE, readThemes, type ThemePalette} from './art.ts';
import {applyPalette} from '../src/shared/store.ts';

export interface ArtCard {file:string;svg:string;title?:string;kind?:'part'|'before'}

const escape=(value:string)=>value.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;');
/** Общая сборка карточек: тот же список можно показать в исходной палитре или в цветах темы. */
export function artCards(cards:ArtCard[],palette:ThemePalette={}):string{
 return cards.map(card=>{
  const svg=applyPalette(card.svg,palette), foreign=foreignColors(card.svg);
  const classes=[card.kind,foreign.length?'legacy':''].filter(Boolean).join(' ');
  const label=basename(card.file,extname(card.file)).replaceAll('-',' ');
  return `<figure${classes?` class="${classes}"`:''}${card.title?` title="${escape(card.title)}"`:''}><div class="a">${svg}</div><figcaption>${escape(label)}${card.kind==='before'?' · было':''}${foreign.length?`<small>${foreign.join(' ')}</small>`:''}</figcaption></figure>`;
 }).join('');
}

const shell=(title:string,cards:ArtCard[],themes:Map<string,ThemePalette>)=>{
 const legend=[...Object.entries(PALETTE.backgrounds),...Object.entries(PALETTE.colors)].map(([name,hex])=>`<span class="c"><i style="background:${hex}"></i>${name} ${hex}</span>`).join('');
 const options=[...themes.keys()].map(name=>`<option value="${escape(name)}">${escape(name)}</option>`).join('');
 const chooser=themes.size?`<label>Тема <select id="theme"><option value="base">исходная</option>${options}</select></label>`:'';
 const templates=[...themes].map(([name,palette])=>`<template id="theme-${escape(name)}">${artCards(cards,palette)}</template>`).join('');
 const script=themes.size?`<script>const box=document.querySelector('main');document.querySelector('#theme').onchange=e=>{const t=document.querySelector('#theme-'+e.target.value);box.innerHTML=t.innerHTML}</script>`:'';
 const baseTemplate=themes.size?`<template id="theme-base">${artCards(cards)}</template>`:'';
 return `<!doctype html><meta charset="utf-8"><title>${escape(title)}</title><style>body{font:14px system-ui;background:#f7f7f5;margin:0;padding:16px}header,main{display:grid;grid-template-columns:repeat(5,1fr);gap:12px}header{display:flex;flex-wrap:wrap;margin-bottom:12px;font-size:12px}.c i{display:inline-block;width:14px;height:14px;border-radius:4px;vertical-align:-2px;margin-right:4px;border:1px solid #0002}figure{margin:0;background:#fff;border-radius:12px;overflow:hidden}figure.legacy{outline:2px solid #ef4444}figure.part{outline:2px solid #2563eb}figure.before{opacity:.65}.a svg{display:block;width:100%}figcaption{padding:6px 8px;color:#171717}figcaption small{display:block;color:#ef4444;font-family:monospace}</style><header>${chooser}${legend}</header><main>${artCards(cards)}</main>${baseTemplate}${templates}${script}`;
};

export interface SheetResult {full:string;changes?:string;note?:string}

export const REFERENCE_SETS={
 objects:['apple.svg','book.svg','house.svg','car.svg','phone.svg'],
 characters:['cat.svg','dog.svg','child.svg','mother.svg','person.svg'],
 actions:['run.svg','sleep.svg','drink.svg','read.svg','rain.svg'],
} as const;

/** Отдельный лист эталонов показывает законченную карточку и тот же силуэт при целевых 64 px. */
export function writeReferenceSheet(root=process.cwd()):string{
 const artRoot=join(root,'content','art','references');
 const sections=Object.entries(REFERENCE_SETS).map(([category,files])=>{
  const cards=files.map(file=>{
   const svg=readFileSync(join(artRoot,category,file),'utf8'), label=basename(file,'.svg');
   return `<figure data-category="${category}"><div class="large">${svg}</div><div class="small">${svg}</div><figcaption>${label}</figcaption></figure>`;
  }).join('');
  return `<section><h2>${category}</h2><div class="row">${cards}</div></section>`;
 }).join('');
 const html=`<!doctype html><meta charset="utf-8"><title>Lexi illustration references</title><style>body{font:14px system-ui;color:#1f2937;background:#f7f7f5;margin:0;padding:24px}h1{margin:0 0 24px}h2{margin:24px 0 10px;text-transform:capitalize}.row{display:grid;grid-template-columns:repeat(5,1fr);gap:14px}figure{position:relative;margin:0;background:#fff;border-radius:16px;overflow:hidden}.large svg{display:block;width:100%;height:auto}.small{position:absolute;right:10px;bottom:8px;width:64px;height:44px;border:1px solid #1f293733;background:#fff;border-radius:8px;overflow:hidden}.small svg{display:block;width:64px;height:44px}figcaption{padding:8px 10px;font-size:16px}</style><h1>Lexi Golden Set</h1>${sections}`;
 mkdirSync(join(root,'docs'),{recursive:true});
 writeFileSync(join(root,'docs','art-references.html'),html);
 return html;
}

export function writeArtSheets(root=process.cwd(),base=process.env.ART_BASE??'main'):SheetResult{
 const contentRoot=join(root,'content'), artRoot=join(contentRoot,'art'), docs=join(root,'docs');
 const words=new Map<string,string[]>();
 for(const source of readFileNames(join(contentRoot,'words'),'.yaml')){
  const body=readFileSync(source,'utf8'), image=/^image:\s*(.+)$/m.exec(body)?.[1], russian=/^russian:\s*(.+)$/m.exec(body)?.[1];
  if(image&&russian)words.set(image,[...(words.get(image)??[]),russian]);
 }
 const parts=readFileNames(join(artRoot,'parts'),'.svg').map(path=>({file:basename(path),svg:readFileSync(path,'utf8'),kind:'part' as const}));
 const files=readFileNames(artRoot,'.svg').map(path=>({file:basename(path),svg:readFileSync(path,'utf8'),title:(words.get(basename(path))??[]).join(', ')}));
 const themes=readThemes(contentRoot), full=shell('Иллюстрации Lexi',[...parts,...files],themes);
 mkdirSync(docs,{recursive:true}); writeFileSync(join(docs,'art-sheet.html'),full);
 try{
  const changes=changedCards(root,base,words), html=shell('Изменения иллюстраций Lexi',changes,themes);
  writeFileSync(join(docs,'art-changes.html'),html);
  return {full,changes:html};
 }catch(error){return {full,note:`Лист изменений пропущен: ${error instanceof Error?error.message:String(error)}`}}
}

const readFileNames=(dir:string,ext:string)=>existsSync(dir)?readdirSync(dir).filter(file=>file.endsWith(ext)).map(file=>join(dir,file)).sort():[];

function changedCards(root:string,base:string,titles:Map<string,string[]>):ArtCard[]{
 const run=(args:string[])=>execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();
 const rows=run(['-c','core.quotePath=false','diff','--name-status','-M',base,'--','content/art']).split('\n').filter(Boolean).map(line=>line.split('\t'));
 const untracked=run(['ls-files','--others','--exclude-standard','--','content/art']).split('\n').filter(Boolean);
 for(const path of untracked)if(!rows.some(row=>row.at(-1)===path))rows.push(['A',path]);
 const cards:ArtCard[]=[];
 for(const row of rows){
  const status=row[0][0], oldPath=status==='R'?row[1]:row[1], newPath=status==='R'?row[2]:row[1];
  if(!newPath?.endsWith('.svg'))continue;
  if(status==='M'||status==='R')cards.push({file:basename(oldPath),svg:execFileSync('git',['show',`${base}:${oldPath}`],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','ignore']}),kind:'before'});
  const disk=join(root,newPath);
  if(status!=='D'&&existsSync(disk))cards.push({file:basename(newPath),svg:readFileSync(disk,'utf8'),title:(titles.get(basename(newPath))??[]).join(', ')});
 }
 return cards;
}
