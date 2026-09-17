/** What the browser should do about one saved file: restyle in place, or reload the page. */
export type Change = { swap: string } | { reload: string };

/**
 * Classifies a path as `fs.watch` reports it — relative to the web root, with backslashes on
 * Windows — into the URL it is served at and what a change to it means.
 *
 * The watcher also reports bare directory names such as `ui`, and editors write swap and backup
 * files, so anything without one of the three extensions the frontend is made of is ignored.
 */
export function changeFor(relativePath: string): Change | null {
  const url = `/${relativePath.replaceAll('\\', '/')}`;
  if (url.endsWith('.css')) {
    return { swap: url };
  }
  if (url.endsWith('.ts') || url.endsWith('.html')) {
    return { reload: url };
  }
  return null;
}
