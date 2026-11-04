import type { Action, Platform, RunRequest, RunSummary } from '../core/types.js';
import type { StepKind, WorkflowPlan, WorkflowStep } from '../workflows/workflow-plan.js';
import { STEP_ID_PATTERN, STEP_KINDS } from '../workflows/workflow-plan.js';
import type { WorkflowRecord } from '../workflows/workflow-registry.js';
import { MATOR_REVIEW_ID_PATTERN } from './mator-attachments.js';
import { isPlainObject, MatorActionValidationError, requireString } from './mator-utils.js';

export type MatorImageMarker = { id: string; x: number; y: number; text: string };

export type MatorAction =
  | {
      type: 'edit_step';
      stepId: string;
      patch: Partial<
        Pick<WorkflowStep, 'title' | 'message' | 'delayMs' | 'expectedText' | 'kind' | 'position'>
      >;
    }
  | { type: 'add_step'; step: WorkflowStep; afterStepId?: string }
  | { type: 'remove_step'; stepId: string }
  | { type: 'run_step'; stepId?: string; request: RunRequest }
  | { type: 'craft'; command: string; craftId?: string }
  | {
      type: 'annotate_image';
      attachmentId: string;
      markers: MatorImageMarker[];
      reviewId?: string;
    }
  | { type: 'explain_how'; text: string }
  | { type: 'noop'; reason?: string }
  | { type: 'clarify'; prompt?: string; questions: MatorClarifyQuestion[] };

export type MatorClarifyChoice = {
  value: string;
  label: string;
  description?: string;
};

export type MatorClarifyQuestion = {
  name: string;
  prompt: string;
  description?: string;
  required: boolean;
  multiple: boolean;
  choices: MatorClarifyChoice[];
  freeform?: { label: string; placeholder?: string };
  inputType?: 'text' | 'url' | 'file';
};

export type TaggedWorkflowRecord = WorkflowRecord & {
  conversationId?: string;
  eventId?: string;
};

export type MatorWorkflowPort = {
  get(workflowId: string): Promise<TaggedWorkflowRecord | null>;
  getRevision(workflowId: string, revision: number): Promise<TaggedWorkflowRecord | null>;
  update(
    workflowId: string,
    expectedRevision: number,
    plan: WorkflowPlan,
    tags?: { conversationId: string; eventId: string },
  ): Promise<TaggedWorkflowRecord>;
};

export type MatorRunnerPort = {
  start(request: RunRequest): RunSummary | Promise<RunSummary>;
};

export type MatorCraftPort = {
  apply(action: Extract<MatorAction, { type: 'craft' }>): Promise<unknown> | unknown;
};

export type MatorActionPorts = {
  workflows: MatorWorkflowPort;
  runner: MatorRunnerPort;
  crafts?: MatorCraftPort;
};

const ACTION_TYPES = new Set<MatorAction['type']>([
  'edit_step',
  'add_step',
  'remove_step',
  'run_step',
  'craft',
  'annotate_image',
  'explain_how',
  'noop',
  'clarify',
]);

const revisionIdFor = (workflowId: string, revision: number) => `${workflowId}:${revision}`;

export { revisionIdFor };

export function parseRevisionId(boundRevisionId: string): { workflowId: string; revision: number } {
  const split = boundRevisionId.lastIndexOf(':');
  if (split <= 0) throw new MatorActionValidationError('Invalid boundRevisionId', 'boundRevisionId');
  const workflowId = boundRevisionId.slice(0, split);
  const revision = Number.parseInt(boundRevisionId.slice(split + 1), 10);
  if (!workflowId || !Number.isSafeInteger(revision) || revision < 1)
    throw new MatorActionValidationError('Invalid boundRevisionId', 'boundRevisionId');
  return { workflowId, revision };
}

function parseStep(raw: unknown): WorkflowStep {
  if (!isPlainObject(raw)) throw new MatorActionValidationError('Invalid step', 'step');
  const id = requireString(raw.id, 'step.id');
  if (!STEP_ID_PATTERN.test(id)) throw new MatorActionValidationError('Invalid step.id', 'step.id');
  const kind = requireString(raw.kind, 'step.kind') as StepKind;
  if (!STEP_KINDS.has(kind)) throw new MatorActionValidationError('Invalid step.kind', 'step.kind');
  const title = requireString(raw.title, 'step.title');
  const step: WorkflowStep = { id, kind, title };
  if (raw.message !== undefined) {
    if (typeof raw.message !== 'string')
      throw new MatorActionValidationError('Invalid step.message', 'step.message');
    step.message = raw.message;
  }
  if (raw.delayMs !== undefined) {
    if (!Number.isInteger(raw.delayMs))
      throw new MatorActionValidationError('Invalid step.delayMs', 'step.delayMs');
    step.delayMs = raw.delayMs as number;
  }
  if (raw.expectedText !== undefined) {
    if (typeof raw.expectedText !== 'string')
      throw new MatorActionValidationError('Invalid step.expectedText', 'step.expectedText');
    step.expectedText = raw.expectedText;
  }
  if (raw.position !== undefined) {
    if (
      !isPlainObject(raw.position) ||
      typeof raw.position.x !== 'number' ||
      typeof raw.position.y !== 'number'
    )
      throw new MatorActionValidationError('Invalid step.position', 'step.position');
    step.position = { x: raw.position.x, y: raw.position.y };
  }
  return step;
}

