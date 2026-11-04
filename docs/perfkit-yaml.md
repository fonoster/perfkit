# perfkit.yaml v1

`perf/perfkit.yaml` holds one project's benchmark definitions. It starts with
`apiVersion: perfkit/v1`. Check it with `perfkit validate perf/perfkit.yaml`; the JSON Schema is
[schemas/perfkit-v1.schema.json](../schemas/perfkit-v1.schema.json).

Rules for the whole file:

- Unknown keys are rejected everywhere.
- Durations are `<n>s`, `<n>m` or `<n>h`, for example `30s`, `10m` or `6h`.
- Every path is relative to the directory of the perfkit.yaml file, and the file must exist.
  `perfkit validate` checks this.
- A field without a default is required, unless the table says it is optional.

## Top level

| Field | Type | Required | Default | Notes |
| :--- | :--- | :--- | :--- | :--- |
| `apiVersion` | `perfkit/v1` | yes | | Tells perfkit which format this is. |
| `project` | object | yes | | See [project](#project). |
| `infra` | object | yes | | See [infra](#infra). |
| `images` | map of name to image | yes | | At least one. See [images](#images). |
| `benchmarks` | list | yes | | At least one. See [benchmarks](#benchmarks). |

## project

| Field | Type | Required | Default | Notes |
| :--- | :--- | :--- | :--- | :--- |
| `project.name` | string | yes | | Shown in the page's nav when there is no logo. |
| `project.repo` | string | yes | | GitHub `owner/name`, like `fonoster/routr`. |
| `project.siteUrl` | URL | yes | | Where the report pages are published, like `https://routr.io/benchmarks`. |
| `project.accent` | string | yes | | 6-digit hex color, like `#5FCFCE`: the page's accent color. |
| `project.logo` | path | no | none | An `.svg` file. Without it, the nav shows `project.name`. |
| `project.title` | string | yes | | The page's headline. |
| `project.lead` | string | yes | | The paragraph under the headline. |

## infra

| Field | Type | Required | Default | Notes |
| :--- | :--- | :--- | :--- | :--- |
| `infra.provider` | `digitalocean` | no | `digitalocean` | The only provider in v1. |
| `infra.region` | string | yes | | A DigitalOcean region slug, like `nyc3`. Both droplets run there. |
| `infra.uut.size` | string | yes | | Droplet size slug of the unit under test, a dedicated-CPU size like `c-8`. |
| `infra.loadgen.size` | string | yes | | Droplet size slug of the load generator, like `c-16`. |
| `infra.maxLifetime` | duration | no | `9h` | The sweep deletes this run's droplets after this long. |

## images

A map from a short name (the key) to an image. At least one image is required. Each entry is
either:

- An image name without a tag or digest, like `edgeport: fonoster/routr-edgeport`. The tag is
  `--target-version`.
- An object `{ name, tagSuffix }`. `name` is an image name without a tag or digest; the tag is
  `--target-version` followed by `tagSuffix`. `tagSuffix` matches `[A-Za-z0-9._-]+`. With
  `--target-version 2.32.0`, this entry runs `fonoster/routr-edgeport:2.32.0-go-experimental`:

  ```yaml
  images:
    edgeport: fonoster/routr-edgeport
    edgeportGo:
      name: fonoster/routr-edgeport
      tagSuffix: -go-experimental
  ```

perfkit pins each image by digest when the run starts, so `--dry-run` shows the digests the run
will use. Each image reaches the Compose file as `PERFKIT_IMAGE_<KEY>`: the key in uppercase,
with every character other than `A-Z` and `0-9` turned into `_`. Uppercasing removes camelCase,
so `edgeportGo` becomes `PERFKIT_IMAGE_EDGEPORTGO` (not `EDGEPORT_GO`) and `edgeport-go` becomes
`PERFKIT_IMAGE_EDGEPORT_GO`. In `report.json`, `run.images` maps each key to the pinned image,
like `fonoster/routr-edgeport:2.32.0-go-experimental@sha256:…`.

## benchmarks

Each benchmark has a `kind`: `capacity` ramps the load up to find a limit; `soak` holds a steady
load for hours to catch leaks. Fields marked *capacity* or *soak* belong to that kind only, and
the other kind rejects them.

| Field | Type | Required | Default | Notes |
| :--- | :--- | :--- | :--- | :--- |
| `id` | string | yes | | `[a-z0-9-]+`, unique in the file. |
| `kind` | `capacity` or `soak` | yes | | |
| `title` | string | yes | | |
| `narrative.what` | string | yes | | What runs. Shown on the page. |
| `narrative.why` | string | yes | | Why it matters. |
| `narrative.how` | string | yes | | How the load is driven and what the verdict checks. |
| `duration` | duration | *soak*: yes | | How long the load runs. |
| `warmup` | duration | *soak*: yes; *capacity*: no (`0s`) | | *soak*: excluded from every verdict. *capacity*: the first step still runs its full `every`, but its measurement starts `warmup` after the step starts, so a cold server's first seconds don't count. Shorter than `load.rate.every`. |
| `uut.compose` | path | yes | | The Compose file the unit under test runs. |
| `uut.setup` | path | no | none | A script that runs once the unit under test is up, for example to seed data. |
| `uut.processes` | list | yes | | At least one. Sampled every 10 s. |
| `uut.processes[].name` | string | yes | | The name shown in the report. |
| `uut.processes[].match` | regex | yes | | Matched against each process's command line. All matching processes are summed. |
| `load.tool` | `sipp` | yes | | The only tool in v1. |
| `load.transport` | `udp` | yes | | The only transport in v1. |
| `load.port` | integer | no | `5060` | The unit under test's SIP port SIPp sends to. |
| `load.uac.scenario` | path | yes | | The SIPp scenario that places calls. |
| `load.uac.users` | path | no | none | A SIPp injection CSV for the callers. |
| `load.register.scenario` | path | *soak*: yes, if `register` is set | | `load.register` is optional, soak only: it registers agents before the calls. |
| `load.register.users` | path | *soak*: yes, if `register` is set | | The agents to register (CSV). |
| `load.register.expires` | integer (seconds) | no | `300` | The registration lifetime. |
| `load.uas.scenario` | path | *soak*: yes, if `uas` is set | | `load.uas` is optional, soak only: the SIPp scenario that answers calls. |
| `load.hold` | duration | no | `0s` | How long each call stays up before BYE. |
| `load.unit` | string | no | `calls` | What one SIPp call is, as a lowercase plural noun shown on the page (`calls`, `messages`). Copied into each report.json benchmark as `unit`. |
| `load.rate.start` | number (calls/s) | *capacity*: yes | | The first step's rate. |
| `load.rate.step` | number (calls/s) | *capacity*: yes | | Added at each step. |
| `load.rate.every` | duration | *capacity*: yes | | How long each step lasts. |
| `load.rate.max` | number (calls/s) | *capacity*: yes | | The ramp stops here. Reaching it without breaking a rule makes the limit a lower bound. |
| `load.rate.cps` | number (calls/s) | *soak*: yes | | The fixed rate. Keep it well below saturation: a soak looks for leaks, not limits. |
| `telemetry` | object | no | `{ otlp: false }` | |
| `telemetry.otlp` | boolean | yes, if `telemetry` is set | | Collect OpenTelemetry spans, for the report's per-service hops. |
| `telemetry.sampleRatio` | number, more than 0, at most 1 | no | `0.01` | The share of calls traced. |
| `thresholds` | object | yes | | Exactly the thresholds of the kind, below. |

Thresholds:

| Field | Kind | Unit | Notes |
| :--- | :--- | :--- | :--- |
| `thresholds.p99LatencyMs` | capacity | ms | p99 time from INVITE to 200 OK. A step at or above it breaks the rule. |
| `thresholds.failedCallsPct` | capacity, soak | % (0 to 100) | Failed calls. |
| `thresholds.memoryGrowthMBPerHour` | soak | MB/h | Memory growth of each process after the warm-up. |
| `thresholds.restarts` | soak | count | Process restarts allowed. |

`capacity` requires exactly `p99LatencyMs` and `failedCallsPct`. `soak` requires exactly
`memoryGrowthMBPerHour`, `failedCallsPct` and `restarts`.

## Routr's perfkit.yaml

The complete example, also in [examples/routr/perfkit.yaml](../examples/routr/perfkit.yaml):

```yaml
apiVersion: perfkit/v1
project:
  name: Routr
  repo: fonoster/routr
  siteUrl: https://routr.io/benchmarks
  accent: "#5FCFCE"               # 6-digit hex; the page's accent color
  logo: logo.svg                  # optional SVG; without it the nav shows project.name
  title: How much SIP traffic Routr handles.
  lead: We run these tests after significant changes to the code, on dedicated DigitalOcean servers, one for Routr and one for the load generator. The EdgePort runs alone to find its limit; the whole stack runs for hours to catch leaks.
infra:
  provider: digitalocean          # the only provider in v1
  region: nyc3
  uut: { size: c-8 }              # unit under test, a dedicated-CPU slug
  loadgen: { size: c-16 }         # load generator
  maxLifetime: 9h                 # sweep deletes this run's droplets after this
images:                           # tag comes from --target-version, pinned by digest at start
  edgeport: fonoster/routr-edgeport
  echo: fonoster/routr-echo
  one: fonoster/routr-one
benchmarks:
  - id: edgeport-echo
    kind: capacity
    title: EdgePort + Echo
    narrative:
      what: The EdgePort on its own, with Echo answering every request with 200 OK. No Dispatcher, Connect or database, so this is a ceiling for EdgePort alone, not for a full deployment.
      why: The EdgePort is the only stateful piece of Routr. When it saturates, calls fail, no matter what runs behind it.
      how: SIPp places calls (INVITE, 200, ACK, BYE after 1 s) over UDP and adds 50 calls/s every minute. The run stops at the first step where p99 reaches 50 ms or failed calls reach 0.1%.
    uut:
      compose: edgeport-echo/compose.yaml
      processes:                  # sampled every 10 s; match is a regex on the command line
        - { name: edgeport, match: "io\\.routr\\.Launcher" }
        - { name: echo, match: "/usr/local/bin/run" }
    load:
      tool: sipp
      transport: udp
      port: 5060                  # the UUT's SIP port SIPp sends to; default 5060
      uac: { scenario: edgeport-echo/uac_message.xml }
      unit: messages
      rate: { start: 50, step: 50, every: 60s, max: 5000 }
    thresholds: { p99LatencyMs: 50, failedCallsPct: 0.1 }
  - id: one-soak
    kind: soak
    title: RoutrOne, six hours
    narrative:
      what: The whole stack in one image, EdgePort plus Dispatcher, Connect, Location and the data service in one Node process, routing calls between registered agents.
      why: Leaks only show after hours. A short test can pass while memory climbs until the process is killed in production.
      how: SIPp holds a steady 100 calls/s for six hours, with 200 registered callee agents, each called by its own caller agent through Connect. After a 30-minute warm-up, each process's memory may grow at most 5 MB/h.
    duration: 6h
    warmup: 30m                   # excluded from every verdict
    uut:
      compose: one-soak/compose.yaml
      setup: one-soak/seed.js   # optional; runs once the UUT is up
      processes:
        - { name: one, match: "dist/runner" }
        - { name: edgeport, match: "io\\.routr\\.Launcher" }
        - { name: postgres, match: "postgres" }   # all matching processes are summed
    load:
      tool: sipp
      transport: udp
      register: { scenario: one-soak/uac_register.xml, users: one-soak/callees.csv, expires: 300 }
      uas: { scenario: one-soak/uas_answer.xml }
      uac: { scenario: one-soak/uac_invite.xml, users: one-soak/callers.csv }
      hold: 30s
      rate: { cps: 100 }          # fixed and well below saturation: a soak looks for leaks, not limits
    telemetry: { otlp: true, sampleRatio: 0.01 }
    thresholds: { memoryGrowthMBPerHour: 5, failedCallsPct: 0.1, restarts: 0 }
```
