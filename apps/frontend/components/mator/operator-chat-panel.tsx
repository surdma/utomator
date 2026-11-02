'use client';

import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import Image from 'next/image';
import {
  AlertCircle,
  ChevronRight,
  Image as ImageIcon,
  MessageSquare,
  Plus,
  RotateCcw,
  Volume2,
  Workflow,
  ClipboardCopy,
  CircleCheck,
  LoaderCircle,
} from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useToast } from '@/components/ui/toast';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Popover } from '@/components/ui/popover';
import { ThreadSkeleton } from '@/components/ui/skeleton';
import {
  Message,
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
import { Card } from '@/components/ui/automate-card';
import { Confirmation } from './elements/confirmation';
import { Reasoning } from './elements/reasoning';
import { Checkpoint } from './elements/checkpoint';
import { Queue } from './elements/queue';
import { Suggestion } from './elements/suggestion';
import MatorClarifyForm from './mator-clarify-form';
import MatorComposer from './mator-composer';
import { MarkdownReply } from './markdown-reply';
import { getApi } from '@/components/dashboard/pipeline/api-client';
import MatorAttachmentPreview from './mator-attachment-preview';
import type { VoiceSession } from './use-voice-session';
import type { DashboardPane } from '@/components/dashboard/pipeline/dashboard-route';
import type {
  ChatMessage,
  Event as RunEvent,
  Review,
} from '@/components/dashboard/pipeline/run-models';
import type { Platform } from '@/components/dashboard/pipeline/workflow-catalog';
import {
  findOpenClarify,
  stageResolution,
  shouldRenderMatorEvent,
  readClarifyQuestions,
  type MatorChatAsset,
  type MatorChatEvent,
  type MatorConversationSummary,
} from './mator-chat-state';
import {
  fetchMatorModels,
  matorAttachmentFileUrl,
  type MatorSettingsMasked,
  type MatorImageMarkerDto,
  type MatorModelOption,
} from './mator-api';
import { threadWhen, clarifyCount } from './chat/mator-thread-format';
import { ThreadRow } from './chat/mator-thread-row';
import { AssistantAvatar } from './chat/mator-assistant-avatar';
import { TaskBlock } from './chat/mator-task-block';
import { ReviewImage } from './chat/mator-review-image';

const PANE_LABEL: Partial<Record<DashboardPane, string>> = {
  workspace: 'Workspace',
  crafts: 'Craft',
  profile: 'Profile',
  growth: 'Growth',
  memory: 'Memory',
  observer: 'Observer',
  research: 'Research',
  editorial: 'Editorial',
  history: 'History',
  resumes: 'Resumes',
  settings: 'Settings',
};

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
  loading?: boolean;
  modelId?: string | null;
  onModelChange?: (modelId: string) => Promise<unknown>;
  onSettingsSaved?: (settings: MatorSettingsMasked) => void;
  onSwitchConversation?: (conversationId: string) => void;
  onNewConversation?: () => void;
  onRestorePipeline?: () => void;
  onSendText?: (
    text: string,
    attachmentIds?: string[]
  ) => Promise<boolean | void> | void;
  onUploadClarifyFile?: (file: File) => Promise<string>;
  attachmentPreviews?: Record<string, string>;
  onSaveMarkers?: (
    attachmentId: string,
    markers: MatorImageMarkerDto[],
    reviewId?: string
  ) => void | Promise<unknown>;
  /** Opens the full YAML-driven review studio for a pending draft image. */
  onAnnotateDraft?: (file: File) => Promise<{ reviewId: string } | null>;
  /** Opens the studio for an already-sent attachment; caller links the result. */
  onAnnotateAttachment?: (
    attachmentId: string,
    note?: string
  ) => Promise<{ reviewId: string } | null>;
  /**
   * True only when the active pipeline page scope exists, because review
   * YAML requires a platform/page target.
   */
  annotateChatImageAvailable?: boolean;
  selectedPage?: string;
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
  onPendingAssetsChange?: (count: number) => void;
  checkpoint:
    import('@/components/dashboard/pipeline/run-models').Checkpoint | null;
  voice: VoiceSession;
  operatorPendingLabel?: string | null;
  onConfirmOperator?: () => void;
  onConfirm: (eventId?: string) => void;
  onReject?: (eventId?: string) => void;
  busy?: boolean;
  incomplete?: boolean;
  onIncompleteContinue?: () => void;
  chatError?: string | null;
};

