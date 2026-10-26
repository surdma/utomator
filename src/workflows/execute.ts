import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Locator, Page } from 'playwright';
import type { RunRequest, StreamEvent } from '../core/types.js';
import { validatePostUrl } from '../core/validate.js';

export interface WorkflowContext {
  page: Page;
  input: RunRequest;
  profile: URL;
  runId: string;
  signal: AbortSignal;
  emit: (kind: StreamEvent['kind'], message: string, details?: unknown) => void;
  approve: (message: string) => Promise<void>;
  ask: (message: string) => Promise<string>;
}

function assertActive(ctx: WorkflowContext): void {
  if (ctx.signal.aborted) throw new Error('Run cancelled');
}

async function navigate(ctx: WorkflowContext, url: string): Promise<void> {
  assertActive(ctx);
  ctx.emit('step', `Navigating to ${new URL(url).pathname}`);
  await ctx.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  const expectedHosts = ctx.input.platform === 'linkedin'
    ? ['www.linkedin.com', 'linkedin.com'] : ['x.com', 'www.x.com'];
  const destination = new URL(ctx.page.url());
  if (destination.protocol !== 'https:' || !expectedHosts.includes(destination.hostname)) {
    throw new Error('Browser navigation left the expected platform');
  }
  if (/\/(login|checkpoint|challenge|i\/flow\/login)/i.test(destination.pathname)) {
    ctx.emit('step', 'Login or security verification is required in Chrome');
    await ctx.approve('Complete login or verification in the browser, then approve to continue');
    await ctx.page.goto(url, { waitUntil: 'domcontentloaded' });
    const continued = new URL(ctx.page.url());
    if (continued.protocol !== 'https:' || !expectedHosts.includes(continued.hostname)) {
      throw new Error('Browser navigation left the expected platform after login');
    }
    if (/\/(login|checkpoint|challenge|i\/flow\/login)/i.test(continued.pathname)) {
      throw new Error('Not authenticated; complete the browser challenge manually');
    }
  }
}

async function image(ctx: WorkflowContext, label: string): Promise<string> {
  const dir = resolve('.runtime', 'evidence', ctx.runId);
  await mkdir(dir, { recursive: true });
  const name = `${label.replace(/[^a-z0-9-]/gi, '_')}.png`;
  await ctx.page.screenshot({ path: resolve(dir, name), fullPage: false, timeout: 10000 });
  // Playwright's ariaSnapshot is the readable YAML-style accessibility evidence
  // used by the original browser workflow. Keep it with the matching screenshot.
  const snapshotName = name.replace(/\.png$/, '.yml');
  try {
    const tree = await ctx.page.locator('body').ariaSnapshot({ timeout: 10000 });
    await writeFile(resolve(dir, snapshotName), tree, { mode: 0o600 });
    ctx.emit('screenshot', `Screenshot and UI tree stored: ${name}, ${snapshotName}`);
  } catch (error) {
    ctx.emit('error', `Screenshot saved but accessibility tree unavailable: ${String(error)}`);
  }
  return name;
}

async function one(locator: Locator, label: string): Promise<Locator> {
  const n = await locator.count();
  if (n !== 1 || !await locator.isVisible()) throw new Error(`Expected one visible ${label}; found ${n}`);
  return locator;
}

async function save(ctx: WorkflowContext): Promise<void> {
  assertActive(ctx);
  const visibleButtons = ctx.page.getByRole('button', { name: 'Save', exact: true });
  const count = await visibleButtons.count();
  // Save controls sometimes also occur in the underlying page. Prefer the open modal.
  const dialog = ctx.page.getByRole('dialog').last();
  const button = await dialog.isVisible().catch(() => false)
    ? dialog.getByRole('button', { name: 'Save', exact: true }) : visibleButtons;
  if (count === 0) throw new Error('Save button not visible');
  assertActive(ctx);
  await (await one(button, 'Save button')).click();
  ctx.emit('step', 'Save clicked; checking the persisted result');
}

