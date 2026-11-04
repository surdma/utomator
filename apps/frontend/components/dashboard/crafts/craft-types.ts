export type Category =
  | 'presence'
  | 'portfolio'
  | 'job-hunt'
  | 'applications'
  | 'content'
  | 'engagement';
export type Kind =
  | 'brief'
  | 'research'
  | 'draft'
  | 'review'
  | 'publish'
  | 'measure';
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
export type Draft = Omit<
  Craft,
  'id' | 'version' | 'updatedAt' | 'scope' | 'sourceCraftId'
>;
