import { getApi } from './api-client.ts';
import type {
  MatorChatEvent,
  MatorConversationSummary,
} from './mator-chat-state.ts';

export type MatorModelTier = 'free' | 'paid';

export type MatorModelOption = {
  id: string;
  name: string;
  label: string;
  tier: MatorModelTier;
  role: 'chat' | 'vision' | 'speech-to-text' | 'text-to-speech' | 'moderation';
  price: string;
  notes: string;
};

export type MatorSettingsMasked = {
  groqKeyConfigured: boolean;
  keySource: 'stored' | 'environment' | 'none';
  autoApprove: boolean;
  squashPipelineHistory: boolean;
  howTtsEnabled: boolean;
  moderationEnabled: boolean;
  modelId: string;
  modelName: string;
  modelLabel: string;
  modelTier: MatorModelTier;
  modelPrice: string;
  reasoningEffort: 'low' | 'medium' | 'high';
  visionModelId: string;
  sttModelId: string;
  ttsModelId: string;
  ttsVoice: string;
};

export type MatorSettingsSavePatch = {
  groqApiKey?: string | null;
  autoApprove?: boolean;
  squashPipelineHistory?: boolean;
  howTtsEnabled?: boolean;
  moderationEnabled?: boolean;
  modelId?: string;
  reasoningEffort?: 'low' | 'medium' | 'high';
  visionModelId?: string;
  sttModelId?: string;
  ttsModelId?: string;
  ttsVoice?: string;
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
  fallbackError: string
): Promise<T> {
  const body = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(body.error || fallbackError);
  }
  return body;
}

async function readSettingsResponse(
  response: Response,
  fallbackError: string
): Promise<MatorSettingsMasked> {
  return readJson<MatorSettingsMasked>(response, fallbackError);
}

export async function fetchMatorModels(): Promise<{
  models: MatorModelOption[];
  voices: Array<{ id: string; label: string; language: string }>;
}> {
  const response = await fetch(matorPath('models'), { cache: 'no-store' });
  return readJson(response, 'Unable to load Groq models');
}

export async function fetchMatorSettings(): Promise<MatorSettingsMasked> {
  const response = await fetch(matorSettingsUrl(), { cache: 'no-store' });
  return readSettingsResponse(response, 'Unable to load Mator settings');
}

export async function saveMatorSettings(
  patch: MatorSettingsSavePatch
): Promise<MatorSettingsMasked> {
  const response = await fetch(matorSettingsUrl(), {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(patch),
  });
  return readSettingsResponse(response, 'Unable to save Mator settings');
}

export async function listMatorConversations(
  workflowId: string
): Promise<MatorConversationList> {
  const response = await fetch(
    matorPath(`workflows/${encodeURIComponent(workflowId)}/conversations`),
    { cache: 'no-store' }
  );
  return readJson(response, 'Unable to load conversations');
}

export async function createMatorConversation(
  workflowId: string,
  title?: string
): Promise<MatorConversationSummary> {
  const response = await fetch(
    matorPath(`workflows/${encodeURIComponent(workflowId)}/conversations`),
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(title ? { title } : {}),
    }
  );
  return readJson(response, 'Unable to create conversation');
}

export async function switchMatorConversation(
  workflowId: string,
  conversationId: string
): Promise<{ currentId: string }> {
  const response = await fetch(
    matorPath(`workflows/${encodeURIComponent(workflowId)}/current`),
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ conversationId }),
    }
  );
  return readJson(response, 'Unable to switch conversation');
}

export async function fetchMatorEvents(
  conversationId: string
): Promise<MatorChatEvent[]> {
  const response = await fetch(
    matorPath(`conversations/${encodeURIComponent(conversationId)}/events`),
    { cache: 'no-store' }
  );
  return readJson(response, 'Unable to load conversation events');
}

export async function postMatorMessage(
  conversationId: string,
  body: { text?: string; attachmentIds?: string[] },
  idempotencyKey: string
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
    }
  );
  return readJson(response, 'Unable to send message');
}

