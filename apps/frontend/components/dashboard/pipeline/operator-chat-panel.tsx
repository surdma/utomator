'use client';

import { type FormEvent, type ReactNode } from 'react';
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
  Plus,
  RotateCcw,
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
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from '@/components/ui/message-scroller';
import { Card, CardContent } from '@/components/ui/automate-card';
import MatorClarifyForm from './mator-clarify-form';
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
import {
  findOpenClarify,
  readClarifyQuestions,
  type MatorChatEvent,
  type MatorConversationSummary,
} from './mator-chat-state';
import type { MatorImageMarkerDto } from './mator-api';

type Props = {
  pane: DashboardPane;
  selectedCraftSlug: string | null;
  mobileChatOpen: boolean;
  showChat: boolean;
  onClose: () => void;
  conversation: ChatMessage[];
  events: RunEvent[];
  matorEvents?: MatorChatEvent[];
  conversations?: MatorConversationSummary[];
  conversationMeta?: MatorConversationSummary | null;
  onSwitchConversation?: (conversationId: string) => void;
  onNewConversation?: () => void;
  onRestorePipeline?: () => void;
  onSendText?: (text: string) => void;
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

function threadWhen(iso: string | null) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function EventMotion({
  id,
  anchor = false,
  children,
}: {
  id: string;
  anchor?: boolean;
  children: ReactNode;
}) {
  return (
    <MessageScrollerItem messageId={id} scrollAnchor={anchor}>
      {children}
    </MessageScrollerItem>
  );
}

export default function OperatorChatPanel({
  pane,
  selectedCraftSlug,
  mobileChatOpen,
  showChat,
  onClose,
  conversation,
  events,
  matorEvents = [],
  conversations = [],
  conversationMeta = null,
  onSwitchConversation,
  onNewConversation,
  onRestorePipeline,
  onSendText,
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
  voice,
  pendingLabel,
  onConfirm,
  onReject,
  busy = false,
  incomplete = false,
  onIncompleteContinue,
  chatError = null,
}: Props) {
  const reduceMotion = useReducedMotion();
  const showRestore = Boolean(conversationMeta?.boundRevisionId);
  const openClarify = findOpenClarify(matorEvents);
  const threadList = [...conversations].sort((a, b) => {
    if (a.id === conversationMeta?.id) return -1;
    if (b.id === conversationMeta?.id) return 1;
    return (b.updatedAt || '').localeCompare(a.updatedAt || '');
  });

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
        className="flex min-h-0 flex-1 flex-col overflow-hidden border-slate-200/70 bg-white shadow-none"
      >
        <div className="shrink-0 px-4 pt-4 pb-3">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-[13px] text-slate-500">This workflow</p>
            <button
              type="button"
              onClick={onClose}
              className="text-xs text-slate-400 hover:text-slate-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
            >
              Hide
            </button>
          </div>
          <nav
            aria-label="Threads in this workflow"
            data-testid="mator-conversation-switcher"
            className="mt-3"
          >
            {threadList.length === 0 ? (
              <p className="px-2.5 text-sm text-slate-400">No threads yet</p>
            ) : (
              <ul className="flex max-h-36 flex-col gap-0.5 overflow-y-auto">
                <AnimatePresence initial={false}>
                  {threadList.map((item) => {
                    const current = item.id === conversationMeta?.id;
                    return (
                      <motion.li
                        key={item.id}
                        initial={reduceMotion ? false : { opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: reduceMotion ? 0 : 0.18 }}
                      >
                        <button
                          type="button"
                          aria-current={current ? 'true' : undefined}
                          disabled={!onSwitchConversation || current}
                          onClick={() => onSwitchConversation?.(item.id)}
                          className={
                            'flex w-full items-baseline justify-between gap-3 rounded-lg px-2.5 py-2 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:opacity-100 ' +
                            (current
                              ? 'bg-slate-50 text-slate-800'
                              : 'text-slate-500 hover:bg-slate-50/80 hover:text-slate-700')
                          }
                        >
                          <span className="truncate text-sm">
                            {item.title || 'Conversation'}
                          </span>
                          <span className="shrink-0 text-[11px] text-slate-400">
                            {current ? 'Now' : threadWhen(item.updatedAt)}
                          </span>
                        </button>
                      </motion.li>
                    );
                  })}
                </AnimatePresence>
              </ul>
            )}
          </nav>
          <div className="mt-2 flex flex-wrap items-center gap-3 px-2.5">
            <button
              type="button"
              data-testid="mator-new-conversation"
              disabled={!onNewConversation || busy}
              onClick={() => onNewConversation?.()}
              className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:opacity-40"
            >
              <Plus className="size-3.5" aria-hidden="true" />
              New thread
            </button>
            {showRestore && (
              <button
                type="button"
                data-testid="mator-restore-pipeline"
                disabled={!onRestorePipeline || busy}
                onClick={() => onRestorePipeline?.()}
                className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:opacity-40"
              >
                <RotateCcw className="size-3.5" aria-hidden="true" />
                Restore pipeline
              </button>
            )}
          </div>
        </div>
        <CardContent className="flex min-h-0 flex-1 flex-col gap-0 px-0 pt-0 pb-0">
          {pane === 'growth' && selectedCraftSlug && (
            <p
              data-testid="active-craft-context"
              className="px-4 pb-1 text-xs text-slate-500"
            >
              Craft{' '}
              <button
                type="button"
                onClick={() => onMessageChange('/craft help')}
                className="font-mono text-slate-700 hover:underline"
              >
                {selectedCraftSlug}
              </button>
            </p>
          )}
          <MessageScrollerProvider
            autoScroll
            defaultScrollPosition="end"
          >
            <MessageScroller className="min-h-0 flex-1">
              <MessageScrollerViewport aria-label="Thread history">
                <MessageScrollerContent className="gap-5 px-4 py-3">
              {matorEvents.map((event) => {
                if (event.kind === 'message' && event.role === 'user') {
                  return (
                    <EventMotion key={event.id} id={event.id} anchor>
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
                                className="inline-flex h-7 cursor-pointer items-center gap-1 rounded-lg px-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
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

                if (event.kind === 'clarify') {
                  const questions = readClarifyQuestions(event.action);
                  const open = openClarify?.id === event.id && questions;
                  return (
                    <EventMotion key={event.id} id={event.id}>
                      <Message>
                        <MessageAvatar className="bg-teal-50 text-teal-800">
                          <Workflow className="size-3.5" />
                        </MessageAvatar>
                        <MessageContent>
                          <MessageHeader>Mator</MessageHeader>
                          {event.text ? (
                            <Bubble variant="outline">
                              <BubbleContent>{event.text}</BubbleContent>
                            </Bubble>
                          ) : null}
                          {open ? (
                            <MatorClarifyForm
                              questions={questions}
                              disabled={busy}
                              onSubmit={(text) => onSendText?.(text)}
                            />
                          ) : null}
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

            {matorEvents.length === 0 &&
              conversation.map((item) => (
                <MessageScrollerItem
                  key={item.id}
                  messageId={String(item.id)}
                  scrollAnchor={item.sender === 'user'}
                >
                <Message
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
                          className="inline-flex h-7 cursor-pointer items-center gap-1 rounded-lg px-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
                        >
                          <Volume2 className="size-4" aria-hidden="true" />
                          Hear this
                        </button>
                      </MessageFooter>
                    )}
                  </MessageContent>
                </Message>
                </MessageScrollerItem>
              ))}

            {events.map((event) => (
              <MessageScrollerItem
                key={'event-' + event.id}
                messageId={'event-' + event.id}
              >
              <Message>
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
              </MessageScrollerItem>
            ))}
            {reviews
              .filter(
                (r) =>
                  r.platform === platform &&
                  r.handle.toLowerCase() === normalizedHandle.toLowerCase()
              )
              .map((review) => (
                <MessageScrollerItem
                  key={'review-' + review.id}
                  messageId={'review-' + review.id}
                >
                <Message>
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
                </MessageScrollerItem>
              ))}
                </MessageScrollerContent>
              </MessageScrollerViewport>
              <MessageScrollerButton />
            </MessageScroller>
          </MessageScrollerProvider>
          {(imageError || chatError) && (
            <p role="alert" className="px-4 pt-2 text-xs text-rose-700">
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
