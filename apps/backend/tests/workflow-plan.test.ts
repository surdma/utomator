import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {AccountStore} from '../src/profile/account-store.js';
import { defaultPlan, templates, validatePlan } from '../src/core/workflow-plan.js';
import { WorkflowPlanStore } from '../src/core/workflow-store.js';
import { WorkflowRegistry } from '../src/core/workflow-registry.js';
import { RunArchive } from '../src/core/run-archive.js';
import { compileWorkflow } from '../src/core/workflow-yaml.js';
import {parseStepDefinition,StepDefinitionStore} from '../src/core/step-definitions.js';
import {loadStepForms,parseStepForms} from '../src/core/step-forms.js';
import {randomUUID} from 'node:crypto';
// Set test mode before dynamically importing the Fastify entry point.
// Static ESM imports execute before assignments and would start a stray listener.
process.env.NODE_ENV = 'test';
const { buildApp } = await import('../src/main.js');
import { BrowserSession } from '../src/browser/session.js';

test('YAML step forms expose only known, bounded editable fields',async()=>{
  const forms=await loadStepForms();
  assert.equal(forms.delay.fields[0]?.key,'delayMs');
  assert.equal(forms.delay.fields[0]?.max,30000);
  assert.equal(forms.note.fields[0]?.control,'textarea');
  assert.equal(forms.action.fields.length,0);
  const responseApp=buildApp();
  try{
    await responseApp.ready();
    const response=await responseApp.inject({method:'GET',url:'/step-forms'});
    assert.equal(response.statusCode,200,response.body);
    const data=response.json() as typeof forms;
    assert.equal(data.note.fields[0]?.label,'Journal message');
  }finally{await responseApp.close();}
  assert.throws(()=>parseStepForms('kind: "StepForms"\nforms:\n  start: "invalid"'),/Unknown step form document/);
});

test('template generators expose only executable actions for each platform', () => {
  const x = templates('x');
  const linkedIn = templates('linkedin');
  assert(x.some(plan => plan.action === 'compose-post'));
  assert(x.some(plan => plan.action === 'delete-post'));
  assert(!linkedIn.some(plan => plan.action === 'compose-post'));
  assert(linkedIn.some(plan => plan.action === 'add-project'));
  for (const plan of [...x,...linkedIn]) {
    const verified=validatePlan(plan,plan.platform,plan.action);
    assert.equal(verified.steps.length,plan.steps.length);
    assert.equal(verified.links.length,plan.steps.length-1);
  }
});

test('plan validates real reordered optional steps and rejects unsafe links', () => {
  const plan=defaultPlan('x','audit');
  const note={id:'note-1',kind:'note' as const,title:'Record observation',message:'Review target heading'};
  const order=[...plan.steps];
  order.splice(3,0,note);
  const draft={...plan,steps:order,links:order.slice(1).map((step,i)=>({
    source:order[i]!.id,target:step.id,
  }))};
  assert.equal(validatePlan(draft,'x','audit').steps[3]?.id,'note-1');
  const missing={...draft,steps:draft.steps.filter(s=>s.id!=='session')};
  assert.throws(()=>validatePlan(missing,'x','audit'),/connected|Required/);
  const duplicate={...draft,links:[...draft.links.slice(0,-1),draft.links[0]!]};
  assert.throws(()=>validatePlan(duplicate,'x','audit'),/Branching|connected/);
  const foreign={...draft,platform:'linkedin' as const};
  assert.throws(()=>validatePlan(foreign,'x','audit'),/identity/);
  const overflow={...draft,steps:draft.steps.map(s=>s.id==='note-1'?{...s,message:'x'.repeat(601)}:s)};
  assert.throws(()=>validatePlan(overflow,'x','audit'),/Invalid workflow step/);
  const unsafe={...draft,steps:draft.steps.map(s=>s.id==='note-1'?{...s,kind:'script' as 'note'}:s)};
  assert.throws(()=>validatePlan(unsafe,'x','audit'),/Invalid workflow step/);
});

test('each validated node compiles to a deterministic, allowlisted YAML instruction', () => {
  const plan=defaultPlan('linkedin','edit-profile');
  const step=plan.steps.find(item=>item.id==='inspect')!;
  step.message='Observe: true\n  operation: malicious-command';
  const compiled=compileWorkflow(plan);
  assert.equal(compiled.steps.length,6);
  assert.equal(compiled.steps[3]?.document.spec.operation,'execute-approved-action');
  assert.equal(compiled.steps[3]?.document.spec.policy.humanApproval,'enforced-by-provider-handler');
  assert.equal(compiled.steps[2]?.document.spec.outputs.schema,'page-observation/v1');
  assert.match(compiled.yaml,/kind: "SocialWorkflow"/);
  assert.match(compiled.steps[2]?.yaml??'',/kind: "SocialStep"/);
  assert.match(compiled.steps[2]?.yaml??'',/message: /);
  assert(!compiled.steps[2]?.yaml.includes('\n  operation: malicious-command\n'),
    'step comments must never become YAML instruction keys');
  assert.equal(compiled.steps[2]?.yaml,compileWorkflow(plan).steps[2]?.yaml,
    'YAML content and hash must be stable for a frozen workflow definition');
  assert.equal(compiled.steps[2]?.digest.length,64);
  assert(!compiled.yaml.includes('postText'),'manifest should not include private action input values');
  assert.throws(()=>compileWorkflow({...plan,steps:plan.steps.map(item=>item.id==='inspect'
    ?{...item,kind:'arbitrary-shell' as 'inspect'}:item)}),/Invalid workflow step/);
});

test('saved graphs, parameters and node positions survive reloading isolated workflow storage', async () => {
  const dir=await mkdtemp(join(tmpdir(),'utomator-plan-'));
  try{
    const store=new WorkflowPlanStore(dir);
    const plan=defaultPlan('x','audit');
    const changed={...plan,parameters:{bio:'reviewed-only'},
      steps:plan.steps.map(step=>step.id==='inspect'?{...step,title:'Inspect verified account',position:{x:670,y:210}}:step)};
    await store.save('x','audit',changed);
    const loaded=await new WorkflowPlanStore(dir).get('x','audit');
    assert.equal(loaded.parameters?.bio,'reviewed-only');
    assert.equal(loaded.steps.find(s=>s.id==='inspect')?.position?.x,670);
    assert.equal(loaded.steps.find(s=>s.id==='inspect')?.title,'Inspect verified account');
    const source=await readFile(join(dir,'x-audit.json'),'utf8');
    assert(source.includes('Inspect verified account'));
    assert.throws(()=>validatePlan({...changed,parameters:{secret:'password'}},'x','audit'),/parameters/);
  }finally{await rm(dir,{recursive:true,force:true});}
});

test('Fastify exposes generator and saved defaults; malformed graph never starts a browser run', async () => {
  const app=buildApp();
  try{
    await app.ready();
    const list=await app.inject('/workflow-templates/x');
    assert.equal(list.statusCode,200);
    assert(list.json().some((plan:{action:string})=>plan.action==='pin-post'));
    const unknown=await app.inject('/workflow-templates/invalid');
    assert.equal(unknown.statusCode,400);
    const plan=defaultPlan('x','audit');
    const yaml=await app.inject('/workflow-plans/x/audit/yaml');
    assert.equal(yaml.statusCode,200);
    assert.match(yaml.body,/kind: "SocialWorkflow"/);
    assert.equal(yaml.headers['cache-control'],'private, no-store');
    const stepYaml=await app.inject('/workflow-plans/x/audit/steps/action/yaml');
    assert.equal(stepYaml.statusCode,200);
    assert.match(stepYaml.body,/operation: "execute-approved-action"/);
    assert.equal((await app.inject('/workflow-plans/x/audit/steps/unknown/yaml')).statusCode,404);
    const beforeRuns=(await app.inject('/runs')).json().length;
    const bad={...plan,links:[...plan.links.slice(0,-1),{source:'start',target:'finish'}]};
    const response=await app.inject({method:'POST',url:'/runs',payload:{
      platform:'x',action:'audit',handle:'flow_test',workflow:bad,
    }});
    assert.equal(response.statusCode,400);
    assert.match(response.body,/Branching|connected/);
    assert.equal((await app.inject('/runs')).json().length,beforeRuns);
    assert.equal((await app.inject({method:'POST',url:'/runs/no-such-run/pause'})).statusCode,409);
    assert.equal((await app.inject({method:'POST',url:'/runs/no-such-run/resume'})).statusCode,409);
  }finally{await app.close();}
});

