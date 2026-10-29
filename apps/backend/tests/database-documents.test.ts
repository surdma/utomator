import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { createClient } from '@libsql/client';
import { createDocumentStore } from '../src/db/documents.js';
import { AccountStore } from '../src/profile/account-store.js';
import { WorkflowPlanStore } from '../src/core/workflow-store.js';
import { WorkflowRegistry } from '../src/core/workflow-registry.js';
import { defaultPlan } from '../src/core/workflow-plan.js';
import { ConnectorService } from '../src/core/connectors.js';
import type { Page } from 'playwright';

test('SQLite Drizzle persists connector verification, account identity and revision-pinned workflows', async () => {
  const root = await mkdtemp(join(tmpdir(), 'utomator-drizzle-'));
  const url = 'file:' + join(root, 'local.db');
  const client = createClient({ url });
  try {
    // First-time schema creation equivalent to the initial Drizzle schema push.
    await client.execute(
      'CREATE TABLE utomator_documents(' +
        'owner_id TEXT NOT NULL,namespace TEXT NOT NULL,record_key TEXT NOT NULL,' +
        'version INTEGER NOT NULL,payload TEXT NOT NULL,updated_at TEXT NOT NULL,' +
        'PRIMARY KEY(owner_id,namespace,record_key))',
    );
    client.close();
    const docs = await createDocumentStore({ DB_FILE_NAME: url });
    try {
      assert.equal(docs.dialect, 'sqlite');
      await docs.put('workflow-plans', 'linkedin-audit', { sample: true }, 0);
      await assert.rejects(
        docs.put('workflow-plans', 'linkedin-audit', { sample: false }, 0),
        /changed/,
      );
      const current = await docs.get<{ sample: boolean }>('workflow-plans', 'linkedin-audit');
      assert.equal(current?.version, 1);
      assert.equal(current?.value.sample, true);
      await docs.put('workflow-plans', 'linkedin-audit', { sample: false }, current!.version);
      assert.equal(
        (await docs.get<{ sample: boolean }>('workflow-plans', 'linkedin-audit'))?.value.sample,
        false,
      );

      const owner = new AccountStore(root);
      owner.setDocuments(docs);
      const original = await owner.get();
      const edited = await owner.updateProfile(original.revision, {
        displayName: 'Persisted Database Owner',
        email: 'database@example.org',
        location: 'Lagos',
        about: 'Testing',
      });
      await owner.addSocial(edited.revision, {
        platform: 'linkedin',
        label: 'Database owner',
        handle: 'database-owner',
        profileUrl: 'https://www.linkedin.com/in/database-owner/',
      });
      assert.equal(edited.revision, 1);
      const reopenedOwner = new AccountStore(root);
      reopenedOwner.setDocuments(docs);
      assert.equal((await reopenedOwner.get()).profile.displayName, 'Persisted Database Owner');

      const plans = new WorkflowPlanStore(join(root, 'legacy-plans'));
      plans.setDocuments(docs);
      const plan = { ...defaultPlan('linkedin', 'audit'), name: 'Stored YAML workflow' };
      await plans.save('linkedin', 'audit', plan);
      assert.equal((await plans.get('linkedin', 'audit')).name, 'Stored YAML workflow');

      const registry = new WorkflowRegistry(join(root, 'legacy-workflows'), join(root, 'legacy-plans'));
      registry.setDocuments(docs);
      const first = await registry.create(plan, 'li-audit');
      const second = await registry.update(first.id, 1, { ...plan, name: 'Revised YAML workflow' });
      assert.equal(second.revision, 2);
      assert.equal((await registry.get(first.id, 1))?.plan.name, 'Stored YAML workflow');
      assert.equal((await registry.get(first.id, 2))?.plan.name, 'Revised YAML workflow');
      assert.equal((await registry.list()).length, 1);

      const browser = {
        currentPage: undefined as Page | undefined,
        async open() {
          this.currentPage = {
            url: () => 'https://www.linkedin.com/in/database-owner/',
            goto: async () => null,
            getByRole: () => ({ first: () => ({ waitFor: async () => undefined }) }),
          } as unknown as Page;
          return this.currentPage;
        },
        async close() {
          this.currentPage = undefined;
        },
      };
      const connector = new ConnectorService(owner, () => browser, root);
      connector.setDocuments(docs);
      const account = (await owner.get()).socialAccounts.find((x) => x.platform === 'linkedin')!;
      await connector.begin(account.id);
      assert.equal((await connector.sync(account.id)).status, 'connected');
      const connectorAgain = new ConnectorService(reopenedOwner, () => browser, root);
      connectorAgain.setDocuments(docs);
      assert.equal((await connectorAgain.list()).find((x) => x.id === account.id)?.status, 'connected');
      const saved = await docs.get<Record<string, { verifiedAt: string }>>('connectors', 'sessions');
      assert(saved?.value[account.id]?.verifiedAt, 'verification must be persisted in SQL');
      const restarted = await createDocumentStore({ DB_FILE_NAME: url });
      try {
        const afterRestartOwner = new AccountStore(root);
        afterRestartOwner.setDocuments(restarted);
        const afterRestart = new ConnectorService(afterRestartOwner, () => browser, root);
        afterRestart.setDocuments(restarted);
        assert.equal(
          (await afterRestart.list()).find((x) => x.id === account.id)?.status,
          'connected',
          'a new SQL client and service must restore the verified account',
        );
      } finally {
        await restarted.close();
      }
      await assert.rejects(
        import('node:fs/promises').then((fs) => fs.access(join(root, '.runtime', 'connectors.json'))),
        /ENOENT/,
        'SQL-backed connector updates must not create JSON mirrors',
      );
      await connector.disconnect(account.id);

      await assert.rejects(docs.remove('workflow-plans', 'linkedin-audit', 1), /changed/);
    } finally {
      await docs.close();
    }
    const reopened = await createDocumentStore({ DB_FILE_NAME: url });
    try {
      const row = await reopened.get<{ sample: boolean }>('workflow-plans', 'linkedin-audit');
      assert(row, 'SQLite record must survive closing the client');
      assert.equal(row.version, 3);
      assert.equal((row.value as { name: string }).name, 'Stored YAML workflow');
    } finally {
      await reopened.close();
    }
  } finally {
    client.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('LinkedIn draft documents remain tenant-isolated and revision guarded in SQLite', async () => {
  const root = await mkdtemp(join(tmpdir(), 'utomator-editorial-db-'));
  const url = 'file:' + join(root, 'editorial.db');
  const raw = createClient({ url });
  try {
    await raw.execute(
      'CREATE TABLE utomator_documents(' +
        'owner_id TEXT NOT NULL,namespace TEXT NOT NULL,record_key TEXT NOT NULL,' +
        'version INTEGER NOT NULL,payload TEXT NOT NULL,updated_at TEXT NOT NULL,' +
        'PRIMARY KEY(owner_id,namespace,record_key))',
    );
    const ownerA = await createDocumentStore({ DB_FILE_NAME: url }, randomUUID());
    const ownerB = await createDocumentStore({ DB_FILE_NAME: url }, randomUUID());
    try {
      const id = randomUUID();
      await ownerA.put('linkedin-drafts', id, { owner: 'A', status: 'draft' }, 0);
      assert.equal(await ownerB.get('linkedin-drafts', id), null);
      await ownerB.put('linkedin-drafts', id, { owner: 'B', status: 'approved' }, 0);
      assert.equal((await ownerA.get<{ owner: string }>('linkedin-drafts', id))?.value.owner, 'A');
      assert.equal((await ownerB.get<{ owner: string }>('linkedin-drafts', id))?.value.owner, 'B');
      await assert.rejects(ownerA.put('linkedin-drafts', id, { owner: 'A2' }, 0), /changed/);
      await ownerA.put('linkedin-drafts', id, { owner: 'A2' }, 1);
      assert.equal((await ownerA.get<{ owner: string }>('linkedin-drafts', id))?.value.owner, 'A2');
      assert.equal((await ownerB.get<{ owner: string }>('linkedin-drafts', id))?.value.owner, 'B');
    } finally {
      await ownerA.close();
      await ownerB.close();
    }
  } finally {
    raw.close();
    await rm(root, { recursive: true, force: true });
  }
});
