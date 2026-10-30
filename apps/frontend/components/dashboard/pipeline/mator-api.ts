import { getApi } from './api-client.ts';

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

export function matorSettingsUrl() {
  return getApi('mator/settings');
}

async function readSettingsResponse(
  response: Response,
  fallbackError: string,
): Promise<MatorSettingsMasked> {
  const body = (await response.json()) as MatorSettingsMasked & {
    error?: string;
  };
  if (!response.ok) {
    throw new Error(body.error || fallbackError);
  }
  return body;
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
