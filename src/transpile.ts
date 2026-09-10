import { basename } from "node:path";

/**
 * Serves the TypeScript frontend as the JavaScript a browser can run.
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
const transpiler = new Bun.Transpiler({ loader: "ts", target: "browser" });

/**
 * Transpiles one module. `path` has already been resolved inside `frontend/` by
 * the caller, which is where the traversal guard lives.
 */
export async function transpileModule(path: string): Promise<Response> {
  const source = await Bun.file(path).text();

  let code: string;
  try {
    code = transpiler.transformSync(source);
  } catch (cause) {
    // A syntax error would otherwise reach the browser as a blank view, so name
    // the file and let gz-app's failed-import path put it in a toast.
    console.error(`gainz: could not transpile ${path}`, cause);
    return new Response(`Could not transpile ${basename(path)}`, { status: 500 });
  }

  return new Response(code, {
    headers: { "Content-Type": "text/javascript;charset=utf-8", "Cache-Control": "no-cache" },
  });
}