function parseRunRequest(raw: unknown): RunRequest {
  if (!isPlainObject(raw)) throw new MatorActionValidationError('Invalid run request', 'request');
  const platform = requireString(raw.platform, 'request.platform') as Platform;
  const action = requireString(raw.action, 'request.action') as Action;
  const profileUrl = requireString(raw.profileUrl, 'request.profileUrl');
  const request: RunRequest = { platform, action, profileUrl };
  if (raw.workflowId !== undefined)
    request.workflowId = requireString(raw.workflowId, 'request.workflowId');
  if (raw.workflowRevision !== undefined) {
    if (!Number.isSafeInteger(raw.workflowRevision) || (raw.workflowRevision as number) < 1)
      throw new MatorActionValidationError(
        'Invalid request.workflowRevision',
        'request.workflowRevision',
      );
    request.workflowRevision = raw.workflowRevision as number;
  }
  if (raw.accountId !== undefined) request.accountId = requireString(raw.accountId, 'request.accountId');
  if (raw.pageUrl !== undefined) request.pageUrl = requireString(raw.pageUrl, 'request.pageUrl');
  return request;
}

function parseMarkers(raw: unknown): MatorImageMarker[] {
  if (!Array.isArray(raw)) throw new MatorActionValidationError('Invalid markers', 'markers');
  return raw.map((item, index) => {
    if (!isPlainObject(item))
      throw new MatorActionValidationError(`Invalid markers[${index}]`, `markers[${index}]`);
    const id = requireString(item.id, `markers[${index}].id`);
    if (typeof item.x !== 'number' || typeof item.y !== 'number')
      throw new MatorActionValidationError(`Invalid markers[${index}] coordinates`, `markers[${index}]`);
    if (typeof item.text !== 'string')
      throw new MatorActionValidationError(`Invalid markers[${index}].text`, `markers[${index}]`);
    return { id, x: item.x, y: item.y, text: item.text };
  });
}

