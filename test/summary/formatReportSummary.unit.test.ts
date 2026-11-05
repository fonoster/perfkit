/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { expect } from "chai";
import { reportSchema } from "../../src/schemas/index.js";
import { formatReportSummary } from "../../src/summary/formatReportSummary.js";
import { loadReport, REPORT_FORMS } from "../fixtures.js";

const parsed = (form: (typeof REPORT_FORMS)[number]) =>
  reportSchema.parse(loadReport(form));

describe("formatReportSummary", () => {
  it("should open with the run id, target version, commit and verdict", () => {
    // Act
    const text = formatReportSummary(parsed("failed"));

    // Assert
    expect(text.split("\n").slice(0, 5)).to.deep.equal([
      "## perfkit run 20261020T100005Z-c0b54ab",
      "",
      "**Routr 2.31.3**, commit `c0b54abe09d1`. **0 of 2 benchmarks passed** (2 failed).",
      "",
      "Started 2026-10-20T10:00:05Z, ended 2026-10-20T16:41:30Z; digitalocean nyc3, server under test c-8, load generator c-16; perfkit 0.1.0."
    ]);
    expect(text.endsWith("\n")).to.equal(true);
  });

  it("should give each benchmark a heading with its verdict", () => {
    // Act
    const text = formatReportSummary(parsed("failed"));

    // Assert
    expect(text).to.include(
      "### EdgePort + Echo (`edgeport-echo`): failed\n\nCapacity benchmark, 1 min, SIPp 3.7.3, UDP."
    );
    expect(text).to.include(
      "### RoutrOne, six hours (`one-soak`): failed\n\nSoak benchmark, 6 h 30 min, SIPp 3.7.3, UDP; OpenTelemetry."
    );
    expect(text).to.include(
      "| Memory growth, one | +7.4 MB/h | 5 MB/h | failed |"
    );
  });

  it("should give the reason of an aborted and a not-run benchmark", () => {
    // Act
    const text = formatReportSummary(parsed("not-run"));

    // Assert
    expect(text).to.include("(1 aborted, 1 not run)");
    expect(text).to.include(
      "### EdgePort + Echo (`edgeport-echo`): aborted\n\nCapacity benchmark, 4 min, SIPp 3.7.3, UDP.\n\n**Aborted:** the server under test stopped responding."
    );
    expect(text).to.include(
      "### RoutrOne, six hours (`one-soak`): not run\n\nSoak benchmark.\n\n**Not run:** the run was aborted before this benchmark started.\n"
    );
  });

  it("should give the reason of an inconclusive benchmark", () => {
    // Act
    const text = formatReportSummary(parsed("inconclusive"));

    // Assert
    expect(text).to.include(
      "**Inconclusive:** load generator saturated at 1,300 messages/s (SIPp at 93% of one core)."
    );
  });

  it("should not list other counts when every benchmark passed", () => {
    // Act
    const text = formatReportSummary(parsed("passed"));

    // Assert
    expect(text).to.include("**2 of 2 benchmarks passed**.");
  });
});
