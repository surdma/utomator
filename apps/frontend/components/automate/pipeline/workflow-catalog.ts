export type Platform = 'linkedin' | 'x';

export type Field = {
  key: string;
  label: string;
  multiline?: boolean;
  placeholder?: string;
  required?: boolean;
  max?: number;
};
export type Workflow = {
  id: string;
  title: string;
  category: string;
  fields: Field[];
};

export const workflows: Record<Platform, Workflow[]> = {
  linkedin: [
    { id: 'audit', title: 'Profile audit', category: 'Inspect', fields: [] },
    {
      id: 'audit-page',
      title: 'Inspect selected page',
      category: 'Inspect',
      fields: [],
    },
    {
      id: 'edit-profile',
      title: 'Headline & About',
      category: 'Profile',
      fields: [
        { key: 'headline', label: 'Headline', max: 220 },
        { key: 'about', label: 'About', multiline: true, max: 2600 },
      ],
    },
    {
      id: 'edit-experience',
      title: 'Experience',
      category: 'Profile',
      fields: [
        {
          key: 'positionId',
          label: 'Existing LinkedIn position ID',
          required: true,
        },
        {
          key: 'description',
          label: 'Experience description',
          multiline: true,
          required: true,
        },
        { key: 'startMonth', label: 'Start month (optional)' },
        { key: 'startYear', label: 'Start year (optional)' },
      ],
    },
    {
      id: 'add-skill',
      title: 'Add skill',
      category: 'Profile',
      fields: [{ key: 'skill', label: 'Exact skill', required: true }],
    },
    {
      id: 'edit-website',
      title: 'Contact website',
      category: 'Profile',
      fields: [
        { key: 'website', label: 'HTTPS website', required: true },
        { key: 'websiteIndex', label: 'Row index (0–9)', placeholder: '0' },
        { key: 'websiteType', label: 'Website type (optional)' },
      ],
    },
    {
      id: 'edit-services',
      title: 'Services',
      category: 'Profile',
      fields: [
        {
          key: 'description',
          label: 'Services description',
          multiline: true,
          required: true,
        },
      ],
    },
    {
      id: 'add-project',
      title: 'Add project',
      category: 'Showcase',
      fields: [
        { key: 'projectName', label: 'Project name', required: true },
        {
          key: 'description',
          label: 'Contribution and outcome',
          required: true,
          multiline: true,
        },
        { key: 'projectUrl', label: 'Optional media URL' },
      ],
    },
    {
      id: 'add-featured',
      title: 'Featured link',
      category: 'Showcase',
      fields: [
        { key: 'projectUrl', label: 'HTTPS destination', required: true },
        { key: 'featuredTitle', label: 'Featured title', required: true },
      ],
    },
  ],
  x: [
    { id: 'audit', title: 'Profile audit', category: 'Inspect', fields: [] },
    {
      id: 'audit-page',
      title: 'Inspect selected page',
      category: 'Inspect',
      fields: [],
    },
    {
      id: 'edit-profile',
      title: 'Bio & contact',
      category: 'Profile',
      fields: [
        { key: 'bio', label: 'Bio', multiline: true, max: 160 },
        { key: 'location', label: 'Location' },
        { key: 'website', label: 'HTTPS website' },
      ],
    },
    {
      id: 'upload-banner',
      title: 'Upload banner',
      category: 'Profile',
      fields: [
        {
          key: 'bannerPath',
          label: 'Local image in apps/backend/assets',
          required: true,
        },
      ],
    },
    {
      id: 'compose-post',
      title: 'Publish one post',
      category: 'Content',
      fields: [
        {
          key: 'postText',
          label: 'Post text',
          required: true,
          multiline: true,
          max: 280,
        },
      ],
    },
    {
      id: 'pin-post',
      title: 'Pin post',
      category: 'Content',
      fields: [{ key: 'postUrl', label: 'Exact post URL', required: true }],
    },
    {
      id: 'delete-post',
      title: 'Delete one post',
      category: 'Content',
      fields: [
        { key: 'postUrl', label: 'Exact authored post URL', required: true },
      ],
    },
  ],
};
