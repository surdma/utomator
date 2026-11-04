'use client';

import { MessageSquare } from 'lucide-react';
import {
  type FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import AccountHome, {
  type SocialAccount,
} from '@/components/dashboard/account/account-home';
import CareerStudio from '@/components/dashboard/career/career-studio';
import ActivityIntelligence from '@/components/dashboard/career/intelligence/activity-intelligence';
import ConnectorOnboarding, {
  type Connector,
} from '@/components/dashboard/connections/connector-onboarding';
import CraftsLibrary from '@/components/dashboard/crafts/crafts-library';
import LinkedInEditorialStudio from '@/components/dashboard/editorial/linkedin-editorial-studio';
import LinkedInResearchStudio from '@/components/dashboard/research/linkedin-research-studio';
import VisualReviewPanel from '@/components/dashboard/reviews/visual-review-panel';
import { matorAttachmentFileUrl } from '@/components/mator/mator-api';
import { collectRunSpeechUpdates } from '@/components/mator/mator-run-speech';
import { useVoiceOnlyPreference } from '@/components/mator/mator-voice-preference';
import OperatorChatPanel from '@/components/mator/operator-chat-panel';
import { useMatorAiCall } from '@/components/mator/use-mator-ai-call';
import { useMatorChat } from '@/components/mator/use-mator-chat';
import {
  imageDataUrlFromBlob,
  useVisualReviews,
} from '@/components/mator/use-visual-reviews';
import { useVoiceSession } from '@/components/mator/use-voice-session';
import { LinkedInIcon, TwitterIcon } from '@/components/svgs';
import { buildRunPayload } from './pipeline/build-run-payload';
import CheckpointDialog from './pipeline/checkpoint-dialog';
import DashboardBottomNav from './pipeline/dashboard-bottom-nav';
import DashboardHeader from './pipeline/dashboard-header';
import DashboardSidebar from './pipeline/dashboard-sidebar';
import PipelineWorkspace from './pipeline/pipeline-workspace';
import RunHistory from './pipeline/run-history';
import type { ChatMessage } from './pipeline/run-models';
import {
  type DashboardPane,
  useDashboardNavigation,
} from './pipeline/use-dashboard-navigation';
import { useOperatorCommands } from './pipeline/use-operator-commands';
import { useRunMonitor } from './pipeline/use-run-monitor';
import { useWorkflowWorkspace } from './pipeline/use-workflow-workspace';
import {
  appendVisualReviewStep,
  reviewSection,
  validateReviewImage,
} from './pipeline/visual-review-model';
import { type Platform, workflows } from './pipeline/workflow-catalog';

export default function DashboardShell({
  initialPane = 'workspace',
}: {
  initialPane?: DashboardPane;
}) {
  const {
    pathname,
    pane,
    setPane,
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
    null,
  );
  const [connectorRequest, setConnectorRequest] = useState<string | null>(null);
  const [connectorOpenSignal, setConnectorOpenSignal] = useState(0);
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
    (text) => setRunFormError(text),
  );
  const busy = Boolean(
    active &&
      ['running', 'paused', 'input-needed', 'approval-needed'].includes(
        active.state,
      ),
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
    workspaceOpen,
    setWorkspaceOpen,
    savedWorkflows,
    beginNewWorkflow,
    openActionWorkflow,
    selectSavedWorkflow,
    closeWorkspace,
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
    invalidateWorkflowSelection,
  } = useWorkflowWorkspace({ busy, setRunFormError });
  function selectSocialAccount(account: SocialAccount) {
    setConnectorRequest(account.id);
    setConnectorOpenSignal((value) => value + 1);
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
      ? `${profilePage.replace(/\/$/, '')}/details/${scopeSection}/`
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
    () => {},
  );
  const pendingAssetsRef = useRef(false);
  const voice = useVoiceSession({
    onFinal: (text) => submitRef.current(text, 'voice'),
  });
  const voiceOnly = useVoiceOnlyPreference();
  const callActiveRef = useRef(false);
  const voiceScopeRef = useRef<string | null>(null);
  const spokenRunRef = useRef<{ runId: string | null; seen: Set<number> }>({
    runId: null,
    seen: new Set(),
  });
  const {
    message,
    setMessage,
    conversation,
    setConversation,
    chatNotice,
    send,
    sendCallTurn,
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
    onSpeakHow: (text) => {
      if (!callActiveRef.current) voice.speak(text);
    },
    onSpeakReply: (text) => {
      if (!callActiveRef.current) voice.speak(text);
    },
    voiceOnly,
  });

  const aiCall = useMatorAiCall({
    workflowId: activeWorkflow?.id ?? null,
    conversationId: conversationMeta?.id ?? null,
    voiceOnly,
    voice,
    sendTurn: sendCallTurn,
  });
  useEffect(() => {
    callActiveRef.current = aiCall.active;
  }, [aiCall.active]);

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
      tracker.seen = new Set(
        events
          .filter((item) => item.runId === currentRunId)
          .map((item) => item.id),
      );
      return;
    }
    const summaries = collectRunSpeechUpdates(
      events,
      currentRunId,
      tracker.seen,
    );
    if (
      voiceOnly &&
      !aiCall.active &&
      settingsToggles.howTtsEnabled &&
      summaries.length
    ) {
      voice.speak(summaries.join(' '));
    }
  }, [
    currentRunId,
    events,
    voiceOnly,
    aiCall.active,
    settingsToggles.howTtsEnabled,
    voice,
  ]);

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
    setSelectedNode,
    onStageWorkflow: openActionWorkflow,
  });
  useEffect(() => {
    setConversationRef.current = setConversation;
  }, [setConversation]);

  const routeUtterance = useCallback(
    (text: string, source: 'voice' | 'text') => {
      const request = text.trim();
      if (!request) return;
      // The text-mode mic only dictates. AI Call owns its separate turn loop.
      if (source === 'voice') {
        setMessage((current) =>
          [current.trim(), request].filter(Boolean).join(' '),
        );
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
      // The call's microphone does not come through this text-input route.
      void send(request);
    },
    [send, setMessage, submitUtterance],
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
    if (eventId)
      void confirmStage(eventId).then((ok) => {
        if (ok) void aiCall.approvalResolved(eventId, 'confirm');
      });
  };

  const rejectChat = (eventId?: string) => {
    if (eventId)
      void rejectStage(eventId).then((ok) => {
        if (ok) void aiCall.approvalResolved(eventId, 'reject');
      });
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
            'Live pipeline has unsaved changes. Restore this conversation’s pipeline anyway?',
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
        activeConnector?.id && activeConnector.id !== account.id,
      );
      const switchingPlatform = platform !== account.platform;
      setActiveConnector(account);
      setPlatform(account.platform);
      setHandle(account.handle);
      if (!switchingAccount && !switchingPlatform) return;
      // Switching identities or platforms intentionally resets any account-specific form.
      invalidateWorkflowSelection();
      setActiveWorkflow(null);
      setWorkspaceOpen(false);
      setSelectedGrowthTemplateId(null);
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
      setWorkspaceOpen,
      setSelectedGrowthTemplateId,
      setForm,
      setHandle,
      setPlatform,
    ],
  );
  function choosePlatform(next: Platform) {
    invalidateWorkflowSelection();
    setActiveWorkflow(null);
    setWorkspaceOpen(false);
    setSelectedGrowthTemplateId(null);
    setPlatform(next);
    setAction('audit');
    setForm({});
    setScopeSection('profile');
    setActiveConnector(null);
    setHandle('');
  }
  function chooseAction(next: string) {
    void openActionWorkflow(next).catch((reason) => {
      const message =
        reason instanceof Error
          ? reason.message
          : 'Unable to load action workflow';
      setRunFormError(message);
      chatNotice(message);
    });
    navigatePane('workspace');
  }
  async function startRun() {
    if (!workspaceOpen || selectedGrowthTemplateId) {
      throw Error('Choose an executable workflow before starting a run');
    }
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
    request: import('@/components/mator/use-visual-reviews').ChatAnnotationRequest,
  ): Promise<{ imageDataUrl: string } | null> {
    if (!normalizedHandle.trim() || !selectedPage.trim()) {
      throw new Error(
        'Open a pipeline account page before annotating chat images as YAML reviews',
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
      const response = await fetch(
        matorAttachmentFileUrl(request.attachmentId),
      );
      if (!response.ok) {
        throw new Error('Attachment bytes are unavailable for annotation');
      }
      const blob = await response.blob();
      const invalid = validateReviewImage({
        size: blob.size,
        type: blob.type || '',
      });
      if (invalid) throw new Error(invalid);
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
        appendVisualReviewStep(previous, id, annotationCount),
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
      navigatePane('workspace');
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
  const annotateMatorDraft = async (file: File, note?: string) =>
    annotateChatAsset({ file, note });
  const annotateMatorAttachment = async (attachmentId: string, note?: string) =>
    annotateChatAsset({ attachmentId, note });
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
        onRefresh={() => void refresh()}
        onOpenHistory={() => navigatePane('history')}
        onOpenAccount={() => navigatePane('profile')}
      />
      <div
        className={
          'mx-auto grid w-full max-w-[1920px] grid-cols-1 gap-5 px-4 pt-5 pb-28 md:px-6 lg:min-h-0 lg:flex-1 lg:overflow-hidden lg:pb-5 ' +
          (showChat
            ? 'lg:grid-cols-[220px_minmax(0,1.7fr)_minmax(16rem,1fr)] xl:grid-cols-[232px_minmax(0,1.7fr)_minmax(16rem,1fr)]'
            : 'lg:grid-cols-[220px_minmax(0,1fr)] xl:grid-cols-[232px_minmax(0,1fr)]')
        }
      >
        <DashboardSidebar pane={pane} onNavigate={navigatePane} />
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
            workspaceOpen={workspaceOpen}
            savedWorkflows={savedWorkflows}
            beginNewWorkflow={beginNewWorkflow}
            selectSavedWorkflow={selectSavedWorkflow}
            closeWorkspace={closeWorkspace}
            connectorReady={connectorReady}
            activeConnector={activeConnector}
            applyGrowthTemplate={applyGrowthTemplate}
            chooseAction={chooseAction}
            platform={platform}
            action={action}
            events={events}
            active={active}
            busy={busy}
            planDirty={planDirty}
            formDirty={formDirty}
            planSaving={planSaving}
            activeWorkflow={activeWorkflow}
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
                navigatePane('workspace');
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
                  path.endsWith('/dashboard/observer') ? 'observer' : 'memory',
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
            aiCall.end();
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
            aiCall.end();
            voice.cancelPendingTranscript();
            void switchConversation(id);
          }}
          onNewConversation={() => {
            aiCall.end();
            voice.cancelPendingTranscript();
            void newConversation();
          }}
          onRestorePipeline={() => void restoreMatorPipelineUi()}
          onSendText={(text, attachmentIds) => send(text, attachmentIds)}
          onUploadClarifyFile={uploadForClarify}
          attachmentPreviews={attachmentPreviews}
          onSaveMarkers={(attachmentId, markers, reviewId) => {
            return saveMarkers(attachmentId, markers, reviewId);
          }}
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
          call={aiCall}
          callReady={Boolean(activeWorkflow?.id && conversationMeta?.id)}
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
      <DashboardBottomNav
        pane={pane}
        onNavigate={navigatePane}
        showRun={pane === 'workspace' && !selectedGrowthTemplateId}
        active={active}
        platform={platform}
        action={action}
        busy={busy}
        available={available}
        connectorReady={connectorReady}
        loadingWorkflow={loadingWorkflow}
        workflowPlan={workflowPlan}
        activeWorkflow={activeWorkflow}
        planDirty={planDirty}
        formDirty={formDirty}
        resumeRun={resumeRun}
        pauseRun={pauseRun}
        launchRun={launchRun}
        cancelRun={cancelRun}
        chatOpen={mobileChatOpen}
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
            mobileChatOpen
              ? 'hidden'
              : 'fixed right-4 bottom-32 z-30 inline-flex min-h-12 items-center gap-2 rounded-full bg-slate-950 px-5 text-sm font-bold text-white shadow-2xl ring-2 ring-white/80 hover:bg-teal-800 focus-visible:outline-2 focus-visible:outline-teal-600 lg:bottom-5 ' +
                (showChat ? 'lg:hidden' : '')
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
