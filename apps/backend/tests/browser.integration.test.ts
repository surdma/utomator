import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chromium } from 'playwright';
import type { Locator, Page } from 'playwright';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

process.env.NODE_ENV = 'test';
const {buildApp}=await import('../src/main.js');

/**
 * Buttons exist in the SSR HTML before React hydrates, so the first click of a
 * freshly loaded page can be a no-op. Retry the click until the expected
 * element actually mounts instead of trusting a single pre-hydration click.
 */
async function clickUntilVisible(page:Page,trigger:Locator,target:Locator,timeout=45_000){
  const deadline=Date.now()+timeout;
  for(;;){
    if(await target.isVisible())return;
    if(Date.now()>deadline)throw new Error('hydration retry: target never became visible');
    try{await trigger.click({timeout:2_000});}catch{/* not actionable yet; retry */}
    await page.waitForTimeout(300);
  }
}


async function exercise(mode:'audit'|'audit-race'|'reject'){
  const app=buildApp();
  const browser=await chromium.launch({headless:true});
  try{
    await app.listen({host:'127.0.0.1',port:3101});
    const page=await browser.newPage();
    await page.goto('http://127.0.0.1:3100/dashboard',{waitUntil:'domcontentloaded'});
    // The toolbar is the current connection entry point; the old header
    // launcher is deliberately hidden in the workspace.
    const launcher=page.getByTestId('floating-connector-button');
    const wizard=page.getByRole('dialog',{name:'Connect your social accounts'});
    await clickUntilVisible(page,launcher,wizard);
    await wizard.getByText('Add a LinkedIn profile to get started.').waitFor();
    // A saved profile reference is not a verified browser session.
    await wizard.getByRole('button',{name:'Close Connect your social accounts'}).click();
    await wizard.waitFor({state:'hidden'});
    assert.equal(await page.getByRole('button',{name:'Start workflow'}).isDisabled(),true,
      'unverified account must never launch an automation');

    const invalid=await page.evaluate(async()=>{
      const response=await fetch('/api/runs',{
        method:'POST',headers:{'content-type':'application/json'},
        body:JSON.stringify({platform:'x',action:'audit',handle:'not/a/handle'})
      });
      return response.status;
    });
    assert.equal(invalid,400,'proxy must preserve server-side input validation');
    const forms=await page.request.get('http://127.0.0.1:3100/api/step-forms');
    assert.equal(forms.status(),200);
    const schema=await forms.json() as {note:{fields:Array<{key:string;label:string}>};delay:{fields:Array<{max:number}>}};
    assert.equal(schema.note.fields[0]?.key,'message');
    assert.equal(schema.delay.fields[0]?.max,30000);

    const templates=page.getByRole('dialog',{name:'Workflow template library'});
    await clickUntilVisible(page,page.getByRole('button',{name:'Choose workflow template'}),templates);
    await templates.getByRole('option',{name:/Profile baseline and evidence/}).click();
    assert.equal(await templates.getByRole('button',{name:'Load selected pipeline'}).isDisabled(),false,
      'a supported template can be prepared before connecting LinkedIn');
    for(const [platform,pattern] of [['X / Twitter',/X profile health check/],['Instagram',/Reels publishing/],
      ['GitHub',/GitHub profile overview/],['Dev.to',/Dev.to article publishing/]] as const){
      await templates.getByRole('button',{name:platform,exact:true}).click();
      await templates.getByRole('option',{name:pattern}).click();
      assert.equal(await templates.getByRole('button',{name:'Load selected pipeline'}).isDisabled(),true,
        platform+' is coming soon and must not execute');
    }
    await templates.getByRole('button',{name:'Close Workflow template library'}).click();

    if(mode==='audit'){
      const career=await page.evaluate(async()=>{
        const response=await fetch('/api/career',{cache:'no-store'});
        if(!response.ok)throw Error('Career source endpoint unavailable');
        return response.json() as Promise<{profile:{name:string;headline:string};resumes:unknown[]}>;
      });
      assert.equal(career.profile.name,'','new users must not inherit portfolio owner names');
      assert.equal(career.profile.headline,'','new users must supply their own career evidence');
      assert.deepEqual(career.resumes,[],'no repository-owner résumé is preloaded');
      await page.getByRole('button',{name:'Add workflow step'}).click();
      const add=page.getByRole('dialog',{name:'Add executable step'});
      await add.getByRole('button',{name:/Record event/i}).click();
      const form=page.getByRole('dialog',{name:'Record a journal event'});
      await form.getByLabel('Journal message').fill('Form configured from validated fields');
      await form.getByRole('button',{name:'Apply node changes'}).click();
      assert.equal(await page.locator('[data-testid^="workflow-node-"]').count(),12);
    }
    if(mode==='reject'){
      const status=await page.evaluate(async()=>{
        const response=await fetch('/api/runs',{
          method:'POST',
          headers:{'content-type':'application/json'},
          body:JSON.stringify({
            platform:'x',action:'audit',handle:'user',
            accountId:'00000000-0000-4000-8000-000000000001',
          }),
        });
        return response.status;
      });
      assert.equal(status,400,'a same-origin request must still reject an unverified account');
    }
    if(mode==='audit-race'){
      await page.getByRole('button',{name:'Open run tracking'}).click();
      const tracking=page.getByRole('dialog',{name:'Run tracking'});
      await tracking.getByText('Run telemetry').waitFor();
      await tracking.getByRole('button',{name:'Close Run tracking'}).click();
    }
  }finally{
    await browser.close();
    await app.close();
  }
}
test('Next.js workspace uses validated forms and blocks unverified execution', async () => exercise('audit'));
test('Next.js workspace rejects unverified account runs without executing writes', async () => exercise('reject'));

