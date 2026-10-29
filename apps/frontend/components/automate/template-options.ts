import {
  templateCatalog,
  type CatalogTemplate,
  type TemplateCategory,
} from './template-catalog';
import { growthCapabilities } from './linkedin-growth-capabilities';

export type GrowthTemplateSummary = {
  id: string;
  title: string;
  objective: string;
  platform: 'linkedin';
  pipelineCount: number;
  coverageCount: number;
  executable: boolean;
};
export type GrowthOption = CatalogTemplate & {
  growthId?: string;
  methodCraftId?: string;
};
export type MethodCraft = {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: string;
  scope: 'default' | 'personal';
};

export function buildTemplateOptions(
  growthTemplates: GrowthTemplateSummary[],
  toolkits: MethodCraft[],
  growthSupported: boolean
): GrowthOption[] {
  return [
    ...templateCatalog,
    ...(growthSupported
      ? growthCapabilities.map((cap) => {
          const id = 'linkedin-' + cap.id;
          const available = growthTemplates.find(
            (template) => template.id === id && template.executable
          );
          return {
            id: 'growth-' + id,
            growthId: id,
            platform: 'linkedin' as const,
            category: 'Profile' as const,
            title: cap.title,
            description: available?.objective ?? cap.summary,
            capabilities: available
              ? [
                  available.pipelineCount + ' reviewed Runner pipelines',
                  available.coverageCount + ' owner-evidence targets',
                  'No unsupported provider edits or growth-outcome claims',
                ]
              : [...cap.actions],
            automation: available
              ? ('supported' as const)
              : ('planned' as const),
            schedule: 'manual' as const,
          };
        })
      : []),
    ...(growthSupported
      ? growthTemplates
          .filter(
            (template) =>
              !growthCapabilities.some(
                (cap) => 'linkedin-' + cap.id === template.id
              )
          )
          .map((template) => ({
            id: 'growth-' + template.id,
            growthId: template.id,
            platform: 'linkedin' as const,
            category: 'Profile' as const,
            title: template.title,
            description: template.objective,
            capabilities: [
              template.pipelineCount + ' pipelines',
              template.coverageCount + ' coverage requirements',
            ],
            automation: template.executable
              ? ('supported' as const)
              : ('planned' as const),
            schedule: 'manual' as const,
          }))
      : []),
    ...(growthSupported
      ? toolkits.map((item) => ({
          id: 'method-' + item.slug,
          methodCraftId: item.id,
          platform: 'linkedin' as const,
          category: (item.category === 'content'
            ? 'Publishing'
            : item.category === 'engagement'
              ? 'Engagement'
              : 'Profile') as TemplateCategory,
          title: item.name,
          description: item.description,
          capabilities: [
            'Existing MDX methodology',
            'Review in the Growth library',
            'Not an executable YAML pipeline',
          ],
          automation: 'planned' as const,
          schedule: 'manual' as const,
        }))
      : []),
  ];
}
