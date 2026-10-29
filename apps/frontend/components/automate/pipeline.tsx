'use client';

import { useCallback, useState } from 'react';
import { MessageSquareText } from 'lucide-react';
import CraftsLibrary from '@/components/automate/crafts-library';
import VisualReviewPanel, {
  type ImageSource,
  type VisualReviewDraft,
  type VisualAnnotation,
} from '@/components/automate/visual-review-panel';
import { AutomationSettingsPage } from '@/components/automate/owner-pages';
import CareerStudio from '@/components/automate/career-studio';
import AccountStudio, {
  type SocialAccount,
} from '@/components/automate/account-studio';
import ActivityIntelligence from '@/components/automate/activity-intelligence';
import LinkedInResearchStudio from '@/components/automate/linkedin-research-studio';
import LinkedInEditorialStudio from '@/components/automate/linkedin-editorial-studio';

import ConnectorOnboarding, {
  type Connector,
} from '@/components/automate/connector-onboarding';
import { LinkedInIcon, TwitterIcon } from '@/components/svgs';
import { workflows, type Platform } from './pipeline/workflow-catalog';
import PipelineWorkspace from './pipeline/pipeline-workspace';
import { buildRunPayload } from './pipeline/build-run-payload';
import RunHistory from './pipeline/run-history';
import OperatorChatPanel from './pipeline/operator-chat-panel';
import type { Review } from './pipeline/run-models';
import { useRunMonitor } from './pipeline/use-run-monitor';
import { useChatMessages } from './pipeline/use-chat-messages';
import { useOperatorCommands } from './pipeline/use-operator-commands';
import { useWorkflowWorkspace } from './pipeline/use-workflow-workspace';
import RunTrackingDialog from './pipeline/run-tracking-dialog';
import CheckpointDialog from './pipeline/checkpoint-dialog';
import DashboardHeader from './pipeline/dashboard-header';
import { getApi } from './pipeline/api-client';
import DashboardSidebar from './pipeline/dashboard-sidebar';
import {
  useDashboardNavigation,
  type DashboardPane,
} from './pipeline/use-dashboard-navigation';