test('Next.js workspace exposes connection and tracking dialogs without a login', async () => exercise('audit-race'));


test('Agent skills library connects canvas, MDX, export and operator chat', { timeout: 100000 }, async () => {
  const app = buildApp();
  const browser = await chromium.launch({ headless: true });
  try {
    await app.listen({ host: '127.0.0.1', port: 3101 });
    const page = await browser.newPage({ viewport: { width: 1480, height: 970 }, acceptDownloads: true });
    await page.goto('http://127.0.0.1:3100/dashboard', { waitUntil: 'domcontentloaded' });
    await page.getByTestId('workflow-artboard').waitFor();
    assert.equal(await page.locator('.react-flow__minimap').count(), 0, 'the workflow artboard must not have an obscuring minimap');
    await clickUntilVisible(page, page.getByRole('button', { name: 'Library', exact: true }),
      page.getByTestId('skills-library'));
    await page.getByRole('button', { name: 'New skill' }).click();
    const creation = page.getByRole('dialog', { name: 'Create skill project' });
    await creation.waitFor({ state: 'visible' });
    await creation.getByRole('button', { name: 'Cancel' }).click();
    await creation.waitFor({ state: 'hidden' });
    assert.equal(await page.getByTestId('skills-artboard').count(), 0,
      'the catalogue route should not render any editor');
    const candidate = page.getByTestId('skill-card-content-series-planning');
    await candidate.waitFor();
    await candidate.click();
    await page.getByTestId('skills-artboard').waitFor();
    const beforeWidth = await page.getByTestId('automation-main-scroll').evaluate(e=>e.getBoundingClientRect().width);
    await page.getByRole('button', { name: 'Minimize Mator' }).click();
    assert.equal(await page.getByTestId('automation-right-sidebar').isVisible(), false);
    const afterWidth = await page.getByTestId('automation-main-scroll').evaluate(e=>e.getBoundingClientRect().width);
    assert(afterWidth > beforeWidth + 150, 'main artboard expands when chat is minimized');
    await page.getByRole('button', { name: 'Open run tracking' }).click();
    await page.getByRole('dialog', { name: 'Run tracking' }).waitFor({ state: 'visible' });
    await page.getByRole('button', { name: 'Close Run tracking' }).click();
    assert.equal(await page.getByTestId('automation-right-sidebar').isVisible(), false,
      'tracking must be independent of the hidden chat panel');
    await page.getByRole('button', { name: 'Open Mator' }).click();
    await page.getByTestId('automation-right-sidebar').waitFor({ state:'visible' });
    assert.equal(await page.locator('.react-flow__minimap').count(), 0, 'the skill editor must not have an obscuring minimap');
    assert.match(page.url(), /\/dashboard\/library\/[^/]+$/, 'opening a project must have its own URL');
    assert.equal(await page.getByTestId('skill-card-content-series-planning').count(), 0,
      'skill catalogue must not remain mounted under the editor');
    await page.setViewportSize({ width: 1480, height: 640 });
    const positions = await page.evaluate(() => {
      const main = document.querySelector('[data-testid="automation-main-scroll"]') as HTMLElement;
      const nav = document.querySelector('[data-testid="automation-navigation-sidebar"]') as HTMLElement;
      const chat = document.querySelector('[data-testid="automation-right-sidebar"]') as HTMLElement;
      const before = { nav: nav.getBoundingClientRect().top, chat: chat.getBoundingClientRect().top };
      const scrollable = main.scrollHeight - main.clientHeight;
      main.scrollTop = scrollable;
      return {
        scrollable, offset: main.scrollTop,
        documentHeight: document.documentElement.scrollHeight,
        viewportHeight: window.innerHeight,
        navStayed: before.nav === nav.getBoundingClientRect().top,
        chatStayed: before.chat === chat.getBoundingClientRect().top,
        composerVisible: (() => {
          const composer = chat.querySelector('#operatorMessage');
          if (!composer) return false;
          const rect = composer.getBoundingClientRect();
          return rect.top >= 0 && rect.bottom <= window.innerHeight;
        })(),
      };
    });
    assert(positions.scrollable > 0 && positions.offset > 0, 'only the center should scroll');
    assert(positions.navStayed && positions.chatStayed, 'both desktop sidebars stay fixed');
    assert(positions.documentHeight <= positions.viewportHeight + 1, 'desktop document must not scroll');
    assert(positions.composerVisible, 'chat input stays mounted while the center scrolls');
    await page.setViewportSize({ width: 1480, height: 970 });
    await page.getByRole('button', { name: 'All skill projects' }).click();
    await candidate.waitFor();
    assert.match(page.url(), /\/dashboard\/library$/);
    await page.goBack();
    await page.getByTestId('skills-artboard').waitFor();
    await page.getByTestId('skill-node-goal').click();
    await page.getByLabel('Step title').fill('Define the social-content goal');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.getByText('Saved and synchronized with MDX source.').waitFor();
    await page.getByRole('tab', { name: 'MDX source' }).click();
    const editor = page.getByTestId('skill-mdx-editor');
    const initial = await editor.inputValue();
    await editor.fill(initial + '\nUnapplied source draft');
    await page.getByRole('tab', { name: 'Visual craft' }).click();
    await page.getByRole('tab', { name: 'MDX source' }).click();
    assert.match(await editor.inputValue(), /Unapplied source draft$/, 'switching views must preserve unsaved MDX');
    await editor.fill(initial);
    assert.match(initial, /## Step: goal \| Define the social-content goal/);
    assert.match(initial, /\*\*Next:\*\* \[evidence\]/);
    await editor.fill(initial.replace('**Next:** [evidence](#step-evidence)', '**Next:** [craft](#step-craft)'));
    await page.getByText('Unapplied MDX changes.').waitFor();
    assert.match(page.url(), /\/dashboard\/library\/[^/]+\/source$/, 'MDX has a direct source route');
    await page.getByRole('button', { name: 'Apply MDX to graph' }).click();
    await page.getByText('Unapplied MDX changes.').waitFor({ state:'hidden' });
    await page.getByText('Saved and synchronized with MDX source.').waitFor();
    const all = (await app.inject('/skills')).json();
    const item = all.find((skill: {slug:string}) => skill.slug === 'content-series-planning');
    assert(item);
    assert(item.links.some((edge: {source:string;target:string})=> edge.source==='goal'&&edge.target==='craft'),
      'edited MDX changed the canonical graph');
    assert(!item.links.some((edge: {source:string;target:string})=> edge.source==='goal'&&edge.target==='evidence'));
    await page.getByRole('tab', { name: 'Visual craft' }).click();
    const edge = page.locator('.react-flow__edge').first();
    await edge.waitFor({ timeout: 15000 });
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: '.skill' }).click();
    const downloaded = await downloadPromise;
    assert.equal(downloaded.suggestedFilename(), 'content-series-planning.skill');
    await page.getByRole('textbox', { name: 'Structured command', exact: true }).fill('/skill unlink goal -> craft');
    await page.getByRole('button', { name: 'Send structured command' }).click();
    await page.getByText(/Updated Content series planning/).waitFor({ timeout: 12000 });
    const final = (await app.inject('/skills')).json().find((skill: {slug:string})=>skill.slug==='content-series-planning');
    assert(!final.links.some((link: {source:string;target:string})=>link.source==='goal'&&link.target==='craft'),
      'chat modification changed the same persisted skill graph');
    const finalMdx = await app.inject('/skills/'+final.id+'/mdx');
    assert.match(finalMdx.body, /\*\*Next:\*\* End/);
    const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await mobile.goto('http://127.0.0.1:3100/library', { waitUntil:'domcontentloaded' });
    await mobile.getByTestId('skills-library').waitFor();
    const metrics = await mobile.evaluate(() => ({
      viewport: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth,
    }));
    assert(metrics.scroll <= metrics.viewport + 1,'library must fit mobile width without overflow');
    assert.equal(await mobile.getByTestId('automation-right-sidebar').isVisible(), false,
      'mobile chat is closed until requested');
    await clickUntilVisible(page, mobile.getByRole('button', { name: 'Open Mator' }),
      mobile.getByTestId('automation-right-sidebar'));
    assert.equal(await mobile.getByTestId('automation-right-sidebar').isVisible(), true);
    await mobile.getByRole('button', { name: 'Close operator chat' }).click();
    assert.equal(await mobile.getByTestId('automation-right-sidebar').isVisible(), false);
    await mobile.getByRole('button', { name: 'Open Mator' }).waitFor({ state: 'visible' });
    await mobile.getByRole('button', { name: 'Toggle navigation' }).click();
    assert.equal(await mobile.getByTestId('automation-navigation-sidebar').isVisible(), true);
    await mobile.getByRole('button', { name: 'Close navigation' }).click();
    assert.equal(await mobile.getByTestId('automation-navigation-sidebar').isVisible(), false);
    await mobile.close();
  } finally {
    await browser.close();
    await app.close();
  }
});


