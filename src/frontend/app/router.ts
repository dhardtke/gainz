/**
 * Path-based router over the History API.
 */

/** A link to a page: a header link or a breadcrumb. */
export interface Crumb {
  path: string;
  label: string;
}

export interface RouteDef {
  pattern: RegExp;
  /** Names for the pattern's capture groups, in order. */
  keys: string[];
  view: (params: Record<string, string>) => Promise<Element>;
  /**
   * The module `view` imports, as `import.meta.resolve()` of the same specifier, so `gz-app` can
   * fetch its whole graph before importing it (see `preload.ts`).
   */
  module?: string;
  /**
   * The page's name: the tab title, and the last breadcrumb until its view names what it shows.
   * Without one the tab keeps the app's own title.
   */
  title?: string;
  /** The pages above this one, outermost first; a route without any shows no breadcrumb. */
  parents?: Crumb[];
  /** A header link; `path` is explicit because a regex cannot be turned back into an href. */
  nav?: Crumb;
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

/** Routes to `path`, which may carry a query such as `/workouts?page=2`. */
export function navigate(path: string): void {
  if (location.pathname + location.search !== path) {
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
