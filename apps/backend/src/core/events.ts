import { EventEmitter } from 'node:events';
import type { StreamEvent } from './types.js';

export class EventJournal {
  private seq = 0;
  private history: StreamEvent[] = [];
  private emitter = new EventEmitter();

  publish(input: Omit<StreamEvent, 'id' | 'time'>): StreamEvent {
    const evt = { ...input, id: ++this.seq, time: new Date().toISOString() };
    this.history.push(evt);
    if (this.history.length > 1000) this.history.shift();
    this.emitter.emit('event', evt);
    return evt;
  }

  getSince(lastId: number, runId?: string): StreamEvent[] {
    return this.history.filter((evt) => evt.id > lastId && (!runId || evt.runId === runId));
  }

  subscribe(listener: (evt: StreamEvent) => void): () => void {
    this.emitter.on('event', listener);
    return () => this.emitter.off('event', listener);
  }
}