async function ensureLinkedInOwner(ctx: WorkflowContext): Promise<void> {
  await navigate(ctx, ctx.profile.href);
  let affordance = ctx.page.getByRole('button', { name: /edit intro/i });
  if (await affordance.count() === 0) affordance = ctx.page.locator('button[aria-label*="Edit intro"]');
  if (await affordance.count() === 0) {
    await ctx.approve('Open the correct signed-in LinkedIn account, confirm it is your profile, then continue');
    await navigate(ctx, ctx.profile.href);
    if (await affordance.count() === 0) throw new Error('Cannot establish edit ownership of LinkedIn profile');
  }
}

async function ensureXOwner(ctx: WorkflowContext): Promise<void> {
  await navigate(ctx, ctx.profile.href);
  const btn = ctx.page.locator('[data-testid="editProfileButton"]');
  if (await btn.count() === 0) {
    await ctx.approve('Sign into the X account that owns this profile, then approve');
    await navigate(ctx, ctx.profile.href);
  }
  await one(btn, 'Edit profile button');
}

async function audit(ctx: WorkflowContext): Promise<void> {
  await navigate(ctx, ctx.profile.href);
  const data = await ctx.page.evaluate((platform) => {
    // biome-ignore lint/performance/useDomNodeTextContent: An audit must read visible rendered text.
    const read = (selector: string) => (document.querySelector(selector) as HTMLElement | null)?.innerText?.trim() ?? null;
    const main = document.querySelector('main') || document.body;
    return {
      title: document.title,
      url: location.href,
      headline: platform === 'linkedin' ? read('.text-body-medium-breakwords') : null,
      bio: platform === 'x' ? read('[data-testid="UserDescription"]') : null,
      xName: platform === 'x' ? read('[data-testid="UserName"]') : null,
      // biome-ignore lint/performance/useDomNodeTextContent: Hidden nodes must not enter visible audit excerpts.
      excerpt: ((main as HTMLElement).innerText || '').replace(/\s+/g, ' ').slice(0, 1800),
    };
  }, ctx.input.platform);
  await image(ctx, 'audit-profile');
  ctx.emit('audit', 'Profile UI observed (no changes made)', data);
  // Older snapshots covered separate LinkedIn tabs: About/Experience/Skills,
  // Projects and Featured. Capture them independently rather than pretending
  // a collapsed profile view is a complete audit.
  if (ctx.input.platform === 'linkedin') {
    const base = ctx.profile.href.replace(/\/$/, '');
    for (const section of ['experience', 'skills', 'projects', 'featured']) {
      assertActive(ctx);
      await navigate(ctx, `${base}/details/${section}/`);
      const excerpt = await ctx.page.locator('main').innerText().catch(() => '');
      await image(ctx, `audit-${section}`);
      ctx.emit('audit', `Observed LinkedIn ${section} section`, {
        section, url: ctx.page.url(), excerpt: excerpt.slice(0, 3500),
      });
    }
  }
  ctx.emit('result', 'Read-only audit and local evidence capture completed');
}

