// Must match the <title> in index.html.
export const APP_TITLE = 'gainz — lifting log';

export function tabTitle(name: string | null): string {
  return name === null ? APP_TITLE : `${name} · gainz`;
}
