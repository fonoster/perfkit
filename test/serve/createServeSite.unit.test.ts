/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { expect } from "chai";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ValidationError } from "../../src/errors/index.js";
import { contentTypeOf } from "../../src/serve/contentTypeOf.js";
import { createNodeServeSite } from "../../src/serve/createNodeServeSite.js";
import { createServeSite } from "../../src/serve/createServeSite.js";

const SITE: Record<string, string> = {
  "index.html": "<p>latest</p>",
  "runs/abc/index.html": "<p>run</p>",
  "app/1.0.0/app.js": "app()",
  "data/runs.json": "{}"
};
const DIRS = new Set(["runs", "runs/abc", "app", "app/1.0.0", "data"]);

const serve = createServeSite({
  readSiteFile: async (path) => SITE[path] ?? null,
  isSiteDir: async (path) => DIRS.has(path)
});
const get = (url: string, method = "GET") =>
  serve({ method, url, origin: null });

describe("createServeSite", () => {
  it("should serve the site root and a run's page from their index.html", async () => {
    const root = await get("/?live=http://localhost:8787/live.json");
    const run = await get("/runs/abc/");
    expect([root.status, root.body]).to.deep.equal([200, "<p>latest</p>"]);
    expect(root.headers).to.deep.include({
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-cache"
    });
    expect(run.body).to.equal("<p>run</p>");
  });

  it("should serve files with their content type, and HEAD without a body", async () => {
    expect((await get("/app/1.0.0/app.js")).headers["Content-Type"]).to.equal(
      "text/javascript; charset=utf-8"
    );
    const head = await get("/data/runs.json", "HEAD");
    expect([head.status, head.body]).to.deep.equal([200, ""]);
  });

  it("should redirect a directory without its slash", async () => {
    const response = await get("/runs/abc");
    expect(response.status).to.equal(301);
    expect(response.headers.Location).to.equal("/runs/abc/");
  });

  it("should answer 404 for a missing file, a path out of the site or another method", async () => {
    const responses = await Promise.all([
      get("/nope.html"),
      get("/../secret"),
      get("/runs/%2e%2e/%2e%2e/secret"),
      get("/index.html", "POST")
    ]);
    expect(responses.map((r) => r.status)).to.deep.equal([404, 404, 404, 404]);
  });

  it("should throw ValidationError for a request without a URL", async () => {
    let error: unknown;
    await serve({ method: "GET", url: "", origin: null }).catch(
      (err: unknown) => {
        error = err;
      }
    );
    expect(error).to.be.instanceOf(ValidationError);
  });
});

describe("createNodeServeSite", () => {
  it("should serve a directory on disk", async () => {
    // Arrange
    const dir = await mkdtemp(join(tmpdir(), "perfkit-serve-"));
    await mkdir(join(dir, "runs", "abc"), { recursive: true });
    await writeFile(join(dir, "index.html"), "root");
    await writeFile(join(dir, "runs", "abc", "index.html"), "run");
    const handle = createNodeServeSite(dir);

    // Act
    const [root, run, redirect, missing] = await Promise.all(
      ["/", "/runs/abc/", "/runs/abc", "/x.json"].map((url) =>
        handle({ method: "GET", url, origin: null })
      )
    );

    // Assert
    expect(root?.body).to.equal("root");
    expect(run?.body).to.equal("run");
    expect(redirect?.status).to.equal(301);
    expect(missing?.status).to.equal(404);
  });
});

describe("contentTypeOf", () => {
  it("should know the site's file types", () => {
    expect(contentTypeOf("a.json")).to.equal("application/json; charset=utf-8");
    expect(contentTypeOf("a.svg")).to.equal("image/svg+xml");
    expect(contentTypeOf("a.bin")).to.equal("application/octet-stream");
  });
});
