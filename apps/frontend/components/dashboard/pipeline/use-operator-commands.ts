'use client';

import type { Dispatch, FormEvent, SetStateAction } from 'react';
import { apiPost, getApi } from './api-client';
import { explainCommand } from './command-parser';
import { executeCraftCommand } from './craft-command-service';
import { workflows, type Platform } from './workflow-catalog';
import type { DashboardPane } from './dashboard-route';
import type { ChatMessage } from './run-models';
import type { WorkflowRecord } from './use-workflow-workspace';

type Options = {
  message: string;
  setMessage: Dispatch<SetStateAction<string>>;
  setConversation: Dispatch<SetStateAction<ChatMessage[]>>;
  chatNotice: (text: string) => void;
  platform: Platform;
  accountId: string | null;
  selectedCraftId: string | null;
  selectedPage: string;
  navigatePane: (next: DashboardPane) => void;
  navigateCraft: (id: string | null, slug?: string) => void;
  setCraftsRevision: Dispatch<SetStateAction<number>>;
  invalidateWorkflowSelection: () => void;
  setActiveWorkflow: Dispatch<SetStateAction<WorkflowRecord | null>>;
  setAction: Dispatch<SetStateAction<string>>;
  setForm: Dispatch<SetStateAction<Record<string, string>>>;
  setSelectedNode: Dispatch<SetStateAction<string>>;
};

export function useOperatorCommands({
  message,
  setMessage,
  setConversation,
  chatNotice,
  platform,
  accountId,
  selectedCraftId,
  selectedPage,
  navigatePane,
  navigateCraft,
  setCraftsRevision,
  invalidateWorkflowSelection,
  setActiveWorkflow,
  setAction,
  setForm,
  setSelectedNode,
}: Options) {
  async function handleCraftCommand(text: string) {
    try {
      const result = await executeCraftCommand(text, selectedCraftId);
      if (result.kind === 'list') {
        navigatePane('growth');
      } else {
        if (result.kind === 'updated') setCraftsRevision((value) => value + 1);
        navigateCraft(result.id, result.slug);
      }
      chatNotice(result.notice);
    } catch (error) {
      chatNotice(
        error instanceof Error ? error.message : 'Unable to edit craft'
      );
    }
  }
  function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!message.trim()) return;
    const request = message.trim();
    setMessage('');
    setConversation((prev) => [
      ...prev,
      { id: Date.now(), sender: 'user', text: request },
    ]);
    void apiPost('intelligence/chat', {
      text: request,
      platform,
      ...(accountId ? { accountId } : {}),
    }).catch((error) =>
      chatNotice(
        'This message was not stored in memory: ' +
          (error instanceof Error ? error.message : 'Storage unavailable')
      )
    );
    if (/^(?:\/?craft(?:\s|$)|crafts$)/i.test(request)) {
      void handleCraftCommand(request === 'crafts' ? '/craft help' : request);
      return;
    }
    const parsed = explainCommand(request);
    if (/^(what do you remember\??|show memory|memory)$/i.test(request)) {
      void fetch(getApi('intelligence'), { cache: 'no-store' })
        .then(async (response) => {
          if (!response.ok) throw Error('Memory unavailable');
          const entries = (await response.json()) as Array<{
            source: string;
            text: string;
          }>;
          const summary = entries
            .filter((item) => item.source === 'chat')
            .slice(0, 5)
            .map((item) => '• ' + item.text)
            .join('\n');
          chatNotice(summary || 'No chat-origin memory has been saved yet.');
        })
        .catch(() => chatNotice('Could not load local conversation memory.'));
      return;
    }
    if (/^(inspect this page|audit this page)$/i.test(request)) {
      invalidateWorkflowSelection();
      setActiveWorkflow(null);
      setAction('audit-page');
      navigatePane('pipeline');
      setSelectedNode('inspect');
      setConversation((prev) => [
        ...prev,
        {
          id: Date.now() + 1,
          sender: 'assistant',
          text:
            'Scoped read-only inspection staged for ' +
            selectedPage +
            '. Use Start Inspect selected page in the artboard to open the real page.',
        },
      ]);
      return;
    }
    let answer: string;
    if (!parsed) {
      answer =
        "No model is connected, so I will not guess. Use commands such as 'audit', 'set headline: …', 'add skill: …' or 'draft post: …'. You can also select a workflow from the left.";
    } else if (
      !workflows[platform].some((workflow) => workflow.id === parsed.action)
    ) {
      answer =
        'That operation is not supported on ' +
        (platform === 'x' ? 'X' : 'LinkedIn') +
        '. Choose another platform or supported workflow.';
    } else {
      invalidateWorkflowSelection();
      setActiveWorkflow(null);
      setAction(parsed.action);
      setForm(parsed.fields);
      navigatePane('pipeline');
      answer = parsed.note;
    }
    setConversation((prev) => [
      ...prev,
      { id: Date.now() + 1, sender: 'assistant', text: answer },
    ]);
  }

  return { handleCraftCommand, sendMessage };
}
