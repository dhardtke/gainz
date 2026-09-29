import { describe, expect, test } from 'bun:test';
import { isBeyondApi, MAX_OFFSET, pageCount, pageItems, pageOffset, pagePath, pager, parsePage, pastEnd } from './pagination.ts';

// The markup is checked by substring rather than whole: oxfmt formats the HTML inside the html``
// literals in pagination.ts, so their exact whitespace is the formatter's to change.

describe('parsePage', () => {
  test.each(['', '?page=abc', '?page=0', '?page=-1', '?page=2.5', '?page='])('%p is page 1', (search) => {
    expect(parsePage(search)).toBe(1);
  });

  test('reads a positive integer, wherever it sits in the query', () => {
    expect(parsePage('?page=3')).toBe(3);
    expect(parsePage('?other=1&page=2')).toBe(2);
  });
});

describe('pageCount', () => {
  test('is at least 1 and rounds a partial page up', () => {
    expect(pageCount(0, 10)).toBe(1);
    expect(pageCount(10, 10)).toBe(1);
    expect(pageCount(11, 10)).toBe(2);
  });
});

describe('pageOffset', () => {
  test('skips the pages before, capped at what the API accepts', () => {
    expect(pageOffset(1, 10)).toBe(0);
    expect(pageOffset(3, 10)).toBe(20);
    expect(pageOffset(99_999_999, 10)).toBe(MAX_OFFSET);
  });
});

describe('isBeyondApi', () => {
  test('is true only once the real offset exceeds the cap', () => {
    expect(isBeyondApi(10001, 10)).toBe(false);
    expect(isBeyondApi(10002, 10)).toBe(true);
  });
});

describe('pagePath', () => {
  test('page 1 is the bare path, any other carries ?page=', () => {
    expect(pagePath('/workouts', 1)).toBe('/workouts');
    expect(pagePath('/workouts', 2)).toBe('/workouts?page=2');
  });
});

describe('pageItems', () => {
  test.each([
    [1, 1, [1]],
    [2, 3, [1, 2, 3]],
    [3, 12, [1, 2, 3, 4, 'gap', 12]],
    [5, 12, [1, 'gap', 4, 5, 6, 'gap', 12]],
    [12, 12, [1, 'gap', 11, 12]],
  ] as const)('page %p of %p', (page, pages, expected) => {
    expect(pageItems(page, pages)).toEqual([...expected]);
  });
});

describe('pager', () => {
  const count = (haystack: string, needle: string): number => haystack.split(needle).length - 1;

  test('only the current page carries aria-current', () => {
    const out = String(pager(5, 12));

    expect(count(out, 'aria-current="page"')).toBe(1);
    expect(out).toContain('aria-current="page" data-action="page" data-page="5"');
  });

  test('Previous is disabled only on the first page, Next only on the last', () => {
    const first = String(pager(1, 3));
    const middle = String(pager(2, 3));
    const last = String(pager(3, 3));

    expect(first).toContain('data-page="0" disabled');
    expect(first).not.toContain('data-page="2" disabled');
    expect(count(middle, ' disabled')).toBe(0);
    expect(last).toContain('data-page="4" disabled');
    expect(last).not.toContain('data-page="2" disabled');
  });

  test('Previous and Next point at the neighboring pages', () => {
    const out = String(pager(5, 12));

    expect(out).toContain('data-page="4" >← Previous');
    expect(out).toContain('data-page="6" >Next →');
  });

  test('renders one disabled, hidden … per gap', () => {
    expect(count(String(pager(5, 12)), 'aria-hidden="true">…')).toBe(2);
    expect(count(String(pager(3, 12)), 'aria-hidden="true">…')).toBe(1);
  });

  test('a single page has both Previous and Next disabled', () => {
    expect(count(String(pager(1, 1)), ' disabled')).toBe(2);
  });
});

describe('pastEnd', () => {
  test('names the noun and offers page 1', () => {
    const out = String(pastEnd('workouts'));

    expect(out).toContain('No workouts on this page.');
    expect(out).toContain('data-page="1"');
  });
});
