/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { expect } from "chai";
import {
  generatorOf,
  workerFileName
} from "../../src/orchestrate/workerFiles.js";

describe("generatorOf", () => {
  it("should run everything on the load generator without workers", () => {
    expect([1, 2, 3].map((n) => generatorOf(n, 0))).to.deep.equal([
      "loadgen",
      "loadgen",
      "loadgen"
    ]);
  });

  it("should spread instances round robin, the first on the load generator", () => {
    expect([1, 2, 3, 4, 5].map((n) => generatorOf(n, 1))).to.deep.equal([
      "loadgen",
      "worker-1",
      "loadgen",
      "worker-1",
      "loadgen"
    ]);
    expect([1, 2, 3, 4].map((n) => generatorOf(n, 2))).to.deep.equal([
      "loadgen",
      "worker-1",
      "worker-2",
      "loadgen"
    ]);
  });
});

describe("workerFileName", () => {
  it("should put the worker's number in front of the padded pid", () => {
    expect(workerFileName(1, "uac_invite_4242_.csv")).to.equal(
      "uac_invite_100004242_.csv"
    );
    expect(workerFileName(2, "uac_invite_4242_rtt.csv")).to.equal(
      "uac_invite_200004242_rtt.csv"
    );
    expect(workerFileName(1, "uac_invite_4242_error_codes.csv")).to.equal(
      "uac_invite_100004242_error_codes.csv"
    );
  });

  it("should keep a worker's sampler files under their own name and skip the other files", () => {
    expect(workerFileName(1, "sampler-worker-1.jsonl")).to.equal(
      "sampler-worker-1.jsonl"
    );
    expect(workerFileName(2, "udp-worker-2.jsonl")).to.equal(
      "udp-worker-2.jsonl"
    );
    expect(workerFileName(1, "sampler-worker-1.spec")).to.equal(null);
    expect(workerFileName(1, "users-uac-2.csv")).to.equal(null);
  });

  it("should never collide with a pid of the load generator itself", () => {
    // A Linux pid has at most 7 digits; a renamed one has 9 or more
    const pid = (name: string) => /_(\d+)_/.exec(name)![1]!;
    expect(pid(workerFileName(1, "uac_invite_1_.csv")!).length).to.be.at.least(
      9
    );
    expect(workerFileName(1, "uac_invite_7_.csv")).to.not.equal(
      workerFileName(2, "uac_invite_7_.csv")
    );
  });

  it("should leave out files that are not SIPp's", () => {
    expect(workerFileName(1, "users-uac-2.csv")).to.equal(null);
  });
});
