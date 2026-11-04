'use client';

import { Plus, Save } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import StudioDialog from '@/components/ui/studio-dialog';
import SectionEditor from './section-editor';
import CareerStudioHeader from './sections/career-studio-header';
import CareerStudioNav from './sections/career-studio-nav';
import ResumeDetail from './sections/resume-detail';
import ResumeLibrary from './sections/resume-library';
import ResumeTemplateGallery from './sections/resume-template-gallery';
import { classButton, classInput } from './styles';
import type { CareerDocument, CareerState, Resume, SectionKey } from './types';
import './career-studio.css';
import './career-redesign.css';

const api = '/api/career';
const clone = <T,>(item: T): T => structuredClone(item);
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
    value: string,
  ) {
    if (!draft) return;
    setDraft({ ...draft, [key]: value });
    setDirty(true);
    setNotice('');
  }
  async function request(
    path: string,
    method: 'POST' | 'PUT' | 'DELETE',
    body: Record<string, unknown>,
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
          : `/resumes/${encodeURIComponent(detailId || '')}`,
        'PUT',
        { expectedRevision: state.revision, document: draft },
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
        (r) => !state.resumes.some((old) => old.id === r.id),
      );
      if (added) onNavigate(`/dashboard/resumes/${added.id}`);
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
      await request(`/resumes/${encodeURIComponent(detailId)}`, 'DELETE', {
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
        s.toLowerCase().includes(search.toLowerCase()),
      ),
    ) || [];
  const resumeDetail = detailId
    ? state?.resumes.find((r) => r.id === detailId)
    : undefined;
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
      <CareerStudioHeader
        sourceView={sourceView}
        galleryView={galleryView}
        detail={resumeDetail}
      />

      <CareerStudioNav pathname={pathname} detail={resumeDetail} go={go} />
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
            <ResumeLibrary
              state={state}
              versions={versions}
              search={search}
              setSearch={setSearch}
              saving={saving}
              create={() => void create()}
              go={go}
            />
          )}
          {galleryView && (
            <ResumeTemplateGallery templateOptions={templateOptions} />
          )}
          {(sourceView || detailId) && draft && (
            <ResumeDetail
              sourceView={sourceView}
              draft={draft}
              dirty={dirty}
              saving={saving}
              tab={tab}
              setTab={setTab}
              sections={sections}
              currentTemplate={currentTemplate}
              state={state}
              detailId={detailId}
              save={save}
              setSection={setSection}
              setShowAdd={setShowAdd}
              setShowTemplate={setShowTemplate}
              create={(fromId) => void create(fromId)}
              remove={() => void remove()}
            />
          )}
          {!sourceView && detailId && !resumeDetail && (
            <div className="rounded-2xl border border-amber-200 bg-white p-8">
              <p role="alert">
                This résumé does not exist in the local library.
              </p>
              <button
                className={`${classButton} mt-4`}
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
                className={`${classButton} bg-teal-700 text-white hover:bg-teal-800`}
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
              className={`${classInput} mt-2`}
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
              ),
            )}
          </div>
          <button
            className={`${classButton} self-end bg-teal-700 text-white`}
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