test('operator hold and stop nodes execute in the backend without clicking a website', async () => {
  const originalOpen=BrowserSession.prototype.open;
  const originalClose=BrowserSession.prototype.close;
  BrowserSession.prototype.open=async function () { return {} as Awaited<ReturnType<typeof originalOpen>>; };
  BrowserSession.prototype.close=async function () {};
  const app=buildApp();
  try{
    await app.ready();
    const base=defaultPlan('x','audit');
    const steps=[base.steps[0]!,base.steps[1]!,
      {id:'pause-before-action',kind:'pause' as const,title:'Operator breakpoint'},
      {id:'stop-before-action',kind:'stop' as const,title:'Quit safely'},
      ...base.steps.slice(2)];
    const plan={...base,steps,links:steps.slice(1).map((step,i)=>({
      source:steps[i]!.id,target:step.id,
    }))};
    const started=await app.inject({method:'POST',url:'/runs',payload:{
      platform:'x',action:'audit',handle:'flow_test',workflow:plan,
    }});
    assert.equal(started.statusCode,202,started.body);
    const id=started.json().id as string;
    let state='';
    for(let i=0;i<120;i++){
      const current=await app.inject('/runs/'+id);
      state=current.json().state;
      if(state==='paused')break;
      await new Promise(resolve=>setTimeout(resolve,20));
    }
    assert.equal(state,'paused','backend pauses at the actual operator breakpoint');
    const manifest=await app.inject('/runs/'+id+'/workflow.yaml');
    assert.equal(manifest.statusCode,200);
    assert.match(manifest.body,/document: "pause-before-action.yaml"/);
    const pausedYaml=await app.inject('/runs/'+id+'/steps/pause-before-action.yaml');
    assert.equal(pausedYaml.statusCode,200);
    assert.match(pausedYaml.body,/operation: "await-operator"/);
    const stoppedYaml=await app.inject('/runs/'+id+'/steps/stop-before-action.yaml');
    assert.equal(stoppedYaml.statusCode,200);
    assert.match(stoppedYaml.body,/operation: "end-run"/);
    const diskStep=await readFile(join(process.cwd(),'.runtime','runs',id,'stop-before-action.yaml'),'utf8');
    assert.equal(diskStep,stoppedYaml.body,'run YAML must exist as a separate on-disk step document');
    plan.steps[2]!.title='Changed after the run started';
    const snapshotAgain=await app.inject('/runs/'+id+'/steps/pause-before-action.yaml');
    assert.match(snapshotAgain.body,/Operator breakpoint/);
    assert(!snapshotAgain.body.includes('Changed after the run started'),
      'historic step instructions cannot be rewritten by the editable source plan');
    assert.equal((await app.inject('/runs/'+id+'/steps/bogus.yaml')).statusCode,404);
    const resumed=await app.inject({method:'POST',url:'/runs/'+id+'/resume'});
    assert.equal(resumed.statusCode,200,resumed.body);
    for(let i=0;i<120;i++){
      state=(await app.inject('/runs/'+id)).json().state;
      if(state==='cancelled'||state==='failed'||state==='completed')break;
      await new Promise(resolve=>setTimeout(resolve,20));
    }
    assert.equal(state,'cancelled','stop node terminates before the action');
    const log=await app.inject('/runs/'+id+'/logs');
    assert.equal(log.statusCode,200);
    assert.match(log.body,/Quit safely/);
    const entries=log.json() as Array<{details?:{stepId?:string;stage?:string}}>;
    assert(!entries.some(item=>item.details?.stepId==='action'&&item.details.stage==='started'),
      'the Playwright action handler must never execute after a stop node');
  }finally{
    await app.close();
    BrowserSession.prototype.open=originalOpen;
    BrowserSession.prototype.close=originalClose;
  }
});

test('unique workflows preserve independent same-action configurations and immutable revisions', async () => {
  const dir=await mkdtemp(join(tmpdir(),'utomator-workflows-'));
  try {
    const registry=new WorkflowRegistry(join(dir,'workflows'),join(dir,'legacy'));
    const left=await registry.create({...defaultPlan('x','compose-post'),name:'Series A'},'x-series');
    const right=await registry.create({...defaultPlan('x','compose-post'),name:'Series B'},'x-engagement');
    assert.notEqual(left.id,right.id);
    assert.equal((await registry.list()).length,2);
    assert.equal((await registry.get(right.id))?.plan.name,'Series B');
    const changed=await registry.update(left.id,1,{...left.plan,name:'Series A revision 2'});
    assert.equal(changed.revision,2);
    assert.equal((await registry.get(left.id,1))?.plan.name,'Series A');
    assert.equal((await registry.get(left.id,2))?.plan.name,'Series A revision 2');
    await assert.rejects(registry.update(left.id,1,left.plan),/Version conflict/);
    const restarted=new WorkflowRegistry(join(dir,'workflows'),join(dir,'legacy'));
    assert.equal((await restarted.get(left.id))?.plan.name,'Series A revision 2');
    assert.equal((await restarted.get(right.id))?.plan.name,'Series B');
    await assert.rejects(registry.get('../escape'),/Invalid workflow identifier/);
    await assert.rejects(registry.create(left.plan,'untrusted/path'),/template identifier/);
  } finally {await rm(dir,{recursive:true,force:true});}
});

test('legacy platform/action workflow files import only once without modifying the originals',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'utomator-workflow-migration-'));
  try{
    const {mkdir,writeFile}=await import('node:fs/promises');
    await mkdir(join(dir,'legacy'));
    const original={...defaultPlan('x','audit'),name:'Historical audit'};
    const bytes=JSON.stringify(original);
    await writeFile(join(dir,'legacy','x-audit.json'),bytes);
    const registry=new WorkflowRegistry(join(dir,'workflows'),join(dir,'legacy'));
    const first=await registry.list();
    assert.equal(first.length,1);
    assert.equal(first[0]?.plan.name,'Historical audit');
    assert.equal((await new WorkflowRegistry(join(dir,'workflows'),join(dir,'legacy')).list()).length,1);
    assert.equal(await readFile(join(dir,'legacy','x-audit.json'),'utf8'),bytes);
  }finally{await rm(dir,{recursive:true,force:true});}
});

