# Setting up a project's perf/ folder

A project keeps its benchmarks in `perf/`: `perf/perfkit.yaml` ([perfkit-yaml.md](perfkit-yaml.md))
and the files it names, the compose files, an optional setup script and the SIPp scenarios.
perfkit copies the whole directory of `perfkit.yaml` (without `.git`, `node_modules` and
`.perfkit`) to `/opt/perfkit/project` on both droplets, and runs everything from there.
[examples/minimal/](../examples/minimal/) is a complete template: one capacity benchmark
against a SIPp UAS that stands in for the server.

```sh
npx -y github:fonoster/perfkit#vX.Y.Z run --local --config perf/perfkit.yaml --target-version <tag>
```

checks a project's benchmarks on the local Docker before a real run.

## The compose file

Each benchmark's `uut.compose` is the server under test. perfkit runs, on the UUT droplet,

```sh
cd /opt/perfkit/project && docker compose -p <name> -f <uut.compose> up -d
```

with these variables, which the compose file uses as `${PERFKIT_...}`:

| Variable | Value |
| :--- | :--- |
| `PERFKIT_IMAGE_<NAME>` | One per entry of `images:`, pinned by digest, like `PERFKIT_IMAGE_EDGEPORT=fonoster/routr-edgeport:2.31.5@sha256:4f1c…`. `<NAME>` is the key in uppercase, any other character turned into `_`. |
| `PERFKIT_UUT_IP` | The UUT's private (VPC) IP. |
| `PERFKIT_LOADGEN_IP` | The load generator's private IP. |
| `PERFKIT_VPC_CIDR` | The VPC range, like `10.20.0.0/24`. |
| `PERFKIT_OTLP_ENDPOINT` | `http://<load generator IP>:4318`, with `telemetry.otlp` only. |
| `PERFKIT_TRACE_RATIO` | `telemetry.sampleRatio`, like `0.01`, with `telemetry.otlp` only. |
| `PERFKIT_TARGET_VERSION` | `--target-version`. |

With `--local`, both IPs are `127.0.0.1` and the range is `127.0.0.0/8`.

**Host networking.** Every service must use `network_mode: host`: Docker's UDP port publishing
distorts the results at these rates. perfkit refuses a service without it before it creates
anything (exit 2):

```text
perfkit: sipp-uas/compose.yaml: service uas must use network_mode: host (Docker's UDP port publishing distorts the results); nothing was created
```

The firewall lets SIP in on 5060 to 5063 (UDP and TCP) and OTLP on 4318 from the VPC, so the
server listens on a port in that range.

**Healthchecks.** The UUT is up when every service is `running`, and `healthy` when it has a
`healthcheck`, within 5 minutes; otherwise the run ends with exit 3. Give a service a healthcheck
when it needs time to be ready after it starts, such as a database.

**Processes.** `uut.processes` names the processes the sampler follows on the UUT: every 10 s it
records memory, CPU and open files of each process whose command line matches `match`, a regular
expression. Several matching processes are summed under one name.

## The setup script

`uut.setup`, when set, runs once per benchmark, after the UUT is up and before SIPp starts, on the
load generator:

```sh
docker run --rm --network host -v /opt/perfkit/project:/project -w /project <the PERFKIT_* env> node:22-alpine node <uut.setup>
```

Use it to provision the server, such as the users and domains the SIPp scenarios call. It has
the same variables as compose. A non-zero exit ends the run with exit 3. It never gets
`DIGITALOCEAN_TOKEN` or any SSH key.

## SIPp scenarios

perfkit runs SIPp 3.7 (`SIPP_IMAGE` in `src/tools.ts`) on the load generator, one container per
role, with host networking. The `uac` role and the callees send to
`<PERFKIT_UUT_IP>:<load.port>`. perfkit passes no `-s`: a scenario builds its own Request-URI,
from SIPp's keywords and the users file. Every role gets:

```text
-t u1 -buff_size 4194304 -trace_rtt -rtt_freq 1000 -trace_stat -fd 10 -trace_counts -trace_err -trace_error_codes -nostdin
-cid_str <role>-%u-%p@%s
```

