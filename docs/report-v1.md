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
| `project.faviconSvg` | string | The SVG markup of `project.favicon`, inlined. Every page links it as its icon (a URL-encoded `data:image/svg+xml` URI). Present only when perfkit.yaml has `favicon`. |
| `project.live.url` | URL | Where the latest page polls live.json: `project.live.url`, else `live.url`, else `https://<live.domain>/live.json` of perfkit.yaml. Absent without them. |

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
| `run.infra.cluster` | object | Optional: only when the run had a Kubernetes cluster. `provider` (`digitalocean` or `kind`), `nodes`, `size` (the node slug, `local` for kind) and `version` (like `1.33.1-do.0`). |
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
| `target` | `server` or `cluster` | Optional: where the unit under test ran, the single server (`uut.compose`) or the Kubernetes cluster (`uut.helm`). Reports from earlier perfkit versions lack it; the page then shows no target. |
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
| `load.cps`, `load.holdS` | number | Soak: the rate it ran at (calls/s) and call hold time (s). |
| `load.rateSource` | object | Soak, optional: only with `rate.fromCapacity`. `fromCapacity` (the capacity benchmark), `limit` (its limit in calls/s, or null when it found none or did not run, so `fallbackCps` ran), `fraction`, and `lowerBound: true` when the limit is a lower bound (the ramp reached `max`, or the load generator gave out first). |
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
`rule` is `p99LatencyMs` or `failedCallsPct`. A step may carry `spike: true` (optional, so older reports stay valid): it broke a rule but the next step passed, so it did not end the ramp. `null` when `limitIsLowerBound` is `true`.

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

## live.json

`schema: perfkit/live/v1`, JSON Schema in [schemas/live-v1.schema.json](../schemas/live-v1.schema.json).
The agent rewrites it every 15 seconds for the whole run (a temporary file, then a rename) and
serves it; nothing is kept after the run. Every number in it is preliminary: verdicts come only
from report.json.

| Field | Type | Notes |
| :--- | :--- | :--- |
| `runId`, `version`, `commit`, `startedAt` | | As in report.json. |
| `updatedAt` | timestamp | When this snapshot was written. |
| `status` | `running`, `finished` or `failed` | `failed` when the agent stopped the run; `reason` says why. |
| `estimatedEndAt` | timestamp or null | While running: the planned time left of the running benchmark and every queued one, plus a fixed allowance per benchmark. |
| `provider` | `digitalocean` or `local` | |
| `project` | object | As report.json's `project`. |
| `benchmarks` | list | Every benchmark of perfkit.yaml, in order. |

Every benchmark has `id`, `title`, `unit`, `kind`, `state` (`queued`, `running`, `done` or
`not-run`, the last for one not selected), `startedAt` (compose up), `loadStartedAt` (SIPp's
start), `estimatedStartAt` (queued only) and `plannedS`. Then by kind:

- **capacity:** `rate` (`start`, `step`, `everyS`, `max`), `thresholds`, `current` (`index`,
  `total`, `offeredCps` of the step offered now, from the clock), `points` (each step as the
  agent judged it when it ended: `offeredCps`, `achievedCps`, `calls`, `failed`, `p50Ms`,
  `p95Ms`, `p99Ms`, `failedPct`, `ok`, `stopReason`), `heldCps` (the last step that passed) and,
  once done, `result` (`limitCps`, `lowerBound`, `stopReason`).
- **soak:** `cps`, `warmupS`, `durationS`, `elapsedS`, `thresholds`, `calls` (`placed`, `failed`
  so far, SIPp's counters since the load started) and `memory`: per process, its raw RSS
  (`samples` of `t`, `rssMB`, at most 300, evenly spaced) and `growthMBPerHour`, the verdict's
  least-squares slope, `null` until there is a full hour of samples after the warm-up.
