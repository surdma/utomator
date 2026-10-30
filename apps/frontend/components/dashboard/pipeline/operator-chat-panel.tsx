'use client';

import { useEffect, useRef, type FormEvent, type ReactNode } from 'react';
import Image from 'next/image';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  Activity,
  AlertCircle,
  Workflow,
  X,
  ImageIcon,
  Crosshair,
  Focus,
  Volume2,
  VolumeX,
  Plus,
  RotateCcw,
  ShieldCheck,
  Layers,
} from 'lucide-react';
import {
  Message,
  MessageAvatar,
  MessageContent,
  MessageFooter,
  MessageHeader,
} from '@/components/ui/message';
import { Bubble, BubbleContent } from '@/components/ui/bubble';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Button,
} from '@/components/ui/automate-card';
import { timeLabel, short } from './presentation-utils';
import VoiceDeck from './voice-deck';
import MatorAttachmentCanvas from './mator-attachment-canvas';
import type { VoiceSession } from './use-voice-session';
import { getApi } from './api-client';
import { matorAttachmentFileUrl } from './mator-api';
import type { DashboardPane } from './dashboard-route';
import type {
  ChatMessage,
  Event as RunEvent,
  Review,
  Checkpoint,
} from './run-models';
import type { Platform } from './workflow-catalog';
import type {
  MatorChatEvent,
  MatorConversationSummary,
  MatorSettingsToggles,
} from './mator-chat-state';
import type { MatorImageMarkerDto } from './mator-api';

type Props = {
  pane: DashboardPane;
  selectedCraftSlug: string | null;
  mobileChatOpen: boolean;
  showChat: boolean;
  onClose: () => void;
  onOpenTracking: () => void;
  conversation: ChatMessage[];
  events: RunEvent[];
  matorEvents?: MatorChatEvent[];
  conversations?: MatorConversationSummary[];
  conversationMeta?: MatorConversationSummary | null;
  onSwitchConversation?: (conversationId: string) => void;
  onNewConversation?: () => void;
  onRestorePipeline?: () => void;
  settingsToggles?: MatorSettingsToggles;
  onToggleHowTts?: () => void;
  onToggleAutoApprove?: () => void;
  onToggleSquash?: () => void;
  attachmentPreviews?: Record<string, string>;
  onSaveMarkers?: (
    attachmentId: string,
    markers: MatorImageMarkerDto[],
  ) => void | Promise<void>;
  reviews: Review[];
  platform: Platform;
  normalizedHandle: string;
  currentRunId: string | null;
  onAnnotateCapture: (runId: string, fileName: string) => void;
  onEditReview: (review: Review) => void;
  onInspectReview: (review: Review) => void;
  reviewImage: (review: Review) => string;
  imageError: string;
  message: string;
  onMessageChange: (message: string) => void;
  onSendMessage: (event: FormEvent<HTMLFormElement>) => void;
  onAttachFile: (file?: File) => void | Promise<void>;
  checkpoint: Checkpoint | null;
  voice: VoiceSession;
  pendingLabel: string | null;
  onConfirm: () => void;
  onReject?: () => void;
  busy?: boolean;
  incomplete?: boolean;
  onIncompleteContinue?: () => void;
  chatError?: string | null;
};

function actionLabel(action: unknown): string {
  const typed = action as { type?: string } | undefined;
  if (typed?.type) return typed.type.replaceAll('_', ' ');
  return 'action';
}

function EventMotion({
  id,
  children,
}: {
  id: string;
  children: ReactNode;
}) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      key={id}
      layout={!reduceMotion}
      initial={reduceMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduceMotion ? undefined : { opacity: 0, y: -6 }}
      transition={
        reduceMotion ? { duration: 0 } : { duration: 0.2, ease: 'easeOut' }
      }
    >
      {children}
    </motion.div>
  );
}