async function editLinkedIn(ctx: WorkflowContext): Promise<void> {
  await ensureLinkedInOwner(ctx);
  const { headline, about } = ctx.input;
  const prefix = ctx.profile.href.replace(/\/$/, '');
  if (headline) {
    await navigate(ctx, `${prefix}/edit/intro/`);
    const field = await one(ctx.page.getByRole('textbox', { name: 'Headline', exact: true }), 'LinkedIn headline');
    await field.fill(headline);
    if (await field.inputValue() !== headline) throw new Error('HEADLINE_PRE_SAVE_MISMATCH');
    await image(ctx, 'headline-before-save');
    await ctx.approve(`Review LinkedIn headline (${headline.length} characters) and approve Save`);
    if (await field.inputValue() !== headline) throw new Error('HEADLINE_CHANGED_DURING_APPROVAL');
    await save(ctx);
    await navigate(ctx, ctx.profile.href);
    const observed = await ctx.page.locator('.text-body-medium-breakwords').first().innerText();
    if (!observed.includes(headline)) throw new Error('HEADLINE_POST_SAVE_UNVERIFIED');
    ctx.emit('result', 'LinkedIn headline verified on a fresh profile load', { chars: headline.length });
  }
  if (about) {
    await navigate(ctx, `${prefix}/edit/forms/summary/new/`);
    const editor = await one(ctx.page.locator('.tiptap.ProseMirror[contenteditable="true"]'), 'LinkedIn About editor');
    await editor.click();
    await ctx.page.keyboard.press('ControlOrMeta+A');
    await ctx.page.keyboard.press('Backspace');
    const paragraphs = about.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
    for (const [index, paragraph] of paragraphs.entries()) {
      if (index > 0) { await ctx.page.keyboard.press('Enter'); await ctx.page.keyboard.press('Enter'); }
      await ctx.page.keyboard.insertText(paragraph);
    }
    const value = (await editor.innerText()).replace(/\s+/g, ' ').trim();
    if (value !== paragraphs.join(' ').replace(/\s+/g, ' ').trim()) throw new Error('ABOUT_PRE_SAVE_MISMATCH');
    await image(ctx, 'about-before-save');
    await ctx.approve('Review the LinkedIn About paragraphs in Chrome and approve Save');
    const afterApproval = (await editor.innerText()).replace(/\s+/g, ' ').trim();
    if (afterApproval !== value) throw new Error('ABOUT_CHANGED_DURING_APPROVAL');
    await save(ctx);
    await navigate(ctx, ctx.profile.href);
    // Reopen the known edit form to read the persisted value rather than a collapsed preview.
    await navigate(ctx, `${prefix}/edit/forms/summary/new/`);
    const reopened = await one(ctx.page.locator('.tiptap.ProseMirror[contenteditable="true"]'), 'saved About editor');
    const savedText = (await reopened.innerText()).replace(/\s+/g, ' ').trim();
    if (savedText !== value) throw new Error('ABOUT_POST_SAVE_UNVERIFIED');
    ctx.emit('result', 'LinkedIn About verified by reopening the saved editor', { chars: about.length });
  }
}

async function addLinkedInSkill(ctx: WorkflowContext): Promise<void> {
  await ensureLinkedInOwner(ctx);
  const skill = ctx.input.skill!.trim();
  const prefix = ctx.profile.href.replace(/\/$/, '');
  await navigate(ctx, `${prefix}/details/skills/`);
  if ((await ctx.page.locator('main').innerText()).toLowerCase().includes(skill.toLowerCase())) {
    ctx.emit('result', 'Skill appears to be present; no edit made', { skill }); return;
  }
  await navigate(ctx, `${prefix}/skills/edit/forms/new/`);
  const input = ctx.page.getByRole('textbox', { name: 'Skill*', exact: true });
  await (await one(input, 'Skill textbox')).fill(skill);
  let option = ctx.page.getByRole('option', { name: skill, exact: true });
  if (await option.count() !== 1) {
    const labels = (await ctx.page.getByRole('option').allInnerTexts()).map(s => s.trim()).filter(Boolean).slice(0, 12);
    if (!labels.length) throw new Error('LinkedIn returned no skill options');
    const selected = await ctx.ask(`Enter one exact LinkedIn skill option shown in Chrome: ${labels.join(' | ')}`);
    if (!labels.includes(selected)) throw new Error('Selected skill was not in the observed suggestions');
    option = ctx.page.getByRole('option', { name: selected, exact: true });
  }
  await (await one(option, `chosen skill option for ${skill}`)).click();
  await image(ctx, 'skill-before-save');
  await ctx.approve(`Confirm LinkedIn's selected standardized skill: ${skill}`);
  await save(ctx);
  await navigate(ctx, `${prefix}/details/skills/`);
  // Scroll to load long skill sections. No infinite loops.
  let found = false;
  for (let i = 0; i < 12; i++) {
    if ((await ctx.page.locator('main').innerText()).toLowerCase().includes(skill.toLowerCase())) { found = true; break; }
    await ctx.page.mouse.wheel(0, 1100);
  }
  if (!found) throw new Error('SKILL_POST_SAVE_UNVERIFIED');
  ctx.emit('result', 'LinkedIn skill verified', { skill });
}