const START_SUGGESTIONS = [
  { label: 'Audit my profile', prompt: 'Audit my profile' },
  { label: 'Change my headline', prompt: 'Change my headline to ' },
  { label: 'Add a skill', prompt: 'Add a skill called ' },
  { label: 'Draft a post', prompt: 'Draft a post about ' },
];

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
  loading = false,
  modelId = null,
  onModelChange,
  onSettingsSaved,
  onSwitchConversation,
  onNewConversation,
  onRestorePipeline,
  onSendText,
  onUploadClarifyFile,
  attachmentPreviews = {},
  onSaveMarkers,
  onAnnotateDraft,
  onAnnotateAttachment,
  annotateChatImageAvailable = false,
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
  onPendingAssetsChange,
  voice,
  operatorPendingLabel,
  onConfirmOperator,
  onConfirm,
  onReject,
  busy = false,
  incomplete = false,
  onIncompleteContinue,
  chatError = null,
}: Props) {
  const reduceMotion = useReducedMotion();
  const toast = useToast();
  const [threadOpen, setThreadOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [models, setModels] = useState<MatorModelOption[]>([]);

  useEffect(() => {
    let mounted = true;
    void fetchMatorModels()
      .then(({ models: available }) => {
        if (mounted)
          setModels(available.filter((model) => model.role === 'chat'));
      })
      .catch(() => {
        // Model selection is optional while the engine is unavailable.
      });
    return () => {
      mounted = false;
    };
  }, []);
  const showRestore = Boolean(conversationMeta?.boundRevisionId);
  const orderedMatorEvents = useMemo(
    () =>
      [...matorEvents].sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [matorEvents]
  );
  const visibleMatorEvents = useMemo(
    () =>
      orderedMatorEvents.filter((event) =>
        shouldRenderMatorEvent(orderedMatorEvents, event)
      ),
    [orderedMatorEvents]
  );
  const openClarify = findOpenClarify(matorEvents);
  const clarifyQuestions = openClarify
    ? readClarifyQuestions(openClarify.action)
    : null;
  const threadList = useMemo(
    () =>
      [...conversations].sort((a, b) => {
        if (a.id === conversationMeta?.id) return -1;
        if (b.id === conversationMeta?.id) return 1;
        return (b.updatedAt || '').localeCompare(a.updatedAt || '');
      }),
    [conversations, conversationMeta?.id]
  );
  const threadTitle = conversationMeta?.title || 'New conversation';

  const copyReply = async (event: MatorChatEvent) => {
    if (!event.text) return;
    try {
      await navigator.clipboard.writeText(event.text);
      setCopiedId(event.id);
      window.setTimeout(() => setCopiedId(null), 2000);
    } catch {
      toast('Clipboard unavailable — select the text to copy', 'error');
    }
  };

  const markerDraft =
    voice.interim?.trim() || (voice.listening ? '' : message.trim()) || '';

  const [annotateAttachmentError, setAnnotateAttachmentError] = useState('');

  /**
   * Open the review studio for a sent attachment, then persist the saved
   * review reference with the asset's current markers. A failed link is
   * reported — the review itself stays real saved evidence.
   */
  const annotateAsset = async (asset: MatorChatAsset): Promise<void> => {
    if (!onAnnotateAttachment) return;
    setAnnotateAttachmentError('');
    try {
      const result = await onAnnotateAttachment(
        asset.id,
        markerDraft.slice(0, 1500) || undefined
      );
      if (result?.reviewId && onSaveMarkers) {
        try {
          await onSaveMarkers(asset.id, asset.markers ?? [], result.reviewId);
        } catch {
          throw new Error(
            `Saved as review ${result.reviewId} but could not link to the chat message. Re-open the annotation editor to retry.`
          );
        }
      }
    } catch (cause) {
      setAnnotateAttachmentError(
        cause instanceof Error
          ? cause.message
          : 'Could not open the annotation studio'
      );
    }
  };

  const attachmentFor = (event: MatorChatEvent) => {
    const assets = event.attachments?.length
      ? event.attachments
      : event.attachmentId
        ? [
            {
              id: event.attachmentId,
              name: 'Image',
              mime: 'image/png',
              markers: event.markers,
              reviewId: event.reviewId,
            },
          ]
        : [];
    if (!assets.length) return null;
    return (
      <div data-testid="mator-image-gallery" className="w-full max-w-full">
        <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
          {assets.map((asset) => (
            <MatorAttachmentPreview
              key={asset.id}
              attachmentId={asset.id}
              filename={asset.name}
              mime={asset.mime}
              imageSrc={
                asset.mime.startsWith('image/')
                  ? (attachmentPreviews[asset.id] ??
                    matorAttachmentFileUrl(asset.id))
                  : null
              }
              markers={
                asset.markers ??
                (asset.id === event.attachmentId ? (event.markers ?? []) : [])
              }
              reviewId={
                asset.reviewId ??
                (asset.id === event.attachmentId ? event.reviewId : undefined)
              }
              interactive={Boolean(onSaveMarkers)}
              onMarkersChange={
                onSaveMarkers
                  ? (markers) => onSaveMarkers(asset.id, markers)
                  : undefined
              }
              onAnnotateFull={
                onAnnotateAttachment &&
                annotateChatImageAvailable &&
                asset.mime.startsWith('image/')
                  ? () => annotateAsset(asset)
                  : undefined
              }
            />
          ))}
        </div>
        {annotateAttachmentError && (
          <p
            role="alert"
            data-testid="mator-annotate-attachment-error"
            className="pt-1 text-xs text-rose-700"
          >
            {annotateAttachmentError}
          </p>
        )}
      </div>
    );
  };

  return (
    <aside
      data-testid="automation-right-sidebar"
      className={
        (mobileChatOpen || showChat ? 'flex min-w-0 flex-col ' : 'hidden ') +
        (mobileChatOpen
          ? 'fixed inset-0 z-50 h-dvh w-full bg-[#f5f7f8] p-2 '
          : '') +
        (showChat
          ? 'lg:static lg:z-auto lg:flex lg:h-full lg:min-h-0 lg:w-full lg:overflow-hidden lg:bg-transparent lg:p-0 lg:shadow-none '
          : 'lg:hidden ') +
        (mobileChatOpen ? '' : 'max-lg:hidden')
      }
    >
      <button
        type="button"
        className="mb-2 inline-flex min-h-10 items-center justify-end gap-2 self-end px-2 text-xs font-semibold text-slate-700 lg:hidden"
        onClick={onClose}
        aria-label="Close operator chat"
      >
        Close
        <ChevronRight className="size-4" aria-hidden="true" />
      </button>
      <Card
        data-testid="mator-chat"
        className="flex min-h-0 flex-1 flex-col overflow-hidden border-slate-200/80 bg-white shadow-none"
      >
        {/* ── Soft context row: thread pill · settings · hide ─────────── */}
        <div className="flex shrink-0 items-center gap-1 border-b border-slate-100 px-2.5 pt-2.5 pb-2">
          <Popover
            open={threadOpen}
            onOpenChange={setThreadOpen}
            aria-label="Thread history"
            contentClassName="w-[min(calc(100vw-1.5rem),21rem)]"
            className="min-w-0 flex-1"
            trigger={
              <button
                type="button"
                aria-haspopup="dialog"
                aria-expanded={threadOpen}
                data-testid="mator-thread-pill"
                onClick={() => setThreadOpen((value) => !value)}
                className="group flex min-h-11 min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-2xl bg-slate-50 px-3 py-1.5 text-left transition-colors hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
              >
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-white text-teal-800 ring-1 ring-slate-200">
                  <MessageSquare className="size-3.5" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] leading-4 font-semibold text-slate-800">
                    {threadTitle}
                  </span>
                  <span className="mt-0.5 flex items-center gap-1.5">
                    <Badge tone="outline" size="xs">
                      {PANE_LABEL[pane] ?? 'Thread'}
                    </Badge>
                    <span className="truncate text-[10px] text-slate-400">
                      {threadList.length > 0
                        ? `${threadList.length} thread${threadList.length === 1 ? '' : 's'}`
                        : 'No earlier threads'}
                    </span>
                  </span>
                </span>
              </button>
            }
          >
            <nav
              aria-label="Threads in this workflow"
              data-testid="mator-conversation-switcher"
              className="flex flex-col"
            >
              <div className="flex items-center justify-between px-2 pt-1 pb-1.5">
                <span className="text-[10px] font-bold tracking-wider text-slate-400 uppercase">
                  This workflow
                </span>
                <button
                  type="button"
                  data-testid="mator-new-conversation"
                  disabled={!onNewConversation || busy}
                  onClick={() => {
                    onNewConversation?.();
                    setThreadOpen(false);
                  }}
                  className="inline-flex min-h-11 cursor-pointer items-center gap-1 rounded-full bg-slate-900 px-2.5 text-[11px] font-bold text-white transition-colors hover:bg-teal-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Plus className="size-3" aria-hidden="true" />
                  New chat
                </button>
              </div>
              {threadList.length === 0 ? (
                <p className="px-2 pt-1 pb-2 text-xs text-slate-400">
                  No threads yet — start the first one below.
                </p>
              ) : (
                <ul className="flex max-h-56 flex-col gap-0.5 overflow-y-auto">
                  {threadList.map((item) => {
                    const current = item.id === conversationMeta?.id;
                    return (
                      <li key={item.id}>
                        <button
                          type="button"
                          aria-current={current ? 'true' : undefined}
                          disabled={!onSwitchConversation || current}
                          onClick={() => {
                            onSwitchConversation?.(item.id);
                            setThreadOpen(false);
                          }}
                          className={
                            'flex w-full items-baseline justify-between gap-3 rounded-xl px-2.5 py-2 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:opacity-100 motion-reduce:transition-none ' +
                            (current
                              ? 'bg-slate-100 text-slate-900'
                              : 'text-slate-500 hover:bg-slate-50/80 hover:text-slate-700')
                          }
                        >
                          <span className="min-w-0 flex-1 space-y-0.5">
                            <span className="block truncate text-[13px] font-medium">
                              {item.title || 'Conversation'}
                            </span>
                            <span className="block text-[10px] text-slate-400">
                              {threadWhen(item.createdAt)}
                            </span>
                          </span>
                          {current ? (
                            <Badge tone="teal" size="xs">
                              Now
                            </Badge>
                          ) : (
                            <span className="shrink-0 text-[11px] text-slate-400">
                              {threadWhen(item.updatedAt)}
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
              {showRestore && (
                <div className="border-t border-slate-100 px-2 pt-2 pb-1">
                  <button
                    type="button"
                    data-testid="mator-restore-pipeline"
                    disabled={!onRestorePipeline || busy}
                    onClick={() => {
                      onRestorePipeline?.();
                      setThreadOpen(false);
                    }}
                    className="inline-flex min-h-9 w-full cursor-pointer items-center gap-1.5 rounded-xl px-2 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <RotateCcw className="size-3.5" aria-hidden="true" />
                    Restore pipeline
                  </button>
                </div>
              )}
            </nav>
          </Popover>
          <button
            type="button"
            onClick={onClose}
            aria-label="Hide Mator chat"
            data-testid="mator-hide"
            className="inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
          >
            <ChevronRight className="size-4" aria-hidden="true" />
          </button>
        </div>

        {pane === 'growth' && selectedCraftSlug && (
          <p
            data-testid="active-craft-context"
            className="shrink-0 px-4 pt-1.5 pb-1.5 text-[11px] text-slate-500"
          >
            Craft{' '}
            <button
              type="button"
              onClick={() => onMessageChange('/craft help')}
              className="cursor-pointer font-mono text-slate-700 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
            >
              {selectedCraftSlug}
            </button>
          </p>
        )}

        {/* ── Transcript ─────────────────────────────────────────────── */}
        <MessageScrollerProvider autoScroll defaultScrollPosition="end">
          <MessageScroller>
            <MessageScrollerViewport
              aria-label="Thread history"
              data-testid="mator-thread-viewport"
            >
              <MessageScrollerContent className="gap-4 px-3 py-3">
                {(() => {
                  const rows: ReactNode[] = [];
                  let lastRun: string | null = null;
                  let steps: RunEvent[] = [];
                  const flush = (key: string) => {
                    if (steps.length === 0) return;
                    const runId = steps[0]?.runId ?? null;
                    rows.push(
                      <Checkpoint
                        key={`checkpoint-${key}`}
                        label="Run segment"
                        runId={runId}
                        time={steps[0]?.time ?? null}
                      />
                    );
                    // Screenshot evidence stays clickable for the current run.
                    const capture = steps.find(
                      (event) =>
                        event.kind === 'screenshot' &&
                        typeof event.details?.fileName === 'string' &&
                        /^[a-zA-Z0-9_-]+\.png$/.test(event.details.fileName) &&
                        event.runId === currentRunId
                    );
                    rows.push(
                      <MessageScrollerItem key={`task-${key}`}>
                        <TaskBlock
                          steps={steps}
                          evidence={
                            capture ? (
                              <ScreenshotEvidence
                                event={capture}
                                onAnnotate={onAnnotateCapture}
                              />
                            ) : null
                          }
                        />
                      </MessageScrollerItem>
                    );
                    steps = [];
                  };
                  for (const event of events) {
                    if (lastRun !== null && event.runId !== lastRun) {
                      flush(String(event.id));
                    }
                    lastRun = event.runId;
                    steps.push(event);
                  }
                  flush(String(lastRun ?? 'events'));
                  return rows;
                })()}

                {reviews
                  .filter(
                    (r) =>
                      r.platform === platform &&
                      r.handle.toLowerCase() === normalizedHandle.toLowerCase()
                  )
                  .map((review) => (
                    <MessageScrollerItem
                      key={`review-${review.id}`}
                      messageId={`review-${review.id}`}
                    >
                      <Message>
                        <Avatar className="bg-teal-800 text-white">
                          <AvatarFallback>
                            <Workflow className="size-4" aria-hidden="true" />
                          </AvatarFallback>
                        </Avatar>
                        <MessageContent className="max-w-[min(90%,34rem)] min-w-0 [overflow-wrap:anywhere] break-words">
                          <MessageHeader>
                            Saved visual review · {review.nodeId} node
                          </MessageHeader>
                          <div
                            data-testid="saved-visual-review"
                            className="w-fit max-w-[min(100%,18rem)] overflow-hidden rounded-xl border border-teal-200 bg-teal-50/40"
                          >
                            <div className="flex items-center justify-between gap-2 border-b border-teal-100 bg-teal-50/80 px-3 py-2">
                              <Badge tone="teal" size="xs">
                                {review.regions.length} marked region
                                {review.regions.length === 1 ? '' : 's'}
                              </Badge>
                              <button
                                type="button"
                                onClick={() => onInspectReview(review)}
                                className="inline-flex cursor-pointer items-center gap-1 text-[11px] font-bold text-teal-800 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
                              >
                                Inspect this page
                              </button>
                            </div>
                            <button
                              type="button"
                              onClick={() => onEditReview(review)}
                              aria-label={'Edit annotated image ' + review.id}
                              className="relative block w-full cursor-pointer overflow-hidden bg-slate-50 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
                            >
                              {/* Annotated image + markers */}
                              <ReviewImage
                                review={review}
                                src={reviewImage(review)}
                              />
                              {review.annotations?.length ? (
                                <div className="space-y-1 border-t border-teal-100 bg-white px-3 py-2.5">
                                  {review.annotations.map((a, index) => (
                                    <p
                                      key={a.id}
                                      className="text-[11px] text-slate-600"
                                    >
                                      <strong>
                                        {index + 1}.{' '}
                                        {a.action.replaceAll('-', ' ')}
                                      </strong>
                                      {a.comment ? ' · ' + a.comment : ''}
                                    </p>
                                  ))}
                                  <p className="pt-1 text-[10px] leading-4 text-slate-400">
                                    Tagged instructions are linked to the
                                    workflow; they cannot execute unapproved
                                    browser actions.
                                  </p>
                                </div>
                              ) : (
                                <div className="border-t border-teal-100 bg-white px-3 py-2 text-[10px] text-slate-400">
                                  Earlier image review. Click the image to add
                                  detailed actions and comments.
                                </div>
                              )}
                            </button>
                          </div>
                        </MessageContent>
                      </Message>
                    </MessageScrollerItem>
                  ))}
                {visibleMatorEvents.length === 0 ? (
                  loading ? (
                    <ThreadSkeleton />
                  ) : conversation.some((item) => item.id !== 'seed') ? null : (
                    <div
                      data-testid="mator-empty-thread"
                      className="flex min-h-56 flex-col justify-center gap-4 px-3 py-8"
                    >
                      <div className="flex items-center gap-3">
                        <AssistantAvatar />
                        <div>
                          <p className="text-sm font-semibold text-slate-900">
                            What would you like to do?
                          </p>
                          <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
                            Ask Mator for help with this workflow, or start with
                            a suggestion.
                          </p>
                        </div>
                      </div>
                      <Suggestion
                        suggestions={START_SUGGESTIONS}
                        onSelect={onMessageChange}
                        disabled={busy}
                      />
                    </div>
                  )
                ) : (
                  visibleMatorEvents.map((event) => {
                    if (event.kind === 'message' && event.role === 'user') {
                      return (
                        <ThreadRow key={event.id} id={event.id} side="end">
                          <Message
                            align="end"
                            className="ml-auto w-full justify-end"
                          >
                            <MessageContent className="ml-auto flex w-fit max-w-[min(82%,28rem)] min-w-0 flex-none flex-col items-end">
                              {event.text?.trim() && (
                                <Bubble
                                  variant="muted"
                                  className="ml-auto w-fit max-w-full text-left [overflow-wrap:anywhere] break-words whitespace-pre-wrap"
                                >
                                  <BubbleContent>{event.text}</BubbleContent>
                                </Bubble>
                              )}
                              {attachmentFor(event)}
                            </MessageContent>
                            <Avatar className="bg-slate-800 text-white">
                              <AvatarFallback>ME</AvatarFallback>
                            </Avatar>
                          </Message>
                        </ThreadRow>
                      );
                    }

                    if (event.kind === 'how') {
                      return (
                        <ThreadRow key={event.id} id={event.id}>
                          {!event.text ? null : (
                            <Reasoning
                              className="w-fit max-w-[min(100%,30rem)]"
                              title="Guidance from Mator"
                              content={event.text}
                              speakLabel="Read this guidance aloud"
                              onSpeak={() => voice.speak(event.text!, true)}
                            />
                          )}
                        </ThreadRow>
                      );
                    }

                    if (event.kind === 'message') {
                      return (
                        <ThreadRow key={event.id} id={event.id}>
                          <Message>
                            <AssistantAvatar />
                            <MessageContent className="max-w-[min(90%,34rem)] min-w-0 [overflow-wrap:anywhere] break-words">
                              <MessageHeader>Utomator · Mator</MessageHeader>
                              <MarkdownReply text={event.text ?? ''} />
                              <MessageFooter className="mt-1.5 flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => void copyReply(event)}
                                  aria-label="Copy reply"
                                  className="inline-flex h-7 cursor-pointer items-center gap-1 rounded-lg px-1.5 text-[11px] font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
                                >
                                  {copiedId === event.id ? (
                                    <CircleCheck
                                      className="size-3.5"
                                      aria-hidden="true"
                                    />
                                  ) : (
                                    <ClipboardCopy
                                      className="size-3.5"
                                      aria-hidden="true"
                                    />
                                  )}
                                  {copiedId === event.id ? 'Copied' : 'Copy'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    voice.speak(event.text ?? '', true)
                                  }
                                  aria-label="Hear this reply"
                                  className="inline-flex h-7 cursor-pointer items-center gap-1 rounded-lg px-1.5 text-[11px] font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
                                >
                                  <Volume2
                                    className="size-3.5"
                                    aria-hidden="true"
                                  />
                                  Hear this
                                </button>
                              </MessageFooter>
                            </MessageContent>
                          </Message>
                        </ThreadRow>
                      );
                    }

                    if (event.kind === 'clarify') {
                      const questions = readClarifyQuestions(event.action);
                      const open = openClarify?.id === event.id && questions;
                      return (
                        <ThreadRow key={event.id} id={event.id}>
                          <Message>
                            <Avatar className="bg-teal-50 text-teal-800 ring-1 ring-teal-200">
                              <AvatarFallback>
                                <Workflow
                                  className="size-3.5"
                                  aria-hidden="true"
                                />
                              </AvatarFallback>
                            </Avatar>
                            <MessageContent className="max-w-[min(90%,34rem)] min-w-0 [overflow-wrap:anywhere] break-words">
                              <MessageHeader>Mator</MessageHeader>
                              <div className="flex flex-wrap items-center gap-1.5">
                                <Badge
                                  tone={open ? 'orange' : 'default'}
                                  size="xs"
                                >
                                  {open
                                    ? `Answers needed · ${clarifyCount(questions!)} question${clarifyCount(questions!) === 1 ? '' : 's'}`
                                    : 'Clarified'}
                                </Badge>
                              </div>
                              {event.text && (
                                <Bubble
                                  variant="outline"
                                  className="mt-1 w-fit max-w-full [overflow-wrap:anywhere] break-words"
                                >
                                  <BubbleContent>{event.text}</BubbleContent>
                                </Bubble>
                              )}
                            </MessageContent>
                          </Message>
                        </ThreadRow>
                      );
                    }

                    if (
                      event.kind === 'action' &&
                      typeof event.action === 'object' &&
                      event.action !== null &&
                      'type' in event.action &&
                      (event.action as { type: unknown }).type === 'explain_how'
                    ) {
                      return event.text ? (
                        <ThreadRow key={event.id} id={event.id}>
                          <Reasoning
                            className="w-fit max-w-[min(100%,30rem)]"
                            title="Guidance from Mator"
                            content={event.text}
                            speakLabel="Read this guidance aloud"
                            onSpeak={() => voice.speak(event.text!, true)}
                          />
                        </ThreadRow>
                      ) : null;
                    }

                    if (event.status || event.action) {
                      return (
                        <ThreadRow key={event.id} id={event.id}>
                          <Confirmation
                            className="w-fit max-w-[min(100%,30rem)] min-w-0"
                            status={
                              ((event.status === 'staged'
                                ? (stageResolution(
                                    orderedMatorEvents,
                                    event.id
                                  ) ?? 'staged')
                                : event.status) ?? 'staged') as
                                | 'staged'
                                | 'applied'
                                | 'rejected'
                                | 'incomplete'
                                | 'error'
                            }
                            action={
                              event.action &&
                              typeof event.action === 'object' &&
                              'type' in event.action
                                ? String(
                                    (event.action as { type: unknown }).type
                                  ).replaceAll('_', ' ')
                                : event.text
                                  ? event.text.slice(0, 48)
                                  : null
                            }
                            text={event.action ? event.text : null}
                            attachment={attachmentFor(event)}
                            onConfirm={() => onConfirm(event.id)}
                            onReject={() => onReject?.(event.id)}
                            busy={busy}
                          />
                        </ThreadRow>
                      );
                    }

                    if (event.attachmentId || event.attachments?.length) {
                      return (
                        <ThreadRow key={event.id} id={event.id}>
                          {attachmentFor(event)}
                        </ThreadRow>
                      );
                    }

                    if (event.text) {
                      return (
                        <ThreadRow key={event.id} id={event.id}>
                          <Message>
                            <Avatar
                              className={
                                event.status === 'error'
                                  ? 'bg-rose-700 text-white'
                                  : 'bg-slate-700 text-white'
                              }
                            >
                              <AvatarFallback>
                                {event.status === 'error' ? (
                                  <AlertCircle
                                    className="size-4"
                                    aria-hidden="true"
                                  />
                                ) : (
                                  <Workflow
                                    className="size-4"
                                    aria-hidden="true"
                                  />
                                )}
                              </AvatarFallback>
                            </Avatar>
                            <MessageContent className="max-w-[min(90%,34rem)] min-w-0 [overflow-wrap:anywhere] break-words">
                              <MessageHeader>
                                {(event.kind || 'event').toUpperCase()}
                              </MessageHeader>
                              <Bubble className="w-fit max-w-full [overflow-wrap:anywhere] break-words whitespace-pre-wrap">
                                <BubbleContent>{event.text}</BubbleContent>
                              </Bubble>
                            </MessageContent>
                          </Message>
                        </ThreadRow>
                      );
                    }

                    return null;
                  })
                )}

                {/* Unpersisted command notices remain visible without duplicating stored events. */}
                {visibleMatorEvents.length === 0 &&
                  conversation
                    .filter((item) => item.id !== 'seed')
                    .map((item) => (
                      <MessageScrollerItem
                        key={item.id}
                        messageId={String(item.id)}
                        className={
                          item.sender === 'user'
                            ? 'flex w-full justify-end'
                            : 'w-full'
                        }
                      >
                        <Message
                          align={item.sender === 'user' ? 'end' : 'start'}
                          className={
                            item.sender === 'user'
                              ? 'ml-auto w-full justify-end'
                              : 'mr-auto w-full justify-start'
                          }
                        >
                          {item.sender === 'assistant' && <AssistantAvatar />}
                          <MessageContent
                            className={
                              item.sender === 'user'
                                ? 'ml-auto flex w-fit max-w-[min(82%,28rem)] min-w-0 flex-none flex-col items-end'
                                : 'max-w-[min(90%,34rem)] min-w-0'
                            }
                          >
                            {item.sender === 'user' ? (
                              <Bubble
                                variant="muted"
                                className="ml-auto w-fit max-w-full text-left [overflow-wrap:anywhere] break-words whitespace-pre-wrap"
                              >
                                <BubbleContent>{item.text}</BubbleContent>
                              </Bubble>
                            ) : (
                              <MarkdownReply text={item.text} />
                            )}
                          </MessageContent>
                          {item.sender === 'user' && (
                            <Avatar className="bg-slate-800 text-white">
                              <AvatarFallback>ME</AvatarFallback>
                            </Avatar>
                          )}
                        </Message>
                      </MessageScrollerItem>
                    ))}
              </MessageScrollerContent>
            </MessageScrollerViewport>
            <MessageScrollerButton />
          </MessageScroller>
        </MessageScrollerProvider>

        {/* ── Clarify dialog card (anchored above composer) ───────────── */}
        <AnimatePresence initial={false}>
          {openClarify && clarifyQuestions && (
            <motion.div
              key="clarify-card"
              initial={reduceMotion ? { opacity: 1 } : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? { opacity: 1 } : { opacity: 0, y: 8 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              data-testid="mator-clarify-card"
              className="mx-2 mb-1 shrink-0 rounded-2xl border border-orange-200 bg-white shadow-[0_12px_32px_-16px_rgba(0,0,0,.25)]"
            >
              <div className="flex items-center justify-between gap-2 border-b border-orange-100 bg-orange-50/60 px-3.5 py-2">
                <span className="flex items-center gap-1.5 text-[11px] font-bold tracking-wide text-orange-900 uppercase">
                  <LoaderCircle
                    className="size-3.5 animate-spin"
                    aria-hidden="true"
                  />
                  Mator needs clarity
                </span>
                <Badge tone="orange" size="xs">
                  {clarifyCount(clarifyQuestions)} question
                  {clarifyCount(clarifyQuestions) === 1 ? '' : 's'}
                </Badge>
              </div>
              <div className="px-3.5 py-3">
                <MatorClarifyForm
                  questions={clarifyQuestions}
                  disabled={busy}
                  onUploadFile={onUploadClarifyFile}
                  onSubmit={(text, attachmentIds) =>
                    onSendText?.(text, attachmentIds)
                  }
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {(imageError || chatError) && (
          <div
            role="alert"
            data-testid="mator-chat-error"
            className="mx-3 my-2 flex max-w-[min(100%,30rem)] min-w-0 items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-rose-900"
          >
            <AlertCircle
              className="mt-0.5 size-4 shrink-0"
              aria-hidden="true"
            />
            <div className="min-w-0 text-xs leading-relaxed">
              <p className="font-semibold">
                Mator couldn&apos;t complete that request
              </p>
              <p className="mt-1 [overflow-wrap:anywhere] break-words">
                {chatError &&
                /\b(400|429|5\d\d|groq|bad request)\b/i.test(chatError)
                  ? 'The AI service could not complete the request. Review your chat settings, then retry. Your draft is preserved.'
                  : chatError || imageError}
              </p>
            </div>
          </div>
        )}
        <Queue active={busy} className="px-4 pt-2 pb-0" />

        <MatorComposer
          key={conversationMeta?.id ?? 'no-conversation'}
          voice={voice}
          operatorPendingLabel={operatorPendingLabel}
          onConfirmOperator={onConfirmOperator}
          message={message}
          onMessageChange={onMessageChange}
          onSendMessage={onSendMessage}
          onUploadFile={onUploadClarifyFile}
          onSendText={onSendText}
          onSaveMarkers={onSaveMarkers}
          onAnnotateDraft={
            onAnnotateDraft && annotateChatImageAvailable
              ? onAnnotateDraft
              : undefined
          }
          onPendingAssetsChange={onPendingAssetsChange}
          busy={busy}
          incomplete={incomplete}
          onIncompleteContinue={onIncompleteContinue}
          emptyThread={false}
          models={models}
          modelId={modelId}
          onSettingsSaved={onSettingsSaved}
          onModelChange={(selectedModelId) => {
            void onModelChange?.(selectedModelId).catch((cause: unknown) =>
              toast(
                cause instanceof Error
                  ? cause.message
                  : 'Unable to change chat model',
                'error'
              )
            );
          }}
        />
      </Card>
    </aside>
  );
}

/* Localized evidence rendering — workflow-screenshot test id stays here. */

function ScreenshotEvidence({
  event,
  onAnnotate,
}: {
  event: RunEvent;
  onAnnotate: (runId: string, fileName: string) => void;
}) {
  const fileName = event.details?.fileName ?? '';
  const evidenceUrl = getApi('runs/' + event.runId + '/evidence/' + fileName);
  return (
    <button
      type="button"
      data-testid="workflow-screenshot"
      data-evidence-url={evidenceUrl}
      onClick={() => onAnnotate(event.runId, fileName)}
      aria-label={'Annotate captured image: ' + fileName}
      className="block w-fit max-w-[min(100%,18rem)] cursor-pointer overflow-hidden rounded-xl border border-slate-200 bg-slate-50 text-left transition-colors hover:border-teal-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
    >
      <Image
        unoptimized
        src={evidenceUrl}
        width={640}
        height={400}
        alt={'Actual browser capture: ' + event.message}
        className="max-h-44 w-full object-contain"
      />
      <span className="flex items-center gap-2 px-3 py-2 text-[11px] text-slate-500">
        <ImageIcon className="size-3.5" aria-hidden="true" />
        {fileName} · Click image to annotate
      </span>
    </button>
  );
}