export function parseMatorAction(raw: unknown): MatorAction {
  if (!isPlainObject(raw)) throw new MatorActionValidationError('Action must be an object');
  const type = raw.type;
  if (typeof type !== 'string' || !ACTION_TYPES.has(type as MatorAction['type']))
    throw new MatorActionValidationError(`Unknown action type: ${String(type)}`, 'type');

  switch (type as MatorAction['type']) {
    case 'edit_step': {
      const stepId = requireString(raw.stepId, 'stepId');
      if (!STEP_ID_PATTERN.test(stepId))
        throw new MatorActionValidationError('Invalid stepId', 'stepId');
      if (!isPlainObject(raw.patch)) throw new MatorActionValidationError('Invalid patch', 'patch');
      const patch: Extract<MatorAction, { type: 'edit_step' }>['patch'] = {};
      if (raw.patch.title !== undefined) {
        if (typeof raw.patch.title !== 'string' || !raw.patch.title.trim())
          throw new MatorActionValidationError('Invalid patch.title', 'patch.title');
        patch.title = raw.patch.title;
      }
      if (raw.patch.message !== undefined) {
        if (typeof raw.patch.message !== 'string')
          throw new MatorActionValidationError('Invalid patch.message', 'patch.message');
        patch.message = raw.patch.message;
      }
      if (raw.patch.delayMs !== undefined) {
        if (!Number.isInteger(raw.patch.delayMs))
          throw new MatorActionValidationError('Invalid patch.delayMs', 'patch.delayMs');
        patch.delayMs = raw.patch.delayMs as number;
      }
      if (raw.patch.expectedText !== undefined) {
        if (typeof raw.patch.expectedText !== 'string')
          throw new MatorActionValidationError('Invalid patch.expectedText', 'patch.expectedText');
        patch.expectedText = raw.patch.expectedText;
      }
      if (raw.patch.kind !== undefined) {
        if (typeof raw.patch.kind !== 'string' || !STEP_KINDS.has(raw.patch.kind as StepKind))
          throw new MatorActionValidationError('Invalid patch.kind', 'patch.kind');
        patch.kind = raw.patch.kind as StepKind;
      }
      if (raw.patch.position !== undefined) {
        if (
          !isPlainObject(raw.patch.position) ||
          typeof raw.patch.position.x !== 'number' ||
          typeof raw.patch.position.y !== 'number'
        )
          throw new MatorActionValidationError('Invalid patch.position', 'patch.position');
        patch.position = { x: raw.patch.position.x, y: raw.patch.position.y };
      }
      if (Object.keys(patch).length === 0)
        throw new MatorActionValidationError('edit_step patch is empty', 'patch');
      return { type: 'edit_step', stepId, patch };
    }
    case 'add_step': {
      const step = parseStep(raw.step);
      const action: Extract<MatorAction, { type: 'add_step' }> = { type: 'add_step', step };
      if (raw.afterStepId !== undefined) {
        const afterStepId = requireString(raw.afterStepId, 'afterStepId');
        if (!STEP_ID_PATTERN.test(afterStepId))
          throw new MatorActionValidationError('Invalid afterStepId', 'afterStepId');
        action.afterStepId = afterStepId;
      }
      return action;
    }
    case 'remove_step': {
      const stepId = requireString(raw.stepId, 'stepId');
      if (!STEP_ID_PATTERN.test(stepId))
        throw new MatorActionValidationError('Invalid stepId', 'stepId');
      return { type: 'remove_step', stepId };
    }
    case 'run_step': {
      const request = parseRunRequest(raw.request);
      const action: Extract<MatorAction, { type: 'run_step' }> = { type: 'run_step', request };
      if (raw.stepId !== undefined) {
        const stepId = requireString(raw.stepId, 'stepId');
        if (!STEP_ID_PATTERN.test(stepId))
          throw new MatorActionValidationError('Invalid stepId', 'stepId');
        action.stepId = stepId;
      }
      return action;
    }
    case 'craft': {
      const command = requireString(raw.command, 'command');
      const action: Extract<MatorAction, { type: 'craft' }> = { type: 'craft', command };
      if (raw.craftId !== undefined) action.craftId = requireString(raw.craftId, 'craftId');
      return action;
    }
    case 'annotate_image': {
      const action: Extract<MatorAction, { type: 'annotate_image' }> = {
        type: 'annotate_image',
        attachmentId: requireString(raw.attachmentId, 'attachmentId'),
        markers: parseMarkers(raw.markers),
      };
      if (raw.reviewId !== undefined) {
        if (typeof raw.reviewId !== 'string' || !MATOR_REVIEW_ID_PATTERN.test(raw.reviewId))
          throw new MatorActionValidationError('Invalid action.reviewId', 'action.reviewId');
        action.reviewId = raw.reviewId;
      }
      return action;
    }
    case 'explain_how':
      return { type: 'explain_how', text: requireString(raw.text, 'text') };
    case 'noop': {
      const action: Extract<MatorAction, { type: 'noop' }> = { type: 'noop' };
      if (raw.reason !== undefined) {
        if (typeof raw.reason !== 'string')
          throw new MatorActionValidationError('Invalid reason', 'reason');
        action.reason = raw.reason;
      }
      return action;
    }
    case 'clarify':
      return parseClarifyAction(raw);
  }
}

/**
 * Groq may return more choices than the compact questionnaire accepts.
 * Retain strict validation for stored/client actions, but recover generated
 * oversized questions as free-text prompts rather than showing an internal
 * schema error to the user. Other validation failures stay failures.
 */
export function parseGeneratedMatorAction(raw: unknown): MatorAction {
  try {
    return parseMatorAction(raw);
  } catch (error) {
    if (
      !(error instanceof MatorActionValidationError) ||
      !/^Too many choices on questions\[\d+\]$/.test(error.message) ||
      !isPlainObject(raw) ||
      raw.type !== 'clarify' ||
      !Array.isArray(raw.questions)
    ) {
      throw error;
    }
    const questions = raw.questions.map((question) => {
      if (!isPlainObject(question) || !Array.isArray(question.choices) || question.choices.length <= 6)
        return question;
      if (question.inputType !== undefined && question.inputType !== 'text') return question;
      return {
        ...question,
        choices: [],
        freeform: question.freeform ?? {
          label: 'Your answer',
          placeholder: 'Describe your preference',
        },
      };
    });
    return parseMatorAction({ ...raw, questions });
  }
}

