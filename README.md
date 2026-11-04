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

## Prerequisites

- Node 22 or later, and npm 11 to run perfkit from a git tag (see below).
- `ssh`, `scp` and `ssh-keygen` (OpenSSH) on the machine that runs `perfkit run` or `perfkit
  collect`. `perfkit run --local` needs Docker instead, with host networking (on Docker Desktop,
  turn on host networking in its settings).
- For `perfkit run` and `perfkit sweep`, a DigitalOcean API token in `DIGITALOCEAN_TOKEN`. Create
  it with custom scopes, and grant these, under DigitalOcean's scope names:

  | Resource | Scopes |
  | :--- | :--- |
  | Droplet | `droplet:create`, `droplet:read`, `droplet:delete` |
  | VPC | `vpc:create`, `vpc:read`, `vpc:delete` |
  | Firewall | `firewall:create`, `firewall:read`, `firewall:update`, `firewall:delete` |
  | SSH key | `ssh_key:create`, `ssh_key:read`, `ssh_key:delete` |
  | Tag | `tag:create`, `tag:read`, `tag:delete` |

  DigitalOcean adds the read scopes these depend on when you pick them. `perfkit run --dry-run`
  needs no token.

> [!WARNING]
> **A run costs money.** Each `perfkit run` creates two dedicated-CPU droplets, at the sizes in
> `infra.uut.size` and `infra.loadgen.size` of `perfkit.yaml`, and they bill by the hour while
> they exist: about 15 to 100 minutes for a capacity benchmark, and about 7 hours for a soak.
> perfkit deletes them at the end of every run, whatever the exit; `perfkit sweep` is the
> fallback for a run that was killed before it could.

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

## perfkit run

```sh
perfkit run --config <perfkit.yaml> --target-version <tag> [--commit <sha>] [--benchmarks <id,id>]
            [--out <dir>] [--detach] [--dry-run] [--local]
```

Creates the run's infrastructure on DigitalOcean, runs the benchmarks on it, and deletes it at
the end. In `infra.region` of `perfkit.yaml`, it creates, in this order:

1. an SSH key (see `PERFKIT_SSH_KEY` below);
2. a new VPC, `perfkit-<run id>`, whose range DigitalOcean assigns, so parallel runs never
   collide;
3. two `ubuntu-22-04-x64` droplets in it, `perfkit-<run id>-uut` and
   `perfkit-<run id>-loadgen`, tagged `perfkit` and `perfkit-run-<run id>`;
4. a firewall, `perfkit-<run id>`: from the VPC: all ports (tcp and udp) and icmp, so the load
   generator reaches the server's API and the server reaches the callees; SSH (22) from this machine's public IP (from `https://api.ipify.org`) and from the VPC, where the agent on the load generator reaches the server under test.

Both droplets get Docker Engine with the compose plugin, 25 MiB socket buffers
(`net.core.rmem_max`, `wmem_max`, `rmem_default`, `wmem_default`) and 1048576 open files, through
cloud-init, which holds no secrets. perfkit waits until both droplets are active and
`cloud-init status --wait` has finished over SSH, for at most 10 minutes. Every image runs by the
digest its tag had when the run started.

| Flag | Default | Meaning |
| :--- | :--- | :--- |
| `--config <perfkit.yaml>` | required | The project's benchmark definitions. |
| `--target-version <tag>` | required | The image tag under test, for every image in `perfkit.yaml`. `--version` prints perfkit's own version. |
| `--commit <sha>` | `git rev-parse HEAD` in the directory of the config file | The commit under test; part of the run id. Outside a git checkout it is required. |
| `--benchmarks <id,id>` | every benchmark | Run only these benchmarks. |
| `--out <dir>` | `.perfkit` | Where the run writes its files. |
| `--detach` | off | Return once the agent on the load generator has started; `perfkit collect` finishes the run. |
| `--dry-run` | off | Print the plan and create nothing. Needs no token. |
| `--local` | off | Run on this machine's Docker instead of DigitalOcean. Needs no token. |

