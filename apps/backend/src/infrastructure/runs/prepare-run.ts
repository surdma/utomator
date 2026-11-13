import { isOwnedBy, isTrustedOwnerId } from '../../domain/ownership.js';
import type { RunRequest } from '../../domain/types.js';
import { profileUrlForHandle } from '../../domain/validate.js';
import type { ConnectorService } from '../connect/service.js';
import type { AuthoredStepDefinition, StepDefinitionStore } from '../workflows/step-definitions.js';
import type { WorkflowRegistry } from '../workflows/workflow-registry.js';

export class RunPreparationError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
    this.name = 'RunPreparationError';
  }
}

export type RunPreparationStores = {
  connectors: Pick<ConnectorService, 'requireConnected'>;
  workflowRegistry: Pick<WorkflowRegistry, 'get'>;
  authoredSteps: Pick<StepDefinitionStore, 'resolve'>;
};

const parameterKeys = [
  'headline',
  'about',
  'skill',
  'bio',
  'location',
  'website',
  'postText',
  'postUrl',
  'positionId',
  'description',
  'startMonth',
  'startYear',
  'websiteIndex',
  'websiteType',
  'projectName',
  'projectUrl',
  'featuredTitle',
  'bannerPath',
] as const;

/** Both HTTP and Mator resolve a saved revision before entering the single Runner. */
export async function prepareRun(
  input: RunRequest & { handle?: string },
  ownerId: string,
  { connectors, workflowRegistry, authoredSteps }: RunPreparationStores,
): Promise<{ request: RunRequest; definitions?: ReadonlyMap<string, AuthoredStepDefinition> }> {
  if (!isTrustedOwnerId(ownerId)) throw new RunPreparationError('Owner authentication required', 401);
  const { handle, profileUrl, ...rest } = input;
  if (
    rest.platform === 'linkedin' &&
    (rest.workflowId !== undefined || rest.workflow !== undefined) &&
    !rest.accountId
  )
    throw new RunPreparationError(
      'Select, connect, and sync a LinkedIn account before running this workflow',
      400,
    );
  if (!rest.accountId && Boolean(handle) === Boolean(profileUrl))
    throw new RunPreparationError('Supply either your handle or a profile URL', 400);
  const resolved = rest.accountId
    ? (
        await connectors.requireConnected(
          rest.accountId,
          rest.platform,
          profileUrl || (handle ? profileUrlForHandle(rest.platform, handle) : undefined),
        )
      ).profileUrl
    : handle
      ? profileUrlForHandle(rest.platform, handle)
      : profileUrl;

  if (rest.workflowId !== undefined) {
    if (
      rest.workflow !== undefined ||
      !Number.isSafeInteger(rest.workflowRevision) ||
      (rest.workflowRevision ?? 0) < 1
    )
      throw new RunPreparationError(
        'Choose a saved workflow revision instead of submitting a second graph',
        400,
      );
    const record = await workflowRegistry.get(rest.workflowId, rest.workflowRevision);
    if (!record) throw new RunPreparationError('Workflow revision not found', 404);
    if (!isOwnedBy(record, ownerId))
      throw new RunPreparationError('Workflow not accessible to this owner', 403);
    if (record.plan.platform !== rest.platform || record.plan.action !== rest.action)
      throw new RunPreparationError('Workflow identity does not match the requested action', 400);

    // The selected account and page scope may vary, but saved action inputs cannot.
    const snapshot = record.plan.parameters ?? {};
    const resolvedFields: Record<string, string | number> = {};
    for (const key of parameterKeys) {
      const saved = snapshot[key];
      const supplied = rest[key];
      if (supplied !== undefined && (saved === undefined || String(supplied) !== saved))
        throw new RunPreparationError('Action inputs differ from the selected workflow revision', 409);
      if (saved !== undefined) resolvedFields[key] = key === 'websiteIndex' ? Number(saved) : saved;
    }
    return {
      request: {
        ...rest,
        ...resolvedFields,
        profileUrl: resolved,
        ownerId,
        workflow: record.plan,
        workflowId: record.id,
        workflowRevision: record.revision,
      },
      definitions: await authoredSteps.resolve(record.plan),
    };
  }
  if (rest.workflowRevision !== undefined)
    throw new RunPreparationError('Workflow ID required for revisioned execution', 400);
  return {
    request: { ...rest, profileUrl: resolved, ownerId },
    definitions: rest.workflow ? await authoredSteps.resolve(rest.workflow) : undefined,
  };
}
