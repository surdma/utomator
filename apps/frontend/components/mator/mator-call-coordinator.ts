import { beginQuestionFlow, currentQuestion, provideQuestionAnswer,
  questionFlowSubmission, requiresVisualAnswer, spokenQuestionAnswer,
  type MatorQuestionFlow } from './mator-call-questions.ts';
import type { MatorClarifyQuestion } from './mator-chat-state.ts';

export type MatorCallPhase = 'idle'|'connecting'|'listening'|'transcribing'|'thinking'|'speaking'|
  'clarifying-voice'|'clarifying-form'|'awaiting-approval'|'paused'|'needs-attention'|'error-paused'|'ended';
export type MatorCallTurnResult = {
  reply:string;
  requiresAttention:boolean;
  eventIds:string[];
  clarification?: {eventId:string;questions:MatorClarifyQuestion[]};
  stagedEventIds?:string[];
};
export type MatorCallStatus={phase:MatorCallPhase;detail:string;scope:string|null;micMuted:boolean;speakerMuted:boolean};
export type MatorCallPorts={
  capture:(signal:AbortSignal)=>Promise<Blob|null>;
  transcribe:(audio:Blob,signal:AbortSignal)=>Promise<string>;
  respond:(text:string,options:{scope:string;signal:AbortSignal;attachmentIds?:string[]})=>Promise<MatorCallTurnResult>;
  /** null means playback completed. A Blob is a genuine spoken barge-in capture. */
  speak:(text:string,signal:AbortSignal)=>Promise<Blob|null|void>;
  stopOutput:()=>void;
  onState:(state:MatorCallStatus)=>void;
  onTurn?:(turn:{transcript:string;result:MatorCallTurnResult})=>void;
  onTranscript?:(transcript:string)=>void;
  onQuestion?:(question:MatorClarifyQuestion|null,index:number,total:number)=>void;
  onQuestionAnswer?:(question:MatorClarifyQuestion,answer:string)=>void;
};
function sleep(signal:AbortSignal,ms=120){return new Promise<void>(resolve=>{
  if(signal.aborted){resolve();return;}
  const stop=()=>{clearTimeout(t);resolve();};
  const t=setTimeout(()=>{signal.removeEventListener('abort',stop);resolve();},ms);
  signal.addEventListener('abort',stop,{once:true});
});}

export class MatorCallCoordinator {
  private _phase:MatorCallPhase='idle';
  private _scope:string|null=null;
  private _active=false;
  private _generation=0;
  private _abort:AbortController|null=null;
  private _micMuted=false;
  private _speakerMuted=false;
  private _pausedByMute=false;
  private _flow:MatorQuestionFlow|null=null;
  private _blockedStageIds:string[]=[];
  private _nextAudio:Blob|null=null;
  private ports:MatorCallPorts;
  constructor(ports:MatorCallPorts){this.ports=ports;}
  get phase(){return this._phase;}
  get active(){return this._active;}
  get scope(){return this._scope;}
  get micMuted(){return this._micMuted;}
  get speakerMuted(){return this._speakerMuted;}
  get question(){return this._flow?currentQuestion(this._flow):null;}

