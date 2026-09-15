import {makeSession} from '../../domain/learning';
import type {Session, Snapshot} from '../../domain/types';
import {db} from '../../storage/db';

export async function startSession(data:Snapshot,now:Date,options:{wordIds?:string[];mode?:'scheduled'|'practice'}={}):Promise<Session|null>{
 const session=makeSession({data,now,...options});
 if(!session.items.length)return null;
 await db.sessions.add(session);
 return session;
}
export const activeSession=(data:Snapshot)=>data.sessions.filter(s=>s.status==='active').sort((a,b)=>b.createdAt.localeCompare(a.createdAt))[0];