test('revisioned workflow API creates separate records, rejects stale writes and runs saved definitions',async()=>{
  const app=buildApp();
  const ids:string[]=[];
  try{
    await app.ready();
    const plan=defaultPlan('x','audit');
    const create=async(name:string)=>{
      const response=await app.inject({method:'POST',url:'/workflows',payload:{
        templateId:'x-profile',plan:{...plan,name},
      }});
      assert.equal(response.statusCode,201,response.body);
      const record=response.json() as {id:string;revision:number};
      ids.push(record.id);return record;
    };
    const a=await create('Audit A'), b=await create('Audit B');
    assert.notEqual(a.id,b.id);
    assert.equal((await app.inject('/workflows/'+a.id)).json().plan.name,'Audit A');
    assert.equal((await app.inject('/workflows/'+b.id)).json().plan.name,'Audit B');
    const yaml=await app.inject('/workflows/'+a.id+'/yaml');
    assert.equal(yaml.statusCode,200);
    assert.match(yaml.body,/kind: "SocialWorkflow"/);
    const update=await app.inject({method:'PUT',url:'/workflows/'+a.id,payload:{
      expectedRevision:1,plan:{...plan,name:'Audit A edited'},
    }});
    assert.equal(update.statusCode,200,update.body);
    assert.equal(update.json().revision,2);
    assert.equal((await app.inject('/workflows/'+a.id+'/revisions/1')).json().plan.name,'Audit A');
    const stale=await app.inject({method:'PUT',url:'/workflows/'+a.id,payload:{
      expectedRevision:1,plan,
    }});
    assert.equal(stale.statusCode,409);
    const invalid=await app.inject({method:'POST',url:'/runs',payload:{
      platform:'linkedin',action:'audit',handle:'flow_test',workflowId:a.id,workflowRevision:1,
    }});
    assert.equal(invalid.statusCode,400,'saved workflow cannot execute against a different platform');
    const missing=await app.inject({method:'POST',url:'/runs',payload:{
      platform:'x',action:'audit',handle:'flow_test',workflowId:a.id,workflowRevision:999,
    }});
    assert.equal(missing.statusCode,404);
  }finally{
    await app.close();
    for(const id of ids){
      await rm(join(process.cwd(),'.runtime','workflows',id+'.json'),{force:true});
      await rm(join(process.cwd(),'.runtime','workflows','revisions',id),{recursive:true,force:true});
    }
  }
});

test('typed note binding compiles from a preceding browser observation and rejects invalid references', () => {
  const initial=defaultPlan('x','audit');
  const note={id:'note-observation',kind:'note' as const,title:'Record observed URL',
    inputBindings:{message:{stepId:'inspect',field:'url' as const}}};
  const steps=[...initial.steps.slice(0,3),note,...initial.steps.slice(3)];
  const plan={...initial,steps,links:steps.slice(1).map((step,i)=>({
    source:steps[i]!.id,target:step.id,
  }))};
  const compiled=compileWorkflow(plan);
  const result=compiled.steps.find(step=>step.source.id==='note-observation')!;
  assert.equal(result.document.spec.inputs.bindings?.message.stepId,'inspect');
  assert.equal(result.document.spec.inputs.bindings?.message.schema,'page-observation/v1');
  assert.match(result.yaml,/bindings:\n      message:\n        stepId: "inspect"/);
  const missing={...plan,steps:steps.map(step=>step.id===note.id
    ?{...step,inputBindings:{message:{stepId:'unknown',field:'url' as const}}}:step)};
  assert.throws(()=>compileWorkflow(missing),/earlier page observation/);
  const future={...plan,steps:steps.map(step=>step.id===note.id
    ?{...step,inputBindings:{message:{stepId:'verify',field:'excerpt' as const}}}:step)};
  assert.throws(()=>compileWorkflow(future),/earlier page observation/);
  const unsupported={...plan,steps:steps.map(step=>step.id==='action'
    ?{...step,inputBindings:{message:{stepId:'inspect',field:'url' as const}}}:step)};
  assert.throws(()=>compileWorkflow(unsupported),/Unsupported workflow input binding/);
});

test('a run binds live observed data to a later note and stores immutable typed step outputs',async()=>{
  const originalOpen=BrowserSession.prototype.open;
  const originalClose=BrowserSession.prototype.close;
  BrowserSession.prototype.open=async function(){
    return ({
      goto:async()=>undefined,url:()=> 'https://x.com/flow_test',
      locator:()=>({innerText:async()=> 'Observed account profile with a public bio.'}),
    }) as unknown as Awaited<ReturnType<typeof originalOpen>>;
  };
  BrowserSession.prototype.close=async function(){};
  const app=buildApp();
  try{
    await app.ready();
    const base=defaultPlan('x','audit');
    const note={id:'note-excerpt',kind:'note' as const,title:'Record inspected page',
      inputBindings:{message:{stepId:'inspect',field:'excerpt' as const}}};
    const stop={id:'stop-action',kind:'stop' as const,title:'Stop before provider action'};
    const steps=[...base.steps.slice(0,3),note,stop,...base.steps.slice(3)];
    const plan={...base,steps,links:steps.slice(1).map((step,i)=>({
      source:steps[i]!.id,target:step.id,
    }))};
    const started=await app.inject({method:'POST',url:'/runs',payload:{
      platform:'x',action:'audit',handle:'flow_test',workflow:plan,
    }});
    assert.equal(started.statusCode,202,started.body);
    const id=started.json().id as string;
    let state='';
    for(let i=0;i<120;i++){
      state=(await app.inject('/runs/'+id)).json().state;
      if(['cancelled','failed','completed'].includes(state))break;
      await new Promise(resolve=>setTimeout(resolve,20));
    }
    assert.equal(state,'cancelled','stop prevents execution of the principal provider action');
    const observation=await app.inject('/runs/'+id+'/steps/inspect/output');
    assert.equal(observation.statusCode,200,observation.body);
    assert.deepEqual(observation.json(),{stepId:'inspect',schema:'page-observation/v1',
      url:'https://x.com/flow_test',excerpt:'Observed account profile with a public bio.'});
    const noteOutput=await app.inject('/runs/'+id+'/steps/note-excerpt/output');
    assert.equal(noteOutput.statusCode,200);
    assert.equal(noteOutput.json().schema,'status/v1');
    assert.equal((await app.inject('/runs/'+id+'/steps/action/output')).statusCode,404);
    const journal=await app.inject('/runs/'+id+'/logs');
    assert(journal.json().some((event:{message:string;details?:{stepId?:string}})=>
      event.message==='Observed account profile with a public bio.'&&event.details?.stepId==='note-excerpt'));
    const persisted=await readFile(join(process.cwd(),'.runtime','runs',id,'inspect.output.json'),'utf8');
    assert.equal(JSON.parse(persisted).excerpt,observation.json().excerpt);
    assert.match((await app.inject('/runs/'+id+'/steps/note-excerpt.yaml')).body,
      /schema: "page-observation\/v1"/);
  }finally{
    await app.close();
    BrowserSession.prototype.open=originalOpen;
    BrowserSession.prototype.close=originalClose;
  }
});

