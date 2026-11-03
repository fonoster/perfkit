/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
/**
 * Fake hosts for the orchestration tests. Each host's /opt/perfkit is a
 * temporary directory; a command without `docker` in it runs for real with
 * `sh` after its paths are rewritten, and a docker command is recorded and
 * answered by `onDocker`. No test reaches the network or a Docker engine.
 */
import { execFile } from "node:child_process";
import {
  cp,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  writeFile
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SshResult } from "../../src/infra/index.js";
import { REMOTE_ROOT } from "../../src/orchestrate/constants.js";
import { createNodeAgentFs } from "../../src/orchestrate/createNodeAgentFs.js";
import type { AgentFs, Host, HostShell } from "../../src/orchestrate/types.js";

export const OK: SshResult = { code: 0, stdout: "", stderr: "" };
export const DOCKER_INFO = "8;17179869184;Ubuntu 24.04.1 LTS;27.3.1\n";
export const SIPP_VERSION =
  " SIPp v3.7.3-27-gdde43e1-TLS-SCTP-PCAP-SHA256.\n\n This program is free software\n";

export interface Recorded {
  host: Host;
  command: string;
  /** Who ran it: the CLI or the agent. */
  by: "cli" | "agent";
}

export type DockerHandler = (
  host: Host,
  command: string,
  by: "cli" | "agent"
) => Promise<SshResult | undefined>;

function sh(command: string): Promise<SshResult> {
  return new Promise((resolve) => {
    execFile(
      "sh",
      ["-c", command],
      { encoding: "utf8" },
      (error, stdout, stderr) =>
        resolve({
          code: error ? (typeof error.code === "number" ? error.code : 1) : 0,
          stdout,
          stderr
        })
    );
  });
}

/** Two hosts, or one with `shared` (--local), backed by temp directories. */
export class FakeHosts {
  roots!: Record<Host, string>;
  commands: Recorded[] = [];
  uploads: Array<{
    host: Host;
    localPath: string;
    remotePath: string;
    files: Record<string, string>;
  }> = [];
  /** Extra docker answers, tried before the defaults. */
  onDocker: DockerHandler = async () => undefined;
  /** Called when the CLI starts the agent container. */
  onAgentStart: (host: Host, command: string) => Promise<void> = async () => {};
  /** Hosts that stop answering: their commands exit 255. */
  down = new Set<Host>();

  private constructor(private readonly remoteRoot: string) {}

  static async create(options: { local?: string } = {}): Promise<FakeHosts> {
    const hosts = new FakeHosts(options.local ?? REMOTE_ROOT);
    if (options.local) {
      await mkdir(options.local, { recursive: true });
      hosts.roots = { uut: options.local, loadgen: options.local };
    } else {
      hosts.roots = {
        uut: await mkdtemp(join(tmpdir(), "perfkit-uut-")),
        loadgen: await mkdtemp(join(tmpdir(), "perfkit-loadgen-"))
      };
    }
    return hosts;
  }

  get local(): boolean {
    return (
      this.roots.uut === this.roots.loadgen &&
      this.remoteRoot === this.roots.uut
    );
  }

  /** A host path on the fake disk. */
  map(host: Host, path: string): string {
    return this.local
      ? path
      : path.split(this.remoteRoot).join(this.roots[host]);
  }

  exec = async (
    host: Host,
    command: string,
    by: "cli" | "agent"
  ): Promise<SshResult> => {
    this.commands.push({ host, command, by });
    if (this.down.has(host))
      return { code: 255, stdout: "", stderr: "timeout" };
    if (command === "true") return OK;
    if (/\bdocker\b/.test(command)) {
      const answer = await this.onDocker(host, command, by);
      if (answer) return answer;
      return this.defaultDocker(host, command);
    }
    return sh(this.map(host, command));
  };

