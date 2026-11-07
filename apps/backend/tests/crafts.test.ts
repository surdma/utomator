import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createClient } from '@libsql/client';
import { expect, test } from 'vitest';
import {
  growthCapabilities,
  profileSections,
} from '../../frontend/modules/growth/components/linkedin-growth-capabilities.js';
import {
  type Craft,
  CraftLibrary,
  craftArchive,
  parseMdx,
  toMdx,
} from '../src/infrastructure/crafts/library.js';
import { createDocumentStore } from '../src/infrastructure/db/documents.js';

const root = await mkdtemp(join(tmpdir(), 'utomator-crafts-'));
const databaseFile = `file:${join(root, 'crafts.db')}`;
const client = createClient({ url: databaseFile });
await client.execute(
  'CREATE TABLE IF NOT EXISTS utomator_documents(' +
    'owner_id TEXT NOT NULL,namespace TEXT NOT NULL,record_key TEXT NOT NULL,' +
    'version INTEGER NOT NULL,payload TEXT NOT NULL,updated_at TEXT NOT NULL,' +
    'PRIMARY KEY(owner_id,namespace,record_key))',
);
client.close();
process.env.NODE_ENV = 'test';
process.env.UTOMATOR_TEST_DATABASE = 'true';
process.env.DB_FILE_NAME = databaseFile;
const { buildApp } = await import('../src/main.js');

const request = {
  slug: `content-review-${randomUUID().slice(0, 8)}`,
  name: 'Content review',
  category: 'content' as const,
  enabled: true,
  description: 'Evaluates verified writing. Use when reviewing an attributed social post.',
  steps: [
    {
      id: 'research',
      kind: 'research' as const,
      title: 'Gather evidence',
      body: 'Review source facts.',
      position: { x: 20, y: 40 },
    },
    {
      id: 'draft',
      kind: 'draft' as const,
      title: 'Write',
      body: 'Write from those facts.',
      position: { x: 350, y: 40 },
    },
    {
      id: 'review',
      kind: 'review' as const,
      title: 'Approve',
      body: 'Ask the owner to approve.',
      position: { x: 700, y: 40 },
    },
  ],
  links: [
    { id: 'research-to-draft', source: 'research', target: 'draft' },
    { id: 'draft-to-review', source: 'draft', target: 'review' },
  ],
};
const entries = (archive: Buffer) => {
  const files = new Map<string, string>();
  let i = 0;
  while (i + 30 <= archive.length && archive.readUInt32LE(i) === 0x04034b50) {
    const size = archive.readUInt32LE(i + 18),
      nameLength = archive.readUInt16LE(i + 26),
      extra = archive.readUInt16LE(i + 28);
    const name = archive.subarray(i + 30, i + 30 + nameLength).toString('utf8');
    const start = i + 30 + nameLength + extra;
    files.set(name, archive.subarray(start, start + size).toString('utf8'));
    i = start + size;
  }
  expect(archive.readUInt32LE(i)).toEqual(0x02014b50);
  return files;
};

