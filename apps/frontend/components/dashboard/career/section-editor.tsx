'use client';

import ContactsSection from './sections/contacts-section';
import CustomSection from './sections/custom-section';
import EducationSection from './sections/education-section';
import ExperienceSection from './sections/experience-section';
import IdentitySection from './sections/identity-section';
import ProjectsSection from './sections/projects-section';
import SkillsSection from './sections/skills-section';
import TargetSection from './sections/target-section';
import type { CareerDocument, Resume, Role, SectionKey } from './types';

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
    value: string,
  ) => void;
}) {
  const update = <K extends keyof CareerDocument>(
    key: K,
    next: CareerDocument[K],
  ) => onChange({ ...value, [key]: next });
  const roleUpdate = (i: number, next: Role) =>
    update(
      'experience',
      value.experience.map((r, j) => (j === i ? next : r)),
    );
  const customId = section.startsWith('custom:') ? section.slice(7) : null;
  return (
    <div className="flex flex-col gap-6" data-testid="career-section-editor">
      {section === 'target' && 'targetRole' in value && onMeta && (
        <TargetSection value={value as unknown as Resume} onMeta={onMeta} />
      )}
      {section === 'identity' && (
        <IdentitySection value={value} update={update} />
      )}
      {section === 'contacts' && (
        <ContactsSection value={value} update={update} />
      )}
      {section === 'skills' && <SkillsSection value={value} update={update} />}
      {section === 'experience' && (
        <ExperienceSection
          value={value}
          update={update}
          roleUpdate={roleUpdate}
        />
      )}
      {section === 'education' && (
        <EducationSection value={value} update={update} />
      )}
      {section === 'projects' && (
        <ProjectsSection value={value} update={update} />
      )}
      {customId && (
        <CustomSection value={value} customId={customId} update={update} />
      )}
    </div>
  );
}
