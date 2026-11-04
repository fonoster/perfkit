/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { expect } from "chai";
import { join } from "node:path";
import sinon from "sinon";
import { ValidationError } from "../../src/errors/ValidationError.js";
import { createRenderSite } from "../../src/render/createRenderSite.js";
import { loadReport } from "../fixtures.js";
import {
  loadHistory,
  makeDeps,
  renderSite,
  RUNS_14,
  RUNS_4,
  runRender
} from "./site.js";

const PASSED_ID = "20261103T141210Z-bd3254a";
const FAILED_ID = "20261020T100005Z-c0b54ab";
const HISTORY_URL = "https://routr.io/benchmarks/runs.json";

describe("perfkit render", () => {
  afterEach(() => sinon.restore());

  it("should write the Contract's files and lines", async () => {
    // Arrange
    const memory = {
      "report.json": loadReport("passed"),
      "pages/runs.json": loadHistory(RUNS_14)
    };

    // Act
    const result = await runRender(
      [
        "render",
        "--report",
        "report.json",
        "--history",
        "pages/runs.json",
        "--out",
        "out/benchmarks"
      ],
      memory
    );

    // Assert
    expect(result.code).to.equal(0);
    expect(result.err).to.equal("");
    expect(result.out).to.equal(
      [
        `wrote ${join("out/benchmarks", "index.html")} (latest: ${PASSED_ID})`,
        `wrote ${join("out/benchmarks/runs", PASSED_ID, "index.html")}`,
        `wrote ${join("out/benchmarks/runs", PASSED_ID, "report.json")}`,
        `wrote ${join("out/benchmarks", "runs.json")} (14 runs)`,
        ""
      ].join("\n")
    );
  });

  it("should print the warning and render without deltas when there is no history", async () => {
    // Act
    const result = await runRender(
      ["render", "--report", "report.json", "--out", "out"],
      { "report.json": loadReport("passed") }
    );

    // Assert
    expect(result.code).to.equal(0);
    expect(result.err).to.equal(
      "perfkit: no history: first run, deltas omitted\n"
    );
    expect(result.out).to.contain("(1 run)");
  });

  it("should exit 2 with validate's lines for an invalid report", async () => {
    // Arrange
    const report = loadReport("passed");
    delete report.benchmarks[0].verdict;

    // Act
    const result = await runRender(
      ["render", "--report", "bad.json", "--out", "out"],
      { "bad.json": report }
    );

    // Assert
    expect(result.code).to.equal(2);
    expect(result.err).to.equal("bad.json: benchmarks[0].verdict: required\n");
    expect(result.out).to.equal("");
    expect(result.written.size).to.equal(0);
  });

  it("should exit 2 when --report is not a report", async () => {
    // Act
    const result = await runRender(
      ["render", "--report", "runs.json", "--out", "out"],
      { "runs.json": loadHistory(RUNS_4) }
    );

    // Assert
    expect(result.code).to.equal(2);
    expect(result.err).to.equal(
      "runs.json: expected a perfkit/report/v1 report; got perfkit/runs/v1\n"
    );
  });

  it("should exit 2 with the history's lines for an invalid history", async () => {
    // Arrange
    const history = loadHistory(RUNS_4);
    history.runs[0].version = "";

    // Act
    const result = await runRender(
      ["render", "--report", "r.json", "--history", "h.json", "--out", "o"],
      { "r.json": loadReport("passed"), "h.json": history }
    );

    // Assert
    expect(result.code).to.equal(2);
    expect(result.err).to.equal("h.json: runs[0].version: must not be empty\n");
    expect(result.written.size).to.equal(0);
  });

  it("should exit 1 without --out", async () => {
    // Act
    const result = await runRender(["render", "--report", "r.json"], {});

    // Assert
    expect(result.code).to.equal(1);
  });

  describe("with an https history URL", () => {
    it("should read the history it answers", async () => {
      // Arrange
      const fetchText = sinon.stub().resolves({
        status: 200,
        text: JSON.stringify(loadHistory(RUNS_14))
      });

      // Act
      const result = await runRender(
        [
          "render",
          "--report",
          "r.json",
          "--history",
          HISTORY_URL,
          "--out",
          "o"
        ],
        { "r.json": loadReport("passed") },
        fetchText
      );

      // Assert
      expect(fetchText).to.have.been.calledOnceWithExactly(HISTORY_URL);
      expect(result.code).to.equal(0);
      expect(result.out).to.contain("(14 runs)");
    });

    it("should treat a 404 as no history", async () => {
      // Arrange
      const fetchText = sinon.stub().resolves({ status: 404, text: "" });

      // Act
      const result = await runRender(
        [
          "render",
          "--report",
          "r.json",
          "--history",
          HISTORY_URL,
          "--out",
          "o"
        ],
        { "r.json": loadReport("passed") },
        fetchText
      );

      // Assert
      expect(result.code).to.equal(0);
      expect(result.err).to.equal(
        "perfkit: no history: first run, deltas omitted\n"
      );
      expect(result.out).to.contain("(1 run)");
    });

    it("should exit 3 on any other HTTP status", async () => {
      // Arrange
      const fetchText = sinon.stub().resolves({ status: 503, text: "" });

      // Act
      const result = await runRender(
        [
          "render",
          "--report",
          "r.json",
          "--history",
          HISTORY_URL,
          "--out",
          "o"
        ],
        { "r.json": loadReport("passed") },
        fetchText
      );

      // Assert
      expect(result.code).to.equal(3);
      expect(result.err).to.equal(
        `perfkit: cannot fetch ${HISTORY_URL}: HTTP 503\n`
      );
      expect(result.written.size).to.equal(0);
    });

    it("should exit 3 on a network error", async () => {
      // Arrange
      const fetchText = sinon
        .stub()
        .rejects(new Error("getaddrinfo ENOTFOUND"));

      // Act
      const result = await runRender(
        [
          "render",
          "--report",
          "r.json",
          "--history",
          HISTORY_URL,
          "--out",
          "o"
        ],
        { "r.json": loadReport("passed") },
        fetchText
      );

      // Assert
      expect(result.code).to.equal(3);
      expect(result.err).to.equal(
        `perfkit: cannot fetch ${HISTORY_URL}: getaddrinfo ENOTFOUND\n`
      );
    });
  });

  it("should not write index.html for a report older than the newest in history", async () => {
    // Act
    const site = await renderSite(loadReport("failed"), loadHistory(RUNS_4));

    // Assert
    expect([...site.written.keys()]).to.deep.equal([
      join("out", "runs", FAILED_ID, "index.html"),
      join("out", "runs", FAILED_ID, "report.json"),
      join("out", "runs.json")
    ]);
    expect(site.result.ok && site.result.written[0]?.note).to.equal(null);
  });

  it("should list a report rendered twice once", async () => {
    // Arrange
    const first = await renderSite(loadReport("passed"));

    // Act
    const second = await renderSite(loadReport("passed"), first.runs());

    // Assert
    const ids = second.runs().runs.map((run: { id: string }) => run.id);
    expect(ids).to.deep.equal([PASSED_ID]);
  });

  it("should insert the run at its startedAt position", async () => {
    // Act
    const site = await renderSite(
      loadReport("aborted-soak"),
      loadHistory(RUNS_4)
    );

    // Assert
    expect(
      site.runs().runs.map((run: { version: string }) => run.version)
    ).to.deep.equal(["2.31.6", "2.31.5", "2.31.4", "2.31.3", "2.31.0"]);
  });

  it("should copy the report.json as read", async () => {
    // Arrange
    const text = `${JSON.stringify(loadReport("passed"))}\n`;
    const { deps, written } = makeDeps({ "r.json": text });

    // Act
    await createRenderSite(deps)({ report: "r.json", out: "o" });

    // Assert
    expect(written.get(join("o", "runs", PASSED_ID, "report.json"))).to.equal(
      text
    );
  });

  it("should throw ValidationError and write nothing when out is missing", async () => {
    // Arrange
    const { deps } = makeDeps();
    const writeFile = sinon.spy(deps, "writeFile");
    const readFile = sinon.spy(deps, "readFile");

    // Act
    const error = await createRenderSite(deps)({ report: "r.json" }).then(
      () => null,
      (err: unknown) => err
    );

    // Assert
    expect(error).to.be.instanceOf(ValidationError);
    expect(writeFile.called).to.equal(false);
    expect(readFile.called).to.equal(false);
  });
});
