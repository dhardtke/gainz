import { beforeAll, beforeEach, expect, test } from 'bun:test';
import { useDom } from '../testing.ts';
// Type-only, so erased: the module itself is imported once the DOM is in place.
import type * as ThemeModule from '../ui/theme.ts';

useDom();

/** The plain module, so the same instance the component uses, unlike theme.test.ts's `?N` copies. */
let theme: typeof ThemeModule;

beforeAll(async () => {
  await import('./gz-theme-toggle.component.ts');
  theme = await import('../ui/theme.ts');
});

beforeEach(() => {
  // The module's current theme outlives each test.
  theme.setTheme('light');
});

function mount(): HTMLButtonElement {
  const toggle = document.createElement('gz-theme-toggle');
  document.body.append(toggle);
  const button = toggle.shadowRoot?.querySelector('button');
  if (!button) {
    throw new Error('gz-theme-toggle rendered no button');
  }
  return button;
}

function icons(button: HTMLButtonElement): { sun: boolean; moon: boolean } {
  return {
    sun: button.querySelector('svg.sun')?.hasAttribute('hidden') === false,
    moon: button.querySelector('svg.moon')?.hasAttribute('hidden') === false,
  };
}

test('shows the sun in light mode', () => {
  const button = mount();
  expect(icons(button)).toEqual({ sun: true, moon: false });
  expect(button.getAttribute('aria-label')).toBe('Turn on dark mode');
});

test('turns on dark mode when clicked', () => {
  const button = mount();
  button.click();
  expect(theme.currentTheme()).toBe('dark');
  expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  expect(icons(button)).toEqual({ sun: false, moon: true });
  expect(button.getAttribute('aria-label')).toBe('Turn off dark mode');
});

test('keeps its button, and the focus on it, across a click', () => {
  const button = mount();
  button.focus();
  button.click();
  const root = button.getRootNode();
  expect(root instanceof ShadowRoot && root.querySelector('button')).toBe(button);
  expect(root instanceof ShadowRoot && root.activeElement).toBe(button);
});

test('follows a theme change made elsewhere', () => {
  const button = mount();
  theme.setTheme('dark');
  expect(icons(button)).toEqual({ sun: false, moon: true });
  expect(button.getAttribute('aria-label')).toBe('Turn off dark mode');
});

test('stops following the theme once removed', () => {
  const button = mount();
  document.body.replaceChildren();
  theme.setTheme('dark');
  expect(button.getAttribute('aria-label')).toBe('Turn on dark mode');
});
