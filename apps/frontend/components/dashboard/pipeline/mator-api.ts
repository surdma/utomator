import { getApi } from './api-client.ts';
import type {
  MatorChatEvent,
  MatorConversationSummary,
} from './mator-chat-state.ts';

export type MatorSettingsMasked = {
  groqKeyConfigured: boolean;
  autoApprove: boolean;
  squashPipelineHistory: boolean;
  howTtsEnabled: boolean;
  modelId: string;
};

export type MatorSettingsSavePatch = {
  groqApiKey?: string | null;
  autoApprove?: boolean;
  squashPipelineHistory?: boolean;
  howTtsEnabled?: boolean;
  modelId?: string;
};

export type MatorConversationList = {
  currentId: string | null;
  items: MatorConversationSummary[];
};

export function matorSettingsUrl() {
  return getApi('mator/settings');
}

function matorPath(path: string) {
  return getApi(`mator/${path}`);
}

async function readJson<T>(
  response: Response,
  fallbackError: string,
): Promise<T> {
  const body = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(body.error || fallbackError);
  }
  return body;
}

async function readSettingsResponse(
  response: Response,
  fallbackError: string,
): Promise<MatorSettingsMasked> {
  return readJson<MatorSettingsMasked>(response, fallbackError);
}

export async function fetchMatorSettings(): Promise<MatorSettingsMasked> {
  const response = await fetch(matorSettingsUrl(), { cache: 'no-store' });
  return readSettingsResponse(response, 'Unable to load Mator settings');
}

export async function saveMatorSettings(
  patch: MatorSettingsSavePatch,
): Promise<MatorSettingsMasked> {
  const response = await fetch(matorSettingsUrl(), {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(patch),
  });
  return readSettingsResponse(response, 'Unable to save Mator settings');
}

export async function listMatorConversations(
  workflowId: string,
): Promise<MatorConversationList> {
  const response = await fetch(
    matorPath(`workflows/${encodeURIComponent(workflowId)}/conversations`),
    { cache: 'no-store' },
  );
  return readJson(response, 'Unable to load conversations');
}

export async function createMatorConversation(
  workflowId: string,
  title?: string,
): Promise<MatorConversationSummary> {
  const response = await fetch(
    matorPath(`workflows/${encodeURIComponent(workflowId)}/conversations`),
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(title ? { title } : {}),
    },
  );
  return readJson(response, 'Unable to create conversation');
}

export async function switchMatorConversation(
  workflowId: string,
  conversationId: string,
): Promise<{ currentId: string }> {
  const response = await fetch(
    matorPath(`workflows/${encodeURIComponent(workflowId)}/current`),
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ conversationId }),
    },
  );
  return readJson(response, 'Unable to switch conversation');
}

export async function fetchMatorEvents(
  conversationId: string,
): Promise<MatorChatEvent[]> {
  const response = await fetch(
    matorPath(`conversations/${encodeURIComponent(conversationId)}/events`),
    { cache: 'no-store' },
  );
  return readJson(response, 'Unable to load conversation events');
}

export async function postMatorMessage(
  conversationId: string,
  body: { text?: string; attachmentIds?: string[] },
  idempotencyKey: string,
): Promise<{ events: MatorChatEvent[] }> {
  const response = await fetch(
    matorPath(`conversations/${encodeURIComponent(conversationId)}/messages`),
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify(body),
    },
  );
  return readJson(response, 'Unable to send message');
}

export async function confirmMatorStage(
  conversationId: string,
  eventId: string,
): Promise<{ event: MatorChatEvent }> {
  const response = await fetch(
    matorPath(
      `conversations/${encodeURIComponent(conversationId)}/stage/${encodeURIComponent(eventId)}/confirm`,
    ),
    { method: 'POST' },
  );
  return readJson(response, 'Unable to confirm staged action');
}

export async function rejectMatorStage(
  conversationId: string,
  eventId: string,
): Promise<{ event: MatorChatEvent }> {
  const response = await fetch(
    matorPath(
      `conversations/${encodeURIComponent(conversationId)}/stage/${encodeURIComponent(eventId)}/reject`,
    ),
    { method: 'POST' },
  );
  return readJson(response, 'Unable to reject staged action');
}

export async function restoreMatorPipeline(
  conversationId: string,
  confirmDirty = false,
): Promise<{ record: unknown }> {
  const response = await fetch(
    matorPath(
      `conversations/${encodeURIComponent(conversationId)}/restore-pipeline`,
    ),
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ confirmDirty }),
    },
  );
  return readJson(response, 'Unable to restore pipeline');
}