test('predefined crafts are database-backed and immutable; clones and MDX edits stay personal', async () => {
  const app = buildApp();
  try {
    await app.ready();
    const initial = await app.inject('/crafts');
    expect(initial.statusCode).toEqual(200);
    const catalog = initial.json() as Craft[];
    const defaults = catalog.filter((c) => c.scope === 'default');
    expect(defaults.length).toEqual(21);
    const expectedIds = new Set(
      growthCapabilities.map((capability) => `default-growth-${capability.id}`),
    );
    expect(expectedIds.size).toEqual(15);
    for (const capability of growthCapabilities) {
      const flow = defaults.find((candidate) => candidate.id === `default-growth-${capability.id}`);
      expect(flow).toBeTruthy();
      expect(flow.steps.length).toEqual(5);
      expect(flow.links.length).toEqual(4);
      const source = toMdx(flow);
      for (const action of capability.actions) expect(source.includes(action)).toBeTruthy();
      expect(source.includes(capability.availableNow)).toBeTruthy();
      expect(source.includes(capability.requires)).toBeTruthy();
      expect(parseMdx(source, flow).steps).toEqual(flow.steps);
      expect(parseMdx(source, flow).links).toEqual(flow.links);
      const response = await app.inject(`/crafts/${flow.id}/mdx`);
      expect(response.statusCode).toEqual(200);
      expect(response.body).toEqual(source);
      if (capability.id === 'profile')
        for (const section of profileSections) expect(source.includes(section)).toBeTruthy();
    }
    const originalDefaults = [
      'personal-brand-positioning',
      'portfolio-proofing',
      'job-search-research',
      'application-tailoring',
      'content-series-planning',
      'thoughtful-social-engagement',
    ];
    for (const slug of originalDefaults) {
      const flow = defaults.find((candidate) => candidate.id === `default-${slug}`);
      expect(flow).toBeTruthy();
      expect(flow.steps.length).toEqual(5);
      expect(parseMdx(toMdx(flow), flow).links).toEqual(flow.links);
    }
    const predefined = defaults.find((c) => c.slug === 'content-series-planning')!;
    expect(predefined.id).toEqual('default-content-series-planning');
    const originalMdx = toMdx(predefined);
    expect(originalMdx).toMatch(/<CraftNode/);
    expect(parseMdx(originalMdx, predefined).links).toEqual(predefined.links);
    const protectedUpdate = await app.inject({
      method: 'PUT',
      url: `/crafts/${predefined.id}`,
      payload: {
        expectedVersion: predefined.version,
        craft: { ...request, slug: predefined.slug },
      },
    });
    expect(protectedUpdate.statusCode).toEqual(403);
    const protectedDelete = await app.inject({
      method: 'DELETE',
      url: `/crafts/${predefined.id}`,
      payload: { expectedVersion: predefined.version },
    });
    expect(protectedDelete.statusCode).toEqual(403);
    const cloned = await app.inject({
      method: 'POST',
      url: `/crafts/${predefined.id}/clone`,
    });
    expect(cloned.statusCode).toEqual(201);
    const personal = cloned.json() as Craft;
    expect(personal.scope).toEqual('personal');
    expect(personal.sourceCraftId).toEqual(predefined.id);
    expect(personal.id).not.toEqual(predefined.id);
    const revised = {
      ...personal,
      description: `${personal.description} Revised privately.`,
    };
    const updated = await app.inject({
      method: 'PUT',
      url: `/crafts/${personal.id}`,
      payload: { expectedVersion: personal.version, craft: revised },
    });
    expect(updated.statusCode).toEqual(200);
    const now = updated.json() as Craft;
    expect(now.version).toEqual(2);
    expect((await app.inject(`/crafts/${predefined.id}/mdx`)).body).toEqual(originalMdx);
    const source = await app.inject(`/crafts/${now.id}/mdx`);
    expect(source.statusCode).toEqual(200);
    expect(source.body).toMatch(/Revised privately/);
    const fromSource = await app.inject({
      method: 'PUT',
      url: `/crafts/${now.id}`,
      payload: {
        expectedVersion: now.version,
        mdx: source.body.replace('**Next:** [evidence](#step-evidence)', '**Next:** End'),
      },
    });
    expect(fromSource.statusCode).toEqual(200);
    const stale = await app.inject({
      method: 'PUT',
      url: `/crafts/${now.id}`,
      payload: { expectedVersion: 1, craft: revised },
    });
    expect(stale.statusCode).toEqual(409);
    const zip = entries(craftArchive(personal));
    expect(zip.has(`${personal.slug}/SKILL.md`)).toBeTruthy();
    expect(zip.has(`${personal.slug}/SKILL.mdx`)).toBeTruthy();
    expect(zip.get(`${personal.slug}/SKILL.mdx`)?.includes('<CraftNode')).toBeTruthy();
    const second = buildApp();
    try {
      await second.ready();
      const stored = await second.inject(`/crafts/${personal.id}`);
      expect(stored.statusCode).toEqual(200);
      expect(stored.json().version).toEqual(3);
    } finally {
      await second.close();
    }
    expect((await app.inject('/skills')).statusCode).toEqual(404);
    expect(
      (
        await app.inject({
          method: 'DELETE',
          url: `/crafts/${now.id}`,
          payload: { expectedVersion: 3 },
        })
      ).statusCode,
    ).toEqual(200);
    expect((await app.inject(`/crafts/${now.id}`)).statusCode).toEqual(404);
  } finally {
    await app.close();
  }
});

test('MDX graph conversion rejects malformed input and preserves portable archive', () => {
  const mdx = toMdx({ ...request, id: 'example', version: 1, updatedAt: '' });
  expect(parseMdx(mdx).steps.length).toEqual(3);
  const old = mdx.replaceAll('<CraftNode', '<SkillNode');
  expect(parseMdx(old).links).toEqual(parseMdx(mdx).links);
  expect(() => parseMdx(mdx.replace(`name: ${request.slug}`, 'name: ../../escape'))).toThrow(
    /frontmatter/,
  );
  expect(() => parseMdx(mdx.replace('Review source facts.', '## Step: fake | Fake'))).toThrow(
    /Invalid MDX/,
  );
  expect(() =>
    toMdx({
      ...request,
      links: [
        { id: 'research-to-draft', source: 'research', target: 'draft' },
        { id: 'draft-to-research', source: 'draft', target: 'research' },
      ],
    }),
  ).toThrow(/cycle/);
});