export default function AutomationPipeline({
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
  const [imageDraft, setImageDraft] = useState<ImageSource | null>(null);
  const [imageError, setImageError] = useState('');

  const [runFormError, setRunFormError] = useState('');
  const { message, setMessage, conversation, setConversation, chatNotice } =
    useChatMessages();
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
      setConversation((previous) => [
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
  const { sendMessage, handleCraftCommand } = useOperatorCommands({
    message,
    setMessage,
    setConversation,
    chatNotice,
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
      activeConnector?.id,
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
  async function attachImage(file?: File) {
    if (!file) return;
    if (
      file.size > 2 * 1024 * 1024 ||
      !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)
    ) {
      setImageError('Choose a PNG, JPEG or WebP file under 2 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setImageDraft({
          kind: 'upload',
          src: reader.result,
          imageData: reader.result,
        });
        setImageError('');
      }
    };
    reader.onerror = () => setImageError('Could not read the selected image');
    reader.readAsDataURL(file);
  }
  function annotateCapture(runId: string, fileName: string) {
    const section = /^audit-(experience|skills|projects|featured)\.png$/.exec(
      fileName
    )?.[1];
    if (section && platform === 'linkedin') setScopeSection(section);
    const src = getApi('runs/' + runId + '/evidence/' + fileName);
    setSelectedNode('annotation');
    setImageDraft({ kind: 'capture', src, runId, fileName });
  }
  async function saveVisualReview(draft: VisualReviewDraft) {
    const response = await fetch(getApi('visual-reviews'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(draft),
    });
    const json = (await response.json()) as {
      error?: string;
      id?: string;
      annotations?: VisualAnnotation[];
    };
    if (!response.ok || !json.id)
      throw new Error(json.error || 'Could not save visual review');
    setImageDraft(null);
    setSelectedNode('annotation');
    setPlanDirty(true);
    setWorkflowPlan((previous) => {
      const id = 'review-' + json.id!.slice(0, 8);
      if (previous.steps.some((step) => step.id === id)) return previous;
      const steps = [...previous.steps];
      const idx = steps.findIndex((step) => step.id === 'action');
      steps.splice(idx, 0, {
        id,
        kind: 'note',
        title: 'Tagged image instruction',
        message:
          'Image review ' +
          json.id +
          ' · ' +
          draft.annotations.length +
          ' location actions; approval still required',
      });
      return {
        ...previous,
        steps,
        links: steps
          .slice(1)
          .map((step, i) => ({ source: steps[i]!.id, target: step.id })),
      };
    });
    setChatVisible(true);
    setConversation((previous) => [
      ...previous,
      {
        id: Date.now(),
        sender: 'assistant',
        text:
          'Tagged ' +
          draft.annotations.length +
          ' annotation(s) to this image and workflow. Review ' +
          json.id +
          ' links each location to its selected action and optional comment. This is an operator-authored plan; no AI model or website action has run. Inspect the live page and explicitly approve any supported edit.',
      },
    ]);
    await refresh();
  }
  function inspectReview(review: Review) {
    choosePlatform(review.platform);
    const part = review.pageUrl.match(
      /\/details\/(experience|skills|projects|featured)\/?$/
    );
    setHandle(review.handle);
    setScopeSection(part?.[1] || 'profile');
    invalidateWorkflowSelection();
    setActiveWorkflow(null);
    setAction('audit-page');
    setSelectedNode('inspect');
    setConfigRequest((value) => value + 1);
    navigatePane('pipeline');
  }
  const reviewImage = (review: Review) =>
    getApi('visual-reviews/' + review.id + '/image');
  const tagExistingReview = (review: Review) => {
    choosePlatform(review.platform);
    setHandle(review.handle);
    setScopeSection(
      review.pageUrl.match(
        /\/details\/(experience|skills|projects|featured)\/?$/
      )?.[1] ?? 'profile'
    );
    setImageDraft({
      kind: 'review',
      src: reviewImage(review),
      reviewId: review.id,
      initialAnnotations: review.annotations,
    });
    setSelectedNode('annotation');
  };
  const latest = events.at(-1);
  const showChat =
    chatVisible &&
    pane !== 'profile' &&
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
          'mx-auto grid w-full max-w-[1920px] grid-cols-1 gap-4 px-4 py-4 md:px-5 lg:min-h-0 lg:flex-1 lg:overflow-hidden ' +
          (showChat
            ? 'lg:grid-cols-[190px_minmax(0,1fr)_300px] 2xl:grid-cols-[220px_minmax(0,1fr)_360px]'
            : 'lg:grid-cols-[190px_minmax(0,1fr)] 2xl:grid-cols-[220px_minmax(0,1fr)]')
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
          {pane === 'profile' && (
            <AccountStudio
              view={
                pathname.endsWith('/details')
                  ? 'details'
                  : pathname.endsWith('/connections')
                    ? 'connections'
                    : 'overview'
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

          {pane === 'settings' && (
            <AutomationSettingsPage
              available={available}
              platform={platform}
              selectedAccount={activeConnector}
            />
          )}
        </main>
        <OperatorChatPanel
          pane={pane}
          selectedCraftSlug={selectedCraftSlug}
          mobileChatOpen={mobileChatOpen}
          showChat={showChat}
          onClose={() => {
            setChatVisible(false);
            setMobileChatOpen(false);
          }}
          onOpenTracking={() => setTrackingOpen(true)}
          conversation={conversation}
          events={events}
          reviews={reviews}
          platform={platform}
          normalizedHandle={normalizedHandle}
          currentRunId={currentRunId}
          onAnnotateCapture={annotateCapture}
          onEditReview={tagExistingReview}
          onInspectReview={inspectReview}
          reviewImage={reviewImage}
          imageError={imageError}
          message={message}
          onMessageChange={setMessage}
          onSendMessage={sendMessage}
          onAttachImage={attachImage}
          checkpoint={checkpoint}
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
            (chatVisible ? 'lg:hidden' : '') +
            (mobileChatOpen ? ' hidden' : '')
          }
        >
          <MessageSquareText className="size-5" />
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
          onClose={() => setImageDraft(null)}
          onSave={saveVisualReview}
        />
      )}
    </div>
  );
}
