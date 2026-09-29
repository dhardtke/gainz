import { beforeAll, expect, test } from 'bun:test';
import { useDom } from '../../testing.ts';

useDom();

beforeAll(async () => {
  await import('./gz-pagination.component.ts');
});

/** Mounts a pager, its attributes set before it is appended so its first render shows them. */
function mount(page: number, pages: number, noun?: string): HTMLElement {
  const pager = document.createElement('gz-pagination');
  pager.setAttribute('page', String(page));
  pager.setAttribute('pages', String(pages));
  if (noun !== undefined) {
    pager.setAttribute('noun', noun);
  }
  document.body.append(pager);
  return pager;
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

/** Collects the page numbers `page-change` carries, heard on the body, outside the shadow root. */
function pageChanges(): number[] {
  const pages: number[] = [];
  document.body.addEventListener('page-change', (event) => {
    if (event instanceof CustomEvent && typeof event.detail === 'number') {
      pages.push(event.detail);
    }
  });
  return pages;
}

test('shows the pages around the current one, the ends, and gaps between', () => {
  const pager = mount(5, 12);
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
  expect(button(mount(1, 3), '← Previous').disabled).toBe(true);
  expect(button(mount(1, 3), 'Next →').disabled).toBe(false);
  expect(button(mount(3, 3), 'Next →').disabled).toBe(true);
  expect(button(mount(3, 3), '← Previous').disabled).toBe(false);
});

test('emits page-change with the page clicked, out of the shadow root', () => {
  const pages = pageChanges();
  const pager = mount(5, 12);
  button(pager, '6').click();
  button(pager, 'Next →').click();
  expect(pages).toEqual([6, 6]);
});

test('emits nothing for a disabled button', () => {
  const pages = pageChanges();
  button(mount(1, 3), '← Previous').click();
  expect(pages).toEqual([]);
});

test('past the last page, says so and offers page 1', () => {
  const pages = pageChanges();
  const pager = mount(4, 3, 'workouts');
  expect(pager.shadowRoot?.querySelector('.empty')?.textContent).toBe('No workouts on this page.');
  expect(pager.shadowRoot?.querySelector('nav')).toBeNull();
  button(pager, 'Go to page 1').click();
  expect(pages).toEqual([1]);
});

test('calls them items without a noun', () => {
  expect(mount(4, 3).shadowRoot?.querySelector('.empty')?.textContent).toBe('No items on this page.');
});

test('re-renders when the page changes', () => {
  const pager = mount(1, 3);
  pager.setAttribute('page', '2');
  expect(buttons(pager).find((candidate) => candidate.getAttribute('aria-current') === 'page')?.textContent).toBe('2');
});
