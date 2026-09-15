import { afterEach, beforeEach } from 'bun:test';

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
  /** Makes every following request reject, as fetch does when the server is unreachable. */
  failWith: (cause: Error) => void;
}

/** Stubs `fetch` for the current test file, recording each request and answering it. */
export function useFetch(): FakeFetch {
  const stub = useGlobals();
  const requests: RecordedRequest[] = [];
  const ok = (): Promise<Response> => Promise.resolve(new Response('{}'));
  let answer = ok;

  beforeEach(() => {
    requests.length = 0;
    answer = ok;
    stub('fetch', (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const body: unknown = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
      requests.push({ method: init?.method ?? 'GET', url, headers: new Headers(init?.headers).toJSON(), body });
      return answer();
    });
  });

  return {
    requests,
    respondWith: (status, body = ''): void => {
      answer = (): Promise<Response> => Promise.resolve(new Response(body === '' ? null : body, { status }));
    },
    failWith: (cause): void => {
      answer = (): Promise<Response> => Promise.reject(cause);
    },
  };
}
