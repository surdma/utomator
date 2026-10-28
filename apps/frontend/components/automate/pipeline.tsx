"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  Activity, AlertCircle, ArrowRight, BookOpen, Check, CheckCircle2, Compass, ExternalLink, FileText, GitBranch, History, Menu, MessageSquareText, Play, Pause, Plus, RotateCcw, Send, Sparkles, Workflow, X, Eye, Layers3, Settings2, UserRound, ImageIcon, Paperclip, Crosshair, Focus, NotebookPen
} from "lucide-react";
import { Message, MessageAvatar, MessageContent, MessageFooter, MessageHeader } from "@/components/ui/message";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/automate-card";
import StudioDialog from "@/components/ui/studio-dialog";
import WorkflowPlanEditor, {type WorkflowPlan} from "@/components/automate/workflow-plan-editor";
import GrowthProfilePipelines from "@/components/automate/growth-profile-pipelines";
import CraftsLibrary, { type Craft as AgentCraft } from "@/components/automate/crafts-library";
import VisualReviewPanel, { type ImageSource, type VisualReviewDraft, type Region, type VisualAnnotation } from "@/components/automate/visual-review-panel";
import { AutomationSettingsPage } from "@/components/automate/owner-pages";
import CareerStudio from "@/components/automate/career-studio";
import AccountStudio, { type SocialAccount } from "@/components/automate/account-studio";
import ActivityIntelligence from "@/components/automate/activity-intelligence";
import LinkedInResearchStudio from "@/components/automate/linkedin-research-studio";
import LinkedInEditorialStudio from "@/components/automate/linkedin-editorial-studio";

import ConnectorOnboarding, { type Connector } from "@/components/automate/connector-onboarding";
import { LinkedInIcon, TwitterIcon } from "@/components/svgs";

type Platform = "linkedin" | "x";
type WorkflowRecord = {id:string;ownerId:"local-owner";templateId:string|null;
  revision:number;createdAt:string;updatedAt:string;plan:WorkflowPlan};
type State = "running" | "paused" | "approval-needed" | "input-needed" | "completed" | "blocked" | "failed" | "cancelled";
type Event = { id: number; runId: string; time: string; kind: string; message: string;
  details?: { checkpointId?: string; fileName?: string; title?: string; headline?: string | null;
    bio?: string | null; xName?: string | null; url?: string; excerpt?: string; section?: string } };
type Run = { id: string; platform: Platform; action: string; state: State; createdAt: string; error?: string };
type Field = { key: string; label: string; multiline?: boolean; placeholder?: string; required?: boolean; max?: number };
type Workflow = { id: string; title: string; category: string; fields: Field[] };
type Coverage = { id: string; label: string; platform: Platform; status: "implemented" | "manual" | "reference"; source: string; note: string };
type Playbook = { source: string; reviewed: string; stages: string[]; guardrails: string[]; recommended: { headline: string | null; about: string | null }; sections: string[]; coverage: Coverage[]; artifacts: { scripts: string[]; snapshots: string[]; screenshots: string[]; rootSnapshots: string[] } };
type Assessment = { runId: string; comparisons: Array<{ field: string; observed: string | null; proposed: string | null; status: string }>; notice: string };
type Review = { id: string; createdAt: string; platform: Platform; handle: string; pageUrl: string; nodeId: string;
  note: string; regions: Region[]; annotations?: VisualAnnotation[];
  source: {kind: "capture"; runId: string; fileName: string} | {kind:"upload"} | {kind:"review";reviewId:string} };


