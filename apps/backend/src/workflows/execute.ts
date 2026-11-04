import { image } from './steps/context.js';
import type { WorkflowContext } from './steps/context.js';
import { audit, auditSelectedPage } from './steps/audit.js';
import {
  addLinkedInFeatured,
  addLinkedInProject,
  addLinkedInSkill,
  editLinkedIn,
  editLinkedInExperience,
  editLinkedInServices,
  editLinkedInWebsite,
} from './steps/linkedin.js';
import { composeX, editX, mutateXPost, uploadXBanner } from './steps/x.js';

// The step families moved to workflows/steps/*; these re-exports preserve the
// public contract that runner.ts and the tests import from this module.
export type { WorkflowContext } from './steps/context.js';
export { observeAfterNavigation } from './steps/context.js';

export async function execute(ctx: WorkflowContext): Promise<void> {
  ctx.emit('status', 'Browser session connected');
  await (async () => {
    switch (ctx.input.action) {
      case 'audit':
        return audit(ctx);
      case 'audit-page':
        return auditSelectedPage(ctx);
      case 'edit-profile':
        return ctx.input.platform === 'linkedin' ? editLinkedIn(ctx) : editX(ctx);
      case 'add-skill':
        return addLinkedInSkill(ctx);
      case 'edit-experience':
        return editLinkedInExperience(ctx);
      case 'edit-website':
        return editLinkedInWebsite(ctx);
      case 'edit-services':
        return editLinkedInServices(ctx);
      case 'add-project':
        return addLinkedInProject(ctx);
      case 'add-featured':
        return addLinkedInFeatured(ctx);
      case 'upload-banner':
        return uploadXBanner(ctx);
      case 'compose-post':
        return composeX(ctx);
      case 'pin-post':
      case 'delete-post':
        return mutateXPost(ctx);
    }
  })();
  // Mutating handlers have already performed their read-back verification.
  // Capture the actual final browser state separately from the pre-save evidence.
  if (ctx.input.action !== 'audit' && ctx.input.action !== 'audit-page') {
    try {
      await image(ctx, 'run-final-state');
      const observed = await ctx.page.evaluate(() => ({
        title: document.title,
        url: location.href,
        excerpt: (
          (document.querySelector('main') as HTMLElement | null)?.innerText ||
          document.body.innerText ||
          ''
        )
          .replace(/\s+/g, ' ')
          .slice(0, 1800),
      }));
      ctx.emit('audit', 'Post-run browser page observed', observed);
    } catch (error) {
      ctx.emit(
        'error',
        'Result was verified, but post-run visual evidence is unavailable: ' +
          (error instanceof Error ? error.message : String(error)),
      );
    }
  }
}
