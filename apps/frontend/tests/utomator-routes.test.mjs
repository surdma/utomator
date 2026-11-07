import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from 'vitest';

const root = resolve(import.meta.dirname, '..');
const app = resolve(root, 'app');
const routes = [
  'pipeline',
  'workspace',
  'growth',
  'editorial',
  'research',
  'history',
  'crafts',
  'profile',
  'resumes',
  'settings',
];

test('operator pages live under dashboard, not at the app root', () => {
  expect(existsSync(resolve(app, 'page.tsx'))).toBeTruthy();
  for (const route of routes)
    expect(
      existsSync(resolve(app, 'dashboard', route, 'page.tsx')),
    ).toBeTruthy();
  expect(existsSync(resolve(app, 'api', '[...path]', 'route.ts'))).toBeTruthy();
  expect(!existsSync(resolve(app, '%5Fautomate'))).toBeTruthy();
  for (const route of routes.filter((item) => item !== 'growth'))
    expect(!existsSync(resolve(app, route))).toBeTruthy();
  expect(
    existsSync(resolve(app, 'growth', 'default-growth-profile', 'page.tsx')),
  ).toBeTruthy();
  expect(!existsSync(resolve(app, '_automate'))).toBeTruthy();
});

test('public portfolio routes are absent', () => {
  for (const route of ['about', 'articles', 'projects', 'resume']) {
    expect(!existsSync(resolve(app, route))).toBeTruthy();
  }
});

test('the proxy still rejects unsupported endpoints and non-local access', () => {
  const proxy = readFileSync(
    resolve(app, 'api', '[...path]', 'route.ts'),
    'utf8',
  );
  expect(proxy).toMatch(/function allowedHost/);
  expect(proxy).toMatch(/function permitted/);
  expect(proxy).toMatch(/Local automation only/);
  expect(proxy).toMatch(/Unsupported endpoint/);
  expect(
    proxy.includes(
      "...(body?.length ? { 'content-type': 'application/json' } : {})",
    ),
  ).toBeTruthy();
  expect(proxy).toMatch(/idempotency-key/);
  expect(proxy).toMatch(/same-origin|Same-origin/);
  expect(proxy.includes('growth\\/workflows\\/profile')).toBeTruthy();
});

test('landing page and pipeline identity are Utomator, not the portfolio', () => {
  const home = readFileSync(resolve(app, 'page.tsx'), 'utf8');
  const hero = readFileSync(
    resolve(root, 'components', 'home', 'hero-text.tsx'),
    'utf8',
  );
  expect(!home.includes('ProfileAvatar')).toBeTruthy();
  expect(hero).toMatch(/Utomator/);
  expect(home).toMatch(/automation workflow preview/);
});

