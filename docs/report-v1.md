# report.json v1 and runs.json v1

Every perfkit run writes one `report.json` (`schema: perfkit/report/v1`), and each project keeps
one `runs.json` (`schema: perfkit/runs/v1`), the history index of its runs. Check either with
`perfkit validate <file>`. The JSON Schemas are
[schemas/report-v1.schema.json](../schemas/report-v1.schema.json) and
[schemas/runs-v1.schema.json](../schemas/runs-v1.schema.json); the examples are in
[examples/reports/](../examples/reports/) (passed, failed, first run, not run) and
[examples/runs.json](../examples/runs.json).

## Versioning

The field names, enums and units below are the v1 contract. A breaking change to either format
is a new schema version (`perfkit/report/v2`, `perfkit/runs/v2`) and a major perfkit release,
and old reports must still render. Adding a check that rejects files a v1 perfkit accepted is a
breaking change too.

Rules for both files:

- Unknown keys are rejected everywhere.
- Timestamps are UTC, ISO 8601, like `2026-11-03T14:12:10Z`.
- A run id is `<startedAt as YYYYMMDDTHHMMSSZ>-<first 7 of commit>`, like
  `20261103T141210Z-bd3254a`.
- A field is required unless the tables say otherwise.

## report.json

### Top level

| Field | Type | Notes |
| :--- | :--- | :--- |
| `schema` | `perfkit/report/v1` | |
| `project` | object | From perfkit.yaml. See [project](#project). |
| `run` | object | See [run](#run). |
| `verdict` | object | Counts of benchmark verdicts. See [verdict](#verdict). |
| `benchmarks` | list | One entry per benchmark in perfkit.yaml, including those not run. |

### project

| Field | Type | Notes |
| :--- | :--- | :--- |
| `project.name`, `repo`, `siteUrl`, `accent`, `title`, `lead` | string | Copied from perfkit.yaml. |
| `project.logoSvg` | string | The SVG markup of `project.logo`, inlined. Present only when perfkit.yaml has `logo`. |

### run

| Field | Type | Notes |
| :--- | :--- | :--- |
| `run.id` | string | The run id, from `startedAt` and `commit`. |
| `run.version` | string | The `--target-version` the run tested, like `2.31.5`. |
| `run.commit` | string | The project's git commit, 7 to 40 hex digits. |
| `run.startedAt`, `run.endedAt` | timestamp | |
| `run.infra.provider` | `digitalocean` or `local` | `local` for `perfkit run --local`, where both roles run on one machine's Docker; sizes then read `local`. |
| `run.infra.region` | string | |
| `run.infra.uut`, `run.infra.loadgen` | object | `size` (slug), `vcpus` and `memoryMB` of each droplet. |
| `run.infra.os` | string | The droplets' OS, like `Ubuntu 24.04`. |
| `run.infra.docker` | string | The droplets' Docker version. |
| `run.images` | map of name to image | Each image as run, pinned by digest: `name:tag@sha256:<64 hex>`. |
| `run.tools.perfkit` | string | Required. |
| `run.tools.sipp` | string | Required. |
| `run.tools.otelcol` | string | Present only when a benchmark had `telemetry.otlp: true`. |
| `run.command` | string | The command that started the run. |

### verdict

`total`, `passed`, `failed`, `inconclusive`, `aborted` and `notRun`, whole numbers. It counts
every benchmark in perfkit.yaml: `total` is the number of benchmarks, and each other count is the
number of benchmarks with that verdict.

### benchmarks

Every benchmark carries:

| Field | Type | Notes |
| :--- | :--- | :--- |
| `id`, `kind`, `title` | string | From perfkit.yaml. `kind` is `capacity` or `soak`. |
| `narrative` | object | `what`, `why` and `how`, from perfkit.yaml. |
| `unit` | string | `load.unit` from perfkit.yaml, a lowercase plural noun: what one SIPp call is (`calls`, `messages`). The page writes rates as `<n> <unit>/s`. |
| `verdict` | string | `passed`, `failed`, `inconclusive`, `aborted` or `not-run`. |
| `reason` | string or null | For `inconclusive`, `aborted` and `not-run`: a lowercase clause with no final period, like `the server under test stopped responding`; the page builds its sentences around it. `null` for `passed` and `failed`. |

What else a benchmark carries depends on its verdict:

- **`not-run`:** nothing else.
- **`passed` or `failed`:** `durationS`, `tool`, `rules`, `headline` and `resources`.
  - Capacity adds `series` and `stoppedBy`.
  - Soak adds `warmupS`, `load` and `reported`.
  - `hops` is present only when the benchmark had `telemetry.otlp: true`.
  - `passed` means every rule passed; `failed` means at least one did not.
- **`inconclusive` or `aborted`:** `durationS` and `tool`, plus whatever was collected:
  `series` (capacity) and `resources`. No `rules`, `headline` or `stoppedBy`.

| Field | Type | Notes |
| :--- | :--- | :--- |
| `durationS` | number (s) | How long the benchmark ran. |
| `warmupS` | number (s) | Soak: the warm-up, excluded from every verdict. |
| `tool` | string | The load tool as shown on the page, like `SIPp 3.7.3, UDP`. |
| `load.cps`, `load.holdS` | number | Soak: the fixed rate (calls/s) and call hold time (s). |
| `rules` | list | One entry per threshold checked: `id` (the threshold's name), `limit`, `measured` and `passed`. A soak's `memoryGrowthMBPerHour` rule has one entry per process, with `process`. |
| `resources.processes` | list | Per process in perfkit.yaml: `name` and `samples`, each `{ t, rssMB, cpuPct, fds, pid }`. |
| `hops` | object | `sampleRatio`, `spans` (count) and `services`, each `{ service, p50Ms, p99Ms }`. |

Capacity `headline`:

| Field | Type | Notes |
| :--- | :--- | :--- |
| `limitCps` | number or null | The capacity limit, calls/s. `null` when the first step broke a rule. |
| `limitIsLowerBound` | boolean | `true` when the ramp reached `rate.max` without breaking a rule: the real limit is higher. `false` when `limitCps` is `null`. |
| `p99AtLimitMs`, `p50AtLimitMs` | number or null | Latency at the limit, ms. `null` when `limitCps` is. |
| `failedAtLimitPct`, `retransmissionsAtLimitPct` | number or null | Percentages at the limit. `null` when `limitCps` is. |

Capacity `stoppedBy`: the step that ended the ramp, `{ offeredCps, rule, measured, limit }`, where
`rule` is `p99LatencyMs` or `failedCallsPct`. `null` when `limitIsLowerBound` is `true`.

Capacity `series.steps`, one entry per step:

| Field | Type | Notes |
| :--- | :--- | :--- |
| `offeredCps`, `achievedCps` | number | Calls/s SIPp was asked for, and placed. |
| `calls`, `failed`, `retransmissions` | integer | Counts in the step. |
| `failuresByReason` | map of reason to count | Like `{ "408": 3 }`. |
| `p50Ms`, `p95Ms`, `p99Ms` | number | INVITE to 200 OK latency, ms. |
| `sippCpuPct`, `uutCpuPct` | number | CPU of SIPp and of the unit under test, %. |
| `loadgenUdpDrops`, `uutUdpDrops` | integer | UDP receive drops on each droplet. |
| `valid` | boolean | Whether the step's measurement counts, for example `false` when the load generator, not the unit under test, was the bottleneck. |

Soak `headline`: `memoryGrowthMBPerHour` (the highest of the processes, MB/h), `calls`,
`registrations` and `registerFailures`.

Soak `reported`, shown but never part of the verdict: `p99FirstHourMs`, `p99LastHourMs`,
`maxOpenFds` (a map of process name to count) and `maxConcurrentCalls`.

## runs.json

| Field | Type | Notes |
| :--- | :--- | :--- |
| `schema` | `perfkit/runs/v1` | |
| `project` | string | The project's name. |
| `runs` | list | Ordered by `startedAt`, newest first. May be empty. |
| `runs[].id` | string | The run id, from `startedAt` and `commit`. |
| `runs[].startedAt` | timestamp | |
| `runs[].version`, `runs[].commit` | string | As in the run's report. |
| `runs[].path` | string | The run's directory, relative to runs.json, like `runs/20261103T141210Z-bd3254a/`. |
| `runs[].verdict` | object | The report's `verdict`. |
| `runs[].benchmarks` | list | Per benchmark: `id`, `kind`, `verdict` and `headline`. |

A benchmark's `headline` in runs.json is:

- `passed` or `failed`, capacity: `{ limitCps, p99AtLimitMs }`, both `null` when no step passed;
- `passed` or `failed`, soak: `{ memoryGrowthMBPerHour }`;
- `not-run`, `inconclusive` and `aborted`: `null`.
