import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const app = resolve(root, 'app');
const routes = [
  'pipeline',
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
    proxy.includes('headers: body?.length ?'),
    'bodyless clone POST does not advertise JSON'
  );
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
    resolve(root, 'components', 'automate', 'pipeline.tsx'),
    'utf8'
  );
  const navigation = readFileSync(
    resolve(root, 'components/automate/pipeline/dashboard-route.ts'),
    'utf8'
  );
  const navigationHook = readFileSync(
    resolve(root, 'components/automate/pipeline/use-dashboard-navigation.ts'),
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
  assert.match(pipeline, /onGrowthTemplateApply=\{applyGrowthTemplate\}/);
  assert.match(pipeline, /growthTemplateId=\{selectedGrowthTemplateId\}/);
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
    resolve(root, 'components', 'automate', 'account-studio.tsx'),
    'utf8'
  );
  const career = readFileSync(
    resolve(root, 'components', 'automate', 'career-studio.tsx'),
    'utf8'
  );
  assert.match(
    account,
    /save\(\s*['"]\/profile['"]\s*,\s*['"]PUT['"]\s*,\s*profile\s*\)/,
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
    /['"]\/dashboard\/profile\/connections['"]/.test(account),
    'navigation still lives inside dashboard'
  );
});

test('unified Growth UI retains coverage, pipeline boundaries and the MDX editor', () => {
  const catalog = readFileSync(
    resolve(root, 'components/automate/craft-catalog.tsx'),
    'utf8'
  );
  const details = readFileSync(
    resolve(root, 'components/automate/growth-capability-details.tsx'),
    'utf8'
  );
  const editor = readFileSync(
    resolve(root, 'components/automate/crafts-library.tsx'),
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

test('Growth YAML loads through the existing Templates modal and nested artboard', () => {
  const modal = readFileSync(
    resolve(root, 'components/automate/template-browser.tsx'),
    'utf8'
  );
  const editor = readFileSync(
    resolve(root, 'components/automate/workflow-plan-editor.tsx'),
    'utf8'
  );
  const graph = readFileSync(
    resolve(root, 'components/automate/growth-workflow-artboard.tsx'),
    'utf8'
  );
  const proxy = readFileSync(
    resolve(root, 'app/api/[...path]/route.ts'),
    'utf8'
  );
  const optionsModel = readFileSync(
    resolve(root, 'components/automate/template-options.ts'),
    'utf8'
  );
  assert.match(
    modal,
    /buildTemplateOptions\(growthTemplates, toolkits, growthSupported\)/
  );
  assert.match(optionsModel, /growthCapabilities\.map/);
  assert.match(modal, /\/api\/growth\/templates/);
  assert.match(modal, /onGrowthApply/);
  assert.match(editor, /onGrowthTemplateApply/);
  assert.match(
    editor,
    /<GrowthProfilePipelines\s+templateId\s*=\s*\{\s*growthTemplateId\s*\}/
  );
  assert.match(graph, /growth-pipeline-node-/);
  assert.match(graph, /growth-task-node-/);
  const graphModel = readFileSync(
    resolve(root, 'components/automate/growth-graph-model.ts'),
    'utf8'
  );
  assert.match(graphModel, /details\?\.stepId/);
  assert.match(graph, /failed/);
  assert.match(proxy, /growth\\\/templates/);
  const legacy = readFileSync(
    resolve(root, 'app/growth/default-growth-profile/page.tsx'),
    'utf8'
  );
  assert.match(legacy, /redirect\(['"]\/dashboard\/pipeline['"]\)/);
});
