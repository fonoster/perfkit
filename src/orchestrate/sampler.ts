/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import {
  calleeProcessName,
  uacProcessName
} from "../analyze/measureCapacityStep.js";
import {
  roleOf,
  SAMPLE_INTERVAL_S,
  SIPP_PROCESS,
  type SippRole
} from "./constants.js";
import type { Host } from "./types.js";

/**
 * The sampler, a busybox sh script run in an alpine container with
 * `--pid host --network host`: `sh sampler.sh <host> <spec file> <out dir>`.
 * Every 10 s it appends to `<out>/sampler-<host>.jsonl` one line per
 * process whose command line matches a spec regex (`name<TAB>regex` per
 * line), with #2's fields, and to `<out>/udp-<host>.jsonl` the UDP counters
 * of /proc/net/snmp. The regexes are read from the spec file, so the
 * sampler's own command line never matches them.
 */
export const SAMPLER_SCRIPT = String.raw`#!/bin/sh
host="$1"; spec="$2"; out="$3"
clk=$(getconf CLK_TCK 2>/dev/null || echo 100)
mkdir -p "$out"
while :; do
  t=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  ps -o pid,args | awk -v self="$$" -v spec="$spec" '
    BEGIN { while ((getline line < spec) > 0) { split(line, f, "\t"); n++; name[n] = f[1]; re[n] = f[2] } }
    NR > 1 && $1 != self {
      pid = $1; $1 = ""
      for (i = 1; i <= n; i++) if ($0 ~ re[i]) print pid "\t" name[i]
    }' | while IFS="$(printf '\t')" read -r pid name; do
    [ -r "/proc/$pid/stat" ] || continue
    rss=$(awk '/^VmRSS:/ { print $2 }' "/proc/$pid/status" 2>/dev/null)
    ticks=$(sed 's/.*) //' "/proc/$pid/stat" 2>/dev/null | awk '{ print $12 + $13 }')
    fds=$(ls "/proc/$pid/fd" 2>/dev/null | wc -l)
    [ -n "$ticks" ] || continue
    [ -n "$rss" ] || rss=0
    printf '{"t":"%s","host":"%s","name":"%s","pid":%d,"rssKB":%d,"cpuTicks":%d,"clkTck":%d,"fds":%d}\n' \
      "$t" "$host" "$name" "$pid" "$rss" "$ticks" "$clk" "$fds" >> "$out/sampler-$host.jsonl"
  done
  awk -v t="$t" -v host="$host" '
    /^Udp:/ { k++; if (k == 1) { for (i = 2; i <= NF; i++) h[i] = $i } else { for (i = 2; i <= NF; i++) v[h[i]] = $i } }
    END { printf "{\"t\":\"%s\",\"host\":\"%s\",\"RcvbufErrors\":%d,\"SndbufErrors\":%d,\"InErrors\":%d}\n", t, host, v["RcvbufErrors"], v["SndbufErrors"], v["InErrors"] }
  ' /proc/net/snmp >> "$out/udp-$host.jsonl"
  sleep ${SAMPLE_INTERVAL_S}
done
`;

/**
 * The sampler spec for one host: the UUT's processes from perfkit.yaml, or
 * the load generator's SIPp roles, matched by their Call-ID prefix flag
 * (with the lane's prefix, `k8s-` for a cluster benchmark). With several uac
 * or callee instances each is its own process name (`sipp-uac`, `sipp-uac-2`,
 * `sipp-register-2`, ...), so the load generator's saturation is judged per
 * SIPp process.
 */
export function buildSamplerSpec(
  host: Host,
  processes: ReadonlyArray<{ name: string; match: string }>,
  prefix = "",
  uacInstances = 1,
  calleeInstances = 1
): string {
  const roles = (Object.keys(SIPP_PROCESS) as SippRole[]).flatMap((role) =>
    Array.from(
      { length: role === "uac" ? uacInstances : calleeInstances },
      (_, i) => ({
        name:
          role === "uac"
            ? uacProcessName(i + 1)
            : calleeProcessName(role, i + 1),
        role: roleOf(role, i + 1)
      })
    )
  );
  const entries =
    host === "uut"
      ? processes.map(({ name, match }) => [name, match])
      : roles.map(({ name, role }) => [
          name,
          `sipp .*-cid_str ${prefix}${role}-`
        ]);
  return entries.map(([name, match]) => `${name}\t${match}\n`).join("");
}

/** The OpenTelemetry Collector config: OTLP/HTTP in, a JSON lines file out. */
export function buildOtelcolConfig(listenIp: string, file: string): string {
  return [
    "receivers:",
    "  otlp:",
    "    protocols:",
    "      http:",
    `        endpoint: ${listenIp}:4318`,
    "exporters:",
    "  file:",
    `    path: ${file}`,
    "service:",
    "  pipelines:",
    "    traces:",
    "      receivers: [otlp]",
    "      exporters: [file]",
    ""
  ].join("\n");
}
