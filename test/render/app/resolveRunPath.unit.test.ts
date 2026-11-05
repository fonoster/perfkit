/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { expect } from "chai";
import { resolveRunPath } from "../../../src/render/app/resolveRunPath.js";

describe("resolveRunPath", () => {
  it("should read the site root as the latest run", () => {
    expect(resolveRunPath("")).to.deep.equal({ page: "latest" });
    expect(resolveRunPath("index.html")).to.deep.equal({ page: "latest" });
  });

  it("should read runs/<id>/ as that run, with or without index.html", () => {
    const run = { page: "run", id: "20261103T141210Z-bd3254a" };
    expect(resolveRunPath("runs/20261103T141210Z-bd3254a/")).to.deep.equal(run);
    expect(
      resolveRunPath("runs/20261103T141210Z-bd3254a/index.html")
    ).to.deep.equal(run);
  });

  it("should return null for any other path", () => {
    ["runs/", "runs/x", "runs/x/y/", "data/runs.json", "other.html"].forEach(
      (path) => expect(resolveRunPath(path), path).to.equal(null)
    );
  });
});
