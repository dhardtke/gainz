/** The document's own title, as `index.html` declares it; the dashboard keeps it. */
export const APP_TITLE = 'gainz — lifting log';

/** The tab title for a page of that name, or the app's own title for none. */
export function tabTitle(name: string | null): string {
  return name === null ? APP_TITLE : `${name} · gainz`;
}
