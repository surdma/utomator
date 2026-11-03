import { chunkMatorSpeech } from './mator-speech-chunks.ts';
import { synthesizeMatorSpeech } from './mator-api.ts';
import { NearEndGate, bestEchoCorrelation, rms } from './mator-call-near-end.ts';
import { VoiceActivityGate } from './mator-call-capture.ts';

const FRAME_MS = 40;
const MAX_CAPTURE_BYTES = 12 * 1024 * 1024;

function abortError() {
  const error = new Error('Call was cancelled.');
  error.name = 'AbortError';
  return error;
}

export function pcmToWav(frames: Float32Array[], sampleRate: number): Blob {
  const count = frames.reduce((n, chunk) => n + chunk.length, 0);
  const data = new ArrayBuffer(44 + count * 2);
  const view = new DataView(data);
  const word = (pos: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(pos+i, str.charCodeAt(i));
  };
  word(0, 'RIFF'); view.setUint32(4, 36 + count * 2, true); word(8, 'WAVE');
  word(12, 'fmt '); view.setUint32(16,16,true); view.setUint16(20,1,true);
  view.setUint16(22,1,true); view.setUint32(24,sampleRate,true);
  view.setUint32(28,sampleRate*2,true); view.setUint16(32,2,true); view.setUint16(34,16,true);
  word(36,'data'); view.setUint32(40,count*2,true);
  let index=44;
  for (const frame of frames) for (const sample of frame) {
    const clamped=Math.max(-1,Math.min(1,sample));
    view.setInt16(index, clamped < 0 ? clamped*32768 : clamped*32767, true);
    index+=2;
  }
  return new Blob([data], {type:'audio/wav'});
}

/**
 * One mic and one AudioContext per active call. During TTS, the mic continues
 * recording short rolling frames for spoken barge-in. Uses a shared clock and
 * the decoded far-end waveform to reject speaker echo before interruption.
 */
export class MatorDuplexAudio {
  private stream: MediaStream | null=null;
  private ctx: AudioContext | null=null;
  private source: MediaStreamAudioSourceNode | null=null;
  private analyser: AnalyserNode | null=null;
  private currentSource: AudioBufferSourceNode | null=null;
  private captureTimer: ReturnType<typeof setInterval> | null=null;
  private disposed=false;
  private onLevel: (level: number)=>void;
  private synthesize: (text: string, signal: AbortSignal)=>Promise<Blob>;
  constructor(
    onLevel:(level:number)=>void=()=>{},
    synthesize:(text:string, signal:AbortSignal)=>Promise<Blob>=synthesizeMatorSpeech
  ) { this.onLevel=onLevel; this.synthesize=synthesize; }

  async ensureReady(signal:AbortSignal) {
    if (this.disposed) throw new Error('This call was ended.');
    if (signal.aborted) throw abortError();
    if (this.ctx && this.stream) {
      if (this.stream.getAudioTracks().some(track => track.readyState !== 'live')) {
        throw new Error('The microphone was disconnected. End and restart the call.');
      }
      if (this.ctx.state === 'suspended') await this.ctx.resume();
      return;
    }
    if (typeof AudioContext==='undefined' || !navigator.mediaDevices?.getUserMedia) {
      throw new Error('This browser does not support microphone calls.');
    }
    // Permission begins only after the user presses Start call.
    const pending=navigator.mediaDevices.getUserMedia({ audio: {
      echoCancellation:true, noiseSuppression:true, autoGainControl:true
    }});
    const media=await pending;
    if (this.disposed || signal.aborted) { media.getTracks().forEach(t=>t.stop()); throw abortError(); }
    const context=new AudioContext({latencyHint:'interactive'});
    try {
      const source=context.createMediaStreamSource(media);
      const analyser=context.createAnalyser();
      analyser.fftSize=2048;
      source.connect(analyser);
      if(context.state==='suspended') await context.resume();
      if (this.disposed || signal.aborted) throw abortError();
      this.stream=media;this.ctx=context;this.source=source;this.analyser=analyser;
    } catch (err) { media.getTracks().forEach(t=>t.stop()); await context.close(); throw err; }
  }

  private snapshot():Float32Array {
    if(!this.analyser) throw new Error('The call microphone is not ready.');
    const out=new Float32Array(this.analyser.fftSize);
    this.analyser.getFloatTimeDomainData(out);
    this.onLevel(Math.min(1,rms(out)/.2));
    return out;
  }