test('LinkedIn templates load onto the artboard without connection; execution stays account-gated',async()=>{
  const app=buildApp();
  const browser=await chromium.launch({headless:true});
  const createdIds:string[]=[];
  try{
    await app.listen({host:'127.0.0.1',port:3101});
    const page=await browser.newPage();
    await page.goto('http://127.0.0.1:3100/dashboard',{waitUntil:'domcontentloaded'});
    const existingIds=new Set(((await app.inject('/workflows')).json() as Array<{id:string}>).map(item=>item.id));
    const run=page.getByRole('button',{name:'Start workflow'});
    assert.equal(await run.isDisabled(),true);
    const catalog=page.getByRole('dialog',{name:'Workflow template library'});
    await clickUntilVisible(page,page.getByRole('button',{name:'Choose workflow template'}),catalog);
    await catalog.getByRole('option',{name:/Headline and About revision/}).click();
    const preview=page.getByTestId('template-preview');
    assert.match(await preview.innerText(),/Pipeline preview/);
    assert.equal(await preview.getByRole('list').count(),0,'preview must render a diagram instead of a numbered text list');
    const graph=preview.getByTestId('template-graph-preview');
    await graph.locator('.react-flow__node').first().waitFor();
    assert((await graph.locator('.react-flow__node').count())>=8,'preview must show the real pipeline nodes');
    assert((await graph.locator('.react-flow__edge').count())>=7,'pipeline relationships must render as connected edges');
    assert.doesNotMatch(await preview.innerText(),/\bYAML\b|input: .*operation:|output:/i);
    const library=catalog.getByRole('listbox',{name:'Workflow template list'});
    const heading=catalog.getByText('Social presence library');
    const before=await heading.boundingBox();
    assert(before);
    const scroll=await library.evaluate(element=>{
      const start=element.scrollTop;
      element.scrollTop=element.scrollHeight;
      return {start,top:element.scrollTop,client:element.clientHeight,total:element.scrollHeight};
    });
    assert(scroll.total>scroll.client&&scroll.top>scroll.start,'the template list must own its scrolling');
    const after=await heading.boundingBox();
    assert(after&&Math.abs(after.y-before.y)<2,'library header remains fixed while templates scroll');
    assert.equal(await catalog.evaluate(element=>element.scrollTop),0,'modal itself must not scroll into blank space');
    await page.setViewportSize({width:390,height:740});
    await graph.locator('.react-flow__node').first().waitFor();
    assert.equal(await heading.isVisible(),true,'library heading remains visible on mobile');
    assert.equal(await graph.isVisible(),true,'pipeline diagram remains visible on mobile');
    const modalBounds=await catalog.boundingBox();
    const previewBounds=await preview.boundingBox();
    assert(modalBounds&&previewBounds&&previewBounds.y+previewBounds.height<=modalBounds.y+modalBounds.height+1,
      'detail panel must remain inside the modal viewport');
    const load=catalog.getByRole('button',{name:'Load selected pipeline'});
    assert.equal(await load.isDisabled(),false,'loading must not require account verification');
    await load.click();
    await catalog.waitFor({state:'hidden'});
    await page.setViewportSize({width:1280,height:800});
    const board=page.getByTestId('workflow-artboard');
    await board.getByText('Headline and About revision').first().waitFor();
    await board.getByTestId('workflow-run-readiness').getByText(/Connect and sync the selected LinkedIn account/).waitFor();
    assert.equal(await run.isDisabled(),true,'unverified account cannot execute the loaded template');
    const saved=(await app.inject('/workflows')).json() as Array<{id:string;templateId:string;plan:{action:string}}>;
    createdIds.push(...saved.filter(entry=>!existingIds.has(entry.id)&&entry.templateId==='li-intro'&&entry.plan.action==='edit-profile').map(entry=>entry.id));
    assert(createdIds.length>0);
    // Simulate a stale/untrusted UI connection report. The artboard must keep
    // the loaded plan when the owner connects, while the server remains the gate.
    await page.route('**/api/connectors',async route=>{
      await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify([{
        id:'00000000-0000-4000-8000-000000000099',platform:'linkedin',
        label:'Test verified account',handle:'test-verified-account',
        profileUrl:'https://www.linkedin.com/in/test-verified-account/',
        status:'connected',verifiedAt:new Date().toISOString(),authentication:'browser',
      }])});
    });
    await page.getByTestId('automation-navigation-sidebar').getByRole('button',{name:'Run history'}).click();
    await page.getByTestId('automation-navigation-sidebar').getByRole('button',{name:'Workspace'}).click();
    const reloadedBoard=page.getByTestId('workflow-artboard');
    await reloadedBoard.getByTestId('workflow-run-readiness').getByText(/Execution target: Test verified account/).waitFor();
    assert.match(await reloadedBoard.innerText(),/Headline and About revision/,
      'connecting after loading must not reset the selected workflow');
    assert.equal(await run.isDisabled(),false);
    const beforeRejectedRun=(await app.inject('/runs')).json().length;
    await run.click();
    await reloadedBoard.getByRole('alert').getByText(/Social account not found/).waitFor();
    assert.equal((await app.inject('/runs')).json().length,beforeRejectedRun,
      'client-reported connectivity cannot bypass the server account check');
    await page.getByRole('button',{name:'Choose workflow template'}).click();
    const planned=page.getByRole('dialog',{name:'Workflow template library'});
    await planned.getByRole('button',{name:'Instagram'}).click();
    assert.equal(await planned.getByRole('button',{name:'Load selected pipeline'}).isDisabled(),true,
      'planned provider integrations must remain inaccessible');
    assert.doesNotMatch(await planned.innerText(),/\bYAML\b/);
  }finally{
    await browser.close();await app.close();
    for(const id of createdIds){
      await rm(join(process.cwd(),'.runtime','workflows',id+'.json'),{force:true});
      await rm(join(process.cwd(),'.runtime','workflows','revisions',id),{recursive:true,force:true});
    }
  }
});


