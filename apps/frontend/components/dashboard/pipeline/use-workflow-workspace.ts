'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import type { WorkflowPlan } from '../workflows/workflow-plan-editor';
import type { Platform } from './workflow-catalog';
import { getApi } from './api-client';
import { defaultWorkflowPlan, newWorkflowDraft } from './default-workflow-plan';

export type WorkflowRecord = {
  id: string;
  ownerId: 'local-owner';
  templateId: string | null;
  revision: number;
  createdAt: string;
  updatedAt: string;
  plan: WorkflowPlan;
};

export function useWorkflowWorkspace({
  busy,
  setRunFormError,
}: {
  busy: boolean;
  setRunFormError: Dispatch<SetStateAction<string>>;
}) {
  const [platform, setPlatform] = useState<Platform>('linkedin');
  const [action, setAction] = useState('audit');
  const [handle, setHandle] = useState('');
  const [form, setForm] = useState<Record<string, string>>({});
  const [workflowPlan, setWorkflowPlan] =
    useState<WorkflowPlan>(defaultWorkflowPlan);
  const [templatePlans, setTemplatePlans] = useState<WorkflowPlan[]>([]);
  const [selectedGrowthTemplateId, setSelectedGrowthTemplateId] = useState<
    string | null
  >(null);
  const [savedWorkflows, setSavedWorkflows] = useState<WorkflowRecord[]>([]);
  const [activeWorkflow, setActiveWorkflow] = useState<WorkflowRecord | null>(
    null
  );
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [loadingWorkflow, setLoadingWorkflow] = useState(false);
  const workflowSelectionEpoch = useRef(0);
  const savedListEpoch = useRef(0);
  const [planDirty, setPlanDirty] = useState(false);
  const [planSaving, setPlanSaving] = useState(false);
  const formDirty =
    JSON.stringify(form) !== JSON.stringify(workflowPlan.parameters ?? {});
  useEffect(() => {
    let live = true;
    const generation = savedListEpoch.current;
    void fetch(getApi('workflows'), { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw Error('Saved workflows unavailable');
        const records = (await response.json()) as WorkflowRecord[];
        if (!live || savedListEpoch.current !== generation) return;
        setSavedWorkflows(records);
      })
      .catch(() => {
        if (live)
          setRunFormError(
            'Saved workflows unavailable. Check the local automation API.'
          );
      });
    return () => {
      live = false;
    };
  }, [setRunFormError]);
  useEffect(() => {
    let live = true;
    setTemplatePlans([]);
    const controller = new AbortController();
    void fetch(getApi('workflow-templates/' + platform), {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (result) => {
        if (!result.ok) throw Error('Template catalogue not available');
        const plans = (await result.json()) as WorkflowPlan[];
        if (live) setTemplatePlans(plans);
      })
      .catch(() => {
        if (live) setTemplatePlans([]);
      });
    return () => {
      live = false;
      controller.abort();
    };
  }, [platform]);
  async function saveWorkflowPlan(): Promise<void> {
    if (busy) throw Error('Stop the active workflow before saving');
    if (loadingWorkflow)
      throw Error('Wait until the selected workflow finishes loading');
    if (planSaving) throw Error('A workflow save is already running');
    const selection = workflowSelectionEpoch.current;
    setPlanSaving(true);
    try {
      const value = { ...workflowPlan, parameters: { ...form } };
      const response = await fetch(
        getApi(activeWorkflow ? 'workflows/' + activeWorkflow.id : 'workflows'),
        {
          method: activeWorkflow ? 'PUT' : 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(
            activeWorkflow
              ? { plan: value, expectedRevision: activeWorkflow.revision }
              : { plan: value }
          ),
        }
      );
      const json = (await response.json()) as WorkflowRecord & {
        error?: string;
      };
      if (!response.ok) throw Error(json.error ?? 'Could not save workflow');
      savedListEpoch.current++;
      setSavedWorkflows((previous) => [
        ...previous.filter((item) => item.id !== json.id),
        json,
      ]);
      if (selection === workflowSelectionEpoch.current) {
        setWorkspaceOpen(true);
        setActiveWorkflow(json);
        setWorkflowPlan(json.plan);
        setPlanDirty(false);
        setRunFormError('');
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Workflow save failed';
      setRunFormError(message);
      throw Error(message);
    } finally {
      setPlanSaving(false);
    }
  }
  async function applyGrowthTemplate(id: string): Promise<void> {
    if (busy)
      throw Error(
        'Stop the current Runner workflow before loading a Growth template'
      );
    if (platform !== 'linkedin')
      throw Error('Growth template requires LinkedIn');
    const response = await fetch(
      getApi('growth/templates/' + encodeURIComponent(id)),
      { cache: 'no-store' }
    );
    const program = (await response.json()) as {
      id?: string;
      stages?: unknown[];
      error?: string;
    };
    if (
      !response.ok ||
      program.id !== id ||
      !Array.isArray(program.stages) ||
      program.stages.length === 0
    )
      throw Error(
        program.error ||
          'Growth YAML did not compile into a connected pipeline graph'
      );
    setSelectedGrowthTemplateId(id);
    setWorkspaceOpen(true);
  }
  async function applyTemplate(
    plan: WorkflowPlan,
    templateId: string
  ): Promise<void> {
    setSelectedGrowthTemplateId(null);
    if (busy)
      throw Error(
        'Stop or finish the active workflow before changing templates'
      );
    if (plan.platform !== platform)
      throw Error(
        'Select the matching studio account before applying this template'
      );
    if (planSaving) throw Error('A workflow save is already running');
    const selection = ++workflowSelectionEpoch.current;
    setPlanSaving(true);
    setRunFormError('');
    try {
      const response = await fetch(getApi('workflows'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ plan, templateId }),
      });
      const saved = (await response.json()) as WorkflowRecord & {
        error?: string;
      };
      if (!response.ok)
        throw Error(saved.error || 'The selected workflow could not be saved');
      savedListEpoch.current++;
      setSavedWorkflows((previous) => [
        ...previous.filter((item) => item.id !== saved.id),
        saved,
      ]);
      if (selection === workflowSelectionEpoch.current) {
        setWorkspaceOpen(true);
        setAction(saved.plan.action);
        setActiveWorkflow(saved);
        setWorkflowPlan(saved.plan);
        setForm(saved.plan.parameters ?? {});
        setPlanDirty(false);
        setLoadingWorkflow(false);
      }
    } finally {
      setPlanSaving(false);
    }
  }
  async function openActionWorkflow(
    nextAction: string,
    parameters: Record<string, string> = {}
  ): Promise<void> {
    if (busy) throw Error('Stop the active workflow before changing actions');
    if (planSaving) throw Error('Wait for the current workflow to finish saving');
    if (
      workspaceOpen &&
      !selectedGrowthTemplateId &&
      (planDirty || formDirty)
    )
      throw Error('Save or discard the current workflow edits first');

    const selection = ++workflowSelectionEpoch.current;
    setLoadingWorkflow(true);
    setRunFormError('');
    try {
      const response = await fetch(
        getApi('workflow-plans/' + platform + '/' + encodeURIComponent(nextAction)),
        { cache: 'no-store' }
      );
      const result = (await response.json()) as WorkflowPlan & {
        error?: string;
      };
      if (
        !response.ok ||
        result.platform !== platform ||
        result.action !== nextAction ||
        !Array.isArray(result.steps)
      )
        throw Error(result.error || 'The selected action workflow is unavailable');
      if (selection !== workflowSelectionEpoch.current) return;
      setSelectedGrowthTemplateId(null);
      setActiveWorkflow(null);
      setAction(nextAction);
      setWorkflowPlan(result);
      setForm({ ...(result.parameters ?? {}), ...parameters });
      setPlanDirty(Object.keys(parameters).length > 0);
      setWorkspaceOpen(true);
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : 'Could not open the action workflow';
      if (selection === workflowSelectionEpoch.current)
        setRunFormError(message);
      throw Error(message);
    } finally {
      if (selection === workflowSelectionEpoch.current)
        setLoadingWorkflow(false);
    }
  }

  function beginNewWorkflow() {
    if (busy || planSaving) return;
    workflowSelectionEpoch.current++;
    setSelectedGrowthTemplateId(null);
    setActiveWorkflow(null);
    const draft = newWorkflowDraft(platform);
    setAction(draft.action);
    setWorkflowPlan(draft);
    setForm({});
    setPlanDirty(true);
    setRunFormError('');
    setLoadingWorkflow(false);
    setWorkspaceOpen(true);
  }

  function closeWorkspace() {
    if (busy) return;
    workflowSelectionEpoch.current++;
    setSelectedGrowthTemplateId(null);
    setActiveWorkflow(null);
    setPlanDirty(false);
    setRunFormError('');
    setWorkspaceOpen(false);
  }

  function selectSavedWorkflow(id: string | null) {
    setSelectedGrowthTemplateId(null);
    workflowSelectionEpoch.current++;
    if (id === null) {
      setWorkspaceOpen(false);
      setActiveWorkflow(null);
      setPlanDirty(false);
      setRunFormError('');
      return;
    }
    const selected = savedWorkflows.find((item) => item.id === id);
    if (!selected) return;
    setWorkspaceOpen(true);
    setLoadingWorkflow(false);
    setActiveWorkflow(selected);
    setPlatform(selected.plan.platform);
    setAction(selected.plan.action);
    setWorkflowPlan(selected.plan);
    setForm(selected.plan.parameters ?? {});
    setPlanDirty(false);
    setRunFormError('');
  }

  const invalidateWorkflowSelection = useCallback(() => {
    workflowSelectionEpoch.current++;
  }, []);

  return {
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
    workspaceOpen,
    setWorkspaceOpen,
    beginNewWorkflow,
    openActionWorkflow,
    closeWorkspace,
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
  };
}
