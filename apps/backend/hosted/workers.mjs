import {spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {createServer} from 'node:net';
import {mkdir} from 'node:fs/promises';
import {isAbsolute,join,resolve} from 'node:path';
import {createClient} from '@libsql/client';
const tenantUuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const checkedOwnerId=value=>{
  if(typeof value!=='string'||!tenantUuid.test(value))
    throw Error('Hosted worker owner must be a verified UUID');
  return value.toLowerCase();
};

const pause = duration => new Promise(resolve => setTimeout(resolve,duration));
async function allocatePort() {
  const server = createServer();
  return new Promise((resolve,reject) => {
    server.once('error',reject);
    server.listen(0,'127.0.0.1',()=>{
      const port = server.address().port;
      server.close(error => error ? reject(error) : resolve(port));
    });
  });
}
async function terminate(child) {
  if(!child)return;
  const exit = new Promise(resolve=>child.once('exit',resolve));
  const signal=which=>{
    if(process.platform!=='win32' && child.pid){
      try{process.kill(-child.pid,which);return;}catch{}
    }
    try{child.kill(which);}catch{}
  };
  signal('SIGTERM');
  if(child.exitCode!==null || child.signalCode!==null)return;
  await Promise.race([exit,pause(3000)]);
  if(child.exitCode===null && child.signalCode===null) {
    signal('SIGKILL');
    await Promise.race([exit,pause(2000)]);
  }
}

export class TenantWorkerManager {
  constructor({root,entry=resolve(import.meta.dirname,'../dist/server.js'),
    maxWorkers=20,timeoutMs=20000}={}) {
    if (!isAbsolute(root || '')) throw Error('Hosted tenant storage root must be absolute');
    if (!Number.isSafeInteger(maxWorkers) || maxWorkers < 1 || maxWorkers > 100)
      throw Error('Invalid tenant worker limit');
    this.root=root;
    this.entry=entry;
    this.maxWorkers=maxWorkers;
    this.timeoutMs=timeoutMs;
    this.workers=new Map();
    this.pending=new Map();
    this.closing=false;
  }
  async start(ownerId) {
    if (this.closing) throw Error('Hosted worker manager is shutting down');
    const owner=checkedOwnerId(ownerId);
     const present=this.workers.get(owner);
    if (present && present.child.exitCode===null && present.child.signalCode===null) return present;
    if (present) this.workers.delete(owner);
    if (this.pending.has(owner)) return this.pending.get(owner);
    if (this.workers.size+this.pending.size >= this.maxWorkers)
      throw Error('Hosted worker capacity reached');
    const operation=this.launch(owner).finally(()=>this.pending.delete(owner));
    this.pending.set(owner,operation);
    return operation;
  }
  async launch(owner) {
    const userRoot=join(this.root,owner);
    await mkdir(userRoot,{recursive:true,mode:0o700});
    const dbFile=join(userRoot,'utomator.db');
    const client=createClient({url:'file:'+dbFile});
    try {
      // Schema matches the existing Drizzle composite owner, namespace and key.
      await client.execute('CREATE TABLE IF NOT EXISTS utomator_documents ('+
        'owner_id TEXT NOT NULL, namespace TEXT NOT NULL, record_key TEXT NOT NULL, '+
        'version INTEGER NOT NULL, payload TEXT NOT NULL, updated_at TEXT NOT NULL, '+
        'PRIMARY KEY(owner_id,namespace,record_key))');
    } finally {client.close();}
    const port=await allocatePort();
    const secret=randomBytes(32).toString('base64url');
    const child=spawn(process.execPath,[this.entry],{
      cwd:userRoot,detached:process.platform!=='win32',
      // IPC disconnect is a parent-death signal; orphan workers must terminate.
      stdio:['ignore','inherit','inherit','ipc'],
      env:{
        PATH:process.env.PATH || '',
        // Playwright's immutable browser binaries can be shared; profiles and XDG state cannot.
        HOME:process.env.HOME || userRoot,
        XDG_CONFIG_HOME:join(userRoot,'.config'),XDG_CACHE_HOME:join(userRoot,'.cache'),
        NODE_ENV:'production',
        UTOMATOR_PORT:String(port),DB_FILE_NAME:'file:'+dbFile,
        UTOMATOR_INTERNAL_OWNER_ID:owner,UTOMATOR_INTERNAL_TOKEN:secret,
        UTOMATOR_DISABLE_CDP:'true',
        HEADLESS:'true',
        // Reuse installed browser executable binaries, not Chrome user profiles.
        PLAYWRIGHT_BROWSERS_PATH:process.env.PLAYWRIGHT_BROWSERS_PATH ||
          join(process.env.XDG_CACHE_HOME || join(process.env.HOME || userRoot,'.cache'),'ms-playwright'),
      },
    });
    let spawnError;
    child.once('error',error=>{spawnError=error;});
    const target='http://127.0.0.1:'+port;
    try {
      const deadline=Date.now()+this.timeoutMs;
      while(Date.now()<deadline){
        if(spawnError)throw Error('Tenant worker failed to spawn');
        if (child.exitCode !== null || child.signalCode !== null)
          throw Error('Tenant worker exited during startup');
        try {
          const response=await fetch(target+'/health',{
            headers:{'x-utomator-worker-token':secret},signal:AbortSignal.timeout(500),
          });
          if(response.ok){
            const worker={port,target,child,owner,secret};
            if(this.closing)throw Error('Worker manager is shutting down');
            this.workers.set(owner,worker);
            child.once('exit',()=>{
              if(this.workers.get(owner)===worker)this.workers.delete(owner);
            });
            return worker;
          }
        }catch {}
        await pause(150);
      }
      throw Error('Tenant worker startup timed out');
    }catch(error){
      await terminate(child);
      throw error;
    }
  }
  async stop(ownerId) {
    const owner=checkedOwnerId(ownerId);
    const worker=this.workers.get(owner);
    if(worker){this.workers.delete(owner);await terminate(worker.child);}
    // If the worker is still starting, close it immediately after startup.
    const pending=this.pending.get(owner);
    if(pending)await pending.then(result=>terminate(result.child),()=>undefined);
  }
  async close() {
    this.closing=true;
    await Promise.all([...this.workers.values()].map(worker=>terminate(worker.child)));
    this.workers.clear();
    const pending=await Promise.allSettled(this.pending.values());
    await Promise.all(pending.filter(result=>result.status==='fulfilled')
      .map(result=>terminate(result.value.child)));
    this.pending.clear();
  }
}
