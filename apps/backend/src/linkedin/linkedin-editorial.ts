import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { DocumentStore } from '../db/documents.js';

type EditorialAccounts = {
  get(): Promise<{
    socialAccounts: Array<{ id: string; platform: string; profileUrl: string }>;
  }>;
};
type EditorialResearch = {
  get(id: string): Promise<{ ownerId: string; sources: Array<{ url: string }> } | null>;
};
export type EditorialStatus =
  | 'draft'
  | 'approved'
  | 'archived'
  | 'deleted'
  | 'publishing'
  | 'published'
  | 'publish-failed'
  | 'publication-uncertain';
export type EditorialContent = {
  goal: string;
  pillar: string;
  body: string;
  sourceUrls: string[];
  researchRunId: string | null;
};
export type EditorialDraft = {
  id: string;
  ownerId: string;
  accountId: string;
  accountProfileUrl: string;
  platform: 'linkedin';
  status: EditorialStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
  reviewedAt: string | null;
  content: EditorialContent;
  publication?: {
    attemptId: string;
    status: 'pending' | 'published' | 'publish-failed' | 'publication-uncertain';
    requestedAt: string;
    postUrn?: string;
  };
  history: Array<{
    version: number;
    event:
      | 'created'
      | 'edited'
      | 'approved'
      | 'reopened'
      | 'archived'
      | 'deleted'
      | 'restored'
      | 'publication-requested'
      | 'published'
      | 'publication-failed'
      | 'publication-uncertain';
    timestamp: string;
    contentSha256: string;
  }>;
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const digest = (data: unknown) => createHash('sha256').update(JSON.stringify(data)).digest('hex');
const field = (value: unknown, label: string, min: number, max: number): string => {
  if (typeof value !== 'string' || value.trim().length < min || value.length > max)
    throw Error(label + ' must contain ' + min + '–' + max + ' characters');
  return value.trim();
};
const exactUrl = (value: unknown): string => {
  const text = field(value, 'Evidence URL', 12, 500);
  let u: URL;
  try {
    u = new URL(text);
  } catch {
    throw Error('Evidence URL must use HTTPS');
  }
  if (u.protocol !== 'https:' || u.username || u.password || u.port || u.search || u.hash)
    throw Error('Evidence URL must use HTTPS without credentials, ports or parameters');
  return u.href;
};
const shape = (raw: unknown): EditorialContent => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    throw Error('Draft content must be an object');
  const value = raw as Record<string, unknown>;
  const allowed = ['goal', 'pillar', 'body', 'sourceUrls', 'researchRunId'];
  if (Object.keys(value).some((k) => !allowed.includes(k))) throw Error('Unknown draft content field');
  if (!Array.isArray(value.sourceUrls) || value.sourceUrls.length > 8)
    throw Error('Supply 0–8 evidence links');
  const sourceUrls = value.sourceUrls.map(exactUrl);
  if (new Set(sourceUrls).size !== sourceUrls.length) throw Error('Duplicate evidence URL');
  const researchRunId =
    value.researchRunId === undefined || value.researchRunId === null || value.researchRunId === ''
      ? null
      : field(value.researchRunId, 'Research run ID', 36, 36);
  if (researchRunId !== null && !uuid.test(researchRunId)) throw Error('Invalid research run ID');
  return {
    goal: field(value.goal, 'Goal', 8, 220),
    pillar: field(value.pillar, 'Content pillar', 3, 100),
    body: field(value.body, 'Draft body', 20, 3000),
    sourceUrls,
    researchRunId,
  };
};
export function editorialYaml(draft: EditorialDraft): string {
  const line = (key: string, value: string | number) => '    ' + key + ': ' + JSON.stringify(value);
  return [
    'apiVersion: "utomator.dev/v1"',
    'kind: "LinkedInEditorialDraft"',
    'metadata:',
    '  id: ' + JSON.stringify(draft.id),
    '  version: ' + draft.version,
    'spec:',
    '  platform: "linkedin"',
    '  execution: "internal-draft-only"',
    '  status: ' + JSON.stringify(draft.status),
    '  externalPublishing: ' +
      JSON.stringify(
        draft.status === 'published'
          ? 'confirmed'
          : draft.status === 'publication-uncertain' || draft.status === 'publishing'
            ? 'submitted-unconfirmed'
            : draft.status === 'publish-failed'
              ? 'rejected'
              : 'not-performed',
      ),
    ...(draft.publication?.postUrn
      ? ['  providerPostUrn: ' + JSON.stringify(draft.publication.postUrn)]
      : []),
    '  input:',
    line('accountId', draft.accountId),
    line('contentSchema', 'linkedin-editorial/v1'),
    '  steps:',
    ...draft.history.flatMap((entry, index) => [
      '    version' + (index + 1) + ':',
      line('event', entry.event),
      line('revision', entry.version),
      line('contentSha256', entry.contentSha256),
      line('timestamp', entry.timestamp),
    ]),
    '',
  ].join('\n');
}
export class LinkedInEditorialStore {
  private readonly root: string;
  private readonly accounts: EditorialAccounts;
  private readonly research: EditorialResearch;
  private documents?: DocumentStore;
  private mutation: Promise<unknown> = Promise.resolve();
  constructor(
    accounts: EditorialAccounts,
    research: EditorialResearch,
    root = resolve(process.cwd(), '.runtime', 'linkedin-drafts'),
  ) {
    this.root = root;
    this.accounts = accounts;
    this.research = research;
  }
  setDocuments(documents: DocumentStore) {
    this.documents = documents;
  }
  private serialize<T>(work: () => Promise<T>): Promise<T> {
    const current = this.mutation.then(work);
    this.mutation = current.catch(() => undefined);
    return current;
  }
  private path(id: string) {
    if (!uuid.test(id)) throw Error('Invalid draft ID');
    return resolve(this.root, id + '.json');
  }
  private async account(accountId: string) {
    if (!uuid.test(accountId)) throw Error('Invalid LinkedIn account ID');
    const item = (await this.accounts.get()).socialAccounts.find(
      (row) => row.id === accountId && row.platform === 'linkedin',
    );
    if (!item) throw Error('LinkedIn account is not saved in this workspace');
    return item;
  }
  private async checkedContent(raw: unknown): Promise<EditorialContent> {
    const data = shape(raw);
    if (data.researchRunId) {
      const run = await this.research.get(data.researchRunId);
      if (!run) throw Error('LinkedIn research report not found');
      if (this.documents && run.ownerId !== this.documents.ownerId)
        throw Error('Research report belongs to another owner');
      if (
        !data.sourceUrls.length ||
        data.sourceUrls.some((url) => !run.sources.some((source) => source.url === url))
      )
        throw Error('Evidence links must match the selected research report');
    }
    return data;
  }
  private async read(id: string): Promise<EditorialDraft | null> {
    this.path(id);
    if (this.documents)
      return (await this.documents.get<EditorialDraft>('linkedin-drafts', id))?.value ?? null;
    try {
      return JSON.parse(await readFile(this.path(id), 'utf8')) as EditorialDraft;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }
  async get(id: string): Promise<EditorialDraft | null> {
    return this.read(id);
  }
  async list(accountId?: string): Promise<EditorialDraft[]> {
    if (accountId) await this.account(accountId);
    let drafts: EditorialDraft[];
    if (this.documents)
      drafts = (await this.documents.list<EditorialDraft>('linkedin-drafts')).map((row) => row.value);
    else {
      let filenames: string[];
      try {
        filenames = await readdir(this.root);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
        throw error;
      }
      const rows = await Promise.all(
        filenames
          .filter((name) => uuid.test(name.replace(/\.json$/, '')) && name.endsWith('.json'))
          .map((name) => this.read(name.slice(0, -5))),
      );
      drafts = rows.filter((row): row is EditorialDraft => row !== null);
    }
    return drafts
      .filter((row) => row.status !== 'deleted' && (!accountId || row.accountId === accountId))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, 100);
  }
  private async persist(draft: EditorialDraft, expectedVersion: number): Promise<void> {
    if (this.documents) {
      await this.documents.put('linkedin-drafts', draft.id, draft, expectedVersion);
      return;
    }
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    const destination = this.path(draft.id),
      temporary = destination + '.' + randomUUID();
    await writeFile(temporary, JSON.stringify(draft) + '\n', {
      flag: 'wx',
      mode: 0o600,
    });
    try {
      await rename(temporary, destination);
    } catch (error) {
      await unlink(temporary).catch(() => {});
      throw error;
    }
  }
  async create(accountId: string, raw: unknown): Promise<EditorialDraft> {
    return this.serialize(async () => {
      const account = await this.account(accountId),
        content = await this.checkedContent(raw);
      const now = new Date().toISOString();
      const draft: EditorialDraft = {
        id: randomUUID(),
        ownerId: this.documents?.ownerId ?? 'local-owner',
        accountId,
        accountProfileUrl: account.profileUrl,
        platform: 'linkedin',
        status: 'draft',
        version: 1,
        createdAt: now,
        updatedAt: now,
        reviewedAt: null,
        content,
        history: [
          {
            version: 1,
            event: 'created',
            timestamp: now,
            contentSha256: digest(content),
          },
        ],
      };
      await this.persist(draft, 0);
      return draft;
    });
  }
  private async mutate(
    id: string,
    expectedVersion: number,
    operation: (item: EditorialDraft) => void,
    event: EditorialDraft['history'][number]['event'],
  ): Promise<EditorialDraft> {
    if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1)
      throw Error('Expected draft version required');
    return this.serialize(async () => {
      const existing = await this.read(id);
      if (!existing) throw Error('Editorial draft not found');
      await this.account(existing.accountId);
      if (existing.version !== expectedVersion)
        throw Error('Draft version conflict; reload before updating');
      if (existing.history.length >= 100)
        throw Error('Revision history capacity reached; archive this draft and create a new one');
      if (event === 'publication-requested' && existing.history.length >= 99)
        throw Error('Draft needs room for both publication audit events');
      const next: EditorialDraft = {
        ...existing,
        content: { ...existing.content },
        history: [...existing.history],
      };
      operation(next);
      next.version++;
      next.updatedAt = new Date().toISOString();
      next.history.push({
        version: next.version,
        event,
        timestamp: next.updatedAt,
        contentSha256: digest(next.content),
      });
      await this.persist(next, existing.version);
      return next;
    });
  }
  async update(id: string, expectedVersion: number, raw: unknown): Promise<EditorialDraft> {
    const content = await this.checkedContent(raw);
    return this.mutate(
      id,
      expectedVersion,
      (item) => {
        if (item.status === 'archived') throw Error('Restore an archived draft before editing');
        if (!['draft', 'approved', 'publish-failed'].includes(item.status))
          throw Error('Only editable or failed-publication drafts can be revised');
        item.content = content;
        item.status = 'draft';
        item.reviewedAt = null;
        item.publication = undefined;
      },
      'edited',
    );
  }

  async beginPublication(id: string, expectedVersion: number): Promise<EditorialDraft> {
    return this.mutate(
      id,
      expectedVersion,
      (item) => {
        if (item.status !== 'approved' || !item.reviewedAt || item.publication)
          throw Error('Publication requires an approved, never-submitted draft');
        item.status = 'publishing';
        item.publication = {
          attemptId: randomUUID(),
          status: 'pending',
          requestedAt: new Date().toISOString(),
        };
      },
      'publication-requested',
    );
  }
  async finishPublication(
    id: string,
    attemptId: string,
    result:
      | { status: 'published'; postUrn: string }
      | { status: 'publish-failed' | 'publication-uncertain' },
  ): Promise<EditorialDraft> {
    return this.serialize(async () => {
      const current = await this.read(id);
      if (!current || current.status !== 'publishing' || current.publication?.attemptId !== attemptId)
        throw Error('Publishing attempt does not match the current draft');
      if (current.history.length >= 100) throw Error('Publication audit history exhausted');
      const next: EditorialDraft = {
        ...current,
        history: [...current.history],
        publication: {
          ...current.publication,
          status: result.status,
          ...(result.status === 'published' ? { postUrn: result.postUrn } : {}),
        },
      };
      next.status = result.status;
      next.version++;
      next.updatedAt = new Date().toISOString();
      next.history.push({
        version: next.version,
        event: result.status === 'publish-failed' ? 'publication-failed' : result.status,
        timestamp: next.updatedAt,
        contentSha256: digest(next.content),
      });
      await this.persist(next, current.version);
      return next;
    });
  }

  async transition(
    id: string,
    expectedVersion: number,
    action: 'approve' | 'reopen' | 'archive' | 'delete' | 'restore',
    confirm = false,
  ): Promise<EditorialDraft> {
    if (!['approve', 'reopen', 'archive', 'delete', 'restore'].includes(action))
      throw Error('Invalid draft transition');
    return this.mutate(
      id,
      expectedVersion,
      (item) => {
        if (action === 'approve') {
          if (item.status !== 'draft') throw Error('Only a draft can be approved');
          item.status = 'approved';
          item.reviewedAt = new Date().toISOString();
        } else if (action === 'reopen') {
          if (item.status !== 'approved') throw Error('Only approved content can be reopened');
          item.status = 'draft';
          item.reviewedAt = null;
        } else if (action === 'archive') {
          if (!['draft', 'approved', 'publish-failed'].includes(item.status))
            throw Error('Published or in-flight drafts cannot be archived');
          item.status = 'archived';
        } else if (action === 'delete') {
          if (!confirm) throw Error('Deletion requires explicit confirmation');
          if (!['draft', 'approved', 'archived', 'publish-failed'].includes(item.status))
            throw Error('Published or in-flight drafts cannot be deleted');
          item.status = 'deleted';
        } else {
          if (!['archived', 'deleted'].includes(item.status))
            throw Error('Only archived or deleted drafts can be restored');
          item.status = 'draft';
          item.reviewedAt = null;
        }
      },
      action === 'approve'
        ? 'approved'
        : action === 'reopen'
          ? 'reopened'
          : action === 'archive'
            ? 'archived'
            : action === 'delete'
              ? 'deleted'
              : 'restored',
    );
  }
}