test('unified Growth editor reads the ID from nested Growth and legacy Craft URLs', () => {
  const pipeline = readFileSync(
    resolve(root, 'modules/shell/components/dashboard-shell.tsx'),
    'utf8',
  );
  const navigation = readFileSync(
    resolve(root, 'modules/pipeline/components/dashboard-route.ts'),
    'utf8',
  );
  const navigationHook = readFileSync(
    resolve(root, 'modules/pipeline/components/use-dashboard-navigation.ts'),
    'utf8',
  );
  expect(navigation).toMatch(
    /const\s+id\s*=\s*pathname\.split\(['"]\/['"]\)\[3\]/,
  );
  assert.doesNotMatch(
    navigation,
    /const\s+id\s*=\s*pathname\.split\(['"]\/['"]\)\[2\]/,
  );
  assert.match(
    navigation,
    /pathname.startsWith\(['"]\/dashboard\/growth\/['"]\)/,
  );
  expect(pipeline).toMatch(
    /pane\s*===\s*['"]growth['"]\s*&&\s*\(?\s*<CraftsLibrary/,
  );
  const pipelineWorkspace = readFileSync(
    resolve(root, 'modules/pipeline/components/pipeline-workspace.tsx'),
    'utf8',
  );
  assert.match(
    pipelineWorkspace,
    /onGrowthTemplateApply=\{applyGrowthTemplate\}/,
  );
  assert.match(
    pipelineWorkspace,
    /growthTemplateId=\{selectedGrowthTemplateId\}/,
  );
  assert.match(
    navigationHook,
    /['"]\/dashboard\/growth\/['"]\s*\+\s*encodeURIComponent/,
  );
  assert.ok(!pipeline.includes('<LinkedInGrowthHub'));
  for (const route of [
    'app/dashboard/growth/[craftId]/page.tsx',
    'app/dashboard/growth/[craftId]/source/page.tsx',
  ])
    assert.ok(existsSync(resolve(root, route)), route);
  for (const route of [
    'app/dashboard/crafts/page.tsx',
    'app/dashboard/crafts/[craftId]/page.tsx',
    'app/dashboard/crafts/[craftId]/source/page.tsx',
  ])
    assert.match(
      readFileSync(resolve(root, route), 'utf8'),
      /redirect\(['"\x60]\/dashboard\/growth/,
    );
});

test('dashboard navigation is distinct from account and career API paths', () => {
  const account = readFileSync(
    resolve(root, 'modules/settings/components/account/account-home.tsx'),
    'utf8',
  );
  const career = readFileSync(
    resolve(root, 'modules/career/components/career-studio.tsx'),
    'utf8',
  );
  assert.match(
    account,
    /saveAccount\(\s*['"]\/profile['"]\s*,\s*['"]PUT['"]/,
    'account settings use /api/account/profile',
  );
  assert.match(
    career,
    /request\(\s*sourceView\s*\?\s*['"]\/profile['"]\s*:\s*['"\x60]\/resumes\//,
    'career editor uses /api/career/profile or /api/career/resumes',
  );
  expect(career).toMatch(
    /request\(\s*['"]\/resumes['"]\s*,\s*['"]POST['"]/,
    'creating a résumé uses the backend API',
  );
  assert.ok(
    /['"]\/dashboard\/resumes\/profile['"]/.test(account),
    'navigation still lives inside dashboard',
  );
});

test('unified Growth UI retains coverage, pipeline boundaries and the MDX editor', () => {
  const catalog = readFileSync(
    resolve(root, 'modules/crafts/components/craft-catalog.tsx'),
    'utf8',
  );
  const details = readFileSync(
    resolve(root, 'modules/growth/components/growth-capability-details.tsx'),
    'utf8',
  );
  const editor = readFileSync(
    resolve(root, 'modules/crafts/components/crafts-library.tsx'),
    'utf8',
  );
  assert.match(catalog, /growthJourneys\.map/);
  assert.match(catalog, /capabilityForSlug/);
  assert.match(catalog, /newOutcome/);
  assert.match(catalog, /newAudience/);
  assert.match(details, /capability\.actions\.map/);
  assert.match(details, /profileSections\.map/);
  assert.match(details, /capability\.requires/);
  assert.match(details, /capability\.availableNow/);
  assert.match(editor, /GrowthCapabilityDetails/);
  assert.match(editor, /ReactFlow/);
  assert.match(editor, /craft-mdx-editor/);
  assert.match(editor, /Clone flow/);
  assert.match(editor, /\.skill/);
});

test('Growth YAML uses the persistent Artboard canvas and real Runner controls', () => {
  const modal = readFileSync(
    resolve(root, 'modules/workflows/components/template-browser.tsx'),
    'utf8',
  );
  const editor = readFileSync(
    resolve(root, 'modules/workflows/components/workflow-plan-editor.tsx'),
    'utf8',
  );
  const details = readFileSync(
    resolve(root, 'modules/growth/components/growth-workspace-dialogs.tsx'),
    'utf8',
  );
  const graphNode = readFileSync(
    resolve(
      root,
      'modules/growth/components/artboard/growth-graph-node-card.tsx',
    ),
    'utf8',
  );
  const graphModel = readFileSync(
    resolve(root, 'modules/growth/components/growth-graph-model.ts'),
    'utf8',
  );
  const toolbar = readFileSync(
    resolve(
      root,
      'modules/workflows/components/editor/workflow-editor-toolbar.tsx',
    ),
    'utf8',
  );
  const proxy = readFileSync(
    resolve(root, 'app/api/[...path]/route.ts'),
    'utf8',
  );
  const optionsModel = readFileSync(
    resolve(root, 'modules/workflows/components/template-options.ts'),
    'utf8',
  );
  assert.match(modal, /buildTemplateOptions\(catalog\)/);
  assert.match(modal, /growthTemplateCategories/);
  assert.match(modal, /growth-template-pipeline-preview/);
  assert.match(modal, /Filter workflow availability/);
  assert.match(optionsModel, /growthCapabilities\.map/);
  assert.match(modal, /\/api\/growth\/templates/);
  assert.match(modal, /onGrowthApply/);
  assert.match(editor, /onGrowthTemplateApply/);
  assert.match(editor, /<ReactFlow<ArtboardNode, Edge>/);
  assert.equal((editor.match(/<ReactFlow</g) ?? []).length, 1);
  assert.doesNotMatch(editor, /GrowthProfilePipelines/);
  assert.match(editor, /buildGrowthGraph/);
  assert.match(editor, /growth-nested-artboard/);
  assert.match(editor, /Back to pipelines/);
  assert.match(editor, /<GrowthWorkspaceDialogs/);
  assert.match(toolbar, /Workflow execution and evidence/);
  assert.match(details, /<GrowthRunControls/);
  assert.match(details, /<GrowthEvidenceForm/);
  assert.match(details, /<GrowthCoverageList/);
  assert.match(details, /Start Growth workflow/);
  assert.match(details, /Planning-only YAML/);
  assert.match(details, /Read-only source configuration/);
  assert.match(graphNode, /growth-pipeline-node-/);
  assert.match(graphNode, /growth-task-node-/);
  assert.match(graphModel, /details\?\.stepId/);
  assert.match(proxy, /growth\\\/templates/);
  const legacy = readFileSync(
    resolve(root, 'app/growth/default-growth-profile/page.tsx'),
    'utf8',
  );
  assert.match(legacy, /redirect\(['"]\/dashboard\/workspace['"]\)/);
});

test('the first visit shows a blank Artboard and a genuinely broader workflow library', () => {
  const hook = readFileSync(
    resolve(root, 'modules/pipeline/components/use-workflow-workspace.ts'),
    'utf8',
  );
  const workspace = readFileSync(
    resolve(root, 'modules/pipeline/components/pipeline-workspace.tsx'),
    'utf8',
  );
  const empty = readFileSync(
    resolve(
      root,
      'modules/workflows/components/editor/workflow-empty-state.tsx',
    ),
    'utf8',
  );
  const library = readFileSync(
    resolve(root, 'modules/workflows/components/template-browser.tsx'),
    'utf8',
  );
  const action = readFileSync(
    resolve(root, 'modules/workflows/components/action-template-browser.tsx'),
    'utf8',
  );
  const graph = readFileSync(
    resolve(
      root,
      'modules/growth/components/artboard/growth-graph-node-card.tsx',
    ),
    'utf8',
  );
  const step = readFileSync(
    resolve(root, 'modules/workflows/components/workflow-step-card.tsx'),
    'utf8',
  );
  expect(hook).toMatch(/useState\(false\)/);
  expect(hook).not.toMatch(/createDefaultWorkspace/);
  expect(hook).toMatch(/beginNewWorkflow/);
  expect(hook).toMatch(/selectSavedWorkflow/);
  expect(workspace).toMatch(/!workspaceOpen\s*\?\s*\(/);
  expect(workspace).toMatch(/<WorkflowEmptyState/);
  expect(empty).toMatch(/workflow-empty-state/);
  expect(empty).toMatch(/Browse templates/);
  expect(empty).toMatch(/Create new workflow/);
  expect(empty).toMatch(/Continue a saved workflow/);
  const editorToolbar = readFileSync(
    resolve(
      root,
      'modules/workflows/components/editor/workflow-editor-toolbar.tsx',
    ),
    'utf8',
  );
  const workspaceEditor = readFileSync(
    resolve(root, 'modules/workflows/components/workflow-plan-editor.tsx'),
    'utf8',
  );
  expect(editorToolbar).toMatch(/onReturnToWorkspace/);
  expect(workspaceEditor).toMatch(/workflow-leave-confirmation/);
  expect(workspaceEditor).toMatch(/Discard draft/);
  const commandBridge = readFileSync(
    resolve(root, 'modules/pipeline/components/use-operator-commands.ts'),
    'utf8',
  );
  const dashboard = readFileSync(
    resolve(root, 'modules/shell/components/dashboard-shell.tsx'),
    'utf8',
  );
  expect(hook).toMatch(/async function openActionWorkflow/);
  expect(hook).toMatch(/getApi\(['"\x60]workflow-plans\//);
  expect(commandBridge).toMatch(
    /onStageWorkflow\(command.action, command.fields\)/,
  );
  expect(dashboard).toMatch(
    /if \(!workspaceOpen \|\| selectedGrowthTemplateId\)/,
  );
  expect(library).toMatch(/ActionTemplateBrowser/);
  expect(library).toMatch(/Workflow library/);
  expect(library).not.toMatch(/Growth workflow library/);
  expect(action).toMatch(
    /onApply\(selected,\s*['"\x60]\$\{selected\.platform\}-\$\{selected\.action\}['"\x60]\)/,
  );
  expect(action).toMatch(/Use this template/);
  expect(graph).toMatch(/stepIconFor/);
  expect(step).toMatch(/stepIconFor/);
  expect(graph).toMatch(/STEP /);
  expect(graph).toMatch(/INSPECT · READ ONLY/);
});
