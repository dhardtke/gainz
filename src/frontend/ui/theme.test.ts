import { beforeEach, describe, expect, test } from 'bun:test';
import { useGlobals } from '../testing.ts';
import type * as ThemeModule from './theme.ts';

const stub = useGlobals();

let stored: Map<string, string>;
let systemDark: boolean;
let storageBlocked: boolean;

beforeEach(() => {
  stored = new Map();
  systemDark = false;
  storageBlocked = false;

  const guard = (): void => {
    if (storageBlocked) {
      throw new DOMException('The operation is insecure.', 'SecurityError');
    }
  };
  stub('localStorage', {
    getItem: (key: string) => {
      guard();
      return stored.get(key) ?? null;
    },
    setItem: (key: string, value: string) => {
      guard();
      stored.set(key, value);
    },
  });
  stub('matchMedia', (query: string) => ({ matches: query === '(prefers-color-scheme: dark)' && systemDark }));
  stub('document', { documentElement: new FakeElement() });
  stub('window', new EventTarget());
});

class FakeElement {
  readonly attributes = new Map<string, string>();

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }
}

function htmlTheme(): string | undefined {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the stub installed in beforeEach
  return (document.documentElement as unknown as FakeElement).attributes.get('data-theme');
}

let loads = 0;

/** theme.ts reads the stored choice once, at load, so each test needs a fresh instance of it. */
async function load(): Promise<typeof ThemeModule> {
  loads++;
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the query string only defeats the module cache
  return (await import(`./theme.ts?${loads}`)) as typeof ThemeModule;
}

describe('at load', () => {
  test('a visitor who never chose follows the system: light', async () => {
    const theme = await load();

    expect(theme.currentTheme()).toBe('light');
    expect(htmlTheme()).toBe('light');
  });

  test('a visitor who never chose follows the system: dark', async () => {
    systemDark = true;

    expect((await load()).currentTheme()).toBe('dark');
    expect(htmlTheme()).toBe('dark');
  });

  test('a stored choice wins over the system', async () => {
    systemDark = true;
    stored.set('gainz:theme', 'light');

    expect((await load()).currentTheme()).toBe('light');
  });

  test('the "system" an earlier version stored counts as no choice', async () => {
    systemDark = true;
    stored.set('gainz:theme', 'system');

    expect((await load()).currentTheme()).toBe('dark');
  });

  test('blocked storage falls back to the system rather than throwing', async () => {
    systemDark = true;
    storageBlocked = true;

    expect((await load()).currentTheme()).toBe('dark');
  });

  test('a browser without matchMedia starts light', async () => {
    stub('matchMedia', undefined);

    expect((await load()).currentTheme()).toBe('light');
  });
});

describe('setTheme', () => {
  test('stores the choice, mirrors it onto <html> and tells listeners', async () => {
    const theme = await load();
    let heard = 0;
    theme.onThemeChange(() => {
      heard++;
    });

    theme.setTheme('dark');

    expect(theme.currentTheme()).toBe('dark');
    expect(stored.get('gainz:theme')).toBe('dark');
    expect(htmlTheme()).toBe('dark');
    expect(heard).toBe(1);
  });

  test('the stored choice survives a reload, even once the system disagrees', async () => {
    (await load()).setTheme('dark');
    systemDark = false;

    expect((await load()).currentTheme()).toBe('dark');
  });

  test('choosing the current theme again does nothing, so the system stays in charge', async () => {
    const theme = await load();
    let heard = 0;
    theme.onThemeChange(() => {
      heard++;
    });

    theme.setTheme('light');

    expect(stored.has('gainz:theme')).toBe(false);
    expect(heard).toBe(0);
  });

  test('still applies for the page when storage is blocked', async () => {
    const theme = await load();
    storageBlocked = true;

    theme.setTheme('dark');

    expect(theme.currentTheme()).toBe('dark');
    expect(htmlTheme()).toBe('dark');
  });

  test('onThemeChange returns a function that stops listening', async () => {
    const theme = await load();
    let heard = 0;
    const stop = theme.onThemeChange(() => {
      heard++;
    });

    stop();
    theme.setTheme('dark');

    expect(heard).toBe(0);
  });
});

describe('toggleTheme', () => {
  test('from light stores and applies dark, and tells listeners once', async () => {
    const theme = await load();
    let heard = 0;
    theme.onThemeChange(() => {
      heard++;
    });

    theme.toggleTheme();

    expect(theme.currentTheme()).toBe('dark');
    expect(stored.get('gainz:theme')).toBe('dark');
    expect(htmlTheme()).toBe('dark');
    expect(heard).toBe(1);
  });

  test('toggling twice returns to light and stores it', async () => {
    const theme = await load();

    theme.toggleTheme();
    theme.toggleTheme();

    expect(theme.currentTheme()).toBe('light');
    expect(stored.get('gainz:theme')).toBe('light');
    expect(htmlTheme()).toBe('light');
  });
});