test('tenant identities isolate personal crafts but expose the same read-only defaults', async () => {
  const a = await createDocumentStore({ DB_FILE_NAME: databaseFile }, randomUUID());
  const b = await createDocumentStore({ DB_FILE_NAME: databaseFile }, randomUUID());
  const one = new CraftLibrary(join(root, 'missing-one.json'));
  const two = new CraftLibrary(join(root, 'missing-two.json'));
  one.setDocuments(a);
  two.setDocuments(b);
  try {
    await one.initialize();
    await two.initialize();
    const first = await one.create(request);
    expect((await one.get(first.id))?.name).toEqual(request.name);
    expect(await two.get(first.id)).toEqual(undefined);
    const copies = await two.list();
    expect(copies.filter((c) => c.scope === 'default').length).toEqual(21);
    expect(copies.filter((c) => c.scope === 'personal').length).toEqual(0);
    const baseA = await one.get('default-personal-brand-positioning');
    const baseB = await two.get('default-personal-brand-positioning');
    expect(toMdx(baseA!)).toEqual(toMdx(baseB!));
    const clone = await one.clone('default-personal-brand-positioning');
    expect(clone.scope).toEqual('personal');
    expect(await two.get(clone.id)).toEqual(undefined);
    await expect(() => two.update(first.id, request, 1)).rejects.toThrow(/not found/);
    await expect(() => one.remove('default-personal-brand-positioning', baseA!.version)).rejects.toThrow(
      /read-only/,
    );
  } finally {
    await a.close();
    await b.close();
  }
});

test('legacy JSON migrates once as private crafts without replacing predefined copies', async () => {
  const owner = randomUUID();
  const store = await createDocumentStore({ DB_FILE_NAME: databaseFile }, owner);
  const path = join(root, 'previous-library.json');
  const baseline = {
    ...request,
    id: randomUUID(),
    version: 4,
    updatedAt: new Date().toISOString(),
  };
  const modified = {
    ...baseline,
    slug: 'content-series-planning',
    name: 'My changed default',
  };
  await writeFile(path, JSON.stringify([baseline, modified]));
  const library = new CraftLibrary(path);
  library.setDocuments(store);
  try {
    await library.initialize();
    const initial = await library.list();
    expect(initial.some((c) => c.slug === baseline.slug && c.scope === 'personal')).toBeTruthy();
    expect(
      initial.some((c) => c.slug === 'content-series-planning-imported' && c.scope === 'personal'),
    ).toBeTruthy();
    expect(
      initial.some((c) => c.slug === 'content-series-planning' && c.scope === 'default'),
    ).toBeTruthy();
    const count = initial.length;
    await library.initialize();
    expect((await library.list()).length).toEqual(count);
    expect(
      (await store.get<{ result: string }>('craft-migrations', 'legacy-json-v1'))?.value?.result,
    ).toEqual('imported');
  } finally {
    await store.close();
  }
});

test('releasing a new default MDX revision does not alter personal clones', async () => {
  const originals = [
    'personal-brand-positioning',
    'portfolio-proofing',
    'job-search-research',
    'application-tailoring',
    'content-series-planning',
    'thoughtful-social-engagement',
    ...growthCapabilities.map((capability) => `growth-${capability.id}`),
  ];
  const dir = join(root, 'default-update');
  await mkdir(dir, { recursive: true });
  for (const slug of originals) {
    const original = await readFile(resolve(process.cwd(), 'crafts', 'default', `${slug}.mdx`), 'utf8');
    await writeFile(join(dir, `${slug}.mdx`), original);
  }
  const store = await createDocumentStore({ DB_FILE_NAME: databaseFile }, randomUUID());
  const library = new CraftLibrary(join(root, 'no-legacy-update.json'), dir);
  library.setDocuments(store);
  try {
    await library.initialize();
    const before = await library.get('default-content-series-planning');
    const clone = await library.clone(before!.id);
    const userVersion = toMdx(clone);
    const existingDefault = await readFile(join(dir, 'content-series-planning.mdx'), 'utf8');
    const updatedDefault = existingDefault.replace(
      'Use when designing a source-backed series of professional LinkedIn posts',
      'Use when planning a source-backed series of professional LinkedIn posts',
    );
    expect(updatedDefault).not.toEqual(existingDefault);
    await writeFile(join(dir, 'content-series-planning.mdx'), updatedDefault);
    await library.initialize();
    const after = await library.get(before!.id);
    expect(after!.version).toEqual(before!.version + 1);
    expect(toMdx(after!)).not.toEqual(toMdx(before!));
    expect(toMdx((await library.get(clone.id))!)).toEqual(userVersion);
  } finally {
    await store.close();
  }
});
