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
