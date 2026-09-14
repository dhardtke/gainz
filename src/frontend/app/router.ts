/**
 * Hash-based router. Hash routing keeps the app a single static file that any
 * server can hand out, and survives a manual reload of a deep link.
 */

export interface RouteDef {
  pattern: RegExp;
  /** Names for the pattern's capture groups, in order. */
  keys: string[];
  view: (params: Record<string, string>) => Promise<Element>;
  /** A header link; `path` is explicit because a regex cannot be turned back into an href. */
  nav?: { path: string; label: string };
}

export interface RouteMatch {
  route: RouteDef;
  /** Captured from the path, e.g. `{ id: "12" }`. */
  params: Record<string, string>;
}

export function matchRoute(routes: readonly RouteDef[], path: string): RouteMatch | null {
  for (const route of routes) {
    const match = route.pattern.exec(path);
    if (!match) {
      continue;
    }
    const params: Record<string, string> = {};
    route.keys.forEach((key, index) => {
      params[key] = match[index + 1] ?? '';
    });
    return { route, params };
  }
  return null;
}

/** The hash without its leading `#`. */
export function currentPath(): string {
  return location.hash.replace(/^#/, '') || '/';
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
  const current = currentPath();
  return path === '/' ? current === '/' : current.startsWith(path);
}
