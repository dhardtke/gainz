import { afterAll, afterEach, beforeAll, beforeEach } from 'bun:test';
// Type-only, so erased: happy-dom is still loaded lazily, by the files that call useDom().
import type { GlobalWindow } from 'happy-dom';

/**
 * Replaces browser globals for the current test file, restoring each after every
 * test. bun test runs every file in one process, so a stub left behind would
 * leak into the backend's tests.
 */
export function useGlobals(): (name: string, value: unknown) => void {
  const saved = new Map<string, PropertyDescriptor | undefined>();

  afterEach(() => {
    for (const [name, descriptor] of saved) {
      if (descriptor) {
        Object.defineProperty(globalThis, name, descriptor);
      } else {
        Reflect.deleteProperty(globalThis, name);
      }
    }
    saved.clear();
  });

  return (name, value) => {
    if (!saved.has(name)) {
      saved.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    }
    Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
  };
}

export interface RecordedRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: unknown;
}

export interface FakeFetch {
  readonly requests: RecordedRequest[];
  /** Sets what every following request answers with; the default is `200 {}`. */
  respondWith: (status: number, body?: string) => void;
  /**
   * Sets what one request answers with, named as `'<METHOD> <url>'` — `'GET /api/exercises'` —
   * with the URL as `fetch` receives it. Any other request gets `respondWith`'s answer.
   */
  respondTo: (request: string, status: number, body?: string) => void;
  /** The bodies of the recorded requests named as in `respondTo`, `'POST /api/exercises'`, in order. */
  sent: (request: string) => unknown[];
  /** Makes every following request reject, as fetch does when the server is unreachable. */
  failWith: (cause: Error) => void;
}

/** Stubs `fetch` for the current test file, recording each request and answering it. */
export function useFetch(): FakeFetch {
  const stub = useGlobals();
  const requests: RecordedRequest[] = [];
  const ok = (): Promise<Response> => Promise.resolve(new Response('{}'));
  const answers = new Map<string, () => Promise<Response>>();
  let answer = ok;

  beforeEach(() => {
    requests.length = 0;
    answer = ok;
    answers.clear();
    stub('fetch', (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = urlOf(input);
      const method = init?.method ?? 'GET';
      const body: unknown = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
      requests.push({ method, url, headers: Object.fromEntries(new Headers(init?.headers)), body });
      return (answers.get(`${method} ${url}`) ?? answer)();
    });
  });

  const respond = (status: number, body: string): (() => Promise<Response>) => {
    return (): Promise<Response> => Promise.resolve(new Response(body === '' ? null : body, { status }));
  };

  return {
    requests,
    respondWith: (status, body = ''): void => {
      answer = respond(status, body);
    },
    respondTo: (request, status, body = ''): void => {
      answers.set(request, respond(status, body));
    },
    sent: (request): unknown[] => requests.filter(({ method, url }) => `${method} ${url}` === request).map(({ body }) => body),
    failWith: (cause): void => {
      answer = (): Promise<Response> => Promise.reject(cause);
    },
  };
}

/**
 * Stubs Oat's `window.ot.toast()` for the current test file and records each message shown,
 * emptying the record after every test. Call it after `useDom()`: Bun has no `window`, and under
 * `useDom()` it is happy-dom's window object rather than `globalThis`, so `useGlobals()` would
 * miss it.
 */
export function useToasts(): string[] {
  const messages: string[] = [];
  let saved: Window['ot'] | undefined;

  beforeEach(() => {
    saved = window.ot;
    window.ot = {
      toast: (message): HTMLElement => {
        messages.push(message);
        return document.createElement('output');
      },
    };
  });

  afterEach(() => {
    if (saved) {
      window.ot = saved;
    } else {
      Reflect.deleteProperty(window, 'ot');
    }
    messages.length = 0;
  });

  return messages;
}

/** The URL a `fetch` call asks for, whichever form it was given in. */
function urlOf(input: RequestInfo | URL): string {
  return typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
}

/** Not copied onto globalThis: they are the global object itself, or language values. */
const NOT_INSTALLED = new Set<PropertyKey>(['constructor', 'global', 'globalThis', 'undefined', 'NaN']);

/** Created once: component modules are cached across files and keep this window's classes. */
let shared: GlobalWindow | undefined;

/**
 * Installs a happy-dom window's globals for the current test file (or describe block)
 * and puts Bun's back afterwards. Import components with `await import()` after
 * this, never statically: a static import evaluates `class extends HTMLElement`
 * before any hook has run.
 *
 * Under it, `fetch` answers a `.css` URL with an empty `200`, so stylesheets load
 * silently, and rejects anything else, naming it; stub API calls with `useFetch()`.
 */
