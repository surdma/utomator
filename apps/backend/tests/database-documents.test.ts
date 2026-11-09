import { randomUUID } from 'node:crypto';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClient } from '@libsql/client';
import type { Page } from 'playwright';
import { expect, test } from 'vitest';
import { defaultPlan } from '../src/domain/workflow-plan.js';
import { ConnectorService } from '../src/infrastructure/connect/service.js';
import { createDocumentStore } from '../src/infrastructure/db/documents.js';
import { AccountStore } from '../src/infrastructure/profile/account-store.js';
import { WorkflowRegistry } from '../src/infrastructure/workflows/workflow-registry.js';
import { WorkflowPlanStore } from '../src/infrastructure/workflows/workflow-store.js';
import { removeTemp } from './support/remove-temp.js';

test('SQLite Drizzle persists connector verification, account identity and revision-pinned workflows', async () => {
  const root = await mkdtemp(join(tmpdir(), 'utomator-drizzle-'));
  const url = `file:${join(root, 'local.db')}`;
  const client = createClient({ url });
  try {
    // First-time schema creation equivalent to the initial Drizzle schema push.
    await client.execute(
      'CREATE TABLE utomator_documents(' +
        'owner_id TEXT NOT NULL,namespace TEXT NOT NULL,record_key TEXT NOT NULL,' +
        'version INTEGER NOT NULL,payload TEXT NOT NULL,updated_at TEXT NOT NULL,' +
        'PRIMARY KEY(owner_id,namespace,record_key))',
    );
    await client.close();
    const docs = await createDocumentStore({
      DB_FILE_NAME: url,
      NODE_ENV: 'development',
    });
    try {
      expect(docs.dialect).toEqual('sqlite');
      await docs.put('workflow-plans', 'linkedin-audit', { sample: true }, 0);
      await expect(docs.put('workflow-plans', 'linkedin-audit', { sample: false }, 0)).rejects.toThrow(
        /changed/,
      );
      const current = await docs.get<{ sample: boolean }>('workflow-plans', 'linkedin-audit');
      if (!current) throw new Error('stored workflow plan missing');
      expect(current.version).toEqual(1);
      expect(current.value.sample).toEqual(true);
      await docs.put('workflow-plans', 'linkedin-audit', { sample: false }, current.version);
      expect(
        (await docs.get<{ sample: boolean }>('workflow-plans', 'linkedin-audit'))?.value.sample,
      ).toEqual(false);

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
      expect(edited.revision).toEqual(1);
      const reopenedOwner = new AccountStore(root);
      reopenedOwner.setDocuments(docs);
      expect((await reopenedOwner.get()).profile.displayName).toEqual('Persisted Database Owner');

      const plans = new WorkflowPlanStore(join(root, 'legacy-plans'));
      plans.setDocuments(docs);
      const plan = {
        ...defaultPlan('linkedin', 'audit'),
        name: 'Stored YAML workflow',
      };
      await plans.save('linkedin', 'audit', plan);
      expect((await plans.get('linkedin', 'audit')).name).toEqual('Stored YAML workflow');

      const registry = new WorkflowRegistry(join(root, 'legacy-workflows'), join(root, 'legacy-plans'));
      registry.setDocuments(docs);
      const first = await registry.create(plan, 'li-audit');
      const second = await registry.update(first.id, 1, {
        ...plan,
        name: 'Revised YAML workflow',
      });
      expect(second.revision).toEqual(2);
      expect((await registry.get(first.id, 1))?.plan.name).toEqual('Stored YAML workflow');
      expect((await registry.get(first.id, 2))?.plan.name).toEqual('Revised YAML workflow');
      expect((await registry.list()).length).toEqual(1);

      const browser = {
        currentPage: undefined as Page | undefined,
        async open() {
          this.currentPage = {
            url: () => 'https://www.linkedin.com/in/database-owner/',
            goto: async () => null,
            getByRole: () => ({
              first: () => ({ waitFor: async () => undefined }),
            }),
            // The verifier scrapes the live page. This fixture has no DOM, so return an empty profile.
            evaluate: async () => ({
              displayName: '',
              headline: '',
              location: '',
              about: '',
              experience: '',
              education: '',
              skills: '',
              website: '',
              avatarUrl: '',
            }),
          } as unknown as Page;
          return this.currentPage;
        },
        async close() {
          this.currentPage = undefined;
        },
      };
      const connector = new ConnectorService(owner, () => browser, root);
      connector.setDocuments(docs);
      const account = (await owner.get()).socialAccounts.find((x) => x.platform === 'linkedin');
      if (!account) throw new Error('linkedin account missing');
      await connector.begin(account.id);
      expect((await connector.sync(account.id)).status).toEqual('connected');
      const connectorAgain = new ConnectorService(reopenedOwner, () => browser, root);
      connectorAgain.setDocuments(docs);
      expect((await connectorAgain.list()).find((x) => x.id === account.id)?.status).toEqual(
        'connected',
      );
      const saved = await docs.get<Record<string, { verifiedAt: string }>>('connectors', 'sessions');
      expect(saved?.value[account.id]?.verifiedAt).toBeTruthy();
      const restarted = await createDocumentStore({
        DB_FILE_NAME: url,
        NODE_ENV: 'development',
      });
      try {
        const afterRestartOwner = new AccountStore(root);
        afterRestartOwner.setDocuments(restarted);
        const afterRestart = new ConnectorService(afterRestartOwner, () => browser, root);
        afterRestart.setDocuments(restarted);
        expect((await afterRestart.list()).find((x) => x.id === account.id)?.status).toEqual(
          'connected',
        );
      } finally {
        await restarted.close();
      }
      await expect(
        import('node:fs/promises').then((fs) => fs.access(join(root, '.runtime', 'connectors.json'))),
      ).rejects.toThrow(/ENOENT/);
      await connector.disconnect(account.id);

      await expect(docs.remove('workflow-plans', 'linkedin-audit', 1)).rejects.toThrow(/changed/);
    } finally {
      await docs.close();
    }
    const reopened = await createDocumentStore({
      DB_FILE_NAME: url,
      NODE_ENV: 'development',
    });
    try {
      const row = await reopened.get<{ sample: boolean }>('workflow-plans', 'linkedin-audit');
      expect(row).toBeTruthy();
      expect(row.version).toEqual(3);
      expect((row.value as unknown as { name: string }).name).toEqual('Stored YAML workflow');
    } finally {
      await reopened.close();
    }
  } finally {
    await client.close();
    await removeTemp(root);
  }
});

