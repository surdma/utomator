import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClient } from '@libsql/client';
import { checkedOwnerId, createDocumentStore, LOCAL_OWNER_ID } from '../src/db/documents.js';
import { AccountStore } from '../src/profile/account-store.js';
import { ConnectorService } from '../src/connect/service.js';
import { CareerStore } from '../src/profile/career-store.js';
import { WorkflowPlanStore } from '../src/workflows/workflow-store.js';
import { WorkflowRegistry } from '../src/workflows/workflow-registry.js';
import { defaultPlan } from '../src/workflows/workflow-plan.js';

const alice = '11111111-1111-4111-8111-111111111111';
const bob = '22222222-2222-4222-8222-222222222222';
const professional = {
  name: 'Alice Example',
  headline: 'Software engineer',
  location: 'Lagos',
  summary: 'Authored by Alice.',
  contacts: [],
  education: [],
  experience: [],
  skills: ['TypeScript'],
  projects: [],
  customSections: [],
};

test('tenant identifiers are internal UUIDs, not untrusted profile handles', () => {
  assert.equal(checkedOwnerId(LOCAL_OWNER_ID), 'local-owner');
  assert.equal(checkedOwnerId(alice.toUpperCase()), alice);
  for (const input of [
    'surdma',
    '',
    '../local-owner',
    'user@example.org',
    '11111111-1111-1111-1111-111111111111',
  ]) {
    assert.throws(() => checkedOwnerId(input), /verified internal UUID/);
  }
});

