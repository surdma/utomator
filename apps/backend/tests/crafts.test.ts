import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomUUID} from 'node:crypto';
import {mkdtemp,writeFile,readFile,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createClient} from '@libsql/client';
import {createDocumentStore} from '../src/db/documents.js';
import {CraftLibrary,parseMdx,toMdx,craftArchive,type Craft} from '../src/crafts/library.js';
import {growthCapabilities,profileSections} from '../../frontend/components/automate/linkedin-growth-capabilities.js';

const root=await mkdtemp(join(tmpdir(),'utomator-crafts-'));
const databaseFile='file:'+join(root,'crafts.db');
const client=createClient({url:databaseFile});
await client.execute('CREATE TABLE IF NOT EXISTS utomator_documents('+
  'owner_id TEXT NOT NULL,namespace TEXT NOT NULL,record_key TEXT NOT NULL,'+
  'version INTEGER NOT NULL,payload TEXT NOT NULL,updated_at TEXT NOT NULL,'+
  'PRIMARY KEY(owner_id,namespace,record_key))');
client.close();
process.env.NODE_ENV='test';
process.env.UTOMATOR_TEST_DATABASE='true';
process.env.DB_FILE_NAME=databaseFile;
const {buildApp}=await import('../src/main.js');

const request={
  slug:'content-review-'+randomUUID().slice(0,8),name:'Content review',
  category:'content' as const,enabled:true,
  description:'Evaluates verified writing. Use when reviewing an attributed social post.',
  steps:[
    {id:'research',kind:'research' as const,title:'Gather evidence',body:'Review source facts.',position:{x:20,y:40}},
    {id:'draft',kind:'draft' as const,title:'Write',body:'Write from those facts.',position:{x:350,y:40}},
    {id:'review',kind:'review' as const,title:'Approve',body:'Ask the owner to approve.',position:{x:700,y:40}},
  ],
  links:[{id:'research-to-draft',source:'research',target:'draft'},
    {id:'draft-to-review',source:'draft',target:'review'}],
};
const entries=(archive:Buffer)=>{
  const files=new Map<string,string>();let i=0;
  while(i+30<=archive.length&&archive.readUInt32LE(i)===0x04034b50){
    const size=archive.readUInt32LE(i+18),nameLength=archive.readUInt16LE(i+26),
      extra=archive.readUInt16LE(i+28);
    const name=archive.subarray(i+30,i+30+nameLength).toString('utf8');
    const start=i+30+nameLength+extra;
    files.set(name,archive.subarray(start,start+size).toString('utf8'));
    i=start+size;
  }
  assert.equal(archive.readUInt32LE(i),0x02014b50);
  return files;
};

