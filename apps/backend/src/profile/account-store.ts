import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type {DocumentStore} from '../db/documents.js';

export type SocialPlatform = 'linkedin' | 'x' | 'instagram' | 'github' | 'devto';
export type AccountProfile = { displayName: string; email: string; location: string; about: string };
export type SocialAccount = {
  id: string; platform: SocialPlatform; label: string; handle: string; profileUrl: string;
};
export type AccountState = { revision: number; profile: AccountProfile; socialAccounts: SocialAccount[] };
const platforms = new Set<SocialPlatform>(['linkedin', 'x', 'instagram', 'github', 'devto']);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const field = (value: unknown, max: number, name: string) => {
  if (typeof value !== 'string' || value.length > max) throw Error('Invalid ' + name);
  return value.trim();
};
const asRecord = (value: unknown) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Expected object');
  return value as Record<string, unknown>;
};
export function parseAccountProfile(raw: unknown): AccountProfile {
  const value = asRecord(raw);
  const displayName = field(value.displayName, 150, 'name');
  const email = field(value.email, 240, 'email');
  const location = field(value.location, 180, 'location');
  const about = field(value.about, 1200, 'about');
  if (!displayName || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw Error('A name and valid email are required');
  return { displayName, email, location, about };
}
export function parseSocialAccount(raw: unknown, id: string = randomUUID()): SocialAccount {
  const value = asRecord(raw);
  const platform = value.platform;
  if (typeof platform !== 'string' || !platforms.has(platform as SocialPlatform)) throw Error('Unsupported platform category');
  const label = field(value.label, 100, 'account label');
  const handle = field(value.handle, 100, 'handle').replace(/^@/, '');
  if (!label || !/^[a-zA-Z0-9._-]{1,100}$/.test(handle)) throw Error('Account label and valid handle are required');
  const profileUrl = field(value.profileUrl, 400, 'profile URL');
  let parsed: URL;
  try { parsed = new URL(profileUrl); } catch { throw Error('Profile URL must be HTTPS'); }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port || parsed.search || parsed.hash)
    throw Error('Profile URL must be HTTPS without credentials or parameters');
  const host = parsed.hostname.toLowerCase();
  const approved: Partial<Record<SocialPlatform, string[]>> = {
    linkedin: ['linkedin.com', 'www.linkedin.com'],
    x: ['x.com', 'www.x.com'],
    instagram: ['instagram.com', 'www.instagram.com'],
    github: ['github.com', 'www.github.com'],
    devto: ['dev.to'],
  };
  const allowed = approved[platform as SocialPlatform];
  if (!allowed || !allowed.includes(host)) throw Error('Profile URL does not match the selected platform');
  if (platform === 'linkedin') {
    const match = parsed.pathname.match(/^\/in\/([a-zA-Z0-9_-]+)\/?$/);
    if (!match) throw Error('LinkedIn profile must use an /in/ URL');
    if (match[1]!.toLowerCase() !== handle.toLowerCase())
      throw Error('LinkedIn profile handle must match its URL');
  }
  if (platform === 'x' && parsed.pathname.replace(/\/$/, '') !== '/' + handle)
    throw Error('X profile handle must match its URL');
  return { id, platform: platform as SocialPlatform, label, handle, profileUrl: parsed.href };
}

const emptyProfile = (): AccountProfile => ({ displayName: '', email: '', location: '', about: '' });

function storedProfile(value: unknown): AccountProfile {
  const record = asRecord(value);
  // Empty personal details are permitted until the workspace owner fills them in.
  if (Object.keys(emptyProfile()).every(key => record[key] === '')) return emptyProfile();
  return parseAccountProfile(value);
}