const workflows: Record<Platform, Workflow[]> = {
  linkedin: [
    { id: "audit", title: "Profile audit", category: "Inspect", fields: [] },
    { id: "audit-page", title: "Inspect selected page", category: "Inspect", fields: [] },
    { id: "edit-profile", title: "Headline & About", category: "Profile", fields: [{ key: "headline", label: "Headline", max: 220 }, { key: "about", label: "About", multiline: true, max: 2600 }] },
    { id: "edit-experience", title: "Experience", category: "Profile", fields: [{ key: "positionId", label: "Existing LinkedIn position ID", required: true }, { key: "description", label: "Experience description", multiline: true, required: true }, { key: "startMonth", label: "Start month (optional)" }, { key: "startYear", label: "Start year (optional)" }] },
    { id: "add-skill", title: "Add skill", category: "Profile", fields: [{ key: "skill", label: "Exact skill", required: true }] },
    { id: "edit-website", title: "Contact website", category: "Profile", fields: [{ key: "website", label: "HTTPS website", required: true }, { key: "websiteIndex", label: "Row index (0–9)", placeholder: "0" }, { key: "websiteType", label: "Website type (optional)" }] },
    { id: "edit-services", title: "Services", category: "Profile", fields: [{ key: "description", label: "Services description", multiline: true, required: true }] },
    { id: "add-project", title: "Add project", category: "Showcase", fields: [{ key: "projectName", label: "Project name", required: true }, { key: "description", label: "Contribution and outcome", required: true, multiline: true }, { key: "projectUrl", label: "Optional media URL" }] },
    { id: "add-featured", title: "Featured link", category: "Showcase", fields: [{ key: "projectUrl", label: "HTTPS destination", required: true }, { key: "featuredTitle", label: "Featured title", required: true }] },
  ],
  x: [
    { id: "audit", title: "Profile audit", category: "Inspect", fields: [] },
    { id: "audit-page", title: "Inspect selected page", category: "Inspect", fields: [] },
    { id: "edit-profile", title: "Bio & contact", category: "Profile", fields: [{ key: "bio", label: "Bio", multiline: true, max: 160 }, { key: "location", label: "Location" }, { key: "website", label: "HTTPS website" }] },
    { id: "upload-banner", title: "Upload banner", category: "Profile", fields: [{ key: "bannerPath", label: "Local image in apps/backend/assets", required: true }] },
    { id: "compose-post", title: "Publish one post", category: "Content", fields: [{ key: "postText", label: "Post text", required: true, multiline: true, max: 280 }] },
    { id: "pin-post", title: "Pin post", category: "Content", fields: [{ key: "postUrl", label: "Exact post URL", required: true }] },
    { id: "delete-post", title: "Delete one post", category: "Content", fields: [{ key: "postUrl", label: "Exact authored post URL", required: true }] },
  ],
};
const iconsByAction: Record<string, typeof Eye> = {
  audit: Eye, "audit-page": Focus, "edit-profile": FileText, "edit-experience": Layers3, "add-skill": Sparkles,
  "edit-website": ExternalLink, "edit-services": Activity, "add-project": GitBranch,
  "add-featured": BookOpen, "upload-banner": FileText, "compose-post": MessageSquareText,
  "pin-post": Layers3, "delete-post": AlertCircle,
};
const getApi = (path: string) => "/api/" + path;
function stateLabel(state: string) { return state.replaceAll("-", " "); }
function timeLabel(time: string) {
  return new Date(time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}
function short(id: string) { return id.slice(0, 8); }
function explainCommand(value: string): { action: string; fields: Record<string, string>; note: string } | null {
  const text = value.trim();
  if (/^(audit|inspect|review)(?:\s+(?:my\s+)?profile)?[.!]?$/i.test(text)) {
    return { action: "audit", fields: {}, note: "Read-only audit prepared. Start the run to collect current profile evidence." };
  }
  const headline = text.match(/^(?:set|update|draft)\s+(?:my\s+)?headline\s*:\s*([\s\S]+)$/i);
  if (headline) return { action: "edit-profile", fields: { headline: headline[1].trim() }, note: "Headline staged for review. No change has been published." };
  const skill = text.match(/^(?:add)\s+(?:the\s+)?skill\s*:\s*([\s\S]+)$/i);
  if (skill) return { action: "add-skill", fields: { skill: skill[1].trim() }, note: "Skill selected. LinkedIn will confirm the exact catalog entry." };
  const post = text.match(/^(?:draft|compose)\s+(?:a\s+)?post\s*:\s*([\s\S]+)$/i);
  if (post) return { action: "compose-post", fields: { postText: post[1].trim() }, note: "Post staged. Publishing still requires your explicit approval." };
  return null;
}

export default function AutomationPipeline({ initialPane = "pipeline" }: { initialPane?: "pipeline" | "history" | "profile" | "resumes" | "observer" | "memory" | "research" | "editorial" | "growth" | "settings" | "crafts" }) {
  const [platform, setPlatform] = useState<Platform>("linkedin");
  const [action, setAction] = useState("audit");
  const [handle, setHandle] = useState("");
  const [form, setForm] = useState<Record<string, string>>({});
  const [activeConnector,setActiveConnector]=useState<Connector|null>(null);
  const [connectorRequest,setConnectorRequest]=useState<string|null>(null);
  const [connectorOpenSignal,setConnectorOpenSignal]=useState(0);
  const [pane, setPane] = useState<"pipeline" | "history" | "crafts" | "profile" | "resumes" | "observer" | "memory" | "research" | "editorial" | "growth" | "settings">(initialPane);
  const pathname=usePathname();
  const [trackingOpen, setTrackingOpen] = useState(false);
  const [chatVisible, setChatVisible] = useState(true);
  const [configRequest,setConfigRequest] = useState(0);
  const [workflowPlan,setWorkflowPlan] = useState<WorkflowPlan>(()=>({
    version:1,platform:"linkedin",action:"audit",name:"Profile audit",
    steps:[
      {id:"start",kind:"start",title:"Start run"},
      {id:"session",kind:"session",title:"Authenticated browser"},
      {id:"inspect",kind:"inspect",title:"Inspect current page"},
      {id:"action",kind:"action",title:"Inspect page"},
      {id:"verify",kind:"verify",title:"Observe final page"},
      {id:"finish",kind:"finish",title:"Final output"},
    ],
    links:[{source:"start",target:"session"},{source:"session",target:"inspect"},
      {source:"inspect",target:"action"},{source:"action",target:"verify"},
      {source:"verify",target:"finish"}],
  }));
  const [templatePlans,setTemplatePlans]=useState<WorkflowPlan[]>([]);
  const [savedWorkflows,setSavedWorkflows]=useState<WorkflowRecord[]>([]);
  const [activeWorkflow,setActiveWorkflow]=useState<WorkflowRecord|null>(null);
  const [loadingWorkflow,setLoadingWorkflow]=useState(false);
  const workflowSelectionEpoch=useRef(0);
  const savedListEpoch=useRef(0);
  const [planDirty,setPlanDirty]=useState(false);
  const [planSaving,setPlanSaving]=useState(false);
  const [mobileChatOpen,setMobileChatOpen]=useState(false);
  const [selectedCraftId, setSelectedCraftId] = useState<string | null>(null);
  const [selectedCraftSlug, setSelectedCraftSlug] = useState<string | null>(null);
  const [craftsRevision, setCraftsRevision] = useState(0);
  const [selectedNode, setSelectedNode] = useState("inspect");
  const [scopeSection, setScopeSection] = useState("profile");
  const [reviews, setReviews] = useState<Review[]>([]);
  const [imageDraft, setImageDraft] = useState<ImageSource | null>(null);
  const [imageError, setImageError] = useState("");

  const [mobileMenu, setMobileMenu] = useState(false);
  const [available, setAvailable] = useState<"checking" | "ready" | "offline">("checking");
  const [playbook, setPlaybook] = useState<Playbook | null>(null);
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [active, setActive] = useState<Run | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [checkpoint, setCheckpoint] = useState<{ kind: "approval" | "input"; id: string; message: string } | null>(null);
  const [checkpointError,setCheckpointError] = useState("");
  const [runFormError,setRunFormError] = useState("");
  const [inputReply, setInputReply] = useState("");
  const [message, setMessage] = useState("");
  const [conversation, setConversation] = useState<Array<{ id: number; sender: "user" | "assistant"; text: string }>>([
    { id: 1, sender: "assistant", text: "Your automation pipeline is ready. Choose a workflow, or type a structured command. I can stage approved actions and explain the run, but no AI model is connected." },
  ]);
  const streamRef = useRef<EventSource | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const currentRunRef = useRef<string | null>(null);
  const libraryView=pathname.endsWith("/source")?"source":(pathname.startsWith("/dashboard/growth/")||pathname.startsWith("/dashboard/crafts/"))?"visual":"catalog";
  useEffect(()=>{
    if(pathname.startsWith("/dashboard/growth/")||pathname.startsWith("/dashboard/crafts/")){
      const id=pathname.split("/")[3];
      setPane("growth");
      setSelectedCraftId(id||null);
    }else if(pathname==="/dashboard/crafts")setPane("growth");
    else if(pathname==="/dashboard/history")setPane("history");
    else if(pathname.startsWith("/dashboard/profile"))setPane("profile");
    else if(pathname.startsWith("/dashboard/resumes"))setPane("resumes");
    else if(pathname==="/dashboard/observer")setPane("observer");
    else if(pathname==="/dashboard/memory")setPane("memory");
    else if(pathname==="/dashboard/research")setPane("research");
    else if(pathname==="/dashboard/editorial")setPane("editorial");
    else if(pathname==="/dashboard/growth")setPane("growth");
    else if(pathname==="/dashboard/settings")setPane("settings");
    else if(pathname==="/dashboard/pipeline")setPane("pipeline");
  },[pathname]);
  function navigate(path:string){
    if(typeof window!=="undefined"&&window.location.pathname!==path)window.history.pushState(null,"",path);
  }
  function navigatePane(next:"pipeline"|"history"|"crafts"|"profile"|"resumes"|"observer"|"memory"|"research"|"editorial"|"growth"|"settings"){
    if(next!==pane && typeof document!=="undefined" && document.querySelector('[data-career-dirty="true"]') && !window.confirm("Discard unsaved career edits?"))return;
    setPane(next);
    navigate(next==="pipeline"?"/dashboard/pipeline":"/dashboard/"+next);
  }
  function navigateSubpage(path:string){
    if(typeof document!=="undefined"&&document.querySelector('[data-career-dirty="true"]')&&!window.confirm("Discard unsaved career edits?"))return;
    setPane(path.startsWith("/dashboard/resumes")?"resumes":"profile");
    navigate(path);
  }
  function selectSocialAccount(account: SocialAccount){
    setConnectorRequest(account.id);
    setConnectorOpenSignal(value=>value+1);
    setMobileMenu(false);
  }
  function navigateCraft(id:string|null,slug?:string){
    setPane("growth");setSelectedCraftId(id);
    if(id&&slug)setSelectedCraftSlug(slug);
    if(!id)setSelectedCraftSlug(null);
    const target=id?"/dashboard/growth/"+encodeURIComponent(id):"/dashboard/growth";
    navigate(id&&pathname===target+"/source"?pathname:target);
  }
  function navigateCraftView(next:"visual"|"source"){
    if(!selectedCraftId)return;
    navigate("/dashboard/growth/"+encodeURIComponent(selectedCraftId)+(next==="source"?"/source":""));
  }

  const selected = workflows[platform].find((workflow) => workflow.id === action) || workflows[platform][0];
  const normalizedHandle = handle.trim().replace(/^@/, "");
  const profilePage = activeConnector?.platform === platform &&
    activeConnector.handle.toLowerCase() === normalizedHandle.toLowerCase()
      ? activeConnector.profileUrl : "";
  const selectedPage = profilePage && platform === "linkedin" && scopeSection !== "profile"
    ? profilePage.replace(/\/$/, "") + "/details/" + scopeSection + "/" : profilePage;
  const pageOptions = platform === "linkedin"
    ? ["profile", "experience", "skills", "projects", "featured"] : ["profile"];

  const busy = Boolean(active && ["running", "paused", "input-needed", "approval-needed"].includes(active.state));
  const connectorReady = activeConnector?.platform === platform && activeConnector.status === "connected";
  const PlatformIcon = platform === "linkedin" ? LinkedInIcon : TwitterIcon;
  const platformLabel = platform === "linkedin" ? "LinkedIn" : "X";
  const formDirty=JSON.stringify(form)!==JSON.stringify(workflowPlan.parameters??{});
  useEffect(()=>{
    let live=true;
    const generation=savedListEpoch.current;
    void fetch(getApi("workflows"),{cache:"no-store"}).then(async response=>{
      if(!response.ok)throw Error("Saved workflows unavailable");
      const records=await response.json() as WorkflowRecord[];
      if(live&&savedListEpoch.current===generation)setSavedWorkflows(records);
    }).catch(()=>{if(live)setRunFormError("Saved workflows unavailable. Check the local automation API.");});
    return()=>{live=false;};
  },[]);
  useEffect(()=>{
    let live=true;
    setTemplatePlans([]);
    const controller=new AbortController();
    void fetch(getApi("workflow-templates/"+platform),{cache:"no-store",signal:controller.signal})
      .then(async result=>{
        if(!result.ok)throw Error("Template catalogue not available");
        const plans=await result.json() as WorkflowPlan[];
        if(live)setTemplatePlans(plans);
      }).catch(()=>{if(live)setTemplatePlans([]);});
    return()=>{live=false;controller.abort();};
  },[platform]);
  useEffect(()=>{
    if(activeWorkflow){setLoadingWorkflow(false);return;}
    setLoadingWorkflow(true);
    let live=true;
    const controller=new AbortController();
    void fetch(getApi("workflow-plans/"+platform+"/"+action),{
      cache:"no-store",signal:controller.signal,
    }).then(async response=>{
      if(!response.ok)throw Error("Saved workflow could not be loaded");
      const plan=await response.json() as WorkflowPlan;
      if(live){setWorkflowPlan(plan);setForm(plan.parameters??{});setPlanDirty(false);setLoadingWorkflow(false);}
    }).catch(error=>{
      if(live&&!(error instanceof DOMException&&error.name==="AbortError")){
        setRunFormError("Saved workflow unavailable. Check the local automation API.");setLoadingWorkflow(false);
      }
    });
    return()=>{live=false;controller.abort();};
  },[platform,action,activeWorkflow]);
  async function saveWorkflowPlan():Promise<void>{
    if(busy)throw Error("Stop the active workflow before saving");
    if(loadingWorkflow)throw Error("Wait until the selected workflow finishes loading");
    if(planSaving)throw Error("A workflow save is already running");
    const selection=workflowSelectionEpoch.current;
    setPlanSaving(true);
    try{
      const value={...workflowPlan,parameters:{...form}};
      const response=await fetch(getApi(activeWorkflow?"workflows/"+activeWorkflow.id:"workflows"),{
        method:activeWorkflow?"PUT":"POST",headers:{"content-type":"application/json"},
        body:JSON.stringify(activeWorkflow?{plan:value,expectedRevision:activeWorkflow.revision}:{plan:value}),
      });
      const json=await response.json() as WorkflowRecord&{error?:string};
      if(!response.ok)throw Error(json.error??"Could not save workflow");
      savedListEpoch.current++;
      setSavedWorkflows(previous=>[...previous.filter(item=>item.id!==json.id),json]);
      if(selection===workflowSelectionEpoch.current){
        setActiveWorkflow(json);setWorkflowPlan(json.plan);setPlanDirty(false);setRunFormError("");
      }
    }catch(error){
      const message=error instanceof Error?error.message:"Workflow save failed";
      setRunFormError(message);
      throw Error(message);
    }finally{setPlanSaving(false);}
  }
  async function applyTemplate(plan:WorkflowPlan,templateId:string):Promise<void>{
    if(busy)throw Error("Stop or finish the active workflow before changing templates");
    if(plan.platform!==platform)throw Error("Select the matching studio account before applying this template");
    if(planSaving)throw Error("A workflow save is already running");
    const selection=++workflowSelectionEpoch.current;
    setPlanSaving(true);setRunFormError("");
    try{
      const response=await fetch(getApi("workflows"),{
        method:"POST",headers:{"content-type":"application/json"},
        body:JSON.stringify({plan,templateId}),
      });
      const saved=await response.json() as WorkflowRecord&{error?:string};
      if(!response.ok)throw Error(saved.error||"The selected workflow could not be saved");
      savedListEpoch.current++;
      setSavedWorkflows(previous=>[...previous.filter(item=>item.id!==saved.id),saved]);
      if(selection===workflowSelectionEpoch.current){
        setAction(saved.plan.action);setActiveWorkflow(saved);
        setWorkflowPlan(saved.plan);setForm(saved.plan.parameters??{});
        setPlanDirty(false);setLoadingWorkflow(false);
      }
    }finally{setPlanSaving(false);}
  }
  function selectSavedWorkflow(id:string|null){
    workflowSelectionEpoch.current++;
    if(id===null){
      setActiveWorkflow(null);setPlanDirty(false);setRunFormError("");
      return;
    }
    const selected=savedWorkflows.find(item=>item.id===id);
    if(!selected)return;
    setLoadingWorkflow(false);
    setActiveWorkflow(selected);setPlatform(selected.plan.platform);
    setAction(selected.plan.action);setWorkflowPlan(selected.plan);
    setForm(selected.plan.parameters??{});setPlanDirty(false);setRunFormError("");
  }

  const refresh = useCallback(async () => {
    try {
      const [health, recent, rules, savedReviews] = await Promise.all([
        fetch(getApi("health"), { cache: "no-store" }),
        fetch(getApi("runs"), { cache: "no-store" }),
        fetch(getApi("playbook"), { cache: "no-store" }),
        fetch(getApi("visual-reviews"), { cache: "no-store" }),
      ]);
      if (!health.ok) throw new Error("Engine health request failed");
      setAvailable("ready");
      if (recent.ok) {
        const list = await recent.json() as Run[];
        setRuns(list);
        if (currentRunRef.current) {
          const matching = list.find((run) => run.id === currentRunRef.current);
          if (matching) setActive(matching);
        }
      }
      if (rules.ok) setPlaybook(await rules.json() as Playbook);
      if (savedReviews.ok) setReviews(await savedReviews.json() as Review[]);
      if (currentRunRef.current) {
        const current = (await (await fetch(getApi("runs/" + currentRunRef.current), { cache: "no-store" })).json()) as Run;
        if (current.action === "audit") {
          const report = await fetch(getApi("runs/" + current.id + "/assessment"), { cache: "no-store" });
          if (report.ok) setAssessment(await report.json() as Assessment);
        }
      }
    } catch {
      setAvailable("offline");
    }
  }, []);
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => { void refresh(); }, 20000);
    return () => { clearInterval(timer); streamRef.current?.close(); };
  }, [refresh]);
  useEffect(() => { logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" }); }, [events, conversation, checkpoint]);

  const onConnectorSelect=useCallback((account:Connector)=>{
    if(account.platform!=="linkedin")return;
    // Connecting or resyncing the same account must not discard a template
    // that the user already loaded and configured offline.
    const switchingAccount=Boolean(activeConnector?.id&&activeConnector.id!==account.id);
    const switchingPlatform=platform!==account.platform;
    setActiveConnector(account);
    setPlatform(account.platform);
    setHandle(account.handle);
    if(!switchingAccount&&!switchingPlatform)return;
    // Switching identities or platforms intentionally resets any account-specific form.
    workflowSelectionEpoch.current++;
    setActiveWorkflow(null);
    setAction("audit");setForm({});setScopeSection("profile");
    setConnectorRequest(null);
  },[activeConnector?.id,platform]);
  function choosePlatform(next: Platform) {
    workflowSelectionEpoch.current++;
    setActiveWorkflow(null);
    setPlatform(next);
    setAction("audit");
    setForm({});
    setScopeSection("profile");
    setActiveConnector(null);
    setHandle("");
  }
  function chooseAction(next: string) { workflowSelectionEpoch.current++;setActiveWorkflow(null);setAction(next); setForm({}); setRunFormError(""); navigatePane("pipeline"); setMobileMenu(false); }
  async function apiPost(path: string, data: Record<string, unknown> = {}) {
    const response = await fetch(getApi(path), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data) });
    const body = await response.json() as { error?: string; id?: string };
    if (!response.ok) throw new Error(body.error || "Unable to submit request");
    return body;
  }
  function connect(runId: string) {
    streamRef.current?.close();
    const source = new EventSource(getApi("events/" + runId));
    streamRef.current = source;
    const kinds = ["status", "step", "audit", "approval", "input", "screenshot", "error", "result"];
    const consume = (incoming: MessageEvent) => {
      const item = JSON.parse(incoming.data) as Event;
      if (item.runId !== currentRunRef.current) return;
      setEvents((prev) => prev.some((entry) => entry.id === item.id) ? prev : [...prev, item]);
      if (item.kind === "approval" || item.kind === "input") {
        setCheckpointError("");
        setCheckpoint({ kind: item.kind, id: item.details?.checkpointId || "", message: item.message });
      }
      if (item.kind === "status" && (item.message.startsWith("Run paused") || item.message.startsWith("Run resumed"))) void refresh();
      if (item.kind === "status" && (item.message.startsWith("Run ended:") || item.message.includes("Run finished"))) {
        setCheckpoint(null);
        void refresh();
      }
    };
    for (const kind of kinds) source.addEventListener(kind, consume as EventListener);
    source.onerror = () => { setAvailable("offline"); }; // EventSource retries automatically.
  }
  async function startRun() {
    if(loadingWorkflow)throw Error("Selected workflow has not finished loading");
    if(activeWorkflow&&(planDirty||formDirty))throw Error("Save workflow changes before starting this revision");
    if(!activeConnector||activeConnector.status!=="connected"||activeConnector.platform!==platform)
      throw Error("Select and verify the social account before starting a workflow");
    const payload: Record<string, unknown> = {platform,action,accountId:activeConnector.id,profileUrl:activeConnector.profileUrl};
    if(activeWorkflow){
      payload.workflowId=activeWorkflow.id;
      payload.workflowRevision=activeWorkflow.revision;
    }else payload.workflow={...workflowPlan,parameters:{...form}};
    if (action === "audit-page") payload.pageUrl = selectedPage;
    for (const field of selected.fields) {
      const value = form[field.key]?.trim();
      if (field.required && !value) throw new Error(field.label + " is required");
      if (value) payload[field.key] = field.key === "websiteIndex" ? Number(value) : value;
    }
    const result = await apiPost("runs", payload);
    if (!result.id) throw new Error("Server did not return a run ID");
    currentRunRef.current = result.id;
    setActive({ id: result.id, action, platform, state: "running", createdAt: new Date().toISOString() });
    setEvents([]);
    
    setAssessment(null);
    setCheckpoint(null);
    connect(result.id);
    void refresh();
  }
  async function launchRun() {
    setRunFormError("");
    try { await startRun(); }
    catch (error) {
      const detail=error instanceof Error ? error.message : "Unable to start run";
      setRunFormError(detail);
      setConversation((prev) => [...prev, { id: Date.now(), sender: "assistant", text: detail }]);
    }
  }
  async function pauseRun(){
    if(!active)return;
    try{await apiPost("runs/"+active.id+"/pause");void refresh();}
    catch(e){setRunFormError(e instanceof Error?e.message:"Could not pause");}
  }
  async function resumeRun(){
    if(!active)return;
    try{await apiPost("runs/"+active.id+"/resume");void refresh();}
    catch(e){setRunFormError(e instanceof Error?e.message:"Could not resume");}
  }
  async function act(approve: boolean, text?: string) {
    if (!active || !checkpoint) return;
    setCheckpointError("");
    try {
      if (checkpoint.kind === "approval") await apiPost("runs/" + active.id + "/decision", { checkpointId: checkpoint.id, approved: approve });
      else await apiPost("runs/" + active.id + "/input", { checkpointId: checkpoint.id, value: text || "" });
      setCheckpoint(null); setInputReply("");
    } catch (error) {
      const detail=error instanceof Error ? error.message : "Action failed";
      setCheckpointError(detail);
      setConversation((prev) => [...prev, { id: Date.now(), sender: "assistant", text: detail }]);
    }
  }
  async function cancelRun() {
    if (!active) return;
    try { await apiPost("runs/" + active.id + "/cancel"); void refresh(); }
    catch (error) { setConversation((prev) => [...prev, { id: Date.now(), sender: "assistant", text: String(error) }]); }
  }
  function chatNotice(text: string) {
    setConversation(previous => [...previous, { id: Date.now() + Math.random(), sender: "assistant", text }]);
  }
  async function handleCraftCommand(text: string) {
    const command = text.trim().replace(/^\/?craft\s*/i, "").trim();
    
    try {
      const response = await fetch(getApi("crafts"), { cache: "no-store" });
      if (!response.ok) throw Error("Craft library is unavailable; start the local API");
      const library = await response.json() as AgentCraft[];
      if (/^(?:crafts|list|help)?$/i.test(command)) {
        navigatePane("growth");
        chatNotice("Crafts opened. Commands: /craft open <slug>; /craft add <title> | <instructions>; /craft link <from> -> <to>; /craft unlink <from> -> <to>; /craft rename <name>; /craft enable; /craft disable. You can also edit visually or in MDX.");
        return;
      }
      const opening = command.match(/^open\s+([a-z0-9-]+)$/i);
      if (opening) {
        const wanted = library.find(item => item.slug === opening[1]);
        if (!wanted) throw Error("No craft matches the slug " + opening[1]);
        navigateCraft(wanted.id,wanted.slug);
        chatNotice("Opened " + wanted.name + " in the craft editor. Select nodes or drag handles to rewire, then save.");
        return;
      }
      const chosen = library.find(item => item.id === selectedCraftId);
      if (!chosen) throw Error("Select a craft in Crafts first.");
      if(chosen.scope==="default")throw Error("This shared craft is read-only. Clone it to create your own editable version.");
      const draft = {
        slug:chosen.slug,name:chosen.name,description:chosen.description,
        category:chosen.category,enabled:chosen.enabled,
        steps:chosen.steps.map(item=>({...item})),links:chosen.links.map(item=>({...item})),
      };
      const addition = command.match(/^add\s+([^|]+)\|\s*([\s\S]+)$/i);
      const link = command.match(/^(link|unlink)\s+([a-z0-9-]+)\s*->\s*([a-z0-9-]+)$/i);
      const rename = command.match(/^rename\s+(.+)$/i);
      const description = command.match(/^description\s+([\s\S]+)$/i);
      if (addition) {
        const title = addition[1]!.trim().slice(0,100);
        const idBase=title.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,45);
        if (!idBase) throw Error("Specify an alphanumeric step title.");
        let id=idBase,number=2;while(draft.steps.some(item=>item.id===id)) id=idBase+"-"+number++;
        draft.steps.push({id,title,kind:"draft",body:addition[2]!.trim().slice(0,8000),
          position:{x:70+draft.steps.length*180,y:220+(draft.steps.length%3)*140}});
      } else if (link) {
        const source=link[2]!,target=link[3]!,id=source+"-to-"+target;
        if (!draft.steps.some(item=>item.id===source) || !draft.steps.some(item=>item.id===target))
          throw Error("Both step IDs must exist in the selected craft.");
        if (link[1]!.toLowerCase()==="link") {
          if (draft.links.some(item=>item.id===id)) throw Error("These steps are already connected.");
          draft.links.push({id,source,target});
        } else {
          if (!draft.links.some(item=>item.id===id)) throw Error("The connection does not exist.");
          draft.links=draft.links.filter(item=>item.id!==id);
        }
      } else if (rename) {
        draft.name=rename[1]!.trim().slice(0,100);
      } else if (description) {
        draft.description=description[1]!.trim().slice(0,1023);
      } else if (/^(enable|disable)$/i.test(command)) {
        draft.enabled=command.toLowerCase()==="enable";
      } else throw Error("Unknown command. Try /craft help to see supported edits.");
      const responseSave=await fetch(getApi("crafts/"+chosen.id), {
        method:"PUT",headers:{"content-type":"application/json"},
        body:JSON.stringify({expectedVersion:chosen.version,craft:draft}),
      });
      const saved=await responseSave.json() as AgentCraft & {error?:string};
      if (!responseSave.ok) throw Error(saved.error||"Craft edit was rejected");
      setCraftsRevision(v=>v+1);navigateCraft(saved.id,saved.slug);
      chatNotice("Updated "+saved.name+" · v"+saved.version+". The graph and MDX source now share this revision.");
    } catch(error) {
      chatNotice(error instanceof Error ? error.message : "Unable to edit craft");
    }
  }
  function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!message.trim()) return;
    const request = message.trim();
    setMessage("");
    setConversation((prev) => [...prev, { id: Date.now(), sender: "user", text: request }]);
    void apiPost("intelligence/chat",{text:request,platform,...(activeConnector?.id?{accountId:activeConnector.id}:{})})
      .catch(error=>chatNotice("This message was not stored in memory: "+(error instanceof Error?error.message:"Storage unavailable")));
    if (/^(?:\/?craft(?:\s|$)|crafts$)/i.test(request)) {
      void handleCraftCommand(request === "crafts" ? "/craft help" : request);
      return;
    }
    const parsed = explainCommand(request);
    if (/^(what do you remember\??|show memory|memory)$/i.test(request)) {
      void fetch(getApi("intelligence"),{cache:"no-store"}).then(async response=>{
        if(!response.ok)throw Error("Memory unavailable");
        const entries=await response.json() as Array<{source:string;text:string}>;
        const summary=entries.filter(item=>item.source==="chat").slice(0,5).map(item=>"• "+item.text).join("\n");
        chatNotice(summary||"No chat-origin memory has been saved yet.");
      }).catch(()=>chatNotice("Could not load local conversation memory."));
      return;
    }
    if (/^(inspect this page|audit this page)$/i.test(request)) {
      workflowSelectionEpoch.current++;setActiveWorkflow(null);setAction("audit-page"); navigatePane("pipeline"); setSelectedNode("inspect");
      setConversation((prev) => [...prev, { id: Date.now() + 1, sender: "assistant",
        text: "Scoped read-only inspection staged for " + selectedPage + ". Use Start Inspect selected page in the artboard to open the real page." }]);
      return;
    }
    let answer: string;
    if (!parsed) {
      answer = "No model is connected, so I will not guess. Use commands such as 'audit', 'set headline: …', 'add skill: …' or 'draft post: …'. You can also select a workflow from the left.";
    } else if (!workflows[platform].some((workflow) => workflow.id === parsed.action)) {
      answer = "That operation is not supported on " + (platform === "x" ? "X" : "LinkedIn") + ". Choose another platform or supported workflow.";
    } else {
      workflowSelectionEpoch.current++;setActiveWorkflow(null);setAction(parsed.action); setForm(parsed.fields); navigatePane("pipeline");
      answer = parsed.note;
    }
    setConversation((prev) => [...prev, { id: Date.now() + 1, sender: "assistant", text: answer }]);
  }
  async function attachImage(file?: File) {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024 || !["image/png","image/jpeg","image/webp"].includes(file.type)) {
      setImageError("Choose a PNG, JPEG or WebP file under 2 MB."); return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setImageDraft({ kind: "upload", src: reader.result, imageData: reader.result });
        setImageError("");
      }
    };
    reader.onerror = () => setImageError("Could not read the selected image");
    reader.readAsDataURL(file);
  }
  function annotateCapture(runId: string, fileName: string) {
    const section = /^audit-(experience|skills|projects|featured)\.png$/.exec(fileName)?.[1];
    if (section && platform === "linkedin") setScopeSection(section);
    const src = getApi("runs/" + runId + "/evidence/" + fileName);
    setSelectedNode("annotation");
    setImageDraft({ kind: "capture", src, runId, fileName });
  }
  async function saveVisualReview(draft: VisualReviewDraft) {
    const response = await fetch(getApi("visual-reviews"), {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify(draft),
    });
    const json = await response.json() as { error?: string; id?: string; annotations?: VisualAnnotation[] };
    if (!response.ok || !json.id) throw new Error(json.error || "Could not save visual review");
    setImageDraft(null);
    setSelectedNode("annotation");
    setWorkflowPlan(previous=>{
      const id="review-"+json.id!.slice(0,8);
      if(previous.steps.some(step=>step.id===id))return previous;
      const steps=[...previous.steps];
      const idx=steps.findIndex(step=>step.id==="action");
      steps.splice(idx,0,{id,kind:"note",title:"Tagged image instruction",
        message:"Image review "+json.id+" · "+draft.annotations.length+" location actions; approval still required"});
      setPlanDirty(true);
      return {...previous,steps,links:steps.slice(1).map((step,i)=>({source:steps[i]!.id,target:step.id}))};
    });
    setChatVisible(true);
    setConversation(previous=>[...previous,{
      id:Date.now(),sender:"assistant",
      text:"Tagged "+draft.annotations.length+" annotation(s) to this image and workflow. Review "+
        json.id+" links each location to its selected action and optional comment. This is an operator-authored plan; no AI model or website action has run. Inspect the live page and explicitly approve any supported edit.",
    }]);
    await refresh();
  }
  function inspectReview(review: Review) {
    choosePlatform(review.platform);
    const part = review.pageUrl.match(/\/details\/(experience|skills|projects|featured)\/?$/);
    setHandle(review.handle);
    setScopeSection(part?.[1] || "profile");
    workflowSelectionEpoch.current++;setActiveWorkflow(null);setAction("audit-page");
    setSelectedNode("inspect");
    setConfigRequest(value => value + 1);
    navigatePane("pipeline");
    
  }
  const reviewImage = (review: Review) => getApi("visual-reviews/" + review.id + "/image");
  const tagExistingReview = (review:Review) => {
    choosePlatform(review.platform);
    setHandle(review.handle);
    setScopeSection(review.pageUrl.match(/\/details\/(experience|skills|projects|featured)\/?$/)?.[1] ?? "profile");
    setImageDraft({kind:"review",src:reviewImage(review),reviewId:review.id,initialAnnotations:review.annotations});
    setSelectedNode("annotation");
  };
  const latest = events.at(-1);
  const checkpointNeeded = checkpoint?.kind === "approval";
  const coverage = playbook?.coverage || [];
  const coverageCount = coverage.filter((item) => item.status === "implemented").length;
  const showChat = chatVisible && pane !== "profile" && pane !== "resumes" && (pane !== "growth" || libraryView !== "catalog");
  return (
    <div data-automate className="flex min-h-dvh flex-col bg-[#f5f7f8] font-sans text-slate-900 lg:fixed lg:inset-0 lg:z-40 lg:h-dvh lg:overflow-hidden">
      <div className="shrink-0 border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-[1760px] items-center justify-between gap-3 px-4 py-3 md:px-6">
          <div className="flex items-center gap-3">
            <Button variant="ghost" className="lg:hidden" type="button" aria-label="Toggle navigation" aria-expanded={mobileMenu} onClick={() => {setMobileMenu(!mobileMenu);setMobileChatOpen(false);}}><Menu className="size-5" /></Button>
            <div className="flex size-10 items-center justify-center rounded-xl bg-slate-950 text-white"><Workflow className="size-5" /></div>
            <div><p className="text-sm font-extrabold leading-tight tracking-[-.02em]">Utomator <span className="font-medium text-slate-400">/ Studio</span></p><p className="text-[11px] text-slate-500">Local automation, evidence first</p></div>
          </div>
          <div className="flex items-center gap-3">
            <span className={"hidden items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold sm:inline-flex " + (available === "ready" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800")}><span className={"size-2 rounded-full " + (available === "ready" ? "bg-emerald-500" : "bg-amber-500")} />{available === "ready" ? "Engine connected" : available === "checking" ? "Connecting" : "Engine offline"}</span>
            
            <Button variant="ghost" size="sm" type="button" aria-label="Open run tracking" onClick={()=>setTrackingOpen(true)}><Activity className="size-4" /><span className="hidden sm:inline">Tracking</span></Button>
            <Button variant="ghost" size="sm" onClick={() => void refresh()}><RotateCcw className="size-4" /> <span className="hidden sm:inline">Refresh</span></Button>
            <a href="/" className="inline-flex min-h-10 items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-950">Portfolio <ExternalLink className="size-3.5" /></a>
          </div>
        </div>
      </div>
      {(mobileMenu||mobileChatOpen)&&<button type="button" aria-label="Close side panel" onClick={()=>{setMobileMenu(false);setMobileChatOpen(false);}} className="fixed inset-0 z-40 bg-slate-950/40 lg:hidden" />}
      <div className={"mx-auto grid w-full max-w-[1920px] grid-cols-1 gap-4 px-4 py-4 md:px-5 lg:min-h-0 lg:flex-1 lg:overflow-hidden "+(showChat?"lg:grid-cols-[190px_minmax(0,1fr)_300px] 2xl:grid-cols-[220px_minmax(0,1fr)_360px]":"lg:grid-cols-[190px_minmax(0,1fr)] 2xl:grid-cols-[220px_minmax(0,1fr)]")}>
        <aside data-testid="automation-navigation-sidebar" className={(mobileMenu ? "fixed inset-y-0 left-0 z-50 block w-[min(85vw,290px)] p-3" : "hidden") + " min-w-0 lg:static lg:block lg:h-full lg:w-auto lg:overflow-hidden lg:p-0"}>
          <div className="h-full rounded-2xl bg-[#111a25] p-4 text-white shadow-xl shadow-slate-900/10 lg:overflow-hidden">
            <button type="button" aria-label="Close navigation" onClick={()=>setMobileMenu(false)} className="mb-3 flex min-h-10 w-full items-center justify-end gap-2 rounded-lg px-2 text-xs font-semibold text-slate-200 hover:bg-slate-800 lg:hidden"><X className="size-4" />Close</button>
        
            {([{ id: "pipeline", label: "Pipeline", icon: Activity }, { id: "history", label: "Run history", icon: History }] as const).map((item) =>
              <button key={item.id} type="button" onClick={() => { navigatePane(item.id); setMobileMenu(false); }} className={"flex min-h-10 w-full items-center gap-2.5 rounded-xl px-3 text-left text-xs font-semibold transition " + (pane === item.id ? "bg-teal-500/15 text-teal-200" : "text-slate-300 hover:bg-slate-800")}><item.icon className="size-4" />{item.label}</button>
            )}
            {([{ id: "profile", label: "Profile", icon: UserRound },
              { id: "resumes", label: "Résumés", icon: FileText },
              { id: "memory", label: "Intelligence", icon: NotebookPen },
              { id: "research", label: "Creator research", icon: Crosshair },
              { id: "editorial", label: "Editorial drafts", icon: FileText },
              { id: "growth", label: "Growth", icon: Compass }] as const).map(item =>
              <button key={item.id} type="button" onClick={() => { navigatePane(item.id); setMobileMenu(false); }}
                aria-current={pane === item.id ? "page" : undefined}
                className={"flex min-h-10 w-full items-center gap-2.5 rounded-xl px-3 text-left text-xs font-semibold transition " + (pane === item.id ? "bg-teal-500/15 text-teal-200" : "text-slate-300 hover:bg-slate-800")}>
                <item.icon className="size-4" />{item.label}</button>)}
            <button type="button" onClick={()=>{navigatePane("settings");setMobileMenu(false);}} aria-current={pane === "settings" ? "page" : undefined}
              className={"flex min-h-10 w-full items-center gap-2.5 rounded-xl px-3 text-xs font-semibold transition " + (pane === "settings" ? "bg-teal-500/15 text-teal-200" : "text-slate-300 hover:bg-slate-800")}>
              <Settings2 className="size-4" />Settings
            </button>
          </div>
        </aside>
        <main data-testid="automation-main-scroll" className="min-w-0 space-y-5 lg:min-h-0 lg:overflow-y-auto lg:overscroll-contain lg:pr-2">

          <ConnectorOnboarding activeId={activeConnector?.id||null} onSelect={onConnectorSelect}
            requestedId={connectorRequest}
            onManageProfile={()=>navigateSubpage("/dashboard/profile/connections")}
            hideTrigger openSignal={connectorOpenSignal} />
          {pane === "pipeline" && <>
            <GrowthProfilePipelines platform={platform} selectedAction={action} busy={busy} onSelectAction={chooseAction} />
            <WorkflowPlanEditor
              plan={workflowPlan}
              templates={templatePlans}
              connected={activeConnector?.platform==="linkedin"&&activeConnector?.status==="connected"}
              accountLabel={activeConnector?.platform===platform?activeConnector.label:undefined}
              events={active?.platform===platform&&active.action===action?events:[]}
              state={active?.platform===platform&&active.action===action?active.state:undefined}
              runId={active?.platform===platform&&active.action===action?active.id:undefined}
              busy={busy} dirty={planDirty||formDirty} saving={planSaving}
              savedWorkflows={savedWorkflows} workflowId={activeWorkflow?.id??null} onWorkflowSelect={selectSavedWorkflow}
              configRequest={configRequest}
              onPlanChange={next=>{setWorkflowPlan(next);setPlanDirty(true);}}
              onTemplateApply={applyTemplate}
              onSave={saveWorkflowPlan}
              onStop={()=>{void cancelRun();}}
              runError={runFormError}
              evidenceRoot={active?getApi("runs/"+active.id+"/evidence/"):undefined}
              onEvidenceOpen={annotateCapture}
            >
              <form className="space-y-4" onSubmit={event=>event.preventDefault()}>
                {runFormError && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">{runFormError}</p>}
                <label htmlFor="workflowSelect" className="block text-xs font-semibold">Workflow action
                  <select id="workflowSelect" className="mt-2 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm" value={action} onChange={event=>chooseAction(event.target.value)}>
                    {workflows[platform].map(item=><option key={item.id} value={item.id}>{item.title}</option>)}
                  </select>
                </label>
                <div data-testid="page-scope" className="rounded-xl border border-teal-200 bg-teal-50 p-3">
                <p className="flex items-center gap-2 text-xs font-bold text-teal-900"><Focus className="size-4" />Isolate one page</p>
                <label className="mt-2 block text-xs font-semibold" htmlFor="pageScope">Page section</label>
                <select id="pageScope" className="mt-1.5 min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm" value={scopeSection} onChange={(e) => setScopeSection(e.target.value)}>
                  {pageOptions.map((part) => <option key={part} value={part}>{part === "profile" ? "Main profile" : part[0].toUpperCase() + part.slice(1)}</option>)}
                </select>
                <p className="mt-2 break-all font-mono text-[10px] text-teal-800">{selectedPage || "Select a saved social profile to set the inspection target."}</p>
                <button type="button" disabled={!profilePage} onClick={() => { chooseAction("audit-page"); setSelectedNode("inspect");  }}
                  className="mt-2 inline-flex items-center gap-2 text-xs font-bold text-teal-900 hover:underline"><Crosshair className="size-4" />Inspect this page before editing</button>
              </div>
              {selected.fields.length > 0 && <div className="grid gap-3">
                  {selected.fields.map((field) => <div key={field.key}><label className="mb-1 block text-xs font-semibold" htmlFor={"automation-" + field.key}>{field.label}{field.required && <span className="ml-1 text-rose-500">*</span>}</label>
                    {field.multiline ? <textarea id={"automation-" + field.key} className="min-h-24 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-teal-600" maxLength={field.max || 3000} required={field.required} value={form[field.key] || ""} onChange={(event) => setForm((prev) => ({ ...prev, [field.key]: event.target.value }))} />
                      : <input id={"automation-" + field.key} className="min-h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm outline-teal-600" maxLength={field.max || 500} placeholder={field.placeholder} required={field.required} value={form[field.key] || ""} onChange={(event) => setForm((prev) => ({ ...prev, [field.key]: event.target.value }))} />}
                  </div>)}
                </div>}
                {platform === "linkedin" && action === "edit-profile" && <p className="text-xs leading-5 text-slate-500">Use details reviewed for this LinkedIn account. Content from another identity is not auto-filled.</p>}
                <p className="rounded-xl bg-slate-50 p-3 text-xs leading-6 text-slate-500">
                  Authentication is managed by the selected connection. Use the {platformLabel} icon in the floating toolbar to connect, verify, or sync an expired session.
                </p>
              </form>
            </WorkflowPlanEditor>
          </>}
          {pane==="pipeline"&&<div className="pointer-events-none fixed bottom-5 left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/30 bg-[#111e2b] p-1.5 shadow-2xl" data-testid="floating-workflow-controls">
            <button type="button"
              aria-label={active?.state==="paused"?"Resume workflow":active?.state==="running"?"Pause workflow":"Start workflow"}
              disabled={active?.state==="paused"?false:active?.state==="running"?false:busy||available!=="ready"||!connectorReady||loadingWorkflow||workflowPlan.platform!==platform||workflowPlan.action!==action||(Boolean(activeWorkflow)&&(planDirty||formDirty))}
              onClick={()=>{if(active?.state==="paused")void resumeRun();else if(active?.state==="running")void pauseRun();else void launchRun();}}
              className="pointer-events-auto inline-flex min-h-12 items-center justify-center gap-3 rounded-full bg-white px-6 text-sm font-bold text-slate-950 transition hover:bg-teal-50 disabled:opacity-50">
              {active?.state==="running"?<Pause className="size-5"/>:<Play className="size-5"/>}
              {active?.state==="paused"?"Resume":active?.state==="running"?"Pause":"Run workflow"}
            </button>
            <button type="button" onClick={()=>setConnectorOpenSignal(value=>value+1)}
              aria-label={(connectorReady?"Manage ":"Connect ")+platformLabel+" account"}
              aria-haspopup="dialog"
              title={connectorReady?platformLabel+" connected · Manage or sync":"Connect "+platformLabel+" account"}
              data-testid="floating-connector-button"
              className="pointer-events-auto relative inline-flex size-12 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white transition hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-400">
              <span className="grid size-5 shrink-0 place-items-center [&>svg]:h-5 [&>svg]:w-5">
                <PlatformIcon className="size-5"/>
              </span>
              <span aria-hidden="true" className={"absolute -right-1 -top-1 grid size-4 place-items-center rounded-full text-slate-950 ring-2 ring-[#111e2b] "+(connectorReady?"bg-emerald-400":"bg-amber-400")}>
                {connectorReady?<Check className="size-2.5" strokeWidth={3}/>:<Plus className="size-2.5" strokeWidth={3}/>}
              </span>
            </button>
          </div>}
          {pane === "history" && <Card><CardHeader><CardTitle>Recent executions</CardTitle><CardDescription>Stored in memory during the current engine session. Select a run to inspect streamed events.</CardDescription></CardHeader><CardContent><div className="divide-y divide-slate-100">{runs.length === 0 && <p className="py-10 text-center text-sm text-slate-500">No runs yet. Start an audit to capture the first trace.</p>}{runs.map((run) => <button key={run.id} type="button" className="flex min-h-16 w-full items-center justify-between gap-3 py-3 text-left hover:bg-slate-50" onClick={() => { currentRunRef.current = run.id; setActive(run); setEvents([]); connect(run.id); navigatePane("pipeline"); }}><span><span className="block text-sm font-semibold capitalize">{run.platform} / {run.action.replaceAll("-", " ")}</span><span className="text-xs text-slate-500">{short(run.id)} · {new Date(run.createdAt).toLocaleString()}</span></span><span className="text-xs font-semibold capitalize text-slate-500">{stateLabel(run.state)} <ArrowRight className="ml-1 inline size-3" /></span></button>)}</div></CardContent></Card>}
          {pane === "growth" && <CraftsLibrary
            selectedId={selectedCraftId} onSelected={navigateCraft}
            view={libraryView} onView={navigateCraftView} onBack={()=>navigatePane("growth")}
            onChat={(text) => { if (text.startsWith("/craft")) { void handleCraftCommand(text); }
              else chatNotice(text); }}
            revision={craftsRevision}
          />}
          {pane === "profile" && <AccountStudio view={pathname.endsWith("/details")?"details":pathname.endsWith("/connections")?"connections":"overview"} onNavigate={navigateSubpage} onSelectAccount={selectSocialAccount} />}
          {pane === "resumes" && <CareerStudio mode={pathname==="/dashboard/resumes/profile"?"profile":"resumes"} onNavigate={navigateSubpage} />}
          {(pane === "memory" || pane === "observer") && <ActivityIntelligence initialView={pane} onNavigate={path=>{navigate(path);setPane(path.endsWith("/dashboard/observer")?"observer":"memory")}} />}
          {pane === "research" && <LinkedInResearchStudio />}
          {pane === "editorial" && <LinkedInEditorialStudio />}

          {pane === "settings" && <AutomationSettingsPage available={available} platform={platform} selectedAccount={activeConnector} />}
        </main>
        <aside data-testid="automation-right-sidebar" className={(mobileChatOpen?"fixed inset-y-0 right-0 z-50 flex w-[min(92vw,390px)] bg-[#f5f7f8] p-3 shadow-2xl":"hidden") + (showChat?" lg:static lg:flex lg:h-full lg:w-auto lg:min-h-0 lg:overflow-hidden lg:bg-transparent lg:p-0 lg:shadow-none":" lg:hidden") + " min-w-0 flex-col"}>
          <button type="button" className="mb-2 inline-flex min-h-10 items-center justify-end gap-2 text-xs font-semibold text-slate-700 lg:hidden" onClick={()=>{setMobileChatOpen(false);setChatVisible(false);}} aria-label="Close operator chat"><X className="size-4" />Close</button>
            <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <CardHeader className="flex flex-row items-start justify-between gap-3 border-b border-slate-100">
                <div><CardTitle>Mator</CardTitle>
                  <CardDescription>Your local operator conversation</CardDescription>
                </div>
                <div className="flex items-center gap-1">
                  <button type="button" onClick={()=>setTrackingOpen(true)} aria-label="Open tracking" className="inline-flex size-10 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100" title="Tracking">
                    <Activity className="size-4" />
                  </button>
                  <button type="button" onClick={()=>{setChatVisible(false);setMobileChatOpen(false);}} aria-label="Minimize Mator" className="inline-flex size-10 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100" title="Minimize chat">
                    <X className="size-4" />
                  </button>
                </div>
              
              </CardHeader>
              <CardContent className="flex min-h-0 flex-1 flex-col pt-3">
                {pane === "growth" && selectedCraftSlug && <div data-testid="active-craft-context" className="mb-3 flex items-center justify-between gap-2 rounded-xl border border-teal-200 bg-teal-50 p-3">
                  <div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-wider text-teal-800">Active craft</p>
                    <p className="mt-0.5 truncate font-mono text-[11px] text-teal-950">{selectedCraftSlug}</p></div>
                  <button type="button" onClick={() => setMessage("/craft help")} className="rounded-lg bg-white px-2.5 py-2 text-[11px] font-semibold text-teal-800 hover:bg-teal-100">Commands</button>
                </div>}
                <div className="min-h-[260px] flex-1 space-y-3 overflow-y-auto pr-1 lg:min-h-0" ref={logRef} role="log" aria-live="polite">
                  {conversation.map((item) => <Message key={item.id} align={item.sender === "user" ? "end" : "start"}>
                    <MessageAvatar className={item.sender === "assistant" ? "bg-teal-700" : "bg-slate-800"}>{item.sender === "assistant" ? <Workflow className="size-4" /> : "ME"}</MessageAvatar>
                    <MessageContent><MessageHeader>{item.sender === "assistant" ? "Utomator · Local assistant" : "You"}</MessageHeader><Bubble muted={item.sender === "user"}><BubbleContent>{item.text}</BubbleContent></Bubble></MessageContent>
                  </Message>)}
                  {events.map((event) => <Message key={"event-" + event.id}>
                    <MessageAvatar className={event.kind === "error" ? "bg-rose-700" : "bg-slate-700"}>{event.kind === "error" ? <AlertCircle className="size-4" /> : <Activity className="size-4" />}</MessageAvatar>
                    <MessageContent>
                      <MessageHeader>{event.kind.toUpperCase()} · {timeLabel(event.time)}</MessageHeader>
                      <Bubble><BubbleContent>{event.message}</BubbleContent></Bubble>
                      {event.kind === "screenshot" && typeof event.details?.fileName === "string" && /^[a-zA-Z0-9_-]+\.png$/.test(event.details.fileName) && event.runId === currentRunRef.current && (
                        <button data-testid="workflow-screenshot" type="button"
                          onClick={()=>annotateCapture(event.runId,event.details!.fileName!)}
                          data-evidence-url={getApi("runs/" + event.runId + "/evidence/" + event.details.fileName)}
                          className="mt-2 block w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-50 text-left hover:border-teal-400 focus-visible:outline-2 focus-visible:outline-teal-600"
                          aria-label={"Annotate captured image: "+event.details.fileName}>
                          <Image unoptimized src={getApi("runs/" + event.runId + "/evidence/" + event.details.fileName)} width={640} height={400}
                            alt={"Actual browser capture: " + event.message} className="h-auto w-full object-contain" />
                          <div className="flex items-center gap-2 px-3 py-2 text-[11px] text-slate-500"><ImageIcon className="size-3.5" />{event.details.fileName} · Click image to annotate</div>
                        </button>
                      )}
                      <MessageFooter>Event {event.id} · Run {short(event.runId)}</MessageFooter>
                    </MessageContent>
                  </Message>)}
                  {reviews.filter((r) => r.platform === platform && r.handle.toLowerCase() === normalizedHandle.toLowerCase()).map((review) =>
                    <Message key={"review-" + review.id}>
                      <MessageAvatar className="bg-teal-800"><Crosshair className="size-4" /></MessageAvatar>
                      <MessageContent>
                        <MessageHeader>Saved visual review · {review.nodeId} node</MessageHeader>
                        <div data-testid="saved-visual-review" className="overflow-hidden rounded-xl border border-teal-200 bg-teal-50/40">
                          <button type="button" onClick={()=>tagExistingReview(review)}
                            aria-label={"Edit annotated image "+review.id}
                            className="relative block w-full overflow-hidden bg-slate-50 text-left">
                            <Image unoptimized src={reviewImage(review)} width={640} height={400}
                              alt={"Annotated "+review.pageUrl} className="pointer-events-none h-auto w-full" />
                            <svg aria-hidden="true" viewBox="0 0 1000 1000" preserveAspectRatio="none"
                              className="pointer-events-none absolute inset-0 size-full">
                              {(review.annotations??[]).map((a,index)=><g key={a.id}>
                                {a.shape==="freehand"?<polyline fill="none" stroke="#0f766e" strokeWidth="5"
                                  points={(a.points??[]).map(p=>p.x*1000+","+p.y*1000).join(" ")} />:
                                  a.shape==="ellipse"?<ellipse cx={(a.x+a.width/2)*1000} cy={(a.y+a.height/2)*1000}
                                    rx={a.width*500} ry={a.height*500} fill="#0f766e" fillOpacity=".08" stroke="#0f766e" strokeWidth="4" />:
                                    <rect x={a.x*1000} y={a.y*1000} width={a.width*1000} height={a.height*1000}
                                      fill="#0f766e" fillOpacity=".08" stroke="#0f766e" strokeWidth="4" />}
                                <text x={a.x*1000+10} y={a.y*1000+23} fill="#0f766e" fontSize="22" fontWeight="bold">{index+1}</text>
                              </g>)}
                            </svg>
                            <span className="block border-t border-teal-100 px-3 py-2 text-[11px] font-bold text-teal-800">Open annotation editor</span>
                          </button>
                          <div className="space-y-1 p-3 text-[11px]">
                            <p className="font-bold text-teal-900">{review.regions.length} marked region(s)</p>
                            {review.regions.map((r, i) => <p key={i} className="text-slate-600">{i + 1}. {r.label}: {r.request}</p>)}
                            <p className="break-all font-mono text-[10px] text-slate-500">{review.pageUrl}</p>
                            <button type="button" onClick={() => inspectReview(review)} className="mt-2 inline-flex gap-2 font-bold text-teal-800 hover:underline">
                              <Focus className="size-3.5" />Inspect this exact page on the artboard
                            </button>
                            {review.annotations?.length?<>
                              <div className="mt-3 space-y-1 border-t border-teal-100 pt-3">
                                {review.annotations.map((a,index)=><p key={a.id} className="text-[11px] text-slate-700">
                                  <strong>{index+1}. {a.action.replaceAll("-"," ")}</strong>{a.comment?" · "+a.comment:""}
                                </p>)}
                              </div>
                               <p className="mt-1 text-[10px] leading-4 text-slate-500">Tagged instructions are linked to the workflow; they cannot execute unapproved browser actions.</p>
                            </>:<p className="mt-2 text-[10px] text-slate-500">Earlier image review. Click the image to add detailed actions and comments.</p>}
                          </div>
                        </div>
                      </MessageContent>
                    </Message>)}
                </div>
                {imageError && <p role="alert" className="mt-2 text-xs text-rose-700">{imageError}</p>}
                <form onSubmit={sendMessage} className="mt-4 flex items-end gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-2 focus-within:ring-2 focus-within:ring-teal-600/20">
                  <label htmlFor="operatorMessage" className="sr-only">Structured command</label>
                  <textarea id="operatorMessage" className="min-h-[46px] max-h-28 flex-1 resize-y bg-transparent px-2 py-2 text-sm outline-none placeholder:text-slate-400" rows={1} placeholder="Try: audit · set headline: ... · add skill: ..." value={message} onChange={(event) => setMessage(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} />
                  <label title="Attach a PNG, JPEG or WebP image" className="flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-teal-50">
                    <Paperclip className="size-4" />
                    <input aria-label="Attach image to chat" type="file" accept="image/png,image/jpeg,image/webp" className="sr-only"
                      onChange={(e) => { void attachImage(e.target.files?.[0]); e.currentTarget.value = ""; }} />
                  </label>
                  <Button type="submit" variant="primary" aria-label="Send structured command"><Send className="size-4" /></Button>
                </form>
              </CardContent>
            </Card>
        </aside>
      </div>

      <StudioDialog open={trackingOpen} onDismiss={()=>setTrackingOpen(false)} title="Run tracking"
        description="Live event telemetry, audit comparisons, and the latest verified observation."
        testId="tracking-dialog" size="wide">
      <div data-testid="automation-tracking-panel" className="flex flex-col gap-4">

          <Card><CardHeader><CardTitle>Run telemetry</CardTitle><CardDescription>Live events, approvals and verified outcomes.</CardDescription></CardHeader><CardContent><div className="space-y-4">
            <div className="rounded-xl bg-slate-950 p-4 text-white"><p className="text-[10px] uppercase tracking-[.15em] text-slate-400">Current state</p><p className="mt-2 flex items-center gap-2 text-base font-bold capitalize"><Activity className="size-4 text-teal-300" />{active ? stateLabel(active.state) : "Waiting for a run"}</p><p className="mt-2 truncate font-mono text-[10px] text-slate-400">{active?.id || "–"}</p></div>
            {playbook?.stages.map((stage, index) => <div key={stage} className="flex gap-3"><span className={"flex size-7 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold " + (index === 0 && active ? "border-teal-200 bg-teal-50 text-teal-700" : "border-slate-200 text-slate-400")}>{index + 1}</span><div><p className="text-xs font-semibold">{stage}</p><p className="text-[10px] text-slate-400">{index === 0 && active ? "Run started" : "Reference sequence · not a progress claim"}</p></div></div>)}
          </div></CardContent></Card>
          {assessment && <Card><CardHeader><CardTitle>Audit comparison</CardTitle><CardDescription>Current observation against an owner-authored draft. Differences require your judgment.</CardDescription></CardHeader><CardContent>{assessment.comparisons.map((check) => <div key={check.field} className="space-y-2 text-xs"><p className="font-bold capitalize">{check.field} · <span className="font-medium text-slate-500">{check.status.replaceAll("-", " ")}</span></p><p className="rounded-lg bg-slate-50 p-2 text-slate-600">Observed: {check.observed || "Not observed"}</p><p className="rounded-lg bg-teal-50 p-2 text-teal-900">Source draft: {check.proposed || "No draft available"}</p></div>)}<p className="mt-3 text-[11px] leading-5 text-slate-500">{assessment.notice}</p></CardContent></Card>}
          <Card><CardHeader><CardTitle>Latest observation</CardTitle><CardDescription>Not a model confidence score.</CardDescription></CardHeader><CardContent><p className="break-words text-xs leading-5 text-slate-600">{latest?.message || "An audit will record profile observations and review evidence."}</p></CardContent></Card>

        
          </div>

      </StudioDialog>
      <StudioDialog open={Boolean(checkpoint)} onDismiss={()=>{}} dismissible={false}
        title={checkpointNeeded?"Approval required":"Operator input required"}
        description={checkpoint?.message} testId="checkpoint-dialog">
          {checkpoint && <div className="flex flex-col gap-4">
              <p className="text-sm leading-6 text-slate-700">Review the operation before continuing.</p>
              {checkpointError && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">{checkpointError}</p>}
              <div>
                {checkpointNeeded ? <div className="flex flex-wrap gap-2"><Button variant="primary" onClick={() => void act(true)}><CheckCircle2 className="size-4" />Approve checkpoint</Button><Button variant="danger" onClick={() => void act(false)}>Reject</Button></div>
                  : <div className="flex flex-wrap gap-2"><input aria-label="Checkpoint response" value={inputReply} onChange={(event) => setInputReply(event.target.value)} className="min-h-10 min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3 text-sm" maxLength={300} /><Button variant="primary" disabled={!inputReply.trim()} onClick={() => void act(true, inputReply)}>Respond</Button><Button type="button" onClick={() => void cancelRun()}>Cancel run</Button></div>}
              </div>
          </div>}
      </StudioDialog>
      {pane !== "profile" && pane !== "resumes" && <button type="button" aria-label="Open Mator" onClick={()=>{setChatVisible(true);setMobileChatOpen(true);}}
        className={"fixed bottom-5 right-5 z-30 inline-flex min-h-12 items-center gap-2 rounded-full bg-slate-950 px-5 text-sm font-bold text-white shadow-2xl ring-2 ring-white/80 hover:bg-teal-800 focus-visible:outline-2 focus-visible:outline-teal-600 "+(chatVisible?"lg:hidden":"")+(mobileChatOpen?" hidden":"")}>
        <MessageSquareText className="size-5" />Mator
      </button>}
    {imageDraft && <VisualReviewPanel source={imageDraft} platform={platform} handle={normalizedHandle}
      pageUrl={selectedPage} nodeId="annotation" onClose={() => setImageDraft(null)} onSave={saveVisualReview} />}
    </div>
  );
}
