/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { expect } from "chai";
import {
  buildSippRoles,
  countUserRows
} from "../../src/orchestrate/buildSippRoles.js";
import {
  capacityBenchmarkConfigSchema,
  soakBenchmarkConfigSchema
} from "../../src/schemas/index.js";
import { capacityConfig, soakConfig } from "../analyze/builders.js";

const flagsOf = (args: string[]) => args.join(" ");

const COMMON_UDP = [
  "-t",
  "u1",
  "-buff_size",
  "4194304",
  "-trace_rtt",
  "-rtt_freq",
  "10",
  "-trace_stat",
  "-fd",
  "10",
  "-trace_counts",
  "-trace_err",
  "-trace_error_codes",
  "-nostdin"
];

/** A capacity benchmark with callees: one-soak's scenarios, a 5 s hold. */
function capacityWithCallees(
  load: Record<string, unknown> = {},
  uut?: Record<string, unknown>
) {
  const base = capacityConfig();
  return capacityBenchmarkConfigSchema.parse({
    ...base,
    id: "one-capacity",
    ...(uut ? { uut } : {}),
    load: {
      ...base.load,
      unit: "calls",
      register: {
        scenario: "one-soak/uac_register.xml",
        users: "one-soak/callees.csv"
      },
      uas: { scenario: "one-soak/uas_answer.xml" },
      uac: {
        scenario: "one-soak/uac_invite.xml",
        users: "one-soak/callers.csv"
      },
      hold: "5s",
      rate: { start: 2, step: 2, every: "60s", max: 60 },
      ...load
    }
  });
}