function parseClarifyAction(raw: Record<string, unknown>): Extract<MatorAction, { type: 'clarify' }> {
  if (!Array.isArray(raw.questions) || raw.questions.length < 1 || raw.questions.length > 4)
    throw new MatorActionValidationError('clarify needs 1 to 4 questions', 'questions');
  const questions = raw.questions.map((item, index) => {
    if (!isPlainObject(item))
      throw new MatorActionValidationError(`Invalid questions[${index}]`, `questions[${index}]`);
    const name = requireString(item.name, `questions[${index}].name`);
    if (!STEP_ID_PATTERN.test(name))
      throw new MatorActionValidationError(
        `Invalid questions[${index}].name`,
        `questions[${index}].name`,
      );
    const prompt = requireString(item.prompt, `questions[${index}].prompt`);
    const choices = Array.isArray(item.choices) ? item.choices : [];
    if (choices.length > 6)
      throw new MatorActionValidationError(
        `Too many choices on questions[${index}]`,
        `questions[${index}].choices`,
      );
    const parsedChoices = choices.map((choice, choiceIndex) => {
      if (!isPlainObject(choice))
        throw new MatorActionValidationError(
          `Invalid questions[${index}].choices[${choiceIndex}]`,
          `questions[${index}].choices`,
        );
      const value = requireString(choice.value, `questions[${index}].choices[${choiceIndex}].value`);
      const label = requireString(choice.label, `questions[${index}].choices[${choiceIndex}].label`);
      const parsed: MatorClarifyChoice = { value, label };
      if (choice.description !== undefined)
        parsed.description = requireString(
          choice.description,
          `questions[${index}].choices[${choiceIndex}].description`,
        );
      return parsed;
    });
    let freeform: MatorClarifyQuestion['freeform'];
    if (item.freeform !== undefined) {
      if (!isPlainObject(item.freeform))
        throw new MatorActionValidationError(
          `Invalid questions[${index}].freeform`,
          `questions[${index}].freeform`,
        );
      freeform = { label: requireString(item.freeform.label, `questions[${index}].freeform.label`) };
      if (item.freeform.placeholder !== undefined)
        freeform.placeholder = requireString(
          item.freeform.placeholder,
          `questions[${index}].freeform.placeholder`,
        );
    }
    const inputType = item.inputType ?? 'text';
    if (inputType !== 'text' && inputType !== 'url' && inputType !== 'file')
      throw new MatorActionValidationError(
        `Invalid questions[${index}].inputType`,
        `questions[${index}].inputType`,
      );
    if (inputType !== 'text' && parsedChoices.length > 0)
      throw new MatorActionValidationError(
        `File and URL questions cannot have multiple-choice answers`,
        `questions[${index}]`,
      );
    if (parsedChoices.length === 0 && !freeform && inputType === 'text')
      throw new MatorActionValidationError(
        `questions[${index}] needs choices or a freeform answer`,
        `questions[${index}]`,
      );
    if (parsedChoices.length === 1)
      throw new MatorActionValidationError(
        `questions[${index}] needs at least 2 choices`,
        `questions[${index}].choices`,
      );
    const question: MatorClarifyQuestion = {
      name,
      prompt,
      required: item.required === true,
      multiple: item.multiple === true,
      choices: parsedChoices,
      inputType: inputType as 'text' | 'url' | 'file',
    };
    if (item.description !== undefined)
      question.description = requireString(item.description, `questions[${index}].description`);
    if (freeform) question.freeform = freeform;
    return question;
  });
  const action: Extract<MatorAction, { type: 'clarify' }> = { type: 'clarify', questions };
  if (raw.prompt !== undefined) action.prompt = requireString(raw.prompt, 'prompt');
  return action;
}

function findStep(plan: WorkflowPlan, stepId: string): WorkflowStep | undefined {
  return plan.steps.find((step) => step.id === stepId);
}

function assertKnownStepId(plan: WorkflowPlan, stepId: string, field = 'stepId'): void {
  if (!findStep(plan, stepId)) throw new MatorActionValidationError(`Unknown step id: ${stepId}`, field);
}

export function assertActionAgainstPlan(action: MatorAction, plan: WorkflowPlan): void {
  switch (action.type) {
    case 'edit_step':
    case 'remove_step':
      assertKnownStepId(plan, action.stepId);
      return;
    case 'add_step':
      if (findStep(plan, action.step.id))
        throw new MatorActionValidationError(`Step id already exists: ${action.step.id}`, 'step.id');
      if (action.afterStepId) assertKnownStepId(plan, action.afterStepId, 'afterStepId');
      return;
    case 'run_step':
      if (action.stepId) assertKnownStepId(plan, action.stepId);
      return;
    default:
      return;
  }
}