export default function OperatorChatPanel({
  pane,
  selectedCraftSlug,
  mobileChatOpen,
  showChat,
  onClose,
  onOpenTracking,
  conversation,
  events,
  matorEvents = [],
  conversations = [],
  conversationMeta = null,
  onSwitchConversation,
  onNewConversation,
  onRestorePipeline,
  settingsToggles,
  onToggleHowTts,
  onToggleAutoApprove,
  onToggleSquash,
  attachmentPreviews = {},
  onSaveMarkers,
  reviews,
  platform,
  normalizedHandle,
  currentRunId,
  onAnnotateCapture,
  onEditReview,
  onInspectReview,
  reviewImage,
  imageError,
  message,
  onMessageChange,
  onSendMessage,
  onAttachFile,
  checkpoint,
  voice,
  pendingLabel,
  onConfirm,
  onReject,
  busy = false,
  incomplete = false,
  onIncompleteContinue,
  chatError = null,
}: Props) {
  const logRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();
  const howMuted = !(settingsToggles?.howTtsEnabled ?? true);
  const showRestore = Boolean(conversationMeta?.boundRevisionId);

  useEffect(() => {
    logRef.current?.scrollTo({
      top: logRef.current.scrollHeight,
      behavior: reduceMotion ? 'auto' : 'smooth',
    });
  }, [events, conversation, checkpoint, matorEvents, reduceMotion]);

  const markerDraft =
    voice.interim?.trim() ||
    (voice.listening ? '' : message.trim()) ||
    '';

  return (
    <aside
      data-testid="automation-right-sidebar"
      className={
        (mobileChatOpen
          ? 'fixed inset-y-0 right-0 z-50 flex w-[min(92vw,390px)] bg-[#f5f7f8] p-3 shadow-2xl'
          : 'hidden') +
        (showChat
          ? ' lg:static lg:flex lg:h-full lg:min-h-0 lg:w-auto lg:overflow-hidden lg:bg-transparent lg:p-0 lg:shadow-none'
          : ' lg:hidden') +
        ' min-w-0 flex-col'
      }
    >
      <button
        type="button"
        className="mb-2 inline-flex min-h-10 items-center justify-end gap-2 text-xs font-semibold text-slate-700 lg:hidden"
        onClick={() => {
          onClose();
        }}
        aria-label="Close operator chat"
      >
        <X className="size-4" />
        Close
      </button>
      <Card
        data-testid="mator-chat"
        className="flex min-h-0 flex-1 flex-col overflow-hidden"
      >
        <CardHeader className="space-y-3 border-b border-slate-100 pb-3">
          <div className="flex flex-row items-start justify-between gap-3">
            <div className="min-w-0">
              <CardTitle>Mator</CardTitle>
              <CardDescription>
                Speak or stage what you want changed.
              </CardDescription>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => onToggleHowTts?.()}
                aria-label={howMuted ? 'Unmute how TTS' : 'Mute how TTS'}
                aria-pressed={howMuted}
                className="inline-flex size-11 cursor-pointer items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
                title={howMuted ? 'Unmute how TTS' : 'Mute how TTS'}
              >
                {howMuted ? (
                  <VolumeX className="size-4" aria-hidden="true" />
                ) : (
                  <Volume2 className="size-4" aria-hidden="true" />
                )}
              </button>
              <button
                type="button"
                onClick={onOpenTracking}
                aria-label="Open tracking"
                className="inline-flex size-10 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100"
                title="Tracking"
              >
                <Activity className="size-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  onClose();
                }}
                aria-label="Minimize Mator"
                className="inline-flex size-10 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100"
                title="Minimize chat"
              >
                <X className="size-4" />
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="sr-only" htmlFor="mator-conversation-switcher">
              Conversation
            </label>
            <select
              id="mator-conversation-switcher"
              data-testid="mator-conversation-switcher"
              value={conversationMeta?.id ?? ''}
              disabled={!onSwitchConversation || conversations.length === 0}
              onChange={(event) =>
                onSwitchConversation?.(event.target.value)
              }
              className="min-h-10 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:opacity-50"
            >
              {conversations.length === 0 ? (
                <option value="">No conversations</option>
              ) : (
                conversations.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title || 'Conversation'}
                  </option>
                ))
              )}
            </select>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              data-testid="mator-new-conversation"
              disabled={!onNewConversation || busy}
              onClick={() => onNewConversation?.()}
              className="shrink-0"
            >
              <Plus className="size-3.5" aria-hidden="true" />
              New
            </Button>
          </div>

          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              data-testid="mator-toggle-auto-approve"
              aria-pressed={settingsToggles?.autoApprove ?? false}
              disabled={!onToggleAutoApprove}
              onClick={() => onToggleAutoApprove?.()}
              className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:opacity-40 ${
                settingsToggles?.autoApprove
                  ? 'bg-teal-800 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
              title="Auto-approve staged actions"
            >
              <ShieldCheck className="size-3.5" aria-hidden="true" />
              Auto-approve
            </button>
            <button
              type="button"
              data-testid="mator-toggle-squash"
              aria-pressed={settingsToggles?.squashPipelineHistory ?? false}
              disabled={!onToggleSquash}
              onClick={() => onToggleSquash?.()}
              className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:opacity-40 ${
                settingsToggles?.squashPipelineHistory
                  ? 'bg-teal-800 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
              title="Squash pipeline history on apply"
            >
              <Layers className="size-3.5" aria-hidden="true" />
              Squash
            </button>
            {showRestore && (
              <button
                type="button"
                data-testid="mator-restore-pipeline"
                disabled={!onRestorePipeline || busy}
                onClick={() => onRestorePipeline?.()}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-slate-900 px-2.5 text-[11px] font-semibold text-white hover:bg-teal-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:opacity-40"
                title="Restore this conversation's pipeline"
              >
                <RotateCcw className="size-3.5" aria-hidden="true" />
                Restore pipeline
              </button>
            )}
          </div>
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col pt-3">
          {pane === 'growth' && selectedCraftSlug && (
            <div
              data-testid="active-craft-context"
              className="mb-3 flex items-center justify-between gap-2 rounded-xl border border-teal-200 bg-teal-50 p-3"
            >
              <div className="min-w-0">
                <p className="text-[10px] font-bold tracking-wider text-teal-800 uppercase">
                  Active craft
                </p>
                <p className="mt-0.5 truncate font-mono text-[11px] text-teal-950">
                  {selectedCraftSlug}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onMessageChange('/craft help')}
                className="rounded-lg bg-white px-2.5 py-2 text-[11px] font-semibold text-teal-800 hover:bg-teal-100"
              >
                Commands
              </button>
            </div>
          )}
          <div
            className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1"
            ref={logRef}
            role="log"
            aria-live="polite"
          >
            <AnimatePresence initial={false}>
              {matorEvents.map((event) => {
                if (event.kind === 'message' && event.role === 'user') {
                  return (
                    <EventMotion key={event.id} id={event.id}>
                      <Message align="end">
                        <MessageAvatar className="bg-slate-800">
                          ME
                        </MessageAvatar>
                        <MessageContent>
                          <MessageHeader>You</MessageHeader>
                          <Bubble muted>
                            <BubbleContent>
                              {event.text || 'Attachment'}
                            </BubbleContent>
                          </Bubble>
                          {event.attachmentId && (
                            <div className="mt-2">
                              <MatorAttachmentCanvas
                                attachmentId={event.attachmentId}
                                imageSrc={
                                  attachmentPreviews[event.attachmentId] ??
                                  matorAttachmentFileUrl(event.attachmentId)
                                }
                                markers={event.markers ?? []}
                                draftText={markerDraft}
                                onMarkersChange={
                                  onSaveMarkers
                                    ? (markers) =>
                                        void onSaveMarkers(
                                          event.attachmentId!,
                                          markers,
                                        )
                                    : undefined
                                }
                              />
                            </div>
                          )}
                        </MessageContent>
                      </Message>
                    </EventMotion>
                  );
                }

                if (event.kind === 'how' || event.kind === 'message') {
                  return (
                    <EventMotion key={event.id} id={event.id}>
                      <Message>
                        <MessageAvatar className="bg-teal-700">
                          <Workflow className="size-4" />
                        </MessageAvatar>
                        <MessageContent>
                          <MessageHeader>
                            {event.kind === 'how'
                              ? 'How · Mator'
                              : 'Utomator · Mator'}
                          </MessageHeader>
                          <Bubble>
                            <BubbleContent>
                              {event.text || '…'}
                            </BubbleContent>
                          </Bubble>
                          {event.kind === 'how' && event.text && (
                            <MessageFooter>
                              <button
                                type="button"
                                onClick={() => voice.speak(event.text!, true)}
                                aria-label="Hear this reply"
                                className="inline-flex min-h-11 cursor-pointer items-center gap-1 rounded-lg px-2 text-xs font-semibold text-teal-800 hover:bg-teal-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
                              >
                                <Volume2
                                  className="size-4"
                                  aria-hidden="true"
                                />
                                Hear this
                              </button>
                            </MessageFooter>
                          )}
                        </MessageContent>
                      </Message>
                    </EventMotion>
                  );
                }

                if (event.status === 'staged' || event.action) {
                  const staged = event.status === 'staged';
                  return (
                    <EventMotion key={event.id} id={event.id}>
                      <motion.div
                        layout={!reduceMotion}
                        className={`rounded-xl border p-3 ${
                          staged
                            ? 'border-orange-200 bg-orange-50/80'
                            : event.status === 'rejected'
                              ? 'border-rose-200 bg-rose-50/60'
                              : event.status === 'incomplete'
                                ? 'border-amber-200 bg-amber-50/70'
                                : 'border-teal-200 bg-teal-50/60'
                        }`}
                      >
                        <p className="text-[10px] font-bold tracking-wider text-slate-600 uppercase">
                          {event.status ?? 'action'} ·{' '}
                          {actionLabel(event.action)}
                        </p>
                        {event.text && (
                          <p className="mt-1 text-sm leading-5 text-slate-800">
                            {event.text}
                          </p>
                        )}
                        {event.attachmentId && (
                          <div className="mt-2">
                            <MatorAttachmentCanvas
                              attachmentId={event.attachmentId}
                              imageSrc={
                                attachmentPreviews[event.attachmentId] ??
                                matorAttachmentFileUrl(event.attachmentId)
                              }
                              markers={event.markers ?? []}
                              draftText={markerDraft}
                              interactive={Boolean(onSaveMarkers)}
                              onMarkersChange={
                                onSaveMarkers
                                  ? (markers) =>
                                      void onSaveMarkers(
                                        event.attachmentId!,
                                        markers,
                                      )
                                  : undefined
                              }
                            />
                          </div>
                        )}
                        {staged && (
                          <p className="mt-2 text-[11px] font-semibold text-orange-900">
                            Confirm or reject below to apply this change.
                          </p>
                        )}
                      </motion.div>
                    </EventMotion>
                  );
                }

                if (event.attachmentId) {
                  return (
                    <EventMotion key={event.id} id={event.id}>
                      <MatorAttachmentCanvas
                        attachmentId={event.attachmentId}
                        imageSrc={
                          attachmentPreviews[event.attachmentId] ??
                          matorAttachmentFileUrl(event.attachmentId)
                        }
                        markers={event.markers ?? []}
                        draftText={markerDraft}
                        onMarkersChange={
                          onSaveMarkers
                            ? (markers) =>
                                void onSaveMarkers(
                                  event.attachmentId!,
                                  markers,
                                )
                            : undefined
                        }
                      />
                    </EventMotion>
                  );
                }

                if (event.text) {
                  return (
                    <EventMotion key={event.id} id={event.id}>
                      <Message>
                        <MessageAvatar
                          className={
                            event.status === 'error'
                              ? 'bg-rose-700'
                              : 'bg-slate-700'
                          }
                        >
                          {event.status === 'error' ? (
                            <AlertCircle className="size-4" />
                          ) : (
                            <Activity className="size-4" />
                          )}
                        </MessageAvatar>
                        <MessageContent>
                          <MessageHeader>
                            {(event.kind || 'event').toUpperCase()}
                          </MessageHeader>
                          <Bubble>
                            <BubbleContent>{event.text}</BubbleContent>
                          </Bubble>
                        </MessageContent>
                      </Message>
                    </EventMotion>
                  );
                }

                return null;
              })}
            </AnimatePresence>

            {matorEvents.length === 0 &&
              conversation.map((item) => (
                <Message
                  key={item.id}
                  align={item.sender === 'user' ? 'end' : 'start'}
                >
                  <MessageAvatar
                    className={
                      item.sender === 'assistant' ? 'bg-teal-700' : 'bg-slate-800'
                    }
                  >
                    {item.sender === 'assistant' ? (
                      <Workflow className="size-4" />
                    ) : (
                      'ME'
                    )}
                  </MessageAvatar>
                  <MessageContent>
                    <MessageHeader>
                      {item.sender === 'assistant'
                        ? 'Utomator · Local assistant'
                        : 'You'}
                    </MessageHeader>
                    <Bubble muted={item.sender === 'user'}>
                      <BubbleContent>{item.text}</BubbleContent>
                    </Bubble>
                    {item.sender === 'assistant' && (
                      <MessageFooter>
                        <button
                          type="button"
                          onClick={() => voice.speak(item.text, true)}
                          aria-label="Hear this reply"
                          className="inline-flex min-h-11 cursor-pointer items-center gap-1 rounded-lg px-2 text-xs font-semibold text-teal-800 hover:bg-teal-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
                        >
                          <Volume2 className="size-4" aria-hidden="true" />
                          Hear this
                        </button>
                      </MessageFooter>
                    )}
                  </MessageContent>
                </Message>
              ))}

            {events.map((event) => (
              <Message key={'event-' + event.id}>
                <MessageAvatar
                  className={
                    event.kind === 'error' ? 'bg-rose-700' : 'bg-slate-700'
                  }
                >
                  {event.kind === 'error' ? (
                    <AlertCircle className="size-4" />
                  ) : (
                    <Activity className="size-4" />
                  )}
                </MessageAvatar>
                <MessageContent>
                  <MessageHeader>
                    {event.kind.toUpperCase()} · {timeLabel(event.time)}
                  </MessageHeader>
                  <Bubble>
                    <BubbleContent>{event.message}</BubbleContent>
                  </Bubble>
                  {event.kind === 'screenshot' &&
                    typeof event.details?.fileName === 'string' &&
                    /^[a-zA-Z0-9_-]+\.png$/.test(event.details.fileName) &&
                    event.runId === currentRunId && (
                      <button
                        data-testid="workflow-screenshot"
                        type="button"
                        onClick={() =>
                          onAnnotateCapture(
                            event.runId,
                            event.details!.fileName!
                          )
                        }
                        data-evidence-url={getApi(
                          'runs/' +
                            event.runId +
                            '/evidence/' +
                            event.details.fileName
                        )}
                        className="mt-2 block w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-50 text-left hover:border-teal-400 focus-visible:outline-2 focus-visible:outline-teal-600"
                        aria-label={
                          'Annotate captured image: ' + event.details.fileName
                        }
                      >
                        <Image
                          unoptimized
                          src={getApi(
                            'runs/' +
                              event.runId +
                              '/evidence/' +
                              event.details.fileName
                          )}
                          width={640}
                          height={400}
                          alt={'Actual browser capture: ' + event.message}
                          className="h-auto w-full object-contain"
                        />
                        <div className="flex items-center gap-2 px-3 py-2 text-[11px] text-slate-500">
                          <ImageIcon className="size-3.5" />
                          {event.details.fileName} · Click image to annotate
                        </div>
                      </button>
                    )}
                  <MessageFooter>
                    Event {event.id} · Run {short(event.runId)}
                  </MessageFooter>
                </MessageContent>
              </Message>
            ))}
            {reviews
              .filter(
                (r) =>
                  r.platform === platform &&
                  r.handle.toLowerCase() === normalizedHandle.toLowerCase()
              )
              .map((review) => (
                <Message key={'review-' + review.id}>
                  <MessageAvatar className="bg-teal-800">
                    <Crosshair className="size-4" />
                  </MessageAvatar>
                  <MessageContent>
                    <MessageHeader>
                      Saved visual review · {review.nodeId} node
                    </MessageHeader>
                    <div
                      data-testid="saved-visual-review"
                      className="overflow-hidden rounded-xl border border-teal-200 bg-teal-50/40"
                    >
                      <button
                        type="button"
                        onClick={() => onEditReview(review)}
                        aria-label={'Edit annotated image ' + review.id}
                        className="relative block w-full overflow-hidden bg-slate-50 text-left"
                      >
                        <Image
                          unoptimized
                          src={reviewImage(review)}
                          width={640}
                          height={400}
                          alt={'Annotated ' + review.pageUrl}
                          className="pointer-events-none h-auto w-full"
                        />
                        <svg
                          aria-hidden="true"
                          viewBox="0 0 1000 1000"
                          preserveAspectRatio="none"
                          className="pointer-events-none absolute inset-0 size-full"
                        >
                          {(review.annotations ?? []).map((a, index) => (
                            <g key={a.id}>
                              {a.shape === 'freehand' ? (
                                <polyline
                                  fill="none"
                                  stroke="#0f766e"
                                  strokeWidth="5"
                                  points={(a.points ?? [])
                                    .map((p) => p.x * 1000 + ',' + p.y * 1000)
                                    .join(' ')}
                                />
                              ) : a.shape === 'ellipse' ? (
                                <ellipse
                                  cx={(a.x + a.width / 2) * 1000}
                                  cy={(a.y + a.height / 2) * 1000}
                                  rx={a.width * 500}
                                  ry={a.height * 500}
                                  fill="#0f766e"
                                  fillOpacity=".08"
                                  stroke="#0f766e"
                                  strokeWidth="4"
                                />
                              ) : (
                                <rect
                                  x={a.x * 1000}
                                  y={a.y * 1000}
                                  width={a.width * 1000}
                                  height={a.height * 1000}
                                  fill="#0f766e"
                                  fillOpacity=".08"
                                  stroke="#0f766e"
                                  strokeWidth="4"
                                />
                              )}
                              <text
                                x={a.x * 1000 + 10}
                                y={a.y * 1000 + 23}
                                fill="#0f766e"
                                fontSize="22"
                                fontWeight="bold"
                              >
                                {index + 1}
                              </text>
                            </g>
                          ))}
                        </svg>
                        <span className="block border-t border-teal-100 px-3 py-2 text-[11px] font-bold text-teal-800">
                          Open annotation editor
                        </span>
                      </button>
                      <div className="space-y-1 p-3 text-[11px]">
                        <p className="font-bold text-teal-900">
                          {review.regions.length} marked region(s)
                        </p>
                        {review.regions.map((r, i) => (
                          <p key={i} className="text-slate-600">
                            {i + 1}. {r.label}: {r.request}
                          </p>
                        ))}
                        <p className="font-mono text-[10px] break-all text-slate-500">
                          {review.pageUrl}
                        </p>
                        <button
                          type="button"
                          onClick={() => onInspectReview(review)}
                          className="mt-2 inline-flex gap-2 font-bold text-teal-800 hover:underline"
                        >
                          <Focus className="size-3.5" />
                          Inspect this exact page on the artboard
                        </button>
                        {review.annotations?.length ? (
                          <>
                            <div className="mt-3 space-y-1 border-t border-teal-100 pt-3">
                              {review.annotations.map((a, index) => (
                                <p
                                  key={a.id}
                                  className="text-[11px] text-slate-700"
                                >
                                  <strong>
                                    {index + 1}. {a.action.replaceAll('-', ' ')}
                                  </strong>
                                  {a.comment ? ' · ' + a.comment : ''}
                                </p>
                              ))}
                            </div>
                            <p className="mt-1 text-[10px] leading-4 text-slate-500">
                              Tagged instructions are linked to the workflow;
                              they cannot execute unapproved browser actions.
                            </p>
                          </>
                        ) : (
                          <p className="mt-2 text-[10px] text-slate-500">
                            Earlier image review. Click the image to add
                            detailed actions and comments.
                          </p>
                        )}
                      </div>
                    </div>
                  </MessageContent>
                </Message>
              ))}
          </div>
          {(imageError || chatError) && (
            <p role="alert" className="mt-2 text-xs text-rose-700">
              {chatError || imageError}
            </p>
          )}
          <VoiceDeck
            voice={voice}
            pendingLabel={pendingLabel}
            onConfirm={onConfirm}
            onReject={onReject}
            message={message}
            onMessageChange={onMessageChange}
            onSendMessage={onSendMessage}
            onAttachFile={onAttachFile}
            busy={busy}
            incomplete={incomplete}
            onIncompleteContinue={onIncompleteContinue}
          />
        </CardContent>
      </Card>
    </aside>
  );
}
