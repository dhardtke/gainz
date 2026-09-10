/**
 * Hash-based router. Hash routing keeps the app a single static file that any
 * server can hand out, and survives a manual reload of a deep link.
 */

export type ViewName = 'dashboard' | 'workouts' | 'workout' | 'exercises' | 'exercise';

export type RouteName = ViewName | 'notfound';

export interface Route {
  name: RouteName;
  /** Captured from the path, e.g. `{ id: "12" }`. */
  params: Record<string, string>;
  /** The hash without its leading `#`. */
  path: string;
}

const ROUTES: { pattern: RegExp; name: RouteName; keys: string[] }[] = [
  { pattern: /^\/?$/, name: 'dashboard', keys: [] },
  { pattern: /^\/workouts\/?$/, name: 'workouts', keys: [] },
  { pattern: /^\/workouts\/(\d+)\/?$/, name: 'workout', keys: ['id'] },
  { pattern: /^\/exercises\/?$/, name: 'exercises', keys: [] },
  { pattern: /^\/exercises\/(\d+)\/?$/, name: 'exercise', keys: ['id'] },
];

export function currentRoute(): Route {
  const path = location.hash.replace(/^#/, '') || '/';

  for (const route of ROUTES) {
    const match = path.match(route.pattern);
    if (!match) {
      continue;
    }
    const params: Record<string, string> = {};
    route.keys.forEach((key, index) => {
      params[key] = match[index + 1] ?? '';
    });
    return { name: route.name, params, path };
  }
  return { name: 'notfound', params: {}, path };
}

export function navigate(path: string): void {
  const target = `#${path}`;
  if (location.hash === target) {
    // Same route: force the listeners to run so the view refreshes.
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    location.hash = target;
  }
}

/** @returns call it to stop listening. */
export function onRouteChange(listener: () => void): () => void {
  window.addEventListener('hashchange', listener);
  return () => {
    window.removeEventListener('hashchange', listener);
  };
}

/** True when `path` is the active route or one of its children. */
export function isActive(path: string): boolean {
  const current = currentRoute().path;
  return path === '/' ? current === '/' : current.startsWith(path);
}
