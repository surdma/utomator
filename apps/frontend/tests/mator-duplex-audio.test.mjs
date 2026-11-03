import test from 'node:test';
import assert from 'node:assert/strict';
import { MatorDuplexAudio, pcmToWav } from '../components/mator/mator-duplex-audio.ts';

test('PCM WAV encoder creates real mono PCM headers and samples',async()=>{
 const wav=pcmToWav([Float32Array.from([0,0.5,-0.5])],16000);
 assert.equal(wav.type,'audio/wav');
 assert.equal(wav.size,50);
 const view=new DataView(await wav.arrayBuffer());
 assert.equal(view.getUint32(24,true),16000);
 assert.equal(view.getUint16(22,true),1);
 assert.equal(view.getInt16(44,true),0);
 assert.ok(view.getInt16(46,true)>16000);
});

test('duplex listens throughout playback, captures voice barge and closes mic tracks',async()=>{
 const originalContext=globalThis.AudioContext;
 const originalGet=globalThis.navigator?.mediaDevices;
 let tracks=0,stopped=0,playbacks=0;
 let started=performance.now();
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{mediaDevices:{getUserMedia:async()=>{
   tracks++;return{getTracks:()=>[{readyState:'live',stop:()=>{stopped++;}}],getAudioTracks:()=>[{readyState:'live'}]};
 }}}});
 class AudioContextFake {
   sampleRate=48000;state='running';destination={};currentTime=0;
   createMediaStreamSource(){return{connect:()=>{},disconnect:()=>{}};}
   createAnalyser(){return{fftSize:2048,getFloatTimeDomainData(out){
     const ms=performance.now()-started;
     out.fill(ms<540?0.09:0);
   }};}
   createBufferSource(){let finished=false;const source={buffer:null,onended:null,connect:()=>{},disconnect:()=>{},start(){playbacks++;},stop(){if(!finished){finished=true;source.onended?.();}}};return source;}
   async decodeAudioData(){return{length:480000,getChannelData:()=>new Float32Array(480000)};}
   async resume(){}
   async close(){}
 }
 globalThis.AudioContext=AudioContextFake;
 const session=new MatorDuplexAudio(()=>{},async()=>new Blob(['fixture audio'],{type:'audio/wav'}));
 try{
   const audio=await session.speakAndCatch('Hello there.',new AbortController().signal);
   assert.ok(audio instanceof Blob);
   assert.equal(audio.type,'audio/wav');
   assert.ok(audio.size>44);
   assert.equal(playbacks,1);
 }finally{
   session.close();
   assert.equal(stopped,tracks);
   globalThis.AudioContext=originalContext;
   Object.defineProperty(globalThis,'navigator',{configurable:true,value:{mediaDevices:originalGet}});
 }
});