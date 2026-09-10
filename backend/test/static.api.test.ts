import { describe, expect, test } from "bun:test";
import { unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { useServer } from "./helpers/server";

const { api } = useServer();

describe("static files", () => {
  test("serves the frontend at the root", async () => {
    const res = await api("/");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(await res.text()).toContain("gainz");
  });

  test("rejects directory traversal below frontend/", async () => {
    const res = await api("/../package.json");
    expect(res.status).toBe(404);
  });

  test("serves the app stylesheets", async () => {
    for (const path of ["/css/app.css", "/css/shared.css", "/components/gz-app/gz-app.css"]) {
      const res = await api(path);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/css");
    }
  });

  test("serves Pico from node_modules at a fixed vendor path", async () => {
    const res = await api("/vendor/pico.css");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/css");
    expect(await res.text()).toContain("Pico CSS");
  });

  test("exposes only the allowlisted vendor file, not node_modules", async () => {
    expect((await api("/vendor/pico.scss")).status).toBe(404);
    expect((await api("/node_modules/@picocss/pico/package.json")).status).toBe(404);
  });
});

describe("typescript modules", () => {
  test("serves a .ts module as JavaScript with its types erased", async () => {
    const res = await api("/js/format.ts");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/javascript");

    const body = await res.text();
    expect(body).toContain("export const UNIT");
    // The source annotates every export; none of that may reach the browser.
    expect(body).not.toContain(": string");
    expect(body).not.toContain("| null | undefined");
  });

  test("leaves import specifiers alone, so a URL names a real file", async () => {
    const body = await (await api("/components/gz-chart/gz-chart.ts")).text();
    expect(body).toContain('from "../../js/format.ts"');
  });

  test("serves the entry point index.html names", async () => {
    const page = await (await api("/")).text();
    expect(page).toContain('src="/js/main.ts"');

    const res = await api("/js/main.ts");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/javascript");
    expect(await res.text()).toContain("../components/gz-app/gz-app.ts");
  });

  test("erases a types-only module to nothing the browser runs", async () => {
    const body = await (await api("/js/types.ts")).text();
    // Every declaration in types.ts is a type, so nothing survives erasure. The
    // browser never asks for it either — see the type-only import test below.
    expect(body.trim()).toBe("");
  });

  test("strips type-only imports, so types.ts is never fetched at runtime", async () => {
    const body = await (await api("/components/gz-set-row/gz-set-row.ts")).text();
    expect(body).not.toContain("js/types.ts");
  });

  test("keeps the load-bearing top-level await that pairs a module with its CSS", async () => {
    const body = await (await api("/components/gz-chart/gz-chart.ts")).text();
    expect(body).toContain('await define("gz-chart"');
  });

  test("answers HEAD with the headers and no body", async () => {
    const res = await api("/js/format.ts", { method: "HEAD" });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/javascript");
    expect(await res.text()).toBe("");
  });

  test("returns 404 for a .ts file that does not exist", async () => {
    expect((await api("/js/nope.ts")).status).toBe(404);
  });

  test("refuses to transpile anything outside frontend/", async () => {
    // Encoded, so the URL parser cannot normalise the traversal away before
    // resolveStaticPath sees it.
    expect((await api("/%2e%2e/backend/src/server.ts")).status).toBe(404);
    expect((await api("/%2e%2e/backend/src/transpile.ts")).status).toBe(404);
  });

  test("reports a module that will not parse", async () => {
    const broken = resolve(import.meta.dir, "..", "..", "frontend", "js", "__broken.ts");
    await Bun.write(broken, "export const oops: = ;\n");
    try {
      const res = await api("/js/__broken.ts");
      expect(res.status).toBe(500);
      expect(await res.text()).toContain("__broken.ts");
    } finally {
      await unlink(broken);
    }
  });
});
