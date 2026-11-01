'use client';

import { useSyncExternalStore } from 'react';

const STORAGE_KEY = 'mator.voiceOnly';
const CHANGE_EVENT = 'mator-voice-only-change';

function readVoiceOnly(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function subscribeVoiceOnly(onChange: () => void) {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

export function setVoiceOnlyPreference(voiceOnly: boolean) {
  try {
    window.localStorage.setItem(STORAGE_KEY, voiceOnly ? '1' : '0');
  } catch {
    // Keep the interface usable when the browser blocks local storage.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function useVoiceOnlyPreference(): boolean {
  return useSyncExternalStore(subscribeVoiceOnly, readVoiceOnly, () => false);
}