test('archived runs survive a new app instance with recorded YAML and typed outputs',async()=>{
  const originalOpen=BrowserSession.prototype.open;
  const originalClose=BrowserSession.prototype.close;
  BrowserSession.prototype.open=async function(){
    return ({
      goto:async()=>undefined,url:()=> 'https://x.com/archive_test',
      locator:()=>({innerText:async()=> 'Archived actual browser observation.'}),
    }) as unknown as Awaited<ReturnType<typeof originalOpen>>;
  };
  BrowserSession.prototype.close=async function(){};
  const app=buildApp();
  let id='';
  try{
    await app.ready();
    const base=defaultPlan('x','audit');
    const stop={id:'stop-archive',kind:'stop' as const,title:'Stop safely before provider'};
    const steps=[...base.steps.slice(0,3),stop,...base.steps.slice(3)];
    const plan={...base,steps,links:steps.slice(1).map((step,i)=>({
      source:steps[i]!.id,target:step.id,
    }))};
    const response=await app.inject({method:'POST',url:'/runs',payload:{
      platform:'x',action:'audit',handle:'archive_test',workflow:plan,
    }});
    assert.equal(response.statusCode,202,response.body);
    id=response.json().id as string;
    for(let n=0;n<120;n++){
      const state=(await app.inject('/runs/'+id)).json().state;
      if(state==='cancelled')break;
      await new Promise(done=>setTimeout(done,20));
    }
    assert.equal((await app.inject('/runs/'+id)).json().state,'cancelled');
  }finally{
    await app.close();
    BrowserSession.prototype.open=originalOpen;
    BrowserSession.prototype.close=originalClose;
  }
  assert(id,'the completed run should have an identifier');
  const restarted=buildApp();
  try{
    await restarted.ready();
    const restored=await restarted.inject('/runs/'+id);
    assert.equal(restored.statusCode,200,restored.body);
    assert.equal(restored.json().state,'cancelled');
    assert((await restarted.inject('/runs')).json().some((item:{id:string})=>item.id===id));
    const yaml=await restarted.inject('/runs/'+id+'/workflow.yaml');
    assert.equal(yaml.statusCode,200,yaml.body);
    const output=await restarted.inject('/runs/'+id+'/steps/inspect/output');
    assert.equal(output.statusCode,200,output.body);
    assert.equal(output.json().excerpt,'Archived actual browser observation.');
    assert.equal((await restarted.inject('/runs/'+id+'/steps/action/output')).statusCode,404);
    assert.equal((await restarted.inject('/runs/'+id+'/logs')).statusCode,200);
    assert.equal((await restarted.inject('/runs/'+id+'/assessment')).statusCode,409);
  }finally{await restarted.close();}
});

test('run archive marks interrupted sessions failed without reopening a browser',async()=>{
  const {mkdtempSync,rmSync}=await import('node:fs');
  const dir=mkdtempSync(join(tmpdir(),'utomator-archive-'));
  try{
    const id='acd3e11a-a7c6-4b5e-809e-23d96d6d7742';
    const archive=new RunArchive(dir);
    archive.save({id,platform:'x',action:'audit',state:'approval-needed',
      createdAt:'2026-10-26T09:00:00.000Z',
      checkpoint:{id:'not-persisted',message:'Temporary approval'}},['start','finish']);
    const restarted=new RunArchive(dir);
    const restored=restarted.restore();
    assert.equal(restored[0]?.summary.state,'failed');
    assert.match(restored[0]?.summary.error??'',/interrupted by an automation engine restart/);
    assert.equal(restored[0]?.summary.checkpoint,undefined);
    assert.equal(restarted.readArtifact(id,'../escape'),null);
    assert.equal(restarted.readArtifact(id,'action'),null);
  }finally{rmSync(dir,{recursive:true,force:true});}
});

test('authored YAML is immutable, schema validated, and only selects allowlisted operations', async()=>{
  const dir=await mkdtemp(join(tmpdir(),'utomator-yaml-def-'));
  const yaml=(id:string,version:number)=>[
    'apiVersion: "utomator.dev/v1"','kind: "StepDefinition"','metadata:',
    '  id: "'+id+'"','  version: '+version,'  title: "Evidence note"',
    'spec:','  stepKind: "note"','  operation: "record-event"',
    '  outputs: "status/v1"','  config:','    message: "Grounded local note"',
  ].join('\n')+'\n';
  try{
    const store=new StepDefinitionStore(dir);
    const id='noteTest';
    assert.equal(parseStepDefinition(yaml(id,1)).spec.operation,'record-event');
    await store.create(yaml(id,1));
    await store.create(yaml(id,2));
    await assert.rejects(store.create(yaml(id,1)),/EEXIST/);
    assert.equal((await store.get(id,1))?.metadata.version,1);
    assert.equal((await store.list()).length,2);
    assert.throws(()=>parseStepDefinition(yaml(id,1).replace('operation: "record-event"','operation: "execute-shell"')),/Unregistered/);
    assert.throws(()=>parseStepDefinition(yaml(id,1).replace('  version: 1','  version: 1\n  version: 2')),/Duplicate YAML/);
    assert.throws(()=>parseStepDefinition(yaml(id,1).replace('  id: "noteTest"','  id: ../../escape')),/YAML scalar/);
    assert.throws(()=>parseStepDefinition(yaml(id,1).replace('  outputs: "status/v1"','  outputs: "action-event/v1"')),/Unregistered/);
    assert.throws(()=>parseStepDefinition(yaml(id,1)+'  command: "bad"\n'),/Invalid YAML spec schema/);
  }finally{await rm(dir,{recursive:true,force:true});}
});

test('typed bindings accept earlier note messages and numeric delay durations, but reject unsafe targets',()=>{
  const base=defaultPlan('x','audit');
  const inspectNote={id:'note-observe',kind:'note' as const,title:'Note observed excerpt',
    inputBindings:{message:{stepId:'inspect',field:'excerpt' as const}}};
  const relay={id:'note-relay',kind:'note' as const,title:'Relay note',
    inputBindings:{message:{stepId:'note-observe',field:'message' as const}}};
  const delay1={id:'delay-one',kind:'delay' as const,title:'Short delay',delayMs:10};
  const delay2={id:'delay-two',kind:'delay' as const,title:'Reuse duration',
    inputBindings:{delayMs:{stepId:'delay-one',field:'durationMs' as const}}};
  const steps=[...base.steps.slice(0,3),inspectNote,relay,delay1,delay2,...base.steps.slice(3)];
  const plan={...base,steps,links:steps.slice(1).map((step,i)=>({source:steps[i]!.id,target:step.id}))};
  const compiled=compileWorkflow(plan);
  assert.equal(compiled.steps.find(step=>step.source.id==='note-relay')?.document.spec.inputs.bindings?.message?.schema,'status/v1');
  assert.equal(compiled.steps.find(step=>step.source.id==='delay-two')?.document.spec.inputs.bindings?.delayMs?.schema,'status/v1');
  assert.match(compiled.steps.find(step=>step.source.id==='delay-two')?.yaml??'',/durationMs/);
  const wrong={...plan,steps:steps.map(step=>step.id==='delay-two'?{...step,
    inputBindings:{delayMs:{stepId:'note-observe',field:'message' as const}}}:step)};
  assert.throws(()=>compileWorkflow(wrong),/type mismatch/);
  const future={...plan,steps:steps.map(step=>step.id==='note-observe'?{...step,
    inputBindings:{message:{stepId:'note-relay',field:'message' as const}}}:step)};
  assert.throws(()=>compileWorkflow(future),/earlier/);
  const unsafe={...plan,steps:steps.map(step=>step.id==='action'?{...step,
    inputBindings:{message:{stepId:'inspect',field:'url' as const}}}:step)};
  assert.throws(()=>compileWorkflow(unsafe),/Unsupported workflow input binding/);
});

