# perfkit

Benchmark harness for Fonoster projects: DigitalOcean runs, one report.json schema, one branded
report page.

## What perfkit is

perfkit benchmarks Fonoster projects (Routr first, then Roomr and Fonoster) the same way and
publishes the results in one format.

- **Two droplets per run.** Each run creates two dedicated-CPU DigitalOcean droplets in the same
  region and private VPC: the unit under test, and a load generator that drives it with SIPp.
  The images are pinned by digest when the run starts, and both droplets are deleted on every
  exit path.
- **One report format.** Every run writes a `report.json` (`schema: perfkit/report/v1`), and
  each project keeps a `runs.json` history index (`schema: perfkit/runs/v1`). The formats are
  the same for every project, so runs compare across releases and projects.
- **One report page.** perfkit renders `report.json` into a branded static HTML page, published
  under `/benchmarks` on the project's GitHub Pages.

A project keeps only its benchmark definitions, in `perf/perfkit.yaml` (`apiVersion:
perfkit/v1`). See [docs/perfkit-yaml.md](docs/perfkit-yaml.md) for every field and
[docs/report-v1.md](docs/report-v1.md) for `report.json` and `runs.json`. The JSON Schema files
are in [schemas/](schemas/).

## How projects pin it

perfkit is not published to npm. Releases are git tags, `vX.Y.Z`, and a project runs a tagged
release straight from GitHub:

```sh
npx -y github:fonoster/perfkit#vX.Y.Z validate perf/perfkit.yaml
```

npm clones the tag, builds it (the `prepare` script) and runs the `perfkit` command. This needs
npm 11 or later: npm 10.9, the npm that Node 22 ships with, fails on a git package that has a
`prepare` script (`GitFetcher requires an Arborist constructor to pack a tarball`). With npm 10,
run perfkit through npm 11:

```sh
npx -y npm@11 exec --yes --package=github:fonoster/perfkit#vX.Y.Z -- perfkit validate perf/perfkit.yaml
```

Pin the same tag everywhere a project calls perfkit, and read the release notes before moving to
a new one: each release says what changed for `perfkit.yaml`, the report schema and the workflow
inputs.

## perfkit validate

```sh
perfkit validate <file>
```

Checks one `perfkit.yaml`, `report.json` or `runs.json` file. It tells the formats apart by the
`apiVersion` field (`perfkit/v1`) or the `schema` field (`perfkit/report/v1`,
`perfkit/runs/v1`). For a `perfkit.yaml`, it also checks that every file it names exists,
relative to the directory of the `perfkit.yaml`.

```console
$ npx perfkit validate perf/perfkit.yaml
perf/perfkit.yaml: valid perfkit/v1 config, 2 benchmarks
$ echo $?
0
$ npx perfkit validate report.json
report.json: benchmarks[1].verdict: expected one of passed, failed, inconclusive, aborted, not-run; got "ok"
report.json: run.commit: required
$ echo $?
2
$ npx perfkit validate old.json
old.json: unknown schema "perfkit/report/v9"; this perfkit reads perfkit/v1, perfkit/report/v1, perfkit/runs/v1
$ echo $?
2
```

A valid file prints one line on stdout. Every error is one line on stderr,
`<file>: <json path>: <message>`; a problem with the file itself has no path:
`<file>: cannot read: <reason>`, `<file>: cannot parse: <reason>` or the unknown-schema line.

| Exit code | Meaning |
| :--- | :--- |
| 0 | The file is valid. |
| 1 | Usage error, such as a missing file argument. |
| 2 | The file is invalid, unreadable, malformed or of an unknown schema. |

`perfkit validate --help` lists the accepted formats, and `perfkit --version` prints the
perfkit version.

## How verdicts are computed

perfkit turns the raw results of a run into each benchmark's verdict with fixed rules, so two runs
of the same build agree. Every threshold comes from `perfkit.yaml`; none is built in. Latency is
the time from the request a scenario marks with `start_rtd="1"` to the 200 OK it marks with
`rtd="1"`, per call as SIPp records it (`-trace_rtt`). Percentiles are nearest-rank: p99 is the
value at rank ⌈0.99 × n⌉ of the sorted calls. SIPp's own averages and buckets are never used. A
failed call is one SIPp counts as failed, and CPU is in % of one core, so 100 is one full core.

### Capacity

SIPp adds load in steps, such as 50 more calls/s every minute. For each step:

- Its latency counts the calls whose request was **sent** in the step, even when the answer came
  in the next one.
- Its attempted, failed and retransmitted calls are SIPp's 10-second counters (`-trace_stat`)
  that fall in the step. Failed % is failed / attempted.

perfkit checks the steps in order:

1. **Is the measurement valid?** A step is invalid when the load generator, not the server, was
   the bottleneck: SIPp used more than 80% of one core, placed less than 95% of the offered rate,
   or the load generator dropped UDP packets. Then the verdict is **inconclusive**, the reason
   names the step and the cause, and no limit is published.
2. **Does it pass?** A step passes when p99 is **below** `p99LatencyMs` and failed % is **below**
   `failedCallsPct`. Both limits are strict: a p99 of exactly 50 ms breaks a 50 ms limit. The
   first step that breaks either rule ends the ramp.

The **limit** is the offered rate of the last step that passed, and the rules are shown at that
step, so the verdict is **passed**. When the first step already breaks a rule there is no limit
and the verdict is **failed**. When no step broke a rule, the limit is a lower bound: the server
can take more than the ramp offered.

Each step also shows retransmissions, the server's CPU (the sum of its processes) and UDP drops on
both machines. They are reported and never change the verdict.

### Soak

A soak holds a fixed rate for hours to find leaks.

- **Warm-up excluded.** Nothing measured during `warmup` counts toward any rule.
- **Too little data.** When the samples after the warm-up cover less than 90% of `duration`, the
  verdict is **aborted** and no rule is checked. A short soak configured as short, such as a
  20-minute smoke run, is fine.
- **Memory growth.** For each process, the least-squares slope of its memory (RSS) in MB per
  hour. It fails at the threshold or above: 5.0 MB/h fails a 5 MB/h limit. The headline is the
  steepest process.
- **Failed calls.** Failed % over every call after the warm-up. It fails at the threshold or
  above.
- **Restarts.** A process whose PID changed, or that was missing from a sample, restarted once.
  It fails above the threshold.

The verdict is **failed** when any rule failed and **passed** otherwise. Also reported, never
part of the verdict: p99 in the first and the last hour after the warm-up, the most open file
descriptors per process, the most concurrent calls, the registrations and their failures, and,
with telemetry, each service's p50 and p99 self time (a span's time minus its direct children's).

## Development

Node 22 (`.nvmrc`).

```sh
npm ci
npm run typecheck
npm run lint
npm test
npm run schemas   # rewrite schemas/*.schema.json after changing src/schemas; commit the result
```

Unit tests never reach the network (a mocha root hook calls `nock.disableNetConnect()`) and
never see `DIGITALOCEAN_TOKEN`.

## License

MIT
