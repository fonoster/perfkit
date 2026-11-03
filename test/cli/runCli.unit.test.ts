/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { expect } from "chai";
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stringify } from "yaml";
import { runCli } from "../../src/cli/runCli.js";
import {
  EXAMPLES,
  type Json,
  loadConfig,
  loadReport,
  REPORT_FORMS,
  ROUTR_CONFIG
} from "../fixtures.js";
import { infraDeps } from "../infra/fakes.js";

const KNOWN =
  "this perfkit reads perfkit/v1, perfkit/report/v1, perfkit/runs/v1";

/**
 * Runs the CLI in process. Files in `memory` are served from it, by the exact
 * name given on the command line; anything else is read from disk.
 */
async function run(args: string[], memory: Record<string, Json> = {}) {
  const out: string[] = [];
  const err: string[] = [];
  const text = (value: Json) =>
    typeof value === "string" ? value : JSON.stringify(value);
  const code = await runCli(["node", "perfkit", ...args], {
    version: "9.8.7",
    stdout: (line) => out.push(line),
    stderr: (line) => err.push(line),
    readFile: async (path) =>
      path in memory ? text(memory[path]) : readFile(path, "utf8"),
    isFile: async (path) =>
      Object.keys(memory).length > 0
        ? true
        : stat(path).then(
            (s) => s.isFile(),
            () => false
          ),
    infra: infraDeps()
  });
  return { code, out: out.join(""), err: err.join("") };
}