test('Creator research connects a real form to persisted results and remains available after reload',async()=>{
  const app=buildApp();
  const browser=await chromium.launch({headless:true});
  try{
    await app.listen({host:'127.0.0.1',port:3101});
    const page=await browser.newPage();
    await page.goto('http://127.0.0.1:3100/research',{waitUntil:'domcontentloaded'});
    const studio=page.getByTestId('linkedin-creator-research');
    await studio.waitFor({state:'visible'});
    await studio.getByRole('textbox',{name:'Your niche'}).fill('Software education');
    await studio.getByRole('textbox',{name:'Research objective'}).fill('Improve technical community visibility');
    await studio.getByRole('textbox',{name:'Your current LinkedIn headline'}).fill('Engineer and educator');
    await studio.getByRole('textbox',{name:'Creator name'}).fill('Research sample');
    await studio.getByRole('textbox',{name:'LinkedIn profile URL'}).fill('https://www.linkedin.com/in/sample-creator/');
    await studio.getByRole('textbox',{name:'Observed headline'}).fill('Developer educator and software writer');
    await studio.getByRole('textbox',{name:'Post permalink'}).fill('https://www.linkedin.com/posts/sample-creator_technical-activity-1234');
    await studio.getByRole('textbox',{name:'Exact post excerpt'}).fill('Technical writing for software development and community research using practical examples.');
    const report=page.getByTestId('creator-research-report');
    const objective=report.getByText('Objective: Improve technical community visibility');
    await clickUntilVisible(page,studio.getByRole('button',{name:'Run evidenced comparison'}),objective);
    await objective.waitFor({timeout:15000});
    assert.match(await report.innerText(),/Evidence-linked results/);
    assert.match(await report.innerText(),/Potential topics not present/);
    assert.match(await report.innerText(),/Evidence post/);
    assert.equal(await report.getByRole('link',{name:/YAML/}).count(),0);
    const histories=(await app.inject('/linkedin/research')).json() as Array<{id:string}>;
    assert(histories.length>0);
    const internal=await app.inject('/linkedin/research/'+histories[0]!.id+'/yaml');
    assert.equal(internal.statusCode,200);
    assert.match(internal.body,/validate-submitted-sources/);
    await page.reload();
    await page.getByText('Objective: Improve technical community visibility').waitFor({timeout:15000});
  }finally{await browser.close();await app.close();}
});


