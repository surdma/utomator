import type { Page } from 'playwright';
import type { RunRequest } from '../../core/types.js';
import {
  assertActive,
  ensureLinkedInOwner,
  image,
  navigate,
  observeAfterNavigation,
  one,
  save,
  type WorkflowContext,
} from './shared.js';

export async function audit(ctx: WorkflowContext): Promise<void> {
  await navigate(ctx, ctx.profile.href);
  const data = await observeAfterNavigation(
    ctx.page,
    ctx.profile,
    () =>
      ctx.page.evaluate((platform) => {
        const main = document.querySelector('main') || document.body;
        const headline = document.querySelector('.text-body-medium-breakwords') as HTMLElement | null;
        const bio = document.querySelector('[data-testid="UserDescription"]') as HTMLElement | null;
        const xName = document.querySelector('[data-testid="UserName"]') as HTMLElement | null;
        return {
          title: document.title,
          url: location.href,
          headline: platform === 'linkedin' ? (headline?.innerText.trim() ?? null) : null,
          bio: platform === 'x' ? (bio?.innerText.trim() ?? null) : null,
          xName: platform === 'x' ? (xName?.innerText.trim() ?? null) : null,
          excerpt: ((main as HTMLElement).innerText || '').replace(/\s+/g, ' ').slice(0, 1800),
        };
      }, ctx.input.platform),
    {
      signal: ctx.signal,
      onRetry: (attempt) =>
        ctx.emit(
          'step',
          `Profile navigated while reading; retrying read-only observation (${attempt}/2)`,
        ),
    },
  );
  await image(ctx, 'audit-profile');
  ctx.emit('audit', 'Profile UI observed (no changes made)', data);
  if (ctx.input.platform === 'linkedin') {
    const base = ctx.profile.href.replace(/\/$/, '');
    for (const section of ['experience', 'skills', 'projects', 'featured']) {
      assertActive(ctx);
      await navigate(ctx, `${base}/details/${section}/`);
      const excerpt = await ctx.page
        .locator('main')
        .innerText()
        .catch(() => '');
      await image(ctx, `audit-${section}`);
      ctx.emit('audit', `Observed LinkedIn ${section} section`, {
        section,
        url: ctx.page.url(),
        excerpt: excerpt.slice(0, 3500),
      });
    }
  }
  ctx.emit('result', 'Read-only audit and local evidence capture completed');
}

export async function editLinkedIn(ctx: WorkflowContext): Promise<void> {
  await ensureLinkedInOwner(ctx);
  const { headline, about } = ctx.input;
  const prefix = ctx.profile.href.replace(/\/$/, '');
  if (headline) {
    await navigate(ctx, `${prefix}/edit/intro/`);
    const field = await one(
      ctx.page.getByRole('textbox', { name: 'Headline', exact: true }),
      'LinkedIn headline',
    );
    await field.fill(headline);
    if ((await field.inputValue()) !== headline) throw new Error('HEADLINE_PRE_SAVE_MISMATCH');
    await image(ctx, 'headline-before-save');
    await ctx.approve(`Review LinkedIn headline (${headline.length} characters) and approve Save`);
    if ((await field.inputValue()) !== headline) throw new Error('HEADLINE_CHANGED_DURING_APPROVAL');
    await save(ctx);
    await navigate(ctx, ctx.profile.href);
    const observed = await ctx.page.locator('.text-body-medium-breakwords').first().innerText();
    if (!observed.includes(headline)) throw new Error('HEADLINE_POST_SAVE_UNVERIFIED');
    ctx.emit('result', 'LinkedIn headline verified on a fresh profile load', {
      chars: headline.length,
    });
  }
  if (about) {
    await navigate(ctx, `${prefix}/edit/forms/summary/new/`);
    const editor = await one(
      ctx.page.locator('.tiptap.ProseMirror[contenteditable="true"]'),
      'LinkedIn About editor',
    );
    await editor.click();
    await ctx.page.keyboard.press('ControlOrMeta+A');
    await ctx.page.keyboard.press('Backspace');
    const paragraphs = about
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter(Boolean);
    for (const [index, paragraph] of paragraphs.entries()) {
      if (index > 0) {
        await ctx.page.keyboard.press('Enter');
        await ctx.page.keyboard.press('Enter');
      }
      await ctx.page.keyboard.insertText(paragraph);
    }
    const value = (await editor.innerText()).replace(/\s+/g, ' ').trim();
    if (value !== paragraphs.join(' ').replace(/\s+/g, ' ').trim())
      throw new Error('ABOUT_PRE_SAVE_MISMATCH');
    await image(ctx, 'about-before-save');
    await ctx.approve('Review the LinkedIn About paragraphs in Chrome and approve Save');
    const afterApproval = (await editor.innerText()).replace(/\s+/g, ' ').trim();
    if (afterApproval !== value) throw new Error('ABOUT_CHANGED_DURING_APPROVAL');
    await save(ctx);
    await navigate(ctx, ctx.profile.href);
    await navigate(ctx, `${prefix}/edit/forms/summary/new/`);
    const reopened = await one(
      ctx.page.locator('.tiptap.ProseMirror[contenteditable="true"]'),
      'saved About editor',
    );
    const savedText = (await reopened.innerText()).replace(/\s+/g, ' ').trim();
    if (savedText !== value) throw new Error('ABOUT_POST_SAVE_UNVERIFIED');
    ctx.emit('result', 'LinkedIn About verified by reopening the saved editor', { chars: about.length });
  }
}

