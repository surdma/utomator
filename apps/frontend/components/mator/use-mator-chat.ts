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
  patchMatorMarkers,
  postMatorMessage,
  rejectMatorStage,
  restoreMatorPipeline,
  saveMatorSettings,
  switchMatorConversation,
  uploadMatorAttachment,
  type MatorImageMarkerDto,
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
  stageResolution,
  type MatorChatBubble,
  type MatorChatEvent,
  type MatorConversationSummary,
  type MatorSettingsToggles,
} from './mator-chat-state.ts';
import {
  beginMatorSend,
  createMatorSendGate,
  finishMatorSendFailure,
  finishMatorSendSuccess,
  type MatorSendGate,
} from './mator-send-gate.ts';
import { resolveMatorCallTurn } from './mator-call-contract.ts';
import type { MatorCallTurnResult } from './mator-call-coordinator.ts';

function newIdempotencyKey() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `mator-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

type Options = {
  workflowId: string | null;
  onSpeakHow?: (text: string) => void;
  onSpeakReply?: (text: string) => void;
  voiceOnly?: boolean;
};

export function useMatorChat({ workflowId, onSpeakHow, onSpeakReply, voiceOnly = false }: Options) {
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
  const [attachmentPreviews, setAttachmentPreviews] = useState<
    Record<string, string>
  >({});

  const sendGateRef = useRef<MatorSendGate>(createMatorSendGate());
  const inFlightRef = useRef(false);
  const howTtsRef = useRef(true);
  const onSpeakHowRef = useRef(onSpeakHow);
  const onSpeakReplyRef = useRef(onSpeakReply);
  const voiceOnlyRef = useRef(voiceOnly);
  const conversationIdRef = useRef<string | null>(null);
  const lastSendPayloadRef = useRef<string | null>(null);
  const refreshEpoch = useRef(0);

  useEffect(() => {
    onSpeakHowRef.current = onSpeakHow;
    onSpeakReplyRef.current = onSpeakReply;
    voiceOnlyRef.current = voiceOnly;
  }, [onSpeakHow, onSpeakReply, voiceOnly]);

  useEffect(() => {
    howTtsRef.current = settings?.howTtsEnabled ?? true;
  }, [settings?.howTtsEnabled]);

  useEffect(() => {
    conversationIdRef.current = conversationMeta?.id ?? null;
  }, [conversationMeta?.id]);

  const speakNewHow = useCallback((incoming: MatorChatEvent[]) => {
    // In voice-only mode, speak the final assistant reply once, not every
    // guidance event followed by the same answer.
    const spokenReply = voiceOnlyRef.current
      ? [...incoming].reverse().find(
          (event) => event.role === 'assistant' && event.kind === 'message' &&
            event.status !== 'error' && event.status !== 'incomplete' && Boolean(event.text?.trim())
        )
      : null;
    if (spokenReply?.text) {
      try {
        onSpeakReplyRef.current?.(spokenReply.text);
      } catch {
        // Text delivery is authoritative when speech playback fails.
      }
      return;
    }

    if (!howTtsRef.current && !voiceOnlyRef.current) return;
    for (const event of incoming) {
      if (shouldSpeakHow(event, true) && event.text) {
        try {
          onSpeakHowRef.current?.(event.text);
        } catch {
          // Speech is optional.
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
    [events, localNotices]
  );

  const staged = useMemo(() => findPendingStage(events), [events]);
  const incomplete = useMemo(() => findIncompleteEvent(events), [events]);

  const settingsToggles: MatorSettingsToggles = {
    autoApprove: settings?.autoApprove ?? false,
    squashPipelineHistory: settings?.squashPipelineHistory ?? false,
    howTtsEnabled: settings?.howTtsEnabled ?? true,
    modelId: settings?.modelId ?? 'openai/gpt-oss-20b',
    modelName: settings?.modelName ?? 'GPT-OSS 20B',
    modelLabel: settings?.modelLabel ?? 'Fast reasoning chat',
    modelTier: settings?.modelTier ?? 'free',
  };

  const syncSettingsFromComposer = useCallback((saved: MatorSettingsMasked) => {
    setSettings(saved);
  }, []);

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
        MatorChatBubble[] | ((previous: MatorChatBubble[]) => MatorChatBubble[])
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
            bubble.id !== 'seed'
        )
      );
    },
    [events, localNotices]
  );

  const send = useCallback(
    async (text?: string, attachmentIds?: string[]) => {
      const request = (text ?? message).trim();
      const ids = attachmentIds?.filter(Boolean) ?? [];
      if (!request && ids.length === 0) return;
      const conversationId = conversationIdRef.current;
      if (!conversationId) {
        setError('Chat is not ready. Wait for the workflow conversation to load, then retry.');
        if (text !== undefined) setMessage(request);
        return false;
      }

      // Only retry the same idempotency key when the payload is unchanged.
      const payloadSignature = JSON.stringify({ request, ids });
      if (sendGateRef.current.idempotencyKey && lastSendPayloadRef.current !== payloadSignature) {
        sendGateRef.current = createMatorSendGate();
      }
      const started = beginMatorSend(sendGateRef.current, newIdempotencyKey);
      if (!started) return false;
      sendGateRef.current = started.next;
      lastSendPayloadRef.current = payloadSignature;
      inFlightRef.current = true;
      setPending(true);
      setError(null);
      if (text === undefined) setMessage('');

      try {
        const result = await postMatorMessage(
          conversationId,
          {
            ...(request ? { text: request } : {}),
            ...(ids.length ? { attachmentIds: ids } : {}),
          },
          started.key
        );
        setEvents((previous) => mergeMatorEvents(previous, result.events));
        speakNewHow(result.events);
        sendGateRef.current = finishMatorSendSuccess(sendGateRef.current);
        lastSendPayloadRef.current = null;
        if (text !== undefined) {
          setMessage((current) => current.trim() === request ? '' : current);
        }
        return true;
      } catch (err) {
        sendGateRef.current = finishMatorSendFailure(sendGateRef.current);
        setMessage((current) => current.trim() ? current : request);
        setError(err instanceof Error ? err.message : 'Unable to send message');
        return false;
      } finally {
        inFlightRef.current = false;
        setPending(false);
      }
    },
    [message, speakNewHow]
  );

  // Call requests reuse the exact Mator event stream and the same send gate,
  // but do not mutate the editable text draft or trigger the chat TTS callback.
  const sendCallTurn = useCallback(async (
    transcript: string, scope: string, signal: AbortSignal, attachmentIds?: string[]
  ): Promise<MatorCallTurnResult> => {
    const id = conversationIdRef.current;
    const request = transcript.trim();
    if (!id || !workflowId || scope !== `${workflowId}:${id}` || !request) {
      throw new Error('The active Mator conversation changed.');
    }
    if (signal.aborted) throw new Error('The call was cancelled.');
    if (inFlightRef.current) throw new Error('Mator is already processing another message.');
    const signature = JSON.stringify({ request, ids: attachmentIds ?? [], mode: 'ai_call' });
    if (sendGateRef.current.idempotencyKey && lastSendPayloadRef.current !== signature) {
      sendGateRef.current = createMatorSendGate();
    }
    const started = beginMatorSend(sendGateRef.current, newIdempotencyKey);
    if (!started) throw new Error('Mator is processing another message.');
    sendGateRef.current = started.next;
    lastSendPayloadRef.current = signature;
    inFlightRef.current = true;
    setPending(true);
    setError(null);
    try {
      const response = await postMatorMessage(id, { text: request, ...(attachmentIds?.length ? {attachmentIds}:{}), interactionMode: 'ai_call' }, started.key, signal);
      if (signal.aborted || conversationIdRef.current !== id) {
        throw new Error('The call conversation changed before its reply arrived.');
      }
      setEvents((previous) => mergeMatorEvents(previous, response.events));
      sendGateRef.current = finishMatorSendSuccess(sendGateRef.current);
      lastSendPayloadRef.current = null;
      return resolveMatorCallTurn(response.events);
    } catch (cause) {
      sendGateRef.current = finishMatorSendFailure(sendGateRef.current);
      if (!signal.aborted && conversationIdRef.current === id) {
        setError(cause instanceof Error ? cause.message : 'Unable to send call turn');
      }
      throw cause;
    } finally {
      inFlightRef.current = false;
      setPending(false);
    }
  }, [workflowId]);

  const uploadForClarify = useCallback(async (file: File): Promise<string> => {
    const conversationId = conversationIdRef.current;
    if (!conversationId) throw new Error('Select a workflow conversation first.');
    const uploaded = await uploadMatorAttachment(conversationId, file);
    if (file.type.startsWith('image/')) {
      const previewUrl = URL.createObjectURL(file);
      setAttachmentPreviews((previous) => ({
        ...previous,
        [uploaded.id]: previewUrl,
      }));
    }
    return uploaded.id;
  }, []);

  const attachFile = useCallback(
    async (file: File) => {
      const conversationId = conversationIdRef.current;
      if (!conversationId) {
        setError('Select or create a workflow conversation first');
        return null;
      }
      setError(null);
      try {
        const uploaded = await uploadMatorAttachment(conversationId, file);
        if (file.type.startsWith('image/')) {
          const previewUrl = URL.createObjectURL(file);
          setAttachmentPreviews((previous) => ({
            ...previous,
            [uploaded.id]: previewUrl,
          }));
        }
        // Uploading prepares the asset; sending happens only on user request.
        return uploaded;
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Unable to upload attachment'
        );
        return null;
      }
    },
    []
  );

  const saveMarkers = useCallback(
    async (attachmentId: string, markers: MatorImageMarkerDto[], reviewId?: string) => {
      setError(null);
      try {
        const meta = await patchMatorMarkers(attachmentId, markers, reviewId);
        setEvents((previous) =>
          previous.map((event) =>
            event.attachmentId === attachmentId || event.attachments?.some((asset) => asset.id === attachmentId)
              ? {
                  ...event,
                  ...(event.attachmentId === attachmentId ? { markers: meta.markers, reviewId: meta.reviewId ?? undefined } : {}),
                  attachments: event.attachments?.map((asset) => asset.id === attachmentId ? { ...asset, markers: meta.markers, reviewId: meta.reviewId ?? undefined } : asset),
                }
              : event
          )
        );
        return meta;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to save markers');
        throw err;
      }
    },
    []
  );

  const sendMessage = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      void send();
    },
    [send]
  );

  const incompleteContinue = useCallback(async () => {
    if (!incomplete) return;
    await send('Continue');
  }, [incomplete, send]);

  const confirmStage = useCallback(async (eventId?: string) => {
    const conversationId = conversationIdRef.current;
    const target = eventId ? events.find((event) => event.id === eventId && event.status === 'staged' && !stageResolution(events, event.id)) : staged;
    if (!conversationId || !target || inFlightRef.current) return;
    inFlightRef.current = true;
    setPending(true);
    setError(null);
    try {
      const result = await confirmMatorStage(conversationId, target.id);
      setEvents((previous) => mergeMatorEvents(previous, [result.event]));
      return true;
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to confirm staged action'
      );
    } finally {
      inFlightRef.current = false;
      setPending(false);
    }
  }, [events, staged]);

  const rejectStage = useCallback(async (eventId?: string) => {
    const conversationId = conversationIdRef.current;
    const target = eventId ? events.find((event) => event.id === eventId && event.status === 'staged' && !stageResolution(events, event.id)) : staged;
    if (!conversationId || !target || inFlightRef.current) return;
    inFlightRef.current = true;
    setPending(true);
    setError(null);
    try {
      const result = await rejectMatorStage(conversationId, target.id);
      setEvents((previous) => mergeMatorEvents(previous, [result.event]));
      return true;
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to reject staged action'
      );
    } finally {
      inFlightRef.current = false;
      setPending(false);
    }
  }, [events, staged]);

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
      sendGateRef.current = createMatorSendGate();
      lastSendPayloadRef.current = null;
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to create conversation'
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
        sendGateRef.current = createMatorSendGate();
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Unable to switch conversation'
        );
      } finally {
        inFlightRef.current = false;
        setPending(false);
      }
    },
    [conversations, workflowId]
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
        err instanceof Error ? err.message : 'Unable to restore pipeline'
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
    [settingsToggles.howTtsEnabled]
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
    sendCallTurn,
    sendMessage,
    confirmStage,
    rejectStage,
    newConversation,
    switchConversation,
    restorePipeline,
    attachFile,
    uploadForClarify,
    saveMarkers,
    attachmentPreviews,
    settings,
    settingsToggles,
    patchSettings,
    syncSettingsFromComposer,
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
