import { beforeAll, expect, test } from 'bun:test';
import { collect, mount, useDom } from '../../testing.ts';

useDom();

beforeAll(async () => {
  await import('./gz-pagination.component.ts');
});

/** Mounts a pager, its attributes set before it is appended so its first render shows them. */
function mountPager(page: number, pages: number, noun?: string): HTMLElement {
  return mount('gz-pagination', { page: String(page), pages: String(pages), ...(noun === undefined ? {} : { noun }) });
}

function buttons(pager: HTMLElement): HTMLButtonElement[] {
  return Array.from(pager.shadowRoot?.querySelectorAll('button') ?? []);
}

function button(pager: HTMLElement, text: string): HTMLButtonElement {
  const found = buttons(pager).find((candidate) => candidate.textContent.trim() === text);
  if (!found) {
    throw new Error(`no button reads ${text}`);
  }
  return found;
}

test('shows the pages around the current one, the ends, and gaps between', () => {
  const pager = mountPager(5, 12);
  expect(buttons(pager).map((candidate) => candidate.textContent.trim())).toEqual(['← Previous', '1', '…', '4', '5', '6', '…', '12', 'Next →']);
  expect(
    buttons(pager)
      .filter((candidate) => candidate.textContent === '…')
      .every((gap) => gap.disabled),
  ).toBe(true);
  expect(
    buttons(pager)
      .filter((candidate) => candidate.getAttribute('aria-current') === 'page')
      .map((current) => current.textContent),
  ).toEqual(['5']);
});

test('disables Previous on the first page and Next on the last', () => {
  expect(button(mountPager(1, 3), '← Previous').disabled).toBe(true);
  expect(button(mountPager(1, 3), 'Next →').disabled).toBe(false);
  expect(button(mountPager(3, 3), 'Next →').disabled).toBe(true);
  expect(button(mountPager(3, 3), '← Previous').disabled).toBe(false);
});

test('emits page-change with the page clicked, out of the shadow root', () => {
  const pages = collect('page-change');
  const pager = mountPager(5, 12);
  button(pager, '6').click();
  button(pager, 'Next →').click();
  expect(pages).toEqual([6, 6]);
});

test('emits nothing for a disabled button', () => {
  const pages = collect('page-change');
  button(mountPager(1, 3), '← Previous').click();
  expect(pages).toEqual([]);
});

test('past the last page, says so and offers page 1', () => {
  const pages = collect('page-change');
  const pager = mountPager(4, 3, 'workouts');
  expect(pager.shadowRoot?.querySelector('.empty')?.textContent).toBe('No workouts on this page.');
  expect(pager.shadowRoot?.querySelector('nav')).toBeNull();
  button(pager, 'Go to page 1').click();
  expect(pages).toEqual([1]);
});

test('calls them items without a noun', () => {
  expect(mountPager(4, 3).shadowRoot?.querySelector('.empty')?.textContent).toBe('No items on this page.');
});

test('re-renders when the page changes', () => {
  const pager = mountPager(1, 3);
  pager.setAttribute('page', '2');
  expect(buttons(pager).find((candidate) => candidate.getAttribute('aria-current') === 'page')?.textContent).toBe('2');
});
