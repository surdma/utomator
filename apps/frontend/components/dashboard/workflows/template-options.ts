import {
  type GrowthPillar,
  type GrowthPriority,
  growthCapabilities,
} from '../growth/linkedin-growth-capabilities';

export type GrowthTemplateSummary = {
  id: string;
  title: string;
  objective: string;
  platform: 'linkedin';
  pipelineCount: number;
  coverageCount: number;
  executable: boolean;
};

export type GrowthOption = GrowthTemplateSummary & {
  category: GrowthPillar | 'methodology';
  priority: GrowthPriority | 'Method';
  summary: string;
};

export const growthTemplateCategories = [
  'All',
  'research',
  'execution',
  'measurement',
  'methodology',
] as const;
export type GrowthTemplateCategory = (typeof growthTemplateCategories)[number];

/** Only validated YAML returned by the Growth engine is a selectable template. */
export function buildTemplateOptions(
  growthTemplates: GrowthTemplateSummary[],
): GrowthOption[] {
  const lookup = new Map<string, (typeof growthCapabilities)[number]>(
    growthCapabilities.map((item) => [`linkedin-${item.id}`, item] as const),
  );
  return growthTemplates.map((template) => {
    const capability = lookup.get(template.id);
    return {
      ...template,
      category: capability?.pillar ?? 'methodology',
      priority: capability?.priority ?? 'Method',
      summary: capability?.summary ?? template.objective,
    };
  });
}
