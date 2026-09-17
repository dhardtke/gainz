/**
 * Development only: the hot-reload client. The server injects this module into the index page when
 * started with `GAINZ_DEV=1` and pushes one message per saved file under `src/frontend/`.
 */
import { toastError } from '../ui/gz-toast.component.ts';
import { reloadSheet } from '../ui/styles.ts';

/** Declared here rather than imported: the frontend keeps its own types, and this is no DTO. */
type Change = { swap: string } | { reload: string };

const WS_URL = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/dev/ws`;

/** A backend edit restarts the server under `bun --watch`, so a dropped socket is expected. */
const BACKOFF_MS = [250, 500, 1000, 2000];

function isChange(value: unknown): value is Change {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const swap: unknown = Reflect.get(value, 'swap');
  const reload: unknown = Reflect.get(value, 'reload');
  return typeof swap === 'string' || typeof reload === 'string';
}

/**
 * A stylesheet swaps in place and keeps the page's state; anything else reloads, since a component
 * module cannot be evaluated twice — `customElements.define` refuses a tag it already knows.
 */
async function apply(change: Change): Promise<void> {
  if ('swap' in change) {
    await swapCss(change.swap);
    return;
  }
  // The transpiler answers 500 for a file that will not parse; reloading into that would blank the
  // page and lose its state on every typo, so say so and wait for the next save instead.
  const probe = await fetch(change.reload, { method: 'HEAD', cache: 'no-store' });
  if (!probe.ok) {
    toastError(new Error(`Could not transpile ${change.reload}`));
    return;
  }
  console.log(`gainz: reloading for ${change.reload}`);
  location.reload();
}

/** Covers both ways a stylesheet reaches the page: adopted through styles.ts, and a document `<link>`. */
async function swapCss(url: string): Promise<void> {
  const swapped = await reloadSheet(url);
  const links = [...document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')].filter((link) => new URL(link.href).pathname === url);
  links.forEach(swapLink);
  if (!swapped && links.length === 0) {
    // A stylesheet the page has never fetched: nothing to swap, so start over.
    console.log(`gainz: reloading for ${url}`);
    location.reload();
    return;
  }
  console.log(`gainz: swapped ${url}`);
}

/**
 * Reassigning a `<link>`'s own href does not refetch it, so a fresh one is inserted with a query the
 * static route ignores, and the old one is removed only once the new one has loaded — no unstyled
 * frame in between.
 */
function swapLink(link: HTMLLinkElement): void {
  const fresh = document.createElement('link');
  fresh.rel = 'stylesheet';
  fresh.href = `${new URL(link.href).pathname}?hot=${Date.now()}`;
  fresh.addEventListener('load', () => {
    link.remove();
  });
  link.after(fresh);
}

function connect(attempt: number): void {
  const socket = new WebSocket(WS_URL);
  let opened = false;

  socket.addEventListener('open', () => {
    opened = true;
    console.log('gainz: hot reload connected');
  });

  socket.addEventListener('message', (event) => {
    const data: unknown = typeof event.data === 'string' ? JSON.parse(event.data) : null;
    if (isChange(data)) {
      void apply(data);
    }
  });

  socket.addEventListener('close', () => {
    // A socket that was open starts the backoff over; one that never opened waits longer each time.
    const failures = opened ? 0 : attempt;
    const delay = BACKOFF_MS[Math.min(failures, BACKOFF_MS.length - 1)];
    setTimeout(() => {
      connect(failures + 1);
    }, delay);
  });
}

connect(0);
