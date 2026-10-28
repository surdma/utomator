import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
process.env.NODE_ENV = 'test';
const { buildApp } = await import('../src/main.js');
import { parseMdx, toMdx, skillArchive, type SkillProject } from '../src/skills/library.js';

function entries(archive: Buffer): Map<string, string> {
  const files=new Map<string,string>();
  let i=0;
  while (i+30<=archive.length&&archive.readUInt32LE(i)===0x04034b50) {
    const size=archive.readUInt32LE(i+18);
    const nameLength=archive.readUInt16LE(i+26);
    const extraLength=archive.readUInt16LE(i+28);
    const name=archive.subarray(i+30,i+30+nameLength).toString('utf8');
    const start=i+30+nameLength+extraLength;
    files.set(name,archive.subarray(start,start+size).toString('utf8'));
    i=start+size;
  }
  assert.equal(archive.readUInt32LE(i),0x02014b50,'ZIP central directory exists');
  return files;
}
test('Agent skills create, rewire, roundtrip MDX and export portable ZIP',async()=>{
  const app=buildApp();
  await app.ready();
  const seed=(await app.inject('/skills')).json() as SkillProject[];
  assert.equal(seed.length>=6,true);
  assert(seed.some(s=>s.category==='job-hunt'));
  assert(seed.some(s=>s.category==='engagement'));
  const pick=seed.find(s=>s.slug==='content-series-planning')!;
  const source=toMdx(pick);
  assert.deepEqual(parseMdx(source,pick).links,pick.links);
  const zip=entries(skillArchive(pick));
  assert.equal(zip.has(pick.slug+'/SKILL.md'),true);
  assert.equal(zip.has(pick.slug+'/SKILL.mdx'),true);
  assert.equal(zip.has(pick.slug+'/graph.json'),true);
  assert(zip.get(pick.slug+'/SKILL.md')?.includes('name: content-series-planning'));
  assert(!zip.get(pick.slug+'/SKILL.md')?.includes('<SkillNode'));
  const slug='skills-test-'+randomUUID().slice(0,8);
  const request={
    slug,name:'Skills integration test',
    description:'Builds verified social content. Use when the owner requests a content experiment.',
    category:'content',enabled:true,
    steps:[
      {id:'research',kind:'research',title:'Find sources',body:'Check the original portfolio.',position:{x:20,y:40}},
      {id:'draft',kind:'draft',title:'Draft carefully',body:'Use attributable sources.',position:{x:350,y:40}},
      {id:'review',kind:'review',title:'Review impact',body:'Ask the owner to approve.',position:{x:700,y:40}},
    ],
    links:[{id:'research-to-draft',source:'research',target:'draft'},
      {id:'draft-to-review',source:'draft',target:'review'}],
  };
  try{
    const created=await app.inject({method:'POST',url:'/skills',payload:request});
    assert.equal(created.statusCode,201,created.body);
    const skill=created.json() as SkillProject;
    const first=await app.inject('/skills/'+skill.id+'/mdx');
    assert.equal(first.statusCode,200);
    assert.match(first.body,/Next:\*\* \[draft\]/);
    const changed={...request,links:[{id:'research-to-review',source:'research',target:'review'}]};
    const rewired=await app.inject({method:'PUT',url:'/skills/'+skill.id,payload:{expectedVersion:skill.version,skill:changed}});
    assert.equal(rewired.statusCode,200,rewired.body);
    const saved=rewired.json() as SkillProject;
    assert.equal(saved.version,2);
    assert.deepEqual(saved.links,changed.links);
    const mdx=await app.inject('/skills/'+skill.id+'/mdx');
    assert.match(mdx.body,/Next:\*\* \[review\]/);
    assert.doesNotMatch(mdx.body,/Next:\*\* \[draft\]/);
    const restored=mdx.body.replace('**Next:** [review](#step-review)','**Next:** [draft](#step-draft)');
    const fromSource=await app.inject({method:'PUT',url:'/skills/'+skill.id,payload:{expectedVersion:2,mdx:restored}});
    assert.equal(fromSource.statusCode,200,fromSource.body);
    assert.deepEqual((fromSource.json() as SkillProject).links,[{id:'research-to-draft',source:'research',target:'draft'}]);
    const stale=await app.inject({method:'PUT',url:'/skills/'+skill.id,payload:{expectedVersion:1,skill:request}});
    assert.equal(stale.statusCode,409);
    const wrong=await app.inject({method:'PUT',url:'/skills/'+skill.id,payload:{expectedVersion:3,
      skill:{...request,links:[{id:'research-to-draft',source:'research',target:'draft'},
        {id:'draft-to-research',source:'draft',target:'research'}]}}});
    assert.equal(wrong.statusCode,400);
    const unknown=await app.inject({method:'PUT',url:'/skills/'+skill.id,payload:{expectedVersion:3,
      skill:{...request,links:[{id:'research-to-missing',source:'research',target:'missing'}]}}});
    assert.equal(unknown.statusCode,400);
    const exportResponse=await app.inject('/skills/'+skill.id+'/export?format=skill');
    assert.equal(exportResponse.statusCode,200);
    assert.match(String(exportResponse.headers['content-type']),/application\/zip/);
    assert.equal(exportResponse.rawPayload.subarray(0,4).toString('hex'),'504b0304');
    const savedZip=entries(exportResponse.rawPayload);
    assert(savedZip.get(slug+'/SKILL.mdx')?.includes('research'));
    const normalZip=await app.inject('/skills/'+skill.id+'/export?format=zip');
    assert.equal(normalZip.statusCode,200);
    const fresh=buildApp();
    try{await fresh.ready();const record=await fresh.inject('/skills/'+skill.id);
      assert.equal(record.statusCode,200);
      assert.equal(record.json().version,3);
    }finally{await fresh.close();}
    const duplicate=await app.inject({method:'POST',url:'/skills',payload:request});
    assert.equal(duplicate.statusCode,400);
    const deleted=await app.inject({method:'DELETE',url:'/skills/'+skill.id,payload:{expectedVersion:3}});
    assert.equal(deleted.statusCode,200,deleted.body);
    assert.equal((await app.inject('/skills/'+skill.id)).statusCode,404);
  }finally{await app.close();}
});
test('MDX import rejects unsafe names, unbounded contents, cycles, unsupported categories and malicious metadata',()=>{
  const base:SkillProject={
    id:'fixture',slug:'social-review',
    name:'Social review',description:'Reviews a profile. Use when checking social content.',
    category:'presence',enabled:true,version:1,updatedAt:'',
    steps:[{id:'first',kind:'brief',title:'Start',body:'Check facts.',position:{x:10,y:10}}],
    links:[],
  };
  const mdx=toMdx(base);
  assert.equal(parseMdx(mdx).steps.length,1);
  assert.throws(()=>parseMdx(mdx.replace('name: social-review','name: ../../bad')),/frontmatter/);
  assert.throws(()=>parseMdx(mdx.replace('Check facts.','## Step: injected | Injected')),/Invalid MDX/);
  assert.throws(()=>toMdx({...base,description:'Use when <danger> is requested.'}),/Skill requires/);
  assert.throws(()=>toMdx({...base,category:'unrelated' as SkillProject['category']}),/Skill requires/);
});
