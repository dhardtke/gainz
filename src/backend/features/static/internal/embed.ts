import { resolve } from 'node:path';
import type { EmbeddedFile, EmbeddedWeb } from '../../../shared/embedded.ts';
import { bundleFrontend } from './bundle.ts';
import { contentTag } from './content-tag.ts';
import { renderPage } from './page.ts';
import { FRONTEND_DIR, isShipped, isVersioned, resolveVendorPath, vendorUrls } from './paths.ts';

const MODULE_TYPE = 'text/javascript;charset=utf-8';

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
    // The modules ship as the one bundle below.
    if (!isShipped(url) || url.endsWith('.ts')) {
      continue;
    }

    // Binary goes in as base64: `JSON.stringify` cannot carry raw bytes into gainz.js.
    const file = Bun.file(resolve(FRONTEND_DIR, entry));
    pages[url] = isText(file.type) ? { body: await file.text(), type: file.type } : { body: (await file.bytes()).toBase64(), type: file.type, base64: true };
  }
  const bundle = await bundleFrontend();
  pages['/main.ts'] = { body: bundle.code, type: MODULE_TYPE };
  pages['/main.ts.map'] = { body: bundle.map, type: 'application/json;charset=utf-8' };

  const vendor: Record<string, EmbeddedFile> = {};
  for (const url of vendorUrls()) {
    const path = resolveVendorPath(url);
    const file = path === null ? null : Bun.file(path);
    if (file === null || !(await file.exists())) {
      throw new Error('Vendor file missing — run `bun install`');
    }
    vendor[url] = { body: await file.text(), type: file.type };
  }

  // Last, tagged from the strings EmbeddedWebFiles serves, so a version matches its ETag.
  const tags = Object.fromEntries(
    [...Object.entries(pages).filter(([url]) => isVersioned(url)), ...Object.entries(vendor)].map(([url, file]) => [url, contentTag(file.body)]),
  );
  for (const page of Object.values(pages)) {
    if (page.type.startsWith('text/html')) {
      page.body = await renderPage(page.body, { tags: () => Promise.resolve(tags) });
    }
  }

  return { pages, vendor };
}
