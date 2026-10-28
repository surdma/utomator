import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {once} from 'node:events';
import {createHostedGateway} from '../hosted/server.mjs';

async function server(handler){
  const srv=http.createServer(handler);
  srv.listen(0,'127.0.0.1');
  await once(srv,'listening');
  return {srv,origin:'http://127.0.0.1:'+srv.address().port};
}
const request=(origin,path,options={})=>new Promise((resolve,reject)=>{
  const url=new URL(origin+path);
  const req=http.request(url,{
    method:options.method||'GET',
    headers:{host:'utomator.example.test',...(options.cookie?{cookie:options.cookie}:{}),
      ...(options.origin?{origin:options.origin}:{}),
      ...(options.body?{'content-type':'application/json'}:{})},
  },res=>{
    const chunks=[];
    res.on('data',data=>chunks.push(data));
    res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,
      body:Buffer.concat(chunks).toString('utf8')}));
  });
  req.on('error',reject);
  req.end(options.body);
});

test('authenticated hosted gateway authorizes UI, API, SSE, mutations and selects isolated workers',async()=>{
  const first=await server((req,res)=>{
    if(req.url.startsWith('/events/')){
      res.setHeader('content-type','text/event-stream');
      res.write('event: status\ndata: {"owner":"alice"}\n\n');
      res.end();
      return;
    }
    res.setHeader('content-type','application/json');
    res.end(JSON.stringify({owner:'alice',path:req.url,origin:req.headers.origin||null}));
  });
  const second=await server((req,res)=>{
    res.setHeader('content-type','application/json');
    res.end(JSON.stringify({owner:'bob',path:req.url,origin:req.headers.origin||null}));
  });
  const next=await server((req,res)=>{
    res.setHeader('content-type','text/html');
    res.end('<h1>Utomator '+req.url+'</h1>');
  });
  let stops=0;
  const starts=[];
  const workers={
    async start(ownerId){
      starts.push(ownerId);
      return {target:ownerId==='owner-alice'?first.origin:second.origin,secret:'test-worker-token'};
    },
    async stop(){stops++;}
  };
  const auth={
    session(cookie){
      if(cookie==='sid=alice')return {ownerId:'owner-alice',expiresAt:1000};
      if(cookie==='sid=bob')return {ownerId:'owner-bob',expiresAt:1000};
      return null;
    },
    requireOrigin:origin=>origin==='https://utomator.example.test',
    begin:async()=>({url:'https://identity.example.test/authorize',cookie:'state=a; HttpOnly'}),
    callback:async()=>({cookies:['sid=alice; HttpOnly']}),
    revoke:()=>{},
    logoutCookie:()=> 'sid=; Max-Age=0',
  };
  const gateway=createHostedGateway({
    auth,workers,nextOrigin:next.origin,
    baseUrl:'https://utomator.example.test/auth/callback',
  });
  gateway.listen(0,'127.0.0.1');
  await once(gateway,'listening');
  const origin='http://127.0.0.1:'+gateway.address().port;
  try{
    const publicPage=await request(origin,'/');
    assert.equal(publicPage.status,200);
    assert.match(publicPage.body,/Utomator/);
    for(const page of ['/dashboard','/editorial','/growth','/research','/history','/library','/profile','/resumes','/observer','/memory','/settings']){
      const privatePage=await request(origin,page);
      assert.equal(privatePage.status,303,page+' should require authentication');
      assert.equal(privatePage.headers.location,'/auth/login');
    }
    const anonymous=await request(origin,'/api/runs');
    assert.equal(anonymous.status,401);
    assert.deepEqual(starts,[]);
    const alice=await request(origin,'/api/runs/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/logs',
      {cookie:'sid=alice'});
    const bob=await request(origin,'/api/runs',{cookie:'sid=bob'});
    assert.equal(JSON.parse(alice.body).owner,'alice');
    assert.equal(JSON.parse(bob.body).owner,'bob');
    assert.deepEqual(starts,['owner-alice','owner-bob']);
    const allowed=await request(origin,'/api/runs',{
      method:'POST',cookie:'sid=alice',origin:'https://utomator.example.test',
      body:JSON.stringify({test:true}),
    });
    assert.equal(allowed.status,200);
    assert.equal(JSON.parse(allowed.body).origin,null,
      'upstream loopback worker receives no browser Origin or spoofed owner header');
    const forbidden=await request(origin,'/api/runs/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/decision',{
      method:'POST',cookie:'sid=bob',origin:'https://other.example.test',
      body:JSON.stringify({approved:true}),
    });
    assert.equal(forbidden.status,403);
    const forged=await request(origin,'/api/runs',{
      method:'POST',cookie:'sid=alice',body:'{}',
    });
    assert.equal(forged.status,403);
    const stream=await request(origin,'/api/events/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      {cookie:'sid=alice'});
    assert.equal(stream.status,200);
    assert.equal(stream.headers['content-type'],'text/event-stream');
    assert.match(stream.body,/event: status/);
    assert.match(stream.body,/"owner":"alice"/);
    const escaped=await request(origin,'/%5fautomate/api/runs');
    assert.equal(escaped.status,404);
    const login=await request(origin,'/auth/login');
    assert.equal(login.status,303);
    assert.equal(login.headers.location,'https://identity.example.test/authorize');
    const session=await request(origin,'/auth/me',{cookie:'sid=alice'});
    assert.equal(JSON.parse(session.body).authenticated,true);
    const logout=await request(origin,'/auth/logout',{
      method:'POST',cookie:'sid=alice',origin:'https://utomator.example.test',
    });
    assert.equal(logout.status,303);
    assert.equal(stops,1);
  }finally{
    await Promise.all([new Promise(resolve=>gateway.close(resolve)),
      new Promise(resolve=>first.srv.close(resolve)),
      new Promise(resolve=>second.srv.close(resolve)),
      new Promise(resolve=>next.srv.close(resolve))]);
  }
});
