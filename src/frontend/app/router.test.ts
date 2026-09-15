import { beforeEach, describe, expect, test } from 'bun:test';
import { useGlobals } from '../testing.ts';
import { currentPath, isActive, matchRoute, navigate, onRouteChange } from './router.ts';
import type { RouteDef } from './router.ts';

const stub = useGlobals();

let hashChanges: number;

beforeEach(() => {
  hashChanges = 0;
  const events = new EventTarget();
  // A plain object: assigning its hash fires nothing, which is what the tests below rely on to
  // tell navigate()'s own hashchange apart from the browser's.
  stub('location', { hash: '' });
  stub('window', events);
  stub('HashChangeEvent', class extends Event {});
  events.addEventListener('hashchange', () => {
    hashChanges++;
  });
});

const view = (): Promise<Element> => Promise.reject(new Error('never rendered'));

describe('matchRoute', () => {
  const routes: RouteDef[] = [
    { pattern: /^\/a\/(\d+)\/b\/(\w+)$/, keys: ['id', 'slug'], view },
    { pattern: /^\/a\/.*$/, keys: [], view },
  ];

  test('names each capture group by its key, in order', () => {
    expect(matchRoute(routes, '/a/1/b/x')?.params).toEqual({ id: '1', slug: 'x' });
  });

  test('the first matching route wins', () => {
    expect(matchRoute(routes, '/a/1/b/x')?.route).toBe(routes[0]);
    expect(matchRoute(routes, '/a/else')?.route).toBe(routes[1]);
  });

  test('a key whose group did not participate is empty rather than undefined', () => {
    const optional: RouteDef[] = [{ pattern: /^\/c(?:\/(\d+))?$/, keys: ['id'], view }];

    expect(matchRoute(optional, '/c')?.params).toEqual({ id: '' });
  });
});

describe('currentPath', () => {
  test('is the hash without its #', () => {
    location.hash = '#/workouts/3';

    expect(currentPath()).toBe('/workouts/3');
  });

  test.each(['', '#'])('is / for the hash %p', (hash) => {
    location.hash = hash;

    expect(currentPath()).toBe('/');
  });
});

describe('isActive', () => {
  test('/ is active only on the dashboard itself, not under every route', () => {
    location.hash = '#/';
    expect(isActive('/')).toBe(true);

    location.hash = '#/workouts';
    expect(isActive('/')).toBe(false);
  });

  test('a section stays active on its detail pages', () => {
    location.hash = '#/workouts/3';

    expect(isActive('/workouts')).toBe(true);
    expect(isActive('/exercises')).toBe(false);
  });
});

describe('navigate', () => {
  test('to another route sets the hash and leaves the browser to fire hashchange', () => {
    location.hash = '#/';

    navigate('/workouts');

    expect(location.hash).toBe('#/workouts');
    expect(hashChanges).toBe(0);
  });

  test('to the current route fires hashchange itself, so the view refreshes', () => {
    location.hash = '#/workouts';

    navigate('/workouts');

    expect(hashChanges).toBe(1);
  });

  test('onRouteChange returns a function that stops listening', () => {
    let heard = 0;
    const stop = onRouteChange(() => {
      heard++;
    });
    location.hash = '#/workouts';

    navigate('/workouts');
    stop();
    navigate('/workouts');

    expect(heard).toBe(1);
  });
});
