'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import {
  confirmMatorStage,
  createMatorConversation,
  fetchMatorEvents,
  fetchMatorSettings,
  listMatorConversations,
  postMatorMessage,
  rejectMatorStage,
  restoreMatorPipeline,
  saveMatorSettings,
  switchMatorConversation,
  type MatorSettingsMasked,
  type MatorSettingsSavePatch,
} from './mator-api.ts';
import {
  eventsToConversation,
  findIncompleteEvent,
  findPendingStage,
  mergeMatorEvents,
  pendingStageLabel,
  shouldSpeakHow,
  type MatorChatBubble,
  type MatorChatEvent,
  type MatorConversationSummary,
  type MatorSettingsToggles,
} from './mator-chat-state.ts';

function newIdempotencyKey() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `mator-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

type Options = {
  workflowId: string | null;
  onSpeakHow?: (text: string) => void;
};

export function useMatorChat({ workflowId, onSpeakHow }: Options) {
  const [message, setMessage] = useState('');
  const [conversations, setConversations] = useState<
    MatorConversationSummary[]
  >([]);
  const [conversationMeta, setConversationMeta] =
    useState<MatorConversationSummary | null>(null);
  const [events, setEvents] = useState<MatorChatEvent[]>([]);
  const [localNotices, setLocalNotices] = useState<MatorChatBubble[]>([]);
  const [settings, setSettings] = useState<MatorSettingsMasked | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const inFlightRef = useRef(false);
  const idempotencyKeyRef = useRef<string | null>(null);
  const howTtsRef = useRef(true);
  const onSpeakHowRef = useRef(onSpeakHow);
  const conversationIdRef = useRef<string | null>(null);
  const refreshEpoch = useRef(0);

  useEffect(() => {
    onSpeakHowRef.current = onSpeakHow;
  }, [onSpeakHow]);

  useEffect(() => {
    howTtsRef.current = settings?.howTtsEnabled ?? true;
  }, [settings?.howTtsEnabled]);

  useEffect(() => {
    conversationIdRef.current = conversationMeta?.id ?? null;
  }, [conversationMeta?.id]);

  const speakNewHow = useCallback((incoming: MatorChatEvent[]) => {
    if (!howTtsRef.current) return;
    for (const event of incoming) {
      if (shouldSpeakHow(event, true) && event.text) {
        try {
          onSpeakHowRef.current?.(event.text);
        } catch {
          /* Speech is optional. */
        }
      }
    }
  }, []);

  const refresh = useCallback(async () => {
    const epoch = ++refreshEpoch.current;
    if (!workflowId) {
      setConversations([]);
      setConversationMeta(null);
      setEvents([]);
      setLocalNotices([]);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [listed, masked] = await Promise.all([
        listMatorConversations(workflowId),
        fetchMatorSettings().catch(() => null),
      ]);
      if (epoch !== refreshEpoch.current) return;
      if (masked) setSettings(masked);

      let currentId = listed.currentId;
      let items = listed.items;
      if (!currentId) {
        const created = await createMatorConversation(workflowId);
        if (epoch !== refreshEpoch.current) return;
        currentId = created.id;
        items = [created, ...items.filter((item) => item.id !== created.id)];
      }
      setConversations(items);
      const meta = items.find((item) => item.id === currentId) ?? null;
      setConversationMeta(meta);
      const loaded = await fetchMatorEvents(currentId);
      if (epoch !== refreshEpoch.current) return;
      setEvents(loaded);
      setLocalNotices([]);
    } catch (err) {
      if (epoch !== refreshEpoch.current) return;
      setError(err instanceof Error ? err.message : 'Unable to load chat');
    } finally {
      if (epoch === refreshEpoch.current) setLoading(false);
    }
  }, [workflowId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const conversation = useMemo(
    () => eventsToConversation(events, localNotices),
    [events, localNotices],
  );

  const staged = useMemo(() => findPendingStage(events), [events]);
  const incomplete = useMemo(() => findIncompleteEvent(events), [events]);

  const settingsToggles: MatorSettingsToggles = {
    autoApprove: settings?.autoApprove ?? false,
    squashPipelineHistory: settings?.squashPipelineHistory ?? false,
    howTtsEnabled: settings?.howTtsEnabled ?? true,
  };

  const patchSettings = useCallback(async (patch: MatorSettingsSavePatch) => {
    const next = await saveMatorSettings(patch);
    setSettings(next);
    return next;
  }, []);

  const chatNotice = useCallback((text: string) => {
    setLocalNotices((previous) => [
      ...previous,
      {
        id: `local-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        sender: 'assistant',
        text,
      },
    ]);
  }, []);

  const setConversation = useCallback(
    (
      next:
        | MatorChatBubble[]
        | ((previous: MatorChatBubble[]) => MatorChatBubble[]),
    ) => {
      const resolved =
        typeof next === 'function'
          ? next(eventsToConversation(events, localNotices))
          : next;
      const eventIds = new Set(events.map((event) => event.id));
      setLocalNotices(
        resolved.filter(
          (bubble) =>
            bubble.sender === 'assistant' &&
            !eventIds.has(String(bubble.id)) &&
            bubble.id !== 'seed',
        ),
      );
    },
    [events, localNotices],
  );

  const send = useCallback(
    async (text?: string) => {
      const request = (text ?? message).trim();
      if (!request) return;
      if (inFlightRef.current) return;
      const conversationId = conversationIdRef.current;
      if (!conversationId) {
        setError('Select or create a workflow conversation first');
        return;
      }

      const key = idempotencyKeyRef.current ?? newIdempotencyKey();
      idempotencyKeyRef.current = key;
      inFlightRef.current = true;
      setPending(true);
      setError(null);
      if (text === undefined) setMessage('');

      try {
        const result = await postMatorMessage(
          conversationId,
          { text: request },
          key,
        );
        setEvents((previous) => mergeMatorEvents(previous, result.events));
        speakNewHow(result.events);
        idempotencyKeyRef.current = null;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to send message');
      } finally {
        inFlightRef.current = false;
        setPending(false);
      }
    },
    [message, speakNewHow],
  );

  const sendMessage = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      void send();
    },
    [send],
  );

  const incompleteContinue = useCallback(async () => {
    if (!incomplete) return;
    await send('Continue');
  }, [incomplete, send]);

  const confirmStage = useCallback(async () => {
    const conversationId = conversationIdRef.current;
    const target = staged;
    if (!conversationId || !target || inFlightRef.current) return;
    inFlightRef.current = true;
    setPending(true);
    setError(null);
    try {
      const result = await confirmMatorStage(conversationId, target.id);
      setEvents((previous) => mergeMatorEvents(previous, [result.event]));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to confirm staged action',
      );
    } finally {
      inFlightRef.current = false;
      setPending(false);
    }
  }, [staged]);

  const rejectStage = useCallback(async () => {
    const conversationId = conversationIdRef.current;
    const target = staged;
    if (!conversationId || !target || inFlightRef.current) return;
    inFlightRef.current = true;
    setPending(true);
    setError(null);
    try {
      const result = await rejectMatorStage(conversationId, target.id);
      setEvents((previous) => mergeMatorEvents(previous, [result.event]));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to reject staged action',
      );
    } finally {
      inFlightRef.current = false;
      setPending(false);
    }
  }, [staged]);

  const newConversation = useCallback(async () => {
    if (!workflowId || inFlightRef.current) return;
    inFlightRef.current = true;
    setPending(true);
    setError(null);
    try {
      const created = await createMatorConversation(workflowId);
      setConversations((previous) => [
        created,
        ...previous.filter((item) => item.id !== created.id),
      ]);
      setConversationMeta(created);
      setEvents([]);
      setLocalNotices([]);
      idempotencyKeyRef.current = null;
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to create conversation',
      );
    } finally {
      inFlightRef.current = false;
      setPending(false);
    }
  }, [workflowId]);

  const switchConversation = useCallback(
    async (conversationId: string) => {
      if (!workflowId || inFlightRef.current) return;
      if (conversationId === conversationIdRef.current) return;
      inFlightRef.current = true;
      setPending(true);
      setError(null);
      try {
        await switchMatorConversation(workflowId, conversationId);
        const meta =
          conversations.find((item) => item.id === conversationId) ?? null;
        setConversationMeta(meta);
        const loaded = await fetchMatorEvents(conversationId);
        setEvents(loaded);
        setLocalNotices([]);
        idempotencyKeyRef.current = null;
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Unable to switch conversation',
        );
      } finally {
        inFlightRef.current = false;
        setPending(false);
      }
    },
    [conversations, workflowId],
  );

  const restorePipeline = useCallback(async (confirmDirty = false) => {
    const conversationId = conversationIdRef.current;
    if (!conversationId || inFlightRef.current) return;
    inFlightRef.current = true;
    setPending(true);
    setError(null);
    try {
      await restoreMatorPipeline(conversationId, confirmDirty);
      const loaded = await fetchMatorEvents(conversationId);
      setEvents(loaded);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to restore pipeline',
      );
      throw err;
    } finally {
      inFlightRef.current = false;
      setPending(false);
    }
  }, []);

  const voicePolicies = useMemo(
    () => ({
      howTtsEnabled: settingsToggles.howTtsEnabled,
      /** Never TTS the user transcript — only assistant `how` when enabled. */
      maySpeakUserTranscript: false as const,
      speakHow: (text: string) => {
        if (!howTtsRef.current) return;
        try {
          onSpeakHowRef.current?.(text);
        } catch {
          /* optional */
        }
      },
    }),
    [settingsToggles.howTtsEnabled],
  );

  return {
    conversation: conversation as Array<{
      id: string | number;
      sender: 'user' | 'assistant';
      text: string;
    }>,
    conversationMeta,
    conversations,
    events,
    message,
    setMessage,
    send,
    sendMessage,
    confirmStage,
    rejectStage,
    newConversation,
    switchConversation,
    restorePipeline,
    settings,
    settingsToggles,
    patchSettings,
    voicePolicies,
    pending,
    pendingStage: staged,
    pendingLabel: pendingStageLabel(staged),
    error,
    loading,
    incomplete,
    incompleteContinue,
    chatNotice,
    setConversation,
    refresh,
  };
}
