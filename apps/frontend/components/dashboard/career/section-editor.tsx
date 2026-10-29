'use client';

import { Plus, Trash2 } from 'lucide-react';
import type { CareerDocument, Resume, Role, SectionKey } from './types';
import { classInput, classButton } from './styles';

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
export default function SectionEditor({
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

