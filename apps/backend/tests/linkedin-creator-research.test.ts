import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  CreatorResearchStore,
  executeResearch,
  researchYaml,
} from '../src/core/linkedin-creator-research.js';

process.env.NODE_ENV = 'test';
const { buildApp } = await import('../src/main.js');
const fixture = {
  niche: 'software education',
  objective: 'Improve credible technical visibility',
  ownerHeadline: 'Engineer and educator',
  creators: [
    {
      name: 'Research sample',
      profileUrl: 'https://www.linkedin.com/in/sample-creator/',
      headline: 'Technical education and development',
      posts: [
        {
          url: 'https://www.linkedin.com/posts/sample-creator_technical-activity-1234',
          text: 'Technical writing and community projects help people learn practical software development.',
        },
        {
          url: 'https://www.linkedin.com/posts/sample-creator_community-activity-1235',
          text: 'Technical writing explains community development and measurable software outcomes.',
        },
      ],
    },
  ],
};

test('LinkedIn creator research executes five typed steps with source-bound observations', () => {
  const run = executeResearch(fixture);
  assert.equal(run.status, 'completed');
  assert.equal(run.stages.length, 5);
  assert.equal(run.sources.length, 2);
  assert.equal(run.sources[0]?.digest.length, 64);
  assert.ok(run.output.profiles[0]?.topics.some((topic) => topic.word === 'technical'));
  assert.ok(run.output.gaps.some((gap) => gap.topic === 'technical'));
  assert.ok(
    run.output.experiments[0]?.evidenceUrls.some((value) => value.includes('linkedin.com/posts')),
  );
  assert.match(run.output.limitation, /does not verify live LinkedIn pages/);
  const yaml = researchYaml(run);
  assert.match(yaml, /CompletedLinkedInResearch/);
  assert.match(yaml, /outputSha256/);
  assert.match(yaml, /local-read-only/);
});
test('Creator research refuses unsafe input and invented URLs', () => {
  const creator = fixture.creators[0]!;
  for (const value of [
    'http://www.linkedin.com/in/sample-creator/',
    'https://example.org/in/sample-creator/',
    'https://www.linkedin.com/in/sample-creator/?x=y',
    'https://www.linkedin.com.evil.test/in/sample-creator/',
  ]) {
    assert.throws(() =>
      executeResearch({
        ...fixture,
        creators: [{ ...creator, profileUrl: value }],
      }),
    );
  }
  assert.throws(() => executeResearch({ ...fixture, creators: [] }));
  assert.throws(() => executeResearch({ ...fixture, creators: [{ ...creator, posts: [] }] }));
  assert.throws(() =>
    executeResearch({
      ...fixture,
      creators: [{ ...creator, posts: [creator.posts[0], creator.posts[0]] }],
    }),
  );
});
test('Research receipts persist and reload without relying on memory', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'utomator-research-'));
  try {
    const one = new CreatorResearchStore(directory);
    const run = await one.create(fixture);
    assert.equal((await new CreatorResearchStore(directory).get(run.id))?.id, run.id);
    assert.equal((await one.list()).length, 1);
    assert.equal(await one.get('00000000-0000-0000-0000-000000000000'), null);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
test('Fastify validates research and returns persisted report and YAML', async () => {
  const app = buildApp();
  try {
    await app.ready();
    const rejected = await app.inject({
      method: 'POST',
      url: '/linkedin/research',
      payload: {
        ...fixture,
        creators: [
          {
            ...fixture.creators[0],
            profileUrl: 'https://evil.test/in/sample-creator',
          },
        ],
      },
    });
    assert.equal(rejected.statusCode, 400);
    const response = await app.inject({
      method: 'POST',
      url: '/linkedin/research',
      payload: fixture,
    });
    assert.equal(response.statusCode, 201, response.body);
    const created = response.json();
    assert.equal(created.output.profiles.length, 1);
    const read = await app.inject('/linkedin/research/' + created.id);
    assert.equal(read.statusCode, 200);
    assert.equal(read.json().id, created.id);
    const list = await app.inject('/linkedin/research');
    assert.equal(list.statusCode, 200);
    assert.ok(list.json().some((row: { id: string }) => row.id === created.id));
    const yaml = await app.inject('/linkedin/research/' + created.id + '/yaml');
    assert.equal(yaml.statusCode, 200);
    assert.match(yaml.headers['content-type'] as string, /yaml/);
    assert.match(yaml.body, /outputSha256/);
    assert.equal((await app.inject('/linkedin/research/invalid')).statusCode, 400);
  } finally {
    await app.close();
  }
});
