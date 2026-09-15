/**
 * Path-based router over the History API.
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

/** The path the page is at. */
export function currentPath(): string {
  return location.pathname;
}

export function navigate(path: string): void {
  if (location.pathname !== path) {
    history.pushState(null, '', path);
  }
  // pushState fires no event, and the same route must refresh too: tell the listeners.
  window.dispatchEvent(new PopStateEvent('popstate'));
}

/** @returns call it to stop listening. */
export function onRouteChange(listener: () => void): () => void {
  window.addEventListener('popstate', listener);
  return () => {
    window.removeEventListener('popstate', listener);
  };
}

/** True when `path` is the active route or one of its children. */
export function isActive(path: string): boolean {
  const current = currentPath();
  return path === '/' ? current === '/' : current.startsWith(path);
}

/** The parts of a click that decide whether it is a plain in-page navigation; a MouseEvent fits. */
export interface LinkClick {
  button: number;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  defaultPrevented: boolean;
}

export interface LinkTarget {
  /** Absolute, as `HTMLAnchorElement.href` reports it. */
  href: string;
  target: string;
  download: boolean;
}

/**
 * The path to route a link click to, or null when the browser should handle it: a new-tab
 * or save gesture, another origin, the API, a file, or a URL with a query or fragment.
 */
export function linkPath(click: LinkClick, link: LinkTarget, origin: string): string | null {
  const isHandledElsewhere = click.defaultPrevented;
  const isPrimaryButton = click.button === 0;
  const hasModifierKey = click.ctrlKey || click.metaKey || click.shiftKey || click.altKey;
  const opensInOtherContext = link.target !== '' && link.target !== '_self';
  const isDownload = link.download;
  if (isHandledElsewhere || !isPrimaryButton || hasModifierKey || opensInOtherContext || isDownload) {
    return null;
  }

  const url = new URL(link.href, origin);
  const path = url.pathname;
  const isOtherOrigin = url.origin !== origin;
  const hasQueryOrFragment = url.search !== '' || url.hash !== '';
  const isApiPath = path === '/api' || path.startsWith('/api/');
  // The server's fallback serves index.html only for extension-less paths; anything else is a file.
  const isFilePath = path.slice(path.lastIndexOf('/') + 1).includes('.');
  if (isOtherOrigin || hasQueryOrFragment || isApiPath || isFilePath) {
    return null;
  }

  return path;
}
