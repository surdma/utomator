import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { DocumentStore } from '../db/documents.js';

type Creator = {
  name: string;
  profileUrl: string;
  headline: string;
  posts: Array<{ url: string; text: string }>;
};
export type ResearchInput = {
  niche: string;
  objective: string;
  ownerHeadline: string;
  creators: Creator[];
};
export type ResearchRun = {
  id: string;
  ownerId: string;
  platform: 'linkedin';
  kind: 'creator-research';
  status: 'completed';
  createdAt: string;
  input: ResearchInput;
  sources: Array<{
    creator: string;
    url: string;
    excerpt: string;
    digest: string;
  }>;
  stages: Array<{
    id: string;
    operation: string;
    inputSchema: string;
    outputSchema: string;
    outputDigest: string;
    completedAt: string;
  }>;
  output: {
    profiles: Array<{
      name: string;
      profileUrl: string;
      headline: string;
      topics: Array<{ word: string; mentions: number; sources: string[] }>;
    }>;
    gaps: Array<{ topic: string; observedIn: string[]; examples: string[] }>;
    experiments: Array<{
      hypothesis: string;
      evidenceUrls: string[];
      measure: string;
    }>;
    limitation: string;
  };
};
const idPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const stop = new Set(
  'about after again against also been being build could does from have into just like more most much only other over people post posts really same share should some such than that their there these this those through using were what when where which while with your you them they each will would'.split(
    ' '
  )
);
const stages = [
  [
    'sources',
    'validate-submitted-sources',
    'creator-research-input/v1',
    'submitted-sources/v1',
  ],
  [
    'topics',
    'extract-observed-post-topics',
    'submitted-sources/v1',
    'topic-evidence/v1',
  ],
  [
    'comparison',
    'compare-owner-and-creator-positioning',
    'topic-evidence/v1',
    'positioning-gaps/v1',
  ],
  [
    'experiments',
    'prepare-evidence-limited-experiments',
    'positioning-gaps/v1',
    'growth-experiments/v1',
  ],
  [
    'report',
    'produce-linked-research-report',
    'growth-experiments/v1',
    'creator-research-report/v1',
  ],
] as const;
const hash = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
function required(
  value: unknown,
  label: string,
  min: number,
  max: number
): string {
  if (
    typeof value !== 'string' ||
    value.trim().length < min ||
    value.length > max
  )
    throw Error(`${label} must contain ${min}–${max} characters`);
  return value.trim();
}
function linkedinUrl(
  value: unknown,
  label: string,
  kind: 'profile' | 'post'
): string {
  const raw = required(value, label, 25, 500);
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw Error(`${label} must be a LinkedIn HTTPS URL`);
  }
  const path = parsed.pathname;
  const validPath =
    kind === 'profile'
      ? /^\/in\/[a-zA-Z0-9_-]+\/?$/.test(path)
      : /^\/posts\/[a-zA-Z0-9_-]+\/?$/.test(path) ||
        /^\/feed\/update\/urn:li:(activity|share):[0-9]+\/?$/.test(path);
  if (
    parsed.protocol !== 'https:' ||
    !['linkedin.com', 'www.linkedin.com'].includes(parsed.hostname) ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    !validPath
  )
    throw Error(`${label} is not an exact LinkedIn ${kind} URL`);
  return parsed.href;
}
const words = (input: string) =>
  (input.toLowerCase().match(/[a-z]{4,}/g) || []).filter(
    (word) => !stop.has(word)
  );