async function editX(ctx: WorkflowContext): Promise<void> {
  await ensureXOwner(ctx);
  await ctx.page.locator('[data-testid="editProfileButton"]').click();
  const dialog = await one(ctx.page.getByRole('dialog'), 'X profile dialog');
  // Historical form read showed input[type=text] ordered name, location, website.
  // Do not depend on that order for mutation; resolve by field metadata instead.
  const fields: Array<[string, string | undefined, Locator]> = [
    ['bio', ctx.input.bio, dialog.locator('textarea').first()],
    ['location', ctx.input.location, dialog.getByRole('textbox', { name: /location/i })],
    ['website', ctx.input.website, dialog.getByRole('textbox', { name: /website/i })],
  ];
  for (const [field, value, loc] of fields) {
    if (value === undefined) continue;
    await (await one(loc, `X ${field}`)).fill(value);
    if (await loc.inputValue() !== value) throw new Error(`X_${field.toUpperCase()}_PRE_SAVE_MISMATCH`);
  }
  await image(ctx, 'x-profile-before-save');
  await ctx.approve('Review X profile fields and approve Save');
  for (const [field, value, loc] of fields) {
    if (value !== undefined && await loc.inputValue() !== value) throw new Error(`X_${field.toUpperCase()}_CHANGED`);
  }
  await save(ctx);
  await navigate(ctx, ctx.profile.href);
  if (ctx.input.bio) {
    const observed = await ctx.page.locator('[data-testid="UserDescription"]').innerText();
    if (observed.trim() !== ctx.input.bio.trim()) throw new Error('X_BIO_POST_SAVE_UNVERIFIED');
  }
  if (ctx.input.website || ctx.input.location) {
    const header = await ctx.page.locator('[data-testid="UserProfileHeader_Items"]').innerText();
    if (ctx.input.location && !header.includes(ctx.input.location)) throw new Error('X_LOCATION_POST_SAVE_UNVERIFIED');
    if (ctx.input.website && !header.includes(new URL(ctx.input.website).hostname)) throw new Error('X_WEBSITE_POST_SAVE_UNVERIFIED');
  }
  ctx.emit('result', 'X profile updates observed after a fresh page load');
}

async function composeX(ctx: WorkflowContext): Promise<void> {
  await ensureXOwner(ctx);
  const text = ctx.input.postText!.trim();
  await navigate(ctx, 'https://x.com/compose/post');
  let editor = ctx.page.locator('[data-testid="tweetTextarea_0"]');
  if (await editor.count() !== 1) { await navigate(ctx, 'https://x.com/home'); editor = ctx.page.locator('[data-testid="tweetTextarea_0"]'); }
  await (await one(editor, 'X post composer')).fill(text);
  if ((await editor.innerText()).trim() !== text) throw new Error('COMPOSER_PRE_PUBLISH_MISMATCH');
  await image(ctx, 'x-post-before-publish');
  await ctx.approve('Publishing is public and irreversible from this tool. Review the post and approve Publish');
  if ((await editor.innerText()).trim() !== text) throw new Error('COMPOSER_CHANGED');
  const button = ctx.page.locator('[data-testid="tweetButton"], [data-testid="tweetButtonInline"]:visible');
  assertActive(ctx);
  await (await one(button, 'X publish button')).click();
  await navigate(ctx, ctx.profile.href);
  // Treat missing immediate timeline evidence as unverified, not success.
  if (!(await ctx.page.locator('article').allInnerTexts()).some(t => t.includes(text))) throw new Error('POST_PUBLISH_NOT_VERIFIED');
  ctx.emit('result', 'X post appeared on the profile after publication');
}

