/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { expect } from "chai";
import { join } from "node:path";
import sinon from "sinon";
import { ValidationError } from "../../src/errors/ValidationError.js";
import { createRenderSite } from "../../src/render/createRenderSite.js";
import { type Json, loadReport } from "../fixtures.js";
import {
  APP_STUB,
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
    const runIds = loadHistory(RUNS_14).runs.map((run: Json) => run.id);
    expect(result.out).to.equal(
      [
        `wrote ${join("out/benchmarks/app/9.8.7/app.js")} (perfkit 9.8.7)`,
        `wrote ${join("out/benchmarks/data/runs", PASSED_ID, "report.json")}`,
        `wrote ${join("out/benchmarks/runs", PASSED_ID, "report.json")}`,
        `wrote ${join("out/benchmarks/data/runs.json")} (14 runs)`,
        `wrote ${join("out/benchmarks/data/site.json")} (no live URL)`,
        `wrote ${join("out/benchmarks", "index.html")} (latest: ${PASSED_ID})`,
        ...runIds.map(
          (id: string) =>
            `wrote ${join("out/benchmarks/runs", id, "index.html")}`
        ),
        ""
      ].join("\n")
    );
  });

  it("should write the app, this run's data and a shell per run, and never another report", async () => {
    // Act
    const site = await renderSite(loadReport("failed"), loadHistory(RUNS_4));

    // Assert
    const reports = [...site.written.keys()].filter((path) =>
      path.endsWith("report.json")
    );
    expect(reports).to.deep.equal([
      join("out", "data", "runs", FAILED_ID, "report.json"),
      join("out", "runs", FAILED_ID, "report.json")
    ]);
    expect(site.written.get(join("out", "app", "9.8.7", "app.js"))).to.equal(
      APP_STUB
    );
    const shells = [...site.written.keys()].filter((path) =>
      path.endsWith("index.html")
    );
    expect(shells).to.have.length(1 + site.runs().runs.length);
  });

  it("should put the report's favicon in every shell", async () => {
    // Arrange
    const report = loadReport("failed");
    report.project.faviconSvg = '<svg xmlns="http://www.w3.org/2000/svg"/>';

    // Act
    const site = await renderSite(report, loadHistory(RUNS_4));

    // Assert
    const shells = [...site.written.entries()].filter(([path]) =>
      path.endsWith("index.html")
    );
    expect(shells).to.have.length(1 + site.runs().runs.length);
    shells.forEach(([, html]) =>
      expect(html).to.contain(
        `<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,${encodeURIComponent(report.project.faviconSvg)}">`
      )
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

  it("should point index.html at the newest run for a report older than the newest in history", async () => {
    // Act
    const site = await renderSite(loadReport("failed"), loadHistory(RUNS_4));

    // Assert
    const latest = site.result.ok
      ? site.result.written.find(
          ({ path }) => path === join("out", "index.html")
        )
      : undefined;
    expect(latest?.note).to.equal(`latest: ${PASSED_ID}`);
    expect(site.written.get(join("out", "index.html"))).to.contain(
      "<title>Routr benchmarks · v2.31.5</title>"
    );
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
    expect(
      written.get(join("o", "data", "runs", PASSED_ID, "report.json"))
    ).to.equal(text);
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
