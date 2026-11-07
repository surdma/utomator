/**
 * Connector sign-in and sync depend on these three members.
 * Infrastructure sessions that return a Playwright page are assignable here.
 * `beginView` stays on the concrete session.
 */
export const browserPortMethods = ['open', 'close', 'currentPage'] as const;

export interface BrowserPort {
  open(platform: string, accountId?: string): Promise<unknown>;
  close(): Promise<void>;
  readonly currentPage: unknown;
}