async function mutateXPost(ctx: WorkflowContext): Promise<void> {
  await ensureXOwner(ctx);
  const target = validatePostUrl(ctx.profile, ctx.input.postUrl!).href;
  await navigate(ctx, target);
  const article = await one(ctx.page.locator('article'), 'target post');
  const text = (await article.innerText()).slice(0, 300);
  ctx.emit('step', 'Identified exact post for review', { target, excerpt: text });
  await image(ctx, 'x-post-target');
  const kind = ctx.input.action === 'delete-post' ? 'Delete post permanently' : 'Pin post to profile';
  await ctx.approve(`${kind}: verify this is your intended post: ${target}`);
  assertActive(ctx);
  await (await one(article.locator('[data-testid="caret"]'), 'post menu')).click();
  if (ctx.input.action === 'pin-post') {
    await (await one(ctx.page.getByRole('menuitem', { name: /pin to your profile/i }), 'pin menu')).click();
    const confirm = ctx.page.getByRole('button', { name: /pin/i });
    if (await confirm.count() === 1) await confirm.click();
    await navigate(ctx, target);
    const liveText = await ctx.page.locator('article').first().innerText();
    if (!/pinned/i.test(liveText)) throw new Error('PIN_POST_SAVE_UNVERIFIED');
    ctx.emit('result', 'Pinned status verified', { target });
  } else {
    await (await one(ctx.page.getByRole('menuitem', { name: /^delete$/i }), 'delete menu')).click();
    await ctx.approve(`FINAL CONFIRMATION: permanently delete exactly this post? ${target}`);
    assertActive(ctx);
  await (await one(ctx.page.getByRole('button', { name: /^delete$/i }), 'confirm Delete')).click();
    await navigate(ctx, target);
    const visible = await ctx.page.locator('article').count();
    const state = (await ctx.page.locator('main').innerText().catch(() => '')).toLowerCase();
    // An empty article list may be a loading screen; only explicit confirmation counts.
    if (visible !== 0 || !/this post (was|has been) deleted/i.test(state)) {
      throw new Error('DELETE_POST_NOT_VERIFIED: no explicit deletion confirmation');
    }
    ctx.emit('result', 'Platform confirmed deletion of target post', { target });
  }
}



async function editLinkedInExperience(ctx: WorkflowContext): Promise<void> {
  await ensureLinkedInOwner(ctx);
  const prefix = ctx.profile.href.replace(/\/$/, '');
  const url = `${prefix}/edit/forms/position/${ctx.input.positionId}/`;
  await navigate(ctx, url);
  const editor = await one(ctx.page.locator('.tiptap.ProseMirror[contenteditable="true"]'), 'experience description editor');
  const paragraphs = ctx.input.description!.split(/\n+/).map(v => v.trim()).filter(Boolean);
  await editor.click();
  await ctx.page.keyboard.press('ControlOrMeta+A');
  await ctx.page.keyboard.press('Backspace');
  for (const [index, paragraph] of paragraphs.entries()) {
    if (index) await ctx.page.keyboard.press('Enter');
    await ctx.page.keyboard.insertText(paragraph);
  }
  const nodes = await editor.locator(':scope > *').allInnerTexts();
  if (nodes.length !== paragraphs.length || !nodes.every((n, i) => n.trim() === paragraphs[i])) {
    throw new Error('EXPERIENCE_STRUCT_PRE_SAVE_MISMATCH');
  }
  if (ctx.input.startMonth && ctx.input.startYear) {
    await (await one(ctx.page.getByLabel('Start month'), 'start month')).selectOption({ label: ctx.input.startMonth });
    await (await one(ctx.page.getByLabel(/Start year/), 'start year')).selectOption({ label: ctx.input.startYear });
  }
  await image(ctx, 'experience-before-save');
  await ctx.approve(`Check the existing position ${ctx.input.positionId} and dates in Chrome, then approve Save`);
  const checked = await editor.locator(':scope > *').allInnerTexts();
  if (!checked.every((n, i) => n.trim() === paragraphs[i]) || checked.length !== paragraphs.length) {
    throw new Error('EXPERIENCE_CHANGED_DURING_APPROVAL');
  }
  await save(ctx);
  await navigate(ctx, url);
  const persisted = await (await one(ctx.page.locator('.tiptap.ProseMirror[contenteditable="true"]'), 'reopened experience editor')).locator(':scope > *').allInnerTexts();
  if (persisted.length !== paragraphs.length || !persisted.every((n, i) => n.trim() === paragraphs[i])) {
    throw new Error('EXPERIENCE_POST_SAVE_UNVERIFIED');
  }
  ctx.emit('result', 'Existing LinkedIn experience description verified after reopening', { positionId: ctx.input.positionId });
}

