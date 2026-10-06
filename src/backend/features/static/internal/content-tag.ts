/**
 * A served body's content hash: its ETag, quoted, and the `v` of its versioned URL (see `page.ts`).
 * Both must come from here, or a page would name a version its file's response never matches.
 */
export function contentTag(body: string | Uint8Array<ArrayBuffer>): string {
  return Bun.hash(body).toString(36);
}
