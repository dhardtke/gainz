import { beforeAll, beforeEach, expect, test } from 'bun:test';
import { find, mount, settle, shadow, testId, useDom, useFetch } from '../testing.ts';
import type { ExercisePageDto } from '../../shared/dto/exercise.ts';
import type { WorkoutWithExercisesDto } from '../../shared/dto/workout.ts';
import type { GzView } from '../ui/view.ts';
import { navigate } from './router.ts';
import { APP_TITLE } from './tab-title.ts';

useDom();
const fake = useFetch();

beforeAll(async () => {
  await import('./gz-app.component.ts');
  if (!customElements.get('gz-test-link')) {
    class GzTestLink extends HTMLElement {
      readonly #anchor = document.createElement('a');

      constructor() {
        super();
        this.#anchor.dataset.testid = 'link';
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
  // happy-dom keeps the <title> a test wrote in <head>, which useDom() does not clear.
  document.title = APP_TITLE;
});

const WORKOUT: WorkoutWithExercisesDto = {
  id: 3,
  performedOn: '2026-09-20',
  title: 'Push day',
  notes: null,
  createdAt: '2026-09-20T10:00:00Z',
  done: false,
  exercises: [],
};

const EXERCISES: ExercisePageDto = { items: [], total: 0, all: 0, limit: null, offset: 0 };

async function mountApp(): Promise<HTMLElement> {
  const app = mount('gz-app');
  await settle(0);
  return app;
}

function notFound(app: HTMLElement): string | undefined {
  return app.querySelector(`:scope > ${testId('not-found')}`)?.textContent;
}

function link(app: HTMLElement, attributes: Record<string, string>): HTMLAnchorElement {
  const host = document.createElement('gz-test-link');
  for (const [name, value] of Object.entries(attributes)) {
    host.setAttribute(name, value);
  }
  app.append(host);
  return find<HTMLAnchorElement>(shadow(host), testId('link'));
}

function click(anchor: HTMLAnchorElement, init: MouseEventInit = {}): boolean {
  const event = new MouseEvent('click', { bubbles: true, composed: true, cancelable: true, ...init });
  anchor.dispatchEvent(event);
  return event.defaultPrevented;
}

test('renders the header, and the view for the current path in its light DOM', async () => {
  const app = await mountApp();
  expect(notFound(app)).toBe('Nothing lives at /nowhere.');
  expect(app.shadowRoot?.querySelector(testId('view-slot'))).not.toBeNull();
  expect(app.shadowRoot?.querySelector(testId('header'))?.shadowRoot?.querySelector(testId('nav'))).not.toBeNull();
});

test('routes a plain click on a link inside a shadow root, keeping the header', async () => {
  const app = await mountApp();
  const header = app.shadowRoot?.querySelector(testId('header'));
  expect(click(link(app, { href: '/elsewhere' }))).toBe(true);
  await settle(0);
  expect(location.pathname).toBe('/elsewhere');
  expect(notFound(app)).toBe('Nothing lives at /elsewhere.');
  expect(app.shadowRoot?.querySelector(testId('header'))).toBe(header ?? null);
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
  // The login module and auth status must land before the DOM is torn down.
  for (let i = 0; i < 50 && !app.querySelector(':scope > gz-login'); i++) {
    await settle();
  }
  const login = app.querySelector(':scope > gz-login');
  expect(login?.hasAttribute('hidden')).toBe(false);
  expect(login?.querySelector(testId('password'))).not.toBeNull();
});

test('ignores a 401 on the login page itself', async () => {
  const app = await mountApp();
  history.replaceState(null, '', '/login?next=%2Fx');
  window.dispatchEvent(new Event('gz:unauthorized'));
  await settle(0);
  expect(notFound(app)).toBe('Nothing lives at /nowhere.');
  expect(location.pathname + location.search).toBe('/login?next=%2Fx');
});

async function shown(app: HTMLElement, tag: string): Promise<HTMLElement | null> {
  for (let i = 0; i < 50 && !app.querySelector(`:scope > ${tag}:not([hidden])`); i++) {
    await settle();
  }
  return app.querySelector<HTMLElement>(`:scope > ${tag}:not([hidden])`);
}

function breadcrumbs(app: HTMLElement): HTMLElement {
  return find<HTMLElement>(shadow(app), testId('breadcrumbs'));
}

function trail(app: HTMLElement): string[] | null {
  const element = breadcrumbs(app);
  if (element.hasAttribute('hidden')) {
    return null;
  }
  const root = shadow(element);
  const crumbs = Array.from(root.querySelectorAll(testId('crumb'))).map((crumb) => `${crumb.textContent} → ${crumb.getAttribute('href')}`);
  return [...crumbs, root.querySelector(testId('current'))?.textContent ?? ''];
}

async function openWorkout(status = 200, body = JSON.stringify(WORKOUT)): Promise<HTMLElement> {
  fake.respondTo('GET /api/workouts/3', status, body);
  fake.respondTo('GET /api/exercises', 200, JSON.stringify(EXERCISES));
  history.replaceState(null, '', '/workouts/3');
  const app = await mountApp();
  await shown(app, 'gz-workout-detail');
  return app;
}

test('names a path no route matches "Not found" in the tab, with no breadcrumb', async () => {
  const app = await mountApp();
  expect(document.title).toBe('Not found · gainz');
  expect(trail(app)).toBeNull();
});

test('names the login page in the tab, with no breadcrumb', async () => {
  const app = await mountApp();
  navigate('/login');
  expect(await shown(app, 'gz-login')).not.toBeNull();
  expect(document.title).toBe('Log in · gainz');
  expect(trail(app)).toBeNull();
});

test('shows a workout below its list in the breadcrumb, and its title in the tab', async () => {
  const app = await openWorkout();
  expect(trail(app)).toEqual(['Workouts → /workouts', 'Push day']);
  expect(document.title).toBe('Push day · gainz');
});

test("falls back to the route's title for a workout that cannot be loaded", async () => {
  const app = await openWorkout(404, JSON.stringify({ error: 'Workout not found' }));
  expect(trail(app)).toEqual(['Workouts → /workouts', 'Workout']);
  expect(document.title).toBe('Workout · gainz');
});

test('follows a rename of the shown workout without a navigation', async () => {
  const app = await openWorkout();
  const view = app.querySelector<GzView<unknown>>(':scope > gz-workout-detail');
  fake.respondTo('GET /api/workouts/3', 200, JSON.stringify({ ...WORKOUT, title: 'Leg day' }));
  await view?.reload();
  expect(trail(app)).toEqual(['Workouts → /workouts', 'Leg day']);
  expect(document.title).toBe('Leg day · gainz');
});
