import http from 'node:http';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {URL,pathToFileURL} from 'node:url';
import {createHostedAuth} from './auth.mjs';
import {TenantWorkerManager} from './workers.mjs';

const json=(res,status,object)=> {
  res.writeHead(status,{'content-type':'application/json; charset=utf-8',
    'cache-control':'private, no-store','x-content-type-options':'nosniff'});
  res.end(JSON.stringify(object));
};
const reject=(res,status,message)=>json(res,status,{error:message});
const redirect=(res,location,cookies=[])=>{
  res.writeHead(303,{location,'cache-control':'no-store','referrer-policy':'no-referrer',
    ...(cookies.length?{'set-cookie':cookies}:{})});
  res.end();
};
const safePath=raw=>{
  const url=new URL(raw,'https://utomator.invalid');
  let pathname;
  try{pathname=decodeURIComponent(url.pathname);}
  catch{throw Error('Invalid URL encoding');}
  if(pathname.includes('\\')||pathname.includes('\0')||
    pathname.split('/').includes('..'))throw Error('Unsafe URL path');
  return {pathname,search:url.search};
};
const readBody=async req=>{
  const chunks=[];
  let size=0;
  for await(const chunk of req){
    size+=chunk.length;
    if(size>3500000)throw Object.assign(new Error('Request body exceeds hosted limit'),{statusCode:413});
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
};
const publicNextOrigin=value=>{
  const url=new URL(value);
  if(url.protocol!=='http:' || !['127.0.0.1','localhost'].includes(url.hostname) ||
    url.username || url.password || url.pathname!=='/' || url.search || url.hash)
    throw Error('NEXT_LOCAL_ORIGIN must be a loopback HTTP origin');
  return url.origin;
};

export function createHostedGateway({auth,workers,nextOrigin,baseUrl}){
  const upstreamNext=publicNextOrigin(nextOrigin);
  const externalOrigin=new URL(baseUrl).origin;
  const expectedHost=new URL(baseUrl).host;
  let attempts=0;
  let resetAt=Date.now()+60000;

  const proxy=async (req,res,url,isWorker,ownerId) => {
    const worker=isWorker?await workers.start(ownerId):undefined;
    const base=worker ? worker.target : upstreamNext;
    const workerSecret=worker?.secret;
    if(isWorker && (!workerSecret || typeof workerSecret!=='string'))
      throw Error('Tenant worker missing internal authentication secret');
    const controller=new AbortController();
    res.once('close',()=>controller.abort());
    const method=req.method || 'GET';
    const contentType=req.headers['content-type'];
    const headers={
      ...(isWorker?{'x-utomator-worker-token':workerSecret}:{}),
      accept:req.headers.accept || '*/*',
      ...(typeof contentType==='string'?{'content-type':contentType}:{}),
      ...(typeof req.headers['last-event-id']==='string'
        ?{'last-event-id':req.headers['last-event-id']}:{}),
    };
    if(!isWorker){
      // Next App Router requires RSC flight/navigation headers to preserve client routing.
      const nextHeaders=['accept-language','rsc','next-router-state-tree',
        'next-router-prefetch','next-url','next-action','purpose',
        'if-none-match','if-modified-since','user-agent','referer'];
      for(const name of nextHeaders){
        const value=req.headers[name];
        if(typeof value==='string'&&value.length<=16384)headers[name]=value;
      }
    }
    const body=['GET','HEAD'].includes(method)?undefined:await readBody(req);
    const target=isWorker
      ? base + url.pathname.slice('/api'.length) + url.search
      : base + url.pathname + url.search;
    const upstream=await fetch(target,{
      method,headers,body,cache:'no-store',redirect:'manual',signal:controller.signal,
    });
    const out={};
    upstream.headers.forEach((value,key)=>{
      if(['connection','content-length','content-encoding','transfer-encoding',
        'keep-alive','set-cookie'].includes(key.toLowerCase()))return;
      if(key==='location' && !isWorker && value.startsWith(upstreamNext))
        value=externalOrigin+value.slice(upstreamNext.length);
      out[key]=value;
    });
    if(!isWorker){
      const setCookies=upstream.headers.getSetCookie?.()||[];
      if(setCookies.length)out['set-cookie']=setCookies;
    }
    out['cache-control']='private, no-store';
    out['x-content-type-options']='nosniff';
    res.writeHead(upstream.status,out);
    if(!upstream.body){res.end();return;}
    try{await pipeline(Readable.fromWeb(upstream.body),res);}
    catch(error){if(!res.destroyed)res.destroy(error);}
  };

  const handler=async(req,res)=>{
    // Do not trust X-Forwarded-Host or X-Forwarded-Proto from public callers.
    if(req.headers.host!==expectedHost)
      return reject(res,421,'Invalid hosted application host');
    if(!['GET','HEAD','POST','PUT','PATCH','DELETE'].includes(req.method))
      return reject(res,405,'Unsupported method');
    let url;
    try{url=safePath(req.url||'/');}
    catch{return reject(res,400,'Invalid URL');}
    const raw=new URL(req.url||'/',externalOrigin);
    const path=url.pathname;
    const privatePath=/^\/dashboard(?:\/|$)/i.test(path) ||
      /^\/%5fautomate(?:\/|$)/i.test(path);
    const apiPath=/^\/dashboard\/api(?:\/|$)/i.test(path);
    const session=auth.session(req.headers.cookie);
    if(req.method==='GET' && path==='/health')
      return json(res,200,{status:'ok'});
    if(path==='/auth/login' && req.method==='GET'){
      if(session)return redirect(res,'/dashboard');
      if(Date.now()>resetAt){resetAt=Date.now()+60000;attempts=0;}
      if(++attempts>50)return reject(res,429,'Login rate limit reached');
      const begin=await auth.begin();
      return redirect(res,begin.url,[begin.cookie]);
    }
    if(path==='/auth/callback' && req.method==='GET'){
      if(Date.now()>resetAt){resetAt=Date.now()+60000;attempts=0;}
      if(++attempts>50)return reject(res,429,'Login rate limit reached');
      try{
        const result=await auth.callback({
          state:raw.searchParams.get('state'),code:raw.searchParams.get('code'),
        },req.headers.cookie);
        return redirect(res,'/dashboard',result.cookies);
      }catch{return reject(res,401,'Sign-in verification failed');}
    }
    if(path==='/auth/logout' && req.method==='POST'){
      if(!auth.requireOrigin(req.headers.origin))return reject(res,403,'Origin verification required');
      auth.revoke(req.headers.cookie);
      if(session)await workers.stop(session.ownerId);
      return redirect(res,'/',[auth.logoutCookie()]);
    }
    if(path==='/auth/me' && req.method==='GET'){
      return session?json(res,200,{authenticated:true,expiresAt:session.expiresAt})
        :reject(res,401,'Authentication required');
    }
    if(path.startsWith('/auth/'))return reject(res,404,'Unknown authentication endpoint');
    if(privatePath&&!session){
      return apiPath?reject(res,401,'Authentication required')
        :redirect(res,'/auth/login');
    }
    if(privatePath && !['GET','HEAD'].includes(req.method) &&
      (!session || !auth.requireOrigin(req.headers.origin)))
      return reject(res,403,'Authenticated same-origin request required');
    if(apiPath){
      if(req.method==='HEAD'||!/^\/dashboard\/api\/[a-zA-Z0-9._/-]+$/.test(path) ||
        path.split('/').some(part=>part==='.'||part==='..'))
        return reject(res,404,'Unsupported API path');
      // Only the authenticated user's worker receives private API and SSE traffic.
      return proxy(req,res,url,true,session.ownerId);
    }
    // Public portfolio remains publicly viewable. Private pages were gated above.
    return proxy(req,res,url,false,session?.ownerId);
  };
  return http.createServer((req,res)=>{
    Promise.resolve(handler(req,res)).catch(error=>{
      if(!res.headersSent) {
        if(error?.statusCode===413)reject(res,413,'Request body exceeds hosted limit');
        else reject(res,503,'Hosted service temporarily unavailable');
      }
      else if(!res.destroyed)res.destroy();
      // Do not include bearer tokens, cookies or OIDC codes in diagnostics.
      console.error('Hosted gateway request error:',error instanceof Error?error.message:'Unknown error');
    });
  });
}

export async function startHosted(config=process.env){
  for(const key of ['OIDC_ISSUER','OIDC_CLIENT_ID','OIDC_REDIRECT_URI',
    'HOSTED_SESSION_SECRET','HOSTED_OWNER_KEY','HOSTED_TENANT_ROOT']){
    if(!config[key])throw Error('Required hosted setting missing: '+key);
  }
  if([config.HOSTED_SESSION_SECRET,config.HOSTED_OWNER_KEY,config.OIDC_CLIENT_ID]
    .some(value=>/replace-with|configure-with/i.test(value)))
    throw Error('Hosted credentials must be configured with real secrets, not example placeholders');
  const auth=createHostedAuth({
    issuer:config.OIDC_ISSUER,clientId:config.OIDC_CLIENT_ID,
    clientSecret:config.OIDC_CLIENT_SECRET,redirectUri:config.OIDC_REDIRECT_URI,
    sessionSecret:config.HOSTED_SESSION_SECRET,
    ownerKey:config.HOSTED_OWNER_KEY,
  });
  await auth.discovery(); // Fail startup on invalid or unreachable identity provider.
  const workers=new TenantWorkerManager({
    root:config.HOSTED_TENANT_ROOT,
    maxWorkers:Number(config.HOSTED_MAX_WORKERS||20),
  });
  const server=createHostedGateway({
    auth,workers,nextOrigin:config.NEXT_LOCAL_ORIGIN||'http://127.0.0.1:3000',
    baseUrl:config.OIDC_REDIRECT_URI,
  });
  const listenPort=Number(config.HOSTED_PORT||3200);
  if(!Number.isInteger(listenPort)||listenPort<1||listenPort>65535)
    throw Error('Invalid HOSTED_PORT');
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(listenPort,'127.0.0.1',resolve);
  });
  console.info('Hosted gateway listening on loopback port '+listenPort);
  const shutdown=async()=>{server.close();await workers.close();};
  process.once('SIGTERM',()=>{void shutdown();});
  process.once('SIGINT',()=>{void shutdown();});
  return {server,workers,auth,shutdown};
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
  startHosted().catch(error=>{console.error('Hosted startup failed:',error.message);process.exitCode=1;});
}
