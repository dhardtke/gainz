/** Items per page on the paged lists. */
export const PAGE_SIZE = 10;

/** The largest `offset` the list endpoints accept. */
export const MAX_OFFSET = 100000;

/** The `?page=` of a query string as a positive integer; anything else is page 1. */
export function parsePage(search: string): number {
  const value = new URLSearchParams(search).get('page') ?? '';
  return /^\d+$/.test(value) && Number(value) >= 1 ? Number(value) : 1;
}

/**
 * The pages a list can show: at least one, so an empty list still has a page 1, and no more than
 * the API's offset cap can reach, so any larger page counts as past the end whatever `total` says.
 */
export function pageCount(total: number, size: number): number {
  return Math.min(Math.max(1, Math.ceil(total / size)), Math.floor(MAX_OFFSET / size) + 1);
}

/** The offset to request for `page`, capped so that even a huge page number is a valid request. */
export function pageOffset(page: number, size: number): number {
  return Math.min((page - 1) * size, MAX_OFFSET);
}

/** Page 1 is the bare path, so a list has one URL for its first page. */
export function pagePath(path: string, page: number): string {
  return page === 1 ? path : `${path}?page=${page}`;
}

/**
 * The page numbers the pager shows: the first, the last and the current one ±1. A hole of
 * two or more pages becomes a gap; a hole of exactly one shows that page, which is no wider.
 */
export function pageItems(page: number, pages: number): (number | 'gap')[] {
  const shown = [...new Set([1, page - 1, page, page + 1, pages])].filter((n) => n >= 1 && n <= pages).toSorted((a, b) => a - b);
  const items: (number | 'gap')[] = [];
  let previous = 0;
  for (const n of shown) {
    if (n - previous === 2) {
      items.push(n - 1);
    } else if (n - previous > 2) {
      items.push('gap');
    }
    items.push(n);
    previous = n;
  }
  return items;
}