  private collect(
    signal:AbortSignal, mode:'listen'|'barge',
    playback?:{buffer:AudioBuffer;startedAt:number},
    onBargeStart?:()=>void
  ):Promise<Blob|null> {
    if(!this.ctx || !this.analyser) return Promise.reject(new Error('Microphone not ready'));
    const ctx=this.ctx;
    const gate=new VoiceActivityGate({ minSpeechMs:210, endSilenceMs:850,
      maxWaitMs:mode==='listen'?15000:30000, maxTurnMs:24000 });
    const nearEnd=new NearEndGate();
    const frames:Float32Array[]=[];
    const preroll:Float32Array[]=[];
    const maxPreroll=Math.ceil(500/FRAME_MS);
    const sampleRate=ctx.sampleRate;
    let recording=false, bytes=0, last=performance.now();
    return new Promise((resolve,reject)=>{
      let done=false;
      const finish=(result:Blob|null, error?:Error)=>{
        if(done)return;
        done=true;
        if(this.captureTimer!==null){clearInterval(this.captureTimer);this.captureTimer=null;}
        signal.removeEventListener('abort',onAbort);
        this.onLevel(0);
        if(error)reject(error);else resolve(result);
      };
      const onAbort=()=>finish(null);
      if(signal.aborted){finish(null);return;}
      signal.addEventListener('abort',onAbort,{once:true});
      this.captureTimer=setInterval(()=>{
        if(this.disposed || signal.aborted){finish(null);return;}
        const now=performance.now(), elapsed=Math.min(100,now-last);
        last=now;
        const chunk=this.snapshot();
        const level=rms(chunk);
        if(!recording) {
          preroll.push(chunk);
          if(preroll.length>maxPreroll)preroll.shift();
        } else {frames.push(chunk);bytes+=chunk.byteLength;}
        if(bytes>MAX_CAPTURE_BYTES){finish(null,new Error('Audio turn exceeded the recording limit.'));return;}
        if(mode==='barge' && playback && !recording){
          const offset=Math.round((ctx.currentTime-playback.startedAt)*sampleRate);
          const refChannel=playback.buffer.getChannelData(0);
          // Probe up to 250ms of historical output for acoustic delay.
          const from=Math.max(0,offset-Math.round(.25*sampleRate));
          const to=Math.min(refChannel.length,offset+Math.round(.03*sampleRate));
          const ref=refChannel.subarray(from,to);
          const correlation=bestEchoCorrelation(chunk,ref,sampleRate);
          const farEndLevel=rms(ref);
          if(nearEnd.feed(level,farEndLevel,correlation,elapsed)) {
            recording=true;frames.push(...preroll);bytes+=preroll.reduce((n,f)=>n+f.byteLength,0);
            preroll.length=0;
            onBargeStart?.();
            this.stopOutput();
            // The buffered speech onset counts toward the turn's end-silence gate.
            gate.feed(level,Math.max(210,elapsed));
          }
          return;
        }
        const verdict=gate.feed(level,elapsed);
        if(!recording && level>.018) {
          recording=true;frames.push(...preroll);bytes+=preroll.reduce((n,f)=>n+f.byteLength,0);
          preroll.length=0;
        }
        if(verdict==='stop')finish(pcmToWav(frames,sampleRate));
        else if(verdict==='empty')finish(null);
      },FRAME_MS);
    });
  }

  async capture(signal:AbortSignal):Promise<Blob|null> {
    await this.ensureReady(signal);
    return this.collect(signal,'listen');
  }

  /** Returns an interrupted spoken turn, or null when all playback finishes. */
  async speakAndCatch(text:string,signal:AbortSignal):Promise<Blob|null> {
    await this.ensureReady(signal);
    const ctx=this.ctx!;
    for(const chunk of chunkMatorSpeech(text)) {
      if(signal.aborted)throw abortError();
      const audio=await this.synthesize(chunk,signal);
      const buffer=await ctx.decodeAudioData(await audio.arrayBuffer());
      if(signal.aborted)throw abortError();
      const output=ctx.createBufferSource();
      output.buffer=buffer;
      output.connect(ctx.destination);
      this.currentSource=output;
      let resolveEnd:()=>void=()=>{};
      const finished=new Promise<void>(resolve=>{resolveEnd=resolve;});
      output.onended=()=>resolveEnd();
      const monitorController=new AbortController();
      const cancelBoth=()=>{monitorController.abort();this.stopOutput();};
      signal.addEventListener('abort',cancelBoth,{once:true});
      let bargeTriggered=false;
      const startedAt=ctx.currentTime;
      const monitor=this.collect(monitorController.signal,'barge',{buffer,startedAt},()=>{
        bargeTriggered=true;
      });
      output.start();
      try {
        await finished;
        if(bargeTriggered){
          const captured=await monitor;
          if(captured)return captured;
        } else {
          monitorController.abort();
          await monitor;
        }
      } finally {
        monitorController.abort();
        signal.removeEventListener('abort',cancelBoth);
        this.currentSource=null;
      }
      if(signal.aborted)throw abortError();
    }
    return null;
  }

  stopOutput() {
    if(!this.currentSource)return;
    const source=this.currentSource;
    this.currentSource=null;
    try{source.stop();}catch{/* already finished */}
    source.disconnect();
  }
  close() {
    if(this.disposed)return;
    this.disposed=true;
    if(this.captureTimer!==null)clearInterval(this.captureTimer);
    this.captureTimer=null;
    this.stopOutput();
    this.source?.disconnect();this.source=null;
    this.stream?.getTracks().forEach(t=>t.stop());this.stream=null;
    if(this.ctx)void this.ctx.close().catch(()=>{});
    this.ctx=null;this.analyser=null;this.onLevel(0);
  }
}