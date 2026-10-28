"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowRight, FileCode2, ShieldCheck } from "lucide-react";

type Stage = {id:string;title:string;action:"audit"|"audit-page";page:string;dependsOn:string;
  sectionIds:string[];stepCount:number};
type Program = {id:string;title:string;objective:string;limitation:string;
  stages:Stage[];requirements:Array<{id:string;text:string}>;
  coverage:Array<{id:string;label:string;status:string}>;
  pipelines:Array<{id:string;action:string;title:string;stepCount:number}>};
type Child = {id:string;state:string;checkpoint?:{id:string;message:string};error?:string};
type Evidence = {source:"owner-supplied";excerpt:string;digest:string;capturedAt:string};
type Run = {id:string;accountId:string;status:string;state:string;activeIndex:number;
  currentChild:Child|null;currentStage:Stage&{childRunId:string|null};
  currentPageEvidence:{url:string;digest:string}|null;canAdvance:boolean;
  coverage:Array<{id:string;stageId:string;status:"missing"|"owner-supplied-unverified";evidence:Evidence|null}>;
  counts:{total:number;missing:number;ownerSupplied:number;independentlyProviderVerified:number};
  outcomeNotice:string};
type Props = {platform:"linkedin"|"x";selectedAction:string;busy:boolean;
  accountId?:string;onSelectAction:(action:string)=>void};
const endpoint="/api/growth/workflows/profile";
async function request<T>(url:string,method="GET",body?:unknown):Promise<T>{
  const response=await fetch(url,{method,cache:"no-store",
    ...(body===undefined?{}:{headers:{"content-type":"application/json"},body:JSON.stringify(body)})});
  const data=await response.json() as T&{error?:string};
  if(!response.ok)throw Error(data.error||"Growth workflow request failed");
  return data;
}

