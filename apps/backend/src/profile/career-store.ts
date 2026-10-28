import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type {DocumentStore} from '../db/documents.js';

export type CareerRole = { company: string; role: string; period: string; location: string; bullets: string[] };
export type CareerProject = { title: string; outcome: string };
export type CareerDocument = {
  name: string; headline: string; location: string; summary: string;
  contacts: string[]; education: { institution: string; degree: string }[];
  experience: CareerRole[]; skills: string[]; projects: CareerProject[];
  customSections: { id: string; title: string; items: string[] }[];
};
export type ResumeTemplate = 'editorial' | 'classic' | 'modern' | 'minimal';
export type ResumeVersion = CareerDocument & {
  id: string; label: string; targetRole: string; targetCompany: string;
  jobDescription: string; template: ResumeTemplate; updatedAt: string;
};
export type CareerState = { revision: number; profile: CareerDocument; resumes: ResumeVersion[] };

const text = (value: unknown, limit: number, field: string): string => {
  if (typeof value !== 'string' || value.length > limit) throw new Error(`Invalid ${field}`);
  return value.trim();
};
const list = (value: unknown, limit: number, maxLength: number, field: string): string[] => {
  if (!Array.isArray(value) || value.length > limit) throw new Error(`Invalid ${field}`);
  return value.map(item => text(item, maxLength, field)).filter(Boolean);
};
const record = (value: unknown, field: string): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Invalid ${field}`);
  return value as Record<string, unknown>;
};

// Validate every mutable field. No user-supplied filesystem path or HTML is accepted.
export function parseCareerDocument(value: unknown): CareerDocument {
  const doc = record(value, 'career document');
  const name = text(doc.name, 150, 'name');
  const headline = text(doc.headline, 240, 'headline');
  if (!name || !headline) throw new Error('Name and headline are required');
  const education = doc.education;
  const experience = doc.experience;
  const projects = doc.projects;
  const customSections = doc.customSections ?? [];
  if (!Array.isArray(customSections) || customSections.length > 12) throw Error('Invalid custom sections');
  if (!Array.isArray(education) || education.length > 12) throw new Error('Invalid education');
  if (!Array.isArray(experience) || experience.length > 35) throw new Error('Invalid experience');
  if (!Array.isArray(projects) || projects.length > 30) throw new Error('Invalid projects');
  return {
    name, headline, location: text(doc.location, 180, 'location'),
    summary: text(doc.summary, 3000, 'summary'),
    contacts: list(doc.contacts, 16, 240, 'contacts'),
    education: education.map((row, index) => {
      const r = record(row, `education ${index}`);
      return { institution: text(r.institution, 180, 'institution'), degree: text(r.degree, 240, 'degree') };
    }),
    experience: experience.map((row, index) => {
      const r = record(row, `experience ${index}`);
      return {
        company: text(r.company, 180, 'company'), role: text(r.role, 180, 'role'),
        period: text(r.period, 110, 'period'), location: text(r.location, 180, 'location'),
        bullets: list(r.bullets, 20, 650, 'experience bullets'),
      };
    }),
    skills: list(doc.skills, 80, 120, 'skills'),
    customSections: customSections.map((entry, index) => {
      const row = record(entry, 'custom section ' + index);
      const id = text(row.id, 60, 'custom section id');
      const title = text(row.title, 100, 'custom section title');
      if (!/^[a-zA-Z0-9-]{1,60}$/.test(id) || !title) throw Error('Section ID and title are required');
      return { id, title, items: list(row.items, 30, 350, 'custom section items') };
    }),
    projects: projects.map((row, index) => {
      const r = record(row, `project ${index}`);
      return { title: text(r.title, 180, 'project title'), outcome: text(r.outcome, 650, 'project outcome') };
    }),
  };
}
function parseResume(value: unknown, existing?: ResumeVersion): ResumeVersion {
  const data = record(value, 'résumé');
  return {
    ...parseCareerDocument(value),
    id: existing?.id ?? randomUUID(),
    label: text(data.label, 120, 'résumé label') || 'Untitled résumé',
    targetRole: text(data.targetRole, 180, 'target role'),
    targetCompany: text(data.targetCompany, 180, 'target company'),
    jobDescription: text(data.jobDescription, 12000, 'job description'),
    template: data.template === 'editorial' || data.template === 'classic' || data.template === 'modern' || data.template === 'minimal'
      ? data.template : (() => { throw new Error('Invalid résumé template'); })(),
    updatedAt: new Date().toISOString(),
  };
}

const emptyCareerDocument = (): CareerDocument => ({
  name: '', headline: '', location: '', summary: '',
  contacts: [], education: [], experience: [], skills: [],
  projects: [], customSections: [],
});

export class CareerStore {
  private readonly file: string;
  private queue: Promise<void> = Promise.resolve();
  private documents?:DocumentStore;
  setDocuments(documents:DocumentStore){this.documents=documents;}
  constructor(root = process.cwd()) {
    this.file = resolve(root, '.runtime', 'career-studio.json');
  }
  async get(): Promise<CareerState> {
    try {
      const stored=this.documents?await this.documents.get<CareerState>('career','profile'):null;
      if(this.documents?.ownerId!=='local-owner' && this.documents && !stored)
        return {revision:0,profile:emptyCareerDocument(),resumes:[]};
      const content=stored ? stored.value : JSON.parse(await readFile(this.file, 'utf8')) as CareerState;
      if (!Number.isSafeInteger(content.revision) || content.revision < 0 || !Array.isArray(content.resumes) || content.resumes.length > 40)
        throw new Error('Career workspace file is invalid');
      const profile = parseCareerDocument(content.profile);
      const resumes = content.resumes.map(row => {
        if (typeof row.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(row.id) ||
            typeof row.updatedAt !== 'string' || !Number.isFinite(Date.parse(row.updatedAt)))
          throw new Error('Career résumé file is invalid');
        return { ...parseResume(row, row), updatedAt: row.updatedAt };
      });
      return { revision: content.revision, profile, resumes };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      // A new career workspace has no implicit owner and no fabricated résumé.
      // Existing saved documents are still loaded by the normal read path above.
      return { revision: 0, profile: emptyCareerDocument(), resumes: [] };
    }
  }
  private async change(expectedRevision: number, fn: (current: CareerState) => CareerState): Promise<CareerState> {
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw new Error('Invalid expected revision');
    const operation = this.queue.then(async () => {
      const current = await this.get();
      if (current.revision !== expectedRevision) throw new Error('Career workspace has changed. Reload before saving.');
      const next = fn(current);
      next.revision = current.revision + 1;
      if(this.documents){
        const stored=await this.documents.get<CareerState>('career','profile');
        await this.documents.put('career','profile',next,stored?.version??0);
      }else{
        await mkdir(dirname(this.file), { recursive: true, mode: 0o700 });
        const temp = `${this.file}.${randomUUID()}.tmp`;
        await writeFile(temp, JSON.stringify(next, null, 2) + '\n', { mode: 0o600 });
        await rename(temp, this.file);
      }
      return next;
    });
    this.queue = operation.then(() => undefined, () => undefined);
    return operation;
  }
  updateProfile(expectedRevision: number, raw: unknown) {
    const profile = parseCareerDocument(raw);
    return this.change(expectedRevision, current => ({ ...current, profile }));
  }
  createResume(expectedRevision: number, fromId?: string) {
    return this.change(expectedRevision, current => {
      if (current.resumes.length >= 40) throw new Error('Maximum 40 résumé versions');
      const origin = fromId ? current.resumes.find(r => r.id === fromId) : undefined;
      if (fromId && !origin) throw new Error('Source résumé not found');
      const doc = structuredClone(origin || current.profile);
      if (!doc.name.trim() || !doc.headline.trim())
        throw new Error('Complete your career source name and headline before creating a résumé');
      const draft = parseResume({ ...doc, label: origin ? `${origin.label} copy` : 'New tailored résumé',
        targetRole: '', targetCompany: '', jobDescription: '', template: origin?.template || 'editorial' });
      return { ...current, resumes: [draft, ...current.resumes] };
    });
  }
  updateResume(expectedRevision: number, id: string, raw: unknown) {
    return this.change(expectedRevision, current => {
      const match = current.resumes.find(r => r.id === id);
      if (!match) throw new Error('Résumé not found');
      const replacement = parseResume(raw, match);
      return { ...current, resumes: current.resumes.map(r => r.id === id ? replacement : r) };
    });
  }
  deleteResume(expectedRevision: number, id: string) {
    return this.change(expectedRevision, current => {
      if (!current.resumes.some(r => r.id === id)) throw new Error('Résumé not found');
      if (current.resumes.length === 1) throw new Error('Keep at least one résumé version');
      return { ...current, resumes: current.resumes.filter(r => r.id !== id) };
    });
  }
}
