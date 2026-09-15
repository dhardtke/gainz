/** Marks a string as already-safe HTML so `html` will not escape it again. */
export class RawHtml {
  constructor(readonly value: string) {}

  toString(): string {
    return this.value;
  }
}

/** Wraps pre-rendered markup (usually the output of another `html` call). */
export const raw = (value: unknown): RawHtml => new RawHtml(String(value));

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(value: unknown): string {
  return String(value).replace(/[&<>"']/g, (char) => ESCAPES[char] ?? char);
}

function interpolate(value: unknown): string {
  if (value === null || value === undefined || value === false) {
    return '';
  }
  if (value instanceof RawHtml) {
    return value.value;
  }
  if (Array.isArray(value)) {
    return value.map(interpolate).join('');
  }
  return escapeHtml(value);
}

/**
 * Tagged template that escapes every interpolated value. Anything a user typed
 * — an exercise name, a set note — is therefore safe to drop straight in.
 */
export function html(strings: TemplateStringsArray, ...values: unknown[]): RawHtml {
  let out = strings[0] ?? '';
  for (let i = 0; i < values.length; i++) {
    out += interpolate(values[i]) + (strings[i + 1] ?? '');
  }
  return raw(out);
}