export function useDom(): void {
  const saved = new Map<PropertyKey, PropertyDescriptor | undefined>();

  beforeAll(async () => {
    const { GlobalWindow } = await import('happy-dom');
    shared ??= new GlobalWindow({
      url: 'http://localhost/',
      settings: { navigation: { disableMainFrameNavigation: true, disableFallbackToSetURL: true } },
    });
    const window = shared;
    const install = (key: PropertyKey, descriptor: PropertyDescriptor): void => {
      if (!saved.has(key)) {
        saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
      }
      Object.defineProperty(globalThis, key, { ...descriptor, configurable: true });
    };

    // The same walk as @happy-dom/global-registrator's register(), which is not used
    // because it creates a new window every time.
    for (const key of Reflect.ownKeys(window)) {
      const descriptor = Object.getOwnPropertyDescriptor(window, key);
      const current = Object.getOwnPropertyDescriptor(globalThis, key);
      if (NOT_INSTALLED.has(key) || !descriptor || (current?.value !== undefined && current.value === descriptor.value)) {
        continue;
      }
      install(key, descriptor);
    }

    install('fetch', {
      writable: true,
      value: (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const url = urlOf(input);
        if (new URL(url, location.href).pathname.endsWith('.css')) {
          return Promise.resolve(new Response('', { status: 200 }));
        }
        const method = init?.method ?? (input instanceof Request ? input.method : 'GET');
        return Promise.reject(new Error(`useDom: unexpected fetch ${method} ${url}; stub it with useFetch()`));
      },
    });
  });

  afterEach(() => {
    document.body.replaceChildren();
    localStorage.clear();
  });

  afterAll(() => {
    for (const [key, descriptor] of saved) {
      if (descriptor) {
        Object.defineProperty(globalThis, key, descriptor);
      } else {
        Reflect.deleteProperty(globalThis, key);
      }
    }
    saved.clear();
  });
}

/** The open shadow root of `host`, failing the test if it has none. */
export function shadow(host: Element): ShadowRoot {
  if (!host.shadowRoot) {
    throw new Error(`${host.localName} has no shadow root`);
  }
  return host.shadowRoot;
}

/** The first element under `root` matching `selector`, failing the test if none does. */
// Same once-used type parameter as ui/base.ts's $<T>, for the same reason.
// oxlint-disable-next-line typescript/no-unnecessary-type-parameters
export function find<T extends Element = Element>(root: ParentNode, selector: string): T {
  const found = root.querySelector<T>(selector);
  if (!found) {
    throw new Error(`nothing matches ${selector}`);
  }
  return found;
}

/** The text of the element matching `selector` in `host`'s shadow root, if there is one. */
export function text(host: Element, selector: string): string | undefined {
  return host.shadowRoot?.querySelector(selector)?.textContent;
}

/**
 * Creates `tag` with `attributes` set before it is appended to the body, so its first render
 * shows them: happy-dom skips attributeChangedCallback for attributes present at upgrade.
 */
// oxlint-disable-next-line typescript/no-unnecessary-type-parameters
export function mount<T extends HTMLElement = HTMLElement>(tag: string, attributes: Record<string, string> = {}): T {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the caller names the class it registered for `tag`
  const element = document.createElement(tag) as T;
  for (const [name, value] of Object.entries(attributes)) {
    element.setAttribute(name, value);
  }
  document.body.append(element);
  return element;
}

/** Types `value` into `input`, firing the `input` event a user's typing would. */
export function type(input: HTMLInputElement, value: string): void {
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

/** Picks `value` in `select`, firing the `change` event a user's choice would. */
export function choose(select: HTMLSelectElement, value: string): void {
  select.value = value;
  select.dispatchEvent(new Event('change', { bubbles: true }));
}

/** Submits `form` the way a user would, with a cancelable, bubbling `submit` event. */
export function submit(form: Element): void {
  form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
}

/** Long enough for a view's requests, all answered at once by useFetch(), to land and render. */
export async function settle(ms = 10): Promise<void> {
  await Bun.sleep(ms);
}

/** The details of each `event` CustomEvent heard on the body, outside every shadow root. */
export function collect(event: string): unknown[] {
  const details: unknown[] = [];
  document.body.addEventListener(event, (heard) => {
    if (heard instanceof CustomEvent) {
      details.push(heard.detail);
    }
  });
  return details;
}
