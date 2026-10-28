import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CareerStore } from '../src/profile/career-store.js';
const identity = {name:'Example Candidate',headline:'Backend Engineer',location:'Lagos',
  summary:'Self-authored summary.',contacts:['example@example.org'],education:[],
  experience:[],skills:['API design'],projects:[],customSections:[]};
async function withStore(fn:(store:CareerStore,root:string)=>Promise<void>){
  const root=await mkdtemp(join(tmpdir(),'career-store-'));
  try {await fn(new CareerStore(root),root);}finally{await rm(root,{recursive:true,force:true});}
}
test('new workspace has no portfolio owner, résumé or username',async()=>{
  await withStore(async(store,root)=>{
    const initial=await store.get();
    assert.deepEqual(initial.resumes,[]);
    assert.equal(initial.profile.name,'');
    assert.equal(initial.profile.headline,'');
    await assert.rejects(store.createResume(0),/Complete your career source/);
    const saved=await store.updateProfile(0,identity);
    assert.equal(saved.profile.name,'Example Candidate');
    const reopened=await new CareerStore(root).get();
    assert.deepEqual(reopened.profile,saved.profile);
    assert.deepEqual(reopened.resumes,[]);
  });
});
test('user-authored profile produces independently editable saved résumés',async()=>{
  await withStore(async(store,root)=>{
    await store.updateProfile(0,identity);
    const first=await store.createResume(1);
    const original=first.resumes[0]!;
    const cloned=await store.createResume(2,original.id);
    const duplicate=cloned.resumes[0]!;
    const saved=await store.updateResume(3,duplicate.id,{...duplicate,
      label:'Tailored version',summary:'New summary'});
    assert.equal(saved.resumes[0]?.summary,'New summary');
    assert.equal(saved.resumes[1]?.summary,original.summary);
    assert.equal(saved.profile.summary,identity.summary);
    const reloaded=await new CareerStore(root).get();
    assert.equal(reloaded.revision,4);
    assert.equal(reloaded.resumes[0]?.label,'Tailored version');
    const removed=await store.deleteResume(4,duplicate.id);
    assert.equal(removed.resumes.length,1);
    await assert.rejects(store.deleteResume(5,original.id),/at least one/);
  });
});
test('career profile edits keep optimistic revision and field validation',async()=>{
  await withStore(async store=>{
    const initial=await store.get();
    const outcomes=await Promise.allSettled([
      store.updateProfile(initial.revision,identity),
      store.updateProfile(initial.revision,{...identity,location:'Abuja'}),
    ]);
    assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,1);
    assert.equal(outcomes.filter(x=>x.status==='rejected').length,1);
    assert.throws(()=>store.updateProfile(1,{...identity,name:''}),/required/);
    await assert.rejects(store.createResume(1,'00000000-0000-4000-8000-aaaaaaaaaaaa'),/not found/);
  });
});
