import { describe, expect, test } from 'bun:test';
import { useDom } from './testing.ts';

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
