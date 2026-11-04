import type { Locator } from 'playwright';
import type { RunRequest } from '../../core/types.js';
import { validatePostUrl } from '../../core/validate.js';
import {
  assertActive,
  ensureXOwner,
  image,
  navigate,
  observeAfterNavigation,
  one,
  save,
  type WorkflowContext,
} from './shared.js';

export async function editX(ctx: WorkflowContext): Promise<void> {
  await ensureXOwner(ctx);
  await ctx.page.locator('[data-testid="editProfileButton"]').click();
  const dialog = await one(ctx.page.getByRole('dialog'), 'X profile dialog');
  const fields: Array<[string, string | undefined, Locator]> = [
    ['bio', ctx.input.bio, dialog.locator('textarea').first()],
    ['location', ctx.input.location, dialog.getByRole('textbox', { name: /location/i })],
    ['website', ctx.input.website, dialog.getByRole('textbox', { name: /website/i })],
  ];
  for (const [field, value, loc] of fields) {
    if (value === undefined) continue;
    await (await one(loc, `X ${field}`)).fill(value);
    if ((await loc.inputValue()) !== value)
      throw new Error(`X_${field.toUpperCase()}_PRE_SAVE_MISMATCH`);
  }
  await image(ctx, 'x-profile-before-save');
  await ctx.approve('Review X profile fields and approve Save');
  for (const [field, value, loc] of fields) {
    if (value !== undefined && (await loc.inputValue()) !== value)
      throw new Error(`X_${field.toUpperCase()}_CHANGED`);
  }
  await save(ctx);
  await navigate(ctx, ctx.profile.href);
  if (ctx.input.bio) {
    const observed = await ctx.page.locator('[data-testid="UserDescription"]').innerText();
    if (observed.trim() !== ctx.input.bio.trim()) throw new Error('X_BIO_POST_SAVE_UNVERIFIED');
  }
  if (ctx.input.website || ctx.input.location) {
    const header = await ctx.page.locator('[data-testid="UserProfileHeader_Items"]').innerText();
    if (ctx.input.location && !header.includes(ctx.input.location))
      throw new Error('X_LOCATION_POST_SAVE_UNVERIFIED');
    if (ctx.input.website && !header.includes(new URL(ctx.input.website).hostname))
      throw new Error('X_WEBSITE_POST_SAVE_UNVERIFIED');
  }
  ctx.emit('result', 'X profile updates observed after a fresh page load');
}

export async function composeX(ctx: WorkflowContext): Promise<void> {
  await ensureXOwner(ctx);
  const text = ctx.input.postText!.trim();
  await navigate(ctx, 'https://x.com/compose/post');
  let editor = ctx.page.locator('[data-testid="tweetTextarea_0"]');
  if ((await editor.count()) !== 1) {
    await navigate(ctx, 'https://x.com/home');
    editor = ctx.page.locator('[data-testid="tweetTextarea_0"]');
  }
  await (await one(editor, 'X post composer')).fill(text);
  if ((await editor.innerText()).trim() !== text) throw new Error('COMPOSER_PRE_PUBLISH_MISMATCH');
  await image(ctx, 'x-post-before-publish');
  await ctx.approve(
    'Publishing is public and irreversible from this tool. Review the post and approve Publish',
  );
  if ((await editor.innerText()).trim() !== text) throw new Error('COMPOSER_CHANGED');
  const button = ctx.page.locator(
    '[data-testid="tweetButton"], [data-testid="tweetButtonInline"]:visible',
  );
  assertActive(ctx);
  await (await one(button, 'X publish button')).click();
  await navigate(ctx, ctx.profile.href);
  if (!(await ctx.page.locator('article').allInnerTexts()).some((t) => t.includes(text)))
    throw new Error('POST_PUBLISH_NOT_VERIFIED');
  ctx.emit('result', 'X post appeared on the profile after publication');
}

