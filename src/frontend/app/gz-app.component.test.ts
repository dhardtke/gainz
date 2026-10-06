import { beforeAll, beforeEach, expect, test } from 'bun:test';
import { find, mount, settle, shadow, useDom, useFetch } from '../testing.ts';
import { navigate } from './router.ts';

// Only paths no route matches, but for /login: a matched route would load a real feature view, which
// fetches the API, and the login view fetches only the auth status, which this file answers.
useDom();
const fake = useFetch();

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
  fake.respondTo('GET /api/auth/status', 200, '{"enabled":true}');
});

async function mountApp(): Promise<HTMLElement> {
  const app = mount('gz-app');
  // Long enough for gz-app to swap in a view that is not a GzView: it awaits nothing else.
  await settle(0);
  return app;
}

function notFound(app: HTMLElement): string | undefined {
  return app.querySelector(':scope > p.empty')?.textContent;
}

function link(app: HTMLElement, attributes: Record<string, string>): HTMLAnchorElement {
  const host = document.createElement('gz-test-link');
  for (const [name, value] of Object.entries(attributes)) {
    host.setAttribute(name, value);
  }
  app.append(host);
  return find<HTMLAnchorElement>(shadow(host), 'a');
}

/** @returns whether the click's default was prevented, i.e. whether gz-app routed it. */
function click(anchor: HTMLAnchorElement, init: MouseEventInit = {}): boolean {
  const event = new MouseEvent('click', { bubbles: true, composed: true, cancelable: true, ...init });
  anchor.dispatchEvent(event);
  return event.defaultPrevented;
}

test('renders the header, and the view for the current path in its light DOM', async () => {
  const app = await mountApp();
  expect(notFound(app)).toBe('Nothing lives at /nowhere.');
  expect(app.shadowRoot?.querySelector('main > slot')).not.toBeNull();
  expect(app.shadowRoot?.querySelector('gz-header')?.shadowRoot?.querySelector('nav')).not.toBeNull();
});

test('routes a plain click on a link inside a shadow root, keeping the header', async () => {
  const app = await mountApp();
  const header = app.shadowRoot?.querySelector('gz-header');
  expect(click(link(app, { href: '/elsewhere' }))).toBe(true);
  await settle(0);
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
  await settle(0);
  expect(location.pathname).toBe('/nowhere');
  expect(notFound(app)).toBe('Nothing lives at /nowhere.');
});

test('re-renders on navigate()', async () => {
  const app = await mountApp();
  navigate('/somewhere');
  await settle(0);
  expect(notFound(app)).toBe('Nothing lives at /somewhere.');
});

test('re-renders on popstate, as the browser fires on Back', async () => {
  const app = await mountApp();
  history.replaceState(null, '', '/back-here');
  window.dispatchEvent(new PopStateEvent('popstate'));
  await settle(0);
  expect(notFound(app)).toBe('Nothing lives at /back-here.');
});

test('stops listening once removed, and renders the current path when mounted again', async () => {
  await mountApp();
  document.body.replaceChildren();
  history.replaceState(null, '', '/later');
  expect(() => window.dispatchEvent(new PopStateEvent('popstate'))).not.toThrow();
  await settle(0);
  expect(notFound(await mountApp())).toBe('Nothing lives at /later.');
});

test('sends a 401 to the login page, remembering where it came from', async () => {
  const app = await mountApp();
  history.replaceState(null, '', '/workouts?page=2');
  window.dispatchEvent(new Event('gz:unauthorized'));
  expect(location.pathname + location.search).toBe('/login?next=%2Fworkouts%3Fpage%3D2');
  // The one matched route this file opens: its module and the auth status must land
  // before the file's DOM is torn down.
  for (let i = 0; i < 50 && !app.querySelector(':scope > gz-login'); i++) {
    await settle();
  }
  // Shown at once, form and all: a password manager judges the field when it is added.
  const login = app.querySelector(':scope > gz-login');
  expect(login?.hasAttribute('hidden')).toBe(false);
  expect(login?.querySelector('form input[type="password"]')).not.toBeNull();
});

test('ignores a 401 on the login page itself', async () => {
  const app = await mountApp();
  // On the login path, but with no popstate: the shell still shows its not-found line, and must not
  // load the login view, since nothing should navigate.
  history.replaceState(null, '', '/login?next=%2Fx');
  window.dispatchEvent(new Event('gz:unauthorized'));
  await settle(0);
  expect(notFound(app)).toBe('Nothing lives at /nowhere.');
  expect(location.pathname + location.search).toBe('/login?next=%2Fx');
});