The Call-ID prefix tells the roles' calls apart: each SIPp runs as PID 1 in its container, so the
default Call-IDs would collide.

| Role | Port | Flags |
| :--- | :--- | :--- |
| capacity `uac` | 5080 | `-sf <load.uac.scenario> -r <start> -rp 1000 -rate_increase <step> -rate_interval <every in s> -rate_max <max> -no_rate_quit -l <max × (hold + 10 s)> -d <hold ms>`, and `-inf <load.uac.users>` when set |
| soak `uac` | 5080 | `-sf <load.uac.scenario> -r <cps> -rp 1000 -l <cps × (hold + 10 s)> -d <hold ms>`, and `-inf <load.uac.users>` when set |
| soak callees (`register`) | 5070 | `-sf <load.register.scenario> -oocsf <load.uas.scenario> -inf <load.register.users> -m <rows> -r 20 -l <rows> -key expires <expires> -key refresh_ms <expires / 2 × 1000> -key uas_port 5070` |
| soak `uas`, without `register` | 5070 | `-sf <load.uas.scenario> -l <cps × (hold + 10 s)>` |

`<rows>` is the number of rows of the register users file after its first line. The callees are
**one SIPp process**: the register scenario's endless REGISTER loop is the main scenario, and the
INVITEs that arrive out of call are answered by the uas scenario on the same socket. Routr
records a registration at the address of the REGISTER's top Via, not at its Contact, so the agent
that registers has to be the one that answers. Its stat files are named after the register
scenario.

What a scenario must do:

- The request perfkit measures carries `start_rtd="1"` on its `<send>`, and its 200 OK carries
  `rtd="1"` on its `<recv>`. Latency is the time between them; nothing else is measured.
- The hold is passed as `-d <hold ms>`, so the scenario uses `<pause/>` with no value. A capacity
  benchmark with a request that needs no hold, such as MESSAGE, leaves `load.hold` out.
- A users file (`-inf`) is SIPp's: a first line like `SEQUENTIAL`, then one row per user, with
  `;` between fields used as `[field0]`, `[field1]` and so on. It may carry more columns than
  perfkit needs, such as the callee in `[field2]`.
- A register scenario loops for ever: REGISTER, its 200 OK, a pause of `refresh_ms`, and again.
  `expires`, `refresh_ms` and `uas_port` are `-key` values, used as `[expires]`,
  `[refresh_ms]` and `[uas_port]`.

Two SIPp 3.7 limits to work with, not against:

- A pause can't take its length from a key: `<pause milliseconds="[refresh_ms]"/>` is rejected.
  Assign the key to a variable and use `<pause variable="…"/>`.
- Digest authentication takes its credentials from the `[authentication …]` keyword; carry the
  user's password as a users-file column, like `[authentication username=[field0]
  password=[field3]]`.

## What a benchmark leaves

The agent writes each benchmark's raw results to `/opt/perfkit/raw/<benchmark id>/`, and
`perfkit collect` downloads them to `<out>/<run id>/raw/<benchmark id>/`:

| File | What |
| :--- | :--- |
| `meta.json` | When SIPp started and stopped, the tool line, and the capacity steps that ran or the soak's load. |
| `<scenario>_<pid>_.csv`, `_rtt.csv`, `_counts.csv`, `_error_codes.csv` | SIPp's own traces, one set per role. |
| `sampler.jsonl` | Every 10 s, the UUT's processes and the load generator's SIPp roles (`sipp-uac`, `sipp-register`). |
| `udp.jsonl` | Every 10 s, both hosts' UDP buffer errors, from `/proc/net/snmp`. |
| `spans.jsonl` | With `telemetry.otlp`, the spans the OpenTelemetry Collector received. |
| `aborted` | Why the benchmark was aborted, when it was. |
| `done` | Written last. |

The verdicts come from these files only, with the rules in the README's
[How verdicts are computed](../README.md#how-verdicts-are-computed).
