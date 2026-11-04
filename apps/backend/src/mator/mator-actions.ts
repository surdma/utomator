// Backward-compatible barrel: re-exports the parser and store layers.
//
// Parser layer: mator-action-parser.ts  (types + parse functions)
// Store layer:  mator-action-store.ts   (stage/apply/restore + registry adapter)

export {
  assertActionAgainstPlan,
  type MatorAction,
  type MatorActionPorts,
  type MatorClarifyChoice,
  type MatorClarifyQuestion,
  type MatorCraftPort,
  type MatorImageMarker,
  type MatorRunnerPort,
  type MatorWorkflowPort,
  parseGeneratedMatorAction,
  parseMatorAction,
  type TaggedWorkflowRecord,
} from './mator-action-parser.js';

export {
  type ApplyActionResult,
  applyAction,
  restoreConversationPipeline,
  stageAction,
  workflowRegistryPort,
} from './mator-action-store.js';

export { MatorActionValidationError } from './mator-utils.js';
