import { randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Single-use tickets for streamed connector sign-in sessions. A ticket is
 * minted only by authenticated connector routes, is tied to one connector id,
 * and burns on the first WebSocket upgrade. Tokens are 256-bit; holder-knowledge
 * plus loopback-only minting is the stream transport's authentication.
 */

export const TICKET_TTL_MS = 10 * 60 * 1000;
const TOKEN_BYTES = 32;
const MAX_TICKETS = 100;

export type StreamTicket = {
  connectorId: string;
  ownerId: string | null;
  expiresAt: number;
};
export type ConsumedTicket = { connectorId: string; ownerId: string | null };

export interface StreamTicketStore {
  /** Mint a ticket bound to one connector attempt. */
  mint(
    connectorId: string,
    ownerId?: string | null
  ): { token: string; expiresAt: number };
  /** Burn and return the ticket's binding, or null when unknown/expired/spent. */
  consume(token: string): ConsumedTicket | null;
  size(): number;
}

const timingSafeToken = (candidate: string, stored: string): boolean => {
  if (typeof candidate !== 'string' || typeof stored !== 'string') return false;
  const left = Buffer.from(candidate);
  const right = Buffer.from(stored);
  return left.length === right.length && timingSafeEqual(left, right);
};

export function createStreamTicketStore(
  ttlMs: number = TICKET_TTL_MS,
  maxTickets: number = MAX_TICKETS
): StreamTicketStore {
  const tickets = new Map<string, StreamTicket>();
  const prune = (now: number) => {
    for (const [token, ticket] of tickets) {
      if (now >= ticket.expiresAt) tickets.delete(token);
    }
  };
  return {
    mint(connectorId, ownerId = null) {
      if (!connectorId || typeof connectorId !== 'string')
        throw Error('Stream tickets require a connector id');
      const now = Date.now();
      prune(now);
      while (tickets.size >= maxTickets) {
        const oldest = tickets.keys().next().value;
        if (!oldest) break;
        tickets.delete(oldest);
      }
      const token = randomBytes(TOKEN_BYTES).toString('hex');
      const expiresAt = now + ttlMs;
      tickets.set(token, { connectorId, ownerId, expiresAt });
      return { token, expiresAt };
    },
    consume(token) {
      const now = Date.now();
      for (const [stored, ticket] of tickets) {
        if (!timingSafeToken(token, stored)) continue;
        tickets.delete(stored);
        if (now >= ticket.expiresAt) return null;
        return { connectorId: ticket.connectorId, ownerId: ticket.ownerId };
      }
      return null;
    },
    size() {
      return tickets.size;
    },
  };
}
