import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AccountStore } from '../src/profile/account-store.js';
import { randomUUID } from 'node:crypto';
import { LinkedInEditorialStore, editorialYaml } from '../src/core/linkedin-editorial.js';

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
    assert.equal(created.status, 'draft');
    assert.equal(created.history.length, 1);
    assert.equal(
      (await new LinkedInEditorialStore(account, research, path).get(created.id))?.version,
      1,
    );
    assert.equal((await store.list(id)).length, 1);
    await assert.rejects(store.update(created.id, 2, draft), /version conflict/);
    const approved = await store.transition(created.id, 1, 'approve');
    assert.equal(approved.status, 'approved');
    const revised = await store.update(created.id, 2, {
      ...draft,
      body: draft.body + ' Additional evidence.',
    });
    assert.equal(revised.status, 'draft');
    assert.equal(revised.reviewedAt, null);
    const archived = await store.transition(created.id, 3, 'archive');
    assert.equal(archived.status, 'archived');
    await assert.rejects(store.update(created.id, 4, draft), /Restore/);
    const restored = await store.transition(created.id, 4, 'restore');
    assert.equal(restored.status, 'draft');
    await assert.rejects(store.transition(created.id, 5, 'delete'), /confirmation/);
    const deleted = await store.transition(created.id, 5, 'delete', true);
    assert.equal(deleted.status, 'deleted');
    assert.equal((await store.list(id)).length, 0);
    assert.match(editorialYaml(deleted), /externalPublishing: "not-performed"/);
    assert.match(editorialYaml(deleted), /contentSha256/);
  } finally {
    await rm(path, { recursive: true, force: true });
  }
});

test('Editorial input rejects unowned accounts, unrelated evidence, duplicate sources and invalid body', async () => {
  const path = await mkdtemp(join(tmpdir(), 'utomator-editorial-'));
  try {
    const store = new LinkedInEditorialStore(account, research, path);
    await assert.rejects(store.create(randomUUID(), draft), /not saved/);
    await assert.rejects(store.create(id, { ...draft, body: 'short' }), /Draft body/);
    await assert.rejects(
      store.create(id, { ...draft, sourceUrls: [reference, reference] }),
      /Duplicate/,
    );
    await assert.rejects(
      store.create(id, { ...draft, sourceUrls: ['https://other.example/report'] }),
      /match/,
    );
    await assert.rejects(store.create(id, { ...draft, unexpected: true }), /Unknown/);
    assert.equal((await store.list()).length, 0);
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
      payload: { accountId: randomUUID(), content: { ...draft, researchRunId: null, sourceUrls: [] } },
    });
    assert.equal(bad.statusCode, 400);
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
    assert.equal(created.statusCode, 201, created.body);
    const saved = created.json() as { id: string; version: number; status: string };
    assert.equal(saved.version, 1);
    assert.equal((await app.inject('/linkedin/drafts/' + saved.id)).statusCode, 200);
    const list = (await app.inject('/linkedin/drafts?accountId=' + accountId)).json() as Array<{
      id: string;
    }>;
    assert.ok(list.some((row) => row.id === saved.id));
    const revision = await app.inject({
      method: 'PUT',
      url: '/linkedin/drafts/' + saved.id,
      payload: {
        expectedVersion: 1,
        content: { ...draft, researchRunId: null, sourceUrls: [], body: draft.body + ' New details.' },
      },
    });
    assert.equal(revision.statusCode, 200, revision.body);
    const stale = await app.inject({
      method: 'PUT',
      url: '/linkedin/drafts/' + saved.id,
      payload: {
        expectedVersion: 1,
        content: { ...draft, researchRunId: null, sourceUrls: [] },
      },
    });
    assert.equal(stale.statusCode, 409);
    const review = await app.inject({
      method: 'POST',
      url: '/linkedin/drafts/' + saved.id + '/transition',
      payload: {
        expectedVersion: 2,
        action: 'approve',
      },
    });
    assert.equal(review.statusCode, 200, review.body);
    assert.equal(review.json().status, 'approved');
    const yaml = await app.inject('/linkedin/drafts/' + saved.id + '/yaml');
    assert.equal(yaml.statusCode, 200);
    assert.match(yaml.body, /approved/);
    assert.match(yaml.body, /externalPublishing: "not-performed"/);
    const noConfirm = await app.inject({
      method: 'POST',
      url: '/linkedin/drafts/' + saved.id + '/transition',
      payload: {
        expectedVersion: 3,
        action: 'delete',
      },
    });
    assert.equal(noConfirm.statusCode, 400);
    const remove = await app.inject({
      method: 'POST',
      url: '/linkedin/drafts/' + saved.id + '/transition',
      payload: {
        expectedVersion: 3,
        action: 'delete',
        confirm: true,
      },
    });
    assert.equal(remove.statusCode, 200);
    const remaining = (await app.inject('/linkedin/drafts?accountId=' + accountId)).json() as Array<{
      id: string;
    }>;
    assert.ok(!remaining.some((row) => row.id === saved.id));
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});