test('LinkedIn editorial research-to-draft workflow persists, approves and returns YAML',async()=>{
  const root=await mkdtemp(join(tmpdir(),'utomator-editorial-ui-'));
  const app=buildApp({socialWorkspaceRoot:root});
  const browser=await chromium.launch({headless:true});
  try{
    await app.listen({host:'127.0.0.1',port:3101});
    const account=(await app.inject('/account')).json() as {revision:number};
    const suffix=String(Date.now()).slice(-8);
    const handle='editorial'+suffix;
    const added=await app.inject({method:'POST',url:'/account/social',payload:{
      expectedRevision:account.revision,document:{
        platform:'linkedin',label:'Editorial E2E',handle,
        profileUrl:'https://www.linkedin.com/in/'+handle+'/',
      },
    }});
    assert.equal(added.statusCode,201,added.body);
    const savedAccount=(added.json() as {socialAccounts:Array<{id:string}>}).socialAccounts.at(-1)!;
    const research=await app.inject({method:'POST',url:'/linkedin/research',payload:{
      niche:'Software education',objective:'Test evidence-grounded content planning',
      ownerHeadline:'Engineering educator',creators:[{name:'Example creator',
        profileUrl:'https://www.linkedin.com/in/example-creator/',
        headline:'Software tutorials and engineering content',posts:[{
          url:'https://www.linkedin.com/posts/example-creator_technical-activity-12345',
          text:'Technical tutorials explain software architecture and community development with documented examples.',
        }]}],
    }});
    assert.equal(research.statusCode,201,research.body);
    const researchRun=research.json() as {id:string};
    const page=await browser.newPage();
    await page.goto('http://127.0.0.1:3100/editorial',{waitUntil:'domcontentloaded'});
    const studio=page.getByTestId('linkedin-editorial-studio');
    await studio.waitFor({state:'visible'});
    await studio.getByRole('combobox',{name:'Saved LinkedIn account'}).selectOption(savedAccount.id);
    await studio.getByRole('combobox',{name:/Evidence from Creator Research/}).selectOption(researchRun.id);
    await studio.getByRole('textbox',{name:/Post draft/}).fill(
      'An evidence-backed explanation of technical writing and hands-on software education for learners.');
    await studio.getByRole('button',{name:'Create private draft'}).click();
    await studio.getByText(/Draft saved to your private workspace/).waitFor();
    await studio.getByRole('button',{name:'Approve reviewed draft'}).click();
    await studio.getByText(/Draft is now approved/).waitFor();
    assert.equal(await studio.getByRole('button',{name:'Publish approved post to LinkedIn'}).isDisabled(),true,
      'a reviewed local draft must never publish without a separate LinkedIn API grant');
    assert.equal(await studio.getByRole('link',{name:/YAML/}).count(),0);
    const written=(await app.inject('/linkedin/drafts')).json() as Array<{id:string}>;
    assert(written.length>0);
    const snapshot=await app.inject('/linkedin/drafts/'+written[0]!.id+'/yaml');
    assert.equal(snapshot.statusCode,200);
    assert.match(snapshot.body,/externalPublishing: "not-performed"/);
    await page.reload({waitUntil:'domcontentloaded'});
    await studio.getByText(/Saved drafts/).waitFor();
    const savedDraft=studio.locator('section').last().getByRole('button').first();
    await savedDraft.click();
    await studio.getByRole('button',{name:'Reopen for edits'}).click();
    await studio.getByText(/Draft is now draft/).waitFor();
    const report=await app.inject('/linkedin/drafts');
    assert.equal(report.statusCode,200);
    const rows=report.json() as Array<{accountId:string;content:{researchRunId:string;sourceUrls:string[]}}>;
    assert(rows.some(row=>row.accountId===savedAccount.id&&row.content.researchRunId===researchRun.id&&row.content.sourceUrls.length>0));
  }finally{await browser.close();await app.close();await rm(root,{recursive:true,force:true});}
});


