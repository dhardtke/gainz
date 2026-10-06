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
      '/features/a/gz-a.component.ts': ['/features/a/gz-a.component.ts?v=a', '/features/a/gz-a.component.css?v=a2', '/ui/tile/gz-tile.component.ts?v=t'],
      '/features/b/gz-b.component.ts': ['/features/b/gz-b.component.ts?v=b', '/ui/tile/gz-tile.component.ts?v=t'],
    });
    document.head.append(map);
    ({ preloadModule } = await import('./preload.ts'));
  });

  const links = (): string[][] =>
    [...document.head.querySelectorAll('link')].map((link) => [link.rel, link.getAttribute('href') ?? '', link.as, link.getAttribute('crossorigin') ?? '']);

  test("links a module's scripts as modulepreloads and its stylesheets for fetch(), versions and all", () => {
    preloadModule('http://localhost/features/a/gz-a.component.ts?v=a');
    expect(links()).toEqual([
      ['modulepreload', '/features/a/gz-a.component.ts?v=a', '', ''],
      ['preload', '/features/a/gz-a.component.css?v=a2', 'fetch', 'anonymous'],
      ['modulepreload', '/ui/tile/gz-tile.component.ts?v=t', '', ''],
    ]);
  });

  test('never links a file twice, so nothing is fetched twice', () => {
    preloadModule('http://localhost/features/a/gz-a.component.ts');
    preloadModule('http://localhost/features/b/gz-b.component.ts');
    expect(links().map(([, href]) => href)).toEqual([
      '/features/a/gz-a.component.ts?v=a',
      '/features/a/gz-a.component.css?v=a2',
      '/ui/tile/gz-tile.component.ts?v=t',
      '/features/b/gz-b.component.ts?v=b',
    ]);
  });

  test('does nothing for a module the map does not name', () => {
    const before = links().length;
    preloadModule('http://localhost/app/gz-header.component.ts');
    expect(links()).toHaveLength(before);
  });
});
