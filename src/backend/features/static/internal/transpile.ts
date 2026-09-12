/**
 * Turns the TypeScript frontend into the JavaScript a browser can run.
 *
 * Bun's transpiler only erases types — it does not resolve or rewrite import
 * specifiers — so `import "./format.ts"` reaches the browser unchanged and asks
 * for the file that actually exists on disk. That is what keeps this a
 * transformation rather than a build: no bundle, no output directory, and one
 * module per file at the URL its source lives at.
 *
 * Types are erased, not checked. `bun run typecheck` is the gate; a type error
 * transpiles happily and ships.
 */
const transpiler = new Bun.Transpiler({ loader: 'ts', target: 'browser' });

/**
 * Transpiles one module. `path` has already been resolved inside `src/frontend/` by
 * `StaticController`, through the traversal guard in `paths.ts`.
 */
export async function transpileModule(path: string): Promise<string | null> {
  const source = await Bun.file(path).text();

  try {
    return transpiler.transformSync(source);
  } catch (cause) {
    // A syntax error would otherwise reach the browser as a blank view, so name
    // the file and let gz-app's failed-import path put it in a toast.
    console.error(`gainz: could not transpile ${path}`, cause);
    return null;
  }
}
