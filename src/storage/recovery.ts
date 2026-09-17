import {db, type LexiDatabase} from './db';

/** Ошибки хранилища, которые лечит переоткрытие базы: WebKit после сна WebView отдаёт `UnknownError` на чтение IndexedDB. */
const STORAGE_ERRORS=new Set(['UnknownError','InvalidStateError','TransactionInactiveError','AbortError','DatabaseClosedError']);
export function isStorageError(error:unknown,depth=0):boolean{
 if(!error||typeof error!=='object'||depth>3)return false;
 const {name,inner}=error as {name?:unknown;inner?:unknown};
 if(typeof name==='string'&&STORAGE_ERRORS.has(name))return true;
 return isStorageError(inner,depth+1);
}

export async function reopenDatabase(database:LexiDatabase=db):Promise<void>{
 database.close({disableAutoOpen:false});
 await database.open();
}
