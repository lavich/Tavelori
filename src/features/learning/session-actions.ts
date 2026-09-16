import {makeSession} from '../../domain/learning';
import {hasGreekVoice} from '../../shared/audio';
import type {Session} from '../../domain/types';
import {db} from '../../storage/db';
import {dexieSource} from '../../storage/queries';

/** Сессия собирается из выборок базы: карточки читаются только для выбранных слов. */
export async function startSession(now:Date,options:{wordIds?:string[];mode?:'scheduled'|'practice'}={}):Promise<Session|null>{
 const session=await makeSession({source:dexieSource(),now,hasVoice:hasGreekVoice(),...options});
 if(!session.items.length)return null;
 await db.sessions.add(session);
 return session;
}