  private emit(phase:MatorCallPhase,detail=''){
    this._phase=phase;
    this.ports.onState({phase,detail,scope:this._scope,micMuted:this._micMuted,speakerMuted:this._speakerMuted});
  }
  private current(token:number,signal:AbortSignal){
    return this._active&&this._generation===token&&!signal.aborted;
  }
  start(scope:string){
    if(this._active)return;
    if(!scope.trim())throw new Error('Select a workflow conversation before calling.');
    this._active=true;this._scope=scope;this._micMuted=false;this._pausedByMute=false;
    this._flow=null;this._blockedStageIds=[];this._nextAudio=null;
    this.emit('connecting');this.beginLoop();
  }
  private beginLoop(){
    if(!this._active||this._micMuted||!this._scope)return;
    const token=++this._generation;
    const controller=new AbortController();this._abort=controller;
    void this.loop(token,controller.signal);
  }
  private async speak(text:string,signal:AbortSignal):Promise<Blob|null>{
    if(!text.trim()||this._speakerMuted)return null;
    this.emit('speaking');
    return await this.ports.speak(text,signal)??null;
  }
  private async collectSpokenAnswer(signal:AbortSignal,initial:Blob|null):Promise<string>{
    const audio=initial??await this.ports.capture(signal);
    if(!audio||!audio.size)return '';
    return (await this.ports.transcribe(audio,signal)).trim();
  }
  private async handleClarification(flow:MatorQuestionFlow,token:number,signal:AbortSignal):Promise<MatorCallTurnResult|null>{
    this._flow=flow;
    while(this.current(token,signal)&&this._flow){
      const question=currentQuestion(this._flow);
      if(!question){
        const completed=questionFlowSubmission(this._flow);
        this._flow=null;
        this.ports.onQuestion?.(null,0,0);
        this.emit('thinking','Sending your clarification…');
        // Exactly one persisted response, even for multiple spoken questions.
        const result=await this.ports.respond(completed.text,{scope:this._scope!,signal,attachmentIds:completed.attachmentIds});
        if(this.current(token,signal))this.ports.onTurn?.({transcript:completed.text,result});
        return result;
      }
      this.ports.onQuestion?.(question,this._flow.index+1,this._flow.questions.length);
      if(requiresVisualAnswer(question)){
        this.emit('clarifying-form',`Answer question ${this._flow.index+1} in the questionnaire.`);
        return null;
      }
      this.emit('clarifying-voice',question.prompt);
      const interrupt=await this.speak(question.prompt,signal);
      if(!this.current(token,signal))return null;
      this.emit('clarifying-voice',question.prompt);
      let accepted=false;
      for(let attempts=0;attempts<2 && !accepted;attempts++){
        const answer=await this.collectSpokenAnswer(signal,attempts===0?interrupt:null);
        if(!this.current(token,signal))return null;
        try{
          const values=spokenQuestionAnswer(question,answer);
          this._flow=provideQuestionAnswer(this._flow,values);
          this.ports.onQuestionAnswer?.(question,values.join(', ')||'Skipped');
          accepted=true;
        }catch{
          if(attempts===1){this.emit('error-paused','Please answer this question in the visible questionnaire.');return null;}
          await this.speak('Sorry, could you repeat that?',signal);
        }
      }
    }
    return null;
  }
  private async consumeResult(initial:MatorCallTurnResult,token:number,signal:AbortSignal):Promise<Blob|null>{
    let result=initial;
    for(let round=0;round<5&&this.current(token,signal);round++){
      if(result.stagedEventIds?.length){
        this._blockedStageIds=result.stagedEventIds;
        this.emit('awaiting-approval','Review each proposed workflow change on screen.');
        return null;
      }
      if(result.clarification){
        const next=await this.handleClarification(
          beginQuestionFlow(result.clarification.eventId,result.clarification.questions),token,signal);
        if(!next||!this.current(token,signal))return null;
        result=next;continue;
      }
      if(result.requiresAttention){
        this.emit('needs-attention','Mator needs your input in the conversation.');
        return null;
      }
      return await this.speak(result.reply,signal);
    }
    if(this.current(token,signal))this.emit('error-paused','Mator asked too many follow-up questions. Review the transcript.');
    return null;
  }
  private async loop(token:number,signal:AbortSignal){
    let pendingAudio:Blob|null=this._nextAudio;
    this._nextAudio=null;
    while(this.current(token,signal)){
      try{
        if(this._micMuted){this.emit('paused');return;}
        let audio=pendingAudio;
        pendingAudio=null;
        if(!audio){this.emit('listening');audio=await this.ports.capture(signal);}
        if(!this.current(token,signal))return;
        if(!audio?.size){await sleep(signal);continue;}
        this.emit('transcribing');
        const transcript=(await this.ports.transcribe(audio,signal)).trim();
        if(!this.current(token,signal))return;
        if(!transcript)continue;
        this.ports.onTranscript?.(transcript);
        this.emit('thinking');
        const result=await this.ports.respond(transcript,{scope:this._scope!,signal});
        if(!this.current(token,signal))return;
        this.ports.onTurn?.({transcript,result});
        pendingAudio=await this.consumeResult(result,token,signal);
        if(!this.current(token,signal))return;
        if(['awaiting-approval','clarifying-form','needs-attention','error-paused'].includes(this._phase))return;
      }catch{
        if(this.current(token,signal))this.emit('error-paused','Mator could not finish that turn. Check the transcript and retry.');
        return;
      }
    }
  }