| Environment | Meaning |
| :--- | :--- |
| `DIGITALOCEAN_TOKEN` | Required, except with `--dry-run`. Never printed, never written to a file, `report.json` or a droplet. |
| `PERFKIT_NAME_PREFIX` | Optional; containers and compose projects are named `<prefix>-<run id>-<what>`, `perfkit` by default. |
| `PERFKIT_SSH_KEY` | Optional ed25519 private key, in OpenSSH format, without a passphrase. When set, the run looks its public key up in the account by fingerprint and reuses it, or registers it as `perfkit-shared`. That key is never deleted, by teardown or by sweep, so parallel runs share it. Without it, the run creates `perfkit-<run id>` for this run only and deletes it at teardown. |

`--dry-run` resolves the digests on Docker Hub and prints the plan:

```console
$ npx perfkit run --config perf/perfkit.yaml --target-version 2.31.6 --dry-run
plan for Routr 2.31.6 (dry run, nothing created)
  region     nyc3, new VPC (range assigned by DigitalOcean)
  uut        c-8   ubuntu-22-04-x64
  loadgen    c-16  ubuntu-22-04-x64
  firewall   from the VPC: all ports (tcp/udp) and icmp; SSH (22) from 203.0.113.7 and the VPC only
  tags       perfkit, perfkit-run-20261103T141210Z-bd3254a
  images     fonoster/routr-edgeport:2.31.6@sha256:8bca…1866
             fonoster/routr-echo:2.31.6@sha256:14a4…a43f
             fonoster/routr-one:2.31.6@sha256:8433…1801
  benchmarks edgeport-echo (capacity, up to 100 min at 50 to 5,000 messages/s)
             one-soak (soak, 6 h 30 min)
  deleted    at the end, or by sweep after 9h
$ echo $?
0
```

A capacity benchmark runs at most `(max - start) / step + 1` steps of `every` each; a soak runs
its `warmup` plus its `duration`.

**Teardown.** perfkit deletes everything the run created, in reverse order (firewall, droplets,
VPC, SSH key), on every exit path: success, a failed benchmark, an error, a create that failed
part-way, and Ctrl-C, SIGINT or SIGTERM. DigitalOcean deletes only an empty VPC, so perfkit waits
up to 5 minutes for the VPC's members to go before it deletes it. Each delete is tried 3 times.
The one exception is `--detach`: once the agent on the droplets has started, the run keeps its
droplets, and `perfkit collect` or `perfkit sweep` deletes them. Without `--detach`, the same
holds while `run` follows the run: it deletes everything at the end, as `perfkit collect` does.

**What runs where.** Once the droplets are ready, perfkit copies the directory of `perfkit.yaml`
to `/opt/perfkit/project` on both, and its own package (`dist/`, `package.json` and the
production `node_modules`) to `/opt/perfkit/agent` on the load generator. It then starts the
agent there, `perfkit agent`, as a detached `node:22-alpine` container with the Docker socket
mounted, so the run goes on if this machine disconnects. The agent runs every benchmark in order:
`docker compose up` of the benchmark's compose file on the UUT, a wait until every service is
running (and healthy, with a healthcheck) for at most 5 minutes, the setup script, the samplers,
the OpenTelemetry Collector for telemetry, and SIPp. A capacity ramp is checked step by step and
SIPp stops at the first step that breaks a rule or doesn't count. Then `docker compose down`, and
the next benchmark. [docs/project-setup.md](docs/project-setup.md) is what a project's compose
files, setup script and SIPp scenarios get.

Without `--detach`, `run` then follows the run like `perfkit collect` and prints its progress:

```console
$ DIGITALOCEAN_TOKEN=… npx -y github:fonoster/perfkit#v0.1.0 run --config perf/perfkit.yaml --target-version 2.31.5
plan for Routr 2.31.5 (run 20261103T141210Z-bd3254a)
…
[edgeport-echo] step    50 messages/s  p99 4.1 ms  failed 0.00%  ok
[edgeport-echo] step 1,300 messages/s  p99 62.0 ms  failed 0.05%  over the p99 limit; stopping
[edgeport-echo] passed: limit 1,250 messages/s
[one-soak] passed: memory one +1.8 MB/h, edgeport +0.3 MB/h, postgres +0.1 MB/h; failed calls 0.01%; restarts 0
deleted 2 droplets, firewall, VPC, SSH key
report .perfkit/20261103T141210Z-bd3254a/report.json  (2 of 2 benchmarks passed)
```

