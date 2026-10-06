/**
 * Where the static feature's bytes come from: the disk under `bun start` and the tests, or the maps
 * a single-file build carries. `StaticController` reads through `WebFiles` and keeps every rule
 * about what to answer, so both sources behave alike.
 */
import { basename, extname, posix } from 'node:path';
import { EMBEDDED, type EmbeddedWeb } from '../../../shared/embedded.ts';
import { contentTag } from './content-tag.ts';
import { type PageSource, renderPage } from './page.ts';
import { FRONTEND_DIR, isVersioned, resolveStaticPath, resolveVendorPath, vendorUrls } from './paths.ts';
import { transpileModule } from './transpile.ts';

export type WebFile =
  | { kind: 'file'; body: string | Uint8Array<ArrayBuffer>; type: string }
  /** Fallback-eligible. */
  | { kind: 'missing' }
  /** Undecodable, NUL, or escapes the web root: 404, never the fallback. */
  | { kind: 'invalid' }
  /** Answered as 500. */
  | { kind: 'error'; message: string };

export interface WebFiles {
  /** `pathname` already names a file: the caller has rewritten a directory to its index.html. */
  page: (pathname: string) => Promise<WebFile>;
  vendor: (pathname: string) => Promise<WebFile>;
}

const MODULE_TYPE = 'text/javascript;charset=utf-8';

/** Reads and transpiles on every request and caches nothing, so an edited file changes its ETag. */
class DiskWebFiles implements WebFiles {
  async page(pathname: string): Promise<WebFile> {
    const path = resolveStaticPath(pathname);
    if (path === null) {
      return { kind: 'invalid' };
    }

    const file = Bun.file(path);
    if (!(await file.exists())) {
      return { kind: 'missing' };
    }

    // The frontend is TypeScript on disk and JavaScript on the wire.
    if (extname(path) === '.ts') {
      const code = await transpileModule(path);
      if (code === null) {
        return { kind: 'error', message: `Could not transpile ${basename(path)}` };
      }
      return { kind: 'file', body: code, type: MODULE_TYPE };
    }
    if (extname(path) === '.html') {
      return { kind: 'file', body: await renderPage(await file.text(), this.#pageSource()), type: file.type };
    }
    // `file.type` is Bun's MIME database lookup, so no hand-written map is kept here.
    return { kind: 'file', body: await file.bytes(), type: file.type };
  }

  async vendor(pathname: string): Promise<WebFile> {
    const path = resolveVendorPath(pathname);
    if (path === null) {
      // The specifier would not resolve: the package is not installed.
      return { kind: 'missing' };
    }

    const file = Bun.file(path);
    if (!(await file.exists())) {
      return { kind: 'error', message: 'Vendor file missing — run `bun install`' };
    }
    return { kind: 'file', body: await file.bytes(), type: file.type };
  }

  /**
   * The web root as this server answers it, for one page: every file read through `page()` and
   * `vendor()`, so a version is the tag its response carries, and each at most once per page.
   */
  #pageSource(): PageSource {
    const files = new Map<string, Promise<WebFile>>();
    const read = (url: string): Promise<WebFile> => {
      let file = files.get(url);
      if (file === undefined) {
        file = vendorUrls().includes(url) ? this.vendor(url) : this.page(url);
        files.set(url, file);
      }
      return file;
    };
    return {
      tags: async () => {
        const entries = await Array.fromAsync(new Bun.Glob('**/*.{ts,css}').scan({ cwd: FRONTEND_DIR }));
        // Glob yields `ui\app.css` on Windows.
        const urls = [...entries.map((entry) => `/${entry.replaceAll('\\', '/')}`).filter(isVersioned), ...vendorUrls()];
        const tags: Record<string, string> = {};
        for (const url of urls) {
          const file = await read(url);
          if (file.kind === 'file') {
            tags[url] = contentTag(file.body);
          }
        }
        return tags;
      },
    };
  }
}

interface ServedFile {
  body: string | Uint8Array<ArrayBuffer>;
  type: string;
}

/** Lookups in the maps a built file carries, with the same guards `resolveStaticPath` applies. */
class EmbeddedWebFiles implements WebFiles {
  readonly #web: EmbeddedWeb;
  /**
   * `web.pages` with every base64 file decoded once, here rather than per request, so its ETag
   * hashes the same bytes as `DiskWebFiles` serves.
   */
  readonly #pages: Record<string, ServedFile>;

  constructor(web: EmbeddedWeb) {
    this.#web = web;
    this.#pages = Object.fromEntries(
      Object.entries(web.pages).map(([url, file]) => [url, file.base64 === true ? { body: Uint8Array.fromBase64(file.body), type: file.type } : file]),
    );
  }

  page(pathname: string): Promise<WebFile> {
    let decoded: string;
    try {
      decoded = decodeURIComponent(pathname);
    } catch {
      return Promise.resolve({ kind: 'invalid' });
    }
    if (decoded.includes('\0')) {
      return Promise.resolve({ kind: 'invalid' });
    }

    const url = posix.normalize(decoded);
    if (!url.startsWith('/') || url.includes('..')) {
      return Promise.resolve({ kind: 'invalid' });
    }
    return Promise.resolve(found(this.#pages[url]));
  }

  /** The raw pathname only, so a vendor file is reachable at its literal URL and nowhere else. */
  vendor(pathname: string): Promise<WebFile> {
    return Promise.resolve(found(this.#web.vendor[pathname]));
  }
}

function found(file: ServedFile | undefined): WebFile {
  return file ? { kind: 'file', body: file.body, type: file.type } : { kind: 'missing' };
}

export function createWebFiles(): WebFiles {
  return EMBEDDED === null ? new DiskWebFiles() : new EmbeddedWebFiles(EMBEDDED);
}
