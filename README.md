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
- `ssh` and `ssh-keygen` (OpenSSH) on the machine that runs `perfkit run`.
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
            [--out <dir>] [--detach] [--dry-run]
```

Creates the run's infrastructure on DigitalOcean, runs the benchmarks on it, and deletes it at
the end. In `infra.region` of `perfkit.yaml`, it creates, in this order:

1. an SSH key (see `PERFKIT_SSH_KEY` below);
2. a new VPC, `perfkit-<run id>`, whose range DigitalOcean assigns, so parallel runs never
   collide;
3. two `ubuntu-24-04-x64` droplets in it, `perfkit-<run id>-uut` and
   `perfkit-<run id>-loadgen`, tagged `perfkit` and `perfkit-run-<run id>`;
4. a firewall, `perfkit-<run id>`: SIP (5060-5063 tcp/udp) and OTLP (4318 tcp) from the VPC only,
   SSH (22) from this machine's public IP only (from `https://api.ipify.org`).

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
| `--detach` | off | Hand the run off to an agent on the droplets and exit. |
| `--dry-run` | off | Print the plan and create nothing. Needs no token. |

| Environment | Meaning |
| :--- | :--- |
| `DIGITALOCEAN_TOKEN` | Required, except with `--dry-run`. Never printed, never written to a file, `report.json` or a droplet. |
| `PERFKIT_SSH_KEY` | Optional ed25519 private key, in OpenSSH format, without a passphrase. When set, the run looks its public key up in the account by fingerprint and reuses it, or registers it as `perfkit-shared`. That key is never deleted, by teardown or by sweep, so parallel runs share it. Without it, the run creates `perfkit-<run id>` for this run only and deletes it at teardown. |

`--dry-run` resolves the digests on Docker Hub and prints the plan:

```console
$ npx perfkit run --config perf/perfkit.yaml --target-version 2.31.6 --dry-run
plan for Routr 2.31.6 (dry run, nothing created)
  region     nyc3, new VPC (range assigned by DigitalOcean)
  uut        c-8   ubuntu-24-04-x64
  loadgen    c-16  ubuntu-24-04-x64
  firewall   SIP (5060-5063 tcp/udp) and OTLP (4318 tcp) from the VPC only; SSH (22) from 203.0.113.7 only
  tags       perfkit, perfkit-run-20261103T141210Z-bd3254a
  images     fonoster/routr-edgeport:2.31.6@sha256:8bca…1866
             fonoster/routr-echo:2.31.6@sha256:14a4…a43f
             fonoster/routr-one:2.31.6@sha256:8433…1801
  benchmarks edgeport-echo (capacity, up to 100 min at 50 to 5,000 calls/s)
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
droplets, and `perfkit collect` or `perfkit sweep` deletes them.

> The benchmarks themselves are not implemented yet: until they are, a run without `--dry-run`
> provisions, fails with `benchmarks are not implemented yet` (exit 3), and deletes everything.

| Exit code | Meaning |
| :--- | :--- |
| 0 | Ok, every benchmark passed. |
| 1 | Report written, at least one benchmark not passed. |
| 2 | Bad config, flags or a missing token; nothing was created. |
| 3 | Infrastructure error; everything this run created is deleted, no report. |
| 130 | Cancelled; everything deleted. |

Each error is one line on stderr:

```text
perfkit: DIGITALOCEAN_TOKEN is not set; nothing was created
perfkit: image fonoster/routr-echo:2.31.9 not found on Docker Hub; nothing was created
perfkit: --commit is required outside a git checkout
perfkit: could not create droplet perfkit-20261103T141210Z-bd3254a-uut in nyc3: <DigitalOcean message>. Everything this run created was deleted.
perfkit: could not delete droplet 512034567 (perfkit-20261103T141210Z-bd3254a-uut) after 3 attempts: <message>. Run: perfkit sweep --run 20261103T141210Z-bd3254a
```

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
