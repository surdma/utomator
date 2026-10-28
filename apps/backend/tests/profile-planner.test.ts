import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ProfilePlanner, planningManifest } from '../src/core/profile-planner.js';
import { isApprovalFor, isEvidenceRecord } from '../src/core/evidence-approval.js';
import { loadIdentityTimeline } from '../src/profile/timeline.js';
import type { CareerDocument } from '../src/profile/career-store.js';
// main.ts also supports direct server startup. Set test mode before importing it,
// otherwise a stray Fastify listener keeps the unit-test worker running forever.
process.env.NODE_ENV = 'test';
const { buildApp } = await import('../src/main.js');

const career:CareerDocument={name:'Alice Example',headline:'Engineering leader',location:'Remote',
  summary:'Built systems with measured outcomes.',contacts:[],education:[],skills:[],customSections:[],
  experience:[{company:'Example Co',role:'Engineer',period:'2022 to 2024',location:'Remote',
    bullets:['Improved platform availability.']}],
  projects:[{title:'Platform migration',outcome:'Improved reliability.'}]};
const alice='11111111-1111-4111-8111-111111111111';
const bob='22222222-2222-4222-8222-222222222222';
const input={accountId:alice,profileUrl:'https://www.linkedin.com/in/alice-example/',career,careerRevision:1};
test('six YAML planning stages have a stable allowlisted order and typed handoffs',()=>{
  const manifest=planningManifest();
  assert.match(manifest.manifest,/kind: "ProfilePlanningWorkflow"/);
  const stages=['context','assessment','proposals','approval','selection','report'] as const;
  assert.deepEqual(Object.keys(manifest.steps),stages);
  for(let i=0;i<stages.length;i++){
    const yaml=manifest.steps[stages[i]]!;
    assert.match(yaml,/providerMutation: false/);
    assert.match(yaml,/operation: "/);
    assert.match(yaml,new RegExp('sourceStep: '+(i?'"'+stages[i-1]+'"':'null')));
  }
});

test('full-profile planning uses real owner sources, enforces approval and keeps reports read-only',async()=>{
  const root=await mkdtemp(join(tmpdir(),'utomator-profile-planner-'));
  try{
    const planner=new ProfilePlanner(root,loadIdentityTimeline);
    const start=await planner.start(input);
    assert.equal(start.state,'approval-needed');
    assert.deepEqual(start.stages.map(step=>step.id),
      ['context','assessment','proposals','approval','selection','report']);
    assert(start.proposals.length>=3,'career data supplies proposals');
    assert(start.proposals.every(proposal=>proposal.source.startsWith('utomator:career.profile.')));
    assert.equal(start.accountId,alice);
    assert.equal(start.source,'account-career');
    assert(start.proposals.every(proposal=>proposal.status==='draft-for-review'));
    assert.equal(start.report,undefined);
    const evidence=(start.stages[0]?.output as {evidenceRef?:unknown}|undefined)?.evidenceRef;
    assert(isEvidenceRecord(evidence),'planning source evidence must be a verified typed reference');
    assert.equal(evidence.sourceSchema,'owner-evidence/v1');
    assert.match(start.profileUrl,/linkedin\.com\/in\//);
    assert.equal(start.stages[1]?.output && typeof start.stages[1].output,'object');
    assert.match(await readFile(join(root,'steps',start.id,'approval.yaml'),'utf8'),/request-owner-approval/);
    await assert.rejects(planner.select(start.id,['headline']),/requires explicit prior approval/);
    const approved=await planner.decide(start.id,true);
    assert.equal(approved.state,'selection-needed');
    assert(isApprovalFor(approved.stages[3]?.output,evidence),
      'the approval decision must reference the exact source evidence digest');
    await assert.rejects(planner.decide(start.id,true),/already resolved/);
    await assert.rejects(planner.select(start.id,['unknown']),/Unknown proposal ID/);
    const selected=await new ProfilePlanner(root,loadIdentityTimeline)
      .select(start.id,[start.proposals[0]!.id]);
    assert.equal(selected.state,'completed');
    assert.equal(selected.report?.websiteActionsExecuted,false);
    assert.equal(selected.report?.modelConnected,false);
    assert.equal(selected.report?.planningOnly,true);
    assert.equal(selected.report?.proposedChanges.length,1);
    assert.match(selected.report?.notice??'',/does not verify LinkedIn edits/);
    assert.equal((await new ProfilePlanner(root).get(start.id))?.report?.approvedIds.length,1);
    await assert.rejects(planner.select(start.id,[start.proposals[0]!.id]),/requires explicit prior approval/);
    const denied=await planner.start(input);
    const declined=await planner.decide(denied.id,false);
    assert.equal(declined.state,'declined');
    assert.equal(declined.report,undefined);
    await assert.rejects(planner.select(denied.id,[denied.proposals[0]!.id]),/requires explicit prior approval/);
    await assert.rejects(planner.get('../escape'),/Invalid optimization run ID/);
  }finally{await rm(root,{recursive:true,force:true});}
});

test('Fastify refuses portfolio planning without a verified selected account',async()=>{
  const app=buildApp();
  try {
    await app.ready();
    assert.equal((await app.inject({method:'POST',url:'/profile-plans',payload:{}})).statusCode,400);
    const result=await app.inject({method:'POST',url:'/profile-plans',payload:{
      accountId:'00000000-0000-4000-8000-000000009999',
    }});
    assert.equal(result.statusCode,422);
    assert.match(result.json().error,/not found|not verified/i);
  } finally {await app.close();}
});

test('planning report refuses an approval whose persisted evidence digest no longer matches owner facts',async()=>{
  const root=await mkdtemp(join(tmpdir(),'utomator-planning-integrity-'));
  try{
    const planner=new ProfilePlanner(root,loadIdentityTimeline);
    const start=await planner.start(input);
    await planner.decide(start.id,true);
    const path=join(root,start.id+'.json');
    const stored=JSON.parse(await readFile(path,'utf8')) as {
      stages:Array<{output?:{evidenceRef?:{digest?:string}}}>};
    const source=stored.stages[0]!.output!.evidenceRef!;
    source.digest='0'.repeat(64);
    await writeFile(path,JSON.stringify(stored));
    await assert.rejects(planner.select(start.id,[start.proposals[0]!.id]),
      /evidence reference does not match owner facts/);
  }finally{await rm(root,{recursive:true,force:true});}
});

test('planning different selected accounts does not reuse a fixed LinkedIn handle',async()=>{
  const root=await mkdtemp(join(tmpdir(),'utomator-planning-accounts-'));
  try {
    const planner=new ProfilePlanner(root,loadIdentityTimeline);
    const first=await planner.start(input);
    const second=await planner.start({...input,accountId:bob,
      profileUrl:'https://www.linkedin.com/in/bob-example/',
      career:{...career,name:'Bob Example',headline:'Chemistry teacher',summary:'Teaching chemistry.'}});
    assert.equal(first.profileUrl,'https://www.linkedin.com/in/alice-example/');
    assert.equal(second.profileUrl,'https://www.linkedin.com/in/bob-example/');
    assert.equal(second.proposals.find(p=>p.id==='headline')?.proposed,'Chemistry teacher');
    await planner.decide(first.id,true);
    const path=join(root,first.id+'.json');
    const stored=JSON.parse(await readFile(path,'utf8')) as {accountId?:string};
    stored.accountId=bob;await writeFile(path,JSON.stringify(stored));
    await assert.rejects(planner.select(first.id,['headline']),/another social account/);
  }finally{await rm(root,{recursive:true,force:true});}
});