test('predefined crafts are database-backed and immutable; clones and MDX edits stay personal',async()=>{
  const app=buildApp();
  try {
    await app.ready();
    const initial=await app.inject('/crafts');
    assert.equal(initial.statusCode,200,initial.body);
    const catalog=initial.json() as Craft[];
    const defaults=catalog.filter(c=>c.scope==='default');
    assert.equal(defaults.length,21);
    const expectedIds=new Set(growthCapabilities.map(capability=>'default-growth-'+capability.id));
    assert.equal(expectedIds.size,15);
    for(const capability of growthCapabilities){
      const flow=defaults.find(candidate=>candidate.id==='default-growth-'+capability.id);
      assert.ok(flow,'Missing growth flow for '+capability.id);
      assert.equal(flow.steps.length,5,capability.id);
      assert.equal(flow.links.length,4,capability.id);
      const source=toMdx(flow);
      for(const action of capability.actions)assert.ok(source.includes(action),'Action omitted: '+capability.id+' / '+action);
      assert.ok(source.includes(capability.availableNow),'Availability omitted: '+capability.id);
      assert.ok(source.includes(capability.requires),'Prerequisites omitted: '+capability.id);
      assert.deepEqual(parseMdx(source,flow).steps,flow.steps);
      assert.deepEqual(parseMdx(source,flow).links,flow.links);
      const response=await app.inject('/crafts/'+flow.id+'/mdx');
      assert.equal(response.statusCode,200,capability.id);
      assert.equal(response.body,source,capability.id);
      if(capability.id==='profile')for(const section of profileSections)
        assert.ok(source.includes(section),'Profile section missing: '+section);
    }
    const originalDefaults=['personal-brand-positioning','portfolio-proofing','job-search-research',
      'application-tailoring','content-series-planning','thoughtful-social-engagement'];
    for(const slug of originalDefaults){
      const flow=defaults.find(candidate=>candidate.id==='default-'+slug);
      assert.ok(flow,'Original toolkit lost: '+slug);
      assert.equal(flow.steps.length,5,slug);
      assert.deepEqual(parseMdx(toMdx(flow),flow).links,flow.links);
    }
    const predefined=defaults.find(c=>c.slug==='content-series-planning')!;
    assert.equal(predefined.id,'default-content-series-planning');
    const originalMdx=toMdx(predefined);
    assert.match(originalMdx,/<CraftNode/);
    assert.deepEqual(parseMdx(originalMdx,predefined).links,predefined.links);
    const protectedUpdate=await app.inject({method:'PUT',url:'/crafts/'+predefined.id,
      payload:{expectedVersion:predefined.version,craft:{...request,slug:predefined.slug}}});
    assert.equal(protectedUpdate.statusCode,403);
    const protectedDelete=await app.inject({method:'DELETE',url:'/crafts/'+predefined.id,
      payload:{expectedVersion:predefined.version}});
    assert.equal(protectedDelete.statusCode,403);
    const cloned=await app.inject({method:'POST',url:'/crafts/'+predefined.id+'/clone'});
    assert.equal(cloned.statusCode,201,cloned.body);
    const personal=cloned.json() as Craft;
    assert.equal(personal.scope,'personal');
    assert.equal(personal.sourceCraftId,predefined.id);
    assert.notEqual(personal.id,predefined.id);
    const revised={...personal,description:personal.description+' Revised privately.'};
    const updated=await app.inject({method:'PUT',url:'/crafts/'+personal.id,
      payload:{expectedVersion:personal.version,craft:revised}});
    assert.equal(updated.statusCode,200,updated.body);
    const now=(updated.json() as Craft);
    assert.equal(now.version,2);
    assert.equal((await app.inject('/crafts/'+predefined.id+'/mdx')).body,originalMdx);
    const source=await app.inject('/crafts/'+now.id+'/mdx');
    assert.equal(source.statusCode,200);
    assert.match(source.body,/Revised privately/);
    const fromSource=await app.inject({method:'PUT',url:'/crafts/'+now.id,
      payload:{expectedVersion:now.version,mdx:source.body.replace('**Next:** [evidence](#step-evidence)','**Next:** End')}});
    assert.equal(fromSource.statusCode,200,fromSource.body);
    const stale=await app.inject({method:'PUT',url:'/crafts/'+now.id,
      payload:{expectedVersion:1,craft:revised}});
    assert.equal(stale.statusCode,409);
    const zip=entries(craftArchive(personal));
    assert(zip.has(personal.slug+'/SKILL.md'));
    assert(zip.has(personal.slug+'/SKILL.mdx'));
    assert(zip.get(personal.slug+'/SKILL.mdx')?.includes('<CraftNode'));
    const second=buildApp();
    try {
      await second.ready();
      const stored=await second.inject('/crafts/'+personal.id);
      assert.equal(stored.statusCode,200,stored.body);
      assert.equal(stored.json().version,3);
    } finally {await second.close();}
    assert.equal((await app.inject('/skills')).statusCode,404);
    assert.equal((await app.inject({method:'DELETE',url:'/crafts/'+now.id,
      payload:{expectedVersion:3}})).statusCode,200);
    assert.equal((await app.inject('/crafts/'+now.id)).statusCode,404);
  }finally{await app.close();}
});

test('MDX graph conversion rejects malformed input and preserves portable archive',()=>{
  const mdx=toMdx({...request,id:'example',version:1,updatedAt:''});
  assert.equal(parseMdx(mdx).steps.length,3);
  const old=mdx.replaceAll('<CraftNode','<SkillNode');
  assert.deepEqual(parseMdx(old).links,parseMdx(mdx).links);
  assert.throws(()=>parseMdx(mdx.replace('name: '+request.slug,'name: ../../escape')),/frontmatter/);
  assert.throws(()=>parseMdx(mdx.replace('Review source facts.','## Step: fake | Fake')),/Invalid MDX/);
  assert.throws(()=>toMdx({...request,links:[{id:'research-to-draft',source:'research',target:'draft'},
    {id:'draft-to-research',source:'draft',target:'research'}]}),/cycle/);
});

