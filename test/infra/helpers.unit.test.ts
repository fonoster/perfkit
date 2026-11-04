/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { expect } from "chai";
import { parse } from "yaml";
import {
  buildCloudInit,
  buildFirewall,
  fingerprintOf,
  formatAge,
  formatDeleteFailure,
  parseDuration
} from "../../src/infra/index.js";

const KEY =
  "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIDAZbm5lqowXKhI6QIOxZAjDtlAeJ//b1K+BZZDGJlZR test";

describe("buildCloudInit", () => {
  it("should install Docker with compose and set the buffers and open-file limits", () => {
    // Act
    const text = buildCloudInit({ authorizedKeys: [] });
    const config = parse(text);

    // Assert
    expect(text.startsWith("#cloud-config\n")).to.equal(true);
    const files = Object.fromEntries(
      (config.write_files as Array<{ path: string; content: string }>).map(
        ({ path, content }) => [path, content]
      )
    );
    expect(files["/etc/sysctl.d/90-perfkit.conf"]).to.equal(
      [
        "net.core.rmem_max = 26214400",
        "net.core.wmem_max = 26214400",
        "net.core.rmem_default = 26214400",
        "net.core.wmem_default = 26214400",
        ""
      ].join("\n")
    );
    expect(files["/etc/security/limits.d/90-perfkit.conf"]).to.include(
      "* hard nofile 1048576"
    );
    expect(files["/etc/systemd/system.conf.d/90-perfkit.conf"]).to.include(
      "DefaultLimitNOFILE=1048576"
    );
    expect(JSON.parse(files["/etc/docker/daemon.json"]!)).to.deep.equal({
      "default-ulimits": {
        nofile: { Name: "nofile", Soft: 1048576, Hard: 1048576 }
      }
    });
    expect(config.runcmd).to.include("sh /tmp/get-docker.sh");
    expect(config.runcmd).to.include("docker compose version");
    expect(files["/root/.ssh/authorized_keys"]).to.equal(undefined);
  });

  it("should append the given keys to root's authorized_keys", () => {
    // Act
    const config = parse(buildCloudInit({ authorizedKeys: [KEY] }));

    // Assert
    const file = (config.write_files as Array<Record<string, unknown>>).find(
      ({ path }) => path === "/root/.ssh/authorized_keys"
    );
    expect(file).to.deep.equal({
      path: "/root/.ssh/authorized_keys",
      content: `${KEY}\n`,
      owner: "root:root",
      permissions: "0600",
      append: true,
      defer: true
    });
  });
});

describe("buildFirewall", () => {
  it("should open SIP and OTLP to the VPC, SSH to the sources, and all outbound", () => {
    // Act
    const firewall = buildFirewall({
      name: "perfkit-x",
      vpcRange: "10.1.0.0/20",
      sshSources: ["203.0.113.7/32"],
      dropletIds: [1, 2]
    });

    // Assert
    expect(
      firewall.inbound_rules.map(
        ({ protocol, ports, sources }) =>
          `${protocol} ${ports} ${sources.addresses?.join(",")}`
      )
    ).to.deep.equal([
      "udp 5060-5063 10.1.0.0/20",
      "tcp 5060-5063 10.1.0.0/20",
      "tcp 4318 10.1.0.0/20",
      "tcp 22 203.0.113.7/32,10.1.0.0/20"
    ]);
    expect(
      firewall.outbound_rules.map(({ protocol }) => protocol)
    ).to.deep.equal(["tcp", "udp", "icmp"]);
    expect(firewall.droplet_ids).to.deep.equal([1, 2]);
  });
});

describe("fingerprintOf", () => {
  it("should match ssh-keygen -l -E md5", () => {
    expect(fingerprintOf(KEY)).to.equal(
      "44:5e:d5:d0:15:7f:ae:0e:60:52:79:79:1a:f2:8e:4b"
    );
  });

  it("should throw for text that is not a public key", () => {
    expect(() => fingerprintOf("nope")).to.throw(/expected a public key/);
  });
});

describe("parseDuration", () => {
  it("should read seconds, minutes and hours", () => {
    expect(["30s", "10m", "9h"].map(parseDuration)).to.deep.equal([
      30000, 600000, 32400000
    ]);
  });

  it("should throw for anything else", () => {
    expect(() => parseDuration("9 hours")).to.throw(/expected a duration/);
  });
});

describe("formatAge", () => {
  it("should print hours and two-digit minutes", () => {
    expect(
      [544, 42, 1620].map((minutes) => formatAge(minutes * 60000))
    ).to.deep.equal(["9h04m", "0h42m", "27h00m"]);
  });
});

describe("formatDeleteFailure", () => {
  it("should name the resource, the reason and the sweep command", () => {
    expect(
      formatDeleteFailure(
        {
          kind: "droplet",
          id: "512034567",
          name: "perfkit-20261103T141210Z-bd3254a-uut",
          reason: "after 3 attempts: Droplet is locked"
        },
        "20261103T141210Z-bd3254a"
      )
    ).to.equal(
      "could not delete droplet 512034567 (perfkit-20261103T141210Z-bd3254a-uut) after 3 attempts: Droplet is locked. Run: perfkit sweep --run 20261103T141210Z-bd3254a"
    );
  });
});