export async function confirmMatorStage(
  conversationId: string,
  eventId: string
): Promise<{ event: MatorChatEvent }> {
  const response = await fetch(
    matorPath(
      `conversations/${encodeURIComponent(conversationId)}/stage/${encodeURIComponent(eventId)}/confirm`
    ),
    { method: 'POST' }
  );
  return readJson(response, 'Unable to confirm staged action');
}

export async function rejectMatorStage(
  conversationId: string,
  eventId: string
): Promise<{ event: MatorChatEvent }> {
  const response = await fetch(
    matorPath(
      `conversations/${encodeURIComponent(conversationId)}/stage/${encodeURIComponent(eventId)}/reject`
    ),
    { method: 'POST' }
  );
  return readJson(response, 'Unable to reject staged action');
}

export async function restoreMatorPipeline(
  conversationId: string,
  confirmDirty = false
): Promise<{ record: unknown }> {
  const response = await fetch(
    matorPath(
      `conversations/${encodeURIComponent(conversationId)}/restore-pipeline`
    ),
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ confirmDirty }),
    }
  );
  return readJson(response, 'Unable to restore pipeline');
}

export type MatorAttachmentUpload = {
  id: string;
  mime: string;
  size: number;
  kind: 'image' | 'video' | 'other';
};

export type MatorImageMarkerDto = {
  id: string;
  x: number;
  y: number;
  text: string;
};

export type MatorAttachmentMetaDto = {
  id: string;
  conversationId: string;
  filename: string;
  mime: string;
  size: number;
  kind: 'image' | 'video' | 'other';
  markers: MatorImageMarkerDto[];
  createdAt: string;
};

export function matorAttachmentFileUrl(attachmentId: string) {
  return matorPath(`attachments/${encodeURIComponent(attachmentId)}`);
}

function fileToBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('Unable to read attachment'));
        return;
      }
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(new Error('Unable to read attachment'));
    reader.readAsDataURL(file);
  });
}

export async function uploadMatorAttachment(
  conversationId: string,
  file: File
): Promise<MatorAttachmentUpload> {
  const data = await fileToBase64(file);
  const response = await fetch(
    matorPath(
      `conversations/${encodeURIComponent(conversationId)}/attachments`
    ),
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        filename: file.name,
        mime: file.type || 'application/octet-stream',
        data,
      }),
    }
  );
  return readJson(response, 'Unable to upload attachment');
}

export async function transcribeMatorAudio(file: Blob): Promise<string> {
  const data = await fileToBase64(file);
  const mime = file.type || 'audio/webm';
  const extensionByMime: Record<string, string> = {
    'audio/mp4': 'm4a',
    'audio/x-m4a': 'm4a',
    'audio/mpeg': 'mp3',
    'audio/ogg': 'ogg',
    'audio/wav': 'wav',
    'audio/webm': 'webm',
  };
  const extension = extensionByMime[mime.split(';')[0].toLowerCase()] ?? 'webm';
  const response = await fetch(matorPath('audio/transcriptions'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      data,
      mime,
      filename: `mator-speech.${extension}`,
    }),
  });
  const body = await readJson<{ text: string }>(
    response,
    'Unable to transcribe speech'
  );
  return body.text?.trim() ?? '';
}

export async function synthesizeMatorSpeech(text: string): Promise<Blob> {
  const response = await fetch(matorPath('audio/speech'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!response.ok) {
    let message = 'Unable to speak this reply';
    try {
      const body = (await response.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      /* binary or empty */
    }
    throw new Error(message);
  }
  return response.blob();
}

export async function patchMatorMarkers(
  attachmentId: string,
  markers: MatorImageMarkerDto[]
): Promise<MatorAttachmentMetaDto> {
  const response = await fetch(
    matorPath(`attachments/${encodeURIComponent(attachmentId)}/markers`),
    {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ markers }),
    }
  );
  return readJson(response, 'Unable to save markers');
}
