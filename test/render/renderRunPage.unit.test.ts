/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { expect } from "chai";
import { loadReport, REPORT_FORMS } from "../fixtures.js";
import { loadHistory, renderSite, RUNS_14, RUNS_4, textOf } from "./site.js";

const RUN_14_LATEST_DELTA_RUN = "Compared with v2.31.4, Oct 27, 2026";

describe("the report page", () => {
  describe("given a report with targets and a cluster", () => {
    it("should label each benchmark with its target, and old reports with none", async () => {
      // Arrange
      const report = loadReport("passed") as {
        run: { infra: Record<string, unknown> };
        benchmarks: Array<Record<string, unknown>>;
      };
      report.run.infra.cluster = {
        provider: "digitalocean",
        nodes: 3,
        size: "c-8",
        version: "1.33.1-do.0"
      };
      report.benchmarks[0]!.target = "server";
      report.benchmarks[1]!.target = "cluster";
      const labelled = await renderSite(report, loadHistory(RUNS_4));
      const old = await renderSite(loadReport("passed"), loadHistory(RUNS_4));

      // Act
      const $ = labelled.latest();
      const $old = old.latest();

      // Assert
      expect(textOf($, "#edgeport-echo .eyebrow")).to.equal(
        "01 · CAPACITY · Single server"
      );
      expect(textOf($, "#one-soak .eyebrow")).to.equal(
        "02 · SOAK · Kubernetes, 3 × c-8"
      );
      expect(textOf($old, "#edgeport-echo .eyebrow")).to.equal("01 · CAPACITY");
    });
  });

  describe("given a report with several load generators", () => {
    it("should list their count in the test setup", async () => {
      // Arrange
      const report = loadReport("passed") as {
        run: { infra: { loadgen: Record<string, unknown> } };
      };
      report.run.infra.loadgen.count = 2;
      const site = await renderSite(report, loadHistory(RUNS_4));
      const single = await renderSite(
        loadReport("passed"),
        loadHistory(RUNS_4)
      );

      // Act
      const setup = textOf(site.latest(), ".setup");
      const alone = textOf(single.latest(), ".setup");

      // Assert
      expect(setup).to.match(/Load generator\s*2 × /);
      expect(alone).to.not.match(/Load generator\s*\d+ × /);
    });
  });

  describe("given the passed fixture with history", () => {
    it("should show the verdict, two Passed pills, the date chip and the takeaway", async () => {
      // Arrange
      const site = await renderSite(loadReport("passed"), loadHistory(RUNS_4));

      // Act
      const $ = site.latest();

      // Assert
      expect(textOf($, ".hero .verdict")).to.equal("2 of 2 benchmarks passed");
      expect(
        $(".section-head .pill")
          .map((_, el) => $(el).text().trim())
          .get()
      ).to.deep.equal(["Passed", "Passed"]);
      expect(textOf($, ".chips")).to.contain("Ran Nov 3, 2026 · 14:12 UTC");
      expect(textOf($, "#edgeport-echo .takeaway")).to.equal(
        "EdgePort + Echo held 1,240 messages/s. At 1,300 messages/s p99 reached 62 ms (limit: under 50 ms), so the run stopped there."
      );
    });

    it("should write rates in the benchmark's unit and keep calls for the soak", async () => {
      // Arrange
      const site = await renderSite(loadReport("passed"), loadHistory(RUNS_4));

      // Act
      const $ = site.latest();

      // Assert
      expect(textOf($, ".stat:nth-child(1) .stat-label")).to.equal(
        "messages/s, EdgePort + Echo limit"
      );
      expect(
        textOf($, "#edgeport-echo .card-sub").toLowerCase()
      ).to.not.contain("invite");
      expect(textOf($, "#edgeport-echo .chart-card .card-sub")).to.equal(
        "request to 200 OK, by offered rate"
      );
      expect(textOf($, "#one-soak .section-sub")).to.equal(
        "6 h + 30 min warm-up · steady 100 calls/s, 30 s calls, 200 agents"
      );
    });

    it("should name each delta's own run when they compare with different runs", async () => {
      // Arrange: the capacity compares with Oct 6, the soak with Oct 20
      const site = await renderSite(loadReport("passed"), loadHistory(RUNS_4));

      // Act
      const $ = site.latest();
      const deltas = $(".delta")
        .map((_, el) => $(el).text().trim())
        .get();

      // Assert
      expect(deltas).to.deep.equal([
        "99.2 messages/s more, better vs v2.31.0, Oct 6",
        "0.6 ms more, worse vs v2.31.0, Oct 6",
        "5.6 MB/h less, better vs v2.31.3, Oct 20"
      ]);
      expect($(".headline-caption")).to.have.length(0);
    });

    it("should mark the over-limit area, the threshold and the limit with words", async () => {
      // Arrange
      const site = await renderSite(loadReport("passed"), loadHistory(RUNS_4));

      // Act
      const $ = site.latest();

      // Assert
      expect(textOf($, "#edgeport-echo .over-limit-label")).to.equal(
        "over the limit"
      );
      expect(textOf($, "#edgeport-echo .threshold-label")).to.equal(
        "p99 limit 50 ms"
      );
      expect(textOf($, "#edgeport-echo .limit-tag-text")).to.equal(
        "limit 1,240 messages/s"
      );
    });

    it("should give every chart its numbers as a table", async () => {
      // Arrange
      const site = await renderSite(loadReport("passed"), loadHistory(RUNS_4));

      // Act
      const $ = site.latest();

      // Assert
      expect($("svg.chart")).to.have.length(2);
      expect($("svg.chart[role=img][aria-label]")).to.have.length(2);
      expect($("details.chart-data table")).to.have.length(2);
      expect($("#edgeport-echo .chart-data tbody tr")).to.have.length(26);
      expect(textOf($, "#one-soak .chart-data tbody")).to.contain("+1.8 MB/h");
    });

    it("should show the soak's checks with a word, also measured and where the time goes", async () => {
      // Arrange
      const site = await renderSite(loadReport("passed"), loadHistory(RUNS_4));

      // Act
      const $ = site.latest();

      // Assert
      expect(
        $("#one-soak .check .pill")
          .map((_, el) => $(el).text().trim())
          .get()
      ).to.deep.equal(["Passed", "Passed", "Passed", "Passed", "Passed"]);
      expect(textOf($, "#one-soak .also")).to.equal(
        "Also measured: p99 21 to 23 ms (first vs last hour), open files up to 388, at most 3,010 concurrent calls, failed re-registrations 0 of 200."
      );
      expect(textOf($, "#one-soak .hops-total")).to.equal("6.4 ms total");
      expect(textOf($, "#one-soak .hop-legend")).to.contain("edgeport4.1 ms");
    });

    it("should say which window the memory growth slope covers, when the report has it", async () => {
      // Arrange
      const report = loadReport("passed");
      const soak = report.benchmarks.find(
        (b: { id: string }) => b.id === "one-soak"
      );
      for (const rule of soak.rules) {
        if (rule.id === "memoryGrowthMBPerHour") {
          rule.window = {
            from: "2026-11-03T15:30:00.000Z",
            to: "2026-11-03T16:30:00.000Z"
          };
        }
      }
      const site = await renderSite(report, loadHistory(RUNS_4));
      const old = await renderSite(loadReport("passed"), loadHistory(RUNS_4));

      // Act
      const $ = site.latest();

      // Assert
      expect(textOf($, "#one-soak .growth-window")).to.equal(
        "Memory growth: slope over the second half, from 15:30 to 16:30 UTC"
      );
      expect(old.latest()("#one-soak .growth-window")).to.have.length(0);
    });

    it("should list the test setup and the command", async () => {
      // Arrange
      const site = await renderSite(loadReport("passed"), loadHistory(RUNS_4));

      // Act
      const $ = site.latest();

      // Assert
      expect(textOf($, ".setup")).to.contain("c-8 · 8 vCPU · 16 GB");
      expect(textOf($, ".setup")).to.contain("2.31.5 · sha256:10f98210a932");
      expect(textOf($, ".setup .command")).to.equal(
        "$ npx -y github:fonoster/perfkit#v0.1.0 run --config perf/perfkit.yaml --target-version 2.31.5"
      );
    });

    it("should end with the footer naming perfkit and the schema", async () => {
      // Arrange
      const site = await renderSite(loadReport("passed"), loadHistory(RUNS_4));

      // Act
      const $ = site.latest();

      // Assert
      expect(textOf($, ".generated")).to.equal(
        "Generated by perfkit 9.8.7 from report.json · schema perfkit/report/v1"
      );
      expect($("a:contains('Methodology')").attr("href")).to.equal(
        "https://github.com/fonoster/perfkit/blob/v9.8.7/docs/report-page.md"
      );
    });
  });

  describe("given the failed fixture", () => {
    it("should show Failed with the rule sentence and a Failed check row", async () => {
      // Arrange
      const site = await renderSite(loadReport("failed"));

      // Act
      const $ = site.latest();

      // Assert
      expect(textOf($, "#one-soak .section-head .pill")).to.equal("Failed");
      expect(textOf($, "#one-soak .banner")).to.equal(
        "Failed: one memory grew 7.4 MB/h (limit: under 5 MB/h)."
      );
      expect(textOf($, "#one-soak .check:first-child .pill")).to.equal(
        "Failed"
      );
      expect(textOf($, "#one-soak .check:first-child dd")).to.equal(
        "one +7.4 MB/h · limit under 5"
      );
      expect(textOf($, "#edgeport-echo .banner")).to.equal(
        "Failed: no rate step met both rules. At 50 messages/s, p99 was 72 ms (limit: under 50 ms)."
      );
    });

    it("should read the null limit as below the first step, with no limit marker", async () => {
      // Arrange
      const site = await renderSite(loadReport("failed"));

      // Act
      const $ = site.latest();

      // Assert
      expect(textOf($, ".stat:nth-child(1) .stat-value")).to.equal("below 50");
      expect(textOf($, "#edgeport-echo .side-card .card-sub")).to.equal(
        "Limit: below 50 messages/s"
      );
      expect(textOf($, ".stat:nth-child(2)")).to.equal("-- No passing step");
      expect($("#edgeport-echo .limit-line")).to.have.length(0);
      expect($("#edgeport-echo .over-limit")).to.have.length(0);
    });
  });

  describe("given a capacity limit that is a lower bound", () => {
    it("should read at least 5,000 messages/s", async () => {
      // Arrange
      const site = await renderSite(loadReport("lower-bound"));

      // Act
      const $ = site.latest();

      // Assert
      expect(textOf($, ".stat:nth-child(1) .stat-value")).to.equal(
        "at least 5,000"
      );
      expect(textOf($, "#edgeport-echo .side-card .card-sub")).to.equal(
        "Limit: at least 5,000 messages/s, the highest rate tested"
      );
      expect(textOf($, "#edgeport-echo .takeaway")).to.equal(
        "EdgePort + Echo held every rate up to the highest tested, 5,000 messages/s, without breaking a rule."
      );
      expect(textOf($, ".runs tr.is-viewing")).to.contain(
        "at least 5,000 messages/s"
      );
      expect($("#edgeport-echo .over-limit")).to.have.length(0);
    });
  });

  describe("given no history", () => {
    it("should omit deltas and the sparkline and say this is the first run", async () => {
      // Arrange
      const site = await renderSite(loadReport("passed"));

      // Act
      const $ = site.latest();

      // Assert
      expect($(".delta")).to.have.length(0);
      expect($(".sparkline")).to.have.length(0);
      expect(textOf($, ".headline-caption")).to.equal(
        "First run: nothing to compare with yet."
      );
      expect(textOf($, ".history .callout")).to.equal(
        "History starts with this run. Each new run adds a row here and a point to the capacity limit trend."
      );
      expect($(".runs tbody tr")).to.have.length(1);
      expect(textOf($, ".runs tr.is-viewing .badge")).to.equal("viewing");
    });
  });

  describe("given a history of 14 runs", () => {
    it("should list 8 runs in the picker and the table, with Show all 14 runs", async () => {
      // Arrange
      const site = await renderSite(loadReport("passed"), loadHistory(RUNS_14));

      // Act
      const $ = site.latest();

      // Assert
      expect($("#run-list .picker-item")).to.have.length(8);
      expect(textOf($, ".picker-all")).to.equal("See all 14 runs");
      expect($(".picker-all").attr("href")).to.equal("#all-runs");
      expect($(".runs tbody").first().find("tr")).to.have.length(8);
      expect($(".runs tbody.more tr")).to.have.length(6);
      expect(textOf($, ".show-all")).to.equal("Show all 14 runs");
      expect($(".history").attr("id")).to.equal("all-runs");
    });

    it("should name the compared run once, under the strip", async () => {
      // Arrange
      const site = await renderSite(loadReport("passed"), loadHistory(RUNS_14));

      // Act
      const $ = site.latest();

      // Assert
      expect(textOf($, ".headline-caption")).to.equal(RUN_14_LATEST_DELTA_RUN);
      expect(
        $(".delta")
          .map((_, el) => $(el).text().trim())
          .get()
      ).to.deep.equal([
        "50 messages/s more, better",
        "1.1 ms less, better",
        "0.1 MB/h less, better"
      ]);
    });

    it("should draw the capacity trend over the last 8 runs with its numbers in text", async () => {
      // Arrange
      const site = await renderSite(loadReport("passed"), loadHistory(RUNS_14));

      // Act
      const $ = site.latest();

      // Assert
      expect($(".trend .sparkline")).to.have.length(1);
      expect(textOf($, ".trend-title")).to.equal(
        "EdgePort + Echo limit, last 8 runs"
      );
      expect(textOf($, ".trend-value")).to.equal("1,240");
      expect(textOf($, ".trend .visually-hidden")).to.contain(
        "Nov 3, 2026 1,240 messages/s"
      );
    });
  });

  describe("given a not-run soak", () => {
    it("should link to the last result in history", async () => {
      // Arrange
      const site = await renderSite(loadReport("not-run"), loadHistory(RUNS_4));

      // Act
      const $ = site.runPage();

      // Assert
      expect(textOf($, "#one-soak .section-head .pill")).to.equal("Not run");
      expect(textOf($, "#one-soak .banner")).to.equal(
        "This benchmark was not part of this run. Last result: Failed on Oct 20, 2026 (v2.31.3). View that run"
      );
      expect($("#one-soak .banner a").attr("href")).to.equal(
        "../../runs/20261020T100005Z-c0b54ab/"
      );
      expect(textOf($, ".stat:nth-child(3)")).to.equal("-- soak · Not run");
      expect(textOf($, ".stat:nth-child(4)")).to.equal(
        "-- memory growth · Not run"
      );
      expect(textOf($, ".hero .verdict")).to.equal(
        "0 of 2 benchmarks passed · 1 not run · 1 aborted"
      );
    });

    it("should say it has not run yet without an earlier result", async () => {
      // Arrange
      const site = await renderSite(loadReport("not-run"));

      // Act
      const $ = site.latest();

      // Assert
      expect(textOf($, "#one-soak .banner")).to.equal(
        "This benchmark has not run yet."
      );
      expect($("#one-soak .narrative-card")).to.have.length(3);
    });
  });

  describe("given an aborted soak", () => {
    it("should say how long it ran, mark the chart Partial and show no verdict rows", async () => {
      // Arrange
      const site = await renderSite(loadReport("aborted-soak"));

      // Act
      const $ = site.latest();

      // Assert
      expect(textOf($, "#one-soak .banner")).to.equal(
        "Aborted after 3 h 12 min: the server under test stopped responding. No verdict. The chart shows the first 3 h 12 min."
      );
      expect(textOf($, "#one-soak .chart-card .tag")).to.equal("Partial");
      expect($("#one-soak .check")).to.have.length(0);
      expect(textOf($, "#one-soak .side-card")).to.equal(
        "Stability checks: not evaluated (run aborted)"
      );
      expect(textOf($, ".hero .verdict")).to.equal(
        "1 of 2 benchmarks passed · 1 aborted"
      );
    });
  });

  describe("given an inconclusive benchmark", () => {
    it("should say a capacity benchmark reports no limit", async () => {
      // Arrange
      const site = await renderSite(loadReport("inconclusive"));

      // Act
      const $ = site.latest();

      // Assert
      expect(textOf($, "#edgeport-echo .section-head .pill")).to.equal(
        "Inconclusive"
      );
      expect(textOf($, "#edgeport-echo .banner")).to.equal(
        "Inconclusive: load generator saturated at 1,300 messages/s (SIPp at 93% of one core). No limit is reported."
      );
      expect(textOf($, ".stat:nth-child(1)")).to.equal(
        "-- messages/s, EdgePort + Echo limit · Inconclusive"
      );
    });

    it("should end a soak's sentence with No verdict.", async () => {
      // Arrange
      const site = await renderSite(loadReport("first-run"));

      // Act
      const $ = site.latest();

      // Assert
      expect(textOf($, "#one-soak .banner")).to.equal(
        "Inconclusive: the load generator dropped packets, so the measured latency is not the server's. No verdict."
      );
      expect(textOf($, ".hero .verdict")).to.equal(
        "1 of 2 benchmarks passed · 1 inconclusive"
      );
    });
  });

  describe("on /benchmarks/ and on a run page", () => {
    it("should give /benchmarks/ the latest badge and Link to this run", async () => {
      // Arrange
      const site = await renderSite(loadReport("passed"), loadHistory(RUNS_4));

      // Act
      const $ = site.latest();

      // Assert
      expect(textOf($, ".picker-button .badge")).to.equal("latest");
      expect($(".permalink a").attr("href")).to.equal(
        "runs/20261103T141210Z-bd3254a/"
      );
      expect(textOf($, ".permalink")).to.equal("Link to this run");
      expect($(".viewing-banner")).to.have.length(0);
      expect($(".report-link").attr("href")).to.equal(
        "runs/20261103T141210Z-bd3254a/report.json"
      );
    });

    it("should give a run page the viewing banner and no latest badge", async () => {
      // Arrange
      const site = await renderSite(loadReport("passed"), loadHistory(RUNS_4));

      // Act
      const $ = site.runPage();

      // Assert
      expect(textOf($, ".viewing-banner")).to.equal(
        "You're viewing the run of Nov 3, 2026 14:12 UTC. See the latest run"
      );
      expect($(".viewing-banner a").attr("href")).to.equal("../../");
      expect($(".badge:contains('latest')")).to.have.length(0);
      expect(textOf($)).to.not.contain("latest ·");
      expect($(".permalink")).to.have.length(0);
      expect(textOf($, "#run-list .picker-item")).to.match(/^Latest run/);
      expect($("#run-list .picker-item").first().attr("href")).to.equal(
        "../../"
      );
      expect($(".report-link").attr("href")).to.equal("report.json");
    });

    it("should show a run page's history from that run back", async () => {
      // Arrange
      const site = await renderSite(loadReport("failed"), loadHistory(RUNS_4));

      // Act
      const $ = site.runPage();

      // Assert
      expect(
        $(".runs tbody tr")
          .map((_, el) => $(el).find("td").eq(1).text())
          .get()
      ).to.deep.equal(["v2.31.3", "v2.31.0"]);
      expect(textOf($, ".runs tr.is-viewing")).to.contain("viewing");
      expect($(".runs tr.is-viewing a")).to.have.length(0);
      expect($(".runs tbody tr").eq(1).find("a").attr("href")).to.equal(
        "../../runs/20261006T120000Z-40b2bc2/"
      );
    });
  });

  describe("accessibility", () => {
    it("should make the run picker a button with aria-expanded controlling a list of links", async () => {
      // Arrange
      const site = await renderSite(loadReport("passed"), loadHistory(RUNS_14));

      // Act
      const $ = site.latest();
      const button = $(".picker-button");

      // Assert
      expect(button.is("button")).to.equal(true);
      expect(button.attr("aria-expanded")).to.equal("false");
      expect(button.attr("aria-controls")).to.equal("run-list");
      expect($("#run-list").attr("hidden")).to.not.equal(undefined);
      expect($("#run-list .picker-item[aria-current=page]")).to.have.length(1);
      expect($("script").text()).to.contain('event.key === "Escape"');
      expect($("script").text()).to.contain("button.focus()");
    });

    it("should say pass and fail in words in the history table", async () => {
      // Arrange
      const site = await renderSite(loadReport("passed"), loadHistory(RUNS_4));

      // Act
      const $ = site.latest();

      // Assert
      expect(
        $(".runs .result")
          .map((_, el) => $(el).text().trim())
          .get()
      ).to.deep.equal([
        "2 of 2 passed",
        "0 of 2 passed · 1 not run · 1 aborted",
        "0 of 2 passed",
        "1 of 2 passed · 1 inconclusive"
      ]);
    });

    it("should let only the charts, the runs table and the command scroll sideways", async () => {
      // Arrange
      const site = await renderSite(loadReport("passed"), loadHistory(RUNS_4));

      // Act
      const $ = site.latest();
      const css = $("style").text();

      // Assert
      expect($('meta[name="viewport"]').attr("content")).to.equal(
        "width=device-width, initial-scale=1"
      );
      expect(
        $(".scroll-x")
          .map((_, el) => $(el).find("svg.chart, table").length > 0)
          .get()
      ).to.not.include(false);
      expect(css).to.contain("@media (max-width: 720px)");
      expect(css).to.contain(".command {");
      expect(css).to.contain("overflow-x: auto");
    });
  });

  it("should say 1 of 1 benchmark passed for a single benchmark", async () => {
    // Arrange
    const report = loadReport("passed");
    report.benchmarks = report.benchmarks.slice(0, 1);
    report.verdict = { ...report.verdict, total: 1, passed: 1 };
    delete report.run.tools.otelcol;

    // Act
    const $ = (await renderSite(report)).latest();

    // Assert
    expect(textOf($, ".hero .verdict")).to.equal("1 of 1 benchmark passed");
  });

  it("should escape text from report.json", async () => {
    // Arrange
    const report = loadReport("passed");
    report.project.title = "<script>alert(1)</script> & more";

    // Act
    const $ = (await renderSite(report)).latest();

    // Assert
    expect($("h1").text()).to.equal("<script>alert(1)</script> & more");
    expect($("script")).to.have.length(1);
  });

  it("should put the logo SVG in an img, never inline", async () => {
    // Arrange
    const report = loadReport("passed");

    // Act
    const $ = (await renderSite(report)).latest();

    // Assert
    expect($(".nav .logo").is("img")).to.equal(true);
    expect($(".nav .logo").attr("alt")).to.equal("Routr");
    expect($(".nav svg circle[fill]")).to.have.length(0);
  });

  it("should link the favicon in the head, and none without one", async () => {
    // Arrange
    const report = loadReport("passed");
    report.project.faviconSvg = '<svg xmlns="http://www.w3.org/2000/svg"/>';

    // Act
    const site = await renderSite(report);
    const plain = (await renderSite(loadReport("passed"))).latest();

    // Assert
    const href = `data:image/svg+xml,${encodeURIComponent(report.project.faviconSvg)}`;
    expect(site.latest()('head link[rel="icon"]').attr("href")).to.equal(href);
    expect(site.runPage()('head link[rel="icon"]').attr("href")).to.equal(href);
    expect(plain('link[rel="icon"]')).to.have.length(0);
  });

  it("should fall back to the project name without a logo", async () => {
    // Arrange
    const report = loadReport("passed");
    delete report.project.logoSvg;

    // Act
    const $ = (await renderSite(report)).latest();

    // Assert
    expect(textOf($, ".nav .logo-text")).to.equal("Routr");
  });

  describe("in every fixture", () => {
    const histories = { none: null, "runs.json": RUNS_4, "runs-14": RUNS_14 };
    REPORT_FORMS.forEach((form) => {
      Object.entries(histories).forEach(([name, file]) => {
        it(`should never print NaN, undefined or null (${form}, history ${name})`, async () => {
          // Arrange
          const site = await renderSite(
            loadReport(form),
            file === null ? null : loadHistory(file)
          );

          // Act
          const pages = [...site.written.entries()].filter(([path]) =>
            path.endsWith(".html")
          );

          // Assert
          expect(pages.length).to.be.greaterThan(0);
          pages.forEach(([path, html]) => {
            expect(html, path).to.not.match(/NaN|undefined|null/);
          });
        });
      });
    });
  });

  it("should never say runs happen on every release", async () => {
    // Arrange
    const site = await renderSite(loadReport("passed"), loadHistory(RUNS_4));

    // Act
    const text = textOf(site.latest()).toLowerCase();

    // Assert
    expect(text).to.not.contain("every release");
  });
});
