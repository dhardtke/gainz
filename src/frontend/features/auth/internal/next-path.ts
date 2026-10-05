const LOGIN_PATH = '/login';

/**
 * Where to go after logging in: the `next` query parameter of `search`, if it is a path on this
 * origin other than the login page, and `/` otherwise. `next` is resolved as a URL rather than
 * checked for a leading slash, which also turns away `//evil.example`, `/\evil.example` and a
 * tab-smuggled `/<TAB>/evil.example`, all of which a browser reads as another host.
 */
export function nextPath(search: string, origin: string): string {
  const next = new URLSearchParams(search).get('next');
  if (next === null) {
    return '/';
  }
  let url: URL;
  try {
    url = new URL(next, origin);
  } catch {
    return '/';
  }
  if (url.origin !== origin || url.pathname === LOGIN_PATH || url.pathname === `${LOGIN_PATH}/`) {
    return '/';
  }
  return url.pathname + url.search;
}
