'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
} from 'react';
import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  Position,
  ReactFlow,
  ReactFlowProvider,
  MarkerType,
  reconnectEdge,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type NodeProps,
} from '@xyflow/react';
import {
  Archive,
  ArrowDownToLine,
  ArrowLeft,
  CircleHelp,
  Copy,
  FileCode2,
  Link2,
  Plus,
  RotateCcw,
  Save,
  ShieldCheck,
  Sparkles,
  Trash2,
  Unplug,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  Button,
} from '@/components/ui/automate-card';
import CraftCatalog from './craft-catalog';
import { craftCategoryTitles as titles } from './craft-category-titles';
import StudioDialog from '@/components/ui/studio-dialog';
import GrowthCapabilityDetails, {
  capabilityForSlug,
} from './growth-capability-details';

export type Category =
  | 'presence'
  | 'portfolio'
  | 'job-hunt'
  | 'applications'
  | 'content'
  | 'engagement';
export type Kind =
  'brief' | 'research' | 'draft' | 'review' | 'publish' | 'measure';
export type Step = {
  id: string;
  kind: Kind;
  title: string;
  body: string;
  position: { x: number; y: number };
};
export type Link = { id: string; source: string; target: string };
export type Craft = {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: Category;
  enabled: boolean;
  version: number;
  updatedAt: string;
  steps: Step[];
  links: Link[];
  scope: 'default' | 'personal';
  sourceCraftId?: string;
};
type Draft = Omit<
  Craft,
  'id' | 'version' | 'updatedAt' | 'scope' | 'sourceCraftId'
>;
type Props = {
  selectedId: string | null;
  onSelected: (id: string | null, slug?: string) => void;
  onChat: (text: string) => void;
  revision: number;
  view: 'catalog' | 'visual' | 'source';
  onView: (view: 'visual' | 'source') => void;
  onBack: () => void;
};
const kinds: Kind[] = [
  'brief',
  'research',
  'draft',
  'review',
  'publish',
  'measure',
];
const accent: Record<Kind, string> = {
  brief: 'bg-indigo-50 text-indigo-700',
  research: 'bg-sky-50 text-sky-800',
  draft: 'bg-amber-50 text-amber-800',
  review: 'bg-violet-50 text-violet-800',
  publish: 'bg-emerald-50 text-emerald-800',
  measure: 'bg-rose-50 text-rose-800',
};
const api = (part: string) => '/api/crafts' + part;
const idFor = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 55);
function renderMdx(draft: Draft) {
  return (
    [
      '---',
      'name: ' + draft.slug,
      'description: ' + JSON.stringify(draft.description),
      'category: ' + draft.category,
      'enabled: ' + String(draft.enabled),
      '---',
      '',
      '# ' + draft.name,
      '',
      ...draft.steps.flatMap((step) => [
        '## Step: ' + step.id + ' | ' + step.title,
        '<a id="step-' + step.id + '" />',
        '<CraftNode kind="' +
          step.kind +
          '" x={' +
          step.position.x +
          '} y={' +
          step.position.y +
          '} />',
        '',
        step.body.trim(),
        '',
        '**Next:** ' +
          (draft.links
            .filter((link) => link.source === step.id)
            .map((link) => '[' + link.target + '](#step-' + link.target + ')')
            .join(', ') || 'End'),
        '',
      ]),
    ]
      .join('\n')
      .trimEnd() + '\n'
  );
}
function Stage({
  data,
  selected,
}: NodeProps<Node<{ title: string; kind: Kind; details: string }, 'craft'>>) {
  return (
    <div
      data-testid={'craft-node-' + data.details}
      className={
        'group w-[220px] overflow-hidden rounded-2xl border bg-white shadow-[0_10px_32px_-20px_rgba(15,23,42,.5)] transition ' +
        (selected
          ? 'border-teal-600 ring-2 ring-teal-500/15'
          : 'border-slate-200 hover:border-teal-300')
      }
    >
      <Handle
        id="in"
        type="target"
        position={Position.Left}
        className="!size-3 !border-2 !border-white !bg-teal-600"
      />
      <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
        <span
          className={
            'rounded-md px-2 py-1 text-[10px] font-bold tracking-wide uppercase ' +
            accent[data.kind]
          }
        >
          {data.kind}
        </span>
        <span className="font-mono text-[10px] text-slate-400">
          {data.details}
        </span>
      </div>
      <div className="px-3 py-4">
        <div className="text-sm font-bold text-slate-900">{data.title}</div>
        <p className="mt-1 text-[11px] leading-5 text-slate-500">
          Select to edit instructions and connections
        </p>
      </div>
      <div className="flex items-center gap-1 border-t border-slate-100 px-3 py-2 text-[10px] text-slate-500">
        <Link2 className="size-3.5" />
        Drag a handle to connect steps
      </div>
      <Handle
        id="out"
        type="source"
        position={Position.Right}
        className="!size-3 !border-2 !border-white !bg-teal-600"
      />
    </div>
  );
}
const nodeTypes = { craft: Stage };

