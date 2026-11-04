import { ConnectorService } from '../src/connect/service.ts';
import { AccountStore } from '../src/profile/account-store.ts';

const accounts = new AccountStore();
const before = await accounts.get();
const existing = before.socialAccounts.find((row) => row.platform === 'linkedin');
const service = new ConnectorService(accounts);
let id = existing?.id;
if (!id) {
  const started = await service.start('linkedin');
  id = started.accountId;
  console.log('started', started.status);
}
const synced = await service.sync(id);
const after = await accounts.get();
const row = after.socialAccounts.find((item) => item.id === id);
const profile = after.profile;
console.log(JSON.stringify({
  sync: synced.status,
  handle: row?.handle || null,
  photo: row?.avatarUrl?.includes('displayphoto')
    ? 'profile'
    : row?.avatarUrl?.includes('displaybackground')
      ? 'banner'
      : row?.avatarUrl
        ? 'other'
        : 'none',
  filled: {
    name: Boolean(profile.displayName),
    headline: Boolean(profile.headline),
    location: Boolean(profile.location),
    about: Boolean(profile.about) && !/top skills|… more|\.\.\. more/i.test(profile.about),
    experience: Boolean(profile.experience),
    education: Boolean(profile.education),
    skills: profile.skills.split('\n').filter(Boolean).length,
    website: Boolean(profile.website),
  },
}));
process.exit(0);
