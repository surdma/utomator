'use client';

import {
  useRef,
  useState,
  type Dispatch,
  type FormEvent,
  type SetStateAction,
} from 'react';
import { apiPost, getApi } from './api-client';
import { workflows, type Platform } from './workflow-catalog';
import { executeCraftCommand } from './craft-command-service';
import type { DashboardPane } from './dashboard-route';
import type { ChatMessage } from './run-models';
import type { WorkflowRecord } from './use-workflow-workspace';
import type { ParsedCommand } from './command-parser';
import {
  decideUtterance,
  nextCommandState,
  pendingCommandLabel,
  type UtteranceSource,
} from './utterance';

type Options = {
  message: string;
  setMessage: Dispatch<SetStateAction<string>>;
  setConversation: Dispatch<SetStateAction<ChatMessage[]>>;
  chatNotice: (text: string) => void;
  onSpeak: (text: string) => void;
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
  onSpeak,
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
  const [pending, setPending] = useState<ParsedCommand | null>(null);
  const pendingRef = useRef<ParsedCommand | null>(null);
  function setPendingCommand(next: ParsedCommand | null) {
    pendingRef.current = next;
    setPending(next);
  }

  function reply(text: string) {
    chatNotice(text);
    try {
      onSpeak(text);
    } catch {
      /* Speech is optional. The written reply still stands. */
    }
  }

  function remember(text: string) {
    void apiPost('intelligence/chat', {
      text,
      platform,
      ...(accountId ? { accountId } : {}),
    }).catch((error) =>
      reply(
        'This message was not stored in memory: ' +
          (error instanceof Error ? error.message : 'Storage unavailable')
      )
    );
  }

  function stage(command: ParsedCommand) {
    invalidateWorkflowSelection();
    setActiveWorkflow(null);
    setAction(command.action);
    setForm(command.fields);
    navigatePane('workspace');
  }

  function unsupported() {
    return (
      'That operation is not supported on ' +
      (platform === 'x' ? 'X' : 'LinkedIn') +
      '. Choose another platform or supported workflow.'
    );
  }

  function supported(action: string) {
    return workflows[platform].some((workflow) => workflow.id === action);
  }

  function apply(decision: ReturnType<typeof decideUtterance>) {
    if (
      (decision.kind === 'stage-now' || decision.kind === 'needs-confirm') &&
      !supported(decision.command.action)
    ) {
      setPendingCommand(null);
      reply(unsupported());
      return;
    }
    const next = nextCommandState(pendingRef.current, decision);
    if (next.stage && !supported(next.stage.action)) {
      setPendingCommand(null);
      reply(unsupported());
      return;
    }
    setPendingCommand(next.pending);
    if (next.stage) stage(next.stage);
    if (next.reply) reply(next.reply);
  }

  async function handleCraftCommand(text: string) {
    try {
      const result = await executeCraftCommand(text, selectedCraftId);
      if (result.kind === 'list') {
        navigatePane('growth');
      } else {
        if (result.kind === 'updated') setCraftsRevision((value) => value + 1);
        navigateCraft(result.id, result.slug);
      }
      reply(result.notice);
    } catch (error) {
      reply(error instanceof Error ? error.message : 'Unable to edit craft');
    }
  }

  function submitUtterance(text: string, source: UtteranceSource) {
    const request = text.trim();
    if (!request) return;
    if (source === 'text') setMessage('');
    setConversation((previous) => [
      ...previous,
      { id: Date.now() + Math.random(), sender: 'user', text: request },
    ]);
    remember(request);
    const decision = decideUtterance(
      request,
      source,
      pendingRef.current !== null
    );
    if (decision.kind === 'craft') {
      void handleCraftCommand(request === 'crafts' ? '/craft help' : request);
      return;
    }
    if (decision.kind === 'memory') {
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
          reply(summary || 'No chat-origin memory has been saved yet.');
        })
        .catch(() => reply('Could not load local conversation memory.'));
      return;
    }
    if (decision.kind === 'inspect-page') {
      invalidateWorkflowSelection();
      setActiveWorkflow(null);
      setAction('audit-page');
      navigatePane('workspace');
      setSelectedNode('inspect');
      reply(
        'Scoped read-only inspection staged for ' +
          selectedPage +
          '. Use Start Inspect selected page in the artboard to open the real page.'
      );
      return;
    }
    apply(decision);
  }

  function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    submitUtterance(message, 'text');
  }

  function confirmPending() {
    apply(decideUtterance('stage this', 'text', pendingRef.current !== null));
  }

  return {
    handleCraftCommand,
    sendMessage,
    submitUtterance,
    confirmPending,
    pendingLabel: pending ? pendingCommandLabel(pending) : null,
  };
}
