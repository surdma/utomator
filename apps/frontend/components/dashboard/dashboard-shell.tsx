'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import type { ChatMessage } from './pipeline/run-models';
import { MessageSquare } from 'lucide-react';
import CraftsLibrary from '@/components/dashboard/crafts/crafts-library';
import VisualReviewPanel from '@/components/dashboard/reviews/visual-review-panel';
import CareerStudio from '@/components/dashboard/career/career-studio';
import AccountHome, {
  type SocialAccount,
} from '@/components/dashboard/account/account-home';
import ActivityIntelligence from '@/components/dashboard/intelligence/activity-intelligence';
import LinkedInResearchStudio from '@/components/dashboard/research/linkedin-research-studio';
import LinkedInEditorialStudio from '@/components/dashboard/editorial/linkedin-editorial-studio';

import ConnectorOnboarding, {
  type Connector,
} from '@/components/dashboard/connections/connector-onboarding';
import { LinkedInIcon, TwitterIcon } from '@/components/svgs';
import { workflows, type Platform } from './pipeline/workflow-catalog';
import PipelineWorkspace from './pipeline/pipeline-workspace';
import { buildRunPayload } from './pipeline/build-run-payload';
import RunHistory from './pipeline/run-history';
import OperatorChatPanel from './pipeline/operator-chat-panel';
import { useRunMonitor } from './pipeline/use-run-monitor';
import { collectRunSpeechUpdates } from './pipeline/mator-run-speech';
import { useVisualReviews, imageDataUrlFromBlob } from './pipeline/use-visual-reviews';
import {
  appendVisualReviewStep,
  reviewSection,
  validateReviewImage,
  REVIEW_IMAGE_ERROR,
} from './pipeline/visual-review-model';
import { matorAttachmentFileUrl } from './pipeline/mator-api';
import { useMatorChat } from './pipeline/use-mator-chat';
import { useOperatorCommands } from './pipeline/use-operator-commands';
import { useVoiceSession } from './pipeline/use-voice-session';
import { useVoiceOnlyPreference } from './pipeline/mator-voice-preference';
import { useWorkflowWorkspace } from './pipeline/use-workflow-workspace';
import RunTrackingDialog from './pipeline/run-tracking-dialog';
import CheckpointDialog from './pipeline/checkpoint-dialog';
import DashboardHeader from './pipeline/dashboard-header';
import DashboardSidebar from './pipeline/dashboard-sidebar';
import {
  useDashboardNavigation,
  type DashboardPane,
} from './pipeline/use-dashboard-navigation';