export default function GrowthProfilePipelines({platform,selectedAction,busy,accountId,onSelectAction}:Props){
  const [program,setProgram]=useState<Program|null>(null);
  const [run,setRun]=useState<Run|null>(null);
  const [error,setError]=useState("");
  const [working,setWorking]=useState(false);
  const [evidenceSection,setEvidenceSection]=useState("");
  const [evidenceText,setEvidenceText]=useState("");
  const refresh=useCallback(async()=>{
    if(platform!=="linkedin")return;
    const loaded=await request<Program>(endpoint);
    setProgram(loaded);
    if(!accountId){setRun(null);return;}
    const runs=await request<Run[]>(endpoint+"/runs");
    const mine=runs.find(item=>item.accountId===accountId);
    setRun(mine??null);
  },[platform,accountId]);
  useEffect(()=>{
    let live=true;
    void refresh().catch(e=>{if(live)setError(e instanceof Error?e.message:"Growth unavailable");});
    const timer=setInterval(()=>void refresh().catch(e=>{
      if(live)setError(e instanceof Error?e.message:"Cannot refresh Growth run");
    }),2500);
    return()=>{live=false;clearInterval(timer);};
  },[refresh]);
  async function mutate(fn:()=>Promise<unknown>){
    if(working)return;
    setWorking(true);setError("");
    try{await fn();await refresh();}catch(e){setError(e instanceof Error?e.message:"Request failed");}
    finally{setWorking(false);}
  }
  const active=run?.currentStage;
  const child=run?.currentChild;
  const selectedSections=program?.coverage.filter(section=>active?.sectionIds.includes(section.id))??[];
  const currentEvidence=run?.coverage.find(item=>item.id===evidenceSection);
  if(platform!=="linkedin")return null;
  return <section data-testid="growth-profile-program" className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="max-w-3xl">
        <p className="text-xs font-semibold uppercase tracking-widest text-teal-800">Growth · one composed YAML workflow</p>
        <h2 className="mt-2 text-xl font-semibold text-slate-950">{program?.title??"Profile auditing & section optimization"}</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">{program?.objective??"Loading the profile Growth workflow…"}</p>
      </div>
      <a href={endpoint+"/yaml"} target="_blank" rel="noopener noreferrer"
        className="inline-flex min-h-10 items-center gap-2 text-xs font-semibold text-teal-800 underline">
        <FileCode2 className="size-4"/>View YAML
      </a>
    </header>
    <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-950">
      <ShieldCheck className="mr-2 inline size-4"/>Six dependent Runner audits, not six engines.
      Section coverage stays missing until independent evidence is supplied. No automatic profile edit or growth outcome is implied.
    </p>
    {error&&<p role="alert" className="text-sm text-rose-700">{error}</p>}
    {!accountId&&<p className="rounded-xl border border-slate-200 p-3 text-sm text-slate-600">
      Connect and verify the owner’s LinkedIn account to start the six-stage workflow.
    </p>}
    {accountId&&(!run||run.status!=="active"||["failed","blocked","cancelled","unavailable"].includes(run.state))&&<button type="button" disabled={working||busy||!program}
      onClick={()=>void mutate(async()=>{setRun(await request<Run>(endpoint+"/runs","POST",{accountId}));})}
      className="min-h-11 rounded-xl bg-slate-950 px-5 text-sm font-semibold text-white disabled:opacity-50">
      Start profile Growth workflow
    </button>}
    {program&&<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {program.stages.map((stage,index)=><div key={stage.id}
        className={"rounded-xl border p-4 "+(run?.activeIndex===index?"border-teal-600 bg-teal-50/40":"border-slate-200")}>
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-slate-500">Pipeline {index+1} of {program.stages.length}</span>
          <span className="text-xs text-slate-500">{stage.sectionIds.length} coverage nodes</span>
        </div>
        <h3 className="mt-2 text-sm font-semibold text-slate-950">{stage.title}</h3>
        <p className="mt-1 text-xs leading-5 text-slate-600">Runner: {stage.action} · {stage.stepCount} compiled steps</p>
        <p className="mt-2 text-xs leading-5 text-slate-500">
          {stage.sectionIds.map(id=>program.coverage.find(section=>section.id===id)?.label??id).join(" · ")}
        </p>
        {run&&<span className="mt-2 block text-xs font-semibold text-teal-800">
          {index<run.activeIndex?"Approved Runner pipeline completed":index===run.activeIndex?run.state:"Waiting for dependency"}
        </span>}
      </div>)}
    </div>}
    {run&&<>
      <div className="rounded-xl border border-slate-200 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h3 className="text-sm font-semibold text-slate-950">Run {run.id.slice(0,8)}</h3>
            <p className="mt-1 text-xs text-slate-600">Current stage: {active?.title} · {run.state}</p></div>
          <span className="text-xs font-semibold text-slate-600">
            {run.counts.ownerSupplied}/{run.counts.total} owner-supplied · {run.counts.missing} missing
          </span>
        </div>
        {run.currentPageEvidence&&<p className="mt-3 break-words text-xs leading-5 text-slate-600">
          Runner page evidence: {run.currentPageEvidence.url} · SHA-256 {run.currentPageEvidence.digest.slice(0,16)}…
        </p>}
        {child?.id&&<a href={"/api/runs/"+child.id+"/workflow.yaml"} target="_blank" rel="noopener noreferrer"
          className="mt-2 inline-flex min-h-9 items-center gap-1 text-xs font-semibold text-teal-800 underline">
          Inspect actual Runner YAML <ArrowRight className="size-3.5"/>
        </a>}
        {child?.state==="approval-needed"&&child.checkpoint&&<div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
          <p className="text-sm font-semibold text-amber-950">Owner evidence approval required</p>
          <p className="mt-2 text-xs leading-5 text-amber-900">{child.checkpoint.message}</p>
          <div className="mt-3 flex gap-2">
            {[true,false].map(approved=><button key={String(approved)} type="button" disabled={working}
              className="min-h-10 rounded-lg border border-amber-600 px-3 text-xs font-semibold text-amber-950 disabled:opacity-50"
              onClick={()=>void mutate(()=>request("/api/runs/"+child.id+"/decision","POST",{
                checkpointId:child.checkpoint!.id,approved}))}>
              {approved?"Approve evidence":"Reject"}
            </button>)}
          </div>
        </div>}
        {child?.state==="paused"&&<button type="button" disabled={working} className="mt-3 min-h-10 rounded-lg bg-slate-950 px-4 text-xs font-semibold text-white disabled:opacity-50"
          onClick={()=>void mutate(()=>request("/api/runs/"+child.id+"/resume","POST"))}>
          Resume reviewed Runner stage
        </button>}
        {child?.error&&<p className="mt-3 text-xs text-rose-700" role="alert">{child.error}</p>}
        {run.status==="active"&&child&&["running","paused","approval-needed","input-needed"].includes(child.state)&&
          <button type="button" disabled={working} className="mt-3 ml-2 min-h-10 rounded-lg border border-rose-200 px-3 text-xs font-semibold text-rose-800 disabled:opacity-50"
            onClick={()=>void mutate(()=>request("/api/runs/"+child.id+"/cancel","POST"))}>
            Cancel active Runner pipeline
          </button>}
        {run.canAdvance&&<button type="button" disabled={working||busy}
          className="mt-3 min-h-11 rounded-xl bg-teal-800 px-4 text-sm font-semibold text-white disabled:opacity-50"
          onClick={()=>void mutate(()=>request(endpoint+"/runs/"+run.id+"/advance","POST"))}>
          {run.activeIndex===5?"Finalize evidence report":"Advance to the next dependent pipeline"}
        </button>}
        <p className="mt-3 text-xs leading-5 text-slate-500">{run.outcomeNotice}</p>
      </div>
      {run.status==="active"&&active?.id!=="review"&&<form className="rounded-xl border border-slate-200 p-4"
        onSubmit={event=>{event.preventDefault();if(!evidenceSection)return;
          void mutate(async()=>{await request(endpoint+"/runs/"+run.id+"/evidence","POST",
            {sectionId:evidenceSection,text:evidenceText});setEvidenceText("");});}}>
        <h3 className="text-sm font-semibold text-slate-950">Record independent section evidence</h3>
        <p className="mt-1 text-xs leading-5 text-slate-500">Owner observations are stored as unverified input, never represented as a verified LinkedIn extraction.</p>
        <label className="mt-3 block text-xs font-semibold text-slate-800">
          Coverage section
          <select aria-label="Coverage section" required value={evidenceSection}
            onChange={event=>{setEvidenceSection(event.target.value);setEvidenceText("");}}
            className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3">
            <option value="">Choose a section in the current stage</option>
            {selectedSections.map(section=><option key={section.id} value={section.id}>{section.label}</option>)}
          </select>
        </label>
        <label className="mt-3 block text-xs font-semibold text-slate-800">
          Real owner-supplied observation (10–1500 characters)
          <textarea value={evidenceText} onChange={event=>setEvidenceText(event.target.value)}
            aria-label="Section observation" required minLength={10} maxLength={1500}
            className="mt-1 min-h-24 w-full rounded-lg border border-slate-300 p-3 text-sm"/>
        </label>
        {currentEvidence?.evidence&&<p className="mt-2 text-xs text-slate-500">
          Previously submitted on {new Date(currentEvidence.evidence.capturedAt).toLocaleString()};
          this remains owner-supplied, not independently verified.
        </p>}
        <button type="submit" disabled={working||evidenceText.trim().length<10||!evidenceSection}
          className="mt-3 min-h-10 rounded-lg bg-slate-950 px-4 text-xs font-semibold text-white disabled:opacity-50">
          Save source-labelled evidence
        </button>
      </form>}
      <details className="rounded-xl border border-slate-200 p-4">
        <summary className="cursor-pointer text-sm font-semibold">All 20 independent coverage records</summary>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">{run.coverage.map(item=>
          <li key={item.id} className="flex justify-between gap-2 rounded-lg bg-slate-50 p-3 text-xs text-slate-700">
            <span>{program?.coverage.find(c=>c.id===item.id)?.label??item.id}</span>
            <span className="shrink-0 font-semibold">{item.status==="missing"?"Missing":"Owner reported"}</span>
          </li>)}</ul>
      </details>
    </>}
    {program&&<details className="rounded-xl border border-slate-200 p-4">
      <summary className="cursor-pointer text-sm font-semibold">Nine Growth requirements and registered editing actions</summary>
      <ol className="mt-3 list-decimal space-y-2 pl-5 text-xs leading-5 text-slate-600">{program.requirements.map(item=><li key={item.id}>{item.text}</li>)}</ol>
      <p className="mt-4 text-xs text-slate-500">Editing actions use the existing guarded Pipeline editor separately; the composed sample performs six read-only evidence workflows.</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">{program.pipelines.map(item=>
        <button key={item.id} type="button" disabled={busy} onClick={()=>onSelectAction(item.action)}
          className={"rounded-lg border p-3 text-left text-xs font-semibold disabled:opacity-50 "+
            (selectedAction===item.action?"border-teal-600 bg-teal-50":"border-slate-200")}>
          {item.title}
        </button>)}</div>
    </details>}
  </section>;
}