async function editLinkedInWebsite(ctx: WorkflowContext): Promise<void> {
  await ensureLinkedInOwner(ctx);
  const url = `${ctx.profile.href.replace(/\/$/, '')}/edit/forms/contact-info/new/`;
  await navigate(ctx, url);
  const index = ctx.input.websiteIndex ?? 0;
  let fields = ctx.page.getByLabel('Website URL', { exact: true });
  if (await fields.count() === index) {
    await (await one(ctx.page.getByRole('button', { name: 'Add website', exact: true }), 'Add website')).click();
    fields = ctx.page.getByLabel('Website URL', { exact: true });
  }
  if (await fields.count() <= index) throw new Error('Specified website row is unavailable');
  await fields.nth(index).fill(ctx.input.website!);
  if (ctx.input.websiteType) {
    const types = ctx.page.getByLabel('Website type', { exact: true });
    if (await types.count() <= index) throw new Error('Website type selector missing');
    await types.nth(index).selectOption({ label: ctx.input.websiteType });
  }
  if (await fields.nth(index).inputValue() !== ctx.input.website) throw new Error('WEBSITE_PRE_SAVE_MISMATCH');
  await image(ctx, 'website-before-save');
  await ctx.approve('Review the LinkedIn website row and type in Chrome, then approve Save');
  if (await fields.nth(index).inputValue() !== ctx.input.website) throw new Error('WEBSITE_CHANGED_DURING_APPROVAL');
  await save(ctx);
  await navigate(ctx, url);
  fields = ctx.page.getByLabel('Website URL', { exact: true });
  if (await fields.count() <= index || await fields.nth(index).inputValue() !== ctx.input.website) {
    throw new Error('WEBSITE_POST_SAVE_UNVERIFIED');
  }
  ctx.emit('result', 'LinkedIn website row persisted', { row: index + 1 });
}

async function editLinkedInServices(ctx: WorkflowContext): Promise<void> {
  await ensureLinkedInOwner(ctx);
  const url = `${ctx.profile.href.replace(/\/$/, '')}/opportunities/services/edit/`;
  await navigate(ctx, url);
  const area = await one(ctx.page.locator('textarea'), 'services description');
  await area.fill(ctx.input.description!);
  if (await area.inputValue() !== ctx.input.description) throw new Error('SERVICES_PRE_SAVE_MISMATCH');
  await image(ctx, 'services-before-save');
  await ctx.approve('Review service categories, visibility and description before Save');
  if (await area.inputValue() !== ctx.input.description) throw new Error('SERVICES_CHANGED_DURING_APPROVAL');
  await save(ctx);
  await navigate(ctx, url);
  const saved = await one(ctx.page.locator('textarea'), 'persisted services description');
  if (await saved.inputValue() !== ctx.input.description) throw new Error('SERVICES_POST_SAVE_UNVERIFIED');
  ctx.emit('result', 'LinkedIn services description verified after reopening');
}