test('LinkedIn Growth hub exposes truthful scope, searches modules, and links only working workflows',async()=>{
  const app=buildApp();
  const browser=await chromium.launch({headless:true});
  try{
    await app.listen({host:'127.0.0.1',port:3101});
    const page=await browser.newPage({viewport:{width:1280,height:800}});
    await page.goto('http://127.0.0.1:3100/growth',{waitUntil:'domcontentloaded'});
    const hub=page.getByTestId('linkedin-growth-hub');
    await hub.getByRole('heading',{name:'Capability inventory'}).waitFor();
    assert.match(await hub.innerText(),/15 modules/);
    const detail=hub.getByTestId('growth-capability-details');
    const jobs=hub.getByRole('button',{name:/Job search & career opportunity pipeline/});
    await clickUntilVisible(page,jobs,detail.getByRole('heading',{name:'Job search & career opportunity pipeline'}));
    assert.match(await detail.innerText(),/Not implemented/);
    assert.equal(await detail.getByRole('link',{name:'Open available workflow'}).count(),0,
      'a planned LinkedIn integration cannot provide a pretend execution shortcut');
    await hub.getByRole('textbox',{name:'Search capabilities'}).fill('creator');
    assert.match(await hub.innerText(),/Creator, competitor & niche intelligence/);
    await hub.getByRole('textbox',{name:'Search capabilities'}).fill('');
    await hub.getByRole('button',{name:/Profile auditing & section optimization/}).click();
    assert.equal(await detail.getByText('20 sections in the target audit').isVisible(),true);
    await detail.getByRole('link',{name:'Open available workflow'}).click();
    await page.waitForURL('**/profile');
    await page.getByTestId('automation-navigation-sidebar').getByRole('button',{name:'LinkedIn growth'}).click();
    await hub.getByRole('heading',{name:'Capability inventory'}).waitFor();
    await page.setViewportSize({width:390,height:844});
    await hub.getByRole('combobox',{name:'Delivery priority'}).selectOption('P1');
    await hub.getByRole('button',{name:/Company Page & organization growth/}).click();
    assert.equal(await detail.getByRole('link',{name:'Open available workflow'}).count(),0);
  }finally{await browser.close();await app.close();}
});


