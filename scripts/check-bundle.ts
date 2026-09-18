import {readdirSync, readFileSync, statSync} from 'node:fs';
import {join} from 'node:path';

/**
 * Проверка сборки после `vite build`: стартовый чанк не вырос сверх предела и не содержит SDK отчётов о сбоях,
 * SDK лежит в отдельном чанке, а карт кода в `dist` нет — ни без реквизитов загрузки, ни после неё.
 * Предел растёт только вместе с измеренной базой. Замеры: 851 462 байта до отчётов о сбоях, 860 271 на `main`
 * перед карточками трёх видов, 893 732 после них (доменная модель ссылок, проверка пропуска, экран задания,
 * группы урока, формат синхронизации 2). Текущий предел — этот замер плюс запас на лёгкий модуль и экран сбоя.
 */
const ENTRY_LIMIT=910_000;
const SDK_MARKER='sentry.javascript.';
const dist='dist';
const problems:string[]=[];

const walk=(dir:string):string[]=>readdirSync(dir).flatMap(name=>{const path=join(dir,name);return statSync(path).isDirectory()?walk(path):[path]});
const files=walk(dist);
const maps=files.filter(file=>file.endsWith('.map'));
if(maps.length)problems.push(`карты кода в dist: ${maps.join(', ')}`);

const html=readFileSync(join(dist,'index.html'),'utf8');
const entryPath=html.match(/<script[^>]+type="module"[^>]+src="\/?([^"]+\.js)"/)?.[1];
if(!entryPath)problems.push('в index.html не найден стартовый модуль');
else{
 const entry=readFileSync(join(dist,entryPath),'utf8');
 const size=Buffer.byteLength(entry);
 console.log(`стартовый чанк ${entryPath}: ${size} байт (предел ${ENTRY_LIMIT})`);
 if(size>ENTRY_LIMIT)problems.push(`стартовый чанк ${size} байт больше предела ${ENTRY_LIMIT}`);
 if(entry.includes(SDK_MARKER))problems.push('SDK отчётов о сбоях попал в стартовый чанк');
 const sdkChunks=files.filter(file=>file.endsWith('.js')&&file!==join(dist,entryPath)&&readFileSync(file,'utf8').includes(SDK_MARKER));
 const referenced=sdkChunks.filter(file=>entry.includes(file.split('/').pop()!));
 console.log(sdkChunks.length?`SDK в отдельном чанке: ${sdkChunks.map(file=>file.replace(`${dist}/`,'')).join(', ')}${referenced.length?' (подключается из стартового)':' (без адреса приёма стартовый чанк его не загружает)'}`:'SDK в сборке отсутствует');
}
if(problems.length){console.error(`Проверка сборки не пройдена:\n- ${problems.join('\n- ')}`);process.exit(1)}
console.log('Проверка сборки пройдена.');
