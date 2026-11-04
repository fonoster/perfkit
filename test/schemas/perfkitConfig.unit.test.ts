/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { expect } from "chai";
import { perfkitConfigSchema } from "../../src/schemas/index.js";
import { loadConfig } from "../fixtures.js";
import { errorsOf } from "./check.js";

describe("perfkitConfigSchema", () => {
  describe("with the Routr example", () => {
    it("should accept it and fill in the defaults", () => {
      // Act
      const config = perfkitConfigSchema.parse(loadConfig());

      // Assert
      expect(config.benchmarks).to.have.length(2);
      expect(config.infra.provider).to.equal("digitalocean");
      expect(config.infra.maxLifetime).to.equal("9h");
      const [capacity, soak] = config.benchmarks;
      expect(capacity?.load.port).to.equal(5060);
      expect(capacity?.telemetry).to.deep.equal({
        otlp: false,
        sampleRatio: 0.01
      });
      expect(soak?.load.hold).to.equal("30s");
      expect(soak?.kind === "soak" && soak.load.register?.expires).to.equal(
        300
      );
    });

    it("should default hold to 0s and uac.users to none", () => {
      // Arrange
      const raw = loadConfig();
      delete raw.benchmarks[0].load.hold;

      // Act
      const config = perfkitConfigSchema.parse(raw);

      // Assert
      expect(config.benchmarks[0]?.load.hold).to.equal("0s");
      expect(config.benchmarks[0]?.load.uac.users).to.equal(undefined);
    });

    it("should default a capacity warm-up to 0s and accept one shorter than a step", () => {
      const raw = loadConfig();
      expect(perfkitConfigSchema.parse(raw).benchmarks[0]?.warmup).to.equal(
        "0s"
      );
      raw.benchmarks[0].warmup = "20s";
      expect(perfkitConfigSchema.parse(raw).benchmarks[0]?.warmup).to.equal(
        "20s"
      );
    });

    it("should accept a project without a logo", () => {
      const raw = loadConfig();
      delete raw.project.logo;
      expect(errorsOf(perfkitConfigSchema, raw)).to.deep.equal([]);
    });
  });

  describe("with an invalid config", () => {
    it("should require rate.cps in a soak benchmark", () => {
      const raw = loadConfig();
      delete raw.benchmarks[1].load.rate.cps;
      expect(errorsOf(perfkitConfigSchema, raw)).to.deep.equal([
        "benchmarks[1].load.rate.cps: required"
      ]);
    });

    it("should require rate.max in a capacity benchmark", () => {
      const raw = loadConfig();
      delete raw.benchmarks[0].load.rate.max;
      expect(errorsOf(perfkitConfigSchema, raw)).to.deep.equal([
        "benchmarks[0].load.rate.max: required"
      ]);
    });

    it("should reject a capacity warm-up as long as a step", () => {
      const raw = loadConfig();
      raw.benchmarks[0].warmup = "1m";
      raw.benchmarks[0].load.rate.every = "60s";
      expect(errorsOf(perfkitConfigSchema, raw)).to.deep.equal([
        "benchmarks[0].warmup: expected a warm-up shorter than load.rate.every (60s)"
      ]);
    });

    it("should require duration and warmup in a soak benchmark", () => {
      const raw = loadConfig();
      delete raw.benchmarks[1].duration;
      delete raw.benchmarks[1].warmup;
      expect(errorsOf(perfkitConfigSchema, raw)).to.deep.equal([
        "benchmarks[1].duration: required",
        "benchmarks[1].warmup: required"
      ]);
    });

    it("should reject a duplicate benchmark id", () => {
      const raw = loadConfig();
      raw.benchmarks[1].id = "edgeport-echo";
      expect(errorsOf(perfkitConfigSchema, raw)).to.deep.equal([
        'benchmarks[1].id: duplicate id "edgeport-echo"; benchmarks[0] already uses it'
      ]);
    });

    it("should reject an id outside [a-z0-9-]+", () => {
      const raw = loadConfig();
      raw.benchmarks[0].id = "EdgePort_Echo";
      expect(errorsOf(perfkitConfigSchema, raw)).to.deep.equal([
        'benchmarks[0].id: expected lowercase letters, digits and dashes; got "EdgePort_Echo"'
      ]);
    });

    it("should reject unknown keys everywhere", () => {
      const raw = loadConfig();
      raw.extra = true;
      raw.project.colour = "#000000";
      raw.benchmarks[0].load.rate.burst = 10;
      expect(errorsOf(perfkitConfigSchema, raw)).to.deep.equal([
        "benchmarks[0].load.rate.burst: unknown key",
        "extra: unknown key",
        "project.colour: unknown key"
      ]);
    });

    it("should reject capacity rate fields in a soak benchmark", () => {
      const raw = loadConfig();
      raw.benchmarks[1].load.rate = { start: 50, step: 50, every: "60s", max: 500 };
      expect(errorsOf(perfkitConfigSchema, raw)).to.deep.equal([
        "benchmarks[1].load.rate.cps: required",
        "benchmarks[1].load.rate.every: unknown key",
        "benchmarks[1].load.rate.max: unknown key",
        "benchmarks[1].load.rate.start: unknown key",
        "benchmarks[1].load.rate.step: unknown key"
      ]);
    });

    it("should reject register and uas in a capacity benchmark", () => {
      const raw = loadConfig();
      raw.benchmarks[0].load.uas = { scenario: "edgeport-echo/uac_invite.xml" };
      expect(errorsOf(perfkitConfigSchema, raw)).to.deep.equal([
        "benchmarks[0].load.uas: unknown key"
      ]);
    });

    it("should require exactly the thresholds of the kind", () => {
      const raw = loadConfig();
      raw.benchmarks[0].thresholds = { p99LatencyMs: 50, restarts: 0 };
      raw.benchmarks[1].thresholds = { memoryGrowthMBPerHour: 5, failedCallsPct: 0.1 };
      expect(errorsOf(perfkitConfigSchema, raw)).to.deep.equal([
        "benchmarks[0].thresholds.failedCallsPct: required",
        "benchmarks[0].thresholds.restarts: unknown key",
        "benchmarks[1].thresholds.restarts: required"
      ]);
    });

    it("should reject an unknown kind, tool or transport", () => {
      const raw = loadConfig();
      raw.benchmarks[0].kind = "spike";
      raw.benchmarks[1].load.tool = "k6";
      raw.benchmarks[1].load.transport = "tcp";
      expect(errorsOf(perfkitConfigSchema, raw)).to.deep.equal([
        'benchmarks[0].kind: expected one of capacity, soak; got "spike"',
        'benchmarks[1].load.tool: expected sipp; got "k6"',
        'benchmarks[1].load.transport: expected udp; got "tcp"'
      ]);
    });

    it("should reject a duration that is not <n>s|m|h", () => {
      const raw = loadConfig();
      raw.infra.maxLifetime = "9 hours";
      raw.benchmarks[1].duration = "6d";
      expect(errorsOf(perfkitConfigSchema, raw)).to.deep.equal([
        'benchmarks[1].duration: expected a duration like 30s, 10m or 6h; got "6d"',
        'infra.maxLifetime: expected a duration like 30s, 10m or 6h; got "9 hours"'
      ]);
    });

    it("should require the project, infra, image and benchmark fields", () => {
      const raw = loadConfig();
      ["name", "repo", "siteUrl", "accent", "title", "lead"].forEach((key) => {
        delete raw.project[key];
      });
      delete raw.infra.region;
      delete raw.infra.uut.size;
      delete raw.infra.loadgen.size;
      raw.images = {};
      raw.benchmarks = [];
      expect(errorsOf(perfkitConfigSchema, raw)).to.deep.equal([
        "benchmarks: expected at least one benchmark",
        "images: expected at least one image",
        "infra.loadgen.size: required",
        "infra.region: required",
        "infra.uut.size: required",
        "project.accent: required",
        "project.lead: required",
        "project.name: required",
        "project.repo: required",
        "project.siteUrl: required",
        "project.title: required"
      ]);
    });

    it("should require the benchmark fields", () => {
      const raw = loadConfig();
      const bench = raw.benchmarks[0];
      ["title", "thresholds"].forEach((key) => delete bench[key]);
      delete bench.narrative.why;
      delete bench.uut.compose;
      bench.uut.processes = [];
      delete bench.load.uac.scenario;
      delete bench.load.rate;
      expect(errorsOf(perfkitConfigSchema, raw)).to.deep.equal([
        "benchmarks[0].load.rate: required",
        "benchmarks[0].load.uac.scenario: required",
        "benchmarks[0].narrative.why: required",
        "benchmarks[0].thresholds: required",
        "benchmarks[0].title: required",
        "benchmarks[0].uut.compose: required",
        "benchmarks[0].uut.processes: expected at least one process"
      ]);
    });

    it("should reject an accent that is not a 6-digit hex color", () => {
      const raw = loadConfig();
      raw.project.accent = "#5FC";
      expect(errorsOf(perfkitConfigSchema, raw)).to.deep.equal([
        'project.accent: expected a 6-digit hex color like #5FCFCE; got "#5FC"'
      ]);
    });

    it("should reject an absolute path and an image with a tag", () => {
      const raw = loadConfig();
      raw.benchmarks[0].uut.compose = "/etc/compose.yaml";
      raw.images.echo = "fonoster/routr-echo:2.31.5";
      expect(errorsOf(perfkitConfigSchema, raw)).to.deep.equal([
        "benchmarks[0].uut.compose: expected a path relative to the perfkit.yaml file",
        "images.echo: expected an image name without a tag or digest; the tag comes from --target-version"
      ]);
    });

    it("should accept an image entry with a name and a tagSuffix", () => {
      const raw = loadConfig();
      raw.images.edgeportGo = {
        name: "fonoster/routr-edgeport",
        tagSuffix: "-go-experimental"
      };
      const config = perfkitConfigSchema.parse(raw);
      expect(config.images.edgeportGo).to.deep.equal({
        name: "fonoster/routr-edgeport",
        tagSuffix: "-go-experimental"
      });
      expect(config.images.edgeport).to.equal("fonoster/routr-edgeport");
    });

    it("should reject an image entry with a tagged name, a bad tagSuffix or no tagSuffix", () => {
      const raw = loadConfig();
      raw.images.tagged = { name: "fonoster/routr-edgeport:2.32.0", tagSuffix: "-go" };
      raw.images.slash = { name: "fonoster/routr-edgeport", tagSuffix: "/go" };
      raw.images.empty = { name: "fonoster/routr-edgeport", tagSuffix: "" };
      raw.images.bare = { name: "fonoster/routr-edgeport" };
      expect(errorsOf(perfkitConfigSchema, raw)).to.deep.equal([
        "images.bare: does not match any allowed shape",
        `images.empty.tagSuffix: expected a tag suffix of letters, digits, '.', '_' or '-'; got ""`,
        `images.slash.tagSuffix: expected a tag suffix of letters, digits, '.', '_' or '-'; got "/go"`,
        "images.tagged.name: expected an image name without a tag or digest; the tag comes from --target-version"
      ]);
    });

    it("should reject a process match that is not a regex", () => {
      const raw = loadConfig();
      raw.benchmarks[0].uut.processes[0].match = "io\\.routr(";
      expect(errorsOf(perfkitConfigSchema, raw)).to.deep.equal([
        "benchmarks[0].uut.processes[0].match: expected a valid regular expression"
      ]);
    });
  });
});
