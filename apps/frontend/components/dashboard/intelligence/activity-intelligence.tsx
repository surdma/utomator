'use client';
import { useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import IntelligenceStudioHeader from './sections/intelligence-studio-header';
import IntelligenceSourceTabs from './sections/intelligence-source-tabs';
import IntelligenceActivityFeed from './sections/intelligence-activity-feed';

type Entry = {
  id: string;
  time: string;
  source: 'chat' | 'browser';
  platform: 'linkedin' | 'x' | null;
  accountId: string | null;
  text: string;
  runId?: string;
};
type View = 'memory' | 'observer';
export default function IntelligenceStudio({
  initialView,
  onNavigate,
}: {
  initialView: View;
  onNavigate: (path: string) => void;
}) {
  const [entries, setEntries] = useState<Entry[]>([]),
    [query, setQuery] = useState(''),
    [error, setError] = useState('');
  useEffect(() => {
    let mounted = true;
    void fetch('/api/intelligence', { cache: 'no-store' })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok)
          throw Error(body.error || 'Activity memory unavailable');
        if (mounted) setEntries(body);
      })
      .catch((e) => {
        if (mounted)
          setError(e instanceof Error ? e.message : 'Could not load activity');
      });
    return () => {
      mounted = false;
    };
  }, []);
  const selection = entries.filter(
    (e) =>
      e.source === (initialView === 'memory' ? 'chat' : 'browser') &&
      e.text.toLowerCase().includes(query.toLowerCase())
  );
  return (
    <div
      data-testid="intelligence-studio"
      className="mx-auto flex max-w-5xl flex-col gap-7 pb-16"
    >
      <IntelligenceStudioHeader entriesCount={entries.length} />
      <IntelligenceSourceTabs
        initialView={initialView}
        onNavigate={onNavigate}
      />
      <IntelligenceActivityFeed
        initialView={initialView}
        selection={selection}
        error={error}
        query={query}
        setQuery={setQuery}
      />
      <p className="flex items-start gap-2 text-xs leading-6 text-slate-500">
        <ShieldCheck className="mt-1 size-4 shrink-0 text-teal-700" />
        Memory records exact conversation text. Observer records audit data.
        Neither source authorizes account actions or automatically turns
        unverified statements into career facts.
      </p>
    </div>
  );
}
