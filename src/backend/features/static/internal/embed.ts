/**
 * What a single-file build carries of the web root: every file the browser can ask for, keyed by
 * its URL and transpiled ahead of time, so the built server answers the same URLs with the same
 * modules — one module per URL — without a source tree beside it.
 */
import { resolve } from 'node:path';
import type { EmbeddedFile, EmbeddedWeb } from '../../../embedded.ts';
import { FRONTEND_DIR, resolveVendorPath, vendorUrls } from './paths.ts';
import { transpileModule } from './transpile.ts';

/** Hot reload is off in a built file, and tests never ship. */
function isEmbedded(url: string): boolean {
  return !url.startsWith('/dev/') && url !== '/testing.ts' && !url.endsWith('.test.ts');
}

export async function embedWebRoot(): Promise<EmbeddedWeb> {
  const pages: Record<string, EmbeddedFile> = {};
  for await (const entry of new Bun.Glob('**/*').scan({ cwd: FRONTEND_DIR })) {
    // Glob yields `ui\app.css` on Windows.
    const url = `/${entry.replaceAll('\\', '/')}`;
    if (!isEmbedded(url)) {
      continue;
    }

    const path = resolve(FRONTEND_DIR, entry);
    if (url.endsWith('.ts')) {
      const code = await transpileModule(path, { minify: true });
      if (code === null) {
        throw new Error(`Could not transpile src/frontend${url}`);
      }
      pages[url] = { body: code, type: 'text/javascript;charset=utf-8' };
    } else {
      // The web root holds only .html, .css and .ts, so every page is text.
      const file = Bun.file(path);
      pages[url] = { body: await file.text(), type: file.type };
    }
  }

  const vendor: Record<string, EmbeddedFile> = {};
  for (const url of vendorUrls()) {
    const path = resolveVendorPath(url);
    const file = path === null ? null : Bun.file(path);
    if (file === null || !(await file.exists())) {
      throw new Error('Vendor stylesheet missing — run `bun install`');
    }
    vendor[url] = { body: await file.text(), type: 'text/css;charset=utf-8' };
  }

  return { pages, vendor };
}
