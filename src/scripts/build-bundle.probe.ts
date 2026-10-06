/**
 * Runs the built frontend bundle, at the path given as its argument, in a fresh happy-dom window and
 * prints what it did as JSON on stdout. `build-bundle.test.ts` starts it as a child process, because
 * every test file in a process shares `useDom()`'s one window: a component another file has already
 * defined would make `define()` return early, and the checks would depend on file order.
 *
 * Its `fetch` records every URL and answers a stylesheet with an empty 200, so a component sheet with
 * rules can only have come from the bundle, and the API with an empty 200 JSON object.
 */
import { pathToFileURL } from 'node:url';
import { GlobalWindow } from 'happy-dom';

export interface ProbeState {
  defined: string[];
  requested: string[];
  /** The rules in the last sheet a `gz-app`'s shadow root adopts: its own. */
  appRules: number;
}

export interface ProbeReport {
  beforeMount: ProbeState;
  afterMount: ProbeState;
}

/** The tags the probe asks `customElements` about. */
const TAGS = ['gz-app', 'gz-header', 'gz-theme-toggle', 'gz-breadcrumbs', 'gz-dashboard'];

/** Not copied onto globalThis: they are the global object itself, or language values. */
const NOT_INSTALLED = new Set<PropertyKey>(['constructor', 'global', 'globalThis', 'undefined', 'NaN']);

const bundle = process.argv[2];
if (bundle === undefined) {
  throw new Error('usage: bun build-bundle.probe.ts <bundle path>');
}

const window = new GlobalWindow({
  url: 'http://localhost/',
  settings: { navigation: { disableMainFrameNavigation: true, disableFallbackToSetURL: true } },
});
// The same walk as useDom() in src/frontend/testing.ts.
for (const key of Reflect.ownKeys(window)) {
  const descriptor = Object.getOwnPropertyDescriptor(window, key);
  const current = Object.getOwnPropertyDescriptor(globalThis, key);
  if (NOT_INSTALLED.has(key) || !descriptor || (current?.value !== undefined && current.value === descriptor.value)) {
    continue;
  }
  Object.defineProperty(globalThis, key, { ...descriptor, configurable: true });
}

const requested: string[] = [];
Object.defineProperty(globalThis, 'fetch', {
  configurable: true,
  writable: true,
  value: (input: RequestInfo | URL): Promise<Response> => {
    const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const path = new URL(raw, location.href).pathname;
    requested.push(path);
    if (path.endsWith('.css')) {
      return Promise.resolve(new Response('', { status: 200 }));
    }
    if (path.startsWith('/api/')) {
      return Promise.resolve(new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }));
    }
    return Promise.reject(new Error(`build-bundle.probe: unexpected fetch ${raw}`));
  },
});

function state(): ProbeState {
  const sheets = document.createElement('gz-app').shadowRoot?.adoptedStyleSheets ?? [];
  return {
    defined: TAGS.filter((tag) => customElements.get(tag) !== undefined),
    requested: [...requested],
    appRules: sheets.at(-1)?.cssRules.length ?? 0,
  };
}

await import(pathToFileURL(bundle).href);
const beforeMount = state();

document.body.append(document.createElement('gz-app'));
await Promise.race([customElements.whenDefined('gz-dashboard'), Bun.sleep(5_000)]);
const afterMount = state();

const report: ProbeReport = { beforeMount, afterMount };
// Not console.log: the walk above installed happy-dom's console, which writes to its virtual console.
process.stdout.write(`${JSON.stringify(report)}\n`);
// happy-dom keeps timers alive; the report is all the test needs.
process.exit(0);
