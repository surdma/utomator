// The role titles are supplied by the portfolio owner. Avoid inventing tenure or traction.
export const professionalRoles = [
  {
    label: 'Engineering',
    title: 'Software engineer',
    organization: 'Product & platform systems',
  },
  {
    label: 'Leadership',
    title: 'CAE / VP Engineering',
    organization: 'MilliHub',
  },
  { label: 'Founder', title: 'Technical founder', organization: 'Relvor' },
] as const;

// Short descriptions of established work; individual outcomes live on /projects.
export const strengths = [
  '0→1 product delivery',
  'Backend & platform engineering',
  'System reliability',
  'Product ownership',
] as const;
