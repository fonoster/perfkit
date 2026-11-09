/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { expect } from "chai";
import {
  buildSippRoles,
  countUserRows,
  registerUsersFileOf,
  shareSizeOf,
  splitUsers,
  uacUsersFileOf
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
        instance: 1,
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
        instance: 1,
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

  it("should put the run id in every Call-ID so they never repeat across runs", () => {
    // Act
    const roles = buildSippRoles({
      benchmark: soakConfig(),
      runId: "20261108T120000Z-abcdef0",
      uutIp: "10.0.0.2",
      loadgenIp: "10.0.0.3",
      registerUsers: 200
    });

    // Assert
    expect(flagsOf(roles[0]!.args)).to.include(
      "-cid_str register-20261108t120000z-abcdef0-%u-%p@%s"
    );
    expect(flagsOf(roles[1]!.args)).to.include(
      "-cid_str uac-20261108t120000z-abcdef0-%u-%p@%s"
    );
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

describe("buildSippRoles with several uac instances", () => {
  const input = (benchmark: ReturnType<typeof capacityWithCallees>) => ({
    benchmark,
    runId: "RUN1",
    uutIp: "10.0.0.2",
    loadgenIp: "10.0.0.3",
    registerUsers: 200
  });

  it("should bind an instance on another load generator to that machine's address", () => {
    // Arrange
    const benchmark = capacityWithCallees({
      instances: 3,
      rate: { start: 3, step: 3, every: "60s", max: 60 }
    });

    // Act
    const roles = buildSippRoles({
      ...input(benchmark),
      uacIps: { 2: "10.0.0.9" }
    });

    // Assert
    const bound = (instance: number) => {
      const spec = roles.find(
        (role) => role.role === "uac" && role.instance === instance
      );
      return spec!.args[spec!.args.indexOf("-i") + 1];
    };
    expect([bound(1), bound(2), bound(3)]).to.deep.equal([
      "10.0.0.3",
      "10.0.0.9",
      "10.0.0.3"
    ]);
    const callee = roles.find(({ role }) => role === "register");
    expect(callee!.args[callee!.args.indexOf("-i") + 1]).to.equal("10.0.0.3");
  });

  it("should split a capacity ramp's rate and open calls among the instances", () => {
    // Arrange
    const benchmark = capacityWithCallees({
      instances: 4,
      rate: { start: 100, step: 100, every: "60s", max: 400 }
    });

    // Act
    const roles = buildSippRoles(input(benchmark));

    // Assert
    const uacs = roles.filter(({ role }) => role === "uac");
    expect(uacs.map(({ instance }) => instance)).to.deep.equal([1, 2, 3, 4]);
    expect(roles.filter(({ role }) => role !== "uac")).to.have.length(4);
    uacs.forEach(({ args, instance }) => {
      const flags = flagsOf(args);
      expect(flags).to.include("-r 25 -rp 1000 -rate_increase 25");
      expect(flags).to.include("-rate_max 100");
      // max 400 x (5 s hold + 20 s) = 10,000 calls, a quarter each
      expect(flags).to.include("-l 2500");
      expect(flags).to.include(`-p ${5080 + instance - 1} `);
      expect(flags).to.include(
        `-cid_str ${instance === 1 ? "uac" : `uac${instance}`}-run1-%u-%p@%s`
      );
      expect(flags).to.include(`-inf /raw/${uacUsersFileOf(instance)}`);
      expect(flags).to.not.include("/project/one-soak/callers.csv");
    });
  });

  it("should divide a soak's rate and give every instance a distinct port and Call-ID", () => {
    // Arrange
    const benchmark = soakBenchmarkConfigSchema.parse({
      ...soakConfig(),
      load: { ...soakConfig().load, instances: 3, rate: { cps: 100 } }
    });

    // Act
    const uacs = buildSippRoles(input(benchmark as never)).filter(
      ({ role }) => role === "uac"
    );

    // Assert
    expect(uacs).to.have.length(3);
    expect(uacs.map(({ args }) => args[args.indexOf("-r") + 1])).to.deep.equal([
      "34",
      "33",
      "33"
    ]);
    const cids = uacs.map(({ args }) => args[args.indexOf("-cid_str") + 1]);
    expect(new Set(cids).size).to.equal(3);
  });

  it("should split a ramp that does not divide evenly into whole numbers per instance", () => {
    // Arrange: 50 over 8 is 6.25, which SIPp's -rate_increase rejects
    const benchmark = capacityWithCallees({
      instances: 8,
      rate: { start: 50, step: 50, every: "30s", max: 3000 }
    });

    // Act
    const uacs = buildSippRoles(input(benchmark)).filter(
      ({ role }) => role === "uac"
    );

    // Assert
    const valuesOf = (flag: string) =>
      uacs.map(({ args }) => Number(args[args.indexOf(flag) + 1]));
    const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
    [
      ["-r", 50],
      ["-rate_increase", 50],
      ["-rate_max", 3000]
    ].forEach(([flag, total]) => {
      const values = valuesOf(flag as string);
      expect(values.every(Number.isInteger), `${flag} whole`).to.equal(true);
      expect(sum(values), `${flag} total`).to.equal(total);
    });
    expect(valuesOf("-r")).to.deep.equal([7, 7, 6, 6, 6, 6, 6, 6]);
  });

  it("should throw when a soak's rate is below the number of instances", () => {
    // Arrange
    const benchmark = soakBenchmarkConfigSchema.parse({
      ...soakConfig(),
      load: { ...soakConfig().load, instances: 3, rate: { cps: 2 } }
    });

    // Act and assert
    expect(() => buildSippRoles(input(benchmark as never))).to.throw(
      "cannot be split among 3 SIPp instances"
    );
  });

  it("should keep the whole users file for a single instance", () => {
    // Arrange
    const benchmark = capacityWithCallees();

    // Act
    const uacs = buildSippRoles(input(benchmark)).filter(
      ({ role }) => role === "uac"
    );

    // Assert
    expect(uacs).to.have.length(1);
    expect(flagsOf(uacs[0]!.args)).to.include(
      "-inf /project/one-soak/callers.csv"
    );
  });
});

describe("buildSippRoles with several callee instances", () => {
  const roles = (instances: number, extra = {}) => {
    const benchmark = capacityWithCallees({
      instances,
      rate: { start: 100, step: 100, every: "60s", max: 400 }
    });
    return buildSippRoles({
      benchmark,
      runId: "RUN1",
      uutIp: "10.0.0.2",
      loadgenIp: "10.0.0.3",
      registerUsers: 200,
      ...extra
    });
  };
  const calleesOf = (list: ReturnType<typeof roles>) =>
    list.filter(({ role }) => role === "register");

  it("should start one callee per instance, each with its own port, Call-ID and share of the users", () => {
    // Act
    const callees = calleesOf(roles(3));

    // Assert
    expect(callees.map(({ instance }) => instance)).to.deep.equal([1, 2, 3]);
    const port = (args: string[]) => args[args.indexOf("-p") + 1];
    expect(callees.map(({ args }) => port(args))).to.deep.equal([
      "5070",
      "5200",
      "5201"
    ]);
    callees.forEach(({ args, instance }) => {
      const flags = flagsOf(args);
      expect(flags).to.include(
        `-cid_str ${instance === 1 ? "register" : `register${instance}`}-run1-%u-%p@%s`
      );
      expect(flags).to.include(`-inf /raw/${registerUsersFileOf(instance)}`);
      expect(flags).to.include(`-key uas_port ${port(args)}`);
      expect(flags).to.include("-oocsf /project/one-soak/uas_answer.xml");
    });
    // 200 users dealt to 3 callees: 67, 67 and 66
    expect(
      callees.map(({ args }) => args[args.indexOf("-m") + 1])
    ).to.deep.equal(["67", "67", "66"]);
  });

  it("should keep the whole register users file for a single callee", () => {
    // Act
    const callees = calleesOf(roles(1));

    // Assert
    expect(callees).to.have.length(1);
    expect(flagsOf(callees[0]!.args)).to.include(
      "-inf /project/one-soak/callees.csv"
    );
    expect(flagsOf(callees[0]!.args)).to.include("-m 200 ");
  });

  it("should bind a callee on another load generator to that machine's address", () => {
    // Act
    const callees = calleesOf(roles(3, { calleeIps: { 2: "10.0.0.9" } }));

    // Assert
    const bound = (instance: number) => {
      const { args } = callees.find((spec) => spec.instance === instance)!;
      return args[args.indexOf("-i") + 1];
    };
    expect([bound(1), bound(2), bound(3)]).to.deep.equal([
      "10.0.0.3",
      "10.0.0.9",
      "10.0.0.3"
    ]);
  });

  it("should keep the uas alone as one process when there is no register", () => {
    // Arrange: a soak whose callees are a uas only
    const base = soakConfig();
    const benchmark = soakBenchmarkConfigSchema.parse({
      ...base,
      load: {
        ...base.load,
        register: undefined,
        instances: 3,
        rate: { cps: 100 }
      }
    });

    // Act
    const list = buildSippRoles({
      benchmark: benchmark as never,
      runId: "RUN1",
      uutIp: "10.0.0.2",
      loadgenIp: "10.0.0.3",
      registerUsers: 0
    });

    // Assert
    expect(list.filter(({ role }) => role === "uas")).to.have.length(1);
    expect(list.filter(({ role }) => role === "register")).to.have.length(0);
  });

  it("should never give a callee a port a uac uses", () => {
    // Act: 64 instances, the most there can be: 64 callees and 64 uacs
    const list = roles(64);
    const ports = list.map(({ args }) => args[args.indexOf("-p") + 1]);

    // Assert
    expect(ports).to.have.length(128);
    expect(new Set(ports).size).to.equal(128);
  });
});

describe("shareSizeOf", () => {
  it("should count the rows each of the round-robin shares gets", () => {
    expect([1, 2, 3].map((i) => shareSizeOf(200, 3, i))).to.deep.equal([
      67, 67, 66
    ]);
    expect([1, 2, 3, 4].map((i) => shareSizeOf(10, 4, i))).to.deep.equal([
      3, 3, 2, 2
    ]);
    expect(shareSizeOf(200, 1, 1)).to.equal(200);
  });

  it("should agree with splitUsers", () => {
    // Arrange
    const text = `SEQUENTIAL\n${Array.from({ length: 23 }, (_, i) => `u${i}`).join("\n")}\n`;

    // Act
    const shares = splitUsers(text, 5).map((share) => countUserRows(share));

    // Assert
    expect(shares).to.deep.equal(
      [1, 2, 3, 4, 5].map((i) => shareSizeOf(23, 5, i))
    );
  });
});

describe("splitUsers", () => {
  it("should deal the rows out round-robin, each share with the mode line", () => {
    // Act
    const shares = splitUsers("SEQUENTIAL\na\nb\nc\nd\ne\n", 2);

    // Assert
    expect(shares).to.deep.equal([
      "SEQUENTIAL\na\nc\ne\n",
      "SEQUENTIAL\nb\nd\n"
    ]);
  });

  it("should throw when there are fewer users than instances", () => {
    expect(() => splitUsers("SEQUENTIAL\na\n", 2)).to.throw(
      "the users file has 1 users, fewer than the 2 SIPp instances"
    );
  });
});