The run's files are in `<out>/<run id>/`: `report.json` and `raw/<benchmark id>/`, the raw
results the verdicts come from. A benchmark left out with `--benchmarks` is in the report as
`not-run`.

**The agent's key.** The agent reaches the UUT over SSH with a key pair made for this run only:
its public key goes into the UUT's `authorized_keys` and its private key onto the load generator,
and both go with the droplets. Neither `DIGITALOCEAN_TOKEN` nor `PERFKIT_SSH_KEY` is ever copied
to a droplet. Without `PERFKIT_SSH_KEY`, the run's own login key is kept in
`~/.perfkit/runs/<run id>/` so that `perfkit collect` on this machine can log in.

**`--local`.** The same run on this machine's Docker: no droplets, firewall, VPC, SSH keys or
token. The UUT's compose project and the agent, SIPp, sampler and collector containers all run
locally with host networking; `PERFKIT_UUT_IP` and `PERFKIT_LOADGEN_IP` are `127.0.0.1` and
`PERFKIT_VPC_CIDR` is `127.0.0.0/8`. `report.json` says `provider: local`, with the vCPUs and
memory of `docker info`. The run lives in `~/.perfkit/runs/<run id>/` until it is collected. Use it
to check a project's benchmarks before a real run; its numbers are not comparable with one, and
on an arm64 machine SIPp (amd64 only) runs emulated.

```console
$ npx -y github:fonoster/perfkit#v0.1.0 run --local --config examples/minimal/perfkit.yaml --target-version 3.7.3
plan for Minimal 3.7.3 (local run 20261103T210141Z-bff8fc4)
  hosts      this machine's Docker, for the server under test and the load generator
  images     pumpagubben/sipp:3.7.3@sha256:ceef…5dd1
  benchmarks sipp-uas (capacity, up to 4 min at 50 to 200 messages/s)
[sipp-uas] step    50 messages/s  p99 1.0 ms  failed 0.00%  ok
…
[sipp-uas] passed: limit at least 200 messages/s
removed the run's containers
report .perfkit/20261103T210141Z-bff8fc4/report.json  (1 of 1 benchmarks passed)
```

| Exit code | Meaning |
| :--- | :--- |
| 0 | Ok, every benchmark passed; with `--detach`, the agent started. |
| 1 | Report written, at least one benchmark not passed. |
| 2 | Bad config, flags or a missing token, or a compose service without `network_mode: host`; nothing was created. |
| 3 | Infrastructure error, or the UUT was not up within 5 minutes; everything this run created is deleted, no report. |
| 130 | Cancelled; everything deleted. Benchmarks not finished are `aborted` (`the run was cancelled`), and the report is written if one finished. |

Each error is one line on stderr:

```text
perfkit: DIGITALOCEAN_TOKEN is not set; nothing was created
perfkit: image fonoster/routr-echo:2.31.9 not found on Docker Hub; nothing was created
perfkit: --commit is required outside a git checkout
perfkit: one-soak/compose.yaml: service one must use network_mode: host (Docker's UDP port publishing distorts the results); nothing was created
perfkit: could not create droplet perfkit-20261103T141210Z-bd3254a-uut in nyc3: <DigitalOcean message>. Everything this run created was deleted.
perfkit: could not delete droplet 512034567 (perfkit-20261103T141210Z-bd3254a-uut) after 3 attempts: <message>. Run: perfkit sweep --run 20261103T141210Z-bd3254a
```

## perfkit collect

```sh
perfkit collect <run-id> [--wait] [--out <dir>] [--timeout <duration>]
```

Follows a run started with `--detach`, from this machine or another: it finds the droplets by the
tag `perfkit-run-<run id>`, adds this machine's public IP to the run's firewall, prints the
agent's progress lines, and downloads each benchmark's raw results into `<out>/<run id>/raw/` as
soon as the benchmark is done. Once the whole run is done it writes `<out>/<run id>/report.json`,
deletes everything and exits 0 or 1. For a `--local` run it reads `~/.perfkit/runs/<run id>/`
instead, and has nothing to delete but containers.

