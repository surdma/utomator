import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {TenantWorkerManager} from '../hosted/workers.mjs';

const alice='11111111-1111-4111-8111-111111111111';
const bob='22222222-2222-4222-8222-222222222222';
const json=async (base,path,init)=>{
  const result=await fetch(base.target+path,{
    ...init,headers:{'content-type':'application/json',
      'x-utomator-worker-token':base.secret,...(init?.headers||{})},
    body:init?.body?JSON.stringify(init.body):undefined,
  });
  return {status:result.status,data:await result.json()};
};

test('real per-owner Fastify workers isolate SQL, legacy files, memory and saved account records', {timeout:60000}, async()=>{
  const temp=await mkdtemp(join(tmpdir(),'utomator-hosted-workers-'));
  const manager=new TenantWorkerManager({root:join(temp,'tenants'),timeoutMs:25000,maxWorkers:2});
  try {
    await assert.rejects(manager.start('local-owner'),/verified UUID/);
    const [a,b]=await Promise.all([manager.start(alice),manager.start(bob)]);
    assert.notEqual(a.port,b.port);
    assert.notEqual(a.child.pid,b.child.pid);
    assert.notEqual(a.secret,b.secret);
    const direct=await fetch(a.target+'/account');
    assert.equal(direct.status,401);
    const foreign=await fetch(a.target+'/account',{
      headers:{'x-utomator-worker-token':b.secret},
    });
    assert.equal(foreign.status,401);
    assert.equal(a.child.connected,true);
    assert.equal(b.child.connected,true);
    assert.equal((await json(a,'/career')).data.profile.name,'');
    assert.equal((await json(b,'/career')).data.profile.name,'');

    const updated=await json(a,'/account/profile',{
      method:'PUT',body:{
        expectedRevision:0,
        document:{displayName:'Alice Example',email:'alice@example.org',location:'Lagos',about:'Alice only'},
      },
    });
    assert.equal(updated.status,200,JSON.stringify(updated.data));
    assert.equal(updated.data.profile.displayName,'Alice Example');
    assert.equal((await json(b,'/account')).data.profile.displayName,'');
    assert.equal((await json(a,'/account')).data.profile.displayName,'Alice Example');
    const bobUpdate=await json(b,'/account/profile',{
      method:'PUT',body:{
        expectedRevision:0,
        document:{displayName:'Bob Example',email:'bob@example.org',location:'Abuja',about:'Bob only'},
      },
    });
    assert.equal(bobUpdate.status,200,JSON.stringify(bobUpdate.data));
    assert.equal((await json(a,'/account')).data.profile.displayName,'Alice Example');

    const memory=await json(b,'/intelligence/chat',{
      method:'POST',body:{text:'Bob private career plans for next year',platform:'linkedin'},
    });
    assert.equal(memory.status,201,JSON.stringify(memory.data));
    assert.equal((await json(a,'/intelligence')).data.length,0);
    assert.equal((await json(b,'/intelligence')).data.length,1);

    const aliceDb=await stat(join(temp,'tenants',alice,'utomator.db'));
    const bobDb=await stat(join(temp,'tenants',bob,'utomator.db'));
    assert(aliceDb.size>0);
    assert(bobDb.size>0);
    assert.equal((await json(b,'/runs')).data.length,0);
    assert.equal((await json(a,'/runs')).data.length,0);
    // Simulate abrupt gateway loss by disconnecting the parent IPC channel.
    // The worker must terminate rather than continue exposing a live browser.
    const exited=new Promise(resolve=>a.child.once('exit',resolve));
    a.child.disconnect();
    let deadline;
    try {
      await Promise.race([exited,new Promise((_,reject)=>{
        deadline=setTimeout(()=>reject(Error('Orphan tenant worker survived gateway IPC loss')),7000);
      })]);
    } finally { clearTimeout(deadline); }
    const restarted=await manager.start(alice);
    assert.equal((await json(restarted,'/account')).data.profile.displayName,'Alice Example');
    assert.equal((await json(restarted,'/intelligence')).data.length,0);
    assert.equal((await json(b,'/account')).data.profile.displayName,'Bob Example');
  }finally{
    await manager.close();
    await rm(temp,{recursive:true,force:true});
  }
});
