import { describe, expect, test } from 'bun:test';
import { matchRoute } from './router.ts';
import { ROUTES } from './routes.ts';

// Never calls a route's view: it imports a module extending HTMLElement, which bun test lacks.
describe('routes', () => {
  test('/ and the empty path both resolve to the dashboard, without params', () => {
    const root = matchRoute(ROUTES, '/');
    expect(root).not.toBeNull();
    expect(root?.params).toEqual({});
    expect(matchRoute(ROUTES, '')?.route).toBe(root?.route);
  });

  test('/workouts matches with and without a trailing slash', () => {
    const list = matchRoute(ROUTES, '/workouts');
    expect(list).not.toBeNull();
    expect(list?.params).toEqual({});
    expect(matchRoute(ROUTES, '/workouts/')?.route).toBe(list?.route);
  });

  test('detail routes capture the id', () => {
    expect(matchRoute(ROUTES, '/workouts/12')?.params).toEqual({ id: '12' });
    expect(matchRoute(ROUTES, '/exercises/7')?.params).toEqual({ id: '7' });
  });

  test('detail routes are distinct from each other and from the lists', () => {
    const workout = matchRoute(ROUTES, '/workouts/12')?.route;
    const exercise = matchRoute(ROUTES, '/exercises/7')?.route;
    const lists = [matchRoute(ROUTES, '/workouts')?.route, matchRoute(ROUTES, '/exercises')?.route];

    expect(workout).not.toBe(exercise);
    expect(lists).not.toContain(workout);
    expect(lists).not.toContain(exercise);
  });

  test.each(['/workouts/abc', '/nope', '/exercises/7/extra'])('%s matches nothing', (path) => {
    expect(matchRoute(ROUTES, path)).toBeNull();
  });

  test('the header links are Dashboard, Workouts, Exercises, each matching its own route', () => {
    const withNav = ROUTES.filter((route) => route.nav);

    expect(withNav.map((route) => route.nav)).toEqual([
      { path: '/', label: 'Dashboard' },
      { path: '/workouts', label: 'Workouts' },
      { path: '/exercises', label: 'Exercises' },
    ]);
    for (const route of withNav) {
      expect(matchRoute(ROUTES, route.nav?.path ?? '')?.route).toBe(route);
    }
  });

  test.each<[string, string | undefined]>([
    ['/', undefined],
    ['/workouts', 'Workouts'],
    ['/workouts/1', 'Workout'],
    ['/exercises', 'Exercises'],
    ['/exercises/1', 'Exercise'],
    ['/login', 'Log in'],
  ])('%s is titled %p', (path, title) => {
    expect(matchRoute(ROUTES, path)?.route.title).toBe(title);
  });

  test('only the detail routes have parents: their lists', () => {
    const withParents = ROUTES.filter((route) => route.parents);

    expect(withParents).toHaveLength(2);
    expect(matchRoute(withParents, '/workouts/1')).not.toBeNull();
    expect(matchRoute(withParents, '/exercises/1')).not.toBeNull();
    expect(withParents.map((route) => route.parents)).toEqual([[{ path: '/workouts', label: 'Workouts' }], [{ path: '/exercises', label: 'Exercises' }]]);
  });

  test("every parent links to a route titled by the parent's label", () => {
    for (const parent of ROUTES.flatMap((route) => route.parents ?? [])) {
      expect(matchRoute(ROUTES, parent.path)?.route.title).toBe(parent.label);
    }
  });
});
