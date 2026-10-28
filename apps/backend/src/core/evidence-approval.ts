import { createHash } from 'node:crypto';

export type EvidenceSourceSchema = 'page-observation/v1' | 'owner-evidence/v1';
export interface EvidenceRecord {
  schema: 'evidence/v1';
  sourceStepId: string;
  sourceSchema: EvidenceSourceSchema;
  url: string;
  digest: string;
}
export interface ApprovalDecision {
  schema: 'approval/v1';
  approved: boolean;
  evidenceStepId: string;
  evidenceDigest: string;
}
const stepIdPattern = /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/;
const sha256Pattern = /^[a-f0-9]{64}$/;

/** A provenance reference, not a claim that the external profile is correct. */
export function evidenceRecord(sourceStepId: string, sourceSchema: EvidenceSourceSchema,
  url: string, content: string): EvidenceRecord {
  if (!stepIdPattern.test(sourceStepId) ||
    !['page-observation/v1','owner-evidence/v1'].includes(sourceSchema) ||
    typeof url !== 'string' || url.length > 500 ||
    !URL.canParse(url) || new URL(url).protocol !== 'https:' ||
    typeof content !== 'string' || !content.trim() || content.length > 30000)
    throw Error('Evidence requires a bounded, sourced HTTPS observation');
  return { schema:'evidence/v1',sourceStepId,sourceSchema,url,
    digest:createHash('sha256').update(JSON.stringify([sourceStepId,sourceSchema,url,content])).digest('hex') };
}
export function isEvidenceRecord(raw: unknown): raw is EvidenceRecord {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
  const value=raw as Partial<EvidenceRecord>;
  return value.schema === 'evidence/v1' && typeof value.sourceStepId === 'string' &&
    stepIdPattern.test(value.sourceStepId) &&
    (value.sourceSchema === 'page-observation/v1' || value.sourceSchema === 'owner-evidence/v1') &&
    typeof value.url === 'string' && value.url.length <= 500 &&
    URL.canParse(value.url) && new URL(value.url).protocol === 'https:' &&
    typeof value.digest === 'string' && sha256Pattern.test(value.digest);
}
/** An approval is pinned to evidence; it never grants general provider mutation rights. */
export function approvalDecision(evidence: EvidenceRecord, approved: boolean): ApprovalDecision {
  if (!isEvidenceRecord(evidence) || typeof approved !== 'boolean')
    throw Error('Approval requires validated evidence and a boolean decision');
  return {schema:'approval/v1',approved,
    evidenceStepId:evidence.sourceStepId,evidenceDigest:evidence.digest};
}
export function isApprovalDecision(raw: unknown): raw is ApprovalDecision {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
  const value=raw as Partial<ApprovalDecision>;
  return value.schema === 'approval/v1' && typeof value.approved === 'boolean' &&
    typeof value.evidenceStepId === 'string' && stepIdPattern.test(value.evidenceStepId) &&
    typeof value.evidenceDigest === 'string' && sha256Pattern.test(value.evidenceDigest);
}
export function isApprovalFor(raw: unknown, evidence: EvidenceRecord): raw is ApprovalDecision {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || !isEvidenceRecord(evidence))return false;
  const value=raw as Partial<ApprovalDecision>;
  return value.schema === 'approval/v1' && value.approved === true &&
    value.evidenceStepId === evidence.sourceStepId &&
    value.evidenceDigest === evidence.digest;
}
