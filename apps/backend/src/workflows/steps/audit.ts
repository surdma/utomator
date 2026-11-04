import { assertActive, image, navigate, observeAfterNavigation, type WorkflowContext } from './context.js';

export async function audit(ctx: WorkflowContext): Promise<void> {
  await navigate(ctx, ctx.profile.href);
  const data = await observeAfterNavigation(
    ctx.page,
    ctx.profile,
    () =>
      ctx.page.evaluate((platform) => {
        // Playwright serializes this function to run in the page context.
        // Keep it self-contained: nested TSX helpers can compile to references
        // to Node-side __name, which is not defined in the browser.
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
  // Older snapshots covered separate LinkedIn tabs: About/Experience/Skills,
  // Projects and Featured. Capture them independently rather than pretending
  // a collapsed profile view is a complete audit.
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

export async function auditSelectedPage(ctx: WorkflowContext): Promise<void> {
  const target = ctx.input.pageUrl;
  if (!target) throw new Error('Choose a supported page scope before inspecting');
  // validateRun has constrained this to a profile or one allowed details page.
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
