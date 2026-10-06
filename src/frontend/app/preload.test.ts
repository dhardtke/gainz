import { beforeAll, describe, expect, test } from 'bun:test';
import { useDom } from '../testing.ts';

useDom();

describe('preloadModule', () => {
  let preloadModule: (moduleUrl: string) => void;

  beforeAll(async () => {
    const map = document.createElement('script');
    map.type = 'application/json';
    map.dataset.lazyPreloads = '';
    map.textContent = JSON.stringify({
      '/features/a/gz-a.component.ts': ['/features/a/gz-a.component.ts', '/features/a/gz-a.component.css', '/ui/tile/gz-tile.component.ts'],
      '/features/b/gz-b.component.ts': ['/features/b/gz-b.component.ts', '/ui/tile/gz-tile.component.ts'],
    });
    document.head.append(map);
    ({ preloadModule } = await import('./preload.ts'));
  });

  const links = (): string[][] =>
    [...document.head.querySelectorAll('link')].map((link) => [link.rel, link.getAttribute('href') ?? '', link.as, link.getAttribute('crossorigin') ?? '']);

  test("links a module's scripts as modulepreloads and its stylesheets for fetch()", () => {
    preloadModule('http://localhost/features/a/gz-a.component.ts');
    expect(links()).toEqual([
      ['modulepreload', '/features/a/gz-a.component.ts', '', ''],
      ['preload', '/features/a/gz-a.component.css', 'fetch', 'anonymous'],
      ['modulepreload', '/ui/tile/gz-tile.component.ts', '', ''],
    ]);
  });

  test('never links a file twice, so nothing is fetched twice', () => {
    preloadModule('http://localhost/features/a/gz-a.component.ts');
    preloadModule('http://localhost/features/b/gz-b.component.ts');
    expect(links().map(([, href]) => href)).toEqual([
      '/features/a/gz-a.component.ts',
      '/features/a/gz-a.component.css',
      '/ui/tile/gz-tile.component.ts',
      '/features/b/gz-b.component.ts',
    ]);
  });

  test('does nothing for a module the map does not name', () => {
    const before = links().length;
    preloadModule('http://localhost/app/gz-header.component.ts');
    expect(links()).toHaveLength(before);
  });
});
