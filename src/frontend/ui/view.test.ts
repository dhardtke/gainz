import { beforeAll, expect, test } from 'bun:test';
import { useDom, useToasts } from '../testing.ts';
import { ApiError } from '../http/errors.ts';
import type { RawHtml } from './html.ts';
import type { GzView } from './view.ts';

useDom();
const toasts = useToasts();

/** What the test view's next `load()` returns; a test settles it. */
let pending: PromiseWithResolvers<string>;

type TestView = GzView<string>;

beforeAll(async () => {
  const { GzView } = await import('./view.ts');
  const { html } = await import('./html.ts');
  if (!customElements.get('gz-test-view')) {
    /** Shows whatever string its load resolves with. */
    class GzTestView extends GzView<string> {
      override loadingText = 'Loading test…';

      override load(): Promise<string> {
        return pending.promise;
      }

      override readyTemplate(data: string): RawHtml {
        return html`<p class="data">${data}</p>`;
      }
    }
    customElements.define('gz-test-view', GzTestView);
  }
});

/** Mounts the test view with a fresh load pending, its attributes set before it is appended. */
function mount(attributes: Record<string, string> = {}): TestView {
  pending = Promise.withResolvers<string>();
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- registered in beforeAll as GzTestView
  const view = document.createElement('gz-test-view') as TestView;
  for (const [name, value] of Object.entries(attributes)) {
    view.setAttribute(name, value);
  }
  document.body.append(view);
  return view;
}

function text(view: TestView, selector: string): string | undefined {
  return view.shadowRoot?.querySelector(selector)?.textContent;
}

test('renders its loading text while loading', () => {
  const view = mount();
  expect(text(view, 'p[aria-busy="true"]')).toBe('Loading test…');
  expect(view.data).toBeUndefined();
});

test('renders the ready template and exposes the data once loaded', async () => {
  const view = mount();
  pending.resolve('Bench');
  await view.ready;
  expect(text(view, '.data')).toBe('Bench');
  expect(view.data).toBe('Bench');
});

test('renders the error template and toasts the message when the load fails', async () => {
  const view = mount();
  pending.reject(new ApiError('Server down', 500, undefined));
  await view.ready;
  expect(text(view, '.error-text')).toBe('Server down');
  expect(view.data).toBeUndefined();
  expect(toasts).toEqual(['Server down']);
});

test('shows a 404 without toasting it', async () => {
  const view = mount();
  pending.reject(new ApiError('Workout not found', 404, undefined));
  await view.ready;
  expect(text(view, '.error-text')).toBe('Workout not found');
  expect(toasts).toEqual([]);
});

test('offers its back link below an error', async () => {
  const view = mount();
  view.backLink = { href: '/workouts', label: 'Back to all workouts' };
  pending.reject(new ApiError('Workout not found', 404, undefined));
  await view.ready;
  expect(text(view, '.error-text')).toBe('Workout not found');
  expect(text(view, "a[href='/workouts']")).toBe('Back to all workouts');
});

test('settles ready after an error', async () => {
  const view = mount();
  pending.reject(new Error('Broke'));
  // Awaiting it is the assertion: a rejection would fail the test.
  await view.ready;
  expect(text(view, '.error-text')).toBe('Broke');
});

test('reload() re-renders with new data', async () => {
  const view = mount();
  pending.resolve('Bench');
  await view.ready;
  pending = Promise.withResolvers<string>();
  const reloaded = view.reload();
  expect(text(view, '.data')).toBe('Bench');
  pending.resolve('Squat');
  await reloaded;
  expect(text(view, '.data')).toBe('Squat');
});

test('numericAttribute() reads a numeric attribute', () => {
  expect(mount({ 'workout-id': '42' }).numericAttribute('workout-id')).toBe(42);
});

test('numericAttribute() throws naming the tag and attribute when it is missing', () => {
  expect(() => mount().numericAttribute('workout-id')).toThrow('gz-test-view needs a workout-id attribute');
});
