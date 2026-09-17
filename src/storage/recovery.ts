import {db, type LexiDatabase} from './db';

/**
 * Отказ хранилища браузера: WebKit после сна WebView отвечает на чтение `UnknownError: Attempt to get a record
 * from database without an in-progress transaction`, Dexie при закрытом соединении — `DatabaseClosedError`.
 * Такие ошибки лечатся переоткрытием базы, остальные — нет.
 */
const STORAGE_ERRORS=new Set(['UnknownError','InvalidStateError','TransactionInactiveError','AbortError','DatabaseClosedError']);
export function isStorageError(error:unknown,depth=0):boolean{
 if(!error||typeof error!=='object'||depth>3)return false;
 const {name,inner}=error as {name?:unknown;inner?:unknown};
 if(typeof name==='string'&&STORAGE_ERRORS.has(name))return true;
 return isStorageError(inner,depth+1);
}

/** База переоткрывается тем же экземпляром: все модули держат один объект `db`, ссылки не устаревают. */
export async function reopenDatabase(database:LexiDatabase=db):Promise<void>{
 database.close({disableAutoOpen:false});
 await database.open();
}