| Flag | Default | Meaning |
| :--- | :--- | :--- |
| `--wait` | off | Only wait for the run to end: never write the report, never delete. |
| `--out <dir>` | `.perfkit` | Where the run's files go. |
| `--timeout <duration>` | `5h50m` | Stop waiting after this, like `5h50m`, `90m` or `30s`: exit 4, nothing deleted. |

It logs in with `PERFKIT_SSH_KEY`, or with the run's own key in `~/.perfkit/runs/<run id>/` on
the machine that started the run. With neither: `perfkit: no SSH key for run <run id>; set
PERFKIT_SSH_KEY` (exit 2). It needs `DIGITALOCEAN_TOKEN`, except for a `--local` run.

```console
$ perfkit run --config perf/perfkit.yaml --target-version 2.31.5 --detach
run 20261103T141210Z-bd3254a started; collect it with: perfkit collect 20261103T141210Z-bd3254a
$ perfkit collect 20261103T141210Z-bd3254a --wait --timeout 5h50m
[one-soak] running, 3h12m of 6h30m
$ echo $?
4
```

- **The load generator stops responding.** When 3 reads in a row, 30 s apart, fail, every
  benchmark without results is `aborted` (`the load generator stopped responding`), the report is
  written and everything is deleted (exit 1). With no results at all there is no report (exit 3).
- **The UUT stops responding.** The agent checks the UUT every 30 s; after 3 failed checks in a
  row the benchmark is `aborted` (`the server under test stopped responding`) with the series
  collected so far, and the agent goes on to the next one.
- **Cancelled.** SIGINT or SIGTERM stops the agent, marks every unfinished benchmark `aborted`
  (`the run was cancelled`), writes the report if one benchmark finished, deletes everything and
  exits 130. During `--wait` it only exits 130.

| Exit code | Meaning |
| :--- | :--- |
| 0 | With `--wait`, the run is done; otherwise every benchmark passed. |
| 1 | Report written, at least one benchmark not passed. |
| 2 | Bad flags, a missing token, or no SSH key for the run. |
| 3 | The agent failed (for example the UUT was not up within 5 minutes), or no benchmark produced results; everything deleted unless `--wait`. |
| 4 | The timeout passed while the run goes on; nothing was deleted. |
| 130 | Cancelled. |

For GitHub, [docs/github-workflow.md](docs/github-workflow.md) has the reusable workflow that
splits a run across jobs.

## perfkit sweep

```sh
perfkit sweep [--config <perfkit.yaml>] [--run <run-id>] [--older-than <duration>] [--dry-run]
```

The backstop for a run that could not tear down, for example a killed CI job. Run it on a
schedule. It deletes droplets tagged `perfkit` and named `perfkit-<run id>-uut` or `-loadgen`
that are older than `--older-than`, and then the firewall, VPC and SSH key named
`perfkit-<run id>` of those runs. It touches nothing else: not an untagged droplet, and never the
`perfkit-shared` key.

| Flag | Default | Meaning |
| :--- | :--- | :--- |
| `--config <perfkit.yaml>` | none | Read the default of `--older-than` from its `infra.maxLifetime`. |
| `--run <run-id>` | none | Delete this run's resources, at any age. |
| `--older-than <duration>` | `infra.maxLifetime` of `--config`, else `9h` | Delete runs older than this, like `9h` or `90m`. |
| `--dry-run` | off | List what would be deleted; delete nothing. |

It needs `DIGITALOCEAN_TOKEN`.

```console
$ npx perfkit sweep --older-than 9h
deleted droplet perfkit-20261103T021210Z-41d9a2c-uut (age 9h04m)
deleted droplet perfkit-20261103T021210Z-41d9a2c-loadgen (age 9h04m)
deleted firewall, VPC and SSH key of run 20261103T021210Z-41d9a2c
$ echo $?
0
```