export class AccountStore {
  private readonly file: string;
  private queue: Promise<void> = Promise.resolve();
  private documents?:DocumentStore;
  setDocuments(documents:DocumentStore){this.documents=documents;}
  constructor(root = process.cwd()) {
    this.file = resolve(root, '.runtime', 'account-studio.json');
  }
  async get(): Promise<AccountState> {
    try {
      const stored=this.documents?await this.documents.get<AccountState>('account','owner'):null;
      // Tenant data must never fall through to the local operator's JSON records.
      if(this.documents && this.documents.ownerId!=='local-owner' && !stored)
        return {revision:0,profile:emptyProfile(),socialAccounts:[]};
      const data=stored ? stored.value : JSON.parse(await readFile(this.file,'utf8')) as AccountState;
      if (!Number.isSafeInteger(data.revision) || data.revision < 0 ||
          !Array.isArray(data.socialAccounts) || data.socialAccounts.length > 80) throw Error('Invalid account workspace');
      const socialAccounts = data.socialAccounts.filter(row=>String(row.platform)!=='other').map(row => {
        if (!uuid.test(row.id)) throw Error('Invalid account ID');
        return parseSocialAccount(row, row.id);
      });
      if (new Set(socialAccounts.map(row => row.id)).size !== socialAccounts.length)
        throw Error('Duplicate account ID');
      return { revision: data.revision, profile: storedProfile(data.profile), socialAccounts };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      // New workspaces must not inherit a portfolio owner's identity or social links.
      return { revision: 0, profile: emptyProfile(), socialAccounts: [] };
    }
  }
  private change(expectedRevision: number, nextState: (state: AccountState) => AccountState): Promise<AccountState> {
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) return Promise.reject(Error('Invalid revision'));
    const operation = this.queue.then(async () => {
      const current = await this.get();
      if (current.revision !== expectedRevision) throw Error('Account data changed. Reload before saving.');
      const updated = nextState(current);
      updated.revision = current.revision + 1;
      if(this.documents){
        const existing=await this.documents.get<AccountState>('account','owner');
        await this.documents.put('account','owner',updated,existing?.version??0);
      }else{
        await mkdir(dirname(this.file), { recursive: true, mode: 0o700 });
        const temp = this.file + '.' + randomUUID() + '.tmp';
        await writeFile(temp, JSON.stringify(updated, null, 2) + '\n', { mode: 0o600 });
        await rename(temp, this.file);
      }
      return updated;
    });
    this.queue = operation.then(() => undefined, () => undefined);
    return operation;
  }
  updateProfile(revision: number, value: unknown) {
    const profile = parseAccountProfile(value);
    return this.change(revision, state => ({ ...state, profile }));
  }
  addSocial(revision: number, value: unknown) {
    const social = parseSocialAccount(value);
    return this.change(revision, state => {
      if (state.socialAccounts.length >= 80) throw Error('Maximum 80 social profiles');
      if (state.socialAccounts.some(item => item.platform === social.platform &&
          item.handle.toLowerCase() === social.handle.toLowerCase()))
        throw Error('Social profile already exists');
      return { ...state, socialAccounts: [...state.socialAccounts, social] };
    });
  }
  updateSocial(revision: number, id: string, value: unknown) {
    if (!uuid.test(id)) return Promise.reject(Error('Invalid account ID'));
    const social = parseSocialAccount(value, id);
    return this.change(revision, state => {
      if (!state.socialAccounts.some(s => s.id === id)) throw Error('Social account not found');
      if (state.socialAccounts.some(item => item.id !== id && item.platform === social.platform &&
          item.handle.toLowerCase() === social.handle.toLowerCase()))
        throw Error('Social profile already exists');
      return { ...state, socialAccounts: state.socialAccounts.map(s => s.id === id ? social : s) };
    });
  }
  removeSocial(revision: number, id: string) {
    if (!uuid.test(id)) return Promise.reject(Error('Invalid account ID'));
    return this.change(revision, state => {
      if (!state.socialAccounts.some(s => s.id === id)) throw Error('Social account not found');
      return { ...state, socialAccounts: state.socialAccounts.filter(s => s.id !== id) };
    });
  }
}