export function validateResearchInput(raw: unknown): ResearchInput {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    throw Error('Research input must be an object');
  const data = raw as Partial<ResearchInput>;
  if (
    !Array.isArray(data.creators) ||
    data.creators.length < 1 ||
    data.creators.length > 5
  )
    throw Error('Supply 1–5 creator profiles');
  const creators = data.creators.map((creator, index) => {
    if (
      !creator ||
      typeof creator !== 'object' ||
      !Array.isArray(creator.posts) ||
      creator.posts.length < 1 ||
      creator.posts.length > 5
    )
      throw Error('Each creator needs 1–5 posts');
    const posts = creator.posts.map((post, i) => ({
      url: linkedinUrl(post?.url, `Creator ${index + 1} post ${i + 1}`, 'post'),
      text: required(post?.text, 'Post excerpt', 20, 3000),
    }));
    if (new Set(posts.map((p) => p.url)).size !== posts.length)
      throw Error('Duplicate post evidence');
    return {
      name: required(creator.name, 'Creator name', 2, 120),
      profileUrl: linkedinUrl(creator.profileUrl, 'Creator profile', 'profile'),
      headline: required(creator.headline, 'Creator headline', 5, 300),
      posts,
    };
  });
  if (new Set(creators.map((p) => p.profileUrl)).size !== creators.length)
    throw Error('Duplicate creator profiles');
  return {
    niche: required(data.niche, 'Niche', 3, 100),
    objective: required(data.objective, 'Objective', 8, 400),
    ownerHeadline: required(data.ownerHeadline, 'Owner headline', 5, 300),
    creators,
  };
}
export function executeResearch(
  raw: unknown,
  ownerId = 'local-owner'
): ResearchRun {
  const input = validateResearchInput(raw);
  const sources = input.creators.flatMap((creator) =>
    creator.posts.map((post) => ({
      creator: creator.name,
      url: post.url,
      excerpt: post.text,
      digest: hash(post),
    }))
  );
  const profiles = input.creators.map((creator) => {
    const frequency = new Map<
      string,
      { mentions: number; urls: Set<string> }
    >();
    for (const post of creator.posts)
      for (const word of new Set(words(post.text))) {
        const item = frequency.get(word) ?? {
          mentions: 0,
          urls: new Set<string>(),
        };
        item.mentions++;
        item.urls.add(post.url);
        frequency.set(word, item);
      }
    const topics = [...frequency]
      .sort((a, b) => b[1].mentions - a[1].mentions || a[0].localeCompare(b[0]))
      .slice(0, 8)
      .map(([word, item]) => ({
        word,
        mentions: item.mentions,
        sources: [...item.urls],
      }));
    return {
      name: creator.name,
      profileUrl: creator.profileUrl,
      headline: creator.headline,
      topics,
    };
  });
  const ownerWords = new Set(words(input.ownerHeadline));
  const missing = new Map<
    string,
    { creators: Set<string>; sources: Set<string>; mentions: number }
  >();
  for (const profile of profiles)
    for (const topic of profile.topics) {
      if (ownerWords.has(topic.word)) continue;
      const item = missing.get(topic.word) ?? {
        creators: new Set<string>(),
        sources: new Set<string>(),
        mentions: 0,
      };
      item.creators.add(profile.name);
      item.mentions += topic.mentions;
      topic.sources.forEach((source) => {
        item.sources.add(source);
      });
      missing.set(topic.word, item);
    }
  const gaps = [...missing]
    .sort(
      (a, b) =>
        b[1].creators.size - a[1].creators.size ||
        b[1].mentions - a[1].mentions ||
        a[0].localeCompare(b[0])
    )
    .slice(0, 6)
    .map(([topic, item]) => ({
      topic,
      observedIn: [...item.creators],
      examples: [...item.sources],
    }));
  const experiments = gaps.slice(0, 3).map((gap) => ({
    hypothesis: `Test whether an evidence-backed post about "${gap.topic}" is relevant to the stated ${input.niche} audience.`,
    evidenceUrls: gap.examples,
    measure:
      'Compare relevant comments and profile visits to a documented baseline; no growth is guaranteed.',
  }));
  const output = {
    profiles,
    gaps,
    experiments,
    limitation:
      'Analysis uses user-supplied post excerpts only. It does not verify live LinkedIn pages, retrieve private analytics, infer follower growth, or establish why a creator succeeded.',
  };
  const createdAt = new Date().toISOString();
  const outputs = [sources, profiles, gaps, experiments, output];
  return {
    id: randomUUID(),
    ownerId,
    platform: 'linkedin',
    kind: 'creator-research',
    status: 'completed',
    createdAt,
    input,
    sources,
    stages: stages.map(([id, operation, inputSchema, outputSchema], i) => ({
      id,
      operation,
      inputSchema,
      outputSchema,
      outputDigest: hash(outputs[i]),
      completedAt: createdAt,
    })),
    output,
  };
}
export function researchYaml(run: ResearchRun): string {
  const quoted = (s: string) => JSON.stringify(s);
  return [
    'apiVersion: "utomator.dev/v1"',
    'kind: "CompletedLinkedInResearch"',
    'metadata:',
    `  id: ${quoted(run.id)}`,
    `  owner: ${quoted(run.ownerId)}`,
    'spec:',
    '  platform: "linkedin"',
    '  execution: "local-read-only"',
    ...run.stages.flatMap((s, index) => [
      `  step${index + 1}:`,
      `    id: ${quoted(s.id)}`,
      `    operation: ${quoted(s.operation)}`,
      `    inputSchema: ${quoted(s.inputSchema)}`,
      `    outputSchema: ${quoted(s.outputSchema)}`,
      `    outputSha256: ${quoted(s.outputDigest)}`,
    ]),
    '',
  ].join('\n');
}
export class CreatorResearchStore {
  private readonly root: string;
  private documents?: DocumentStore;
  constructor(root = resolve(process.cwd(), '.runtime', 'linkedin-research')) {
    this.root = root;
  }
  setDocuments(documents: DocumentStore) {
    this.documents = documents;
  }
  async create(raw: unknown): Promise<ResearchRun> {
    const run = executeResearch(raw, this.documents?.ownerId ?? 'local-owner');
    if (this.documents)
      await this.documents.put('linkedin-research', run.id, run, 0);
    else {
      await mkdir(this.root, { recursive: true, mode: 0o700 });
      await writeFile(
        resolve(this.root, `${run.id}.json`),
        `${JSON.stringify(run)}\n`,
        {
          flag: 'wx',
          mode: 0o600,
        }
      );
    }
    return run;
  }
  async get(id: string): Promise<ResearchRun | null> {
    if (!idPattern.test(id)) throw Error('Invalid research identifier');
    if (this.documents)
      return (
        (await this.documents.get<ResearchRun>('linkedin-research', id))
          ?.value ?? null
      );
    try {
      return JSON.parse(
        await readFile(resolve(this.root, `${id}.json`), 'utf8')
      ) as ResearchRun;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }
  async list(): Promise<ResearchRun[]> {
    if (this.documents)
      return (await this.documents.list<ResearchRun>('linkedin-research'))
        .map((x) => x.value)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 50);
    let names: string[];
    try {
      names = await readdir(this.root);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }
    const values = await Promise.all(
      names
        .filter((n) => n.endsWith('.json') && idPattern.test(n.slice(0, -5)))
        .map((n) => this.get(n.slice(0, -5)))
    );
    return values
      .filter((v): v is ResearchRun => v !== null)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 50);
  }
}
