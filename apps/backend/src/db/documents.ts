import 'dotenv/config';
import {mkdir} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {createClient} from '@libsql/client';
import {and,eq} from 'drizzle-orm';
import {drizzle as sqliteDrizzle} from 'drizzle-orm/libsql';
import {drizzle as postgresDrizzle} from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import {documents as sqliteDocuments} from './schema-sqlite.js';
import {documents as pgDocuments} from './schema-postgres.js';

export type DocumentRecord<T>={key:string;version:number;value:T};
export interface DocumentStore {
  readonly dialect:'sqlite'|'postgresql';
  /** Immutable owner identity, assigned by trusted application authentication. */
  readonly ownerId:string;
  get<T>(namespace:string,key:string):Promise<DocumentRecord<T>|null>;
  list<T>(namespace:string):Promise<Array<DocumentRecord<T>>>;
  /** expectedVersion=0 inserts only; >0 is compare-and-swap update. */
  put<T>(namespace:string,key:string,value:T,expectedVersion:number):Promise<number>;
  remove(namespace:string,key:string,expectedVersion:number):Promise<void>;
  close():Promise<void>;
}
export const LOCAL_OWNER_ID='local-owner';
const tenantIdPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
/** Never accept a tenant ID from a request body, URL, or unverified header. */
export function checkedOwnerId(value:string):string{
  if(value===LOCAL_OWNER_ID)return value;
  if(typeof value!=='string'||!tenantIdPattern.test(value))
    throw Error('Owner ID must be a verified internal UUID');
  return value.toLowerCase();
}
const formatKey=(value:string)=>{
  if(typeof value!=='string'||!value||value.length>160||!/^[-a-zA-Z0-9_:]+$/.test(value))
    throw Error('Invalid database document key');
  return value;
};
const validated=(namespace:string,key:string)=>{
  if(!['account','career','connectors','workflow-plans','workflows','workflow-revisions','linkedin-research','linkedin-drafts','linkedin-oauth-grants','linkedin-oauth-pending','connector-session-vault','crafts','craft-migrations','growth-runs'].includes(namespace))
    throw Error('Unknown database document namespace');
  return [namespace,formatKey(key)] as const;
};
const decode=<T>(row:{key:string;version:number;payload:string}):DocumentRecord<T>=>({
  key:row.key,version:row.version,value:JSON.parse(row.payload) as T,
});
const payload=(value:unknown)=>{
  const serialized=JSON.stringify(value);
  if(typeof serialized!=='string'||serialized.length>524288)throw Error('Database document size limit exceeded');
  return serialized;
};
function checkRevision(expected:number){
  if(!Number.isSafeInteger(expected)||expected<0)throw Error('Invalid database revision');
}
const conflict=()=>Error('Database document changed. Reload before saving.');
export async function createDocumentStore(
  environment:NodeJS.ProcessEnv=process.env,
  authenticatedOwnerId:string=LOCAL_OWNER_ID,
):Promise<DocumentStore>{
  const owner=checkedOwnerId(authenticatedOwnerId);
  const url=environment.DATABASE_URL?.trim();
  if(url){
    if(!/^postgres(?:ql)?:\/\//i.test(url))throw Error('DATABASE_URL must be PostgreSQL');
    const client=postgres(url,{max:10,connect_timeout:10});
    const db=postgresDrizzle({client});
    try { await db.select({key:pgDocuments.key}).from(pgDocuments).limit(1); }
    catch(error){await client.end().catch(()=>{});throw Error('PostgreSQL schema unavailable. Apply Drizzle migrations with pnpm db:migrate or pnpm db:push before starting.',{cause:error});}
    return {
      dialect:'postgresql',
      ownerId:owner,
      async get<T>(namespace:string,key:string){
        validated(namespace,key);
        const rows=await db.select({key:pgDocuments.key,version:pgDocuments.version,payload:pgDocuments.payload})
          .from(pgDocuments).where(and(eq(pgDocuments.ownerId,owner),eq(pgDocuments.namespace,namespace),eq(pgDocuments.key,key))).limit(1);
        return rows[0]?decode<T>(rows[0]):null;
      },
      async list<T>(namespace:string){
        validated(namespace,'list');
        const rows=await db.select({key:pgDocuments.key,version:pgDocuments.version,payload:pgDocuments.payload})
          .from(pgDocuments).where(and(eq(pgDocuments.ownerId,owner),eq(pgDocuments.namespace,namespace)));
        return rows.map(row=>decode<T>(row));
      },
      async put<T>(namespace:string,key:string,value:T,expectedVersion:number){
        validated(namespace,key);checkRevision(expectedVersion);const now=new Date().toISOString(),serialized=payload(value);
        if(!expectedVersion){
          const rows=await db.insert(pgDocuments).values({ownerId:owner,namespace,key,version:1,payload:serialized,updatedAt:now})
            .onConflictDoNothing().returning({version:pgDocuments.version});
          if(!rows.length)throw conflict();return 1;
        }
        const rows=await db.update(pgDocuments).set({payload:serialized,version:expectedVersion+1,updatedAt:now})
          .where(and(eq(pgDocuments.ownerId,owner),eq(pgDocuments.namespace,namespace),
            eq(pgDocuments.key,key),eq(pgDocuments.version,expectedVersion)))
          .returning({version:pgDocuments.version});
        if(!rows.length)throw conflict();return rows[0]!.version;
      },
      async remove(namespace:string,key:string,expectedVersion:number){
        validated(namespace,key);checkRevision(expectedVersion);
        const rows=await db.delete(pgDocuments).where(and(eq(pgDocuments.ownerId,owner),
          eq(pgDocuments.namespace,namespace),eq(pgDocuments.key,key),
          eq(pgDocuments.version,expectedVersion))).returning({key:pgDocuments.key});
        if(!rows.length)throw conflict();
      },
      async close(){await client.end();}
    };
  }
  const file=environment.DB_FILE_NAME?.trim()||'file:local.db';
  if(!file.startsWith('file:')||file.startsWith('file://'))throw Error('DB_FILE_NAME must be a local file: SQLite path');
  const filename=file.slice(5);
  if(!filename||filename===':memory:') {
    if(filename!==':memory:')throw Error('Invalid SQLite file');
  } else {
    await mkdir(dirname(resolve(filename)),{recursive:true,mode:0o700});
  }
  const client=createClient({url:file});
  const db=sqliteDrizzle({client});
  try {await db.select({key:sqliteDocuments.key}).from(sqliteDocuments).limit(1);}
  catch(error){client.close();throw Error('SQLite schema unavailable. Apply Drizzle migrations with pnpm db:migrate or pnpm db:push before starting.',{cause:error});}
  return {
    dialect:'sqlite',
    ownerId:owner,
    async get<T>(namespace:string,key:string){
      validated(namespace,key);
      const rows=await db.select({key:sqliteDocuments.key,version:sqliteDocuments.version,payload:sqliteDocuments.payload})
        .from(sqliteDocuments).where(and(eq(sqliteDocuments.ownerId,owner),eq(sqliteDocuments.namespace,namespace),eq(sqliteDocuments.key,key))).limit(1);
      return rows[0]?decode<T>(rows[0]):null;
    },
    async list<T>(namespace:string){
      validated(namespace,'list');
      const rows=await db.select({key:sqliteDocuments.key,version:sqliteDocuments.version,payload:sqliteDocuments.payload})
        .from(sqliteDocuments).where(and(eq(sqliteDocuments.ownerId,owner),eq(sqliteDocuments.namespace,namespace)));
      return rows.map(row=>decode<T>(row));
    },
    async put<T>(namespace:string,key:string,value:T,expectedVersion:number){
      validated(namespace,key);checkRevision(expectedVersion);const now=new Date().toISOString(),serialized=payload(value);
      if(!expectedVersion){
        const rows=await db.insert(sqliteDocuments).values({ownerId:owner,namespace,key,version:1,payload:serialized,updatedAt:now})
          .onConflictDoNothing().returning({version:sqliteDocuments.version});
        if(!rows.length)throw conflict();return 1;
      }
      const rows=await db.update(sqliteDocuments).set({payload:serialized,version:expectedVersion+1,updatedAt:now})
        .where(and(eq(sqliteDocuments.ownerId,owner),eq(sqliteDocuments.namespace,namespace),
          eq(sqliteDocuments.key,key),eq(sqliteDocuments.version,expectedVersion)))
        .returning({version:sqliteDocuments.version});
      if(!rows.length)throw conflict();return rows[0]!.version;
    },
    async remove(namespace:string,key:string,expectedVersion:number){
      validated(namespace,key);checkRevision(expectedVersion);
      const rows=await db.delete(sqliteDocuments).where(and(eq(sqliteDocuments.ownerId,owner),
        eq(sqliteDocuments.namespace,namespace),eq(sqliteDocuments.key,key),
        eq(sqliteDocuments.version,expectedVersion))).returning({key:sqliteDocuments.key});
      if(!rows.length)throw conflict();
    },
    async close(){client.close();}
  };
}
