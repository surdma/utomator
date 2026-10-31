export type Role = {
  company: string;
  role: string;
  period: string;
  location: string;
  bullets: string[];
};
export type Project = { title: string; outcome: string };
export type CareerDocument = {
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
export type Resume = CareerDocument & {
  id: string;
  label: string;
  targetRole: string;
  targetCompany: string;
  jobDescription: string;
  template: 'editorial' | 'classic' | 'modern' | 'minimal';
  updatedAt: string;
};
export type CareerState = {
  revision: number;
  profile: CareerDocument;
  resumes: Resume[];
};
export type SectionKey =
  | 'identity'
  | 'contacts'
  | 'experience'
  | 'education'
  | 'skills'
  | 'projects'
  | 'target'
  | `custom:${string}`;
