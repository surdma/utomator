import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

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
  'memory',
  'observer',
  'profile',
  'resumes',
  'settings',
];

test('operator pages live under dashboard, not at the app root', () => {
  assert.ok(existsSync(resolve(app, 'page.tsx')));
  for (const route of routes)
    assert.ok(existsSync(resolve(app, 'dashboard', route, 'page.tsx')), route);
  assert.ok(existsSync(resolve(app, 'api', '[...path]', 'route.ts')));
  assert.ok(!existsSync(resolve(app, '%5Fautomate')));
  for (const route of routes.filter((item) => item !== 'growth'))
    assert.ok(!existsSync(resolve(app, route)));
  assert.ok(
    existsSync(resolve(app, 'growth', 'default-growth-profile', 'page.tsx'))
  );
  assert.ok(!existsSync(resolve(app, '_automate')));
});

test('public portfolio routes are absent', () => {
  for (const route of ['about', 'articles', 'projects', 'resume']) {
    assert.ok(!existsSync(resolve(app, route)), route);
  }
});

test('the proxy still rejects unsupported endpoints and non-local access', () => {
  const proxy = readFileSync(
    resolve(app, 'api', '[...path]', 'route.ts'),
    'utf8'
  );
  assert.match(proxy, /function allowedHost/);
  assert.match(proxy, /function permitted/);
  assert.match(proxy, /Local automation only/);
  assert.match(proxy, /Unsupported endpoint/);
  assert.ok(
    proxy.includes(
      "...(body?.length ? { 'content-type': 'application/json' } : {})"
    ),
    'bodyless clone POST does not advertise JSON'
  );
  assert.match(proxy, /idempotency-key/);
  assert.match(proxy, /same-origin|Same-origin/);
  assert.ok(proxy.includes('growth\\/workflows\\/profile'));
});

test('landing page and pipeline identity are Utomator, not the portfolio', () => {
  const home = readFileSync(resolve(app, 'page.tsx'), 'utf8');
  const hero = readFileSync(
    resolve(root, 'components', 'home', 'hero-text.tsx'),
    'utf8'
  );
  assert.ok(!home.includes('ProfileAvatar'));
  assert.match(hero, /Utomator/);
  assert.match(home, /automation workflow preview/);
});

test('unified Growth editor reads the ID from nested Growth and legacy Craft URLs', () => {
  const pipeline = readFileSync(
    resolve(root, 'components', 'dashboard', 'dashboard-shell.tsx'),
    'utf8'
  );
  const navigation = readFileSync(
    resolve(root, 'components/dashboard/pipeline/dashboard-route.ts'),
    'utf8'
  );
  const navigationHook = readFileSync(
    resolve(root, 'components/dashboard/pipeline/use-dashboard-navigation.ts'),
    'utf8'
  );
  assert.match(
    navigation,
    /const\s+id\s*=\s*pathname\.split\(['"]\/['"]\)\[3\]/
  );
  assert.doesNotMatch(
    navigation,
    /const\s+id\s*=\s*pathname\.split\(['"]\/['"]\)\[2\]/
  );
  assert.match(
    navigation,
    /pathname.startsWith\(['"]\/dashboard\/growth\/['"]\)/
  );
  assert.match(
    pipeline,
    /pane\s*===\s*['"]growth['"]\s*&&\s*\(?\s*<CraftsLibrary/
  );
  const pipelineWorkspace = readFileSync(
    resolve(root, 'components/dashboard/pipeline/pipeline-workspace.tsx'),
    'utf8'
  );
  assert.match(
    pipelineWorkspace,
    /onGrowthTemplateApply=\{applyGrowthTemplate\}/
  );
  assert.match(
    pipelineWorkspace,
    /growthTemplateId=\{selectedGrowthTemplateId\}/
  );
  assert.match(
    navigationHook,
    /['"]\/dashboard\/growth\/['"]\s*\+\s*encodeURIComponent/
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
      /redirect\(['"]\/dashboard\/growth/
    );
});

test('dashboard navigation is distinct from account and career API paths', () => {
  const account = readFileSync(
    resolve(root, 'components', 'dashboard', 'account/account-home.tsx'),
    'utf8'
  );
  const career = readFileSync(
    resolve(root, 'components', 'dashboard', 'career/career-studio.tsx'),
    'utf8'
  );
  assert.match(
    account,
    /saveAccount\(\s*['"]\/profile['"]\s*,\s*['"]PUT['"]/,
    'account settings use /api/account/profile'
  );
  assert.match(
    career,
    /request\(\s*sourceView\s*\?\s*['"]\/profile['"]\s*:\s*['"]\/resumes\/['"]/,
    'career editor uses /api/career/profile or /api/career/resumes'
  );
  assert.match(
    career,
    /request\(\s*['"]\/resumes['"]\s*,\s*['"]POST['"]/,
    'creating a résumé uses the backend API'
  );
  assert.ok(
    /['"]\/dashboard\/resumes\/profile['"]/.test(account),
    'navigation still lives inside dashboard'
  );
});

test('unified Growth UI retains coverage, pipeline boundaries and the MDX editor', () => {
  const catalog = readFileSync(
    resolve(root, 'components/dashboard/crafts/craft-catalog.tsx'),
    'utf8'
  );
  const details = readFileSync(
    resolve(root, 'components/dashboard/growth/growth-capability-details.tsx'),
    'utf8'
  );
  const editor = readFileSync(
    resolve(root, 'components/dashboard/crafts/crafts-library.tsx'),
    'utf8'
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
    resolve(root, 'components/dashboard/workflows/template-browser.tsx'),
    'utf8'
  );
  const editor = readFileSync(
    resolve(root, 'components/dashboard/workflows/workflow-plan-editor.tsx'),
    'utf8'
  );
  const details = readFileSync(
    resolve(root, 'components/dashboard/growth/growth-workspace-dialogs.tsx'),
    'utf8'
  );
  const graphNode = readFileSync(
    resolve(
      root,
      'components/dashboard/growth/artboard/growth-graph-node-card.tsx'
    ),
    'utf8'
  );
  const graphModel = readFileSync(
    resolve(root, 'components/dashboard/growth/growth-graph-model.ts'),
    'utf8'
  );
  const toolbar = readFileSync(
    resolve(
      root,
      'components/dashboard/workflows/editor/workflow-editor-toolbar.tsx'
    ),
    'utf8'
  );
  const proxy = readFileSync(
    resolve(root, 'app/api/[...path]/route.ts'),
    'utf8'
  );
  const optionsModel = readFileSync(
    resolve(root, 'components/dashboard/workflows/template-options.ts'),
    'utf8'
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
  assert.match(toolbar, /Growth execution and evidence/);
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
    'utf8'
  );
  assert.match(legacy, /redirect\(['"]\/dashboard\/workspace['"]\)/);
});
