import {existsSync, readdirSync, readFileSync} from 'node:fs';
import {basename, extname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {ContentError} from '../src/content/schema.ts';

/**
 * Стандарт иллюстраций (docs/art-standard.md) в виде проверок. Палитра — единственный источник цветов:
 * из content/art/palette.json читают и публикация, и обзорный лист. Файлы из legacy.txt нарисованы до
 * стандарта: для них проверка палитры не действует, остальные правила действуют для всех.
 */
/** `themeable` — роли, которые вправе менять тема курса: подложки, контур и акцент. Остальные роли предметные и несут значение слова. */
export interface Palette {viewBox:string;maxBytes:number;backgrounds:Record<string,string>;colors:Record<string,string>;themeable:string[]}
export const PALETTE:Palette=JSON.parse(readFileSync(fileURLToPath(new URL('./art/palette.json',import.meta.url)),'utf8'));
export const paletteColors=(palette=PALETTE)=>new Set([...Object.values(palette.backgrounds),...Object.values(palette.colors)]);
export type ThemePalette=Record<string,string>;

/** Разворачивает имена тематических ролей в карту исходных hex → hex темы, которую читает клиент. */
export function themePalette(name:string,input:unknown,palette=PALETTE):ThemePalette{
 const where=`тема «${name}»`;
 if(!input||typeof input!=='object'||Array.isArray(input))fail(`${where}: ожидался объект`);
 const colors=(input as {colors?:unknown}).colors;
 if(!colors||typeof colors!=='object'||Array.isArray(colors))fail(`${where}.colors: ожидался объект`);
 const roles={...palette.backgrounds,...palette.colors};
 const result:ThemePalette={};
 for(const [role,value] of Object.entries(colors as Record<string,unknown>)){
  if(!(role in roles))fail(`${where}: роли «${role}» нет в палитре`);
  if(!palette.themeable.includes(role))fail(`${where}: роль «${role}» предметная и не может меняться темой`);
  if(typeof value!=='string'||!/^#[0-9a-f]{6}$/.test(value))fail(`${where}: цвет роли «${role}» должен иметь вид #rrggbb`);
  result[roles[role]]=value as string;
 }
 return result;
}

/** Все доступные темы; каталог и обзорные листы используют одну проверку и одно разворачивание. */
export function readThemes(root:string):Map<string,ThemePalette>{
 const dir=join(root,'art','themes');
 if(!existsSync(dir))return new Map();
 return new Map(readdirSync(dir).filter(file=>file.endsWith('.json')).sort().map(file=>{
  const name=basename(file,extname(file));
  let raw:unknown;
  try{raw=JSON.parse(readFileSync(join(dir,file),'utf8'))}catch{fail(`тема «${name}»: файл art/themes/${file} содержит неверный JSON`)}
  return [name,themePalette(name,raw)] as const;
 }));
}

const fail=(message:string):never=>{throw new ContentError(message)};
/** Служебные значения цвета: не краска, а указание её не класть или взять снаружи. */
const KEYWORDS=new Set(['none','currentcolor','transparent','inherit']);
const COLOR_ATTRS='fill|stroke|stop-color|color|flood-color|lighting-color';
const FORBIDDEN:[RegExp,string][]=[
 [/<(text|tspan|textPath)[\s>/]/,'подпись в картинке выдаёт ответ'],
 [/<(title|desc|metadata)[\s>/]/,'заголовок или описание могут выдать ответ — подпись картинке даёт клиент'],
 [/<script[\s>/]/,'скрипт'],[/\son[a-z]+\s*=/i,'обработчик события'],
 [/<style[\s>/]/,'стили: цвета задаются атрибутами, анимация запрещена'],
 [/<(animate|animateMotion|animateTransform|set|discard)[\s>/]/,'анимация: картинка видна и в момент ответа'],
 [/<(image|foreignObject)[\s>/]/,'растровое или встроенное содержимое'],
 [/\bdata:/i,'встроенные данные'],
 [/(?:xlink:)?href\s*=\s*["'](?!#)/,'ссылка не на элемент этого файла'],
 [/url\(\s*["']?(?!#)/,'url() не на элемент этого файла'],
];

/** Цвет в нормальной записи: нижний регистр, шесть знаков. Служебные слова — как есть; всё остальное — чужой цвет. */
export const normalizeColor=(raw:string)=>{
 const value=raw.trim().toLowerCase();
 if(KEYWORDS.has(value))return value;
 const hex=/^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(value);
 return hex?'#'+(hex[1].length===3?[...hex[1]].map(c=>c+c).join(''):hex[1]):value;
};
/** Все цвета файла: атрибуты цвета и объявления в style="…". */
export function colorsOf(svg:string):Set<string>{
 const found=new Set<string>();
 for(const m of svg.matchAll(new RegExp(`\\b(?:${COLOR_ATTRS})\\s*=\\s*["']([^"']*)["']`,'g')))found.add(normalizeColor(m[1]));
 for(const s of svg.matchAll(/\bstyle\s*=\s*["']([^"']*)["']/g))
  for(const m of s[1].matchAll(new RegExp(`(?:^|;)\\s*(?:${COLOR_ATTRS})\\s*:\\s*([^;]+)`,'g')))found.add(normalizeColor(m[1]));
 return found;
}
export const foreignColors=(svg:string,palette=PALETTE)=>{
 const allowed=paletteColors(palette);
 // url(#id) — ссылка на градиент или узор того же файла; его цвета проверяются по stop-color
 return [...colorsOf(svg)].filter(color=>!KEYWORDS.has(color)&&!color.startsWith('url(#')&&!allowed.has(color)).sort();
};

export const LEGACY_FILE='legacy.txt';
/** Список унаследованных файлов: по имени в строке, пустые строки и комментарии с # пропускаются. */
export const parseLegacy=(text:string)=>new Set(text.split('\n').map(line=>line.trim()).filter(line=>line&&!line.startsWith('#')));
export const readLegacy=(files:Map<string,Uint8Array>)=>{const body=files.get(`art/${LEGACY_FILE}`);return parseLegacy(body?Buffer.from(body).toString('utf8'):'')};

export interface ArtReport {files:number;legacy:number}
/** Проверка одной иллюстрации. Возвращает true, если файл унаследованный и вне палитры — для отчёта о миграции. */
export function checkArt(file:string,body:Uint8Array,legacy:Set<string>,palette=PALETTE):boolean{
 const where=`art/${file}`;
 const svg=Buffer.from(body).toString('utf8');
 for(const [pattern,reason] of FORBIDDEN) if(pattern.test(svg))fail(`${where}: ${reason} — запрещено стандартом иллюстраций (docs/art-standard.md)`);
 const viewBox=/<svg\b[^>]*\bviewBox\s*=\s*["']([^"']*)["']/.exec(svg)?.[1].trim().split(/[\s,]+/).join(' ');
 if(viewBox!==palette.viewBox)fail(`${where}: холст viewBox="${viewBox??''}", стандарт — viewBox="${palette.viewBox}"`);
 if(body.byteLength>palette.maxBytes)fail(`${where}: ${body.byteLength} байт, потолок иллюстрации — ${palette.maxBytes} байта (${palette.maxBytes/1024} КБ)`);
 const foreign=foreignColors(svg,palette);
 if(legacy.has(file)){
  if(!foreign.length)fail(`${where} уже в палитре — уберите его из art/${LEGACY_FILE}`);
  return true;
 }
 if(foreign.length)fail(`${where}: цвета вне палитры ${foreign.join(', ')} — палитра в content/art/palette.json, для картинок до стандарта есть art/${LEGACY_FILE}`);
 return false;
}
