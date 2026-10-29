"use client";

import {useCallback,useEffect,useRef,useState} from "react";
import {LoaderCircle} from "lucide-react";
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
    void refresh().catch(e=>setError(e instanceof Error?e.message:"Unable to load connections"));
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
  const browserSupported=network==="linkedin"||network==="x";

  return <>
    {!hideTrigger&&<button type="button" onClick={()=>{setOpen(true);void refresh().catch(e=>setError(e instanceof Error?e.message:"Unable to load connections"));}} aria-label="Manage connected social accounts"
      className={button+" border border-slate-200 bg-white text-slate-900"}>
      <LinkedInIcon className="size-5"/> LinkedIn {chosen?.status==="connected"?"connected":"connection"}
    </button>}
    <StudioDialog open={open} onDismiss={()=>{if(!busy)setOpen(false);}}
      dismissible={!busy} testId="connector-onboarding-dialog" title="Connect your social accounts"
      description="Choose a network and verify the account you want to use.">
      <div data-testid="linkedin-connector" className="mx-auto flex max-w-2xl flex-col gap-5">
        <section aria-labelledby="connector-network-heading">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-x-3 gap-y-1">
            <h3 id="connector-network-heading" className="text-sm font-semibold text-slate-900">Select a network</h3>
            <p className="text-xs text-slate-500">One account per network</p>
          </div>
          <div aria-label="Social networks" className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {(["linkedin","x","instagram","github","devto"] as const).map(key=>{
              const Icon=providerMeta[key].icon;
              return <button key={key} type="button" aria-pressed={network===key}
                onClick={()=>{setNetwork(key);setSelected(null);setConfirming(false);setError("");setMessage("");}}
                className={"flex min-h-12 min-w-0 items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-950 "+(key==="devto"?"col-span-2 sm:col-span-1 ":"")+
                  (network===key?"border-slate-950 bg-slate-950 text-white":"border-slate-200 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50")}>
                <Icon className="size-5! shrink-0" aria-hidden="true"/>
                <span className="min-w-0">{providerMeta[key].name}</span>
              </button>;
            })}
          </div>
        </section>

        <section aria-label={providerMeta[network].name+" connection"} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-4 py-3.5 sm:px-5">
            <div className="min-w-0">
              <p className="text-xs font-medium text-slate-500">Selected network</p>
              <h3 className="text-lg font-semibold leading-7 text-slate-950">{providerMeta[network].name}</h3>
            </div>
            <span data-testid="connector-status" className={"inline-flex min-h-8 max-w-full items-center rounded-full px-3 py-1 text-xs font-semibold leading-5 "+
              (status==="connected"?"bg-emerald-100 text-emerald-900":
                status==="sign-in-open"?"bg-amber-100 text-amber-950":
                status==="api-required"||!browserSupported?"bg-slate-200 text-slate-700":"bg-white text-slate-700 ring-1 ring-inset ring-slate-200")}>
              {status==="connected"?"Session connected":status==="sign-in-open"?"Sign-in in progress":status==="api-required"||!browserSupported?"Unavailable":oauth?.connected?"Publishing connected":"Not connected"}
            </span>
          </div>

          <div className="flex flex-col gap-4 p-4 sm:p-5">
            {!ready?<p role="status" className="py-6 text-center text-sm text-slate-600">Checking your connections...</p>:<>
              {available.length>1&&<>
                <label className="flex flex-col gap-2 text-sm font-medium text-slate-800">
                  Legacy linked accounts
                  <select aria-label="Legacy linked account" value={chosen?.id||""}
                    onChange={e=>{setSelected(e.target.value);setConfirming(false);setError("");}}
                    className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm">
                    {available.map(item=><option key={item.id} value={item.id}>{item.label} (@{item.handle})</option>)}
                  </select>
                </label>
                <p role="alert" className="rounded-xl bg-amber-50 p-3 text-sm leading-5 text-amber-900">
                  Legacy duplicates detected. Remove the extra identities from your profile before linking a replacement.
                </p>
              </>}
              {chosen?<div className="min-w-0">
                <p className="break-words text-base font-semibold leading-6 text-slate-950 [overflow-wrap:anywhere]">{chosen.label}</p>
                {chosen.handle&&<p className="mt-1 break-words text-sm leading-5 text-slate-600 [overflow-wrap:anywhere]">@{chosen.handle}</p>}
                {activeId===chosen.id&&status==="connected"&&
                  <p className="mt-2 text-xs font-semibold text-emerald-800">In use in your workspace</p>}
                <p className="mt-3 text-sm leading-6 text-slate-600" title={chosen.verifiedAt||undefined}>
                  {status==="connected"?shortDate(chosen.verifiedAt):status==="sign-in-open"?
                    "Finish signing in with the provider. We will check for completion automatically.":
                    "This account needs a verified session before workflows can run."}
                </p>
              </div>:<div className="flex flex-col gap-3">
                {browserSupported?<p className="text-sm leading-6 text-slate-600">
                  No {providerMeta[network].name} account linked. Sign in with the provider and your profile will be detected automatically.
                </p>:<p className="rounded-xl bg-slate-50 p-3 text-sm leading-6 text-slate-700">
                  Official API connector not available yet. Sync is disabled.
                </p>}
                {browserSupported&&<button type="button" disabled={busy||!canStart}
                  className={button+" w-full bg-slate-950 text-white hover:bg-slate-800"}
                  onClick={()=>void beginNewConnection(network as "linkedin"|"x")}>
                  {saving?<LoaderCircle className="size-4 animate-spin" aria-hidden="true"/>:null}
                  Connect {providerMeta[network].name}
                </button>}
              </div>}
              {error&&<p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm leading-6 text-rose-900">{error}</p>}
              {message&&<p role="status" className="rounded-xl border border-teal-200 bg-teal-50 p-3 text-sm leading-6 text-teal-950">{message}</p>}

              {chosen&&browserSupported&&<div className="flex flex-col gap-3">
                {browserLoginAvailable?<button type="button" disabled={busy}
                  onClick={()=>void command(chosen.id,operation)}
                  className={button+" w-full bg-slate-950 text-white hover:bg-slate-800"}>
                  {working&&workingId===chosen.id?<LoaderCircle className="size-4 animate-spin" aria-hidden="true"/>:null}
                  {working&&workingId===chosen.id?"Checking connection...":actionText}
                </button>:network==="linkedin"?<button type="button" disabled={busy||!oauth?.configured}
                  onClick={()=>void authorizePublishing(chosen.id)}
                  className={button+" w-full bg-slate-950 text-white hover:bg-slate-800"}>
                  {oauth?.connected?"Renew LinkedIn publishing":"Connect LinkedIn for publishing"}
                </button>:<p className="text-sm leading-6 text-amber-900">
                  Local desktop connector unavailable. This provider cannot use mobile browser cookies.
                </p>}
                {!browserLoginAvailable&&<p className="text-sm leading-6 text-slate-600">
                  Browser-based workflows need an interactive connection host. Publishing authorization does not grant browser access.
                </p>}
                {working&&<button type="button" onClick={()=>abortRef.current?.abort()}
                  className={button+" w-full border border-slate-200 text-slate-700 hover:bg-slate-50"}>Cancel</button>}
                {network==="linkedin"&&status==="connected"&&activeId!==chosen.id&&<button type="button" disabled={busy}
                  onClick={()=>{onSelect(chosen);setMessage("LinkedIn is selected for your workspace.");}}
                  className={button+" w-full border border-slate-200 bg-white text-slate-800 hover:bg-slate-50"}>
                  Use this account
                </button>}
                {status==="sign-in-open"&&<>
                  <p role="status" className="rounded-xl bg-blue-50 p-3 text-sm leading-6 text-blue-950">
                    Automatically checking sign-in. You can also verify now.
                  </p>
                  <button type="button" disabled={busy} onClick={()=>void command(chosen.id,"disconnect")}
                    className={button+" w-full border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}>
                    Cancel connection
                  </button>
                </>}
                {network==="linkedin"&&browserLoginAvailable&&oauth?.configured&&<details className="rounded-xl border border-slate-200 p-3 text-sm text-slate-700">
                  <summary className="min-h-11 cursor-pointer py-3 font-medium text-slate-800">
                    Publishing access: {oauth.connected?"Authorized":"Not authorized"}
                  </summary>
                  <button type="button" disabled={busy} onClick={()=>void authorizePublishing(chosen.id)}
                    className={button+" mt-2 w-full border border-slate-200 bg-white text-slate-800 hover:bg-slate-50"}>
                    {oauth.connected?"Renew publishing access":"Authorize publishing"}
                  </button>
                </details>}
                {confirming?<div className="grid grid-cols-2 gap-2">
                  <button type="button" disabled={busy} onClick={()=>void command(chosen.id,"disconnect")}
                    className={button+" border border-rose-300 bg-rose-50 px-2 text-rose-900 hover:bg-rose-100"}>Confirm disconnect</button>
                  <button type="button" onClick={()=>setConfirming(false)}
                    className={button+" border border-slate-200 px-2 text-slate-800 hover:bg-slate-50"}>Cancel</button>
                </div>:status==="connected"&&<button type="button" disabled={busy}
                  onClick={()=>setConfirming(true)}
                  className="inline-flex min-h-11 w-full items-center justify-center rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-rose-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-950">
                  Disconnect
                </button>}
              </div>}
              <div className="rounded-xl bg-slate-50 px-3 py-3 text-sm leading-6 text-slate-600">
                <p>{mobileClient?"Mobile Chrome and Safari cannot share their authenticated tabs with server-side Playwright. Local browser linking requires a desktop session.":
                  !capabilities?.browserAvailable?"This server cannot open an interactive login on your device. Use a local desktop agent or a supported provider authorization.":
                  capabilities.mode==="attached"?"Local Chrome attachment enabled. Sign-in opens in a new tab in your authorized Chrome profile.":
                  "Isolated Chrome mode uses a separate browser profile. To reuse a Chrome login, opt in to local Chrome attachment."}</p>
              </div>
              {onManageProfile&&<button type="button" onClick={()=>{setOpen(false);onManageProfile();}}
                className={button+" w-full border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}>
                Manage profiles
              </button>}
            </>}
          </div>
        </section>

        <p className="px-1 text-xs leading-5 text-slate-600">
          Utomator does not collect your social password. Local Chrome attachment is optional.
          Hosted and mobile connections require supported provider authorization; workflows still require your review.
        </p>
      </div>
    </StudioDialog>
  </>;
}
