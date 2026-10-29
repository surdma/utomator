import { mkdir, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import {
  chromium,
  type BrowserContext,
  type CDPSession,
  type Page,
} from 'playwright';
import { classifyProviderAuth } from './vault-probe.js';
import { navigateWithRetry, streamSignInUrl } from './navigation.js';

/**
 * Streamed sign-in broker.
 *
 * Hosted connector sign-in: the backend launches a throwaway headless context
 * pointed at the provider's login page and streams CDP screencast frames to the
 * user's browser while dispatching their raw input back through CDP. Keystrokes
 * are mapped command-by-command — no form value is ever buffered, stored or
 * logged, so the user's password never passes anywhere except into the provider.
 */

export const STREAM_VIEWPORT = { width: 1280, height: 800 } as const;
/** Minimum spacing between back-to-back input dispatches (defensive pacing). */
export const INPUT_PACING_MS = 16;
const COMPLETION_POLL_MS = 1200;

export type BrokerState =
  'launching' | 'streaming' | 'authenticated' | 'closed';

/** Raw input relay events. Coordinates are in the streamed viewport space. */
export type BrokerInput =
  | {
      kind: 'pointer';
      phase: 'down' | 'move' | 'up';
      x: number;
      y: number;
      button?: string;
      buttons?: number;
    }
  | { kind: 'wheel'; x: number; y: number; deltaY: number }
  | { kind: 'key'; phase: 'down' | 'up'; code: string; text?: string }
  | { kind: 'text'; text: string };
// Touch (phone) relays reuse pointer taps and wheel scrolling in v1; native
// touchPoints land here when the frontend exposes real gesture tracking.

export type FrameEvent = { base64: string; sessionId: number };
export type CompletionContext = {
  page: Page;
  context: BrowserContext;
  platform: 'linkedin' | 'x';
};
export type CdpCommand = { method: string; params: Record<string, unknown> };

/** Common keyboard codes; printable text is carried verbatim. */
const VIRTUAL_KEYS: Record<string, number | undefined> = {
  Backspace: 8,
  Tab: 9,
  Enter: 13,
  ShiftLeft: 16,
  ShiftRight: 16,
  ControlLeft: 17,
  ControlRight: 17,
  AltLeft: 18,
  AltRight: 18,
  Escape: 27,
  Space: 32,
  PageUp: 33,
  PageDown: 34,
  End: 35,
  Home: 36,
  ArrowLeft: 37,
  ArrowUp: 38,
  ArrowRight: 39,
  ArrowDown: 40,
  Delete: 46,
  Semicolon: 186,
  Equal: 187,
  Comma: 188,
  Minus: 189,
  Period: 190,
  Slash: 191,
  Backquote: 192,
  BracketLeft: 219,
  Backslash: 220,
  BracketRight: 221,
  Quote: 222,
};
const virtualKey = (code: string): number | undefined => {
  const direct = VIRTUAL_KEYS[code];
  if (direct) return direct;
  const digit = /^Digit([0-9])$/.exec(code);
  if (digit) return 48 + Number(digit[1]!);
  const letter = /^Key([A-Z])$/.exec(code);
  if (letter) return letter[1]!.charCodeAt(0);
  return undefined;
};
const POINTER_BUTTON = {
  left: 'left',
  right: 'right',
  middle: 'middle',
} as const;

/**
 * Pure input → CDP command mapping. The broker applies whatever these return;
 * tests pin the contract so relay behavior cannot drift into buffering or
 * synthesizing form values.
 */
export function mapBrokerInput(event: BrokerInput): CdpCommand[] {
  if (event.kind === 'pointer') {
    const type =
      event.phase === 'down'
        ? 'mousePressed'
        : event.phase === 'up'
          ? 'mouseReleased'
          : 'mouseMoved';
    return [
      {
        method: 'Input.dispatchMouseEvent',
        params: {
          type,
          x: event.x,
          y: event.y,
          button:
            event.phase === 'move'
              ? 'none'
              : POINTER_BUTTON[
                  (event.button || 'left') as keyof typeof POINTER_BUTTON
                ] || 'left',
          buttons: event.buttons ?? 1,
          ...(event.phase === 'down' || event.phase === 'up'
            ? { clickCount: 1 }
            : {}),
        },
      },
    ];
  }
  if (event.kind === 'wheel') {
    return [
      {
        method: 'Input.dispatchMouseEvent',
        params: {
          type: 'mouseWheel',
          x: event.x,
          y: event.y,
          deltaX: 0,
          deltaY: event.deltaY,
          button: 'none',
        },
      },
    ];
  }
  if (event.kind === 'key') {
    const text =
      typeof event.text === 'string' && event.text.length === 1
        ? event.text
        : undefined;
    return [
      {
        method: 'Input.dispatchKeyEvent',
        params:
          event.phase === 'down'
            ? {
                type: text ? 'keyDown' : 'rawKeyDown',
                code: event.code,
                windowsVirtualKeyCode: virtualKey(event.code),
                nativeVirtualKeyCode: virtualKey(event.code),
                ...(text ? { text } : {}),
              }
            : {
                type: 'keyUp',
                code: event.code,
                windowsVirtualKeyCode: virtualKey(event.code),
                nativeVirtualKeyCode: virtualKey(event.code),
              },
      },
    ];
  }
  // Composed text (IME-safe path): dispatch as char input.
  return [{ method: 'Input.insertText', params: { text: event.text } }];
}

/** Production browser: throwaway scratch persistent context, strictly headless. */
export const defaultLaunch = async (
  platform: 'linkedin' | 'x'
): Promise<{
  page: Page;
  context: BrowserContext;
  dispose: () => Promise<void>;
}> => {
  const dir = resolve(
    '.runtime',
    'chrome',
    'scratch',
    randomUUID() + '-' + platform
  );
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const context = await chromium.launchPersistentContext(dir, {
    headless: true,
    viewport: { width: STREAM_VIEWPORT.width, height: STREAM_VIEWPORT.height },
    acceptDownloads: false,
  });
  const page = context.pages()[0] ?? (await context.newPage());
  return {
    page,
    context,
    dispose: () =>
      context
        .close()
        .then(() => rm(dir, { recursive: true, force: true }).catch(() => {})),
  };
};

export type BrokerDeps = {
  /** Testable launch boundary; production uses the scratch persistent context. */
  launch?: typeof defaultLaunch;
  cdpFactory?: (context: BrowserContext, page: Page) => Promise<CDPSession>;
};

type ScreencastFrame = {
  data?: unknown;
  sessionId?: number;
  metadata?: { deviceWidth?: number; deviceHeight?: number };
};

export class SignInBroker {
  state: BrokerState = 'launching';
  private page?: Page;
  private context?: BrowserContext;
  private cdp?: CDPSession;
  private disposeContext?: () => Promise<void>;
  private frames = 0;
  private lastInputAt = 0;
  private completion?: Promise<CompletionContext>;
  private completionResolve?: (value: CompletionContext) => void;
  private completionReject?: (error: Error) => void;
  private timer?: ReturnType<typeof setTimeout>;
  private poller?: ReturnType<typeof setInterval>;
  private frameListeners = new Set<(frame: FrameEvent) => void>();
  private completionListeners = new Set<(context: CompletionContext) => void>();
  private closeListeners = new Set<(reason: string) => void>();

  constructor(
    readonly platform: 'linkedin' | 'x' = 'linkedin',
    private readonly deps: BrokerDeps = {},
    private readonly ttlMs = 10 * 60 * 1000
  ) {}

  onFrame(listener: (frame: FrameEvent) => void): () => void {
    this.frameListeners.add(listener);
    return () => {
      this.frameListeners.delete(listener);
    };
  }
  onAuthenticated(listener: (context: CompletionContext) => void): void {
    this.completionListeners.add(listener);
  }
  onClosed(listener: (reason: string) => void): () => void {
    this.closeListeners.add(listener);
    return () => {
      this.closeListeners.delete(listener);
    };
  }

  async start(): Promise<void> {
    if (this.state !== 'launching') throw Error('Broker already started');
    const launch = this.deps.launch ?? defaultLaunch;
    const session = await launch(this.platform);
    this.page = session.page;
    this.context = session.context;
    this.disposeContext = session.dispose;
    this.cdp = this.deps.cdpFactory
      ? await this.deps.cdpFactory(this.context, this.page)
      : await this.context.newCDPSession(this.page);
    await navigateWithRetry(this.page, streamSignInUrl[this.platform], {
      waitUntil: 'domcontentloaded',
      timeout: 15000,
      maxAttempts: 2,
      baseDelayMs: 400,
    });
    this.cdp.on('Page.screencastFrame', (frame: unknown) =>
      this.handleFrame(frame as ScreencastFrame)
    );
    await this.cdp.send('Page.startScreencast', {
      format: 'jpeg',
      quality: 55,
      everyNthFrame: 1,
      maxWidth: STREAM_VIEWPORT.width,
      maxHeight: STREAM_VIEWPORT.height,
    } as never);
    this.state = 'streaming';
    this.timer = setTimeout(() => {
      void this.terminate('ttl-expired');
    }, this.ttlMs);
    this.poller = setInterval(() => {
      void this.checkAuthenticated().catch(() => {});
    }, COMPLETION_POLL_MS);
  }

  private handleFrame(frame: ScreencastFrame): void {
    if (
      this.state === 'closed' ||
      typeof frame?.data !== 'string' ||
      typeof frame?.sessionId !== 'number'
    )
      return;
    this.frames += 1;
    const event: FrameEvent = {
      base64: frame.data,
      sessionId: frame.sessionId,
    };
    for (const listener of this.frameListeners) {
      try {
        listener(event);
      } catch {
        /* a slow frame consumer must not break streaming */
      }
    }
    // Ack so the browser keeps producing frames; stale frames self-replace.
    void this.cdp
      ?.send('Page.screencastFrameAck', { sessionId: frame.sessionId } as never)
      .catch(() => undefined);
  }

  private async checkAuthenticated(): Promise<void> {
    if (this.state !== 'streaming' || !this.page) return;
    const here = this.page.url();
    if (classifyProviderAuth(here, this.platform) !== 'authenticated') return;
    // Require the URL to settle so mid-navigation probes do not race.
    await new Promise((resolve) => setTimeout(resolve, 600));
    if (this.state !== 'streaming' || !this.page) return;
    if (
      classifyProviderAuth(this.page.url(), this.platform) !== 'authenticated'
    )
      return;
    if (this.completion) return;
    this.completion = new Promise<CompletionContext>((resolve, reject) => {
      this.completionResolve = resolve;
      this.completionReject = reject;
    });
    this.completionResolve?.({
      page: this.page,
      context: this.context!,
      platform: this.platform,
    });
    this.state = 'authenticated';
    if (this.poller) clearInterval(this.poller);
    this.poller = undefined;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    for (const listener of this.completionListeners) {
      try {
        listener(await this.completion);
      } catch {
        /* wiring decides how to surface capture failures */
      }
    }
  }

  /**
   * Wiring layer calls this once the authenticated context has been drained
   * (discover → verify → vault write). The broker tears down afterwards.
   */
  completionContext(): Promise<CompletionContext> | undefined {
    return this.completion;
  }

  async sendInput(event: BrokerInput): Promise<void> {
    if (!this.cdp || this.state === 'closed') return;
    const now = Date.now();
    const wait = Math.max(0, INPUT_PACING_MS - (now - this.lastInputAt));
    if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
    this.lastInputAt = Date.now();
    try {
      for (const command of mapBrokerInput(event)) {
        await this.cdp.send(command.method as never, command.params as never);
      }
    } catch {
      // Input dispatch failures during provider navigation are transient; the
      // next interaction retries. One lost event must not kill the stream.
    }
  }

  async terminate(reason: string): Promise<void> {
    if (this.state === 'closed') return;
    this.state = 'closed';
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    if (this.poller) clearInterval(this.poller);
    this.poller = undefined;
    const teardown =
      this.disposeContext?.().catch(() => undefined) ?? Promise.resolve();
    for (const listener of this.closeListeners) {
      try {
        listener(reason);
      } catch {
        /* listeners must not crash teardown */
      }
    }
    await teardown;
    this.completionReject?.(
      new Error('Stream closed before sign-in completed')
    );
  }

  framesDelivered(): number {
    return this.frames;
  }
}

/**
 * One broker per connector account at a time. The WebSocket route and the
 * connector service both go through this registry.
 */
export class StreamBrokerHub {
  private brokers = new Map<string, SignInBroker>();

  register(connectorId: string, broker: SignInBroker): void {
    if (this.brokers.has(connectorId))
      throw Error('A sign-in stream is already active for this connector');
    this.brokers.set(connectorId, broker);
    broker.onClosed(() => {
      this.brokers.delete(connectorId);
    });
  }
  get(connectorId: string): SignInBroker | undefined {
    return this.brokers.get(connectorId);
  }
  remove(connectorId: string): void {
    const broker = this.brokers.get(connectorId);
    if (broker) void broker.terminate('hub-removed');
  }
  size(): number {
    return this.brokers.size;
  }
}