export default function DashboardShell({
  initialPane = 'pipeline',
}: {
  initialPane?: DashboardPane;
}) {
  const {
    pathname,
    pane,
    setPane,
    mobileMenu,
    setMobileMenu,
    selectedCraftId,
    selectedCraftSlug,
    libraryView,
    navigate,
    navigatePane,
    navigateSubpage,
    navigateCraft,
    navigateCraftView,
  } = useDashboardNavigation(initialPane);
  const [activeConnector, setActiveConnector] = useState<Connector | null>(
    null
  );
  const [connectorRequest, setConnectorRequest] = useState<string | null>(null);
  const [connectorOpenSignal, setConnectorOpenSignal] = useState(0);
  const [trackingOpen, setTrackingOpen] = useState(false);
  const [chatVisible, setChatVisible] = useState(true);
  const [configRequest, setConfigRequest] = useState(0);
  const [mobileChatOpen, setMobileChatOpen] = useState(false);
  const [craftsRevision, setCraftsRevision] = useState(0);
  const [, setSelectedNode] = useState('inspect');
  const [scopeSection, setScopeSection] = useState('profile');

  const [runFormError, setRunFormError] = useState('');
  const setConversationRef = useRef<
    (next: ChatMessage[] | ((previous: ChatMessage[]) => ChatMessage[])) => void
  >(() => {});
  const {
    available,
    playbook,
    assessment,
    runs,
    active,
    events,
    checkpoint,
    checkpointError,
    inputReply,
    setInputReply,
    reviews,
    currentRunId,
    refresh,
    startMonitoredRun,
    selectRun,
    pauseRun,
    resumeRun,
    act,
    cancelRun,
  } = useRunMonitor(
    (text) =>
      setConversationRef.current((previous) => [
        ...previous,
        { id: Date.now(), sender: 'assistant', text },
      ]),
    (text) => setRunFormError(text)
  );
  const busy = Boolean(
    active &&
    ['running', 'paused', 'input-needed', 'approval-needed'].includes(
      active.state
    )
  );
  const {
    platform,
    setPlatform,
    handle,
    setHandle,
    action,
    setAction,
    form,
    setForm,
    workflowPlan,
    setWorkflowPlan,
    templatePlans,
    selectedGrowthTemplateId,
    setSelectedGrowthTemplateId,
    savedWorkflows,
    activeWorkflow,
    setActiveWorkflow,
    loadingWorkflow,
    planDirty,
    setPlanDirty,
    planSaving,
    formDirty,
    saveWorkflowPlan,
    applyGrowthTemplate,
    applyTemplate,
    selectSavedWorkflow,
    invalidateWorkflowSelection,
  } = useWorkflowWorkspace({ busy, setRunFormError });
  function selectSocialAccount(account: SocialAccount) {
    setConnectorRequest(account.id);
    setConnectorOpenSignal((value) => value + 1);
    setMobileMenu(false);
  }
  const selected =
    workflows[platform].find((workflow) => workflow.id === action) ||
    workflows[platform][0];
  const normalizedHandle = handle.trim().replace(/^@/, '');
  const profilePage =
    activeConnector?.platform === platform &&
    activeConnector.handle.toLowerCase() === normalizedHandle.toLowerCase()
      ? activeConnector.profileUrl
      : '';
  const selectedPage =
    profilePage && platform === 'linkedin' && scopeSection !== 'profile'
      ? profilePage.replace(/\/$/, '') + '/details/' + scopeSection + '/'
      : profilePage;
  const pageOptions =
    platform === 'linkedin'
      ? ['profile', 'experience', 'skills', 'projects', 'featured']
      : ['profile'];

  const connectorReady =
    activeConnector?.platform === platform &&
    activeConnector.status === 'connected';
  const PlatformIcon = platform === 'linkedin' ? LinkedInIcon : TwitterIcon;
  const platformLabel = platform === 'linkedin' ? 'LinkedIn' : 'X';
  const submitRef = useRef<(text: string, source: 'voice' | 'text') => void>(
    () => {}
  );
  const pendingAssetsRef = useRef(false);
  const voice = useVoiceSession({
    onFinal: (text) => submitRef.current(text, 'voice'),
  });
  const voiceOnly = useVoiceOnlyPreference();
  const voiceScopeRef = useRef<string | null>(null);
  const spokenRunRef = useRef<{ runId: string | null; seen: Set<number> }>({ runId: null, seen: new Set() });
  const {
    message,
    setMessage,
    conversation,
    setConversation,
    chatNotice,
    send,
    sendMessage: sendMatorMessage,
    confirmStage,
    rejectStage,
    newConversation,
    switchConversation,
    restorePipeline,
    uploadForClarify,
    saveMarkers,
    attachmentPreviews,
    loading: matorLoading,
    settingsToggles,
    patchSettings,
    syncSettingsFromComposer,
    conversations: matorConversations,
    conversationMeta,
    events: matorEvents,
    incomplete,
    incompleteContinue,
    error: matorError,
    pending: matorPending,
  } = useMatorChat({
    workflowId: activeWorkflow?.id ?? null,
    onSpeakHow: (text) => voice.speak(text),
    onSpeakReply: (text) => voice.speak(text),
    voiceOnly,
  });

  // A reply from a previous workflow/thread must never be delivered in the new scope.
  useEffect(() => {
    const scope = `${activeWorkflow?.id ?? ''}:${conversationMeta?.id ?? ''}`;
    if (voiceScopeRef.current !== null && voiceScopeRef.current !== scope) {
      voice.cancelPendingTranscript();
    }
    voiceScopeRef.current = scope;
  }, [activeWorkflow?.id, conversationMeta?.id, voice]);

  // Runner SSE events, not the YAML plan, are the authority for spoken status.
  // Changes of run identity seed the history so navigating to an old run is silent.
  useEffect(() => {
    const tracker = spokenRunRef.current;
    if (!currentRunId) {
      tracker.runId = null;
      tracker.seen.clear();
      return;
    }
    if (tracker.runId !== currentRunId) {
      tracker.runId = currentRunId;
      tracker.seen = new Set(events.filter((item) => item.runId === currentRunId).map((item) => item.id));
      return;
    }
    const summaries = collectRunSpeechUpdates(events, currentRunId, tracker.seen);
    if (voiceOnly && settingsToggles.howTtsEnabled && summaries.length) {
      voice.speak(summaries.join(' '));
    }
  }, [currentRunId, events, voiceOnly, settingsToggles.howTtsEnabled, voice]);

  const {
    sendMessage: sendOperatorMessage,
    submitUtterance,
    confirmPending,
    pendingLabel: operatorPendingLabel,
    handleCraftCommand,
  } = useOperatorCommands({
    message,
    setMessage,
    setConversation,
    chatNotice,
    // Operator craft/memory replies may speak; Mator how TTS is separate via onSpeakHow.
    onSpeak: voice.speak,
    platform,
    accountId: activeConnector?.id ?? null,
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
  });
  useEffect(() => {
    setConversationRef.current = setConversation;
  }, [setConversation]);

  const routeUtterance = useCallback(
    (text: string, source: 'voice' | 'text') => {
      const request = text.trim();
      if (!request) return;
      // Dictation in text mode edits the draft. Voice-only stop sends
      // automatically unless the user is composing a captioned asset message.
      if (source === 'voice' && (!voiceOnly || pendingAssetsRef.current)) {
        setMessage((current) => [current.trim(), request].filter(Boolean).join(' '));
        return;
      }
      // Never TTS the user transcript (voice or typed).
      if (
        request.startsWith('/craft') ||
        request === 'crafts' ||
        request === 'memory' ||
        request.startsWith('inspect')
      ) {
        submitUtterance(request, source);
        return;
      }
      // Voice and text use the same persistent conversation. Missing storage
      // is reported by the Mator hook rather than silently routing to a local command.
      if (source === 'voice') setMessage(request);
      void send(request);
    },
    [send, setMessage, submitUtterance, voiceOnly]
  );

  const sendMessage = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (matorPending) return;
    if (
      message.trim().startsWith('/craft') ||
      ['crafts', 'memory'].includes(message.trim()) ||
      message.trim().startsWith('inspect')
    ) {
      sendOperatorMessage(event);
      return;
    }
    sendMatorMessage(event);
  };

  const confirmChat = (eventId?: string) => {
    if (eventId) void confirmStage(eventId);
  };

  const rejectChat = (eventId?: string) => {
    if (eventId) void rejectStage(eventId);
  };

  const restoreMatorPipelineUi = async () => {
    try {
      await restorePipeline(false);
    } catch (err) {
      const text = err instanceof Error ? err.message : '';
      if (/dirty|409|confirm/i.test(text)) {
        const ok =
          typeof window !== 'undefined' &&
          window.confirm(
            'Live pipeline has unsaved changes. Restore this conversation’s pipeline anyway?'
          );
        if (ok) await restorePipeline(true);
        return;
      }
      throw err;
    }
  };

  useEffect(() => {
    submitRef.current = routeUtterance;
  }, [routeUtterance]);
  const onConnectorSelect = useCallback(
    (account: Connector) => {
      if (account.platform !== 'linkedin') return;
      // Connecting or resyncing the same account must not discard a template
      // that the user already loaded and configured offline.
      const switchingAccount = Boolean(
        activeConnector?.id && activeConnector.id !== account.id
      );
      const switchingPlatform = platform !== account.platform;
      setActiveConnector(account);
      setPlatform(account.platform);
      setHandle(account.handle);
      if (!switchingAccount && !switchingPlatform) return;
      // Switching identities or platforms intentionally resets any account-specific form.
      invalidateWorkflowSelection();
      setActiveWorkflow(null);
      setAction('audit');
      setForm({});
      setScopeSection('profile');
      setConnectorRequest(null);
    },
    [
      activeConnector,
      platform,
      invalidateWorkflowSelection,
      setAction,
      setActiveWorkflow,
      setForm,
      setHandle,
      setPlatform,
    ]
  );
  function choosePlatform(next: Platform) {
    invalidateWorkflowSelection();
    setActiveWorkflow(null);
    setPlatform(next);
    setAction('audit');
    setForm({});
    setScopeSection('profile');
    setActiveConnector(null);
    setHandle('');
  }
  function chooseAction(next: string) {
    setSelectedGrowthTemplateId(null);
    invalidateWorkflowSelection();
    setActiveWorkflow(null);
    setAction(next);
    setForm({});
    setRunFormError('');
    navigatePane('pipeline');
    setMobileMenu(false);
  }
  async function startRun() {
    const payload = buildRunPayload({
      loadingWorkflow,
      activeWorkflow,
      planDirty,
      formDirty,
      activeConnector,
      platform,
      action,
      workflowPlan,
      form,
      selectedPage,
      fields: selected.fields,
    });
    await startMonitoredRun(payload, action, platform);
  }
  async function launchRun() {
    setRunFormError('');
    try {
      await startRun();
    } catch (error) {
      const detail =
        error instanceof Error ? error.message : 'Unable to start run';
      setRunFormError(detail);
      chatNotice(detail);
    }
  }
  /** Reads chat image bytes and guards the pipeline page scope for the review studio. */
  async function buildChatAnnotationSource(
    request: import('./pipeline/use-visual-reviews').ChatAnnotationRequest
  ): Promise<{ imageDataUrl: string } | null> {
    if (!normalizedHandle.trim() || !selectedPage.trim()) {
      throw new Error(
        'Open a pipeline account page before annotating chat images as YAML reviews'
      );
    }
    if (request.file) {
      const invalid = validateReviewImage(request.file);
      if (invalid) throw new Error(invalid);
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          if (typeof reader.result === 'string') {
            resolve({ imageDataUrl: reader.result });
            return;
          }
          reject(new Error('Could not read the chosen image'));
        };
        reader.onerror = () =>
          reject(new Error('Could not read the chosen image'));
        reader.readAsDataURL(request.file!);
      });
    }
    if (request.attachmentId) {
      const response = await fetch(matorAttachmentFileUrl(request.attachmentId));
      if (!response.ok) {
        throw new Error('Attachment bytes are unavailable for annotation');
      }
      const blob = await response.blob();
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(blob.type || '')) {
        throw new Error(REVIEW_IMAGE_ERROR);
      }
      return {
        imageDataUrl: await imageDataUrlFromBlob(blob, blob.type),
      };
    }
    throw new Error('Choose an image to annotate');
  }
  const {
    imageDraft,
    closeImageDraft,
    imageError,
    annotateCapture,
    annotateChatAsset,
    saveVisualReview,
    inspectReview,
    tagExistingReview,
    reviewImage,
  } = useVisualReviews({
    platform,
    annotateChatImage: buildChatAnnotationSource,
    onCaptureSection: setScopeSection,
    onSelectedNode: setSelectedNode,
    onReviewSaved: (id, annotationCount) => {
      setPlanDirty(true);
      setWorkflowPlan((previous) =>
        appendVisualReviewStep(previous, id, annotationCount)
      );
      setChatVisible(true);
      setConversation((previous) => [
        ...previous,
        {
          id: Date.now(),
          sender: 'assistant',
          text:
            'Tagged ' +
            annotationCount +
            ' annotation(s) to this image and workflow. Review ' +
            id +
            ' links each location to its selected action and optional comment. This is an operator-authored plan; no AI model or website action has run. Inspect the live page and explicitly approve any supported edit.',
        },
      ]);
    },
    onInspectReview: (review) => {
      choosePlatform(review.platform);
      setHandle(review.handle);
      setScopeSection(reviewSection(review.pageUrl));
      invalidateWorkflowSelection();
      setActiveWorkflow(null);
      setAction('audit-page');
      setSelectedNode('inspect');
      setConfigRequest((value) => value + 1);
      navigatePane('pipeline');
    },
    onSelectReviewAccount: (review) => {
      choosePlatform(review.platform);
      setHandle(review.handle);
      setScopeSection(reviewSection(review.pageUrl));
    },
    refresh,
  });
  // Full YAML-driven annotation entry points for chat images. The studio
  // resolves with the created review id; linking to the chat asset happens
  // through the standard markers PATCH (evidence is the saved review).
  const annotateMatorDraft = async (file: File) =>
    annotateChatAsset({ file });
  const annotateMatorAttachment = async (attachmentId: string) =>
    annotateChatAsset({ attachmentId });
  const latest = events.at(-1);
  const showChat =
    chatVisible &&
    pane !== 'profile' &&
    pane !== 'settings' &&
    pane !== 'resumes' &&
    (pane !== 'growth' || libraryView !== 'catalog');
  return (
    <div
      data-automate
      className="flex min-h-dvh flex-col bg-[#f5f7f8] font-sans text-slate-900 lg:fixed lg:inset-0 lg:z-40 lg:h-dvh lg:overflow-hidden"
    >
      <DashboardHeader
        available={available}
        mobileMenu={mobileMenu}
        onToggleNavigation={() => {
          setMobileMenu(!mobileMenu);
          setMobileChatOpen(false);
        }}
        onOpenTracking={() => setTrackingOpen(true)}
        onRefresh={() => void refresh()}
      />
      {(mobileMenu || mobileChatOpen) && (
        <button
          type="button"
          aria-label="Close side panel"
          onClick={() => {
            setMobileMenu(false);
            setMobileChatOpen(false);
          }}
          className="fixed inset-0 z-40 bg-slate-950/40 lg:hidden"
        />
      )}
      <div
        className={
          'mx-auto grid w-full max-w-[1920px] grid-cols-1 gap-5 px-4 py-5 md:px-6 lg:min-h-0 lg:flex-1 lg:overflow-hidden ' +
          (showChat
            ? 'lg:grid-cols-[220px_minmax(0,1fr)_minmax(360px,420px)] xl:grid-cols-[232px_minmax(0,1fr)_440px]'
            : 'lg:grid-cols-[220px_minmax(0,1fr)] xl:grid-cols-[232px_minmax(0,1fr)]')
        }
      >
        <DashboardSidebar
          pane={pane}
          mobileMenu={mobileMenu}
          onClose={() => setMobileMenu(false)}
          onNavigate={(next) => {
            navigatePane(next);
            setMobileMenu(false);
          }}
        />
        <main
          data-testid="automation-main-scroll"
          className="min-w-0 space-y-5 lg:min-h-0 lg:overflow-y-auto lg:overscroll-contain lg:pr-2"
        >
          <ConnectorOnboarding
            activeId={activeConnector?.id || null}
            onSelect={onConnectorSelect}
            requestedId={connectorRequest}
            onManageProfile={() =>
              navigateSubpage('/dashboard/profile/connections')
            }
            hideTrigger
            openSignal={connectorOpenSignal}
          />
          <PipelineWorkspace
            pane={pane}
            workflowPlan={workflowPlan}
            templatePlans={templatePlans}
            selectedGrowthTemplateId={selectedGrowthTemplateId}
            connectorReady={connectorReady}
            activeConnector={activeConnector}
            applyGrowthTemplate={applyGrowthTemplate}
            setSelectedGrowthTemplateId={setSelectedGrowthTemplateId}
            chooseAction={chooseAction}
            platform={platform}
            action={action}
            events={events}
            active={active}
            busy={busy}
            planDirty={planDirty}
            formDirty={formDirty}
            planSaving={planSaving}
            savedWorkflows={savedWorkflows}
            activeWorkflow={activeWorkflow}
            selectSavedWorkflow={selectSavedWorkflow}
            configRequest={configRequest}
            setWorkflowPlan={setWorkflowPlan}
            setPlanDirty={setPlanDirty}
            applyTemplate={applyTemplate}
            saveWorkflowPlan={saveWorkflowPlan}
            cancelRun={cancelRun}
            runFormError={runFormError}
            annotateCapture={annotateCapture}
            form={form}
            setForm={setForm}
            selected={selected}
            scopeSection={scopeSection}
            setScopeSection={setScopeSection}
            pageOptions={pageOptions}
            selectedPage={selectedPage}
            profilePage={profilePage}
            setSelectedNode={setSelectedNode}
            platformLabel={platformLabel}
            available={available}
            loadingWorkflow={loadingWorkflow}
            launchRun={launchRun}
            resumeRun={resumeRun}
            pauseRun={pauseRun}
            setConnectorOpenSignal={setConnectorOpenSignal}
            PlatformIcon={PlatformIcon}
          />
          {pane === 'history' && (
            <RunHistory
              runs={runs}
              onSelect={(run) => {
                selectRun(run);
                navigatePane('pipeline');
              }}
            />
          )}
          {pane === 'growth' && (
            <CraftsLibrary
              selectedId={selectedCraftId}
              onSelected={navigateCraft}
              view={libraryView}
              onView={navigateCraftView}
              onBack={() => navigatePane('growth')}
              onChat={(text) => {
                if (text.startsWith('/craft')) {
                  void handleCraftCommand(text);
                } else chatNotice(text);
              }}
              revision={craftsRevision}
            />
          )}
          {(pane === 'profile' || pane === 'settings') && (
            <AccountHome
              pathname={pathname}
              pane={pane}
              available={available}
              selectedAccount={
                activeConnector
                  ? {
                      platform: activeConnector.platform,
                      label: activeConnector.label,
                      handle: activeConnector.handle,
                      profileUrl: activeConnector.profileUrl,
                      status: activeConnector.status,
                    }
                  : null
              }
              onNavigate={navigateSubpage}
              onSelectAccount={selectSocialAccount}
              linkedAccountId={activeConnector?.id}
              onConnect={() => {
                setConnectorRequest(null);
                setConnectorOpenSignal((value) => value + 1);
              }}
            />
          )}
          {pane === 'resumes' && (
            <CareerStudio
              mode={
                pathname === '/dashboard/resumes/profile'
                  ? 'profile'
                  : 'resumes'
              }
              onNavigate={navigateSubpage}
            />
          )}
          {(pane === 'memory' || pane === 'observer') && (
            <ActivityIntelligence
              initialView={pane}
              onNavigate={(path) => {
                navigate(path);
                setPane(
                  path.endsWith('/dashboard/observer') ? 'observer' : 'memory'
                );
              }}
            />
          )}
          {pane === 'research' && <LinkedInResearchStudio />}
          {pane === 'editorial' && <LinkedInEditorialStudio />}
        </main>
        <OperatorChatPanel
          pane={pane}
          selectedCraftSlug={selectedCraftSlug}
          mobileChatOpen={mobileChatOpen}
          showChat={showChat}
          onClose={() => {
            voice.cancelPendingTranscript();
            setChatVisible(false);
            setMobileChatOpen(false);
          }}
          conversation={conversation}
          events={events}
          matorEvents={matorEvents}
          conversations={matorConversations}
          conversationMeta={conversationMeta}
          loading={matorLoading}
          modelId={settingsToggles.modelId ?? null}
          onModelChange={(modelId) => patchSettings({ modelId })}
          onSettingsSaved={syncSettingsFromComposer}
          onSwitchConversation={(id) => {
            voice.cancelPendingTranscript();
            void switchConversation(id);
          }}
          onNewConversation={() => {
            voice.cancelPendingTranscript();
            void newConversation();
          }}
          onRestorePipeline={() => void restoreMatorPipelineUi()}
          onSendText={(text, attachmentIds) => send(text, attachmentIds)}
          onUploadClarifyFile={uploadForClarify}
          attachmentPreviews={attachmentPreviews}
          onSaveMarkers={(attachmentId, markers, reviewId) =>
            void saveMarkers(attachmentId, markers, reviewId)
          }
          reviews={reviews}
          platform={platform}
          normalizedHandle={normalizedHandle}
          selectedPage={selectedPage}
          annotateChatImageAvailable={Boolean(selectedPage && normalizedHandle)}
          onAnnotateDraft={annotateMatorDraft}
          onAnnotateAttachment={annotateMatorAttachment}
          currentRunId={currentRunId}
          onAnnotateCapture={annotateCapture}
          onEditReview={tagExistingReview}
          onInspectReview={inspectReview}
          reviewImage={reviewImage}
          imageError={imageError}
          message={message}
          onMessageChange={setMessage}
          onSendMessage={sendMessage}
          onPendingAssetsChange={(count) => {
            pendingAssetsRef.current = count > 0;
          }}
          checkpoint={checkpoint}
          voice={voice}
          operatorPendingLabel={operatorPendingLabel}
          onConfirmOperator={confirmPending}
          onConfirm={confirmChat}
          onReject={rejectChat}
          busy={matorPending}
          incomplete={Boolean(incomplete)}
          onIncompleteContinue={() => void incompleteContinue()}
          chatError={matorError}
        />
      </div>

      <RunTrackingDialog
        open={trackingOpen}
        onDismiss={() => setTrackingOpen(false)}
        active={active}
        playbook={playbook}
        assessment={assessment}
        latest={latest}
      />
      <CheckpointDialog
        checkpoint={checkpoint}
        checkpointError={checkpointError}
        inputReply={inputReply}
        onInputChange={setInputReply}
        onDecision={act}
        onCancel={cancelRun}
      />
      {pane !== 'profile' && pane !== 'resumes' && (
        <button
          type="button"
          aria-label="Open Mator"
          onClick={() => {
            setChatVisible(true);
            setMobileChatOpen(true);
          }}
          className={
            'fixed right-5 bottom-24 z-30 inline-flex min-h-12 items-center gap-2 rounded-full bg-slate-950 px-5 text-sm font-bold text-white shadow-2xl ring-2 ring-white/80 hover:bg-teal-800 focus-visible:outline-2 focus-visible:outline-teal-600 lg:bottom-5 ' +
            (showChat ? 'lg:hidden' : '') +
            (mobileChatOpen ? ' hidden' : '')
          }
        >
          <MessageSquare className="size-5" aria-hidden="true" />
          Mator
        </button>
      )}
      {imageDraft && (
        <VisualReviewPanel
          source={imageDraft}
          platform={platform}
          handle={normalizedHandle}
          pageUrl={selectedPage}
          nodeId="annotation"
          onClose={closeImageDraft}
          onSave={saveVisualReview}
        />
      )}
    </div>
  );
}
