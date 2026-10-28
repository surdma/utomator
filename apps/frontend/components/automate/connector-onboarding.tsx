"use client";

import {useCallback,useEffect,useRef,useState} from "react";
import {Check,ChevronRight,ExternalLink,LoaderCircle,Plus,RefreshCw,ShieldCheck,Trash2} from "lucide-react";
import StudioDialog from "@/components/ui/studio-dialog";
import {LinkedInIcon} from "@/components/svgs";

export type Connector={
  id:string;platform:"linkedin"|"x"|"instagram"|"github"|"devto";
  label:string;handle:string;profileUrl:string;
  status:"connected"|"disconnected"|"sign-in-open"|"api-required";
  verifiedAt:string|null;authentication:"browser"|"api-required";interactiveSignIn?:boolean;
};
type Command="connect"|"sync"|"disconnect";
type Result={status?:string;navigationWarning?:string;error?:string};
const path="/api/connectors";
const button="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0a66c2] disabled:cursor-not-allowed disabled:opacity-50";
const shortDate=(value:string|null)=>value?"Checked "+new Date(value).toLocaleString():"Not verified";

export default function ConnectorOnboarding({activeId,onSelect,requestedId,hideTrigger=false,openSignal=0,onManageProfile}:{
  activeId:string|null;onSelect:(item:Connector)=>void;requestedId?:string|null;
  hideTrigger?:boolean;openSignal?:number;onManageProfile?:()=>void;
}){
  const [open,setOpen]=useState(false);
  const [accounts,setAccounts]=useState<Connector[]>([]);
  const [ready,setReady]=useState(false);
  const [selected,setSelected]=useState<string|null>(null);
  const [working,setWorking]=useState<Command|null>(null);
  const [workingId,setWorkingId]=useState<string|null>(null);
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");
  const [confirming,setConfirming]=useState(false);
  const [adding,setAdding]=useState(false);
  const [profileUrl,setProfileUrl]=useState("");
  const [saving,setSaving]=useState(false);
  const [oauth,setOauth]=useState<{connected:boolean;configured:boolean;subject?:string;expiresAt?:string}|null>(null);
  const abortRef=useRef<AbortController|null>(null);
  const handled=useRef(openSignal);
  const last=useRef({activeId,onSelect,accounts});
  useEffect(()=>{last.current={activeId,onSelect,accounts};},[activeId,onSelect,accounts]);

  const refresh=useCallback(async()=>{
    const response=await fetch(path,{cache:"no-store"});
    const data=await response.json() as Connector[]&{error?:string};
    if(!response.ok||!Array.isArray(data))throw Error(data.error||"LinkedIn connections unavailable");
    setAccounts(data);
    const linkedin=data.filter(item=>item.platform==="linkedin");
    const previous=last.current.accounts.find(item=>item.id===last.current.activeId);
    const current=data.find(item=>item.id===last.current.activeId);
    if(current&&previous&&(
      current.status!==previous.status||current.verifiedAt!==previous.verifiedAt
    ))last.current.onSelect(current);
    if(!last.current.activeId){
      const linked=linkedin.find(item=>item.status==="connected");
      if(linked)last.current.onSelect(linked);
    }
    return data;
  },[]);

  useEffect(()=>{
    let active=true;
    void refresh().catch(e=>{if(active)setError(e instanceof Error?e.message:"Unable to load connections");})
      .finally(()=>{if(active)setReady(true);});
    // The backend is authoritative even after another browser tab or device
    // updates the connection. This component is mounted across all app panes.
    const timer=setInterval(()=>void refresh().catch(()=>undefined),15000);
    return()=>{active=false;clearInterval(timer);abortRef.current?.abort();};
  },[refresh]);
  useEffect(()=>{
    if(openSignal===handled.current)return;
    handled.current=openSignal;setOpen(true);setConfirming(false);setError("");setMessage("");
    setSelected(requestedId||last.current.activeId);
    void refresh().catch(()=>undefined);
  },[openSignal,requestedId,refresh]);

  const linkedin=accounts.filter(item=>item.platform==="linkedin");
  const chosen=linkedin.find(item=>item.id===selected)||
    linkedin.find(item=>item.id===activeId)||linkedin[0]||null;

  async function command(id:string,operation:Command){
    if(working||saving)return;
    setError("");setMessage("");setConfirming(false);
    const controller=new AbortController();
    abortRef.current=controller;setWorking(operation);setWorkingId(id);
    const timer=setTimeout(()=>controller.abort(),120000);
    try{
      const response=await fetch(path+"/"+encodeURIComponent(id)+"/"+operation,{
        method:"POST",headers:{"content-type":"application/json"},body:"{}",signal:controller.signal,
      });
      const result=await response.json() as Result;
      if(!response.ok)throw Error(result.error||"LinkedIn connection request failed");
      const updated=(await refresh()).find(row=>row.id===id);
      if(result.status==="connected"){
        if(updated)onSelect(updated);
        setSelected(id);setMessage("LinkedIn session verified.");
      }else if(result.status==="sign-in-open"){
        setSelected(id);setMessage(result.navigationWarning||
          "Finish signing in to LinkedIn in the secure window, then select Verify connection.");
      }else if(result.status==="reconnect-required"){
        setSelected(id);setError("LinkedIn sign-in is incomplete or expired. Finish sign-in, then verify again.");
      }else if(result.status==="temporarily-unavailable"){
        setError("LinkedIn could not be reached. Your previous connection record was preserved.");
      }else if(result.status==="disconnected"){
        if(updated&&activeId===id)onSelect(updated);
        setMessage("LinkedIn disconnected from this workspace.");
      }else throw Error("Unexpected connection response");
    }catch(e){
      setError(controller.signal.aborted?"Connection check stopped. You can retry.":e instanceof Error?e.message:"LinkedIn connection failed");
    }finally{
      clearTimeout(timer);abortRef.current=null;setWorking(null);setWorkingId(null);
    }
  }
  async function addAccount(){
    if(saving||working)return;
    setError("");setMessage("");
    let url:URL;
    try{
      url=new URL(profileUrl.trim());
      if(url.protocol!=="https:"||!["linkedin.com","www.linkedin.com"].includes(url.hostname)||
        url.search||url.hash||url.username||url.password||url.port||
        !/^\/in\/[a-zA-Z0-9_-]{3,100}\/?$/.test(url.pathname))throw Error();
    }catch{
      setError("Enter your LinkedIn profile address, for example https://www.linkedin.com/in/your-name/");
      return;
    }
    setSaving(true);
    try{
      const existing=await fetch("/api/account",{cache:"no-store"});
      const record=await existing.json() as {revision?:number;error?:string};
      if(!existing.ok||!Number.isSafeInteger(record.revision))throw Error(record.error||"Account directory unavailable");
      const handle=url.pathname.split("/")[2]!;
      const response=await fetch("/api/account/social",{
        method:"POST",headers:{"content-type":"application/json"},
        body:JSON.stringify({expectedRevision:record.revision,document:{
          platform:"linkedin",label:handle,handle,profileUrl:"https://www.linkedin.com/in/"+handle+"/",
        }}),
      });
      const result=await response.json() as {socialAccounts?:Array<{id:string;handle:string}>;error?:string};
      if(!response.ok)throw Error(result.error||"Could not add LinkedIn account");
      const row=result.socialAccounts?.find(item=>item.handle===handle);
      if(!row)throw Error("LinkedIn account was saved but could not be selected");
      setSelected(row.id);setAdding(false);setProfileUrl("");
      await refresh();
      setMessage("Account added. Connect LinkedIn to verify its session.");
    }catch(e){setError(e instanceof Error?e.message:"Could not add LinkedIn account");}
    finally{setSaving(false);}
  }

  const busy=Boolean(working)||saving;
  const status=chosen?.status;
  useEffect(()=>{
    if(!chosen?.id){setOauth(null);return;}
    let live=true;
    void fetch("/api/linkedin/oauth/status?accountId="+encodeURIComponent(chosen.id),
      {cache:"no-store"}).then(async response=>{
      if(!response.ok)throw Error("Publishing status unavailable");
      return response.json() as Promise<{connected:boolean;configured:boolean;subject?:string;expiresAt?:string}>;
    }).then(result=>{if(live)setOauth(result);})
      .catch(()=>{if(live)setOauth(null);});
    return()=>{live=false;};
  },[chosen?.id,open]);
  async function authorizePublishing(id:string){
    if(busy)return;
    setError("");setSaving(true);
    try{
      const response=await fetch("/api/linkedin/oauth/start",{
        method:"POST",headers:{"content-type":"application/json"},
        body:JSON.stringify({accountId:id}),
      });
      const result=await response.json() as {authorizationUrl?:string;error?:string};
      if(!response.ok||!result.authorizationUrl)throw Error(result.error||"Authorization unavailable");
      window.location.assign(result.authorizationUrl);
    }catch(e){setError(e instanceof Error?e.message:"Unable to authorize LinkedIn");setSaving(false);}
  }
  const operation:Command=status==="connected"||status==="sign-in-open"?"sync":"connect";
  const actionText=operation==="connect"?"Connect LinkedIn":status==="connected"?"Check connection":"Verify connection";
  const browserLoginAvailable=chosen?.interactiveSignIn!==false;

  return <>
    {!hideTrigger&&<button type="button" onClick={()=>{setOpen(true);void refresh();}} aria-label="Manage connected social accounts"
      className={button+" border border-slate-200 bg-white text-slate-900"}>
      <LinkedInIcon className="size-5"/> LinkedIn {chosen?.status==="connected"?"connected":"connection"}
    </button>}
    <StudioDialog open={open} onDismiss={()=>{if(!busy)setOpen(false);}}
      dismissible={!busy} testId="connector-onboarding-dialog" title="Connect your social accounts"
      description="LinkedIn connection" size="default">
      <div data-testid="linkedin-connector" className="space-y-4">
        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-[#0a66c2] text-white">
            <LinkedInIcon className="size-6"/>
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-semibold text-slate-950">LinkedIn</h3>
            <p className="text-xs text-slate-500">Your professional account</p>
          </div>
          <span data-testid="connector-status" className={"rounded-full px-2.5 py-1 text-xs font-semibold "+
            (status==="connected"?"bg-emerald-100 text-emerald-800":
              status==="sign-in-open"?"bg-amber-100 text-amber-800":"bg-slate-200 text-slate-700")}>
            {status==="connected"?"Session connected":status==="sign-in-open"?"Sign-in in progress":oauth?.connected?"Publishing connected":"Not connected"}
          </span>
        </div>
        {!ready?<p role="status" className="py-6 text-center text-sm text-slate-500">Checking your connections...</p>:<>
          {linkedin.length>1&&<label className="block text-xs font-semibold text-slate-600">LinkedIn account
            <select aria-label="LinkedIn account" value={chosen?.id||""} onChange={e=>{setSelected(e.target.value);setConfirming(false);setError("");}}
              className="mt-2 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm">
              {linkedin.map(item=><option key={item.id} value={item.id}>{item.label} (@{item.handle})</option>)}
            </select>
          </label>}
          {chosen?<div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-900">{chosen.label}</p>
                <p className="mt-1 truncate text-xs text-slate-500">@{chosen.handle}</p>
              </div>
              {activeId===chosen.id&&status==="connected"&&
                <span className="flex items-center gap-1 text-xs font-semibold text-emerald-700"><Check className="size-4"/>In use</span>}
            </div>
            <p className="mt-3 text-xs text-slate-500" title={chosen.verifiedAt||undefined}>
              {status==="connected"?shortDate(chosen.verifiedAt):status==="sign-in-open"?
                "Sign in securely, then verify.":"Connect to start using supported workflows."}
            </p>
          </div>:<p className="py-2 text-center text-sm text-slate-600">Add a LinkedIn profile to get started.</p>}
          {error&&<p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-800">{error}</p>}
          {message&&<p role="status" className="rounded-xl bg-teal-50 px-3 py-2 text-xs leading-5 text-teal-900">{message}</p>}
          {chosen&&<div className="flex flex-col gap-2">
            {browserLoginAvailable?<button type="button" disabled={busy} onClick={()=>void command(chosen.id,operation)}
              className={button+" w-full bg-[#0a66c2] text-white hover:bg-[#0857a8]"}>
              {working&&workingId===chosen.id?<LoaderCircle className="size-4 animate-spin"/>:
                status==="connected"?<RefreshCw className="size-4"/>:<LinkedInIcon className="size-4"/>}
              {working&&workingId===chosen.id?"Checking LinkedIn...":actionText}
            </button>:<button type="button" disabled={busy||!oauth?.configured} onClick={()=>void authorizePublishing(chosen.id)}
              className={button+" w-full bg-[#0a66c2] text-white hover:bg-[#0857a8]"}>
              <LinkedInIcon className="size-4"/>{oauth?.connected?"Renew LinkedIn publishing":"Connect LinkedIn for publishing"}
            </button>}
            {!browserLoginAvailable&&<p className="text-xs text-slate-500">
              Browser-based workflows need an interactive connection host. This sign-in authorizes only supported API publishing.
            </p>}
            {working&&<button type="button" onClick={()=>abortRef.current?.abort()} className="min-h-10 text-xs font-semibold text-slate-600">Cancel</button>}
            {status==="connected"&&activeId!==chosen.id&&<button type="button" disabled={busy}
              onClick={()=>{onSelect(chosen);setMessage("LinkedIn is selected for your workspace.");}}
              className={button+" w-full border border-slate-200 bg-white text-slate-800"}>
              Use this account <ChevronRight className="size-4"/>
            </button>}
            {status==="sign-in-open"&&<p className="text-center text-xs text-slate-500">Complete any LinkedIn sign-in or verification prompts in the opened window.</p>}
            {browserLoginAvailable&&oauth?.configured&&<details className="rounded-xl border border-slate-200 p-3 text-xs text-slate-600">
              <summary className="cursor-pointer font-semibold text-slate-800">
                Publishing access: {oauth.connected?"Authorized":"Not authorized"}
              </summary>
              <button type="button" disabled={busy} onClick={()=>void authorizePublishing(chosen.id)}
                className={button+" mt-3 w-full border border-slate-200 bg-white text-[#0a66c2]"}>
                {oauth.connected?"Renew publishing access":"Authorize publishing"}
              </button>
            </details>}
            {confirming?<div className="flex gap-2">
              <button type="button" disabled={busy} onClick={()=>void command(chosen.id,"disconnect")}
                className={button+" flex-1 border border-rose-300 bg-rose-50 text-rose-800"}>Confirm disconnect</button>
              <button type="button" onClick={()=>setConfirming(false)} className={button+" border border-slate-200"}>Cancel</button>
            </div>:status==="connected"&&<button type="button" disabled={busy}
              onClick={()=>setConfirming(true)} className="mx-auto flex min-h-10 items-center gap-2 text-xs font-semibold text-slate-500 hover:text-rose-700">
              <Trash2 className="size-3.5"/> Disconnect
            </button>}
          </div>}
          {adding?<div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
            <label className="block text-xs font-semibold text-slate-700">LinkedIn profile address
              <input aria-label="LinkedIn profile address" value={profileUrl} onChange={e=>setProfileUrl(e.target.value)}
                type="url" placeholder="https://www.linkedin.com/in/your-name/"
                className="mt-2 min-h-11 w-full rounded-lg border border-slate-200 px-3 text-sm"/>
            </label>
            <div className="flex gap-2">
              <button type="button" disabled={busy} className={button+" flex-1 bg-slate-950 text-white"} onClick={()=>void addAccount()}>
                {saving?"Saving...":"Add account"}
              </button>
              <button type="button" disabled={busy} className={button+" border border-slate-200"} onClick={()=>setAdding(false)}>Cancel</button>
            </div>
          </div>:<button type="button" disabled={busy} onClick={()=>setAdding(true)}
            className="mx-auto flex min-h-10 items-center gap-2 text-xs font-semibold text-[#0a66c2]">
            <Plus className="size-4"/> Add another LinkedIn account
          </button>}
          {onManageProfile&&<button type="button" onClick={()=>{setOpen(false);onManageProfile();}}
            className="mx-auto flex min-h-10 items-center gap-1 text-xs text-slate-500 hover:text-slate-800">
            Manage profiles <ExternalLink className="size-3.5"/>
          </button>}
        </>}
        <p className="flex items-start gap-2 border-t border-slate-100 pt-3 text-[11px] leading-5 text-slate-500">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-[#0a66c2]"/>
          Your login stays in Utomator's private server-side session. LinkedIn may ask you to sign in again if that session expires. Supported actions still require permission and review.
        </p>
      </div>
    </StudioDialog>
  </>;
}