test('saved YAML step definitions execute with pinned versions and expose step outputs without provider mutation',async()=>{
  const id='note'+randomUUID().replaceAll('-','').slice(0,20);
  const yaml=[
    'apiVersion: "utomator.dev/v1"','kind: "StepDefinition"','metadata:',
    '  id: "'+id+'"','  version: 1','  title: "Standalone authored note"',
    'spec:','  stepKind: "note"','  operation: "record-event"',
    '  outputs: "status/v1"','  config:','    message: "Verified authored instruction"',
  ].join('\n')+'\n';
  let savedWorkflowId='';
  const originalOpen=BrowserSession.prototype.open,originalClose=BrowserSession.prototype.close;
  BrowserSession.prototype.open=async function(){return ({
    goto:async()=>undefined,url:()=> 'https://x.com/authored_test',
    locator:()=>({innerText:async()=> 'Verified remote page data'}),
  }) as unknown as Awaited<ReturnType<typeof originalOpen>>;};
  BrowserSession.prototype.close=async function(){};
  const app=buildApp();
  try{
    await app.ready();
    const created=await app.inject({method:'POST',url:'/step-definitions',payload:{yaml}});
    assert.equal(created.statusCode,201,created.body);
    assert.equal((await app.inject({method:'POST',url:'/step-definitions',payload:{yaml}})).statusCode,409);
    assert.equal((await app.inject('/step-definitions/'+id+'/versions/1')).statusCode,200);
    const base=defaultPlan('x','audit');
    const note={id:'note-authored',kind:'note' as const,title:'Authored note',definition:{id,version:1}};
    const stop={id:'stop-provider',kind:'stop' as const,title:'Stop before provider'};
    const steps=[...base.steps.slice(0,3),note,stop,...base.steps.slice(3)];
    const plan={...base,steps,links:steps.slice(1).map((step,i)=>({source:steps[i]!.id,target:step.id}))};
    const createdWorkflow=await app.inject({method:'POST',url:'/workflows',payload:{plan}});
    assert.equal(createdWorkflow.statusCode,201,createdWorkflow.body);
    const record=createdWorkflow.json() as {id:string;revision:number};
    savedWorkflowId=record.id;
    assert.match((await app.inject('/workflows/'+record.id+'/yaml')).body,/note-authored/);
    const started=await app.inject({method:'POST',url:'/runs',payload:{
      platform:'x',action:'audit',handle:'authored_test',workflowId:record.id,workflowRevision:1,
    }});
    assert.equal(started.statusCode,202,started.body);
    const runId=started.json().id as string;
    for(let i=0;i<120;i++){
      const state=(await app.inject('/runs/'+runId)).json().state;
      if(['cancelled','failed','completed'].includes(state))break;
      await new Promise(done=>setTimeout(done,20));
    }
    assert.equal((await app.inject('/runs/'+runId)).json().state,'cancelled');
    const output=await app.inject('/runs/'+runId+'/steps/note-authored/output');
    assert.equal(output.statusCode,200,output.body);
    assert.equal(output.json().message,'Verified authored instruction');
    assert.match((await app.inject('/runs/'+runId+'/steps/note-authored.yaml')).body,/definitionId/);
    assert.equal((await app.inject('/runs/'+runId+'/steps/action/output')).statusCode,404);
  }finally{
    await app.close();
    BrowserSession.prototype.open=originalOpen;
    BrowserSession.prototype.close=originalClose;
    await rm(join(process.cwd(),'.runtime','step-definitions',id),{recursive:true,force:true});
    if(savedWorkflowId){
      await rm(join(process.cwd(),'.runtime','workflows',savedWorkflowId+'.json'),{force:true});
      await rm(join(process.cwd(),'.runtime','workflows','revisions',savedWorkflowId),{recursive:true,force:true});
    }
  }
});

test('typed note-to-note and number-to-delay handoffs execute before a guarded provider stop',async()=>{
  const oldOpen=BrowserSession.prototype.open,oldClose=BrowserSession.prototype.close;
  BrowserSession.prototype.open=async function(){return ({
    goto:async()=>undefined,url:()=> 'https://x.com/typed_test',
    locator:()=>({innerText:async()=> 'Typed browser observation'}),
  }) as unknown as Awaited<ReturnType<typeof oldOpen>>;};
  BrowserSession.prototype.close=async function(){};
  const app=buildApp();
  try{
    await app.ready();
    const base=defaultPlan('x','audit');
    const sequence=[
      {id:'note-first',kind:'note' as const,title:'Read excerpt',
        inputBindings:{message:{stepId:'inspect',field:'excerpt' as const}}},
      {id:'note-second',kind:'note' as const,title:'Reuse first note',
        inputBindings:{message:{stepId:'note-first',field:'message' as const}}},
      {id:'delay-first',kind:'delay' as const,title:'Initial delay',delayMs:1},
      {id:'delay-second',kind:'delay' as const,title:'Reuse delay duration',
        inputBindings:{delayMs:{stepId:'delay-first',field:'durationMs' as const}}},
      {id:'stop-before-action',kind:'stop' as const,title:'Terminate before browser mutation'},
    ];
    const steps=[...base.steps.slice(0,3),...sequence,...base.steps.slice(3)];
    const plan={...base,steps,links:steps.slice(1).map((item,i)=>({source:steps[i]!.id,target:item.id}))};
    const started=await app.inject({method:'POST',url:'/runs',payload:{
      platform:'x',action:'audit',handle:'typed_test',workflow:plan,
    }});
    assert.equal(started.statusCode,202,started.body);
    const id=started.json().id as string;
    let state='';
    for(let i=0;i<120;i++){
      state=(await app.inject('/runs/'+id)).json().state;
      if(['failed','cancelled','completed'].includes(state))break;
      await new Promise(done=>setTimeout(done,20));
    }
    assert.equal(state,'cancelled');
    assert.equal((await app.inject('/runs/'+id+'/steps/note-second/output')).json().message,'Typed browser observation');
    assert.equal((await app.inject('/runs/'+id+'/steps/delay-second/output')).json().durationMs,1);
    assert.equal((await app.inject('/runs/'+id+'/steps/action/output')).statusCode,404);
  }finally{
    await app.close();BrowserSession.prototype.open=oldOpen;BrowserSession.prototype.close=oldClose;
  }
});

test('authored assessment definitions enforce a reviewed output contract',()=>{
  const yaml=[
    'apiVersion: "utomator.dev/v1"',
    'kind: "StepDefinition"',
    'metadata:',
    '  id: "assessmentExample"',
    '  version: 1',
    '  title: "Check observed profile text"',
    'spec:',
    '  stepKind: "assess"',
    '  operation: "assess-observation"',
    '  outputs: "assessment/v1"',
    '  config:',
    '    expectedText: "public"',
  ].join('\n')+'\n';
  const parsed=parseStepDefinition(yaml);
  assert.equal(parsed.spec.config.expectedText,'public');
  assert.equal(parsed.spec.outputs,'assessment/v1');
  assert.throws(()=>parseStepDefinition(yaml.replace('assess-observation','execute-approved-action')),/Unregistered/);
  assert.throws(()=>parseStepDefinition(yaml.replace('assessment\/v1','status/v1')),/Unregistered/);
  assert.throws(()=>parseStepDefinition(yaml.replace('expectedText: "public"','expectedText: " "')),/expectation/);
  assert.throws(()=>parseStepDefinition(yaml.replace('    expectedText: "public"','    script: "rm -rf"')),/schema/);
});

test('typed assessment dataflow compiles across string and boolean outputs without provider bindings',()=>{
  const base=defaultPlan('x','audit');
  const assess={id:'assessment',kind:'assess' as const,title:'Check profile text',expectedText:'public',
    inputBindings:{text:{stepId:'inspect',field:'excerpt' as const}}};
  const recheck={id:'assessment-again',kind:'assess' as const,title:'Check assessment consistency',
    expectedText:'Assessment',inputBindings:{
      text:{stepId:'assessment',field:'summary' as const},
      expectedMatch:{stepId:'assessment',field:'matched' as const},
    }};
  const note={id:'assessment-note',kind:'note' as const,title:'Record assessment',
    inputBindings:{message:{stepId:'assessment-again',field:'summary' as const}}};
  const steps=[...base.steps.slice(0,3),assess,recheck,note,...base.steps.slice(3)];
  const plan={...base,steps,links:steps.slice(1).map((step,i)=>({source:steps[i]!.id,target:step.id}))};
  const compiled=compileWorkflow(plan);
  assert.equal(compiled.steps.find(s=>s.source.id==='assessment')?.document.spec.outputs.schema,'assessment/v1');
  assert.equal(compiled.steps.find(s=>s.source.id==='assessment-again')?.document.spec.inputs.bindings?.expectedMatch?.schema,'assessment/v1');
  assert.equal(compiled.steps.find(s=>s.source.id==='assessment-note')?.document.spec.inputs.bindings?.message?.schema,'assessment/v1');
  const wrong={...plan,steps:steps.map(step=>step.id==='assessment-again'?
    {...step,inputBindings:{text:{stepId:'assessment',field:'matched' as const}}}:step)};
  assert.throws(()=>compileWorkflow(wrong),/type mismatch/);
  const future={...plan,steps:steps.map(step=>step.id==='assessment'?
    {...step,inputBindings:{text:{stepId:'assessment-again',field:'summary' as const}}}:step)};
  assert.throws(()=>compileWorkflow(future),/earlier/);
  const unsafe={...plan,steps:steps.map(step=>step.id==='action'?
    {...step,inputBindings:{text:{stepId:'assessment',field:'summary' as const}}}:step)};
  assert.throws(()=>compileWorkflow(unsafe),/Unsupported workflow input binding/);
  const missing={...plan,steps:steps.map(step=>step.id==='assessment'?
    {...step,expectedText:undefined}:step)};
  assert.throws(()=>compileWorkflow(missing),/Assessment requires/);
});