export async function addLinkedInSkill(ctx: WorkflowContext): Promise<void> {
  await ensureLinkedInOwner(ctx);
  const skill = ctx.input.skill!.trim();
  const prefix = ctx.profile.href.replace(/\/$/, '');
  await navigate(ctx, `${prefix}/details/skills/`);
  if ((await ctx.page.locator('main').innerText()).toLowerCase().includes(skill.toLowerCase())) {
    ctx.emit('result', 'Skill appears to be present; no edit made', { skill });
    return;
  }
  await navigate(ctx, `${prefix}/skills/edit/forms/new/`);
  const input = ctx.page.getByRole('textbox', { name: 'Skill*', exact: true });
  await (await one(input, 'Skill textbox')).fill(skill);
  let option = ctx.page.getByRole('option', { name: skill, exact: true });
  if ((await option.count()) !== 1) {
    const labels = (await ctx.page.getByRole('option').allInnerTexts())
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 12);
    if (!labels.length) throw new Error('LinkedIn returned no skill options');
    const selected = await ctx.ask(
      `Enter one exact LinkedIn skill option shown in Chrome: ${labels.join(' | ')}`,
    );
    if (!labels.includes(selected))
      throw new Error('Selected skill was not in the observed suggestions');
    option = ctx.page.getByRole('option', { name: selected, exact: true });
  }
  await (await one(option, `chosen skill option for ${skill}`)).click();
  await image(ctx, 'skill-before-save');
  await ctx.approve(`Confirm LinkedIn's selected standardized skill: ${skill}`);
  await save(ctx);
  await navigate(ctx, `${prefix}/details/skills/`);
  let found = false;
  for (let i = 0; i < 12; i++) {
    if ((await ctx.page.locator('main').innerText()).toLowerCase().includes(skill.toLowerCase())) {
      found = true;
      break;
    }
    await ctx.page.mouse.wheel(0, 1100);
  }
  if (!found) throw new Error('SKILL_POST_SAVE_UNVERIFIED');
  ctx.emit('result', 'LinkedIn skill verified', { skill });
}

export async function editLinkedInExperience(ctx: WorkflowContext): Promise<void> {
  await ensureLinkedInOwner(ctx);
  const prefix = ctx.profile.href.replace(/\/$/, '');
  const url = `${prefix}/edit/forms/position/${ctx.input.positionId}/`;
  await navigate(ctx, url);
  const editor = await one(
    ctx.page.locator('.tiptap.ProseMirror[contenteditable="true"]'),
    'experience description editor',
  );
  const paragraphs = ctx.input
    .description!.split(/\n+/)
    .map((v) => v.trim())
    .filter(Boolean);
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
    await (await one(ctx.page.getByLabel('Start month'), 'start month')).selectOption({
      label: ctx.input.startMonth,
    });
    await (await one(ctx.page.getByLabel(/Start year/), 'start year')).selectOption({
      label: ctx.input.startYear,
    });
  }
  await image(ctx, 'experience-before-save');
  await ctx.approve(
    `Check the existing position ${ctx.input.positionId} and dates in Chrome, then approve Save`,
  );
  const checked = await editor.locator(':scope > *').allInnerTexts();
  if (!checked.every((n, i) => n.trim() === paragraphs[i]) || checked.length !== paragraphs.length) {
    throw new Error('EXPERIENCE_CHANGED_DURING_APPROVAL');
  }
  await save(ctx);
  await navigate(ctx, url);
  const persisted = await (
    await one(
      ctx.page.locator('.tiptap.ProseMirror[contenteditable="true"]'),
      'reopened experience editor',
    )
  )
    .locator(':scope > *')
    .allInnerTexts();
  if (persisted.length !== paragraphs.length || !persisted.every((n, i) => n.trim() === paragraphs[i])) {
    throw new Error('EXPERIENCE_POST_SAVE_UNVERIFIED');
  }
  ctx.emit('result', 'Existing LinkedIn experience description verified after reopening', {
    positionId: ctx.input.positionId,
  });
}