test('LinkedIn draft documents remain tenant-isolated and revision guarded in SQLite', async () => {
  const root = await mkdtemp(join(tmpdir(), 'utomator-editorial-db-'));
  const url = `file:${join(root, 'editorial.db')}`;
  const raw = createClient({ url });
  try {
    await raw.execute(
      'CREATE TABLE utomator_documents(' +
        'owner_id TEXT NOT NULL,namespace TEXT NOT NULL,record_key TEXT NOT NULL,' +
        'version INTEGER NOT NULL,payload TEXT NOT NULL,updated_at TEXT NOT NULL,' +
        'PRIMARY KEY(owner_id,namespace,record_key))',
    );
    const ownerA = await createDocumentStore(
      {
        DB_FILE_NAME: url,
        NODE_ENV: 'development',
      },
      randomUUID(),
    );
    const ownerB = await createDocumentStore(
      {
        DB_FILE_NAME: url,
        NODE_ENV: 'development',
      },
      randomUUID(),
    );
    try {
      const id = randomUUID();
      await ownerA.put('linkedin-drafts', id, { owner: 'A', status: 'draft' }, 0);
      expect(await ownerB.get('linkedin-drafts', id)).toEqual(null);
      await ownerB.put('linkedin-drafts', id, { owner: 'B', status: 'approved' }, 0);
      expect((await ownerA.get<{ owner: string }>('linkedin-drafts', id))?.value.owner).toEqual('A');
      expect((await ownerB.get<{ owner: string }>('linkedin-drafts', id))?.value.owner).toEqual('B');
      await expect(ownerA.put('linkedin-drafts', id, { owner: 'A2' }, 0)).rejects.toThrow(/changed/);
      await ownerA.put('linkedin-drafts', id, { owner: 'A2' }, 1);
      expect((await ownerA.get<{ owner: string }>('linkedin-drafts', id))?.value.owner).toEqual('A2');
      expect((await ownerB.get<{ owner: string }>('linkedin-drafts', id))?.value.owner).toEqual('B');
    } finally {
      await ownerA.close();
      await ownerB.close();
    }
  } finally {
    await raw.close();
    await removeTemp(root);
  }
});