test('authored observation assessments produce immutable typed outputs before guarded provider actions',async()=>{
  const authoredId='assessment'+randomUUID().replaceAll('-','').slice(0,20);
  const yaml=[
    'apiVersion: "utomator.dev/v1"','kind: "StepDefinition"',
    'metadata:','  id: "'+authoredId+'"','  version: 1',
    '  title: "Read-only observation assessment"',
    'spec:','  stepKind: "assess"','  operation: "assess-observation"',
    '  outputs: "assessment/v1"','  config:','    expectedText: "public"',
  ].join('\n')+'\n';
  const oldOpen=BrowserSession.prototype.open,oldClose=BrowserSession.prototype.close;
  BrowserSession.prototype.open=async function(){return ({
    goto:async()=>undefined,url:()=> 'https://x.com/assess_test',
    locator:()=>({innerText:async()=> 'Observed public account bio'}),
  }) as unknown as Awaited<ReturnType<typeof oldOpen>>;};
  BrowserSession.prototype.close=async function(){};
  const app=buildApp();
  let workflowId='';
  try{
    await app.ready();
    assert.equal((await app.inject({method:'POST',url:'/step-definitions',payload:{yaml}})).statusCode,201);
    const base=defaultPlan('x','audit');
    const assess={id:'assess-authored',kind:'assess' as const,title:'Assess live excerpt',
      definition:{id:authoredId,version:1},
      inputBindings:{text:{stepId:'inspect',field:'excerpt' as const}}};
    const note={id:'note-assessment',kind:'note' as const,title:'Explain finding',
      inputBindings:{message:{stepId:'assess-authored',field:'summary' as const}}};
    const stop={id:'stop-mutations',kind:'stop' as const,title:'End before action'};
    const steps=[...base.steps.slice(0,3),assess,note,stop,...base.steps.slice(3)];
    const plan={...base,steps,links:steps.slice(1).map((step,i)=>({source:steps[i]!.id,target:step.id}))};
    const saved=await app.inject({method:'POST',url:'/workflows',payload:{plan}});
    assert.equal(saved.statusCode,201,saved.body);
    workflowId=saved.json().id as string;
    const started=await app.inject({method:'POST',url:'/runs',payload:{
      platform:'x',action:'audit',handle:'assess_test',workflowId,workflowRevision:1,
    }});
    assert.equal(started.statusCode,202,started.body);
    const runId=started.json().id as string;
    for(let i=0;i<120;i++){
      const state=(await app.inject('/runs/'+runId)).json().state;
      if(['cancelled','failed','completed'].includes(state))break;
      await new Promise(done=>setTimeout(done,20));
    }
    assert.equal((await app.inject('/runs/'+runId)).json().state,'cancelled');
    const assessment=await app.inject('/runs/'+runId+'/steps/assess-authored/output');
    assert.equal(assessment.statusCode,200,assessment.body);
    assert.deepEqual(assessment.json(),{
      stepId:'assess-authored',schema:'assessment/v1',matched:true,
      summary:'Assessment matched the declared observation text',
    });
    const noteResult=await app.inject('/runs/'+runId+'/steps/note-assessment/output');
    assert.equal(noteResult.statusCode,200,noteResult.body);
    assert.equal(noteResult.json().message,assessment.json().summary);
    assert.equal((await app.inject('/runs/'+runId+'/steps/action/output')).statusCode,404);
    assert.match((await app.inject('/runs/'+runId+'/steps/assess-authored.yaml')).body,/assessment\/v1/);
    const bytes=await readFile(join(process.cwd(),'.runtime','runs',runId,'assess-authored.output.json'),'utf8');
    assert.equal(JSON.parse(bytes).matched,true);
  }finally{
    await app.close();
    BrowserSession.prototype.open=oldOpen;BrowserSession.prototype.close=oldClose;
    await rm(join(process.cwd(),'.runtime','step-definitions',authoredId),{recursive:true,force:true});
    if(workflowId){
      await rm(join(process.cwd(),'.runtime','workflows',workflowId+'.json'),{force:true});
      await rm(join(process.cwd(),'.runtime','workflows','revisions',workflowId),{recursive:true,force:true});
    }
  }
});

test('evidence and approval steps compile only with prior provenance-bound typed sources',()=>{
  const base=defaultPlan('x','audit');
  const evidence={id:'evidence',kind:'evidence' as const,title:'Capture observed source',
    inputBindings:{observation:{stepId:'inspect',field:'excerpt' as const}}};
  const approval={id:'approval-review',kind:'approve' as const,title:'Review evidence',
    inputBindings:{evidence:{stepId:'evidence',field:'digest' as const}}};
  const steps=[...base.steps.slice(0,3),evidence,approval,...base.steps.slice(3)];
  const plan={...base,steps,links:steps.slice(1).map((step,i)=>({source:steps[i]!.id,target:step.id}))};
  const compiled=compileWorkflow(plan);
  assert.equal(compiled.steps.find(s=>s.source.id==='evidence')?.document.spec.outputs.schema,'evidence/v1');
  assert.equal(compiled.steps.find(s=>s.source.id==='approval-review')?.document.spec.policy.humanApproval,'required-at-evidence-step');
  assert.match(compiled.steps.find(s=>s.source.id==='approval-review')?.yaml??'',/require-evidence-approval/);
  const invalid={...plan,steps:steps.map(item=>item.id==='approval-review'?
    {...item,inputBindings:{evidence:{stepId:'inspect',field:'excerpt' as const}}}:item)};
  assert.throws(()=>compileWorkflow(invalid),/Approval must reference an earlier evidence digest/);
  const future={...plan,steps:steps.map(item=>item.id==='evidence'?
    {...item,inputBindings:{observation:{stepId:'verify',field:'excerpt' as const}}}:item)};
  assert.throws(()=>compileWorkflow(future),/earlier/);
  const unbound={...plan,steps:steps.map(item=>item.id==='approval-review'?
    {...item,inputBindings:undefined}:item)};
  assert.throws(()=>compileWorkflow(unbound),/Approval step requires/);
  assert.throws(()=>compileWorkflow({...plan,steps:steps.map(item=>item.id==='action'?
    {...item,inputBindings:{evidence:{stepId:'evidence',field:'digest' as const}}}:item)}),
    /Unsupported workflow input binding/);
});

