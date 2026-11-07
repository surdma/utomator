import { EventEmitter } from 'node:events';
import type { StreamEvent } from './types.js';

export class EventJournal {
  private seq = 0;
  private history: StreamEvent[] = [];
  private emitter = new EventEmitter();

  /** Assign id/time and append to in-memory history without broadcasting. */
  allocate(input: Omit<StreamEvent, 'id' | 'time'>): StreamEvent {
    const evt = { ...input, id: ++this.seq, time: new Date().toISOString() };
    this.history.push(evt);
    if (this.history.length > 1000) this.history.shift();
    return evt;
  }

  /** Publish a durable event: allocate, then broadcast to live subscribers. */
  publish(input: Omit<StreamEvent, 'id' | 'time'>): StreamEvent {
    const evt = this.allocate(input);
    this.emitter.emit('event', evt);
    return evt;
  }

  /** Broadcast a previously allocated (and now persisted) event to subscribers. */
  broadcast(evt: StreamEvent): void {
    this.emitter.emit('event', evt);
  }

  /** Retract an allocated event that failed to persist, keeping memory durable-consistent. */
  retract(id: number): void {
    const index = this.history.findIndex((evt) => evt.id === id);
    if (index !== -1) this.history.splice(index, 1);
  }

  getSince(lastId: number, runId?: string): StreamEvent[] {
    return this.history.filter((evt) => evt.id > lastId && (!runId || evt.runId === runId));
  }

  subscribe(listener: (evt: StreamEvent) => void): () => void {
    this.emitter.on('event', listener);
    return () => this.emitter.off('event', listener);
  }
}
