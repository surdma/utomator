'use client';

/**
 * @deprecated Prefer `useMatorChat` for server-backed conversations.
 * Kept as a thin local-seed wrapper for tests / offline fallbacks.
 */
import { useState } from 'react';
import type { ChatMessage } from './run-models';
import { seedConversation } from './mator-chat-state';

export function useChatMessages() {
  const [message, setMessage] = useState('');
  const [conversation, setConversation] = useState<ChatMessage[]>(
    seedConversation().map((item) => ({
      id: item.id,
      sender: item.sender,
      text: item.text,
    })),
  );

  function chatNotice(text: string) {
    setConversation((previous) => [
      ...previous,
      { id: `local-${Date.now()}`, sender: 'assistant', text },
    ]);
  }

  return { message, setMessage, conversation, setConversation, chatNotice };
}
