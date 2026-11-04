/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { expect } from "chai";
import { reportSchema } from "../../src/schemas/index.js";
import { loadReport, REPORT_FORMS } from "../fixtures.js";
import { errorsOf } from "./check.js";

describe("reportSchema", () => {
  describe("with the committed fixtures", () => {
    REPORT_FORMS.forEach((form) => {
      it(`should accept the ${form} report`, () => {
        expect(errorsOf(reportSchema, loadReport(form))).to.deep.equal([]);
      });
    });

    it("should accept a capacity headline with limitCps null and limitIsLowerBound false", () => {
      // Arrange
      const report = loadReport("failed");
      const capacity = report.benchmarks[0];

      // Assert
      expect(capacity.headline.limitCps).to.equal(null);
      expect(capacity.headline.limitIsLowerBound).to.equal(false);
      expect(errorsOf(reportSchema, report)).to.deep.equal([]);
    });

    it("should accept a lower-bound limit with stoppedBy null", () => {
      const report = loadReport("passed");
      report.benchmarks[0].headline.limitIsLowerBound = true;
      report.benchmarks[0].stoppedBy = null;
      expect(errorsOf(reportSchema, report)).to.deep.equal([]);
    });

    it("should accept a report without logoSvg, hops or otelcol", () => {
      const report = loadReport("passed");
      delete report.project.logoSvg;
      delete report.benchmarks[1].hops;
      delete report.run.tools.otelcol;
      expect(errorsOf(reportSchema, report)).to.deep.equal([]);
    });
  });

  describe("with an invalid report", () => {
    it('should reject verdict "ok" with the Contract\'s message', () => {
      const report = loadReport("passed");
      report.benchmarks[1].verdict = "ok";
      expect(errorsOf(reportSchema, report)).to.deep.equal([
        'benchmarks[1].verdict: expected one of passed, failed, inconclusive, aborted, not-run; got "ok"'
      ]);
    });

    it("should require run.commit", () => {
      const report = loadReport("passed");
      delete report.run.commit;
      expect(errorsOf(reportSchema, report)).to.deep.equal([
        "run.commit: required"
      ]);
    });

    it("should reject an unknown kind", () => {
      const report = loadReport("passed");
      report.benchmarks[0].kind = "spike";
      expect(errorsOf(reportSchema, report)).to.deep.equal([
        'benchmarks[0].kind: expected one of capacity, soak; got "spike"'
      ]);
    });

    it("should reject any field but the base ones on a not-run benchmark", () => {
      const report = loadReport("not-run");
      report.benchmarks[1].durationS = 0;
      report.benchmarks[1].rules = [];
      expect(errorsOf(reportSchema, report)).to.deep.equal([
        "benchmarks[1].durationS: unknown key",
        "benchmarks[1].rules: unknown key"
      ]);
    });

    it("should reject rules, headline and stoppedBy on an aborted benchmark", () => {
      const report = loadReport("not-run");
      const passed = loadReport("passed");
      report.benchmarks[0].rules = passed.benchmarks[0].rules;
      report.benchmarks[0].headline = passed.benchmarks[0].headline;
      report.benchmarks[0].stoppedBy = passed.benchmarks[0].stoppedBy;
      expect(errorsOf(reportSchema, report)).to.deep.equal([
        "benchmarks[0].headline: unknown key",
        "benchmarks[0].rules: unknown key",
        "benchmarks[0].stoppedBy: unknown key"
      ]);
    });

    it("should require the measured fields on a passed benchmark", () => {
      const report = loadReport("passed");
      ["durationS", "tool", "rules", "headline", "resources", "series", "stoppedBy"].forEach(
        (key) => delete report.benchmarks[0][key]
      );
      ["warmupS", "load", "reported"].forEach((key) => delete report.benchmarks[1][key]);
      expect(errorsOf(reportSchema, report)).to.deep.equal([
        "benchmarks[0].durationS: required",
        "benchmarks[0].headline: required",
        "benchmarks[0].resources: required",
        "benchmarks[0].rules: required",
        "benchmarks[0].series: required",
        "benchmarks[0].stoppedBy: required",
        "benchmarks[0].tool: required",
        "benchmarks[1].load: required",
        "benchmarks[1].reported: required",
        "benchmarks[1].warmupS: required"
      ]);
    });

    it("should reject capacity fields on a soak benchmark", () => {
      const report = loadReport("passed");
      report.benchmarks[1].series = report.benchmarks[0].series;
      report.benchmarks[1].stoppedBy = null;
      expect(errorsOf(reportSchema, report)).to.deep.equal([
        "benchmarks[1].series: unknown key",
        "benchmarks[1].stoppedBy: unknown key"
      ]);
    });

    it("should require stoppedBy null when limitIsLowerBound is true", () => {
      const report = loadReport("passed");
      report.benchmarks[0].headline.limitIsLowerBound = true;
      expect(errorsOf(reportSchema, report)).to.deep.equal([
        "benchmarks[0].stoppedBy: expected null when headline.limitIsLowerBound is true"
      ]);
    });

    it("should require the at-limit numbers null when limitCps is null", () => {
      const report = loadReport("failed");
      report.benchmarks[0].headline.p99AtLimitMs = 72;
      expect(errorsOf(reportSchema, report)).to.deep.equal([
        "benchmarks[0].headline.p99AtLimitMs: expected null when limitCps is null"
      ]);
    });

    it("should require a reason on inconclusive, aborted and not-run, and null otherwise", () => {
      const report = loadReport("not-run");
      report.benchmarks[0].reason = "The server under test stopped responding.";
      report.benchmarks[1].reason = null;
      const passed = loadReport("passed");
      passed.benchmarks[0].reason = "all good";
      expect(errorsOf(reportSchema, report)).to.deep.equal([
        'benchmarks[0].reason: expected a lowercase clause with no final period; got "The server under test stopped responding."',
        "benchmarks[1].reason: expected string; got null"
      ]);
      expect(errorsOf(reportSchema, passed)).to.deep.equal([
        'benchmarks[0].reason: expected null; got "all good"'
      ]);
    });

    it("should require the top verdict to count every benchmark", () => {
      const report = loadReport("passed");
      report.verdict.passed = 1;
      report.verdict.failed = 1;
      expect(errorsOf(reportSchema, report)).to.deep.equal([
        "verdict.failed: expected 0 to match benchmarks; got 1",
        "verdict.passed: expected 2 to match benchmarks; got 1"
      ]);
    });

    it("should require the verdict to agree with the rules", () => {
      const report = loadReport("passed");
      report.benchmarks[1].rules[0].passed = false;
      expect(errorsOf(reportSchema, report)).to.deep.equal([
        'benchmarks[1].verdict: expected failed, since a rule did not pass; got "passed"'
      ]);
    });

    it("should require the run id to come from startedAt and commit", () => {
      const report = loadReport("passed");
      report.run.id = "20261103T141210Z-0000000";
      expect(errorsOf(reportSchema, report)).to.deep.equal([
        'run.id: expected 20261103T141210Z-bd3254a, from startedAt and commit; got "20261103T141210Z-0000000"'
      ]);
    });

    it("should require run.tools.perfkit and sipp, and otelcol when there are hops", () => {
      const report = loadReport("passed");
      delete report.run.tools.perfkit;
      delete report.run.tools.sipp;
      delete report.run.tools.otelcol;
      expect(errorsOf(reportSchema, report)).to.deep.equal([
        "run.tools.perfkit: required",
        "run.tools.sipp: required"
      ]);
      report.run.tools.perfkit = "0.1.0";
      report.run.tools.sipp = "3.7.3";
      expect(errorsOf(reportSchema, report)).to.deep.equal([
        "run.tools.otelcol: required when a benchmark has hops"
      ]);
    });

    it("should require images pinned by digest", () => {
      const report = loadReport("passed");
      report.run.images.echo = "fonoster/routr-echo:2.31.5";
      expect(errorsOf(reportSchema, report)).to.deep.equal([
        'run.images.echo: expected an image pinned by digest, like name:tag@sha256:<64 hex>; got "fonoster/routr-echo:2.31.5"'
      ]);
    });

    it("should accept an image whose tag carries a suffix", () => {
      const report = loadReport("passed");
      report.run.images.edgeportGo = `fonoster/routr-edgeport:2.32.0-go-experimental@sha256:${"a".repeat(64)}`;
      expect(errorsOf(reportSchema, report)).to.deep.equal([]);
    });

    it("should reject unknown keys", () => {
      const report = loadReport("passed");
      report.run.infra.uut.disk = 100;
      report.benchmarks[0].series.steps[0].jitterMs = 1;
      expect(errorsOf(reportSchema, report)).to.deep.equal([
        "benchmarks[0].series.steps[0].jitterMs: unknown key",
        "run.infra.uut.disk: unknown key"
      ]);
    });
  });
});
