'use client';

import { useEffect, useState, type FormEvent } from 'react';
import ResearchStudioHeader from './sections/research-studio-header';
import ResearchInputForm from './sections/research-input-form';
import ResearchReportPanel from './sections/research-report-panel';
import ResearchHistoryList from './sections/research-history-list';

type Post = { url: string; text: string };
type Creator = {
  name: string;
  profileUrl: string;
  headline: string;
  posts: Post[];
};
type Research = {
  id: string;
  createdAt: string;
  input: { niche: string; objective: string };
  stages: Array<{
    id: string;
    operation: string;
    inputSchema: string;
    outputSchema: string;
    outputDigest: string;
  }>;
  output: {
    profiles: Array<{
      name: string;
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
const blank = (): Creator => ({
  name: '',
  profileUrl: '',
  headline: '',
  posts: [{ url: '', text: '' }],
});
export default function LinkedInResearchStudio() {
  const [niche, setNiche] = useState(''),
    [objective, setObjective] = useState('');
  const [ownerHeadline, setOwnerHeadline] = useState('');
  const [creators, setCreators] = useState<Creator[]>([blank()]);
  const [history, setHistory] = useState<Research[]>([]);
  const [active, setActive] = useState<Research | null>(null);
  const [error, setError] = useState(''),
    [saving, setSaving] = useState(false);
  useEffect(() => {
    let mounted = true;
    void fetch('/api/linkedin/research', { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw Error('Research history unavailable');
        const rows = (await response.json()) as Research[];
        if (mounted) {
          setHistory(rows);
          setActive(rows[0] ?? null);
        }
      })
      .catch((e) => {
        if (mounted)
          setError(e instanceof Error ? e.message : 'Unable to load research');
      });
    return () => {
      mounted = false;
    };
  }, []);
  const updateCreator = (index: number, patch: Partial<Creator>) =>
    setCreators((rows) =>
      rows.map((creator, i) =>
        index === i ? { ...creator, ...patch } : creator
      )
    );
  const updatePost = (
    index: number,
    p: number,
    key: keyof Post,
    value: string
  ) =>
    setCreators((rows) =>
      rows.map((creator, i) =>
        index !== i
          ? creator
          : {
              ...creator,
              posts: creator.posts.map((post, j) =>
                p === j ? { ...post, [key]: value } : post
              ),
            }
      )
    );
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setSaving(true);
    try {
      const response = await fetch('/api/linkedin/research', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ niche, objective, ownerHeadline, creators }),
      });
      const result = (await response.json()) as Research & { error?: string };
      if (!response.ok) throw Error(result.error || 'Research pipeline failed');
      setActive(result);
      setHistory((previous) => [result, ...previous]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Research failed');
    } finally {
      setSaving(false);
    }
  }
  return (
    <div
      data-testid="linkedin-creator-research"
      className="mx-auto max-w-5xl space-y-5 pb-12"
    >
      <ResearchStudioHeader />
      <ResearchInputForm
        submit={submit}
        niche={niche}
        setNiche={setNiche}
        objective={objective}
        setObjective={setObjective}
        ownerHeadline={ownerHeadline}
        setOwnerHeadline={setOwnerHeadline}
        creators={creators}
        setCreators={setCreators}
        updateCreator={updateCreator}
        updatePost={updatePost}
        blank={blank}
        saving={saving}
      />
      {error && (
        <p
          role="alert"
          className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"
        >
          {error}
        </p>
      )}
      {active && <ResearchReportPanel active={active} />}
      <ResearchHistoryList
        history={history}
        setActive={(run) => setActive(run)}
      />
    </div>
  );
}
