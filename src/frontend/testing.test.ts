import { describe, expect, test } from 'bun:test';
import { useDom, useFetch, useToasts } from './testing.ts';

// Bun's own, kept before useDom() replaces them.
const bun = { fetch, Response, URL, setTimeout, EventTarget };

describe('useDom', () => {
  useDom();

  test('installs a document, custom elements and a location', () => {
    expect(typeof document).toBe('object');
    expect(typeof HTMLElement).toBe('function');
    expect(typeof customElements).toBe('object');
    expect(location.href).toBe('http://localhost/');
  });

  test('answers a stylesheet with an empty 200', async () => {
    const response = await fetch('/ui/shared.css');
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('');
  });

  test('rejects any other request, naming it', async () => {
    const error = await fetch('/api/workouts').then(
      () => null,
      (cause: unknown) => cause,
    );
    expect(String(error)).toContain('GET /api/workouts');
  });

  test('leaves something in the body for the next test', () => {
    document.body.append(document.createElement('p'));
    expect(document.body.childElementCount).toBe(1);
  });

  test('finds the body empty again', () => {
    expect(document.body.childElementCount).toBe(0);
  });
});

describe('useFetch', () => {
  const fake = useFetch();

  test('answers a request named by respondTo with its own answer', async () => {
    fake.respondWith(200, '"fallback"');
    fake.respondTo('GET /api/exercises', 200, '"exercises"');
    expect(await (await fetch('/api/exercises')).json()).toBe('exercises');
    expect(await (await fetch('/api/exercises', { method: 'POST' })).json()).toBe('fallback');
    expect(await (await fetch('/api/workouts')).json()).toBe('fallback');
  });

  test('forgets respondTo answers between tests', async () => {
    expect(await (await fetch('/api/exercises')).json()).toEqual({});
  });
});

describe('useToasts', () => {
  useDom();
  const toasts = useToasts();

  test('records the messages toast() and toastError() show', async () => {
    const { toast, toastError } = await import('./ui/toast.ts');
    toast('Saved', 'success');
    toastError(new Error('Broke'));
    expect(toasts).toEqual(['Saved', 'Broke']);
  });

  test('starts every test with an empty record', () => {
    expect(toasts).toEqual([]);
  });
});

describe('after useDom', () => {
  test('puts back Bun’s own globals', () => {
    expect(fetch).toBe(bun.fetch);
    expect(Response).toBe(bun.Response);
    expect(URL).toBe(bun.URL);
    expect(setTimeout).toBe(bun.setTimeout);
    expect(EventTarget).toBe(bun.EventTarget);
    expect(typeof document).toBe('undefined');
  });
});