test('tenant identities isolate personal crafts but expose the same read-only defaults',async()=>{
  const a=await createDocumentStore({DB_FILE_NAME:databaseFile},randomUUID());
  const b=await createDocumentStore({DB_FILE_NAME:databaseFile},randomUUID());
  const one=new CraftLibrary(join(root,'missing-one.json'));
  const two=new CraftLibrary(join(root,'missing-two.json'));
  one.setDocuments(a);two.setDocuments(b);
  try{
    await one.initialize();await two.initialize();
    const first=await one.create(request);
    assert.equal((await one.get(first.id))?.name,request.name);
    assert.equal(await two.get(first.id),undefined);
    const copies=await two.list();
    assert.equal(copies.filter(c=>c.scope==='default').length,21);
    assert.equal(copies.filter(c=>c.scope==='personal').length,0);
    const baseA=await one.get('default-personal-brand-positioning');
    const baseB=await two.get('default-personal-brand-positioning');
    assert.equal(toMdx(baseA!),toMdx(baseB!));
    const clone=await one.clone('default-personal-brand-positioning');
    assert.equal(clone.scope,'personal');
    assert.equal(await two.get(clone.id),undefined);
    await assert.rejects(()=>two.update(first.id,request,1),/not found/);
    await assert.rejects(()=>one.remove('default-personal-brand-positioning',baseA!.version),/read-only/);
  }finally{await a.close();await b.close();}
});

test('legacy JSON migrates once as private crafts without replacing predefined copies',async()=>{
  const owner=randomUUID();
  const store=await createDocumentStore({DB_FILE_NAME:databaseFile},owner);
  const path=join(root,'previous-library.json');
  const baseline={...request,id:randomUUID(),version:4,updatedAt:new Date().toISOString()};
  const modified={...baseline,slug:'content-series-planning',name:'My changed default'};
  await writeFile(path,JSON.stringify([baseline,modified]));
  const library=new CraftLibrary(path);library.setDocuments(store);
  try{
    await library.initialize();
    const initial=await library.list();
    assert(initial.some(c=>c.slug===baseline.slug&&c.scope==='personal'));
    assert(initial.some(c=>c.slug==='content-series-planning-imported'&&c.scope==='personal'));
    assert(initial.some(c=>c.slug==='content-series-planning'&&c.scope==='default'));
    const count=initial.length;
    await library.initialize();
    assert.equal((await library.list()).length,count);
    assert.equal((await store.get<{result:string}>('craft-migrations','legacy-json-v1'))?.value?.result,'imported');
  }finally{await store.close();}
});

test('releasing a new default MDX revision does not alter personal clones',async()=>{
  const originals=['personal-brand-positioning','portfolio-proofing','job-search-research',
    'application-tailoring','content-series-planning','thoughtful-social-engagement',
    ...growthCapabilities.map(capability=>'growth-'+capability.id)];
  const dir=join(root,'default-update');
  await mkdir(dir,{recursive:true});
  for(const slug of originals) {
    const original=await readFile(resolve(process.cwd(),'crafts','default',slug+'.mdx'),'utf8');
    await writeFile(join(dir,slug+'.mdx'),original);
  }
  const store=await createDocumentStore({DB_FILE_NAME:databaseFile},randomUUID());
  const library=new CraftLibrary(join(root,'no-legacy-update.json'),dir);
  library.setDocuments(store);
  try {
    await library.initialize();
    const before=await library.get('default-content-series-planning');
    const clone=await library.clone(before!.id);
    const userVersion=toMdx(clone);
    const existingDefault=await readFile(join(dir,'content-series-planning.mdx'),'utf8');
    const updatedDefault=existingDefault.replace(
      'Use when designing a source-backed series of professional LinkedIn posts',
      'Use when planning a source-backed series of professional LinkedIn posts');
    assert.notEqual(updatedDefault,existingDefault,'Revision fixture must actually change default MDX');
    await writeFile(join(dir,'content-series-planning.mdx'),updatedDefault);
    await library.initialize();
    const after=await library.get(before!.id);
    assert.equal(after!.version,before!.version+1);
    assert.notEqual(toMdx(after!),toMdx(before!));
    assert.equal(toMdx((await library.get(clone.id))!),userVersion);
  }finally{await store.close();}
});
