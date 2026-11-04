import type { Page } from 'playwright';
import type { BrowserPort } from '../browser/provider.js';
import { BrowserSession } from '../browser/session.js';
import type { BrokerInput } from '../browser/streaming-signin.js';
import type { DocumentStore } from '../db/documents.js';
import { AccountStore, type SocialAccount, type SocialPlatform } from '../profile/account-store.js';
import type { AuditAction, PendingConnection } from './connector-consts.js';
import type { SessionDeps } from './connector-session.js';
import { ConnectorSession } from './connector-session.js';
import { ConnectorStatus, type StatusDeps } from './connector-status.js';
import type { VerifierDeps } from './connector-verifier.js';
import { ConnectorVerifier } from './connector-verifier.js';
import { type ConnectionRecord, ConnectorRecordStore } from './store.js';

export type { ConnectionStatus } from './connector-status.js';

export class ConnectorService {
  private sessions = new Map<string, BrowserPort>();
  private pending = new Map<string, PendingConnection>();
  private checks = new Map<string, Promise<{ status: string; accountId: string }>>();
  private readonly store: ConnectorRecordStore;
  private documents?: DocumentStore;
  private readonly status: ConnectorStatus;
  private readonly session: ConnectorSession;
  private readonly verifier: ConnectorVerifier;
  setDocuments(documents: DocumentStore) {
    this.documents = documents;
    this.store.setDocuments(documents);
  }
  constructor(
    private readonly accounts = new AccountStore(),
    private readonly makeBrowser: () => BrowserPort = () => new BrowserSession(),
    root = process.cwd(),
  ) {
    this.root = root;
    this.store = new ConnectorRecordStore(root);
    const statusDeps: StatusDeps = {
      accounts,
      store: this.store,
      sessions: this.sessions,
      pending: this.pending,
    };
    const sessionDeps: SessionDeps = {
      accounts,
      store: this.store,
      sessions: this.sessions,
      pending: this.pending,
      makeBrowser: this.makeBrowser,
      root: this.root,
      audit: (action, account) => this.audit(action, account),
    };
    const verifierDeps: VerifierDeps = {
      accounts,
      store: this.store,
      sessions: this.sessions,
      pending: this.pending,
      checks: this.checks,
      makeBrowser: this.makeBrowser,
      audit: (action, account) => this.audit(action, account),
    };
    this.status = new ConnectorStatus(statusDeps);
    this.session = new ConnectorSession(sessionDeps);
    this.verifier = new ConnectorVerifier(verifierDeps);
  }
  private readonly root: string;

  private async update(id: string, record: ConnectionRecord | null) {
    return this.store.update(id, record);
  }

  capabilities() {
    return this.status.capabilities();
  }
  async list() {
    return this.status.list();
  }
  async requireConnected(id: string, platform: string, profileUrl?: string) {
    return this.status.requireConnected(id, platform, profileUrl);
  }
  async start(platform: SocialPlatform) {
    return this.session.start(platform);
  }
  async signInFrame(id: string) {
    return this.session.signInFrame(id);
  }
  async signInInput(id: string, event: BrokerInput) {
    return this.session.signInInput(id, event);
  }
  async begin(id: string) {
    return this.session.begin(id);
  }
  async check(id: string) {
    return this.verifier.check(id);
  }
  async sync(id: string) {
    return this.verifier.sync(id);
  }
  async verify(page: Page, account: SocialAccount, navigate = true) {
    return this.verifier.verify(page, account, navigate);
  }
  async discover(page: Page, platform: 'linkedin' | 'x') {
    return this.verifier.discover(page, platform);
  }
  async absorbProfile(page: Page, platform: 'linkedin' | 'x') {
    return this.verifier.absorbProfile(page, platform);
  }
  async expire(id: string) {
    return this.session.expire(id);
  }
  async disconnect(id: string) {
    return this.session.disconnect(id);
  }
  private async audit(action: AuditAction, account?: SocialAccount) {
    if (!this.documents) return;
    try {
      const existing = await this.documents.get<
        Array<{
          time: string;
          accountId: string;
          platform: string;
          action: AuditAction;
        }>
      >('connectors', 'audit');
      const entries = existing?.value ?? [];
      entries.push({
        time: new Date().toISOString(),
        accountId: account?.id ?? '-',
        platform: account?.platform ?? '-',
        action,
      });
      await this.documents.put('connectors', 'audit', entries.slice(-200), existing?.version ?? 0);
    } catch {
      // An audit failure must never block connection management; state persists in connectors store.
    }
  }
}
