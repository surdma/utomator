import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { CareerStore } from '../src/infrastructure/profile/career-store.js';
import { removeTemp } from './support/remove-temp.js';

const identity = {
  name: 'Example Candidate',
  headline: 'Backend Engineer',
  location: 'Lagos',
  summary: 'Self-authored summary.',
  contacts: ['example@example.org'],
  education: [],
  experience: [],
  skills: ['API design'],
  projects: [],
  customSections: [],
};
async function withStore(fn: (store: CareerStore, root: string) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), 'career-store-'));
  try {
    await fn(new CareerStore(root), root);
  } finally {
    await removeTemp(root);
  }
}
test('new workspace has no portfolio owner, résumé or username', async () => {
  await withStore(async (store, root) => {
    const initial = await store.get();
    expect(initial.resumes).toEqual([]);
    expect(initial.profile.name).toEqual('');
    expect(initial.profile.headline).toEqual('');
    await expect(store.createResume(0)).rejects.toThrow(/Complete your career source/);
    const saved = await store.updateProfile(0, identity);
    expect(saved.profile.name).toEqual('Example Candidate');
    const reopened = await new CareerStore(root).get();
    expect(reopened.profile).toEqual(saved.profile);
    expect(reopened.resumes).toEqual([]);
  });
});
test('user-authored profile produces independently editable saved résumés', async () => {
  await withStore(async (store, root) => {
    await store.updateProfile(0, identity);
    const first = await store.createResume(1);
    const original = first.resumes[0]!;
    const cloned = await store.createResume(2, original.id);
    const duplicate = cloned.resumes[0]!;
    const saved = await store.updateResume(3, duplicate.id, {
      ...duplicate,
      label: 'Tailored version',
      summary: 'New summary',
    });
    expect(saved.resumes[0]?.summary).toEqual('New summary');
    expect(saved.resumes[1]?.summary).toEqual(original.summary);
    expect(saved.profile.summary).toEqual(identity.summary);
    const reloaded = await new CareerStore(root).get();
    expect(reloaded.revision).toEqual(4);
    expect(reloaded.resumes[0]?.label).toEqual('Tailored version');
    const removed = await store.deleteResume(4, duplicate.id);
    expect(removed.resumes.length).toEqual(1);
    await expect(store.deleteResume(5, original.id)).rejects.toThrow(/at least one/);
  });
});
test('career profile edits keep optimistic revision and field validation', async () => {
  await withStore(async (store) => {
    const initial = await store.get();
    const outcomes = await Promise.allSettled([
      store.updateProfile(initial.revision, identity),
      store.updateProfile(initial.revision, { ...identity, location: 'Abuja' }),
    ]);
    expect(outcomes.filter((x) => x.status === 'fulfilled').length).toEqual(1);
    expect(outcomes.filter((x) => x.status === 'rejected').length).toEqual(1);
    expect(() => store.updateProfile(1, { ...identity, name: '' })).toThrow(/required/);
    await expect(store.createResume(1, '00000000-0000-4000-8000-aaaaaaaaaaaa')).rejects.toThrow(
      /not found/,
    );
  });
});