test('LinkedIn connector adds a server-owned profile and stays available from the Profile page',async()=>{
  const root=await mkdtemp(join(tmpdir(),'utomator-linkedin-dialog-'));
  const app=buildApp({socialWorkspaceRoot:root});
  const browser=await chromium.launch({headless:true});
  try{
    await app.listen({host:'127.0.0.1',port:3101});
    const page=await browser.newPage({viewport:{width:1280,height:800}});
    await page.goto('http://127.0.0.1:3100/dashboard',{waitUntil:'domcontentloaded'});
    const dialog=page.getByRole('dialog',{name:'Connect your social accounts'});
    await page.getByTestId('workflow-artboard').waitFor();
    await clickUntilVisible(page,page.getByTestId('floating-connector-button'),dialog);
    await dialog.getByTestId('linkedin-connector').waitFor();
    await page.setViewportSize({width:390,height:760});
    assert.equal(await dialog.getByRole('heading',{name:'LinkedIn',exact:true}).count(),1);
    assert.equal(await dialog.getByRole('heading',{name:'X',exact:true}).count(),0);
    await dialog.getByRole('button',{name:'Add another LinkedIn account'}).click();
    await dialog.getByRole('textbox',{name:'LinkedIn profile address'})
      .fill('https://www.linkedin.com/in/compact-test-owner/');
    await dialog.getByRole('button',{name:'Add account',exact:true}).click();
    await dialog.getByText('@compact-test-owner').waitFor();
    const state=(await app.inject('/account')).json() as
      {socialAccounts:Array<{id:string;platform:string;handle:string}>};
    const saved=state.socialAccounts.find(row=>row.handle==='compact-test-owner');
    assert(saved&&saved.platform==='linkedin');
    const connector=(await app.inject('/connectors')).json() as Array<{id:string;status:string}>;
    assert.equal(connector.find(row=>row.id===saved.id)?.status,'disconnected');
    await page.keyboard.press('Escape');
    await page.goto('http://127.0.0.1:3100/profile/connections',{waitUntil:'domcontentloaded'});
    await page.getByTestId('owner-profile-page').waitFor();
    await page.getByTestId('owner-profile-page').getByText('@compact-test-owner').waitFor();
    const status=page.getByTestId('profile-connection-status-'+saved.id);
    await status.getByText('Not connected').waitFor();
    await page.getByRole('button',{name:'Connect LinkedIn',exact:true}).click();
    await dialog.waitFor({state:'visible'});
    assert.equal(await dialog.getByText('@compact-test-owner').count(),1);
  }finally{await browser.close();await app.close();await rm(root,{recursive:true,force:true});}
});
