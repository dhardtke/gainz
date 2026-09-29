import { html } from './html.ts';
import type { RawHtml } from './html.ts';

/** Items per page on the paged lists. */
export const PAGE_SIZE = 10;

/** The largest `offset` the list endpoints accept. */
export const MAX_OFFSET = 100000;

/** The `?page=` of a query string as a positive integer; anything else is page 1. */
export function parsePage(search: string): number {
  const value = new URLSearchParams(search).get('page') ?? '';
  return /^\d+$/.test(value) && Number(value) >= 1 ? Number(value) : 1;
}

/** At least one page, so an empty list still has a page 1 to show. */
export function pageCount(total: number, size: number): number {
  return Math.max(1, Math.ceil(total / size));
}

/** The offset to request for `page`, capped so that even a huge page number is a valid request. */
export function pageOffset(page: number, size: number): number {
  return Math.min((page - 1) * size, MAX_OFFSET);
}

/** True when the API cannot serve `page` at all, which puts it past the end whatever `total` says. */
export function isBeyondApi(page: number, size: number): boolean {
  return (page - 1) * size > MAX_OFFSET;
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

/**
 * Oat's pagination (https://oat.ink/components/#pagination), with buttons instead of links: a
 * `?page=` link would be a full page load, and only a button can be disabled. Each button carries
 * `data-action="page"` and `data-page`; the list that renders it navigates.
 */
export function pager(page: number, pages: number): RawHtml {
  return html`
    <nav aria-label="Pagination">
      <menu class="buttons">
        <li><button class="outline small" data-action="page" data-page="${page - 1}" ${page <= 1 ? 'disabled' : ''}>← Previous</button></li>
        ${pageItems(page, pages).map((item) =>
          item === 'gap'
            ? html`<li><button class="outline small" disabled aria-hidden="true">…</button></li>`
            : item === page
              ? html`<li><button class="small" aria-current="page" data-action="page" data-page="${item}" aria-label="Page ${item}">${item}</button></li>`
              : html`<li><button class="outline small" data-action="page" data-page="${item}" aria-label="Page ${item}">${item}</button></li>`,
        )}
        <li><button class="outline small" data-action="page" data-page="${page + 1}" ${page >= pages ? 'disabled' : ''}>Next →</button></li>
      </menu>
    </nav>
  `;
}

/** What a page past the end shows in place of the items and the pager. */
export function pastEnd(noun: string): RawHtml {
  return html`
    <p class="empty">No ${noun} on this page.</p>
    <div><button class="outline" data-action="page" data-page="1">Go to page 1</button></div>
  `;
}
