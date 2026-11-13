import { EventEmitter } from 'node:events';
import type { StreamEvent } from './types.js';

export class EventJournal {
  private seq = 0;
  private history: StreamEvent[] = [];
  private pending = new Map<number, StreamEvent>();
  private emitter = new EventEmitter();

  /** Reserve an identity without exposing an event that has not been persisted. */
  allocate(input: Omit<StreamEvent, 'id' | 'time'>): StreamEvent {
    const evt = { ...input, id: ++this.seq, time: new Date().toISOString() };
    this.pending.set(evt.id, evt);
    return evt;
  }

  /** Publish a durable event: allocate, then broadcast to live subscribers. */
  publish(input: Omit<StreamEvent, 'id' | 'time'>): StreamEvent {
    const evt = this.allocate(input);
    this.broadcast(evt);
    return evt;
  }

  /** Broadcast a previously allocated (and now persisted) event to subscribers. */
  broadcast(evt: StreamEvent): void {
    if (this.pending.get(evt.id) !== evt) throw Error('Event was not allocated by this journal');
    this.pending.delete(evt.id);
    this.history.push(evt);
    if (this.history.length > 1000) this.history.shift();
    this.emitter.emit('event', evt);
  }

  /** Retract an allocated event that failed to persist, keeping memory durable-consistent. */
  retract(id: number): void {
    if (this.pending.delete(id) && id === this.seq) this.seq -= 1;
  }

  /** Keep an already written identity reserved when its summary cannot be saved. */
  discard(id: number): void {
    this.pending.delete(id);
  }

  getSince(lastId: number, runId?: string): StreamEvent[] {
    return this.history.filter((evt) => evt.id > lastId && (!runId || evt.runId === runId));
  }

  subscribe(listener: (evt: StreamEvent) => void): () => void {
    this.emitter.on('event', listener);
    return () => this.emitter.off('event', listener);
  }
}