  /** Called by the visible one-question structured form only on successful validation. */
  async answerVisual(value:string[],attachmentIds:string[]=[]):Promise<void>{
    if(this._phase!=='clarifying-form'||!this._flow||!this._scope)return;
    try{
      this._flow=provideQuestionAnswer(this._flow,value,attachmentIds);
      this.ports.onQuestion?.(currentQuestion(this._flow),this._flow.index+1,this._flow.questions.length);
      if (this._micMuted) { this.emit('paused','Unmute and resume the call to continue.'); return; }
      this.emit('connecting');this.beginLoopFromQuestions();
    }catch(error){
      this.emit('clarifying-form',error instanceof Error?error.message:'Check your answer.');
      throw error;
    }
  }
  private beginLoopFromQuestions(){
    if (!this._active || this._micMuted) return;
    const token=++this._generation;
    this._abort?.abort();
    const controller=new AbortController();this._abort=controller;
    void(async()=>{
      try{
        if(!this._flow)return;
        const next=await this.handleClarification(this._flow,token,controller.signal);
        if(!next||!this.current(token,controller.signal))return;
        const captured=await this.consumeResult(next,token,controller.signal);
        if(!this.current(token,controller.signal))return;
        if(['awaiting-approval','clarifying-form','needs-attention','error-paused'].includes(this._phase))return;
        this._nextAudio=captured;this.beginLoop();
      }catch{if(this.current(token,controller.signal))this.emit('error-paused','Clarification could not be submitted. Review your answers.');}
    })();
  }
  /** The caller must await actual confirm/reject API success before this signal. */
  async stageDecisionSucceeded(eventId:string,decision:'confirm'|'reject'){
    if(!this._active||this._phase!=='awaiting-approval')return;
    this._blockedStageIds=this._blockedStageIds.filter(id=>id!==eventId);
    if(this._blockedStageIds.length)return;
    if(this._micMuted){this.emit('paused');return;}
    const token=++this._generation;
    this._abort?.abort();
    const controller=new AbortController();this._abort=controller;
    try{
      const next=await this.speak(decision==='confirm'?'Change approved.':'Change rejected.',controller.signal);
      if(this.current(token,controller.signal)){this._nextAudio=next;this.beginLoop();}
    }catch{if(this.current(token,controller.signal))this.emit('error-paused','Could not play the confirmation.');}
  }
  pause(){
    if(!this._active||this._phase==='paused')return;
    this._generation++;this._abort?.abort();this._abort=null;
    this.ports.stopOutput();this.emit('paused');
  }
  resume(){
    if(!this._active||this._micMuted||!['paused','error-paused','needs-attention'].includes(this._phase))return;
    if(this._blockedStageIds.length){this.emit('awaiting-approval','Confirm or reject the pending change on screen.');return;}
    this._pausedByMute=false;this.emit('connecting');
    if(this._flow)this.beginLoopFromQuestions();else this.beginLoop();
  }
  setMicMuted(muted:boolean){
    if(this._micMuted===muted)return;
    this._micMuted=muted;
    if(!this._active)return;
    if(muted){this._pausedByMute=!['paused','error-paused','needs-attention','awaiting-approval','clarifying-form'].includes(this._phase);
      if(this._pausedByMute)this.pause();else this.emit(this._phase);
    }else if(this._pausedByMute){this._pausedByMute=false;this.resume();}
    else this.emit(this._phase);
  }
  setSpeakerMuted(muted:boolean){
    this._speakerMuted=muted;
    if(muted&&this._phase==='speaking'){
      this._generation++;this._abort?.abort();this.ports.stopOutput();
      this.emit('connecting');if(this._active&&!this._micMuted)this.beginLoop();
    }else if(this._active)this.emit(this._phase);
  }
  interrupt(){
    if(!this._active||this._phase!=='speaking')return;
    this._generation++;this._abort?.abort();this.ports.stopOutput();
    if(this._micMuted)this.emit('paused');else{this.emit('connecting');this.beginLoop();}
  }
  changeScope(next:string|null){if(this._active&&this._scope!==next)this.end();}
  end(){
    if(!this._active)return;
    this._generation++;this._active=false;
    this._abort?.abort();this._abort=null;
    this.ports.stopOutput();this._scope=null;this._flow=null;this._blockedStageIds=[];this._nextAudio=null;
    this._pausedByMute=false;this.ports.onQuestion?.(null,0,0);
    this.emit('ended');
  }
}