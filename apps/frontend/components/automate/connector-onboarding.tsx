"use client";

import {useCallback,useEffect,useRef,useState} from "react";
import {Check,ChevronRight,ExternalLink,LoaderCircle,RefreshCw,ShieldCheck,Trash2,Monitor,Smartphone,LockKeyhole,Radio} from "lucide-react";
import {providerMeta,type ProviderKey} from "./provider-meta";
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
type Capabilities={browserAvailable:boolean;mode:"attached"|"isolated";mobileBrowserSession:boolean};
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
  const [network,setNetwork]=useState<ProviderKey>("linkedin");
  const [saving,setSaving]=useState(false);
  const [capabilities,setCapabilities]=useState<Capabilities|null>(null);
  const [mobileClient,setMobileClient]=useState(false);
  const [oauth,setOauth]=useState<{connected:boolean;configured:boolean;subject?:string;expiresAt?:string}|null>(null);
  const abortRef=useRef<AbortController|null>(null);
  const handled=useRef(openSignal);
  const last=useRef({activeId,onSelect,accounts});
  useEffect(()=>{last.current={activeId,onSelect,accounts};},[activeId,onSelect,accounts]);
  useEffect(()=>{
    setMobileClient(/Android|iPhone|iPad|iPod/i.test(navigator.userAgent));
    let live=true;
    void fetch(path+"/capabilities",{cache:"no-store"})
      .then(async response=>{if(!response.ok)throw Error("Capabilities unavailable");return response.json() as Promise<Capabilities>})
      .then(value=>{if(live)setCapabilities(value);})
      .catch(()=>{if(live)setCapabilities({browserAvailable:false,mode:"isolated",mobileBrowserSession:false});});
    return()=>{live=false;};
  },[]);

  const refresh=useCallback(async()=>{
    const response=await fetch(path,{cache:"no-store"});
    const data=await response.json() as Connector[]&{error?:string};
    if(!response.ok||!Array.isArray(data))throw Error(data.error||"Social connections unavailable");
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
    const target=requestedId||last.current.activeId;
    setSelected(target);
    const match=last.current.accounts.find(item=>item.id===target);
    if(match)setNetwork(match.platform);
    void refresh().catch(()=>undefined);
  },[openSignal,requestedId,refresh]);

  // Check the provider tab without touching it until ownership can be proven.
  const pendingIds=accounts.filter(item=>item.status==="sign-in-open").map(item=>item.id).join(",");
  useEffect(()=>{
    if(!pendingIds)return;
    let live=true,inFlight=false;
    const check=async()=>{
      if(!live||inFlight)return;
      inFlight=true;
      try{
        for(const id of pendingIds.split(",")){
          const response=await fetch(path+"/"+encodeURIComponent(id)+"/check",{
            method:"POST",headers:{"content-type":"application/json"},body:"{}",
          });
          if(!response.ok)continue;
          const result=await response.json() as Result;
          if(result.status==="connected"){
            const updated=(await refresh()).find(item=>item.id===id);
            if(live&&updated?.status==="connected"){
              setSelected(id);setNetwork(updated.platform);
              setMessage(providerMeta[updated.platform].name+" session verified.");
              onSelect(updated);
            }
          }
        }
      }catch{/* Keep waiting on network outages; manual retry remains available. */}
      finally{inFlight=false;}
    };
    const timer=setInterval(()=>void check(),3500);
    return()=>{live=false;clearInterval(timer);};
  },[pendingIds,refresh,onSelect]);
  const available=accounts.filter(item=>item.platform===network);
  const chosen=available.find(item=>item.id===selected)||
    available.find(item=>item.id===activeId)||available[0]||null;

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
        setSelected(id);setMessage(providerMeta[updated?.platform||network].name+" session verified.");
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
  async function beginNewConnection(provider:"linkedin"|"x"){
    if(working||saving||!capabilities?.browserAvailable||mobileClient)return;
    setError("");setMessage("");setSaving(true);
    try{
      const response=await fetch(path+"/start",{
        method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({platform:provider}),
      });
      const result=await response.json() as Result&{accountId?:string};
      if(!response.ok||!result.accountId)throw Error(result.error||"Could not open provider sign-in");
      setNetwork(provider);setSelected(result.accountId);
      await refresh();
      setMessage(result.navigationWarning||"Complete provider sign-in in Chrome, then select Verify connection.");
    }catch(e){setError(e instanceof Error?e.message:"Could not start connection");}
    finally{setSaving(false);}
  }

  const busy=Boolean(working)||saving;
  const status=chosen?.status;
  useEffect(()=>{
    if(!chosen?.id||chosen.platform!=="linkedin"||chosen.status==="sign-in-open"){setOauth(null);return;}
    let live=true;
    void fetch("/api/linkedin/oauth/status?accountId="+encodeURIComponent(chosen.id),
      {cache:"no-store"}).then(async response=>{
      if(!response.ok)throw Error("Publishing status unavailable");
      return response.json() as Promise<{connected:boolean;configured:boolean;subject?:string;expiresAt?:string}>;
    }).then(result=>{if(live)setOauth(result);})
      .catch(()=>{if(live)setOauth(null);});
    return()=>{live=false;};
  },[chosen?.id,chosen?.status,open]);
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
  const actionText=operation==="connect"?"Connect "+providerMeta[network].name:status==="connected"?"Check connection":"Verify connection";
  const browserLoginAvailable=chosen?.interactiveSignIn!==false&&capabilities?.browserAvailable===true&&!mobileClient;
  const canStart=Boolean(capabilities?.browserAvailable)&&!mobileClient;
  const NetworkIcon=providerMeta[network].icon;
  const browserSupported=network==="linkedin"||network==="x";

  return <>
    {!hideTrigger&&<button type="button" onClick={()=>{setOpen(true);void refresh();}} aria-label="Manage connected social accounts"
      className={button+" border border-slate-200 bg-white text-slate-900"}>
      <LinkedInIcon className="size-5"/> LinkedIn {chosen?.status==="connected"?"connected":"connection"}
    </button>}
    <StudioDialog open={open} onDismiss={()=>{if(!busy)setOpen(false);}}
      dismissible={!busy} testId="connector-onboarding-dialog" title="Connect your social accounts"
      description="Verified social identities and local browser permissions" size="wide">
      <div data-testid="linkedin-connector" className="mx-auto max-w-4xl space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-teal-700">Connection studio</p>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">Choose a provider and sign in securely. Utomator discovers the verified account automatically; no profile URL is required.</p>
          </div>
          <span className="inline-flex shrink-0 items-center gap-2 self-start rounded-full bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700"><LockKeyhole className="size-4"/> One account per provider</span>
        </div>
        <div aria-label="Social networks" className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {(["linkedin","x","instagram","github","devto"] as const).map(key=><button key={key} type="button"
            aria-pressed={network===key} onClick={()=>{setNetwork(key);setSelected(null);setError("");setMessage("");}}
            className={"flex min-h-14 items-center justify-center gap-2 rounded-2xl border px-3 py-3 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600 "+(network===key?"border-slate-900 bg-slate-900 text-white":"border-slate-200 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50")}>
            {(() => {const Icon=providerMeta[key].icon;return <Icon className="size-4 shrink-0"/>;})()}{providerMeta[key].name}</button>)}
        </div>
        <div className="flex flex-wrap items-center gap-3 rounded-3xl bg-slate-950 p-5 text-white sm:p-6">
          <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-white/15 text-white">
            <NetworkIcon className="size-6"/>
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-semibold text-white">{providerMeta[network].name}</h3>
            <p className="text-sm leading-5 text-slate-300">Verify ownership before any automation runs</p>
          </div>
          <span data-testid="connector-status" className={"ml-auto rounded-full px-3 py-2 text-xs font-semibold "+
            (status==="connected"?"bg-emerald-100 text-emerald-800":
              status==="sign-in-open"?"bg-amber-100 text-amber-900":"bg-white/15 text-white")}>
            {status==="connected"?"Session connected":status==="sign-in-open"?"Sign-in in progress":status==="api-required"||!browserSupported?"Unavailable":oauth?.connected?"Publishing connected":"Not connected"}
          </span>
        </div>
        <ol aria-label="Connection progress" className="grid grid-cols-3 gap-2 text-center text-xs font-semibold text-slate-700">
          {["Choose provider","Sign in","Verify identity"].map((step,index)=><li key={step} className={"rounded-xl border px-2 py-3 "+(index===0||(index===1&&status)||(index===2&&status==="connected")?"border-teal-200 bg-teal-50 text-teal-900":"border-slate-200 bg-slate-50")}>{index+1}. {step}</li>)}
        </ol>
        <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-700">
          {mobileClient?<Smartphone className="mt-1 size-5 shrink-0"/>:<Monitor className="mt-1 size-5 shrink-0"/>}
          <p>{mobileClient?"Mobile Chrome and Safari cannot share their authenticated tabs with server-side Playwright. Use provider OAuth when supported; local browser linking requires desktop.":
            !capabilities?.browserAvailable?"This server cannot open an interactive login on your device. Connect through a local desktop agent or a supported OAuth provider.":
            capabilities.mode==="attached"?"Local Chrome attachment enabled: sign-in opens a new tab in your authorized Chrome profile.":
            "Isolated Chrome mode: the browser has its own profile. To reuse an existing Chrome login, opt in to local Chrome attachment."}</p>
        </div>
        {!ready?<p role="status" className="py-6 text-center text-sm text-slate-500">Checking your connections...</p>:<>
          {available.length>1&&<label className="block text-xs font-semibold text-slate-600">Legacy linked accounts
            <select aria-label="Legacy linked account" value={chosen?.id||""} onChange={e=>{setSelected(e.target.value);setConfirming(false);setError("");}}
              className="mt-2 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm">
              {available.map(item=><option key={item.id} value={item.id}>{item.label} (@{item.handle})</option>)}
            </select>
          </label>}
          {available.length>1&&<p role="alert" className="text-xs text-amber-800">Legacy duplicates detected. Remove the extra identities from your profile before linking a replacement.</p>}
          {chosen?<div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="break-words [overflow-wrap:anywhere] text-sm font-semibold text-slate-900">{chosen.label}</p>
                <p className="mt-1 break-words [overflow-wrap:anywhere] text-xs text-slate-500">@{chosen.handle}</p>
              </div>
              {activeId===chosen.id&&status==="connected"&&
                <span className="flex items-center gap-1 text-xs font-semibold text-emerald-700"><Check className="size-4"/>In use</span>}
            </div>
            <p className="mt-3 text-xs text-slate-500" title={chosen.verifiedAt||undefined}>
              {status==="connected"?shortDate(chosen.verifiedAt):status==="sign-in-open"?
                "Waiting for provider sign-in. Automatic checks continue without reloading your login page.":"Connect to start using supported workflows."}
            </p>
          </div>:<div className="rounded-xl border border-slate-200 bg-white p-4 text-center">
            <p className="text-sm text-slate-600">No {providerMeta[network].name} account linked. Sign in with the provider to discover your profile automatically.</p>
            {browserSupported?<button type="button" disabled={busy||!canStart} className={button+" mt-3 bg-slate-950 px-5 text-white"}
              onClick={()=>void beginNewConnection(network as "linkedin"|"x")}>Connect {providerMeta[network].name}</button>:
              <p className="mt-3 text-xs font-semibold text-amber-800">Official API connector not available yet. Sync is disabled.</p>}
          </div>}
          {error&&<p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-800">{error}</p>}
          {message&&<p role="status" className="rounded-xl bg-teal-50 px-3 py-2 text-xs leading-5 text-teal-900">{message}</p>}
          {chosen&&browserSupported&&<div className="flex flex-col gap-2">
            {browserLoginAvailable?<button type="button" disabled={busy} onClick={()=>void command(chosen.id,operation)}
              className={button+" w-full bg-[#0a66c2] text-white hover:bg-[#0857a8]"}>
              {working&&workingId===chosen.id?<LoaderCircle className="size-4 animate-spin"/>:
                status==="connected"?<RefreshCw className="size-4"/>:<NetworkIcon className="size-4"/>}
              {working&&workingId===chosen.id?"Checking connection...":actionText}
            </button>:network==="linkedin"?<button type="button" disabled={busy||!oauth?.configured} onClick={()=>void authorizePublishing(chosen.id)}
              className={button+" w-full bg-[#0a66c2] text-white hover:bg-[#0857a8]"}>
              <LinkedInIcon className="size-4"/>{oauth?.connected?"Renew LinkedIn publishing":"Connect LinkedIn for publishing"}
            </button>:<p className="text-sm text-amber-800">Local desktop connector unavailable. This provider cannot use mobile browser cookies.</p>}
            {!browserLoginAvailable&&<p className="text-xs text-slate-500">
              Browser-based workflows need an interactive connection host. This sign-in authorizes only supported API publishing.
            </p>}
            {working&&<button type="button" onClick={()=>abortRef.current?.abort()} className="min-h-11 text-xs font-semibold text-slate-600">Cancel</button>}
            {network==="linkedin"&&status==="connected"&&activeId!==chosen.id&&<button type="button" disabled={busy}
              onClick={()=>{onSelect(chosen);setMessage("LinkedIn is selected for your workspace.");}}
              className={button+" w-full border border-slate-200 bg-white text-slate-800"}>
              Use this account <ChevronRight className="size-4"/>
            </button>}
            {status==="sign-in-open"&&<>
              <p role="status" className="flex items-center justify-center gap-2 rounded-xl bg-teal-50 p-3 text-sm text-teal-900"><Radio className="size-4 animate-pulse"/> Automatically checking sign-in. Verify now is also available.</p>
              <button type="button" disabled={busy} onClick={()=>void command(chosen.id,"disconnect")}
                className={button+" w-full border border-slate-200 text-slate-700"}>Cancel connection</button>
            </>}
            {network==="linkedin"&&browserLoginAvailable&&oauth?.configured&&<details className="rounded-xl border border-slate-200 p-3 text-xs text-slate-600">
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
              onClick={()=>setConfirming(true)} className="mx-auto flex min-h-11 items-center gap-2 text-xs font-semibold text-slate-500 hover:text-rose-700">
              <Trash2 className="size-3.5"/> Disconnect
            </button>}
          </div>}
          {onManageProfile&&<button type="button" onClick={()=>{setOpen(false);onManageProfile();}}
            className="mx-auto flex min-h-11 items-center gap-1 text-xs text-slate-500 hover:text-slate-800">
            Manage profiles <ExternalLink className="size-3.5"/>
          </button>}
        </>}
        <p className="flex items-start gap-2 border-t border-slate-100 pt-3 text-[11px] leading-5 text-slate-500">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-[#0a66c2]"/>
          Utomator does not collect your social password. A local Chrome attachment is opt-in, and hosted or mobile use requires official provider authorization. Workflows still require permission and review.
        </p>
      </div>
    </StudioDialog>
  </>;
}