test('approval of immutable observed evidence is a real checkpoint and does not execute later provider steps',async()=>{
  const oldOpen=BrowserSession.prototype.open,oldClose=BrowserSession.prototype.close;
  BrowserSession.prototype.open=async function(){return ({
    goto:async()=>undefined,url:()=> 'https://x.com/evidence_test',
    locator:()=>({innerText:async()=> 'Public, observed profile text'}),
  }) as unknown as Awaited<ReturnType<typeof oldOpen>>;};
  BrowserSession.prototype.close=async function(){};
  const app=buildApp();
  try{
    await app.ready();
    const base=defaultPlan('x','audit');
    const extra=[
      {id:'evidence-capture',kind:'evidence' as const,title:'Snapshot page evidence',
        inputBindings:{observation:{stepId:'inspect',field:'excerpt' as const}}},
      {id:'approve-evidence',kind:'approve' as const,title:'Review observed evidence',
        inputBindings:{evidence:{stepId:'evidence-capture',field:'digest' as const}}},
      {id:'stop-before-provider',kind:'stop' as const,title:'No external action'},
    ];
    const steps=[...base.steps.slice(0,3),...extra,...base.steps.slice(3)];
    const plan={...base,steps,links:steps.slice(1).map((step,i)=>({
      source:steps[i]!.id,target:step.id,
    }))};
    const started=await app.inject({method:'POST',url:'/runs',payload:{
      platform:'x',action:'audit',handle:'evidence_test',workflow:plan,
    }});
    assert.equal(started.statusCode,202,started.body);
    const id=started.json().id as string;
    let checkpointId='';
    for(let i=0;i<160;i++){
      const run=(await app.inject('/runs/'+id)).json() as {state:string;checkpoint?:{id:string}};
      if(run.state==='approval-needed'){checkpointId=run.checkpoint?.id??'';break;}
      await new Promise(done=>setTimeout(done,20));
    }
    assert(checkpointId,'evidence review must request a real operator decision');
    const evidence=(await app.inject('/runs/'+id+'/steps/evidence-capture/output')).json() as {
      schema:string;sourceStepId:string;sourceSchema:string;url:string;digest:string};
    assert.equal(evidence.schema,'evidence/v1');
    assert.equal(evidence.sourceStepId,'inspect');
    assert.equal(evidence.sourceSchema,'page-observation/v1');
    assert.equal(evidence.digest.length,64);
    assert.equal((await app.inject('/runs/'+id+'/steps/approve-evidence/output')).statusCode,404);
    const response=await app.inject({method:'POST',url:'/runs/'+id+'/decision',
      payload:{checkpointId,approved:true}});
    assert.equal(response.statusCode,200,response.body);
    for(let i=0;i<160;i++){
      const run=(await app.inject('/runs/'+id)).json() as {state:string};
      if(['cancelled','blocked','failed'].includes(run.state))break;
      await new Promise(done=>setTimeout(done,20));
    }
    assert.equal((await app.inject('/runs/'+id)).json().state,'cancelled');
    const approval=(await app.inject('/runs/'+id+'/steps/approve-evidence/output')).json();
    assert.deepEqual(approval,{stepId:'approve-evidence',schema:'approval/v1',approved:true,
      evidenceStepId:'inspect',evidenceDigest:evidence.digest});
    assert.equal((await app.inject('/runs/'+id+'/steps/action/output')).statusCode,404);
    assert.match(await readFile(join(process.cwd(),'.runtime','runs',id,'approve-evidence.output.json'),'utf8'),
      /evidenceDigest/);
  }finally{
    await app.close();BrowserSession.prototype.open=oldOpen;BrowserSession.prototype.close=oldClose;
  }
});

test('rejecting an evidence approval blocks the run and leaves no approved output',async()=>{
  const oldOpen=BrowserSession.prototype.open,oldClose=BrowserSession.prototype.close;
  BrowserSession.prototype.open=async function(){return ({
    goto:async()=>undefined,url:()=> 'https://x.com/rejection_test',
    locator:()=>({innerText:async()=> 'Observed text for review'}),
  }) as unknown as Awaited<ReturnType<typeof oldOpen>>;};
  BrowserSession.prototype.close=async function(){};
  const app=buildApp();
  try{
    await app.ready();
    const base=defaultPlan('x','audit');
    const extra=[
      {id:'evidence-check',kind:'evidence' as const,title:'Save observation',
        inputBindings:{observation:{stepId:'inspect',field:'excerpt' as const}}},
      {id:'approval-check',kind:'approve' as const,title:'Human approval',
        inputBindings:{evidence:{stepId:'evidence-check',field:'digest' as const}}},
      {id:'stop-check',kind:'stop' as const,title:'Stop before action'},
    ];
    const steps=[...base.steps.slice(0,3),...extra,...base.steps.slice(3)];
    const plan={...base,steps,links:steps.slice(1).map((step,i)=>({
      source:steps[i]!.id,target:step.id,
    }))};
    const started=await app.inject({method:'POST',url:'/runs',payload:{
      platform:'x',action:'audit',handle:'rejection_test',workflow:plan,
    }});
    assert.equal(started.statusCode,202,started.body);
    const id=started.json().id as string;
    let checkpoint='';
    for(let i=0;i<160;i++){
      const run=(await app.inject('/runs/'+id)).json() as {state:string;checkpoint?:{id:string}};
      if(run.state==='approval-needed'){checkpoint=run.checkpoint?.id??'';break;}
      await new Promise(done=>setTimeout(done,20));
    }
    assert(checkpoint);
    const denied=await app.inject({method:'POST',url:'/runs/'+id+'/decision',
      payload:{checkpointId:checkpoint,approved:false}});
    assert.equal(denied.statusCode,200,denied.body);
    for(let i=0;i<160;i++){
      const state=(await app.inject('/runs/'+id)).json().state;
      if(['blocked','failed','cancelled'].includes(state))break;
      await new Promise(done=>setTimeout(done,20));
    }
    assert.equal((await app.inject('/runs/'+id)).json().state,'blocked');
    assert.equal((await app.inject('/runs/'+id+'/steps/approval-check/output')).statusCode,404);
    assert.equal((await app.inject('/runs/'+id+'/steps/action/output')).statusCode,404);
    assert.equal((await app.inject({method:'POST',url:'/runs/'+id+'/decision',
      payload:{checkpointId:checkpoint,approved:true}})).statusCode,409);
  }finally{await app.close();BrowserSession.prototype.open=oldOpen;BrowserSession.prototype.close=oldClose;}
});

test('evidence capture rejects an off-profile redirect before any approval',async()=>{
  const oldOpen=BrowserSession.prototype.open,oldClose=BrowserSession.prototype.close;
  BrowserSession.prototype.open=async function(){return ({
    goto:async()=>undefined,url:()=> 'https://external.example/redirected',
    locator:()=>({innerText:async()=> 'Untrusted redirected content'}),
  }) as unknown as Awaited<ReturnType<typeof oldOpen>>;};
  BrowserSession.prototype.close=async function(){};
  const app=buildApp();
  try{
    await app.ready();
    const base=defaultPlan('x','audit');
    const evidence={id:'verify-origin',kind:'evidence' as const,title:'Verify scoped evidence',
      inputBindings:{observation:{stepId:'inspect',field:'excerpt' as const}}};
    const steps=[...base.steps.slice(0,3),evidence,...base.steps.slice(3)];
    const plan={...base,steps,links:steps.slice(1).map((step,i)=>({
      source:steps[i]!.id,target:step.id,
    }))};
    const started=await app.inject({method:'POST',url:'/runs',payload:{
      platform:'x',action:'audit',handle:'origin_test',workflow:plan,
    }});
    assert.equal(started.statusCode,202,started.body);
    const id=started.json().id as string;
    for(let i=0;i<160;i++){
      const state=(await app.inject('/runs/'+id)).json().state;
      if(['failed','blocked','cancelled','completed'].includes(state))break;
      await new Promise(done=>setTimeout(done,20));
    }
    const final=(await app.inject('/runs/'+id)).json() as {state:string;error:string};
    assert.equal(final.state,'failed');
    assert.match(final.error,/outside the exact authorized profile scope/);
    assert.equal((await app.inject('/runs/'+id+'/steps/verify-origin/output')).statusCode,404);
    assert.equal((await app.inject('/runs/'+id+'/steps/action/output')).statusCode,404);
    const journal=(await app.inject('/runs/'+id+'/logs')).json() as
      Array<{kind:string;details?:{stepId?:string;stage?:string}}>;
    assert(journal.some(event=>event.kind==='step'&&event.details?.stepId==='verify-origin'&&
      event.details?.stage==='failed'),'failed workflow stage must be identifiable on the artboard');
  }finally{await app.close();BrowserSession.prototype.open=oldOpen;BrowserSession.prototype.close=oldClose;}
});


