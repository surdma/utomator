
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, expect } from 'vitest';
import { editorialYaml, LinkedInEditorialStore } from '../src/linkedin/linkedin-editorial.js';
import { AccountStore } from '../src/profile/account-store.js';

process.env.NODE_ENV = 'test';
const { buildApp } = await import('../src/main.js');
const id = randomUUID(),
  account = {
    get: async () => ({
      socialAccounts: [
        {
          id,
          platform: 'linkedin' as const,
          profileUrl: 'https://www.linkedin.com/in/editorial-sample/',
          label: 'Editorial sample',
          handle: 'editorial-sample',
        },
      ],
    }),
  };
const researchId = randomUUID(),
  reference = 'https://www.linkedin.com/posts/editorial-sample_topic-activity-12345';
const research = {
  get: async (value: string) =>
    value === researchId
      ? {
          ownerId: 'local-owner',
          sources: [{ url: reference }],
        }
      : null,
};
const draft = {
  goal: 'Build trusted professional authority',
  pillar: 'Software education',
  body: 'An evidence-backed professional discussion of developer education and public projects.',
  sourceUrls: [reference],
  researchRunId: researchId,
};

test('Private LinkedIn editorial lifecycle persists and resets approval after revision', async () => {
  const path = await mkdtemp(join(tmpdir(), 'utomator-editorial-'));
  try {
    const store = new LinkedInEditorialStore(account, research, path);
    const created = await store.create(id, draft);
    expect(created.status).toEqual('draft');
    expect(created.history.length).toEqual(1);
    expect((await new LinkedInEditorialStore(account, research, path).get(created.id))?.version).toEqual(1);
    expect((await store.list(id)).length).toEqual(1);
    await expect((store.update(created.id, 2, draft))).rejects.toThrow(/version conflict/);
    const approved = await store.transition(created.id, 1, 'approve');
    expect(approved.status).toEqual('approved');
    const revised = await store.update(created.id, 2, {
      ...draft,
      body: draft.body + ' Additional evidence.',
    });
    expect(revised.status).toEqual('draft');
    expect(revised.reviewedAt).toEqual(null);
    const archived = await store.transition(created.id, 3, 'archive');
    expect(archived.status).toEqual('archived');
    await expect((store.update(created.id, 4, draft))).rejects.toThrow(/Restore/);
    const restored = await store.transition(created.id, 4, 'restore');
    expect(restored.status).toEqual('draft');
    await expect((store.transition(created.id, 5, 'delete'))).rejects.toThrow(/confirmation/);
    const deleted = await store.transition(created.id, 5, 'delete', true);
    expect(deleted.status).toEqual('deleted');
    expect((await store.list(id)).length).toEqual(0);
    expect(editorialYaml(deleted)).toMatch(/externalPublishing: "not-performed"/);
    expect(editorialYaml(deleted)).toMatch(/contentSha256/);
  } finally {
    await rm(path, { recursive: true, force: true });
  }
});

test('Editorial input rejects unowned accounts, unrelated evidence, duplicate sources and invalid body', async () => {
  const path = await mkdtemp(join(tmpdir(), 'utomator-editorial-'));
  try {
    const store = new LinkedInEditorialStore(account, research, path);
    await expect((store.create(randomUUID(), draft))).rejects.toThrow(/not saved/);
    await expect((store.create(id, { ...draft, body: 'short' }))).rejects.toThrow(/Draft body/);
    await expect((store.create(id, { ...draft, sourceUrls: [reference, reference] }))).rejects.toThrow(/Duplicate/);
    await expect((store.create(id, {
        ...draft,
        sourceUrls: ['https://other.example/report'],
      }))).rejects.toThrow(/match/);
    await expect((store.create(id, { ...draft, unexpected: true }))).rejects.toThrow(/Unknown/);
    expect((await store.list()).length).toEqual(0);
  } finally {
    await rm(path, { recursive: true, force: true });
  }
});

test('Fastify editorial API verifies saved account and supports versioned CRUD with YAML', async () => {
  const root = await mkdtemp(join(tmpdir(), 'utomator-editorial-api-'));
  const app = buildApp({ socialWorkspaceRoot: root });
  try {
    await app.ready();
    const handle = 'editorial_' + randomUUID().slice(0, 8);
    const seeded = await new AccountStore(root).addSocial(0, {
      platform: 'linkedin',
      label: 'Test editorial account',
      handle,
      profileUrl: 'https://www.linkedin.com/in/' + handle + '/',
    });
    const accountId = seeded.socialAccounts[0]!.id;
    const bad = await app.inject({
      method: 'POST',
      url: '/linkedin/drafts',
      payload: {
        accountId: randomUUID(),
        content: { ...draft, researchRunId: null, sourceUrls: [] },
      },
    });
    expect(bad.statusCode).toEqual(400);
    const created = await app.inject({
      method: 'POST',
      url: '/linkedin/drafts',
      payload: {
        accountId,
        content: {
          ...draft,
          researchRunId: null,
          sourceUrls: [],
        },
      },
    });
    expect(created.statusCode).toEqual(201);
    const saved = created.json() as {
      id: string;
      version: number;
      status: string;
    };
    expect(saved.version).toEqual(1);
    expect((await app.inject('/linkedin/drafts/' + saved.id)).statusCode).toEqual(200);
    const list = (await app.inject('/linkedin/drafts?accountId=' + accountId)).json() as Array<{
      id: string;
    }>;
    expect(list.some((row) => row.id === saved.id)).toBeTruthy();
    const revision = await app.inject({
      method: 'PUT',
      url: '/linkedin/drafts/' + saved.id,
      payload: {
        expectedVersion: 1,
        content: {
          ...draft,
          researchRunId: null,
          sourceUrls: [],
          body: draft.body + ' New details.',
        },
      },
    });
    expect(revision.statusCode).toEqual(200);
    const stale = await app.inject({
      method: 'PUT',
      url: '/linkedin/drafts/' + saved.id,
      payload: {
        expectedVersion: 1,
        content: { ...draft, researchRunId: null, sourceUrls: [] },
      },
    });
    expect(stale.statusCode).toEqual(409);
    const review = await app.inject({
      method: 'POST',
      url: '/linkedin/drafts/' + saved.id + '/transition',
      payload: {
        expectedVersion: 2,
        action: 'approve',
      },
    });
    expect(review.statusCode).toEqual(200);
    expect(review.json().status).toEqual('approved');
    const yaml = await app.inject('/linkedin/drafts/' + saved.id + '/yaml');
    expect(yaml.statusCode).toEqual(200);
    expect(yaml.body).toMatch(/approved/);
    expect(yaml.body).toMatch(/externalPublishing: "not-performed"/);
    const noConfirm = await app.inject({
      method: 'POST',
      url: '/linkedin/drafts/' + saved.id + '/transition',
      payload: {
        expectedVersion: 3,
        action: 'delete',
      },
    });
    expect(noConfirm.statusCode).toEqual(400);
    const remove = await app.inject({
      method: 'POST',
      url: '/linkedin/drafts/' + saved.id + '/transition',
      payload: {
        expectedVersion: 3,
        action: 'delete',
        confirm: true,
      },
    });
    expect(remove.statusCode).toEqual(200);
    const remaining = (await app.inject('/linkedin/drafts?accountId=' + accountId)).json() as Array<{
      id: string;
    }>;
    expect(!remaining.some((row) => row.id === saved.id)).toBeTruthy();
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});
