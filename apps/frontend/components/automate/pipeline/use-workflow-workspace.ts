'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import type { WorkflowPlan } from '../workflow-plan-editor';
import type { Platform } from './workflow-catalog';
import { getApi } from './api-client';
import { defaultWorkflowPlan } from './default-workflow-plan';

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
        if (live && savedListEpoch.current === generation)
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
  useEffect(() => {
    if (activeWorkflow) {
      setLoadingWorkflow(false);
      return;
    }
    setLoadingWorkflow(true);
    let live = true;
    const controller = new AbortController();
    void fetch(getApi('workflow-plans/' + platform + '/' + action), {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw Error('Saved workflow could not be loaded');
        const plan = (await response.json()) as WorkflowPlan;
        if (live) {
          setWorkflowPlan(plan);
          setForm(plan.parameters ?? {});
          setPlanDirty(false);
          setLoadingWorkflow(false);
        }
      })
      .catch((error) => {
        if (
          live &&
          !(error instanceof DOMException && error.name === 'AbortError')
        ) {
          setRunFormError(
            'Saved workflow unavailable. Check the local automation API.'
          );
          setLoadingWorkflow(false);
        }
      });
    return () => {
      live = false;
      controller.abort();
    };
  }, [platform, action, activeWorkflow, setRunFormError]);
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
  function selectSavedWorkflow(id: string | null) {
    setSelectedGrowthTemplateId(null);
    workflowSelectionEpoch.current++;
    if (id === null) {
      setActiveWorkflow(null);
      setPlanDirty(false);
      setRunFormError('');
      return;
    }
    const selected = savedWorkflows.find((item) => item.id === id);
    if (!selected) return;
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
