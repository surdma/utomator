'use client';

import { useEffect, useRef, type FormEvent } from 'react';
import Image from 'next/image';
import {
  Activity,
  AlertCircle,
  Workflow,
  X,
  ImageIcon,
  Paperclip,
  Crosshair,
  Focus,
  Send,
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
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/automate-card';
import { timeLabel, short } from './presentation-utils';
import { getApi } from './api-client';
import type { DashboardPane } from './dashboard-route';
import type {
  ChatMessage,
  Event as RunEvent,
  Review,
  Checkpoint,
} from './run-models';
import type { Platform } from './workflow-catalog';

type Props = {
  pane: DashboardPane;
  selectedCraftSlug: string | null;
  mobileChatOpen: boolean;
  showChat: boolean;
  onClose: () => void;
  onOpenTracking: () => void;
  conversation: ChatMessage[];
  events: RunEvent[];
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
  onAttachImage: (file?: File) => void | Promise<void>;
  checkpoint: Checkpoint | null;
};

export default function OperatorChatPanel({
  pane,
  selectedCraftSlug,
  mobileChatOpen,
  showChat,
  onClose,
  onOpenTracking,
  conversation,
  events,
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
  onAttachImage,
  checkpoint,
}: Props) {
  const logRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    logRef.current?.scrollTo({
      top: logRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [events, conversation, checkpoint]);
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
      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <CardHeader className="flex flex-row items-start justify-between gap-3 border-b border-slate-100">
          <div>
            <CardTitle>Mator</CardTitle>
            <CardDescription>Your local operator conversation</CardDescription>
          </div>
          <div className="flex items-center gap-1">
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
            className="min-h-[260px] flex-1 space-y-3 overflow-y-auto pr-1 lg:min-h-0"
            ref={logRef}
            role="log"
            aria-live="polite"
          >
            {conversation.map((item) => (
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
          {imageError && (
            <p role="alert" className="mt-2 text-xs text-rose-700">
              {imageError}
            </p>
          )}
          <form
            onSubmit={onSendMessage}
            className="mt-4 flex items-end gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-2 focus-within:ring-2 focus-within:ring-teal-600/20"
          >
            <label htmlFor="operatorMessage" className="sr-only">
              Structured command
            </label>
            <textarea
              id="operatorMessage"
              className="max-h-28 min-h-[46px] flex-1 resize-y bg-transparent px-2 py-2 text-sm outline-none placeholder:text-slate-400"
              rows={1}
              placeholder="Try: audit · set headline: ... · add skill: ..."
              value={message}
              onChange={(event) => onMessageChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
            />
            <label
              title="Attach a PNG, JPEG or WebP image"
              className="flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-teal-50"
            >
              <Paperclip className="size-4" />
              <input
                aria-label="Attach image to chat"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="sr-only"
                onChange={(e) => {
                  void onAttachImage(e.target.files?.[0]);
                  e.currentTarget.value = '';
                }}
              />
            </label>
            <Button
              type="submit"
              variant="primary"
              aria-label="Send structured command"
            >
              <Send className="size-4" />
            </Button>
          </form>
        </CardContent>
      </Card>
    </aside>
  );
}
