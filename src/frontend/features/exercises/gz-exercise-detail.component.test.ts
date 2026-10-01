import { beforeAll, expect, test } from 'bun:test';
import { useDom, useFetch, useToasts } from '../../testing.ts';
import type { ExerciseProgressDto, SessionPointDto } from '../../../shared/dto/exercise.ts';

useDom();
const fake = useFetch();
const toasts = useToasts();

beforeAll(async () => {
  await import('./gz-exercise-detail.component.ts');
});

const PROGRESS = 'GET /api/exercises/7/progress';

function session(workoutId: number, performedOn: string, estOneRepMax: number): SessionPointDto {
  return { workoutId, performedOn, setCount: 3, totalReps: 15, totalVolume: 1200 + workoutId, topWeight: 80, estOneRepMax };
}

function progress(sessions: SessionPointDto[]): ExerciseProgressDto {
  return {
    exercise: { id: 7, name: 'Bench Press', muscleGroup: 'Chest', notes: null, createdAt: '2026-08-01T10:00:00Z' },
    sessions,
    bestSet: null,
  };
}

/** Oldest first, as the API sends them: up from the first to the second, down to the third. */
const SESSIONS = [session(1, '2026-09-01', 90), session(2, '2026-09-08', 95), session(3, '2026-09-15', 92.5)];

/** Long enough for the view's requests, all answered at once by the fake, to land and render. */
async function settle(): Promise<void> {
  await Bun.sleep(10);
}

async function mount(answer: ExerciseProgressDto = progress(SESSIONS)): Promise<HTMLElement> {
  fake.respondTo(PROGRESS, 200, JSON.stringify(answer));
  const view = document.createElement('gz-exercise-detail');
  view.setAttribute('exercise-id', '7');
  document.body.append(view);
  await settle();
  return view;
}

function root(view: HTMLElement): ShadowRoot {
  if (!view.shadowRoot) {
    throw new Error('gz-exercise-detail has no shadow root');
  }
  return view.shadowRoot;
}

/** The shadow root of the child the view renders under `tag`. */
function childRoot(view: HTMLElement, tag: string): ShadowRoot {
  const child = root(view).querySelector(tag)?.shadowRoot;
  if (!child) {
    throw new Error(`gz-exercise-detail renders no ${tag}`);
  }
  return child;
}

/** Where the chart card with its metric switch renders. */
function chartRoot(view: HTMLElement): ParentNode {
  return childRoot(view, 'gz-progress-chart');
}

/** Where the session history renders. */
function tableRoot(view: HTMLElement): ParentNode {
  return childRoot(view, 'gz-session-table');
}

function chartHeading(view: HTMLElement): string | undefined {
  return chartRoot(view).querySelector('.metric-switch')?.closest('article')?.querySelector('h2')?.textContent;
}

function metricButton(view: HTMLElement, metric: string): HTMLButtonElement {
  const button = chartRoot(view).querySelector<HTMLButtonElement>(`button[data-metric='${metric}']`);
  if (!button) {
    throw new Error(`no ${metric} button`);
  }
  return button;
}

function field(view: HTMLElement, name: string): HTMLInputElement {
  const input = root(view).querySelector<HTMLInputElement>(`[name='${name}']`);
  if (!input) {
    throw new Error(`no ${name} field`);
  }
  return input;
}

function type(input: HTMLInputElement, value: string): void {
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function submitDetails(view: HTMLElement): void {
  root(view)
    .querySelector("form[data-action='save-exercise']")
    ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
}

test('heads the page with the exercise name', async () => {
  const view = await mount();
  expect(root(view).querySelector('h1')?.textContent).toBe('Bench Press');
});

test('shows four summary tiles', async () => {
  const view = await mount();
  expect(root(view).querySelectorAll('gz-tile')).toHaveLength(4);
});

test('charts the estimated 1RM first', async () => {
  const view = await mount();
  expect(chartHeading(view)).toBe('Estimated 1RM');
  expect(metricButton(view, 'estOneRepMax').getAttribute('aria-pressed')).toBe('true');
});

test('switches the charted metric', async () => {
  const view = await mount();
  metricButton(view, 'totalVolume').click();
  expect(chartHeading(view)).toBe('Volume');
  expect(metricButton(view, 'totalVolume').getAttribute('aria-pressed')).toBe('true');
  expect(metricButton(view, 'estOneRepMax').getAttribute('aria-pressed')).not.toBe('true');
});

test('keeps unsaved text in the details form across a metric switch', async () => {
  const view = await mount();
  type(field(view, 'name'), 'Paused Bench');
  metricButton(view, 'totalVolume').click();
  expect(field(view, 'name').value).toBe('Paused Bench');
});

test('keeps the chosen metric after saving the details', async () => {
  const view = await mount();
  metricButton(view, 'totalVolume').click();
  submitDetails(view);
  await settle();
  expect(toasts).toContain('Exercise updated');
  expect(chartHeading(view)).toBe('Volume');
  expect(metricButton(view, 'totalVolume').getAttribute('aria-pressed')).toBe('true');
});

test('saves the details trimmed', async () => {
  const view = await mount();
  type(field(view, 'name'), '  Paused Bench ');
  type(field(view, 'muscleGroup'), ' Chest  ');
  submitDetails(view);
  await settle();
  const patch = fake.requests.find((request) => request.method === 'PATCH');
  expect(patch?.url).toBe('/api/exercises/7');
  expect(patch?.body).toEqual({ name: 'Paused Bench', muscleGroup: 'Chest', notes: '' });
});

test('lists the sessions newest first, each linking to its workout, with the 1RM change', async () => {
  const view = await mount();
  const rows = Array.from(tableRoot(view).querySelectorAll('tbody tr'));
  expect(rows.map((row) => row.querySelector('a')?.getAttribute('href'))).toEqual(['/workouts/3', '/workouts/2', '/workouts/1']);
  expect(rows.map((row) => row.querySelector('span.up, span.down')?.className ?? null)).toEqual(['down', 'up', null]);
});

test('says so when no set has been logged', async () => {
  const view = await mount(progress([]));
  expect(tableRoot(view).querySelector('.empty')?.textContent).toBe('No sets logged for this exercise yet.');
  expect(tableRoot(view).querySelector('table')).toBeNull();
});

test('shows a missing exercise with a way back, without a toast', async () => {
  fake.respondTo(PROGRESS, 404, JSON.stringify({ error: 'Exercise not found' }));
  const view = document.createElement('gz-exercise-detail');
  view.setAttribute('exercise-id', '7');
  document.body.append(view);
  await settle();
  expect(root(view).querySelector('.error-text')?.textContent).toBe('Exercise not found');
  expect(root(view).querySelector("a[href='/exercises']")?.textContent).toBe('Back to all exercises');
  expect(toasts).toEqual([]);
});
