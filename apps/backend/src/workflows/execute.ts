import { chmod, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { runtimePath } from '../core/paths.js';
import type { RunRequest, StreamEvent } from '../core/types.js';
import {
  addLinkedInFeatured,
  addLinkedInProject,
  addLinkedInSkill,
  audit as auditLinkedIn,
  editLinkedIn,
  editLinkedInExperience,
  editLinkedInServices,
  editLinkedInWebsite,
} from './steps/linkedin.js';
import type { WorkflowContext } from './steps/shared.js';
import { observeAfterNavigation } from './steps/shared.js';
import { auditSelectedPage, composeX, editX, mutateXPost, uploadXBanner } from './steps/x.js';

export type { WorkflowContext } from './steps/shared.js';
export { observeAfterNavigation } from './steps/shared.js';

export async function execute(ctx: WorkflowContext): Promise<void> {
  ctx.emit('status', 'Browser session connected');
  await (async () => {
    switch (ctx.input.action) {
      case 'audit':
        return auditLinkedIn(ctx);
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
  if (ctx.input.action !== 'audit' && ctx.input.action !== 'audit-page') {
    try {
      const dir = runtimePath('evidence', ctx.runId);
      await mkdir(dir, { recursive: true, mode: 0o700 });
      const name = `run-final-state.png`;
      const output = resolve(dir, name);
      await ctx.page.screenshot({ path: output, fullPage: false, timeout: 10000 });
      await chmod(output, 0o600);
      ctx.emit('screenshot', 'Captured run final state', {
        fileName: name,
      });
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
