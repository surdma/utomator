import assert from 'node:assert/strict';
import { test } from 'node:test';
// Set the test environment before loading the Fastify app, matching other route tests.
process.env.NODE_ENV = 'test';
const { buildApp } = await import('../src/main.js');
import { compileGrowthProfileYaml, readGrowthProfileWorkflow } from '../src/engine/growth-profile.js';

test('Profile YAML retains nine requirements, twenty evidence targets and compiled registered actions', async () => {
  const { program } = await readGrowthProfileWorkflow();
  assert.equal(program.id, 'linkedin-profile');
  assert.equal(program.requirements.length, 9);
  assert.equal(program.coverage.length, 20);
  assert.equal(program.pipelines.length, 9);
  assert(program.coverage.every(item => item.status === 'requires-independent-evidence'));
  assert(program.pipelines.every(item => item.source === 'registered-workflow-plan' &&
    item.requiresConnectedAccount && item.stepCount >= 4));
});
test('Unknown operations, duplicated evidence targets and unknown YAML keys fail closed', async () => {
  const { yaml } = await readGrowthProfileWorkflow();
  assert.throws(() => compileGrowthProfileYaml(yaml.replace('"add-featured"', '"delete-post"')),
    /missing, duplicated or unregistered/);
  assert.throws(() => compileGrowthProfileYaml(yaml.replace('"Profile verification"', '"Profile photo"')),
    /missing, duplicated or unregistered/);
  assert.throws(() => compileGrowthProfileYaml(yaml.replace('  objective:', '  unsupported: "yes"\n  objective:')),
    /Invalid Growth profile YAML spec/);
  assert.throws(() => compileGrowthProfileYaml(yaml + '\nspec:\n'), /Duplicate YAML key/);
});
test('Read-only YAML and compiled program endpoints do not create a run', async () => {
  const app = buildApp();
  try {
    await app.ready();
    const before = await app.inject('/runs');
    const profile = await app.inject('/growth/workflows/profile');
    assert.equal(profile.statusCode, 200, profile.body);
    assert.equal(profile.json().coverage.length, 20);
    assert.equal(profile.json().requirements.length, 9);
    const source = await app.inject('/growth/workflows/profile/yaml');
    assert.equal(source.statusCode, 200, source.body);
    assert.match(source.body, /kind: "GrowthProfileWorkflow"/);
    assert.equal(source.headers['cache-control'], 'private, no-store');
    assert.equal((await app.inject('/runs')).body, before.body);
  } finally {
    await app.close();
  }
});

import type { Runner } from '../src/core/runner.js';
import type { RunRequest, RunSummary } from '../src/core/types.js';
import { randomUUID } from 'node:crypto';
import { validateRun } from '../src/core/validate.js';
import { compileWorkflow } from '../src/core/workflow-yaml.js';
import { ProfileGrowthCoordinator } from '../src/engine/profile-growth-coordinator.js';

test('six dependent pipelines reuse validated Runner WorkflowPlans and record independent missing coverage',async()=>{
  const runs=new Map<string,{summary:RunSummary;input:RunRequest}>();
  const actions:string[]=[];
  const stub={
    start(input:RunRequest){
      validateRun(input);
      assert(input.workflow,'each stage must use the existing WorkflowPlan compiler');
      compileWorkflow(input.workflow);
      actions.push(input.action);
      const summary:RunSummary={id:randomUUID(),platform:input.platform,action:input.action,
        state:'completed',createdAt:new Date().toISOString()};
      runs.set(summary.id,{summary,input});
      return summary;
    },
    get(id:string){return runs.get(id)?.summary;},
    stepOutput(id:string,stageId:string){
      const run=runs.get(id);
      if(!run)return null;
      assert.equal(stageId,run.input.action==='audit-page'?'sectionEvidence':'baseline');
      return {schema:'evidence/v1',url:run.input.pageUrl??run.input.profileUrl,
        digest:'a'.repeat(64)};
    },
    cancel(){return true;},
  } as unknown as Runner;
  const coordinator=new ProfileGrowthCoordinator(stub);
  const accountId='c63e8078-644d-4a2a-80bd-7cba9eaa0e1b';
  const profile='https://www.linkedin.com/in/verified-owner/';
  const started=await coordinator.start(accountId,profile);
  assert.equal(started.stages.length,6);
  assert.equal(started.coverage.length,20);
  assert.equal(started.counts.missing,20);
  assert.equal(started.canAdvance,true);
  await assert.rejects(coordinator.supplyEvidence(started.id,{sectionId:'headline',text:'Not in the active identity stage'}),/current stage/);
  const afterEvidence=await coordinator.supplyEvidence(started.id,{sectionId:'profilePhoto',
    text:'Owner reports a current professional photograph.'});
  assert.equal(afterEvidence.counts.ownerSupplied,1);
  assert.equal(afterEvidence.coverage.find(item=>item.id==='profilePhoto')?.status,
    'owner-supplied-unverified');
  let stage=afterEvidence;
  for(let step=0;step<6;step++){
    stage=await coordinator.advance(started.id);
    if(step<5)assert.equal(stage.activeIndex,step+1);
  }
  assert.deepEqual(actions,['audit','audit','audit-page','audit-page','audit','audit']);
  assert.equal(runs.size,6);
  assert.equal([...runs.values()].filter(r=>r.input.pageUrl).length,2);
  assert.equal(stage.status,'completed-with-gaps');
  assert.equal(stage.counts.missing,19);
  assert.equal(stage.counts.independentlyProviderVerified,0);
  await assert.rejects(coordinator.advance(started.id),/finalized/);
});

test('unverified Growth run cannot advance, and no valid account means no browser launch',async()=>{
  let starts=0;
  const runner={
    start(input:RunRequest){
      starts++;
      return {id:randomUUID(),platform:'linkedin',action:input.action,
        createdAt:new Date().toISOString(),state:'running'} as RunSummary;
    },
    get(){return {state:'running'};},
    stepOutput(){return null;},
    cancel(){return true;},
  } as unknown as Runner;
  const coordinator=new ProfileGrowthCoordinator(runner);
  await assert.rejects(coordinator.start('bad-identity','https://www.linkedin.com/in/owner/'),/Verified LinkedIn account ID/);
  assert.equal(starts,0);
  const result=await coordinator.start('c63e8078-644d-4a2a-80bd-7cba9eaa0e1b',
    'https://www.linkedin.com/in/verified-owner/');
  await assert.rejects(coordinator.advance(result.id),/not completed/);
  assert.equal(starts,1);
});

test('Growth composite API requires a genuine linked account, not arbitrary profile input',async()=>{
  const app=buildApp();
  try{
    await app.ready();
    const initial=await app.inject({method:'GET',url:'/growth/workflows/profile/runs'});
    assert.equal(initial.statusCode,200,initial.body);
    const start=await app.inject({method:'POST',url:'/growth/workflows/profile/runs',
      payload:{accountId:'c63e8078-644d-4a2a-80bd-7cba9eaa0e1b'}});
    assert.equal(start.statusCode,400,start.body);
    assert.equal((await app.inject('/growth/workflows/profile/runs')).json().length,0);
    assert.equal((await app.inject('/growth/workflows/profile/runs/'+randomUUID())).statusCode,404);
  }finally{await app.close();}
});