test('LinkedIn templates compile into owner-approved evidence and read-back pipelines', async()=>{
  const plans=templates('linkedin');
  assert.equal(plans.length,9);
  assert.equal(new Set(plans.map(plan=>plan.name)).size,9);
  for(const plan of plans){
    const validated=validatePlan(plan,'linkedin',plan.action);
    const compiled=compileWorkflow(validated);
    assert.equal(compiled.steps.length,plan.steps.length);
    assert.equal(plan.steps.filter(step=>step.kind==='action').length,1);
    assert.equal(plan.steps.some(step=>step.kind==='pause'),true);
    assert.equal(plan.steps.some(step=>step.kind==='verify'),true);
    assert.equal(plan.steps.some(step=>step.kind==='evidence'),true);
    assert.equal(plan.steps.some(step=>step.kind==='approve'),true);
    for(const step of compiled.steps){
      assert.equal(step.document.spec.inputs.scope,'current-run');
      assert.ok(step.document.spec.outputs.schema);
      assert.ok(step.yaml.startsWith('apiVersion: "utomator.dev/v1"'));
    }
  }
  const selected=plans.find(plan=>plan.action==='audit-page')!;
  assert.equal(selected.steps.find(step=>step.kind==='evidence')?.inputBindings?.observation?.stepId,'verify');
  const mutation=plans.find(plan=>plan.action==='edit-profile')!;
  assert.equal(mutation.steps.find(step=>step.kind==='evidence')?.inputBindings?.observation?.stepId,'inspect');
  const store=new WorkflowPlanStore(join(tmpdir(),'missing-linkedin-fixture-'+randomUUID()));
  const loaded=await store.get('linkedin','edit-profile');
  assert.equal(loaded.steps.length,11);
  assert.equal(loaded.steps.find(step=>step.id==='action')?.title,'Revise approved headline or About');
});


test('LinkedIn template can be saved while disconnected, but execution requires the selected synced account',async()=>{
  const app=buildApp();
  let id:string|undefined;
  try{
    await app.ready();
    const all=await app.inject('/workflow-templates/linkedin');
    assert.equal(all.statusCode,200,all.body);
    const plan=(all.json() as ReturnType<typeof templates>).find(item=>item.action==='audit');
    assert.ok(plan,'registered LinkedIn template must exist');
    const saved=await app.inject({method:'POST',url:'/workflows',payload:{plan,templateId:'li-audit'}});
    assert.equal(saved.statusCode,201,saved.body);
    id=(saved.json() as {id:string}).id;
    const before=(await app.inject('/runs')).json().length;
    const handleOnly=await app.inject({method:'POST',url:'/runs',payload:{
      platform:'linkedin',action:'audit',handle:'not-a-linked-in-session',
      workflowId:id,workflowRevision:1,
    }});
    assert.equal(handleOnly.statusCode,400,handleOnly.body);
    assert.match(handleOnly.body,/connect.*sync/);
    const noAccount=await app.inject({method:'POST',url:'/runs',payload:{
      platform:'linkedin',action:'audit',handle:'not-a-linked-in-session',workflow:plan,
    }});
    assert.equal(noAccount.statusCode,400);
    const unverified=await app.inject({method:'POST',url:'/runs',payload:{
      platform:'linkedin',action:'audit',accountId:randomUUID(),
      workflowId:id,workflowRevision:1,
    }});
    assert.equal(unverified.statusCode,400,unverified.body);
    assert.match(unverified.body,/not found|not verified/i);
    assert.equal((await app.inject('/runs')).json().length,before,
      'an unsynced LinkedIn account must never start a run');
    const exists=await app.inject('/workflows/'+id);
    assert.equal(exists.statusCode,200,'loading a template does not depend on a connector');
  }finally{
    await app.close();
    if(id){
      await rm(join(process.cwd(),'.runtime','workflows',id+'.json'),{force:true});
      await rm(join(process.cwd(),'.runtime','workflows','revisions',id),{recursive:true,force:true});
    }
  }
});


test('every LinkedIn run revalidates the saved browser session and flags authentication stage failures',async()=>{
  const oldOpen=BrowserSession.prototype.open,oldClose=BrowserSession.prototype.close;
  let currentUrl='https://www.linkedin.com/in/verified-owner/';
  let signedIn=true;
  BrowserSession.prototype.open=async function(){
    return ({
      goto:async(url:string)=>{currentUrl=url;return null;},
      url:()=>currentUrl,
      getByRole:()=>({first:()=>({waitFor:async()=>{if(!signedIn)throw Error('Sign-in required');}})}),
      locator:()=>({innerText:async()=> 'Profile verified before run'}),
    }) as unknown as Awaited<ReturnType<typeof oldOpen>>;
  };
  BrowserSession.prototype.close=async function(){};
  const root=await mkdtemp(join(tmpdir(),'utomator-linkedin-reauth-'));
  const app=buildApp({socialWorkspaceRoot:root});
  try{
    await app.ready();
    const seeded=await new AccountStore(root).addSocial(0,{
      platform:'linkedin',label:'Verified owner',handle:'verified-owner',
      profileUrl:'https://www.linkedin.com/in/verified-owner/',
    });
    const account=seeded.socialAccounts[0]!;
    assert.equal((await app.inject({method:'POST',url:'/connectors/'+account.id+'/connect'})).statusCode,200);
    assert.equal((await app.inject({method:'POST',url:'/connectors/'+account.id+'/sync'})).json().status,'connected');
    signedIn=false; // The provider revoked the session after the earlier sync.
    const started=await app.inject({method:'POST',url:'/runs',payload:{
      platform:'linkedin',action:'audit',accountId:account.id,
    }});
    assert.equal(started.statusCode,202,started.body);
    const id=(started.json() as {id:string}).id;
    for(let i=0;i<180;i++){
      const row=(await app.inject('/runs/'+id)).json() as {state:string};
      if(['blocked','failed','cancelled','completed'].includes(row.state))break;
      await new Promise(done=>setTimeout(done,20));
    }
    const final=(await app.inject('/runs/'+id)).json() as {state:string;error:string};
    assert.equal(final.state,'blocked');
    assert.match(final.error,/session not authenticated/);
    const journal=(await app.inject('/runs/'+id+'/logs')).json() as
      Array<{kind:string;details?:{stepId?:string;stage?:string}}>;
    assert(journal.some(e=>e.kind==='step'&&e.details?.stepId==='session'&&e.details?.stage==='failed'));
    const refreshed=(await app.inject('/connectors')).json() as Array<{id:string;status:string}>;
    assert.equal(refreshed.find(row=>row.id===account.id)?.status,'disconnected');
  }finally{
    await app.close();BrowserSession.prototype.open=oldOpen;BrowserSession.prototype.close=oldClose;
    await rm(root,{recursive:true,force:true});
  }
});