const HELM_UUT = {
  helm: {
    chart: "../ops/charts/connect",
    values: "k8s/values.yaml",
    entry: { service: "perfkit-routr-edgeport-tcp", port: 5060 },
    pods: [{ name: "edgeport", selector: "service=edgeport" }]
  }
};

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
      "-r 50 -rp 1000 -rate_increase 50 -rate_interval 60 -rate_max 5000 -no_rate_quit -recv_timeout 10000 -l 100000 -d 0"
    );
    expect(uac!.args).not.to.include("-s");
    expect(flagsOf(uac!.args)).to.include("-trace_rtt -rtt_freq 10");
  });

  it("should keep a UDP soak's SIPp arguments exactly as before TCP and Kubernetes", () => {
    // Act
    const roles = buildSippRoles({
      benchmark: soakConfig(),
      uutIp: "10.0.0.2",
      loadgenIp: "10.0.0.3",
      registerUsers: 200
    });

    // Assert
    expect(roles).to.deep.equal([
      {
        role: "register",
        scenario: "one-soak/uac_register.xml",
        args: [
          "10.0.0.2:5060",
          "-sf",
          "/project/one-soak/uac_register.xml",
          "-i",
          "10.0.0.3",
          "-p",
          "5070",
          "-cid_str",
          "register-%u-%p@%s",
          ...COMMON_UDP,
          "-oocsf",
          "/project/one-soak/uas_answer.xml",
          "-inf",
          "/project/one-soak/callees.csv",
          "-m",
          "200",
          "-r",
          "20",
          "-l",
          "200",
          "-key",
          "expires",
          "300",
          "-key",
          "refresh_ms",
          "150000",
          "-key",
          "uas_port",
          "5070"
        ]
      },
      {
        role: "uac",
        scenario: "one-soak/uac_invite.xml",
        args: [
          "10.0.0.2:5060",
          "-sf",
          "/project/one-soak/uac_invite.xml",
          "-i",
          "10.0.0.3",
          "-p",
          "5080",
          "-cid_str",
          "uac-%u-%p@%s",
          ...COMMON_UDP,
          "-inf",
          "/project/one-soak/callers.csv",
          "-r",
          "100",
          "-rp",
          "1000",
          "-l",
          "4000",
          "-d",
          "30000"
        ]
      }
    ]);
  });

  it("should keep a UDP capacity uac's arguments as before but for -recv_timeout and -l", () => {
    // Act
    const [uac] = buildSippRoles({
      benchmark: capacityConfig(),
      uutIp: "10.0.0.2",
      loadgenIp: "10.0.0.3",
      registerUsers: 0
    });

    // Assert
    expect(uac!.args).to.deep.equal([
      "10.0.0.2:5060",
      "-sf",
      "/project/edgeport-echo/uac_message.xml",
      "-i",
      "10.0.0.3",
      "-p",
      "5080",
      "-cid_str",
      "uac-%u-%p@%s",
      ...COMMON_UDP,
      "-r",
      "50",
      "-rp",
      "1000",
      "-rate_increase",
      "50",
      "-rate_interval",
      "60",
      "-rate_max",
      "5000",
      "-no_rate_quit",
      "-recv_timeout",
      "10000",
      "-l",
      "100000",
      "-d",
      "0"
    ]);
  });

  it("should give a capacity benchmark with register and uas a register role before the ramping uac", () => {
    // Act
    const roles = buildSippRoles({
      benchmark: capacityWithCallees(),
      uutIp: "10.0.0.2",
      loadgenIp: "10.0.0.3",
      registerUsers: 200
    });

    // Assert
    expect(roles.map(({ role }) => role)).to.deep.equal(["register", "uac"]);
    const register = flagsOf(roles[0]!.args);
    // 200 rows + ceil(60 × (5 + 20))
    expect(register).to.include(
      "-oocsf /project/one-soak/uas_answer.xml -inf /project/one-soak/callees.csv -m 200 -r 20 -l 1700 -key expires 300 -key refresh_ms 150000 -key uas_port 5070"
    );
    expect(register).not.to.include("-recv_timeout");
    const uac = flagsOf(roles[1]!.args);
    expect(uac).to.include(
      "-r 2 -rp 1000 -rate_increase 2 -rate_interval 60 -rate_max 60 -no_rate_quit -recv_timeout 10000 -l 1500 -d 5000"
    );
  });

  it("should run a capacity uas without register alone on 5070", () => {
    // Act
    const roles = buildSippRoles({
      benchmark: capacityWithCallees({ register: undefined }),
      uutIp: "10.0.0.2",
      loadgenIp: "10.0.0.3",
      registerUsers: 0
    });

    // Assert
    expect(roles.map(({ role }) => role)).to.deep.equal(["uas", "uac"]);
    expect(flagsOf(roles[0]!.args)).to.include(
      "-sf /project/one-soak/uas_answer.xml -i 10.0.0.3 -p 5070 -cid_str uas-%u-%p@%s"
    );
    expect(flagsOf(roles[0]!.args)).to.match(/-l 1500$/);
  });

  it("should give every capacity uac -recv_timeout 10000 and -l max × (hold + 20)", () => {
    // Act
    const plain = buildSippRoles({
      benchmark: capacityConfig({ max: 200 }),
      uutIp: "10.0.0.2",
      loadgenIp: "10.0.0.3",
      registerUsers: 0
    });
    const withCallees = buildSippRoles({
      benchmark: capacityWithCallees(),
      uutIp: "10.0.0.2",
      loadgenIp: "10.0.0.3",
      registerUsers: 200
    });

    // Assert
    expect(plain.map(({ role }) => role)).to.deep.equal(["uac"]);
    expect(flagsOf(plain[0]!.args)).to.include("-recv_timeout 10000 -l 4000");
    expect(flagsOf(withCallees[1]!.args)).to.include(
      "-recv_timeout 10000 -l 1500"
    );
  });

  it("should run every role over TCP with -t tn and -max_socket sized to its open calls", () => {
    // Act
    const roles = buildSippRoles({
      benchmark: capacityWithCallees({ transport: "tcp" }),
      uutIp: "10.0.0.2",
      loadgenIp: "10.0.0.3",
      registerUsers: 200
    });

    // Assert
    roles.forEach(({ args }) => {
      expect(flagsOf(args)).to.include("-t tn -buff_size 4194304");
      expect(args).not.to.include("u1");
    });
    expect(flagsOf(roles[0]!.args)).to.include("-l 1700 -max_socket 1800");
    expect(flagsOf(roles[1]!.args)).to.include("-l 1500 -max_socket 1600");
  });

  it("should cap -max_socket below the container's open-file limit", () => {
    // Act
    const [uac] = buildSippRoles({
      benchmark: capacityWithCallees({
        transport: "tcp",
        register: undefined,
        uas: undefined,
        rate: { start: 100, step: 100, every: "60s", max: 3000 }
      }),
      uutIp: "10.0.0.2",
      loadgenIp: "10.0.0.3",
      registerUsers: 0
    });

    // Assert
    expect(flagsOf(uac!.args)).to.include("-l 75000 -max_socket 60000");
  });

  it("should send a cluster benchmark to its entry, 1000 ports up and with the k8s- Call-ID prefix", () => {
    // Act
    const roles = buildSippRoles({
      benchmark: capacityWithCallees({ transport: "tcp" }, HELM_UUT),
      uutIp: "10.0.0.2",
      loadgenIp: "203.0.113.9",
      registerUsers: 200,
      target: { ip: "198.51.100.4", port: 5060 }
    });

    // Assert
    const [register, uac] = roles.map(({ args }) => flagsOf(args));
    expect(roles[0]!.args[0]).to.equal("198.51.100.4:5060");
    expect(roles[1]!.args[0]).to.equal("198.51.100.4:5060");
    expect(register).to.include(
      "-i 203.0.113.9 -p 6070 -cid_str k8s-register-%u-%p@%s"
    );
    expect(register).to.include("-key uas_port 6070");
    expect(uac).to.include("-i 203.0.113.9 -p 6080 -cid_str k8s-uac-%u-%p@%s");
  });

  it("should bind each role to its own address when bindIps are given", () => {
    // Act
    const roles = buildSippRoles({
      benchmark: capacityWithCallees({ transport: "tcp" }, HELM_UUT),
      uutIp: "10.0.0.2",
      loadgenIp: "172.18.255.200",
      registerUsers: 200,
      target: { ip: "172.18.0.2", port: 31060 },
      bindIps: {
        uac: "172.18.255.200",
        register: "172.18.255.201",
        uas: "172.18.255.202"
      }
    });

    // Assert
    expect(flagsOf(roles[0]!.args)).to.include("-i 172.18.255.201 -p 6070");
    expect(flagsOf(roles[1]!.args)).to.include("-i 172.18.255.200 -p 6080");
    expect(roles[1]!.args[0]).to.equal("172.18.0.2:31060");
  });

  it("should place a fromCapacity soak's calls at the rate it is given", () => {
    // Arrange
    const benchmark = soakBenchmarkConfigSchema.parse({
      ...soakConfig(),
      load: {
        ...soakConfig().load,
        rate: { fromCapacity: "one-capacity", fraction: 0.5, fallbackCps: 50 }
      }
    });

    // Act
    const roles = buildSippRoles({
      benchmark,
      uutIp: "10.0.0.2",
      loadgenIp: "10.0.0.3",
      registerUsers: 200,
      cps: 30
    });

    // Assert
    expect(flagsOf(roles[1]!.args)).to.include("-r 30 -rp 1000 -l 1200");
  });

  it("should throw for a fromCapacity soak given no rate", () => {
    // Arrange
    const benchmark = soakBenchmarkConfigSchema.parse({
      ...soakConfig(),
      load: {
        ...soakConfig().load,
        rate: { fromCapacity: "one-capacity", fraction: 0.5, fallbackCps: 50 }
      }
    });

    // Act and Assert
    expect(() =>
      buildSippRoles({
        benchmark,
        uutIp: "10.0.0.2",
        loadgenIp: "10.0.0.3",
        registerUsers: 200
      })
    ).to.throw("one-soak: the soak's rate comes from one-capacity");
  });
});

describe("countUserRows", () => {
  it("should count the rows after the first line, without blank lines", () => {
    expect(countUserRows("SEQUENTIAL\nalice;1\nbob;2\n\n")).to.equal(2);
    expect(countUserRows("")).to.equal(0);
  });
});