async function addLinkedInProject(ctx: WorkflowContext): Promise<void> {
  await ensureLinkedInOwner(ctx);
  const prefix = ctx.profile.href.replace(/\/$/, '');
  await navigate(ctx, `${prefix}/details/projects/`);
  if ((await ctx.page.locator('main').innerText()).includes(ctx.input.projectName!)) {
    ctx.emit('result', 'Project name already found; no duplicate created', { name: ctx.input.projectName });
    return;
  }
  await navigate(ctx, `${prefix}/edit/forms/project/new/`);
  const name = await one(ctx.page.getByLabel('Project name*', { exact: true }), 'project name');
  const description = await one(ctx.page.locator('textarea'), 'project description');
  await name.fill(ctx.input.projectName!);
  await description.fill(ctx.input.description!);
  if (await name.inputValue() !== ctx.input.projectName || await description.inputValue() !== ctx.input.description) {
    throw new Error('PROJECT_PRE_SAVE_MISMATCH');
  }
  // Link previews are asynchronous and can fail. Never silently save a project without its requested media.
  if (ctx.input.projectUrl) {
    await (await one(ctx.page.getByRole('button', { name: 'Add media' }), 'Add media')).click();
    await (await one(ctx.page.getByRole('menuitem', { name: 'Add a link' }), 'Add a link')).click();
    const link = await one(ctx.page.getByRole('textbox', { name: /Paste or type a link/i }), 'project media URL');
    await link.fill(ctx.input.projectUrl);
    await (await one(ctx.page.getByRole('button', { name: 'Add', exact: true }), 'add media link')).click();
    const previewSave = ctx.page.getByRole('button', { name: 'Save', exact: true });
    const enabled = await previewSave.last().isEnabled().catch(() => false);
    if (!enabled) throw new Error('PROJECT_MEDIA_PREVIEW_FAILED');
    await image(ctx, 'project-media-preview');
    await ctx.approve('Review the requested project media preview, then approve adding the link');
    assertActive(ctx);
    await previewSave.last().click();
  }
  await image(ctx, 'project-before-save');
  await ctx.approve('Review project name, description and association, then approve project Save');
  if (await name.inputValue() !== ctx.input.projectName ||
      await description.inputValue() !== ctx.input.description) {
    throw new Error('PROJECT_FIELDS_CHANGED');
  }
  await save(ctx);
  await navigate(ctx, `${prefix}/details/projects/`);
  const live = await ctx.page.locator('main').innerText();
  if (!live.includes(ctx.input.projectName!)) throw new Error('PROJECT_POST_SAVE_UNVERIFIED');
  ctx.emit('result', 'LinkedIn project appeared after a fresh load', { name: ctx.input.projectName });
}

async function addLinkedInFeatured(ctx: WorkflowContext): Promise<void> {
  await ensureLinkedInOwner(ctx);
  const url = `${ctx.profile.href.replace(/\/$/, '')}/details/featured/`;
  await navigate(ctx, url);
  if ((await ctx.page.locator('main').innerText()).includes(ctx.input.featuredTitle!)) {
    ctx.emit('result', 'Featured title already visible; duplicate avoided'); return;
  }
  await (await one(ctx.page.getByRole('button', { name: 'Featured overflow menu' }), 'Featured menu')).click();
  await (await one(ctx.page.getByRole('menuitem', { name: 'Add a link' }), 'Add a link')).click();
  const input = await one(ctx.page.getByRole('textbox', { name: /Paste or type a link/i }), 'featured URL');
  await input.fill(ctx.input.projectUrl!);
  await (await one(ctx.page.getByRole('button', { name: 'Add', exact: true }), 'Add link')).click();
  // Inspect the current dialog. If we cannot uniquely identify title, stop for a manual update.
  const named = ctx.page.getByRole('textbox', { name: /title/i });
  if (await named.count() !== 1) throw new Error('FEATURED_TITLE_SELECTOR_AMBIGUOUS');
  await named.fill(ctx.input.featuredTitle!);
  await image(ctx, 'featured-before-save');
  await ctx.approve('Review LinkedIn Featured link and title before Save');
  if (await named.inputValue() !== ctx.input.featuredTitle) throw new Error('FEATURED_CHANGED');
  await save(ctx);
  await navigate(ctx, url);
  if (!(await ctx.page.locator('main').innerText()).includes(ctx.input.featuredTitle!)) {
    throw new Error('FEATURED_POST_SAVE_UNVERIFIED');
  }
  ctx.emit('result', 'LinkedIn Featured link verified after fresh load');
}

