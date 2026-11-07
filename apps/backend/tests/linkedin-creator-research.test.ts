import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import {
  CreatorResearchStore,
  executeResearch,
  researchYaml,
} from '../src/infrastructure/linkedin/linkedin-creator-research.js';
import { removeTemp } from './support/remove-temp.js';

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
  expect(run.status).toEqual('completed');
  expect(run.stages.length).toEqual(5);
  expect(run.sources.length).toEqual(2);
  expect(run.sources[0]?.digest.length).toEqual(64);
  expect(run.output.profiles[0]?.topics.some((topic) => topic.word === 'technical')).toBeTruthy();
  expect(run.output.gaps.some((gap) => gap.topic === 'technical')).toBeTruthy();
  expect(
    run.output.experiments[0]?.evidenceUrls.some((value) => value.includes('linkedin.com/posts')),
  ).toBeTruthy();
  expect(run.output.limitation).toMatch(/does not verify live LinkedIn pages/);
  const yaml = researchYaml(run);
  expect(yaml).toMatch(/CompletedLinkedInResearch/);
  expect(yaml).toMatch(/outputSha256/);
  expect(yaml).toMatch(/local-read-only/);
});
test('Creator research refuses unsafe input and invented URLs', () => {
  const creator = fixture.creators[0]!;
  for (const value of [
    'http://www.linkedin.com/in/sample-creator/',
    'https://example.org/in/sample-creator/',
    'https://www.linkedin.com/in/sample-creator/?x=y',
    'https://www.linkedin.com.evil.test/in/sample-creator/',
  ]) {
    {
      let e: unknown;
      try {
        (() =>
          executeResearch({
            ...fixture,
            creators: [{ ...creator, profileUrl: value }],
          }))();
      } catch (caught) {
        e = caught;
      }
      expect(e).toBeDefined();
      expect(() => {
        throw e;
      }).toThrow();
    }
  }
  {
    let e: unknown;
    try {
      (() => executeResearch({ ...fixture, creators: [] }))();
    } catch (caught) {
      e = caught;
    }
    expect(e).toBeDefined();
    expect(() => {
      throw e;
    }).toThrow();
  }
  {
    let e: unknown;
    try {
      (() => executeResearch({ ...fixture, creators: [{ ...creator, posts: [] }] }))();
    } catch (caught) {
      e = caught;
    }
    expect(e).toBeDefined();
    expect(() => {
      throw e;
    }).toThrow();
  }
  {
    let e: unknown;
    try {
      (() =>
        executeResearch({
          ...fixture,
          creators: [{ ...creator, posts: [creator.posts[0], creator.posts[0]] }],
        }))();
    } catch (caught) {
      e = caught;
    }
    expect(e).toBeDefined();
    expect(() => {
      throw e;
    }).toThrow();
  }
});
test('Research receipts persist and reload without relying on memory', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'utomator-research-'));
  try {
    const one = new CreatorResearchStore(directory);
    const run = await one.create(fixture);
    expect((await new CreatorResearchStore(directory).get(run.id))?.id).toEqual(run.id);
    expect((await one.list()).length).toEqual(1);
    expect(await one.get('00000000-0000-0000-0000-000000000000')).toEqual(null);
  } finally {
    await removeTemp(directory);
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
    expect(rejected.statusCode).toEqual(400);
    const response = await app.inject({
      method: 'POST',
      url: '/linkedin/research',
      payload: fixture,
    });
    expect(response.statusCode).toEqual(201);
    const created = response.json();
    expect(created.output.profiles.length).toEqual(1);
    const read = await app.inject(`/linkedin/research/${created.id}`);
    expect(read.statusCode).toEqual(200);
    expect(read.json().id).toEqual(created.id);
    const list = await app.inject('/linkedin/research');
    expect(list.statusCode).toEqual(200);
    expect(list.json().some((row: { id: string }) => row.id === created.id)).toBeTruthy();
    const yaml = await app.inject(`/linkedin/research/${created.id}/yaml`);
    expect(yaml.statusCode).toEqual(200);
    expect(yaml.headers['content-type'] as string).toMatch(/yaml/);
    expect(yaml.body).toMatch(/outputSha256/);
    expect((await app.inject('/linkedin/research/invalid')).statusCode).toEqual(400);
  } finally {
    await app.close();
  }
});