  private async defaultDocker(host: Host, command: string): Promise<SshResult> {
    if (command.includes("docker info")) return { ...OK, stdout: DOCKER_INFO };
    if (
      command.includes(" -v") &&
      command.includes("sipp") &&
      command.includes("--rm")
    ) {
      return { ...OK, stdout: SIPP_VERSION };
    }
    if (command.includes("--version") && command.includes("opentelemetry")) {
      return { ...OK, stdout: "otelcol-contrib version 0.112.0\n" };
    }
    if (command.includes("compose") && command.includes(" ps ")) {
      return {
        ...OK,
        stdout: `{"Service":"uas","State":"running","Health":""}\n`
      };
    }
    if (/-agent .*node .*dist\/cli\.js agent/.test(command)) {
      await this.onAgentStart(host, command);
      return { ...OK, stdout: "f00d\n" };
    }
    return OK;
  }

  upload = async (host: Host, localPath: string, remotePath: string) => {
    const target = this.map(host, remotePath);
    await cp(localPath, target, { recursive: true, force: true });
    this.uploads.push({
      host,
      localPath,
      remotePath,
      files: await readTree(target)
    });
  };

  download = async (host: Host, remotePath: string, localPath: string) => {
    if (this.down.has(host)) throw new Error("timeout");
    await cp(this.map(host, remotePath), localPath, {
      recursive: true,
      force: true
    });
  };

  /** The agent's shell: every command goes through the same fake hosts. */
  agentShell: HostShell = (host, command) => this.exec(host, command, "agent");

  /** The agent's file system: /opt/perfkit is the load generator's root. */
  agentFs(): AgentFs {
    const fs = createNodeAgentFs();
    const m = (path: string) => this.map("loadgen", path);
    return {
      readFile: (path) => fs.readFile(m(path)),
      writeFile: (path, text) => fs.writeFile(m(path), text),
      appendFile: (path, text) => fs.appendFile(m(path), text),
      readdir: (path) => fs.readdir(m(path)),
      mkdir: (path) => fs.mkdir(m(path)),
      rename: (from, to) => fs.rename(m(from), m(to)),
      exists: (path) => fs.exists(m(path))
    };
  }

  /** Every file on both fake disks, by path. */
  async disks(): Promise<Record<string, string>> {
    return {
      ...(await readTree(this.roots.uut)),
      ...(await readTree(this.roots.loadgen))
    };
  }
}

/** Every file under `dir`, relative path to content. */
export async function readTree(dir: string): Promise<Record<string, string>> {
  const entries = await readdir(dir, {
    recursive: true,
    withFileTypes: true
  }).catch(() => []);
  const files = await Promise.all(
    entries
      .filter((entry) => entry.isFile())
      .map(async (entry) => {
        const path = join(entry.parentPath, entry.name);
        return [
          path.slice(dir.length + 1),
          await readFile(path, "utf8")
        ] as const;
      })
  );
  return Object.fromEntries(files);
}

/** A stand-in perfkit package: dist/cli.js, package.json and one dependency. */
export async function fakePackage(version: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "perfkit-pkg-"));
  await mkdir(join(dir, "dist"), { recursive: true });
  await writeFile(join(dir, "dist", "cli.js"), "// perfkit\n");
  await writeFile(
    join(dir, "package.json"),
    JSON.stringify({ name: "perfkit", version, dependencies: { yaml: "^2" } })
  );
  await mkdir(join(dir, "node_modules", "yaml"), { recursive: true });
  await writeFile(
    join(dir, "node_modules", "yaml", "package.json"),
    JSON.stringify({ name: "yaml" })
  );
  await mkdir(join(dir, "node_modules", "mocha"), { recursive: true });
  await writeFile(
    join(dir, "node_modules", "mocha", "package.json"),
    JSON.stringify({ name: "mocha" })
  );
  return dir;
}

/** Writes raw files, as SIPp and the sampler would, into a host directory. */
export async function writeRaw(
  dir: string,
  files: Record<string, string>
): Promise<void> {
  await mkdir(dir, { recursive: true });
  await Promise.all(
    Object.entries(files).map(([name, text]) =>
      writeFile(join(dir, name), text)
    )
  );
}
