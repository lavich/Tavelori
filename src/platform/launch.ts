/**
 * Контекст запуска определяется синхронно по параметрам URL, которые Telegram добавляет к адресу Mini App:
 * `#tgWebAppData=…&tgWebAppPlatform=…&tgWebAppVersion=…`. Один глобальный объект `Telegram.WebApp`
 * признаком запуска не считается — библиотека может присутствовать и в обычном браузере.
 * Параметры используются только для интерфейса и выбора локального профиля, не как доверенная авторизация.
 */
export interface TelegramUser {id:number;firstName:string;lastName?:string;username?:string;languageCode?:string}
export interface LaunchContext {
 kind:'web'|'telegram';
 /** Имя бота из адреса Mini App (`?bot=TaveloriDevBot`); без параметра — основной бот. */
 bot:string;
 platform:string|null;
 version:string|null;
 user:TelegramUser|null;
 startParam:string|null;
}
export const DEFAULT_BOT='TaveloriBot';
const STORAGE_KEY='lexi:launch';

const parseUser=(raw:string|null):TelegramUser|null=>{
 if(!raw)return null;
 try{
  const user=JSON.parse(raw);
  if(typeof user?.id!=='number')return null;
  return {id:user.id,firstName:String(user.first_name??''),lastName:user.last_name,username:user.username,languageCode:user.language_code};
 }catch{return null}
};
const botName=(search:string)=>{
 const bot=new URLSearchParams(search).get('bot')?.replace(/^@/,'')??'';
 return /^[A-Za-z][A-Za-z0-9_]{3,31}$/.test(bot)?bot:DEFAULT_BOT;
};

/** Разбор без побочных эффектов: параметры Telegram живут в hash, имя бота — в query. */
export function parseLaunch(location:{hash:string;search:string}):LaunchContext{
 const bot=botName(location.search);
 const hash=new URLSearchParams(location.hash.replace(/^#/,''));
 const platform=hash.get('tgWebAppPlatform');
 const data=hash.get('tgWebAppData');
 if(!platform&&!data)return {kind:'web',bot,platform:null,version:null,user:null,startParam:null};
 const init=new URLSearchParams(data??'');
 return {kind:'telegram',bot,platform,version:hash.get('tgWebAppVersion'),user:parseUser(init.get('user')),startParam:init.get('start_param')};
}

let cached:LaunchContext|null=null;
/**
 * Контекст читается один раз при загрузке и запоминается на время вкладки: маршрутизация может убрать hash,
 * а перезагрузка внутри WebView снова получает параметры от Telegram.
 */
export function launchContext():LaunchContext{
 if(cached)return cached;
 if(typeof window==='undefined')return cached={kind:'web',bot:DEFAULT_BOT,platform:null,version:null,user:null,startParam:null};
 const fresh=parseLaunch(window.location);
 if(fresh.kind==='telegram'){
  try{sessionStorage.setItem(STORAGE_KEY,JSON.stringify(fresh))}catch{/* приватный режим */}
  return cached=fresh;
 }
 try{
  const stored=sessionStorage.getItem(STORAGE_KEY);
  if(stored){const parsed=JSON.parse(stored) as LaunchContext;if(parsed.kind==='telegram')return cached={...parsed,bot:fresh.bot}}
 }catch{/* нет хранилища */}
 return cached=fresh;
}
/** Только для тестов: сбросить запомненный контекст. */
export const resetLaunchContext=()=>{cached=null};