export async function editLinkedInWebsite(ctx: WorkflowContext): Promise<void> {
  await ensureLinkedInOwner(ctx);
  const url = `${ctx.profile.href.replace(/\/$/, '')}/edit/forms/contact-info/new/`;
  await navigate(ctx, url);
  const index = ctx.input.websiteIndex ?? 0;
  let fields = ctx.page.getByLabel('Website URL', { exact: true });
  if ((await fields.count()) === index) {
    await (
      await one(ctx.page.getByRole('button', { name: 'Add website', exact: true }), 'Add website')
    ).click();
    fields = ctx.page.getByLabel('Website URL', { exact: true });
  }
  if ((await fields.count()) <= index) throw new Error('Specified website row is unavailable');
  await fields.nth(index).fill(ctx.input.website!);
  if (ctx.input.websiteType) {
    const types = ctx.page.getByLabel('Website type', { exact: true });
    if ((await types.count()) <= index) throw new Error('Website type selector missing');
    await types.nth(index).selectOption({ label: ctx.input.websiteType });
  }
  if ((await fields.nth(index).inputValue()) !== ctx.input.website)
    throw new Error('WEBSITE_PRE_SAVE_MISMATCH');
  await image(ctx, 'website-before-save');
  await ctx.approve('Review the LinkedIn website row and type in Chrome, then approve Save');
  if ((await fields.nth(index).inputValue()) !== ctx.input.website)
    throw new Error('WEBSITE_CHANGED_DURING_APPROVAL');
  await save(ctx);
  await navigate(ctx, url);
  fields = ctx.page.getByLabel('Website URL', { exact: true });
  if ((await fields.count()) <= index || (await fields.nth(index).inputValue()) !== ctx.input.website) {
    throw new Error('WEBSITE_POST_SAVE_UNVERIFIED');
  }
  if (ctx.input.websiteType) {
    const types = ctx.page.getByLabel('Website type', { exact: true });
    if (
      (await types.count()) <= index ||
      (await types.nth(index).locator('option:checked').innerText()) !== ctx.input.websiteType
    ) {
      throw new Error('WEBSITE_TYPE_POST_SAVE_UNVERIFIED');
    }
  }
  ctx.emit('result', 'LinkedIn website row persisted', { row: index + 1 });
}

export async function editLinkedInServices(ctx: WorkflowContext): Promise<void> {
  await ensureLinkedInOwner(ctx);
  const url = `${ctx.profile.href.replace(/\/$/, '')}/opportunities/services/edit/`;
  await navigate(ctx, url);
  const area = await one(ctx.page.locator('textarea'), 'services description');
  await area.fill(ctx.input.description!);
  if ((await area.inputValue()) !== ctx.input.description) throw new Error('SERVICES_PRE_SAVE_MISMATCH');
  await image(ctx, 'services-before-save');
  await ctx.approve('Review service categories, visibility and description before Save');
  if ((await area.inputValue()) !== ctx.input.description)
    throw new Error('SERVICES_CHANGED_DURING_APPROVAL');
  await save(ctx);
  await navigate(ctx, url);
  const saved = await one(ctx.page.locator('textarea'), 'persisted services description');
  if ((await saved.inputValue()) !== ctx.input.description)
    throw new Error('SERVICES_POST_SAVE_UNVERIFIED');
  ctx.emit('result', 'LinkedIn services description verified after reopening');
}