test('SQLite isolates account, career, connector and workflow documents across verified owners', async () => {
  const root = await mkdtemp(join(tmpdir(), 'utomator-tenants-'));
  const databasePath = 'file:' + join(root, 'tenants.db');
  const setup = createClient({ url: databasePath });
  try {
    await setup.execute(
      'CREATE TABLE utomator_documents(' +
        'owner_id TEXT NOT NULL,namespace TEXT NOT NULL,record_key TEXT NOT NULL,' +
        'version INTEGER NOT NULL,payload TEXT NOT NULL,updated_at TEXT NOT NULL,' +
        'PRIMARY KEY(owner_id,namespace,record_key))',
    );
    setup.close();

    // Prove tenant readers do not import the historical local operator data.
    await mkdir(join(root, '.runtime'), { recursive: true });
    await writeFile(
      join(root, '.runtime', 'account-studio.json'),
      JSON.stringify({
        revision: 1,
        profile: {
          displayName: 'Historical Operator',
          email: 'local@example.org',
          location: 'Remote',
          about: '',
        },
        socialAccounts: [],
      }),
    );
    await writeFile(
      join(root, '.runtime', 'career-studio.json'),
      JSON.stringify({
        revision: 1,
        profile: {
          ...professional,
          name: 'Historical Operator',
          headline: 'Local only',
        },
        resumes: [],
      }),
    );
    const localPlan = {
      ...defaultPlan('linkedin', 'audit'),
      name: 'Private legacy local workflow',
    };
    await mkdir(join(root, '.runtime', 'workflow-plans'), { recursive: true });
    await writeFile(
      join(root, '.runtime', 'workflow-plans', 'linkedin-audit.json'),
      JSON.stringify(localPlan),
    );

    const dbAlice = await createDocumentStore({ DB_FILE_NAME: databasePath }, alice);
    const dbBob = await createDocumentStore({ DB_FILE_NAME: databasePath }, bob);
    try {
      assert.equal(dbAlice.ownerId, alice);
      assert.equal(dbBob.ownerId, bob);
      const accountAlice = new AccountStore(root),
        accountBob = new AccountStore(root);
      accountAlice.setDocuments(dbAlice);
      accountBob.setDocuments(dbBob);
      assert.equal((await accountAlice.get()).profile.displayName, '');
      assert.equal((await accountBob.get()).profile.displayName, '');
      const aliceAccount = await accountAlice.addSocial(0, {
        platform: 'linkedin',
        label: 'Alice',
        handle: 'alice-profile',
        profileUrl: 'https://www.linkedin.com/in/alice-profile/',
      });
      assert.equal(aliceAccount.socialAccounts[0]?.handle, 'alice-profile');
      assert.deepEqual((await accountBob.get()).socialAccounts, []);
      assert.equal(await dbBob.get('account', 'owner'), null);
      const bobAccount = await accountBob.addSocial(0, {
        platform: 'linkedin',
        label: 'Bob',
        handle: 'bob-profile',
        profileUrl: 'https://www.linkedin.com/in/bob-profile/',
      });
      const bobId = bobAccount.socialAccounts[0]!.id;
      await writeFile(
        join(root, '.runtime', 'connectors.json'),
        JSON.stringify({
          [bobId]: {
            platform: 'linkedin',
            handle: 'bob-profile',
            profileUrl: 'https://www.linkedin.com/in/bob-profile/',
            verifiedAt: '2026-10-28T00:00:00Z',
          },
        }),
      );
      const bobConnections = new ConnectorService(accountBob, undefined, root);
      bobConnections.setDocuments(dbBob);
      assert.equal(
        (await bobConnections.list())[0]?.status,
        'disconnected',
        'tenant must not import a matching verified session from local JSON',
      );

      const careerAlice = new CareerStore(root),
        careerBob = new CareerStore(root);
      careerAlice.setDocuments(dbAlice);
      careerBob.setDocuments(dbBob);
      assert.equal((await careerAlice.get()).profile.name, '');
      assert.equal((await careerBob.get()).profile.name, '');
      const saved = await careerAlice.updateProfile(0, professional);
      assert.equal(saved.revision, 1);
      assert.equal((await careerAlice.get()).profile.name, 'Alice Example');
      assert.equal((await careerBob.get()).profile.name, '');
      await careerBob.updateProfile(0, {
        ...professional,
        name: 'Bob Example',
        headline: 'Teacher',
      });
      assert.equal((await careerBob.get()).profile.name, 'Bob Example');
      assert.equal((await careerAlice.get()).profile.name, 'Alice Example');

      const workflowAlice = new WorkflowPlanStore(join(root, '.runtime', 'workflow-plans'));
      const workflowBob = new WorkflowPlanStore(join(root, '.runtime', 'workflow-plans'));
      workflowAlice.setDocuments(dbAlice);
      workflowBob.setDocuments(dbBob);
      assert.notEqual((await workflowBob.get('linkedin', 'audit')).name, localPlan.name);
      await workflowAlice.save('linkedin', 'audit', {
        ...localPlan,
        name: 'Alice selected workflow',
      });
      assert.equal((await workflowAlice.get('linkedin', 'audit')).name, 'Alice selected workflow');
      assert.notEqual((await workflowBob.get('linkedin', 'audit')).name, 'Alice selected workflow');

      const registryRoot = join(root, '.runtime', 'workflows');
      await mkdir(registryRoot, { recursive: true });
      const legacyId = '33333333-3333-4333-8333-333333333333';
      await writeFile(
        join(registryRoot, legacyId + '.json'),
        JSON.stringify({
          id: legacyId,
          ownerId: 'local-owner',
          templateId: null,
          revision: 1,
          createdAt: '2026-10-28T00:00:00Z',
          updatedAt: '2026-10-28T00:00:00Z',
          plan: defaultPlan('linkedin', 'audit'),
        }),
      );
      const registryAlice = new WorkflowRegistry(registryRoot),
        registryBob = new WorkflowRegistry(registryRoot);
      registryAlice.setDocuments(dbAlice);
      registryBob.setDocuments(dbBob);
      const workflow = await registryAlice.create(defaultPlan('linkedin', 'audit'), 'li-audit');
      assert.equal(workflow.ownerId, alice);
      assert.equal(await registryBob.get(workflow.id), null);
      assert.deepEqual(await registryBob.list(), []);
      assert.equal(
        await registryBob.get(legacyId),
        null,
        'tenant must not read the original local-owner workflow file',
      );
      assert.equal((await registryAlice.get(workflow.id))?.ownerId, alice);

      await dbAlice.put(
        'connectors',
        'sessions',
        { 'alice-profile': { verifiedAt: '2026-10-28T00:00:00Z' } },
        0,
      );
      assert.equal(await dbBob.get('connectors', 'sessions'), null);
      assert.deepEqual(await dbBob.list('connectors'), []);
      await assert.rejects(dbBob.remove('connectors', 'sessions', 1), /changed/);

      // Owner data is not a process-local map. A fresh DB client sees the right tenant.
      const reopened = await createDocumentStore({ DB_FILE_NAME: databasePath }, alice);
      try {
        const savedAccount = new AccountStore(root);
        savedAccount.setDocuments(reopened);
        assert.equal((await savedAccount.get()).socialAccounts[0]?.handle, 'alice-profile');
        const savedCareer = new CareerStore(root);
        savedCareer.setDocuments(reopened);
        assert.equal((await savedCareer.get()).profile.name, 'Alice Example');
      } finally {
        await reopened.close();
      }
    } finally {
      await Promise.all([dbAlice.close(), dbBob.close()]);
    }
  } finally {
    setup.close();
    await rm(root, { recursive: true, force: true });
  }
});