export async function mutateXPost(ctx: WorkflowContext): Promise<void> {
  await ensureXOwner(ctx);
  const target = validatePostUrl(ctx.profile, ctx.input.postUrl!).href;
  await navigate(ctx, target);
  const article = await one(ctx.page.locator('article'), 'target post');
  const text = (await article.innerText()).slice(0, 300);
  ctx.emit('step', 'Identified exact post for review', {
    target,
    excerpt: text,
  });
  await image(ctx, 'x-post-target');
  const kind = ctx.input.action === 'delete-post' ? 'Delete post permanently' : 'Pin post to profile';
  await ctx.approve(`${kind}: verify this is your intended post: ${target}`);
  assertActive(ctx);
  await (await one(article.locator('[data-testid="caret"]'), 'post menu')).click();
  if (ctx.input.action === 'pin-post') {
    await (
      await one(ctx.page.getByRole('menuitem', { name: /pin to your profile/i }), 'pin menu')
    ).click();
    const confirm = ctx.page.getByRole('button', { name: /pin/i });
    if ((await confirm.count()) === 1) await confirm.click();
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
    const state = (
      await ctx.page
        .locator('main')
        .innerText()
        .catch(() => '')
    ).toLowerCase();
    if (visible !== 0 || !/this post (was|has been) deleted/i.test(state)) {
      throw new Error('DELETE_POST_NOT_VERIFIED: no explicit deletion confirmation');
    }
    ctx.emit('result', 'Platform confirmed deletion of target post', {
      target,
    });
  }
}

export async function uploadXBanner(ctx: WorkflowContext): Promise<void> {
  const { stat, realpath } = await import('node:fs/promises');
  const { resolve, sep } = await import('node:path');
  const dir = await realpath(resolve(process.cwd(), 'assets'));
  const filename = await realpath(resolve(ctx.input.bannerPath!));
  if (!filename.startsWith(dir + sep) || !/\.(png|jpe?g|webp)$/i.test(filename)) {
    throw new Error('Banner must be a PNG/JPEG/WebP file within utomator/assets/');
  }
  const file = await stat(filename);
  if (!file.isFile() || file.size > 10 * 1024 * 1024)
    throw new Error('Banner must be an image under 10MB');
  await ensureXOwner(ctx);
  const previous = await ctx.page
    .locator('img[src*="profile_banners"]')
    .first()
    .getAttribute('src')
    .catch(() => null);
  await ctx.page.locator('[data-testid="editProfileButton"]').click();
  const dialog = await one(ctx.page.getByRole('dialog'), 'X profile editor');
  const picker = ctx.page.waitForEvent('filechooser', { timeout: 15000 });
  await (
    await one(dialog.getByRole('button', { name: 'Add banner photo' }), 'Add banner photo')
  ).click();
  await (await picker).setFiles(filename);
  const apply = ctx.page.getByRole('button', { name: /^(Apply|Crop|Done)$/i });
  if ((await apply.count()) !== 1) throw new Error('X_BANNER_CROP_CONTROL_AMBIGUOUS');
  await image(ctx, 'banner-crop-preview');
  await ctx.approve('Review banner crop and approve applying the crop');
  assertActive(ctx);
  await apply.click();
  await image(ctx, 'banner-before-profile-save');
  await ctx.approve('Review the entire X profile and approve saving the new banner');
  await save(ctx);
  await navigate(ctx, ctx.profile.href);
  const current = await ctx.page
    .locator('img[src*="profile_banners"]')
    .first()
    .getAttribute('src')
    .catch(() => null);
  if (!current || current === previous) throw new Error('X_BANNER_POST_SAVE_UNVERIFIED');
  ctx.emit('result', 'X banner changed after a fresh profile load');
}

export async function auditSelectedPage(ctx: WorkflowContext): Promise<void> {
  const target = ctx.input.pageUrl;
  if (!target) throw new Error('Choose a supported page scope before inspecting');
  await navigate(ctx, target);
  const data = await observeAfterNavigation(
    ctx.page,
    new URL(target),
    async () =>
      ctx.page.evaluate(() => ({
        title: document.title,
        url: location.href,
        excerpt: (
          (document.querySelector('main') as HTMLElement | null)?.innerText ||
          document.body.innerText ||
          ''
        )
          .replace(/\s+/g, ' ')
          .slice(0, 3500),
      })),
    {
      signal: ctx.signal,
      onRetry: (attempt) =>
        ctx.emit(
          'step',
          'Page navigated during inspection; retrying read-only read (' + attempt + '/2)',
        ),
    },
  );
  await image(ctx, 'audit-selected-page');
  ctx.emit('audit', 'Selected page observed (read-only)', data);
  ctx.emit('result', 'Scoped inspection saved. Review annotations before starting any change');
}
