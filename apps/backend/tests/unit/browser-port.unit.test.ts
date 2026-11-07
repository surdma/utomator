import { describe, expect, it } from 'vitest';
import { type BrowserPort, browserPortMethods } from '../../src/application/ports/browser-port.js';

describe('BrowserPort', () => {
  it('names the methods a connector session already calls', () => {
    expect(browserPortMethods).toEqual(['open', 'close', 'currentPage']);
  });

  it('accepts a fake that does not launch a browser', async () => {
    const fake: BrowserPort = {
      async open() {
        return { url: 'about:blank' };
      },
      async close() {},
      currentPage: undefined,
    };
    expect(await fake.open('linkedin')).toEqual({ url: 'about:blank' });
    expect(fake.currentPage).toBeUndefined();
  });
});
