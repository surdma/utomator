'use client';

import {
  Mic,
  MicOff,
  Pause,
  Phone,
  PhoneOff,
  Play,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type { MatorAiCall } from './use-mator-ai-call';

type Props = { call: MatorAiCall; ready: boolean };

const PHASE_LABELS = {
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

/**
 * Call controls that live in the Mator header row while the call runs.
 * The listener deck itself stays control-free so the transcript keeps
 * breathing room; mute and hang up are one glance away at the top.
 */
export function MatorCallControls({ call }: { call: MatorAiCall }) {
  const { state } = call;
  return (
    <div className="flex shrink-0 items-center gap-1">
      <button
        type="button"
        data-testid="mator-call-mic-mute"
        aria-label={state.micMuted ? 'Unmute microphone' : 'Mute microphone'}
        aria-pressed={state.micMuted}
        onClick={() => call.muteMic(!state.micMuted)}
        className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full border border-slate-200 bg-white/80 text-slate-800 backdrop-blur-sm transition-colors hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
      >
        {state.micMuted ? (
          <MicOff className="size-4 text-rose-700" aria-hidden="true" />
        ) : (
          <Mic className="size-4" aria-hidden="true" />
        )}
      </button>
      <button
        type="button"
        data-testid="mator-call-end"
        aria-label="End Mator call"
        onClick={call.end}
        className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full bg-rose-700 text-white shadow-[0_8px_20px_-8px_rgba(159,18,57,.7)] transition-colors hover:bg-rose-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-700"
      >
        <PhoneOff className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}

const BAR_COUNT = 19;

/** Level bars driven by the real WebAudio RMS meter from the call session. */
function VoiceBars({ call }: { call: MatorAiCall }) {
  const { phase } = call.state;
  const voiceLevel = call.voiceLevel;
  const listening = phase === 'listening';
  const speaking = phase === 'speaking';
  return (
    <div
      role="img"
      data-testid="mator-call-level"
      aria-label={
        listening
          ? 'Microphone level indicator'
          : speaking
            ? 'Mator response audio'
            : 'No live audio'
      }
      className="flex h-8 items-center justify-center gap-[3px]"
    >
      {Array.from({ length: BAR_COUNT }, (_, i) => {
        const shape = 0.55 + ((i % 5) + 1) * 0.2;
        const height = listening ? 5 + 12 * voiceLevel : speaking ? 9 : 3;
        const tone = listening
          ? 'bg-teal-300'
          : speaking
            ? 'bg-cyan-200/90'
            : 'bg-white/25';
        return (
          <span
            key={i}
            className={`w-1 shrink-0 rounded-full ${tone} ${
              speaking ? 'mator-bar-idle' : ''
            }`}
            style={{
              height,
              transform: listening
                ? `scaleY(${0.55 + shape * voiceLevel * 1.2})`
                : undefined,
              animationDelay: speaking ? `${i * 65}ms` : undefined,
            }}
          />
        );
      })}
    </div>
  );
}

export default function MatorVoiceListener({ call, ready }: Props) {
  const { state, active } = call;
  const resumeAllowed = ['paused', 'needs-attention', 'error-paused'].includes(
    state.phase,
  );
  return (
    <section
      data-testid="mator-ai-call-panel"
      aria-label="Mator AI call audio"
      className="relative isolate mt-1 flex flex-col items-center gap-2.5 overflow-hidden pt-7 pb-2"
    >
      {/* Galaxy ambience: fades upward so the conversation transcript stays readable behind it */}
      <span
        aria-hidden="true"
        className="mator-galaxy pointer-events-none absolute inset-x-0 -top-16 bottom-0 -z-10"
      />

      {active && (
        <time
          aria-label={`Call duration ${fmt(call.seconds)}`}
          className="z-10 rounded-full bg-white/10 px-2.5 py-0.5 text-[10px] font-semibold text-teal-50/90 tabular-nums"
        >
          {fmt(call.seconds)}
        </time>
      )}

      {/* Orb: start button when idle, tap-to-pause/resume during a call */}
      {!active ? (
        <button
          type="button"
          data-testid="mator-call-start"
          onClick={call.start}
          disabled={!ready}
          aria-label={
            ready
              ? 'Start the Mator call'
              : 'Select a workflow conversation before calling'
          }
          className="group relative flex size-20 shrink-0 cursor-pointer items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-300 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <span
            aria-hidden="true"
            className="absolute -inset-3 -z-10 rounded-full bg-[radial-gradient(closest-side,rgba(45,212,191,.35),transparent)] blur-md"
          />
          <span
            aria-hidden="true"
            className="absolute inset-0 rounded-full bg-gradient-to-br from-teal-400/80 via-teal-700/90 to-slate-950 shadow-[0_0_36px_-8px_rgba(45,212,191,.8)] ring-1 ring-teal-300/50 transition-transform group-hover:scale-[1.04] motion-reduce:transition-none"
          />
          <Phone
            className="relative size-6 text-white transition-transform group-hover:-rotate-6 motion-reduce:transition-none"
            aria-hidden="true"
          />
        </button>
      ) : (
        <button
          type="button"
          data-testid="mator-call-pause"
          onClick={resumeAllowed ? call.resume : call.pause}
          aria-label={resumeAllowed ? 'Resume call' : 'Pause call'}
          className="group relative flex size-20 shrink-0 cursor-pointer items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-300"
        >
          <span
            aria-hidden="true"
            className="absolute -inset-3 -z-10 rounded-full bg-[radial-gradient(closest-side,rgba(45,212,191,.35),transparent)] blur-md"
          />
          {state.phase === 'listening' && (
            <>
              <span
                aria-hidden="true"
                className="mator-listen-ring pointer-events-none absolute inset-0 rounded-full border-2 border-teal-300/70"
              />
              <span
                aria-hidden="true"
                className="mator-listen-ring pointer-events-none absolute inset-0 rounded-full border border-teal-200/50"
                style={{ animationDelay: '600ms' }}
              />
            </>
          )}
          <span
            aria-hidden="true"
            className="absolute inset-0 rounded-full bg-gradient-to-br from-teal-400/80 via-teal-700/90 to-slate-950 shadow-[0_0_36px_-8px_rgba(45,212,191,.8)] ring-1 ring-teal-300/50 transition-transform group-hover:scale-[1.04] motion-reduce:transition-none"
          />
          {resumeAllowed ? (
            <Play className="relative size-6 text-white" aria-hidden="true" />
          ) : (
            <Pause className="relative size-5 text-white" aria-hidden="true" />
          )}
        </button>
      )}

      <VoiceBars call={call} />

      <div className="z-10 flex items-center gap-2">
        <p
          data-testid="mator-call-status"
          aria-live="polite"
          className="text-center text-[11px] font-medium text-white/85"
        >
          {PHASE_LABELS[state.phase]}
        </p>
      </div>

      {state.detail && (
        <p
          role="alert"
          className="z-10 max-w-72 text-center text-[11px] leading-relaxed text-rose-300"
        >
          {state.detail}
        </p>
      )}

      {!active && !ready && (
        <p role="status" className="z-10 text-center text-[11px] text-white/70">
          Select a workflow conversation to start the call.
        </p>
      )}

      {active && (
        <button
          type="button"
          data-testid="mator-call-speaker-mute"
          aria-label={state.speakerMuted ? 'Enable speaker' : 'Silence speaker'}
          aria-pressed={state.speakerMuted}
          onClick={() => call.muteSpeaker(!state.speakerMuted)}
          className="z-10 inline-flex size-8 cursor-pointer items-center justify-center rounded-full bg-white/10 text-teal-100 transition-colors hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-300"
        >
          {state.speakerMuted ? (
            <VolumeX className="size-3.5" aria-hidden="true" />
          ) : (
            <Volume2 className="size-3.5" aria-hidden="true" />
          )}
        </button>
      )}
    </section>
  );
}
