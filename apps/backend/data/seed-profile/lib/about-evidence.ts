// Shared technology taxonomy for the About page and downloadable résumé.
// Professional capabilities remain separate from named technologies.
export type Technology = { name: string; icon?: string; context?: string };
export const technologyGroups: readonly {
  heading: string;
  explanation: string;
  items: readonly Technology[];
}[] = [
  {
    heading: 'Languages',
    explanation:
      'Programming languages used across application and systems engineering.',
    items: [
      { name: 'TypeScript', icon: 'typescript' },
      { name: 'JavaScript', icon: 'javascript' },
      { name: 'Python', icon: 'python' },
      { name: 'Rust', icon: 'rust' },
      { name: 'Dart', icon: 'dart' },
    ],
  },
  {
    heading: 'Backend frameworks',
    explanation: 'Server-side web frameworks and API application stacks.',
    items: [
      { name: 'Django', icon: 'django' },
      { name: 'Flask' },
      { name: 'FastAPI', icon: 'fastapi' },
      { name: 'NestJS' },
      { name: 'Axum' },
    ],
  },
  {
    heading: 'Frontend, UI & mobile',
    explanation:
      'Web and mobile frameworks, UI components, styling and animation.',
    items: [
      { name: 'React', icon: 'react' },
      { name: 'Next.js', icon: 'nextjs' },
      { name: 'Flutter', icon: 'flutter' },
      { name: 'Tailwind CSS', icon: 'tailwindcss' },
      { name: 'shadcn/ui' },
      { name: 'Framer Motion' },
    ],
  },
  {
    heading: 'Databases & ORMs',
    explanation:
      'Datastores, cache technologies and object-relational mapping.',
    items: [
      { name: 'PostgreSQL', icon: 'postgresql' },
      { name: 'MongoDB' },
      { name: 'SQLite', icon: 'sqlite' },
      { name: 'Redis', icon: 'redis' },
      { name: 'Prisma', icon: 'prisma' },
      { name: 'SQLAlchemy' },
      { name: 'Mongoose' },
      { name: 'Django ORM' },
    ],
  },
  {
    heading: 'APIs & real-time',
    explanation:
      'API styles and communication transports, including Server-Sent Events (SSE).',
    items: [
      { name: 'REST APIs' },
      { name: 'GraphQL' },
      { name: 'WebSockets' },
      { name: 'SSE' },
    ],
  },
  {
    heading: 'Messaging & background jobs',
    explanation: 'Message brokers and asynchronous task processing.',
    items: [
      { name: 'RabbitMQ' },
      { name: 'Celery' },
      { name: 'BullMQ' },
      { name: 'Kafka' },
      { name: 'S3' },
      { name: 'CloudWatch' },
    ],
  },
  {
    heading: 'Cloud & hosted services',
    explanation:
      'Infrastructure cloud providers and managed backend platforms.',
    items: [
      { name: 'AWS' },
      { name: 'Hetzner' },
      { name: 'Scaleway' },
      { name: 'Firebase' },
      { name: 'Supabase', icon: 'supabase' },
    ],
  },
  {
    heading: 'Deployment & infrastructure',
    explanation:
      'Containerization, application deployment tools and server operating systems.',
    items: [
      { name: 'Docker', icon: 'docker' },
      { name: 'Coolify' },
      { name: 'Dokploy' },
      { name: 'Linux', icon: 'linux' },
    ],
  },
  {
    heading: 'Version control & CI',
    explanation:
      'Source version control and continuous-integration automation.',
    items: [
      { name: 'Git', icon: 'git' },
      { name: 'GitHub Actions', icon: 'githubactions' },
      { name: 'GitLab CI/CD' },
      { name: 'CircleCI' },
    ],
  },
  {
    heading: 'Testing & QA',
    explanation: 'Automated testing frameworks and browser test tooling.',
    items: [
      { name: 'Playwright', icon: 'playwright' },
      { name: 'Vitest' },
      { name: 'unittest' },
      { name: 'Jest' },
      { name: 'Pytest' },
      { name: 'Mocha' },
    ],
  },
];
