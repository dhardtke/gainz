/**
 * What a single-file build carries of the web root: every file the browser can ask for, keyed by
 * its URL and transpiled ahead of time, so the built server answers the same URLs with the same
 * modules — one module per URL — without a source tree beside it.
 */
import { resolve } from 'node:path';
import type { EmbeddedFile, EmbeddedWeb } from '../../../shared/embedded.ts';
import { contentTag } from './content-tag.ts';
import { renderPage } from './page.ts';
import { FRONTEND_DIR, isShipped, isVersioned, resolveVendorPath, vendorUrls } from './paths.ts';
import { transpileModule } from './transpile.ts';

const MODULE_TYPE = 'text/javascript;charset=utf-8';

/** `type` is a MIME type as `Bun.file().type` reports it, parameters included. */
function isText(type: string): boolean {
  const essence = type.split(';', 1)[0]?.trim() ?? '';
  return (
    essence.startsWith('text/') ||
    essence.endsWith('+json') ||
    essence.endsWith('+xml') ||
    essence === 'application/json' ||
    essence === 'application/javascript'
  );
}

export async function embedWebRoot(): Promise<EmbeddedWeb> {
  const pages: Record<string, EmbeddedFile> = {};
  for await (const entry of new Bun.Glob('**/*').scan({ cwd: FRONTEND_DIR })) {
    // Glob yields `ui\app.css` on Windows.
    const url = `/${entry.replaceAll('\\', '/')}`;
    if (!isShipped(url)) {
      continue;
    }

    const path = resolve(FRONTEND_DIR, entry);
    if (url.endsWith('.ts')) {
      const code = await transpileModule(path, { minify: true });
      if (code === null) {
        throw new Error(`Could not transpile src/frontend${url}`);
      }
      pages[url] = { body: code, type: MODULE_TYPE };
    } else {
      // Text stays text, so `stamp()` can still edit the index page. Anything else (the icons)
      // goes in as base64, because `JSON.stringify` cannot carry raw bytes into gainz.js.
      const file = Bun.file(path);
      pages[url] = isText(file.type) ? { body: await file.text(), type: file.type } : { body: (await file.bytes()).toBase64(), type: file.type, base64: true };
    }
  }

  const vendor: Record<string, EmbeddedFile> = {};
  for (const url of vendorUrls()) {
    const path = resolveVendorPath(url);
    const file = path === null ? null : Bun.file(path);
    if (file === null || !(await file.exists())) {
      throw new Error('Vendor file missing — run `bun install`');
    }
    vendor[url] = { body: await file.text(), type: file.type };
  }

  // Last, so a page sees every file as it will be served: tagged from the same strings
  // `EmbeddedWebFiles` answers with, so a version matches its response's ETag.
  const tags = Object.fromEntries(
    [...Object.entries(pages).filter(([url]) => isVersioned(url)), ...Object.entries(vendor)].map(([url, file]) => [url, contentTag(file.body)]),
  );
  for (const page of Object.values(pages)) {
    if (page.type.startsWith('text/html')) {
      page.body = await renderPage(page.body, {
        module: (url) => Promise.resolve(pages[url]?.type === MODULE_TYPE ? pages[url].body : null),
        tags: () => Promise.resolve(tags),
      });
    }
  }

  return { pages, vendor };
}