export async function addLinkedInProject(ctx: WorkflowContext): Promise<void> {
  await ensureLinkedInOwner(ctx);
  const prefix = ctx.profile.href.replace(/\/$/, '');
  await navigate(ctx, `${prefix}/details/projects/`);
  if ((await ctx.page.locator('main').innerText()).includes(ctx.input.projectName!)) {
    ctx.emit('result', 'Project name already found; no duplicate created', {
      name: ctx.input.projectName,
    });
    return;
  }
  await navigate(ctx, `${prefix}/edit/forms/project/new/`);
  const name = await one(ctx.page.getByLabel('Project name*', { exact: true }), 'project name');
  const description = await one(ctx.page.locator('textarea'), 'project description');
  await name.fill(ctx.input.projectName!);
  await description.fill(ctx.input.description!);
  if (
    (await name.inputValue()) !== ctx.input.projectName ||
    (await description.inputValue()) !== ctx.input.description
  ) {
    throw new Error('PROJECT_PRE_SAVE_MISMATCH');
  }
  if (ctx.input.projectUrl) {
    await (await one(ctx.page.getByRole('button', { name: 'Add media' }), 'Add media')).click();
    await (await one(ctx.page.getByRole('menuitem', { name: 'Add a link' }), 'Add a link')).click();
    const link = await one(
      ctx.page.getByRole('textbox', { name: /Paste or type a link/i }),
      'project media URL',
    );
    await link.fill(ctx.input.projectUrl);
    await (
      await one(ctx.page.getByRole('button', { name: 'Add', exact: true }), 'add media link')
    ).click();
    const previewSave = ctx.page.getByRole('button', {
      name: 'Save',
      exact: true,
    });
    const enabled = await previewSave
      .last()
      .isEnabled()
      .catch(() => false);
    if (!enabled) throw new Error('PROJECT_MEDIA_PREVIEW_FAILED');
    await image(ctx, 'project-media-preview');
    await ctx.approve('Review the requested project media preview, then approve adding the link');
    assertActive(ctx);
    await previewSave.last().click();
  }
  await image(ctx, 'project-before-save');
  await ctx.approve('Review project name, description and association, then approve project Save');
  if (
    (await name.inputValue()) !== ctx.input.projectName ||
    (await description.inputValue()) !== ctx.input.description
  ) {
    throw new Error('PROJECT_FIELDS_CHANGED');
  }
  await save(ctx);
  await navigate(ctx, `${prefix}/details/projects/`);
  const live = await ctx.page.locator('main').innerText();
  if (!live.includes(ctx.input.projectName!)) throw new Error('PROJECT_POST_SAVE_UNVERIFIED');
  ctx.emit('result', 'LinkedIn project appeared after a fresh load', {
    name: ctx.input.projectName,
  });
}

export async function addLinkedInFeatured(ctx: WorkflowContext): Promise<void> {
  await ensureLinkedInOwner(ctx);
  const url = `${ctx.profile.href.replace(/\/$/, '')}/details/featured/`;
  await navigate(ctx, url);
  if ((await ctx.page.locator('main').innerText()).includes(ctx.input.featuredTitle!)) {
    ctx.emit('result', 'Featured title already visible; duplicate avoided');
    return;
  }
  await (
    await one(ctx.page.getByRole('button', { name: 'Featured overflow menu' }), 'Featured menu')
  ).click();
  await (await one(ctx.page.getByRole('menuitem', { name: 'Add a link' }), 'Add a link')).click();
  const input = await one(
    ctx.page.getByRole('textbox', { name: /Paste or type a link/i }),
    'featured URL',
  );
  await input.fill(ctx.input.projectUrl!);
  await (await one(ctx.page.getByRole('button', { name: 'Add', exact: true }), 'Add link')).click();
  const named = ctx.page.getByRole('textbox', { name: /title/i });
  if ((await named.count()) !== 1) throw new Error('FEATURED_TITLE_SELECTOR_AMBIGUOUS');
  await named.fill(ctx.input.featuredTitle!);
  await image(ctx, 'featured-before-save');
  await ctx.approve('Review LinkedIn Featured link and title before Save');
  if ((await named.inputValue()) !== ctx.input.featuredTitle) throw new Error('FEATURED_CHANGED');
  await save(ctx);
  await navigate(ctx, url);
  if (!(await ctx.page.locator('main').innerText()).includes(ctx.input.featuredTitle!)) {
    throw new Error('FEATURED_POST_SAVE_UNVERIFIED');
  }
  ctx.emit('result', 'LinkedIn Featured link verified after fresh load');
}
