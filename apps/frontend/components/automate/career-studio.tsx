'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import StudioDialog from '@/components/ui/studio-dialog';
import {
  ArrowRight,
  Copy,
  FileText,
  LayoutTemplate,
  Pencil,
  Plus,
  Printer,
  Save,
  Search,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import './career-studio.css';
import './career-redesign.css';

type Role = {
  company: string;
  role: string;
  period: string;
  location: string;
  bullets: string[];
};
type Project = { title: string; outcome: string };
type CareerDocument = {
  name: string;
  headline: string;
  location: string;
  summary: string;
  contacts: string[];
  education: { institution: string; degree: string }[];
  experience: Role[];
  skills: string[];
  projects: Project[];
  customSections: { id: string; title: string; items: string[] }[];
};
type Resume = CareerDocument & {
  id: string;
  label: string;
  targetRole: string;
  targetCompany: string;
  jobDescription: string;
  template: 'editorial' | 'classic' | 'modern' | 'minimal';
  updatedAt: string;
};
type CareerState = {
  revision: number;
  profile: CareerDocument;
  resumes: Resume[];
};
const api = '/api/career';
const clone = <T,>(item: T): T => structuredClone(item);
const classInput =
  'w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15';
const classButton =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600 disabled:cursor-not-allowed disabled:opacity-50';

function Field({
  label,
  value,
  onChange,
  multiline,
  maxLength = 3000,
}: {
  label: string;
  value: string;
  onChange: (text: string) => void;
  multiline?: boolean;
  maxLength?: number;
}) {
  return (
    <label className="block min-w-0 text-xs font-semibold text-slate-700">
      <span className="mb-1.5 block">{label}</span>
      {multiline ? (
        <textarea
          rows={4}
          maxLength={maxLength}
          className={classInput + ' resize-y leading-6'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <input
          maxLength={maxLength}
          className={classInput}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </label>
  );
}
type SectionKey =
  | 'identity'
  | 'contacts'
  | 'experience'
  | 'education'
  | 'skills'
  | 'projects'
  | 'target'
  | `custom:${string}`;
function SectionEditor({
  section,
  value,
  onChange,
  onMeta,
}: {
  section: SectionKey;
  value: CareerDocument;
  onChange: (next: CareerDocument) => void;
  onMeta?: (
    key: 'label' | 'targetRole' | 'targetCompany' | 'jobDescription',
    value: string
  ) => void;
}) {
  const update = <K extends keyof CareerDocument>(
    key: K,
    next: CareerDocument[K]
  ) => onChange({ ...value, [key]: next });
  const roleUpdate = (i: number, next: Role) =>
    update(
      'experience',
      value.experience.map((r, j) => (j === i ? next : r))
    );
  const customId = section.startsWith('custom:') ? section.slice(7) : null;
  const custom = value.customSections.find((x) => x.id === customId);
  return (
    <div className="flex flex-col gap-6" data-testid="career-section-editor">
      {section === 'target' && 'targetRole' in value && onMeta && (
        <div className="flex flex-col gap-4">
          <Field
            label="Résumé name"
            value={(value as Resume).label}
            maxLength={120}
            onChange={(v) => onMeta('label', v)}
          />
          <Field
            label="Target position"
            value={(value as Resume).targetRole}
            maxLength={180}
            onChange={(v) => onMeta('targetRole', v)}
          />
          <Field
            label="Company (optional)"
            value={(value as Resume).targetCompany}
            maxLength={180}
            onChange={(v) => onMeta('targetCompany', v)}
          />
          <Field
            label="Job description (private notes, never printed)"
            value={(value as Resume).jobDescription}
            maxLength={12000}
            multiline
            onChange={(v) => onMeta('jobDescription', v)}
          />
        </div>
      )}
      {section === 'identity' && (
        <div className="flex flex-col gap-4">
          <Field
            label="Full name"
            maxLength={150}
            value={value.name}
            onChange={(v) => update('name', v)}
          />
          <Field
            label="Professional headline"
            maxLength={240}
            value={value.headline}
            onChange={(v) => update('headline', v)}
          />
          <Field
            label="Location"
            maxLength={180}
            value={value.location}
            onChange={(v) => update('location', v)}
          />
          <Field
            label="Professional summary"
            multiline
            value={value.summary}
            onChange={(v) => update('summary', v)}
          />
        </div>
      )}
      {section === 'contacts' && (
        <label className="text-sm font-semibold">
          Contact methods, one per line
          <textarea
            className={classInput + ' mt-2 resize-y leading-6'}
            rows={5}
            maxLength={4000}
            value={value.contacts.join('\n')}
            onChange={(e) =>
              update('contacts', e.target.value.split('\n').slice(0, 16))
            }
          />
        </label>
      )}
      {section === 'skills' && (
        <label className="text-sm font-semibold">
          Skills, one per line
          <textarea
            className={classInput + ' mt-2 resize-y leading-6'}
            rows={7}
            maxLength={10000}
            value={value.skills.join('\n')}
            onChange={(e) =>
              update('skills', e.target.value.split('\n').slice(0, 80))
            }
          />
        </label>
      )}
      {section === 'experience' && (
        <>
          {value.experience.map((r, i) => (
            <div
              key={i}
              className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4"
            >
              <div className="flex items-center justify-between gap-2">
                <strong className="text-sm">Position {i + 1}</strong>
                <button
                  type="button"
                  aria-label={`Remove position ${i + 1}`}
                  className={classButton + ' text-rose-700'}
                  onClick={() =>
                    update(
                      'experience',
                      value.experience.filter((_, j) => i !== j)
                    )
                  }
                >
                  <Trash2 className="size-4" />
                  Remove
                </button>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Job title"
                  maxLength={180}
                  value={r.role}
                  onChange={(v) => roleUpdate(i, { ...r, role: v })}
                />
                <Field
                  label="Company"
                  maxLength={180}
                  value={r.company}
                  onChange={(v) => roleUpdate(i, { ...r, company: v })}
                />
                <Field
                  label="Period"
                  maxLength={110}
                  value={r.period}
                  onChange={(v) => roleUpdate(i, { ...r, period: v })}
                />
                <Field
                  label="Location"
                  maxLength={180}
                  value={r.location}
                  onChange={(v) => roleUpdate(i, { ...r, location: v })}
                />
              </div>
              <Field
                label="Achievements, one per line"
                maxLength={12000}
                multiline
                value={r.bullets.join('\n')}
                onChange={(v) =>
                  roleUpdate(i, { ...r, bullets: v.split('\n').slice(0, 20) })
                }
              />
            </div>
          ))}
          <button
            type="button"
            disabled={value.experience.length >= 35}
            className={
              classButton + ' self-start border border-dashed border-teal-400'
            }
            onClick={() =>
              update('experience', [
                ...value.experience,
                {
                  company: '',
                  role: '',
                  period: '',
                  location: '',
                  bullets: [],
                },
              ])
            }
          >
            <Plus className="size-4" />
            Add experience
          </button>
        </>
      )}
      {section === 'education' && (
        <>
          {value.education.map((e, i) => (
            <div
              key={i}
              className="flex flex-col gap-4 rounded-xl border border-slate-200 p-4"
            >
              <div className="flex items-center justify-between">
                <strong className="text-sm">Qualification {i + 1}</strong>
                <button
                  type="button"
                  className={classButton + ' text-rose-700'}
                  onClick={() =>
                    update(
                      'education',
                      value.education.filter((_, j) => i !== j)
                    )
                  }
                >
                  Remove
                </button>
              </div>
              <Field
                label="Institution"
                maxLength={180}
                value={e.institution}
                onChange={(v) =>
                  update(
                    'education',
                    value.education.map((x, j) =>
                      i === j ? { ...x, institution: v } : x
                    )
                  )
                }
              />
              <Field
                label="Degree or qualification"
                maxLength={240}
                value={e.degree}
                onChange={(v) =>
                  update(
                    'education',
                    value.education.map((x, j) =>
                      i === j ? { ...x, degree: v } : x
                    )
                  )
                }
              />
            </div>
          ))}
          <button
            type="button"
            disabled={value.education.length >= 12}
            className={classButton + ' self-start'}
            onClick={() =>
              update('education', [
                ...value.education,
                { institution: '', degree: '' },
              ])
            }
          >
            <Plus className="size-4" />
            Add education
          </button>
        </>
      )}
      {section === 'projects' && (
        <>
          {value.projects.map((p, i) => (
            <div
              key={i}
              className="flex flex-col gap-4 rounded-xl border border-slate-200 p-4"
            >
              <div className="flex items-center justify-between">
                <strong className="text-sm">Project {i + 1}</strong>
                <button
                  type="button"
                  className={classButton + ' text-rose-700'}
                  onClick={() =>
                    update(
                      'projects',
                      value.projects.filter((_, j) => i !== j)
                    )
                  }
                >
                  Remove
                </button>
              </div>
              <Field
                label="Project name"
                maxLength={180}
                value={p.title}
                onChange={(v) =>
                  update(
                    'projects',
                    value.projects.map((x, j) =>
                      i === j ? { ...x, title: v } : x
                    )
                  )
                }
              />
              <Field
                label="Contribution and outcome"
                multiline
                maxLength={650}
                value={p.outcome}
                onChange={(v) =>
                  update(
                    'projects',
                    value.projects.map((x, j) =>
                      i === j ? { ...x, outcome: v } : x
                    )
                  )
                }
              />
            </div>
          ))}
          <button
            type="button"
            disabled={value.projects.length >= 30}
            className={classButton + ' self-start'}
            onClick={() =>
              update('projects', [
                ...value.projects,
                { title: '', outcome: '' },
              ])
            }
          >
            <Plus className="size-4" />
            Add project
          </button>
        </>
      )}
      {custom && (
        <div className="flex flex-col gap-4">
          <Field
            label="Section heading"
            maxLength={100}
            value={custom.title}
            onChange={(v) =>
              update(
                'customSections',
                value.customSections.map((s) =>
                  s.id === customId ? { ...s, title: v } : s
                )
              )
            }
          />
          <label className="text-sm font-semibold">
            Entries, one per line
            <textarea
              className={classInput + ' mt-2 resize-y'}
              rows={7}
              maxLength={10500}
              value={custom.items.join('\n')}
              onChange={(e) =>
                update(
                  'customSections',
                  value.customSections.map((s) =>
                    s.id === customId
                      ? { ...s, items: e.target.value.split('\n').slice(0, 30) }
                      : s
                  )
                )
              }
            />
          </label>
          <button
            type="button"
            className={classButton + ' self-start text-rose-700'}
            onClick={() => {
              if (window.confirm('Remove this custom section?'))
                update(
                  'customSections',
                  value.customSections.filter((s) => s.id !== customId)
                );
            }}
          >
            <Trash2 className="size-4" />
            Remove section
          </button>
        </div>
      )}
    </div>
  );
}

function ResumePaper({
  value,
  template,
}: {
  value: CareerDocument;
  template: Resume['template'];
}) {
  return (
    <article
      className={`career-print-area career-paper career-paper--${template}`}
      data-testid="career-preview"
      aria-label="Live résumé preview"
    >
      <header className="career-paper-header">
        <div className="career-monogram" aria-hidden>
          {value.name
            .trim()
            .split(/\s+/)
            .map((p) => p[0])
            .slice(0, 2)
            .join('')
            .toUpperCase()}
        </div>
        <div>
          <h2>{value.name || 'Your name'}</h2>
          <p className="career-paper-headline">
            {value.headline || 'Professional headline'}
          </p>
          {value.location && (
            <p className="career-paper-location">{value.location}</p>
          )}
        </div>
      </header>
      <div className="career-paper-body">
        <aside className="career-paper-side">
          {value.contacts.length > 0 && (
            <section>
              <h3>Contact</h3>
              {value.contacts.filter(Boolean).map((c, i) => (
                <p key={i} className="career-paper-contact">
                  {c}
                </p>
              ))}
            </section>
          )}
          {value.skills.length > 0 && (
            <section>
              <h3>Core skills</h3>
              <ul className="career-paper-skill-list">
                {value.skills.filter(Boolean).map((skill, i) => (
                  <li key={i}>{skill}</li>
                ))}
              </ul>
            </section>
          )}
          {value.education.length > 0 && (
            <section>
              <h3>Education</h3>
              {value.education.map((edu, i) => (
                <div className="career-paper-entry" key={i}>
                  <strong>{edu.institution}</strong>
                  <p>{edu.degree}</p>
                </div>
              ))}
            </section>
          )}
        </aside>
        <div className="career-paper-main">
          {value.summary && (
            <section>
              <h3>Professional summary</h3>
              <p>{value.summary}</p>
            </section>
          )}
          {value.experience.length > 0 && (
            <section>
              <h3>Experience</h3>
              {value.experience.map((job, i) => (
                <div className="career-paper-entry" key={i}>
                  <div className="career-paper-job">
                    <strong>{job.role || 'Job title'}</strong>
                    <span>{job.period}</span>
                  </div>
                  <p className="career-paper-company">
                    {job.company}
                    {job.location && ` · ${job.location}`}
                  </p>
                  {job.bullets.some(Boolean) && (
                    <ul>
                      {job.bullets.filter(Boolean).map((bullet, j) => (
                        <li key={j}>{bullet}</li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </section>
          )}
          {value.projects.length > 0 && (
            <section>
              <h3>Selected projects</h3>
              {value.projects.map((p, i) => (
                <div className="career-paper-entry" key={i}>
                  <strong>{p.title}</strong>
                  <p>{p.outcome}</p>
                </div>
              ))}
            </section>
          )}
        </div>
      </div>
      {value.customSections.length > 0 && (
        <div className="career-paper-extras">
          {value.customSections.map((s) => (
            <section key={s.id}>
              <h3>{s.title}</h3>
              <ul>
                {s.items.filter(Boolean).map((x, i) => (
                  <li key={i}>{x}</li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </article>
  );
}

const templateOptions = [
  {
    id: 'editorial',
    name: 'Editorial',
    description: 'Two-column layout with an expressive heading.',
  },
  {
    id: 'classic',
    name: 'Classic',
    description: 'Straightforward, single-column ATS-friendly document.',
  },
  {
    id: 'modern',
    name: 'Modern',
    description: 'Contemporary typography with structured experience.',
  },
  {
    id: 'minimal',
    name: 'Minimal',
    description: 'An understated, compact, single-column design.',
  },
] as const;
export default function CareerStudio({
  mode,
  onNavigate,
}: {
  mode: 'profile' | 'resumes';
  onNavigate: (path: string) => void;
}) {
  const pathname = usePathname();
  const sourceView = mode === 'profile';
  const galleryView = !sourceView && pathname.endsWith('/templates');
  const detailId =
    !sourceView && !galleryView && pathname !== '/dashboard/resumes'
      ? pathname.split('/')[3] || null
      : null;
  const [state, setState] = useState<CareerState | null>(null),
    [draft, setDraft] = useState<CareerDocument | Resume | null>(null);
  const [dirty, setDirty] = useState(false),
    [saving, setSaving] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const [search, setSearch] = useState(''),
    [tab, setTab] = useState<'sections' | 'preview'>('sections');
  const [section, setSection] = useState<SectionKey | null>(null),
    [showAdd, setShowAdd] = useState(false),
    [showTemplate, setShowTemplate] = useState(false);
  const [newSectionName, setNewSectionName] = useState('');
  useEffect(() => {
    let mounted = true;
    void fetch(api, { cache: 'no-store' })
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw Error(data.error || 'Career records unavailable');
        if (mounted) setState(data as CareerState);
      })
      .catch((e) => {
        if (mounted)
          setError(e instanceof Error ? e.message : 'Could not load résumés');
      });
    return () => {
      mounted = false;
    };
  }, []);
  useEffect(() => {
    if (!state) return;
    const doc = sourceView
      ? state.profile
      : state.resumes.find((r) => r.id === detailId);
    setDraft(doc ? clone(doc) : null);
    setDirty(false);
    setTab('sections');
    setSection(null);
  }, [state, sourceView, detailId]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  function go(path: string) {
    if (dirty && !window.confirm('Discard unsaved résumé changes?')) return;
    onNavigate(path);
  }
  function update(next: CareerDocument) {
    setDraft(next);
    setDirty(true);
    setNotice('');
  }
  function meta(
    key: 'label' | 'targetRole' | 'targetCompany' | 'jobDescription',
    value: string
  ) {
    if (!draft) return;
    setDraft({ ...draft, [key]: value });
    setDirty(true);
    setNotice('');
  }
  async function request(
    path: string,
    method: 'POST' | 'PUT' | 'DELETE',
    body: Record<string, unknown>
  ) {
    const result = await fetch(api + path, {
      method,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const next = (await result.json()) as CareerState & { error?: string };
    if (!result.ok) throw Error(next.error || 'Changes were not saved');
    setState(next);
    return next;
  }
  async function save() {
    if (!state || !draft) return false;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      await request(
        sourceView
          ? '/profile'
          : '/resumes/' + encodeURIComponent(detailId || ''),
        'PUT',
        { expectedRevision: state.revision, document: draft }
      );
      setDirty(false);
      setNotice('Saved to your personal career library.');
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Cannot save résumé');
      return false;
    } finally {
      setSaving(false);
    }
  }
  async function create(fromId?: string) {
    if (!state || saving) return;
    if (dirty && !window.confirm('Discard unsaved changes?')) return;
    setSaving(true);
    setError('');
    try {
      const next = await request('/resumes', 'POST', {
        expectedRevision: state.revision,
        fromId,
      });
      const added = next.resumes.find(
        (r) => !state.resumes.some((old) => old.id === r.id)
      );
      if (added) onNavigate('/dashboard/resumes/' + added.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create résumé');
    } finally {
      setSaving(false);
    }
  }
  async function remove() {
    if (
      !state ||
      !detailId ||
      saving ||
      !window.confirm('Delete this résumé? This cannot be undone.')
    )
      return;
    setSaving(true);
    setError('');
    try {
      await request('/resumes/' + encodeURIComponent(detailId), 'DELETE', {
        expectedRevision: state.revision,
      });
      onNavigate('/dashboard/resumes');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete résumé');
    } finally {
      setSaving(false);
    }
  }
  function addCustom() {
    if (!draft || draft.customSections.length >= 12) return;
    const title = newSectionName.trim();
    if (!title || title.length > 100) return;
    const id = crypto.randomUUID();
    update({
      ...draft,
      customSections: [...draft.customSections, { id, title, items: [] }],
    });
    setShowAdd(false);
    setNewSectionName('');
    setSection(`custom:${id}`);
  }
  const versions =
    state?.resumes.filter((r) =>
      [r.label, r.targetRole, r.targetCompany].some((s) =>
        s.toLowerCase().includes(search.toLowerCase())
      )
    ) || [];
  const detail = detailId && state?.resumes.find((r) => r.id === detailId);
  const currentTemplate = (
    !sourceView && draft && 'template' in draft ? draft.template : 'editorial'
  ) as Resume['template'];
  const sections: { key: SectionKey; title: string; detail: string }[] = draft
    ? [
        {
          key: 'identity',
          title: 'Professional summary',
          detail: draft.headline || 'Name, headline and summary',
        },
        {
          key: 'experience',
          title: 'Experience',
          detail: `${draft.experience.length} positions · individual achievements`,
        },
        {
          key: 'skills',
          title: 'Skills',
          detail: `${draft.skills.length} capabilities`,
        },
        {
          key: 'education',
          title: 'Education',
          detail: `${draft.education.length} qualifications`,
        },
        {
          key: 'projects',
          title: 'Projects',
          detail: `${draft.projects.length} selected projects`,
        },
        {
          key: 'contacts',
          title: 'Contact details',
          detail: `${draft.contacts.length} contact methods`,
        },
        ...draft.customSections.map((s) => ({
          key: `custom:${s.id}` as SectionKey,
          title: s.title,
          detail: `${s.items.length} entries`,
        })),
      ]
    : [];
  return (
    <div
      data-career-studio
      data-career-dirty={dirty ? 'true' : 'false'}
      data-testid={sourceView ? 'career-source-page' : 'resume-library-page'}
      className="career-studio mx-auto flex max-w-6xl flex-col gap-7 pb-14"
    >
      <header className="flex flex-col gap-2">
        <p className="text-xs font-bold tracking-widest text-teal-700 uppercase">
          Résumé studio
        </p>
        <h1 className="font-serif text-3xl tracking-tight text-slate-900">
          {sourceView
            ? 'Career source'
            : galleryView
              ? 'Document templates'
              : detail
                ? 'Edit your résumé'
                : 'Your résumé library'}
        </h1>
        <p className="max-w-2xl text-sm leading-6 text-slate-600">
          {sourceView
            ? 'Career information you enter and review is used to start new résumés.'
            : galleryView
              ? 'Compare document styles for different job applications.'
              : detail
                ? 'Edit individual sections without a crowded form.'
                : 'Manage separate résumé versions for different roles and companies.'}
        </p>
      </header>

      <nav
        aria-label="Résumé studio navigation"
        className="flex flex-wrap gap-2 border-b border-slate-200 pb-4"
      >
        {[
          ['Library', '/dashboard/resumes'],
          ['Career source', '/dashboard/resumes/profile'],
          ['Templates', '/dashboard/resumes/templates'],
        ].map(([name, path]) => (
          <button
            key={path}
            type="button"
            onClick={() => go(path)}
            className={
              'rounded-xl px-4 py-3 text-sm font-semibold ' +
              (pathname === path
                ? 'bg-teal-700 text-white'
                : 'bg-white text-slate-700 hover:bg-slate-100')
            }
          >
            {name}
          </button>
        ))}
        {detail && (
          <span className="self-center px-3 text-xs text-slate-500">
            / {detail.label}
          </span>
        )}
      </nav>
      {error && (
        <p
          role="alert"
          className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"
        >
          {error}{' '}
          {error.includes('changed') && (
            <button
              type="button"
              className="ml-2 underline"
              onClick={() => window.location.reload()}
            >
              Reload
            </button>
          )}
        </p>
      )}
      {notice && (
        <p
          role="status"
          className="rounded-xl border border-teal-200 bg-teal-50 p-4 text-sm text-teal-800"
        >
          {notice}
        </p>
      )}
      {!state ? (
        <p
          role="status"
          className="rounded-2xl bg-white p-8 text-sm text-slate-600"
        >
          {error
            ? 'Start the local Utomator engine to load your résumés.'
            : 'Loading résumé library…'}
        </p>
      ) : (
        <>
          {!sourceView && !galleryView && !detailId && (
            <section className="flex flex-col gap-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="font-serif text-2xl">Saved versions</h2>
                  <p className="mt-2 text-sm text-slate-500">
                    {state.resumes.length} saved résumé(s), each independent.
                  </p>
                </div>
                <button
                  className={
                    classButton + ' bg-teal-700 text-white hover:bg-teal-800'
                  }
                  disabled={
                    saving ||
                    !state.profile.name.trim() ||
                    !state.profile.headline.trim()
                  }
                  onClick={() => void create()}
                >
                  <Plus className="size-4" />
                  New résumé
                </button>
              </div>
              <label className="block">
                <span className="sr-only">Search résumés</span>
                <span className="relative block">
                  <Search className="absolute top-3.5 left-4 size-4 text-slate-400" />
                  <input
                    className={classInput + ' pl-11'}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search by role, company or version"
                  />
                </span>
              </label>
              <div className="grid gap-5 md:grid-cols-2">
                {versions.map((r) => (
                  <button
                    type="button"
                    key={r.id}
                    onClick={() => go('/dashboard/resumes/' + r.id)}
                    className="group rounded-3xl border border-slate-200 bg-white p-7 text-left shadow-sm transition hover:border-teal-300 hover:shadow-lg"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <FileText className="size-6 text-teal-700" />
                      <ArrowRight className="size-4 text-slate-400 group-hover:text-teal-700" />
                    </div>
                    <h3 className="mt-6 font-serif text-xl text-slate-900">
                      {r.label}
                    </h3>
                    <p className="mt-2 text-sm text-slate-600">
                      {r.targetRole || 'General résumé'}
                      {r.targetCompany ? ' · ' + r.targetCompany : ''}
                    </p>
                    <div className="mt-6 flex flex-wrap gap-2 text-xs text-slate-500">
                      <span className="rounded-full bg-slate-100 px-3 py-1">
                        {r.template} template
                      </span>
                      <span>
                        Updated {new Date(r.updatedAt).toLocaleDateString()}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
              {versions.length === 0 && (
                <p className="rounded-2xl bg-white p-10 text-center text-sm text-slate-600">
                  {state.resumes.length === 0
                    ? 'No résumés yet. Add your name and professional headline in Career source, then create a résumé.'
                    : 'No matching résumés. Try another search or create a new version.'}
                </p>
              )}
            </section>
          )}
          {galleryView && (
            <section className="grid gap-5 md:grid-cols-2">
              {templateOptions.map((t) => (
                <article
                  key={t.id}
                  className="rounded-3xl border border-slate-200 bg-white p-7"
                >
                  <div
                    className={`career-template-tile career-template-tile--${t.id}`}
                  >
                    <span />
                    <span />
                    <span />
                    <span />
                  </div>
                  <h2 className="mt-5 font-serif text-xl">{t.name}</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    {t.description}
                  </p>
                  <p className="mt-4 text-xs text-slate-500">
                    Select this template in any individual résumé editor.
                  </p>
                </article>
              ))}
            </section>
          )}
          {(sourceView || detailId) && draft && (
            <section className="flex flex-col gap-6">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-5">
                <div>
                  <h2 className="font-serif text-xl text-slate-900">
                    {sourceView
                      ? 'Master career source'
                      : (draft as Resume).label}
                  </h2>
                  <p className="mt-2 text-sm text-slate-500">
                    {dirty ? 'Unsaved changes' : 'All changes saved'} ·{' '}
                    {sourceView
                      ? 'Used when creating new résumés'
                      : (draft as Resume).targetRole || 'General résumé'}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    className={
                      classButton + ' bg-teal-700 text-white hover:bg-teal-800'
                    }
                    disabled={saving || !dirty}
                    onClick={() => void save()}
                  >
                    <Save className="size-4" />
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                  {!sourceView && (
                    <button
                      className={classButton}
                      onClick={() =>
                        setTab(tab === 'preview' ? 'sections' : 'preview')
                      }
                    >
                      {tab === 'preview' ? 'Edit sections' : 'Preview document'}
                    </button>
                  )}
                </div>
              </div>
              {!sourceView && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-teal-50 p-5">
                  <div>
                    <p className="text-xs font-bold tracking-wide text-teal-800 uppercase">
                      Application target
                    </p>
                    <p className="mt-1 text-sm text-slate-800">
                      {(draft as Resume).targetRole || 'Not specified'}
                      {(draft as Resume).targetCompany
                        ? ' at ' + (draft as Resume).targetCompany
                        : ''}
                    </p>
                  </div>
                  <button
                    className={classButton}
                    onClick={() => setSection('target')}
                  >
                    Edit target
                  </button>
                </div>
              )}
              {tab === 'sections' && (
                <>
                  <div className="grid gap-4 md:grid-cols-2">
                    {sections.map((s) => (
                      <article
                        key={s.key}
                        className="rounded-2xl border border-slate-200 bg-white p-6"
                      >
                        <h3 className="font-serif text-xl text-slate-900">
                          {s.title}
                        </h3>
                        <p className="mt-3 min-h-12 text-sm leading-6 text-slate-600">
                          {s.detail}
                        </p>
                        <button
                          type="button"
                          onClick={() => setSection(s.key)}
                          className={classButton + ' mt-4'}
                        >
                          <Pencil className="size-4" />
                          Edit section
                        </button>
                      </article>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-3">
                    {draft.customSections.length < 12 && (
                      <button
                        className={
                          classButton + ' border-dashed border-teal-500'
                        }
                        onClick={() => setShowAdd(true)}
                      >
                        <Plus className="size-4" />
                        Add custom section
                      </button>
                    )}
                    {!sourceView && (
                      <button
                        className={classButton}
                        onClick={() => setShowTemplate(true)}
                      >
                        <LayoutTemplate className="size-4" />
                        Choose template · {currentTemplate}
                      </button>
                    )}
                  </div>
                  {!sourceView && (
                    <div className="flex flex-wrap gap-2">
                      <button
                        className={classButton}
                        disabled={saving}
                        onClick={() => void create(detailId || undefined)}
                      >
                        <Copy className="size-4" />
                        Duplicate
                      </button>
                      <button
                        className={classButton + ' text-rose-700'}
                        disabled={saving || state.resumes.length <= 1}
                        onClick={() => void remove()}
                      >
                        <Trash2 className="size-4" />
                        Delete version
                      </button>
                    </div>
                  )}
                </>
              )}
              {!sourceView && tab === 'preview' && (
                <div className="mx-auto w-full max-w-[850px]">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <h2 className="font-serif text-xl">Live résumé preview</h2>
                    <div className="flex flex-wrap gap-2">
                      <button
                        className={classButton}
                        onClick={() => setShowTemplate(true)}
                      >
                        <LayoutTemplate className="size-4" />
                        Change template
                      </button>
                      <button
                        className={classButton}
                        onClick={() => window.print()}
                      >
                        <Printer className="size-4" />
                        Print / PDF
                      </button>
                    </div>
                  </div>
                  <div className="career-preview-panel">
                    <ResumePaper value={draft} template={currentTemplate} />
                  </div>
                  <p className="mt-4 text-xs leading-6 text-slate-500">
                    The preview uses your actual edited content. Use Print / PDF
                    for a document export. Nothing is submitted to employers
                    automatically.
                  </p>
                </div>
              )}
              {sourceView && (
                <p className="rounded-2xl bg-white p-5 text-sm leading-6 text-slate-600">
                  <ShieldCheck className="mr-2 inline size-4 text-teal-700" />
                  Editing the career source does not modify an existing tailored
                  résumé or your Utomator owner profile.
                </p>
              )}
              {!sourceView && tab === 'sections' && (
                <div className="career-print-standby">
                  <ResumePaper value={draft} template={currentTemplate} />
                </div>
              )}
            </section>
          )}
          {!sourceView && detailId && !detail && (
            <div className="rounded-2xl border border-amber-200 bg-white p-8">
              <p role="alert">
                This résumé does not exist in the local library.
              </p>
              <button
                className={classButton + ' mt-4'}
                onClick={() => go('/dashboard/resumes')}
              >
                Back to library
              </button>
            </div>
          )}
        </>
      )}
      <StudioDialog
        open={Boolean(section)}
        title={
          section === 'target'
            ? 'Tailor this application'
            : section?.startsWith('custom:')
              ? 'Edit custom section'
              : 'Edit ' +
                (sections.find((s) => s.key === section)?.title || 'section')
        }
        description="Only this section is editable. Save to persist your changes locally."
        size="wide"
        testId="career-section-dialog"
        onDismiss={() => !saving && setSection(null)}
      >
        {draft && section && (
          <div className="flex flex-col gap-5">
            <SectionEditor
              section={section}
              value={draft}
              onChange={update}
              onMeta={meta}
            />
            {error && (
              <p role="alert" className="text-sm text-rose-700">
                {error}
              </p>
            )}
            <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
              <button
                className={classButton}
                disabled={saving}
                onClick={() => setSection(null)}
              >
                Close
              </button>
              <button
                className={
                  classButton + ' bg-teal-700 text-white hover:bg-teal-800'
                }
                disabled={saving}
                onClick={() => {
                  void save().then((ok) => {
                    if (ok) setSection(null);
                  });
                }}
              >
                <Save className="size-4" />
                {saving ? 'Saving…' : 'Save section'}
              </button>
            </div>
          </div>
        )}
      </StudioDialog>
      <StudioDialog
        open={showAdd}
        title="Add a résumé section"
        description="Add certifications, awards, publications or any other section you need."
        onDismiss={() => setShowAdd(false)}
        testId="career-add-section-dialog"
      >
        <div className="flex flex-col gap-5">
          <label className="text-sm font-semibold text-slate-700">
            Section title
            <input
              className={classInput + ' mt-2'}
              maxLength={100}
              value={newSectionName}
              onChange={(e) => setNewSectionName(e.target.value)}
              placeholder="e.g. Certifications"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            {['Certifications', 'Awards', 'Publications', 'Volunteering'].map(
              (x) => (
                <button
                  className={classButton}
                  key={x}
                  onClick={() => setNewSectionName(x)}
                >
                  {x}
                </button>
              )
            )}
          </div>
          <button
            className={classButton + ' self-end bg-teal-700 text-white'}
            disabled={!newSectionName.trim() || newSectionName.length > 100}
            onClick={addCustom}
          >
            <Plus className="size-4" />
            Add section
          </button>
        </div>
      </StudioDialog>
      <StudioDialog
        open={showTemplate}
        title="Choose résumé template"
        description="Choose how this résumé looks. Your words and role history stay unchanged."
        size="wide"
        onDismiss={() => setShowTemplate(false)}
        testId="career-template-dialog"
      >
        <div className="grid gap-5 sm:grid-cols-2">
          {templateOptions.map((t) => (
            <button
              type="button"
              key={t.id}
              onClick={() => {
                meta('label', (draft as Resume).label);
                setDraft((d) => (d ? { ...d, template: t.id } : d));
                setDirty(true);
                setShowTemplate(false);
                setTab('preview');
              }}
              className={
                'rounded-2xl border p-5 text-left hover:border-teal-400 ' +
                (currentTemplate === t.id
                  ? 'border-teal-600 bg-teal-50'
                  : 'border-slate-200')
              }
            >
              <div
                className={`career-template-tile career-template-tile--${t.id}`}
              >
                <span />
                <span />
                <span />
                <span />
              </div>
              <strong className="mt-4 block text-base">{t.name}</strong>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                {t.description}
              </p>
            </button>
          ))}
        </div>
      </StudioDialog>
    </div>
  );
}
