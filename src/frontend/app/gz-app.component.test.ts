import { beforeAll, beforeEach, expect, test } from 'bun:test';
import { useDom } from '../testing.ts';
import { navigate } from './router.ts';

// Only paths no route matches: a matched route would load a real feature view, which fetches the API.
useDom();

beforeAll(async () => {
  await import('./gz-app.component.ts');
  if (!customElements.get('gz-test-link')) {
    /** A link inside a shadow root, as every link in the app is; its attributes go to the anchor. */
    class GzTestLink extends HTMLElement {
      readonly #anchor = document.createElement('a');

      constructor() {
        super();
        this.attachShadow({ mode: 'open' }).append(this.#anchor);
      }

      connectedCallback(): void {
        for (const name of ['href', 'target', 'download']) {
          const value = this.getAttribute(name);
          if (value !== null) {
            this.#anchor.setAttribute(name, value);
          }
        }
      }
    }
    customElements.define('gz-test-link', GzTestLink);
  }
});

beforeEach(() => {
  history.replaceState(null, '', '/nowhere');
});

/** Long enough for gz-app to swap in a view that is not a GzElement: it awaits nothing else. */
async function settle(): Promise<void> {
  await Bun.sleep(0);
}

async function mountApp(): Promise<HTMLElement> {
  const app = document.createElement('gz-app');
  document.body.append(app);
  await settle();
  return app;
}

function notFound(app: HTMLElement): string | undefined {
  return app.shadowRoot?.querySelector('main > p.empty')?.textContent;
}

function link(app: HTMLElement, attributes: Record<string, string>): HTMLAnchorElement {
  const host = document.createElement('gz-test-link');
  for (const [name, value] of Object.entries(attributes)) {
    host.setAttribute(name, value);
  }
  app.shadowRoot?.querySelector('main')?.append(host);
  const anchor = host.shadowRoot?.querySelector('a');
  if (!anchor) {
    throw new Error('gz-test-link rendered no anchor');
  }
  return anchor;
}

/** @returns whether the click's default was prevented, i.e. whether gz-app routed it. */
function click(anchor: HTMLAnchorElement, init: MouseEventInit = {}): boolean {
  const event = new MouseEvent('click', { bubbles: true, composed: true, cancelable: true, ...init });
  anchor.dispatchEvent(event);
  return event.defaultPrevented;
}

test('renders the header and the view for the current path', async () => {
  const app = await mountApp();
  expect(notFound(app)).toBe('Nothing lives at /nowhere.');
  expect(app.shadowRoot?.querySelector('gz-header')?.shadowRoot?.querySelector('nav')).not.toBeNull();
});

test('routes a plain click on a link inside a shadow root, keeping the header', async () => {
  const app = await mountApp();
  const header = app.shadowRoot?.querySelector('gz-header');
  expect(click(link(app, { href: '/elsewhere' }))).toBe(true);
  await settle();
  expect(location.pathname).toBe('/elsewhere');
  expect(notFound(app)).toBe('Nothing lives at /elsewhere.');
  expect(app.shadowRoot?.querySelector('gz-header')).toBe(header ?? null);
});

test.each<[string, Record<string, string>, MouseEventInit]>([
  ['a Ctrl click', { href: '/elsewhere' }, { ctrlKey: true }],
  ['a Meta click', { href: '/elsewhere' }, { metaKey: true }],
  ['a Shift click', { href: '/elsewhere' }, { shiftKey: true }],
  ['an Alt click', { href: '/elsewhere' }, { altKey: true }],
  ['a middle-button click', { href: '/elsewhere' }, { button: 1 }],
  ['a link with a target', { href: '/elsewhere', target: '_blank' }, {}],
  ['a download link', { href: '/elsewhere', download: '' }, {}],
  ['a link to the API', { href: '/api/workouts' }, {}],
  ['a link with a query', { href: '/elsewhere?x=1' }, {}],
  ['a link to a file', { href: '/file.txt' }, {}],
])('leaves %s to the browser', async (_name, attributes, init) => {
  const app = await mountApp();
  expect(click(link(app, attributes), init)).toBe(false);
  await settle();
  expect(location.pathname).toBe('/nowhere');
  expect(notFound(app)).toBe('Nothing lives at /nowhere.');
});

test('re-renders on navigate()', async () => {
  const app = await mountApp();
  navigate('/somewhere');
  await settle();
  expect(notFound(app)).toBe('Nothing lives at /somewhere.');
});

test('re-renders on popstate, as the browser fires on Back', async () => {
  const app = await mountApp();
  history.replaceState(null, '', '/back-here');
  window.dispatchEvent(new PopStateEvent('popstate'));
  await settle();
  expect(notFound(app)).toBe('Nothing lives at /back-here.');
});

test('stops listening once removed, and renders the current path when mounted again', async () => {
  await mountApp();
  document.body.replaceChildren();
  history.replaceState(null, '', '/later');
  expect(() => window.dispatchEvent(new PopStateEvent('popstate'))).not.toThrow();
  await settle();
  expect(notFound(await mountApp())).toBe('Nothing lives at /later.');
});