With nothing to delete it prints `nothing to sweep` and exits 0. It exits 2 for bad flags or a
missing token, and 3 for a DigitalOcean API error or a delete that failed.

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
- **Warm-up.** With `warmup` set, the first step still runs its full `every`, but it is measured
  only from `warmup` after it starts: calls sent, and 10-second counters whose period mid-point
  falls, before that don't count. A cold JIT (EdgePort's JVM and GraalJS) makes the first seconds
  slow; the later steps are measured whole.

perfkit checks the steps in order:

1. **Is the measurement valid?** A step is invalid when the load generator, not the server, was
   the bottleneck: SIPp used more than 80% of one core, placed less than 95% of the offered rate,
   placed more than 105% of it (a burst of calls it owed from earlier steps), or the load
   generator dropped UDP packets. Then the verdict is **inconclusive**, the reason
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
- **No calls, no response times.** The verdict is **aborted** too when the uac started no call
  after the warm-up (`no calls were placed after the warm-up`), or when SIPp left no response
  times file for it, so the p99 can't be measured.
- **Callees not registered.** With a register role, the uac starts only once every callee has
  registered. When they have not within `users / 20` + 60 seconds, no call is placed and the
  verdict is **aborted** (`only 150 of 200 callees registered within 70 s, so no call was
  placed`).
- **Memory growth.** For each process, the least-squares slope of its memory (RSS) in MB per
  hour. It fails at the threshold or above: 5.0 MB/h fails a 5 MB/h limit. The headline is the
  steepest process.
- **Failed calls.** Failed % over every call after the warm-up. It fails at the threshold or
  above.
- **Restarts.** A process whose PID changed, or that was missing from a sample, restarted once.
  A name that matches several processes, like a database and its connections, restarted when
  none of the PIDs of its previous sample is left. It fails above the threshold.

The verdict is **failed** when any rule failed and **passed** otherwise. Also reported, never
part of the verdict: p99 in the first and the last hour after the warm-up, the most open file
descriptors per process, the most concurrent calls, the registrations and their failures, and,
with telemetry, each service's p50 and p99 self time (a span's time minus its direct children's).
## perfkit render

```sh
perfkit render --report <report.json> [--history <runs.json|https URL>] --out <dir>
```

Renders one run's `report.json` into the project's benchmarks site, a static site the caller
publishes (for example under `/benchmarks` on GitHub Pages). It validates the report first, with
the same error lines as `perfkit validate`.

| Flag | Meaning |
| :--- | :--- |
| `--report <file>` | The run's `report.json`. Required. |
| `--history <file\|url>` | The published `runs.json`, as a file or an `https://` URL. A URL that answers 404 is treated as no history. Without it, this is the first run: the page has no deltas and perfkit prints `perfkit: no history: first run, deltas omitted`. |
| `--out <dir>` | The directory to write the site into. Required. |

```console
$ npx perfkit render --report .perfkit/20261103T141210Z-bd3254a/report.json \
    --history pages/benchmarks/runs.json --out out/benchmarks
wrote out/benchmarks/index.html (latest: 20261103T141210Z-bd3254a)
wrote out/benchmarks/runs/20261103T141210Z-bd3254a/index.html
wrote out/benchmarks/runs/20261103T141210Z-bd3254a/report.json
wrote out/benchmarks/runs.json (15 runs)
```

The output layout:

- `index.html`: the latest run, the one with the newest `startedAt`. It is written only when
  this run is the newest, so rendering an old report doesn't replace it.
- `runs/<id>/index.html` and `runs/<id>/report.json`: this run's own page and report.
- `runs.json`: the history, newest first, with this run inserted at its `startedAt` position. A
  run already listed (same id) is replaced, so rendering twice is safe.

Only this run's files are written: older run pages are never rewritten, so each stays as it was
published. Each page is self-contained HTML (inline CSS, charts as inline SVG, fonts from Google
Fonts, one small inline script for the run picker). What each section shows, and how the deltas
pick the run they compare with, is in [docs/report-page.md](docs/report-page.md).

| Exit code | Meaning |
| :--- | :--- |
| 0 | The site was written. |
| 1 | Usage error, such as a missing `--out`. |
| 2 | The report or the history is invalid, unreadable or of another schema. |
| 3 | The history URL could not be fetched (any error but a 404). |

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
