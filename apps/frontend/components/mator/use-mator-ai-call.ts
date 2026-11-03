'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { transcribeMatorAudio } from './mator-api';
import { MatorDuplexAudio } from './mator-duplex-audio';
import {
  MatorCallCoordinator,
  type MatorCallStatus,
  type MatorCallTurnResult,
} from './mator-call-coordinator';
import type { MatorClarifyQuestion } from './mator-chat-state';
import type { VoiceSession } from './use-voice-session';

export type MatorAiCall = {
  state: MatorCallStatus;
  active: boolean;
  seconds: number;
  voiceLevel: number;
  lastTurn: { transcript: string; reply: string } | null;
  question: { value: MatorClarifyQuestion; index: number; total: number } | null;
  lastQuestionAnswer: { prompt: string; answer: string } | null;
  start: () => void;
  end: () => void;
  pause: () => void;
  resume: () => void;
  interrupt: () => void;
  muteMic: (muted: boolean) => void;
  muteSpeaker: (muted: boolean) => void;
  answerVisual: (answers: string[], attachmentIds?: string[]) => Promise<void>;
  approvalResolved: (eventId: string, decision: 'confirm' | 'reject') => Promise<void>;
};
const INITIAL:MatorCallStatus={phase:'idle',detail:'',scope:null,micMuted:false,speakerMuted:false};
export function matorAiCallScope(workflowId:string|null,conversationId:string|null):string|null {
  return workflowId&&conversationId?`${workflowId}:${conversationId}`:null;
}

/** Call state is ephemeral; only the in-composer mode toggle survives reloads. */
export function useMatorAiCall({workflowId,conversationId,voiceOnly,voice,sendTurn}:{
  workflowId:string|null;
  conversationId:string|null;
  voiceOnly:boolean;
  voice:VoiceSession;
  sendTurn:(text:string,scope:string,signal:AbortSignal,attachmentIds?:string[])=>Promise<MatorCallTurnResult>;
}):MatorAiCall {
  const [state,setState]=useState<MatorCallStatus>(INITIAL);
  const [lastTurn,setLastTurn]=useState<{transcript:string;reply:string}|null>(null);
  const [seconds,setSeconds]=useState(0);
  const [voiceLevel,setVoiceLevel]=useState(0);
  const [question,setQuestion]=useState<MatorAiCall['question']>(null);
  const [lastQuestionAnswer,setLastQuestionAnswer]=useState<MatorAiCall['lastQuestionAnswer']>(null);
  const startTimeRef=useRef(0);
  const lastMeterRef=useRef(0);
  const sessionRef=useRef<MatorDuplexAudio|null>(null);
  const voiceRef=useRef(voice);
  const sendRef=useRef(sendTurn);
  useEffect(() => {
    voiceRef.current = voice;
    sendRef.current = sendTurn;
  }, [voice, sendTurn]);
  const scope=matorAiCallScope(workflowId,conversationId);
  const active = state.phase !== 'idle' && state.phase !== 'ended';
  const coordinatorRef = useRef<MatorCallCoordinator | null>(null);
  useEffect(() => {
    const coordinator = new MatorCallCoordinator({
      capture:(signal)=>{
        if(!sessionRef.current) sessionRef.current=new MatorDuplexAudio(level=>{
          const now=Date.now();
          if(now-lastMeterRef.current>=120||level===0){lastMeterRef.current=now;setVoiceLevel(level);}
        });
        return sessionRef.current.capture(signal);
      },
      transcribe:(audio,signal)=>transcribeMatorAudio(audio,signal),
      respond:(transcript,{scope:activeScope,signal,attachmentIds})=>
        sendRef.current(transcript,activeScope,signal,attachmentIds),
      speak:(text,signal)=>{
        if(!sessionRef.current)throw new Error('Microphone session is unavailable.');
        return sessionRef.current.speakAndCatch(text,signal);
      },
      stopOutput:()=>sessionRef.current?.stopOutput(),
      onState:(next)=>{
        setState(next);
        if(next.phase==='ended'){
          sessionRef.current?.close();sessionRef.current=null;
          setVoiceLevel(0);setSeconds(0);setQuestion(null);setLastQuestionAnswer(null);
        }
      },
      onQuestion:(value,index,total)=>setQuestion(value?{value,index,total}:null),
      onQuestionAnswer:(value,answer)=>setLastQuestionAnswer({prompt:value.prompt,answer}),
      onTranscript:transcript=>setLastTurn({transcript,reply:''}),
      onTurn:({transcript,result})=>setLastTurn({transcript,reply:result.reply}),
    });
    coordinatorRef.current = coordinator;
    return () => {
      coordinator.end();
      coordinatorRef.current = null;
      sessionRef.current?.close();
      sessionRef.current = null;
    };
  }, []);
  const end = useCallback(() => {
    coordinatorRef.current?.end();
    sessionRef.current?.close();
    sessionRef.current = null;
  }, []);

  useEffect(() => {
    if (!voiceOnly || !scope) end();
    else coordinatorRef.current?.changeScope(scope);
  }, [voiceOnly, scope, end]);
  useEffect(()=>{
    const handleVisibility=()=>{if(document.hidden) coordinatorRef.current?.pause();};
    document.addEventListener('visibilitychange',handleVisibility);
    return()=>document.removeEventListener('visibilitychange',handleVisibility);
  }, []);
  useEffect(()=>{
    if(!active)return;
    const update=()=>setSeconds(Math.floor((Date.now()-startTimeRef.current)/1000));
    const interval=window.setInterval(update,1000);
    update();
    return()=>window.clearInterval(interval);
  },[active]);
  const start=useCallback(()=>{
    if(!scope)return;
    voiceRef.current.cancelPendingTranscript();voiceRef.current.stopSpeaking();
    setLastTurn(null);setQuestion(null);setLastQuestionAnswer(null);startTimeRef.current=Date.now();setSeconds(0);
    // Mic consent begins synchronously from Start call, not from the mode toggle.
    coordinatorRef.current?.start(scope);
  },[scope,coordinator]);

  return {
    state,active,seconds,voiceLevel,lastTurn,question,lastQuestionAnswer,
    start,end,pause:()=>coordinatorRef.current?.pause(),resume:()=>coordinatorRef.current?.resume(),
    interrupt:()=>coordinatorRef.current?.interrupt(),
    muteMic:(muted)=>coordinatorRef.current?.setMicMuted(muted),
    muteSpeaker:(muted)=>coordinatorRef.current?.setSpeakerMuted(muted),
    answerVisual:(answers,ids)=>coordinatorRef.current?.answerVisual(answers,ids)??Promise.resolve(),
    approvalResolved:(id,decision)=>coordinatorRef.current?.stageDecisionSucceeded(id,decision)??Promise.resolve(),
  };
}