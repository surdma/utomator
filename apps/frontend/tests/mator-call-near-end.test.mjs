import test from 'node:test';
import assert from 'node:assert/strict';
import { NearEndGate, normalizedCorrelation, bestEchoCorrelation } from '../components/mator/mator-call-near-end.ts';

test('echo-correlated speaker playback does not trigger a near-end barge',()=>{
 const g=new NearEndGate({minSpeechMs:180});
 for(let i=0;i<30;i++)assert.equal(g.feed(.13,.23,.91,40),false);
});
test('sustained actual near-end speech during output can trigger barge',()=>{
 const g=new NearEndGate({minSpeechMs:180});
 let interrupted=false;
 for(let i=0;i<8;i++)interrupted ||=g.feed(.11,.25,.12,40);
 assert.equal(interrupted,true);
});
test('short knocks do not interrupt',()=>{
 const g=new NearEndGate({minSpeechMs:180});
 assert.equal(g.feed(.2,.12,.01,40),false);
 assert.equal(g.feed(.2,.12,.01,40),false);
 assert.equal(g.feed(.0,.12,.01,40),false);
 assert.equal(g.feed(.2,.12,.01,40),false);
});
test('echo correlation measures matching output and rejects distinct speech',()=>{
 const t=Float32Array.from({length:480},(_,i)=>Math.sin(i*0.21));
 const copy=Float32Array.from(t);
 const separate=Float32Array.from({length:480},(_,i)=>Math.sin(i*0.077));
 assert.ok(normalizedCorrelation(t,copy)>.99);
 assert.ok(normalizedCorrelation(t,separate)<.15);
 const window=new Float32Array(1200);
 window.set(t,480);
 assert.ok(bestEchoCorrelation(t,window,48000)>.99);
});