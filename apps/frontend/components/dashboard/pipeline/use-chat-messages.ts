'use client';

import { useState } from 'react';
import type { ChatMessage } from './run-models';

export function useChatMessages() {
  const [message, setMessage] = useState('');
  const [conversation, setConversation] = useState<ChatMessage[]>([
    {
      id: 1,
      sender: 'assistant',
      text: 'Your automation pipeline is ready. Choose a workflow, or type a structured command. I can stage approved actions and explain the run, but no AI model is connected.',
    },
  ]);

  function chatNotice(text: string) {
    setConversation((previous) => [
      ...previous,
      { id: Date.now() + Math.random(), sender: 'assistant', text },
    ]);
  }

  return { message, setMessage, conversation, setConversation, chatNotice };
}