function Inner({
  selectedId,
  onSelected,
  onChat,
  revision,
  view,
  onView,
  onBack,
}: Props) {
  const [catalog, setCatalog] = useState<Craft[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [baseline, setBaseline] = useState<Craft | null>(null);
  const [selection, setSelection] = useState<string | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null);
  const mode = view === 'source' ? 'mdx' : 'visual';
  const [mdxDirty, setMdxDirty] = useState(false);
  const [mdx, setMdx] = useState('');
  const [filter, setFilter] = useState<Category | 'all'>('all');
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState<Category>('content');
  const [newOutcome, setNewOutcome] = useState('');
  const [newAudience, setNewAudience] = useState('');
  const [creating, setCreating] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const chosen = catalog.find((skill) => skill.id === selectedId);
  const readOnly = chosen?.scope === 'default';
  const nodes = useMemo<
    Node<{ title: string; kind: Kind; details: string }, 'craft'>[]
  >(
    () =>
      draft?.steps.map((step) => ({
        id: step.id,
        type: 'craft',
        position: step.position,
        data: { title: step.title, kind: step.kind, details: step.id },
        width: 220,
        height: 140,
        selected: step.id === selection,
      })) || [],
    [draft, selection]
  );
  const edges = useMemo<Edge[]>(
    () =>
      draft?.links.map((link) => ({
        ...link,
        type: 'smoothstep',
        animated: false,
        style: { stroke: '#0f766e', strokeWidth: 2 },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#0f766e' },
      })) || [],
    [draft]
  );
  const changed =
    baseline && draft
      ? JSON.stringify(draft) !==
        JSON.stringify({
          slug: baseline.slug,
          name: baseline.name,
          description: baseline.description,
          category: baseline.category,
          enabled: baseline.enabled,
          steps: baseline.steps,
          links: baseline.links,
        })
      : false;
  const selectedStep = draft?.steps.find((step) => step.id === selection);
  const totalLinks = draft?.links.length ?? 0;

  const load = useCallback(
    async (preferred?: string) => {
      try {
        const res = await fetch(api(''), { cache: 'no-store' });
        if (!res.ok) throw Error('Start the local engine to manage crafts');
        const list = (await res.json()) as Craft[];
        setCatalog(list);
        const requested =
          preferred === ''
            ? null
            : preferred || (view === 'catalog' ? null : selectedId);
        const picked = requested
          ? list.find((s) => s.id === requested)
          : undefined;
        if (picked) {
          onSelected(picked.id, picked.slug);
          setBaseline(picked);
          setDraft({
            slug: picked.slug,
            name: picked.name,
            description: picked.description,
            category: picked.category,
            enabled: picked.enabled,
            steps: picked.steps,
            links: picked.links,
          });
          setMdx(renderMdx(picked));
          setMdxDirty(false);
          setSelection(picked.steps[0]?.id || null);
        } else {
          setBaseline(null);
          setDraft(null);
        }
        setError(
          requested && !picked
            ? 'This craft could not be found. Return to the craft catalog.'
            : ''
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Unable to load crafts');
      }
    },
    [selectedId, onSelected, view]
  );
  // An explicit refresh signal is shared with the chat command dispatcher.
  useEffect(() => {
    void load();
  }, [revision]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (view === 'catalog') return;
    const picked = catalog.find((s) => s.id === selectedId);
    if (picked && picked.id !== baseline?.id) {
      onSelected(picked.id, picked.slug);
      setBaseline(picked);
      setDraft({
        slug: picked.slug,
        name: picked.name,
        description: picked.description,
        category: picked.category,
        enabled: picked.enabled,
        steps: picked.steps,
        links: picked.links,
      });
      setMdx(renderMdx(picked));
      setMdxDirty(false);
      setSelection(picked.steps[0]?.id || null);
    }
  }, [selectedId, catalog, baseline?.id, view, onSelected]);
  const update = (fn: (skill: Draft) => Draft) => {
    if (readOnly) return;
    setDraft((prev) => (prev ? fn(prev) : null));
    setNotice('Unsaved changes - check the MDX or save to apply.');
  };
  const onNodesChange = (
    changes: NodeChange<
      Node<{ title: string; kind: Kind; details: string }, 'craft'>
    >[]
  ) => {
    if (readOnly) return;
    const next = applyNodeChanges(changes, nodes);
    if (
      changes.some((change) => change.type === 'position' && change.position)
    ) {
      update((prev) => ({
        ...prev,
        steps: prev.steps.map((step) => {
          const found = next.find((node) => node.id === step.id);
          return found ? { ...step, position: found.position } : step;
        }),
      }));
    }
  };
  const onEdgesChange = (changes: EdgeChange<Edge>[]) => {
    if (readOnly) return;
    const next = applyEdgeChanges(changes, edges);
    if (changes.some((change) => change.type === 'remove'))
      update((prev) => ({
        ...prev,
        links: next.map((e) => ({
          id: e.source + '-to-' + e.target,
          source: e.source,
          target: e.target,
        })),
      }));
  };
  const connect = (connection: Connection) => {
    if (readOnly) return;
    if (
      !connection.source ||
      !connection.target ||
      connection.source === connection.target
    )
      return;
    update((prev) => ({
      ...prev,
      links: addEdge(
        {
          id: connection.source + '-to-' + connection.target,
          source: connection.source,
          target: connection.target,
        },
        prev.links
      ).map((e) => ({ id: e.id, source: e.source, target: e.target })),
    }));
  };
  const reconnect = (previous: Edge, connection: Connection) => {
    if (readOnly) return;
    if (
      !connection.source ||
      !connection.target ||
      connection.source === connection.target
    )
      return;
    update((prev) => ({
      ...prev,
      links: reconnectEdge(
        previous,
        connection,
        prev.links.map((e) => ({ ...e })),
        { shouldReplaceId: false }
      ).map((e) => ({
        source: e.source,
        target: e.target,
        id: e.source + '-to-' + e.target,
      })),
    }));
  };
  const newStep = () => {
    if (readOnly) return;
    if (!draft || draft.steps.length >= 40) return;
    const base = 'new-step';
    let next = base,
      n = 2;
    while (draft.steps.some((s) => s.id === next)) next = base + '-' + n++;
    update((prev) => ({
      ...prev,
      steps: [
        ...prev.steps,
        {
          id: next,
          kind: 'draft',
          title: 'New step',
          body: 'Describe the action, relevant evidence and expected result.',
          position: {
            x: 100 + prev.steps.length * 60,
            y: 240 + (prev.steps.length % 3) * 170,
          },
        },
      ],
    }));
    setSelection(next);
    onView('visual');
  };
  const save = async (source?: string) => {
    if (readOnly) return;
    if (!baseline || !draft) return;
    if (source === undefined && mdxDirty) {
      setError(
        'Unapplied MDX edits are pending. Apply the source before saving the visual graph.'
      );
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const res = await fetch(api('/' + baseline.id), {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          expectedVersion: baseline.version,
          ...(source !== undefined ? { mdx: source } : { craft: draft }),
        }),
      });
      const data = (await res.json()) as Craft & { error?: string };
      if (!res.ok) throw Error(data.error || 'Unable to save craft');
      await load(data.id);
      setNotice('Saved and synchronized with MDX source.');
      onChat('Saved craft ' + data.slug + ' (version ' + data.version + ').');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save craft');
    } finally {
      setBusy(false);
    }
  };
  const create = async () => {
    const name = newName.trim().replace(/[<>\r\n]/g, ' ');
    const objective = newOutcome
      .trim()
      .replace(/[<>\r\n]/g, ' ')
      .slice(0, 230);
    const audience = newAudience
      .trim()
      .replace(/[<>\r\n]/g, ' ')
      .slice(0, 140);
    if (!name || !objective || !audience) return;
    setBusy(true);
    setError('');
    try {
      const slug = idFor(name);
      const res = await fetch(api(''), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          slug,
          name,
          category: newCategory,
          enabled: true,
          description: (
            'Use when ' +
            name +
            ' is needed to achieve ' +
            objective +
            ' for ' +
            audience +
            '.'
          ).slice(0, 1023),
          steps: [
            {
              id: 'scope',
              kind: 'brief',
              title: 'Define ' + name.slice(0, 64),
              body:
                'Professional outcome: ' +
                objective +
                '. Target audience: ' +
                audience +
                '. Identify the relevant account, constraints and success measure.',
              position: { x: 70, y: 140 },
            },
            {
              id: 'evidence',
              kind: 'research',
              title: 'Gather relevant evidence',
              body:
                'For ' +
                audience +
                ', gather actual sources and examples connected to ' +
                objective +
                '. Flag missing proof, permissions and provider limitations.',
              position: { x: 380, y: 140 },
            },
            {
              id: 'develop',
              kind: 'draft',
              title: 'Prepare targeted deliverables',
              body:
                'Produce the specific outcome of ' +
                name +
                ' for ' +
                audience +
                '. Explain how this advances ' +
                objective +
                ' and which steps require human effort.',
              position: { x: 690, y: 140 },
            },
            {
              id: 'approval',
              kind: 'review',
              title: 'Verify facts and approve',
              body:
                'Review factual claims, platform restrictions and the relation to ' +
                objective +
                '. Require owner approval for external changes.',
              position: { x: 1000, y: 140 },
            },
            {
              id: 'outcome',
              kind: 'measure',
              title: 'Measure actual progress',
              body:
                'Compare sourced outcomes against ' +
                objective +
                '. Record the date, denominator and missing data; never generate synthetic engagement.',
              position: { x: 1310, y: 140 },
            },
          ],
          links: [
            { id: 'scope-to-evidence', source: 'scope', target: 'evidence' },
            {
              id: 'evidence-to-develop',
              source: 'evidence',
              target: 'develop',
            },
            {
              id: 'develop-to-approval',
              source: 'develop',
              target: 'approval',
            },
            {
              id: 'approval-to-outcome',
              source: 'approval',
              target: 'outcome',
            },
          ],
        }),
      });
      const result = (await res.json()) as Craft & { error?: string };
      if (!res.ok) throw Error(result.error || 'Unable to create craft');
      setNewName('');
      setNewOutcome('');
      setNewAudience('');
      setCreating(false);
      await load(result.id);
      onChat('Created craft ' + result.slug + '.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to create craft');
    } finally {
      setBusy(false);
    }
  };
  const duplicate = async () => {
    if (!baseline) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch(api('/' + baseline.id + '/clone'), {
        method: 'POST',
      });
      const result = (await res.json()) as Craft & { error?: string };
      if (!res.ok) throw Error(result.error || 'Could not clone craft');
      await load(result.id);
      setNotice('Created your private craft variation.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not clone craft');
    } finally {
      setBusy(false);
    }
  };
  const destroy = async () => {
    if (readOnly) return;
    if (!baseline) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch(api('/' + baseline.id), {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ expectedVersion: baseline.version }),
      });
      if (!res.ok) {
        const v = (await res.json()) as { error: string };
        throw Error(v.error);
      }
      setDeleteOpen(false);
      onSelected(null);
      setBaseline(null);
      setDraft(null);
      await load('');
      setNotice('Deleted personal craft.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to delete');
    } finally {
      setBusy(false);
    }
  };
  const download = async (format: 'skill' | 'zip') => {
    if (!baseline) return;
    try {
      const res = await fetch(
        api('/' + baseline.id + '/export?format=' + format)
      );
      if (!res.ok) throw Error('Unable to export');
      const blob = await res.blob();
      const href = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = href;
      anchor.download = baseline.slug + '.' + format;
      anchor.click();
      URL.revokeObjectURL(href);
      setNotice(
        format === 'skill'
          ? 'Utomator .skill ZIP bundle downloaded.'
          : 'Portable .zip bundle downloaded.'
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed');
    }
  };
  const importFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      if (file.size > 120000)
        throw Error('File exceeds the 120 KB import limit');
      let body: Record<string, unknown>, url: string;
      if (file.name.toLowerCase().endsWith('.mdx')) {
        body = { mdx: await file.text() };
        url = api('/from-mdx');
      } else if (/\.(skill|zip)$/i.test(file.name)) {
        const bytes = new Uint8Array(await file.arrayBuffer());
        let offset = 0,
          graph: string | null = null;
        const view = new DataView(bytes.buffer);
        while (
          offset + 30 <= bytes.length &&
          view.getUint32(offset, true) === 0x04034b50
        ) {
          const method = view.getUint16(offset + 8, true);
          const size = view.getUint32(offset + 18, true);
          const nameLength = view.getUint16(offset + 26, true);
          const extra = view.getUint16(offset + 28, true);
          const start = offset + 30 + nameLength + extra;
          const name = new TextDecoder().decode(
            bytes.slice(offset + 30, offset + 30 + nameLength)
          );
          if (start + size > bytes.length || method !== 0)
            throw Error(
              'Only safe, uncompressed Utomator .skill packages can be imported'
            );
          if (name.endsWith('/graph.json'))
            graph = new TextDecoder().decode(bytes.slice(start, start + size));
          offset = start + size;
        }
        if (!graph) throw Error('Missing graph.json in .skill package');
        body = JSON.parse(graph) as Record<string, unknown>;
        url = api('');
      } else throw Error('Choose an .mdx, .skill or .zip file');
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const saved = (await res.json()) as Craft & { error?: string };
      if (!res.ok) throw Error(saved.error || 'Import failed');
      await load(saved.id);
      setNotice('Imported craft ' + saved.slug + '.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to import file');
    } finally {
      setBusy(false);
    }
  };
  const match = catalog.filter(
    (s) =>
      (filter === 'all' || s.category === filter) &&
      (s.name.toLowerCase().includes(search.toLowerCase()) ||
        s.description.toLowerCase().includes(search.toLowerCase()) ||
        s.steps.some((step) =>
          step.body.toLowerCase().includes(search.toLowerCase())
        ))
  );
  return (
    <section
      data-testid="crafts-library"
      className="flex min-w-0 flex-col gap-5"
    >
      {view === 'catalog' && (
        <CraftCatalog
          crafts={match}
          filter={filter}
          onFilter={setFilter}
          search={search}
          onSearch={setSearch}
          creating={creating}
          onToggleCreate={() => setCreating((current) => !current)}
          newName={newName}
          onNameChange={setNewName}
          newCategory={newCategory}
          onCategoryChange={setNewCategory}
          newOutcome={newOutcome}
          onOutcomeChange={setNewOutcome}
          newAudience={newAudience}
          onAudienceChange={setNewAudience}
          busy={busy}
          error={error}
          onCreate={() => {
            void create();
          }}
          onImport={(event) => {
            void importFile(event);
          }}
          onOpen={(id, slug) => onSelected(id, slug)}
        />
      )}
      {view !== 'catalog' && (
        <button
          type="button"
          onClick={() => {
            if (changed || mdxDirty) {
              setLeaveOpen(true);
              return;
            }
            onBack();
          }}
          className="inline-flex min-h-10 w-fit items-center gap-2 rounded-lg px-2 text-xs font-semibold text-teal-800 hover:bg-teal-50 focus-visible:outline-2 focus-visible:outline-teal-600"
        >
          <ArrowLeft className="size-4" />
          Growth library
        </button>
      )}
      {view !== 'catalog' && chosen && draft && (
        <GrowthCapabilityDetails
          slug={
            capabilityForSlug(chosen.slug)
              ? chosen.slug
              : chosen.sourceCraftId?.startsWith('default-growth-')
                ? chosen.sourceCraftId.slice('default-'.length)
                : chosen.slug
          }
        />
      )}
      {view !== 'catalog' && chosen && draft && (
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 border-b border-slate-100">
            <div className="min-w-0 flex-1">
              <input
                aria-label="Craft title"
                className="w-full max-w-lg bg-transparent text-lg font-extrabold text-slate-900 outline-teal-600"
                value={draft.name}
                readOnly={readOnly}
                onChange={(e) =>
                  update((prev) => ({ ...prev, name: e.target.value }))
                }
              />
              <p className="mt-1 text-xs text-slate-500">
                Growth flow · {draft.slug} ·{' '}
                {readOnly ? 'Shared default · read only' : 'My craft'} · v
                {chosen.version} · {draft.steps.length} steps · {totalLinks}{' '}
                connections
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 px-3 text-xs font-semibold"
                onClick={() => onChat('/craft open ' + draft.slug)}
              >
                <Sparkles className="size-4" />
                Use in Chat
              </button>
              <Button
                size="sm"
                disabled={readOnly || !changed || busy}
                variant="primary"
                onClick={() => {
                  void save();
                }}
              >
                <Save className="size-4" />
                {busy ? 'Saving' : 'Save'}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 pt-4">
            <div className="grid gap-3 sm:grid-cols-[1fr_160px_125px]">
              <label className="text-xs font-semibold text-slate-600">
                Trigger description
                <textarea
                  aria-label="Craft trigger description"
                  className="mt-1.5 min-h-16 w-full rounded-xl border border-slate-200 p-3 text-xs leading-5"
                  value={draft.description}
                  readOnly={readOnly}
                  onChange={(e) =>
                    update((prev) => ({ ...prev, description: e.target.value }))
                  }
                  maxLength={1023}
                />
              </label>
              <label className="text-xs font-semibold text-slate-600">
                Category
                <select
                  aria-label="Craft category"
                  value={draft.category}
                  onChange={(e) =>
                    update((prev) => ({
                      ...prev,
                      category: e.target.value as Category,
                    }))
                  }
                  className="mt-1.5 min-h-10 w-full rounded-xl border border-slate-200 bg-white px-2 text-xs"
                >
                  {Object.entries(titles).map(([k, v]) => (
                    <option value={k} key={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                <input
                  type="checkbox"
                  checked={draft.enabled}
                  disabled={readOnly}
                  onChange={(e) =>
                    update((prev) => ({ ...prev, enabled: e.target.checked }))
                  }
                />
                Enabled
              </label>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div
                role="tablist"
                aria-label="Craft editor view"
                className="flex rounded-lg bg-slate-100 p-1"
              >
                <button
                  role="tab"
                  aria-selected={mode === 'visual'}
                  className={
                    'rounded-md px-3 py-2 text-xs font-bold ' +
                    (mode === 'visual'
                      ? 'bg-white shadow-sm'
                      : 'text-slate-500')
                  }
                  onClick={() => onView('visual')}
                >
                  Visual flow
                </button>
                <button
                  role="tab"
                  aria-selected={mode === 'mdx'}
                  className={
                    'rounded-md px-3 py-2 text-xs font-bold ' +
                    (mode === 'mdx' ? 'bg-white shadow-sm' : 'text-slate-500')
                  }
                  onClick={() => {
                    if (!mdxDirty) setMdx(renderMdx(draft));
                    onView('source');
                  }}
                >
                  MDX source
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Button size="sm" disabled={readOnly} onClick={newStep}>
                  <Plus className="size-4" />
                  Step
                </Button>
                <Button size="sm" onClick={() => void duplicate()}>
                  <Copy className="size-4" />
                  {readOnly ? 'Clone to my crafts' : 'Clone flow'}
                </Button>
                <Button size="sm" onClick={() => void download('skill')}>
                  <ArrowDownToLine className="size-4" />
                  .skill
                </Button>
                <Button size="sm" onClick={() => void download('zip')}>
                  <Archive className="size-4" />
                  .zip
                </Button>
              </div>
            </div>
            {mode === 'visual' ? (
              <div className="grid min-w-0 overflow-hidden rounded-xl border border-slate-200 2xl:grid-cols-[minmax(0,1fr)_280px]">
                <div
                  data-testid="crafts-artboard"
                  className="h-[540px] min-w-0 bg-[#f3f6f8] sm:h-[min(68dvh,760px)]"
                >
                  <ReactFlow
                    nodes={nodes}
                    edges={edges}
                    nodeTypes={nodeTypes}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    nodesDraggable={!readOnly}
                    nodesConnectable={!readOnly}
                    onConnect={connect}
                    onReconnect={reconnect}
                    edgesReconnectable={!readOnly}
                    onNodeClick={(_, node) => {
                      setSelection(node.id);
                      setSelectedEdge(null);
                    }}
                    onEdgeClick={(_, edge) => {
                      setSelectedEdge(edge.id);
                      setSelection(null);
                    }}
                    fitView
                    fitViewOptions={{ padding: 0.2, minZoom: 0.3, maxZoom: 1 }}
                    minZoom={0.25}
                    maxZoom={1.8}
                    aria-label={
                      readOnly
                        ? 'Read-only craft graph'
                        : 'Editable craft graph with draggable connections'
                    }
                  >
                    <Background
                      variant={BackgroundVariant.Dots}
                      gap={18}
                      color="#b4c6cc"
                    />
                    <Controls showInteractive={false} />
                  </ReactFlow>
                </div>
                <div
                  data-testid="craft-node-inspector"
                  className="min-w-0 space-y-3 border-t border-slate-200 bg-white p-4 2xl:border-t-0 2xl:border-l"
                >
                  <h3 className="text-xs font-extrabold tracking-wider text-slate-800 uppercase">
                    Craft inspector
                  </h3>
                  {selectedStep ? (
                    <div className="flex flex-col gap-3">
                      <p className="font-mono text-[11px] text-slate-500">
                        #{selectedStep.id}
                      </p>
                      <label className="text-xs font-semibold">
                        Step title
                        <input
                          aria-label="Step title"
                          className="mt-1.5 min-h-10 w-full rounded-lg border border-slate-200 p-2 text-xs"
                          value={selectedStep.title}
                          readOnly={readOnly}
                          onChange={(e) =>
                            update((prev) => ({
                              ...prev,
                              steps: prev.steps.map((st) =>
                                st.id === selection
                                  ? { ...st, title: e.target.value }
                                  : st
                              ),
                            }))
                          }
                        />
                      </label>
                      <label className="text-xs font-semibold">
                        Step type
                        <select
                          aria-label="Step kind"
                          className="mt-1.5 min-h-10 w-full rounded-lg border border-slate-200 p-2 text-xs"
                          value={selectedStep.kind}
                          disabled={readOnly}
                          onChange={(e) =>
                            update((prev) => ({
                              ...prev,
                              steps: prev.steps.map((st) =>
                                st.id === selection
                                  ? { ...st, kind: e.target.value as Kind }
                                  : st
                              ),
                            }))
                          }
                        >
                          {kinds.map((kind) => (
                            <option value={kind} key={kind}>
                              {kind}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="text-xs font-semibold">
                        Instructions (MDX body)
                        <textarea
                          aria-label="Step instructions"
                          className="mt-1.5 min-h-44 w-full rounded-lg border border-slate-200 p-2 font-mono text-xs leading-5"
                          value={selectedStep.body}
                          readOnly={readOnly}
                          onChange={(e) =>
                            update((prev) => ({
                              ...prev,
                              steps: prev.steps.map((st) =>
                                st.id === selection
                                  ? { ...st, body: e.target.value }
                                  : st
                              ),
                            }))
                          }
                        />
                      </label>
                      <div className="rounded-lg bg-slate-50 p-3 text-[11px] text-slate-600">
                        <p className="font-semibold">Outgoing connections</p>
                        {draft.links
                          .filter((link) => link.source === selectedStep.id)
                          .map((link) => (
                            <div
                              key={link.id}
                              className="mt-2 flex items-center justify-between gap-2"
                            >
                              <span className="truncate">{link.target}</span>
                              <button
                                aria-label={'Unlink ' + link.target}
                                type="button"
                                onClick={() =>
                                  update((prev) => ({
                                    ...prev,
                                    links: prev.links.filter(
                                      (item) => item.id !== link.id
                                    ),
                                  }))
                                }
                                className="rounded p-1 text-rose-700 hover:bg-rose-100"
                              >
                                <Unplug className="size-4" />
                              </button>
                            </div>
                          ))}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          update((prev) => ({
                            ...prev,
                            steps: prev.steps.filter((s) => s.id !== selection),
                            links: prev.links.filter(
                              (l) =>
                                l.source !== selection && l.target !== selection
                            ),
                          }));
                          setSelection(null);
                        }}
                        disabled={readOnly || draft.steps.length === 1}
                        className="flex min-h-9 items-center gap-2 text-xs font-semibold text-rose-700 disabled:opacity-40"
                      >
                        <Trash2 className="size-4" />
                        Remove step and its links
                      </button>
                    </div>
                  ) : selectedEdge ? (
                    <div>
                      <p className="text-xs text-slate-600">
                        Connected edge {selectedEdge}
                      </p>
                      <button
                        type="button"
                        className="mt-3 flex items-center gap-2 text-xs font-semibold text-rose-700"
                        onClick={() => {
                          update((prev) => ({
                            ...prev,
                            links: prev.links.filter(
                              (l) => l.id !== selectedEdge
                            ),
                          }));
                          setSelectedEdge(null);
                        }}
                      >
                        <Unplug className="size-4" />
                        Unlink connection
                      </button>
                    </div>
                  ) : (
                    <p className="text-xs leading-5 text-slate-500">
                      Select a node or connection. Drag a source handle to a new
                      target to change how the craft flows. All changes update
                      the MDX preview.
                    </p>
                  )}
                  <div className="rounded-lg border border-teal-100 bg-teal-50 p-3 text-[11px] leading-5 text-teal-900">
                    <ShieldCheck className="mr-1 inline size-4" />
                    Graph connections are instructions, not live social-network
                    automation.
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold">
                    Editable .mdx source
                  </span>
                  <span className="text-[11px] text-slate-500">
                    Changing Next links rewires the graph after Apply MDX.
                  </span>
                </div>
                <textarea
                  data-testid="craft-mdx-editor"
                  aria-label="Editable craft MDX"
                  spellCheck={false}
                  readOnly={readOnly}
                  className="min-h-[min(65dvh,700px)] w-full rounded-xl border border-slate-200 bg-slate-950 p-4 font-mono text-xs leading-6 text-teal-100 outline-teal-500"
                  value={mdx}
                  onChange={(e) => {
                    setMdx(e.target.value);
                    setMdxDirty(true);
                    setNotice('Unapplied MDX changes.');
                  }}
                />
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="primary"
                    disabled={readOnly || busy}
                    onClick={() => {
                      void save(mdx);
                    }}
                  >
                    <FileCode2 className="size-4" />
                    Apply MDX to graph
                  </Button>
                  <Button
                    onClick={() => {
                      navigator.clipboard.writeText(mdx).then(
                        () => setNotice('MDX copied.'),
                        () => setError('Clipboard access was denied')
                      );
                    }}
                  >
                    <Copy className="size-4" />
                    Copy MDX
                  </Button>
                </div>
              </div>
            )}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
              <p className="flex items-center gap-2 text-[11px] text-slate-500">
                <CircleHelp className="size-4" />
                Crafts are structured instructions; no LLM is connected.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  disabled={!changed || readOnly}
                  onClick={() => {
                    void load(chosen.id);
                  }}
                >
                  <RotateCcw className="size-4" />
                  Reset
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  disabled={readOnly}
                  onClick={() => setDeleteOpen(true)}
                >
                  <Trash2 className="size-4" />
                  Delete
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
      {notice && (
        <p
          role="status"
          className="rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-xs text-teal-900"
        >
          {notice}
        </p>
      )}
      <StudioDialog
        open={deleteOpen}
        onDismiss={() => setDeleteOpen(false)}
        title="Delete craft"
        description={
          'Permanently remove ' +
          (baseline?.name || 'this craft') +
          ' from the your personal collection?'
        }
        testId="delete-craft-dialog"
      >
        <p className="text-sm leading-6 text-slate-600">
          This removes its graph and MDX source. This action cannot be undone.
        </p>
        {error && (
          <p role="alert" className="mt-3 text-sm text-rose-700">
            {error}
          </p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <Button onClick={() => setDeleteOpen(false)}>Cancel</Button>
          <Button
            variant="danger"
            disabled={busy || readOnly}
            onClick={() => void destroy()}
          >
            {busy ? 'Deleting…' : 'Delete craft'}
          </Button>
        </div>
      </StudioDialog>
      <StudioDialog
        open={leaveOpen}
        onDismiss={() => setLeaveOpen(false)}
        title="Discard unsaved changes?"
        description="Your unsaved graph or MDX source edits will be lost."
        testId="discard-craft-dialog"
      >
        <div className="flex justify-end gap-2">
          <Button onClick={() => setLeaveOpen(false)}>Keep editing</Button>
          <Button
            variant="danger"
            onClick={() => {
              setLeaveOpen(false);
              onBack();
            }}
          >
            Discard and leave
          </Button>
        </div>
      </StudioDialog>
      {error && (
        <p
          role="alert"
          className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800"
        >
          {error}
        </p>
      )}
    </section>
  );
}
export default function CraftsLibrary(props: Props) {
  return (
    <ReactFlowProvider>
      <Inner {...props} />
    </ReactFlowProvider>
  );
}