describe("perfkit validate", () => {
  describe("with valid files", () => {
    it("should accept examples/routr/perfkit.yaml with exit 0", async () => {
      const result = await run(["validate", ROUTR_CONFIG]);
      expect(result).to.deep.equal({
        code: 0,
        out: `${ROUTR_CONFIG}: valid perfkit/v1 config, 2 benchmarks\n`,
        err: ""
      });
    });

    it("should print the Contract's line for perf/perfkit.yaml", async () => {
      const result = await run(["validate", "perf/perfkit.yaml"], {
        "perf/perfkit.yaml": readFileSync(ROUTR_CONFIG, "utf8")
      });
      expect(result.out).to.equal(
        "perf/perfkit.yaml: valid perfkit/v1 config, 2 benchmarks\n"
      );
      expect(result.code).to.equal(0);
    });

    REPORT_FORMS.forEach((form) => {
      it(`should accept the ${form} report with exit 0`, async () => {
        const file = join(EXAMPLES, "reports", `${form}.json`);
        const result = await run(["validate", file]);
        expect(result).to.deep.equal({
          code: 0,
          out: `${file}: valid perfkit/report/v1 report, 2 benchmarks\n`,
          err: ""
        });
      });
    });

    it("should accept runs.json with exit 0", async () => {
      const file = join(EXAMPLES, "runs.json");
      const result = await run(["validate", file]);
      expect(result).to.deep.equal({
        code: 0,
        out: `${file}: valid perfkit/runs/v1 index, 4 runs\n`,
        err: ""
      });
    });

    it("should accept a capacity report with limitCps null and limitIsLowerBound false", async () => {
      // Arrange
      const report = loadReport("passed");
      Object.assign(report.benchmarks[0].headline, {
        limitCps: null,
        limitIsLowerBound: false,
        p99AtLimitMs: null,
        p50AtLimitMs: null,
        failedAtLimitPct: null,
        retransmissionsAtLimitPct: null
      });

      // Act
      const result = await run(["validate", "report.json"], {
        "report.json": report
      });

      // Assert
      expect(result.code).to.equal(0);
    });
  });

  describe("with an invalid report", () => {
    it("should print the Contract's lines and exit 2", async () => {
      // Arrange
      const report = loadReport("passed");
      report.benchmarks[1].verdict = "ok";
      delete report.run.commit;

      // Act
      const result = await run(["validate", "report.json"], {
        "report.json": report
      });

      // Assert
      expect(result).to.deep.equal({
        code: 2,
        out: "",
        err:
          'report.json: benchmarks[1].verdict: expected one of passed, failed, inconclusive, aborted, not-run; got "ok"\n' +
          "report.json: run.commit: required\n"
      });
    });

    it('should reject verdict "ok"', async () => {
      const report = loadReport("passed");
      report.benchmarks[1].verdict = "ok";
      const result = await run(["validate", "report.json"], {
        "report.json": report
      });
      expect(result.code).to.equal(2);
      expect(result.err).to.equal(
        'report.json: benchmarks[1].verdict: expected one of passed, failed, inconclusive, aborted, not-run; got "ok"\n'
      );
    });

    it("should reject a report missing run.commit", async () => {
      const report = loadReport("passed");
      delete report.run.commit;
      const result = await run(["validate", "report.json"], {
        "report.json": report
      });
      expect(result.code).to.equal(2);
      expect(result.err).to.equal("report.json: run.commit: required\n");
    });

    it("should reject an unknown kind", async () => {
      const report = loadReport("passed");
      report.benchmarks[0].kind = "spike";
      const result = await run(["validate", "report.json"], {
        "report.json": report
      });
      expect(result.code).to.equal(2);
      expect(result.err).to.equal(
        'report.json: benchmarks[0].kind: expected one of capacity, soak; got "spike"\n'
      );
    });

    it('should reject schema "perfkit/report/v9"', async () => {
      const report = loadReport("passed");
      report.schema = "perfkit/report/v9";
      const result = await run(["validate", "old.json"], {
        "old.json": report
      });
      expect(result).to.deep.equal({
        code: 2,
        out: "",
        err: `old.json: unknown schema "perfkit/report/v9"; ${KNOWN}\n`
      });
    });

    it("should report an unreadable file with exit 2", async () => {
      const result = await run(["validate", join(EXAMPLES, "missing.json")]);
      expect(result).to.deep.equal({
        code: 2,
        out: "",
        err: `${join(EXAMPLES, "missing.json")}: cannot read: no such file\n`
      });
    });
  });

  describe("with an invalid perfkit.yaml", () => {
    let dir: string;

    beforeEach(() => {
      dir = mkdtempSync(join(tmpdir(), "perfkit-"));
      cpSync(join(EXAMPLES, "routr"), dir, { recursive: true });
    });

    afterEach(() => {
      rmSync(dir, { recursive: true, force: true });
    });

    async function validateEdited(edit: (config: Json) => void) {
      const config = loadConfig();
      edit(config);
      const file = join(dir, "perfkit.yaml");
      writeFileSync(file, stringify(config));
      return { file, result: await run(["validate", file]) };
    }

    it("should name rate.cps in a soak benchmark without it", async () => {
      const { file, result } = await validateEdited(
        (c) => delete c.benchmarks[1].load.rate.cps
      );
      expect(result.code).to.equal(2);
      expect(result.err).to.equal(
        `${file}: benchmarks[1].load.rate.cps: required\n`
      );
    });

    it("should name a duplicate id", async () => {
      const { file, result } = await validateEdited(
        (c) => (c.benchmarks[1].id = "edgeport-echo")
      );
      expect(result.code).to.equal(2);
      expect(result.err).to.equal(
        `${file}: benchmarks[1].id: duplicate id "edgeport-echo"; benchmarks[0] already uses it\n`
      );
    });

    it("should name a missing compose file", async () => {
      // Arrange
      rmSync(join(dir, "edgeport-echo", "compose.yaml"));

      // Act
      const { file, result } = await validateEdited(() => undefined);

      // Assert
      expect(result.code).to.equal(2);
      expect(result.err).to.equal(
        `${file}: benchmarks[0].uut.compose: file not found: edgeport-echo/compose.yaml\n`
      );
    });

    it("should name rate.max in a capacity benchmark without it", async () => {
      const { file, result } = await validateEdited(
        (c) => delete c.benchmarks[0].load.rate.max
      );
      expect(result.code).to.equal(2);
      expect(result.err).to.equal(
        `${file}: benchmarks[0].load.rate.max: required\n`
      );
    });
  });

  describe("help, version and usage", () => {
    it("should list the formats in validate --help", async () => {
      const result = await run(["validate", "--help"]);
      expect(result.code).to.equal(0);
      expect(result.out).to.include("perfkit/v1 ");
      expect(result.out).to.include("perfkit/report/v1 ");
      expect(result.out).to.include("perfkit/runs/v1 ");
      expect(result.out).to.include("2  the file is invalid");
    });

    it("should list the formats in --help", async () => {
      const result = await run(["--help"]);
      expect(result.code).to.equal(0);
      expect(result.out).to.include("validate");
      expect(result.out).to.include("perfkit/report/v1");
    });

    it("should print perfkit's version", async () => {
      const result = await run(["--version"]);
      expect(result).to.deep.equal({ code: 0, out: "9.8.7\n", err: "" });
    });

    it("should exit 1 without a file", async () => {
      const result = await run(["validate"]);
      expect(result.code).to.equal(1);
      expect(result.err).to.include("missing required argument 'file'");
    });
  });
});
