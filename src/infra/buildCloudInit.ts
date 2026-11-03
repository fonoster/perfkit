/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { stringify } from "yaml";

const BUFFER_BYTES = 26214400;
const OPEN_FILES = 1048576;

/**
 * The cloud-init user data of a perfkit droplet: Docker Engine with the
 * compose plugin, 25 MiB socket buffers, and 1048576 open files for logins,
 * services and containers. It holds no secrets. `authorizedKeys`, given for
 * the UUT only, are appended to root's authorized_keys.
 */
export function buildCloudInit(input: { authorizedKeys: string[] }): string {
  const sysctl = [
    "net.core.rmem_max",
    "net.core.wmem_max",
    "net.core.rmem_default",
    "net.core.wmem_default"
  ]
    .map((key) => `${key} = ${BUFFER_BYTES}\n`)
    .join("");
  const limits = ["*", "root"]
    .flatMap((who) => [
      `${who} soft nofile ${OPEN_FILES}\n`,
      `${who} hard nofile ${OPEN_FILES}\n`
    ])
    .join("");
  const daemon = JSON.stringify({
    "default-ulimits": {
      nofile: { Name: "nofile", Soft: OPEN_FILES, Hard: OPEN_FILES }
    }
  });

  const writeFiles: Array<Record<string, unknown>> = [
    { path: "/etc/sysctl.d/90-perfkit.conf", content: sysctl },
    { path: "/etc/security/limits.d/90-perfkit.conf", content: limits },
    {
      path: "/etc/systemd/system.conf.d/90-perfkit.conf",
      content: `[Manager]\nDefaultLimitNOFILE=${OPEN_FILES}\n`
    },
    { path: "/etc/docker/daemon.json", content: `${daemon}\n` },
    ...(input.authorizedKeys.length > 0
      ? [
          {
            path: "/root/.ssh/authorized_keys",
            content: input.authorizedKeys.map((key) => `${key}\n`).join(""),
            owner: "root:root",
            permissions: "0600",
            append: true,
            defer: true
          }
        ]
      : [])
  ];

  const config = {
    package_update: true,
    packages: ["ca-certificates", "curl"],
    write_files: writeFiles,
    runcmd: [
      "sysctl --system",
      "systemctl daemon-reexec",
      "curl -fsSL https://get.docker.com -o /tmp/get-docker.sh",
      "sh /tmp/get-docker.sh",
      "systemctl enable --now docker",
      "docker compose version"
    ]
  };
  return `#cloud-config\n${stringify(config, { lineWidth: 0 })}`;
}