async function uploadXBanner(ctx: WorkflowContext): Promise<void> {
  const { stat, realpath } = await import('node:fs/promises');
  const { resolve, sep } = await import('node:path');
  const dir = await realpath(resolve(process.cwd(), 'assets'));
  const filename = await realpath(resolve(ctx.input.bannerPath!));
  if (!filename.startsWith(dir + sep) || !/\.(png|jpe?g|webp)$/i.test(filename)) {
    throw new Error('Banner must be a PNG/JPEG/WebP file within utomator/assets/');
  }
  const file = await stat(filename);
  if (!file.isFile() || file.size > 10 * 1024 * 1024) throw new Error('Banner must be an image under 10MB');
  await ensureXOwner(ctx);
  const previous = await ctx.page.locator('img[src*="profile_banners"]').first().getAttribute('src').catch(() => null);
  await ctx.page.locator('[data-testid="editProfileButton"]').click();
  const dialog = await one(ctx.page.getByRole('dialog'), 'X profile editor');
  const picker = ctx.page.waitForEvent('filechooser', { timeout: 15000 });
  await (await one(dialog.getByRole('button', { name: 'Add banner photo' }), 'Add banner photo')).click();
  await (await picker).setFiles(filename);
  const apply = ctx.page.getByRole('button', { name: /^(Apply|Crop|Done)$/i });
  if (await apply.count() !== 1) throw new Error('X_BANNER_CROP_CONTROL_AMBIGUOUS');
  await image(ctx, 'banner-crop-preview');
  await ctx.approve('Review banner crop and approve applying the crop');
  assertActive(ctx);
  await apply.click();
  await image(ctx, 'banner-before-profile-save');
  await ctx.approve('Review the entire X profile and approve saving the new banner');
  await save(ctx);
  await navigate(ctx, ctx.profile.href);
  const current = await ctx.page.locator('img[src*="profile_banners"]').first().getAttribute('src').catch(() => null);
  if (!current || current === previous) throw new Error('X_BANNER_POST_SAVE_UNVERIFIED');
  ctx.emit('result', 'X banner changed after a fresh profile load');
}

export async function execute(ctx: WorkflowContext): Promise<void> {
  ctx.emit('status', 'Browser session connected');
  switch (ctx.input.action) {
    case 'audit': return audit(ctx);
    case 'edit-profile': return ctx.input.platform === 'linkedin' ? editLinkedIn(ctx) : editX(ctx);
    case 'add-skill': return addLinkedInSkill(ctx);
    case 'edit-experience': return editLinkedInExperience(ctx);
    case 'edit-website': return editLinkedInWebsite(ctx);
    case 'edit-services': return editLinkedInServices(ctx);
    case 'add-project': return addLinkedInProject(ctx);
    case 'add-featured': return addLinkedInFeatured(ctx);
    case 'upload-banner': return uploadXBanner(ctx);
    case 'compose-post': return composeX(ctx);
    case 'pin-post':
    case 'delete-post': return mutateXPost(ctx);
  }
}
