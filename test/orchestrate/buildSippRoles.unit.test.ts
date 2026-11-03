/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { expect } from "chai";
import {
  buildSippRoles,
  countUserRows
} from "../../src/orchestrate/buildSippRoles.js";
import { soakBenchmarkConfigSchema } from "../../src/schemas/index.js";
import { capacityConfig, soakConfig } from "../analyze/builders.js";

const flagsOf = (args: string[]) => args.join(" ");

describe("buildSippRoles", () => {
  it("should give a soak uac -r 100 -l 4000 -d 30000 for 100 calls/s and a 30 s hold", () => {
    // Act
    const roles = buildSippRoles({
      benchmark: soakConfig(),
      uutIp: "10.0.0.2",
      loadgenIp: "10.0.0.3",
      registerUsers: 200
    });

    // Assert
    const uac = roles.find(({ role }) => role === "uac")!;
    expect(flagsOf(uac.args)).to.include("-r 100 -rp 1000 -l 4000 -d 30000");
    expect(uac.args[0]).to.equal("10.0.0.2:5060");
    expect(flagsOf(uac.args)).to.include("-inf /project/one-soak/callers.csv");
    expect(flagsOf(uac.args)).to.include(
      "-i 10.0.0.3 -p 5080 -cid_str uac-%u-%p@%s"
    );
  });

  it("should give the register role -m 200 -l 200 and the expires, refresh and uas_port keys for 200 users and expires 300", () => {
    // Act
    const roles = buildSippRoles({
      benchmark: soakConfig(),
      uutIp: "10.0.0.2",
      loadgenIp: "10.0.0.3",
      registerUsers: 200
    });

    // Assert
    expect(roles.map(({ role }) => role)).to.deep.equal(["register", "uac"]);
    const register = flagsOf(roles[0]!.args);
    expect(register).to.include(
      "-m 200 -r 20 -l 200 -key expires 300 -key refresh_ms 150000 -key uas_port 5070"
    );
    expect(register).to.include(
      "-sf /project/one-soak/uac_register.xml -i 10.0.0.3 -p 5070 -cid_str register-%u-%p@%s"
    );
    expect(register).to.include("-oocsf /project/one-soak/uas_answer.xml");
    expect(register).to.include("-inf /project/one-soak/callees.csv");
  });

  it("should run a uas without a register role alone on 5070", () => {
    // Arrange
    const benchmark = soakBenchmarkConfigSchema.parse({
      ...soakConfig(),
      load: { ...soakConfig().load, register: undefined }
    });

    // Act
    const roles = buildSippRoles({
      benchmark,
      uutIp: "10.0.0.2",
      loadgenIp: "10.0.0.3",
      registerUsers: 0
    });

    // Assert
    expect(roles.map(({ role }) => role)).to.deep.equal(["uas", "uac"]);
    expect(flagsOf(roles[0]!.args)).to.include(
      "-sf /project/one-soak/uas_answer.xml -i 10.0.0.3 -p 5070 -cid_str uas-%u-%p@%s"
    );
    expect(flagsOf(roles[0]!.args)).to.include("-l 4000");
  });

  it("should give a capacity uac the ramp flags from perfkit.yaml and no -s", () => {
    // Act
    const [uac] = buildSippRoles({
      benchmark: capacityConfig(),
      uutIp: "10.0.0.2",
      loadgenIp: "10.0.0.3",
      registerUsers: 0
    });

    // Assert
    expect(flagsOf(uac!.args)).to.include(
      "-r 50 -rp 1000 -rate_increase 50 -rate_interval 60 -rate_max 5000 -no_rate_quit -l 50000 -d 0"
    );
    expect(uac!.args).not.to.include("-s");
    expect(flagsOf(uac!.args)).to.include("-trace_rtt -rtt_freq 10");
  });
});

describe("countUserRows", () => {
  it("should count the rows after the first line, without blank lines", () => {
    expect(countUserRows("SEQUENTIAL\nalice;1\nbob;2\n\n")).to.equal(2);
    expect(countUserRows("")).to.equal(0);
  });
});
