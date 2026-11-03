'use client';

import {
  Mic, MicOff, Phone, PhoneOff, Pause, Play, Volume2, VolumeX, SkipForward,
} from 'lucide-react';
import type { MatorAiCall } from './use-mator-ai-call';

type Props = { call: MatorAiCall; ready: boolean };

const LABELS = {
  idle: 'Start a conversation with Mator',
  ended: 'Call ended',
  connecting: 'Connecting to Mator…',
  listening: 'Listening…',
  transcribing: 'Understanding your words…',
  thinking: 'Mator is thinking…',
  speaking: 'Mator is speaking',
  'clarifying-voice': 'Answer the visible question aloud',
  'clarifying-form': 'Complete the question on screen',
  'awaiting-approval': 'Approve or reject the change on screen',
  paused: 'Call paused',
  'needs-attention': 'Needs your attention in chat',
  'error-paused': 'Call paused after an error',
} as const;

function fmt(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

export default function MatorAiCallPanel({ call, ready }: Props) {
  const { state, active } = call;
  const resumeAllowed = ['paused', 'needs-attention', 'error-paused'].includes(state.phase);
  return (
    <section data-testid="mator-ai-call-panel" aria-label="Mator AI Call"
      className="min-w-0 rounded-2xl border border-slate-200 bg-white px-3 py-4 shadow-sm">
      <div className="flex flex-col items-center gap-2 text-center">
        <div aria-hidden="true" className="flex size-14 items-center justify-center rounded-full bg-teal-900 text-xl font-semibold text-white shadow-sm">M</div>
        <div>
          <p className="text-sm font-semibold text-slate-900">Mator AI Call</p>
          <p data-testid="mator-call-status" aria-live="polite" className="mt-0.5 text-xs text-slate-600">{LABELS[state.phase]}</p>
        </div>
        {active && <time aria-label={`Call duration ${fmt(call.seconds)}`} className="text-xs tabular-nums text-slate-500">{fmt(call.seconds)}</time>}
      </div>

      {active && (
        <div role="img" aria-label={state.phase === 'listening' ? 'Microphone level indicator' : 'No input audio'}
          className="mx-auto my-3 flex h-7 max-w-42 items-center justify-center gap-1" data-testid="mator-call-level">
          {Array.from({ length: 17 }, (_, i) => (
            <span key={i} className="w-1 rounded-full bg-teal-600 transition-transform duration-150 motion-reduce:transition-none"
              style={{ height: 5 + 12 * (state.phase === 'listening' ? call.voiceLevel : 0), transform: `scaleY(${0.55 + ((i % 5) + 1) * call.voiceLevel * 0.24})` }}/>
          ))}
        </div>
      )}

      {!active ? (
        <div className="mt-4 flex flex-col items-center gap-2">
          <button type="button" data-testid="mator-call-start" onClick={call.start} disabled={!ready}
            className="inline-flex min-h-11 items-center gap-2 rounded-full bg-teal-800 px-5 text-sm font-semibold text-white hover:bg-teal-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-800 disabled:cursor-not-allowed disabled:opacity-50">
            <Phone className="size-4" aria-hidden="true"/> Start call
          </button>
          {!ready && <p role="status" className="text-xs text-slate-600">Select a workflow conversation first.</p>}
          <p className="max-w-68 text-xs leading-relaxed text-slate-500">Microphone access is requested only when you start. Turns are transcribed into this conversation.</p>
        </div>
      ) : (
        <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
          <button type="button" data-testid="mator-call-mic-mute" aria-label={state.micMuted ? 'Unmute microphone' : 'Mute microphone'} aria-pressed={state.micMuted}
            onClick={() => call.muteMic(!state.micMuted)}
            className="flex size-11 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-800">
            {state.micMuted ? <MicOff className="size-4"/> : <Mic className="size-4"/>}
          </button>
          <button type="button" data-testid="mator-call-speaker-mute" aria-label={state.speakerMuted ? 'Enable speaker' : 'Silence speaker'} aria-pressed={state.speakerMuted}
            onClick={() => call.muteSpeaker(!state.speakerMuted)}
            className="flex size-11 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-800">
            {state.speakerMuted ? <VolumeX className="size-4"/> : <Volume2 className="size-4"/>}
          </button>
          <button type="button" data-testid="mator-call-pause" aria-label={resumeAllowed ? 'Resume call' : 'Pause call'}
            onClick={resumeAllowed ? call.resume : call.pause}
            className="flex size-11 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-800">
            {resumeAllowed ? <Play className="size-4"/> : <Pause className="size-4"/>}
          </button>
          {state.phase === 'speaking' && (
            <button type="button" data-testid="mator-call-interrupt" aria-label="Interrupt Mator's reply" onClick={call.interrupt}
              className="flex size-11 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-800">
              <SkipForward className="size-4"/>
            </button>
          )}
          <button type="button" data-testid="mator-call-end" aria-label="End Mator call" onClick={call.end}
            className="flex size-12 items-center justify-center rounded-full bg-rose-700 text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-700">
            <PhoneOff className="size-5"/>
          </button>
        </div>
      )}
      {state.detail && <p role="alert" className="mx-auto mt-3 max-w-72 text-center text-xs leading-relaxed text-rose-700">{state.detail}</p>}
      {call.lastQuestionAnswer && active && (
        <p data-testid="mator-call-question-answer" className="mt-3 text-xs text-slate-700">
          <span className="font-semibold">Latest answer:</span> {call.lastQuestionAnswer.answer}
        </p>
      )}
      {call.lastTurn && (
        <details className="mt-4 rounded-xl bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-700" data-testid="mator-call-last-turn">
          <summary className="cursor-pointer font-semibold text-slate-800">Latest transcript</summary>
          <p className="mt-2"><span className="font-semibold">You:</span> {call.lastTurn.transcript}</p>
          <p className="mt-2"><span className="font-semibold">Mator:</span> {call.lastTurn.reply || (state.phase === 'needs-attention' ? 'Action requires attention in chat.' : 'No reply yet. Review the transcript if you need to retry.')}</p>
        </details>
      )}
    </section>
  );
}