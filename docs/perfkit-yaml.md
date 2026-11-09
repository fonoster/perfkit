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
| `live` | object | no | none | Where the agent serves live.json during a run. See [live](#live). |
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
| `project.favicon` | path | no | none | An `.svg` file: the browser tab's icon on every page. Read when the run starts and inlined into report.json and live.json. Without it, the pages have no icon. |
| `project.title` | string | yes | | The page's headline. |
| `project.lead` | string | yes | | The paragraph under the headline. |
| `project.live.url` | URL | no | `live.url`, else `https://<live.domain>/live.json` | Where the benchmarks page polls a run in progress. Goes into report.json, so the published page knows it. |

## infra

| Field | Type | Required | Default | Notes |
| :--- | :--- | :--- | :--- | :--- |
| `infra.provider` | `digitalocean` | no | `digitalocean` | The only provider in v1. |
| `infra.region` | string | yes | | A DigitalOcean region slug, like `nyc3`. Both droplets run there. |
| `infra.uut.size` | string | yes | | Droplet size slug of the unit under test, a dedicated-CPU size like `c-8`. |
| `infra.loadgen.size` | string | yes | | Droplet size slug of the load generator, like `c-16`. |
| `infra.loadgen.count` | integer | no | `1` | Load generator droplets, 1 to 8, all of `size`. The first runs the agent; the uac and callee SIPp processes are spread over all of them. |
| `infra.cluster` | object | yes, when a benchmark has `uut.helm` | none | The Kubernetes cluster of the helm benchmarks. A run creates it only when a selected benchmark has `uut.helm`. |
| `infra.cluster.size` | string | yes, if `cluster` is set | | Droplet size slug of the DOKS node pool, like `c-8`. |
| `infra.cluster.nodes` | integer, 1 to 20 | yes, if `cluster` is set | | Nodes in the pool. With `--local`, the kind cluster's nodes: a control plane, then workers. |
| `infra.cluster.version` | string | no | `latest` | A DOKS version slug, like `1.33.1-do.0`. Unused with `--local`. |
| `infra.maxLifetime` | duration | no | `9h` | The sweep deletes this run's droplets and cluster after this long. The cluster's kubeconfig expires after it too. |

### The cluster

On DigitalOcean, the cluster is a DOKS cluster named `perfkit-<run id in lowercase>` in the run's
VPC, tagged `perfkit` and `perfkit-run-<run id>`. It is created at the same time as the droplets
and deleted with them on every exit path, with its load balancers and volumes
(`destroy_with_associated_resources/dangerous`); `perfkit sweep` deletes one a lost run left. The
run's firewall lets the cluster's nodes reach the load generator on every port: the callees
register with the load generator's public address, because SIPp sends to the entry Service's
public load balancer.

With `--local`, the cluster is kind (`perfkit-<run id>`, needs `kind` on the PATH) with MetalLB
v0.14.9 in L2 mode: its address pool is `.200` to `.250` of the kind network's second-to-last
`/24` (`172.18.254.200-172.18.254.250` on `172.18.0.0/16`), and SIPp joins the kind network at
`.251` to `.253`. Every image the charts use (from `helm template`) or `images:` names that exists
on this machine is loaded into the cluster with `kind load docker-image`, so values can use a
local build with `pullPolicy: Never`. It is deleted with the run's containers.

## live

Every run writes `live.json` (`schema: perfkit/live/v1`, see [report-v1.md](report-v1.md#livejson))
every 15 seconds and serves it read-only on the load generator; with `NGROK_AUTHTOKEN` set, an
ngrok tunnel makes it public. The page polls it; see "Live results" in the README.

| Field | Type | Required | Default | Notes |
| :--- | :--- | :--- | :--- | :--- |
| `live.port` | number | no | `8787` | The port of the live.json server. `perfkit run --live-port` overrides it. |
| `live.domain` | hostname | no | `NGROK_DOMAIN`, else none | The static ngrok domain of the tunnel, like `routr-benchmarks.ngrok-free.dev`. |
| `live.url` | URL | no | `https://<live.domain>/live.json` | Where the page polls it; `project.live.url` wins. |

```yaml
live:
  domain: routr-benchmarks.ngrok-free.dev
  url: https://routr-benchmarks.ngrok-free.dev/live.json
```

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
| `uut` | object | yes | | Either `uut.compose` (with `uut.processes`) on the single server, or `uut.helm` on the cluster. |
| `uut.compose` | path | yes, without `uut.helm` | | The Compose file the unit under test runs. |
| `uut.setup` | path | no | none | A Node script that runs once the unit under test is up, for example to seed data. |
| `uut.processes` | list | yes, with `uut.compose` | | At least one. Sampled every 10 s. |
| `uut.processes[].name` | string | yes | | The name shown in the report. |
| `uut.processes[].match` | regex | yes | | Matched against each process's command line. All matching processes are summed. |
| `uut.helm.chart` | path | yes, with `uut.helm` | | The chart's directory, which may be outside the perf/ directory (`../ops/charts/connect`). Its dependencies must be in its `charts/` directory (`helm dependency build`). It is installed as release `perfkit` in a namespace named after the benchmark id. |
| `uut.helm.values` | path | yes, with `uut.helm` | | A values file with `${PERFKIT_*}` placeholders: `PERFKIT_ENTRY_IP`, `PERFKIT_TARGET_VERSION` and `PERFKIT_IMAGE_<NAME>` (digest-pinned, see [images](#images)). Any other `${PERFKIT_…}` stops the benchmark. |
| `uut.helm.entry.service` | Kubernetes name | yes, with `uut.helm` | | The type LoadBalancer Service SIPp sends to, with or without the release name `perfkit-` in front (`routr-edgeport-tcp` finds `perfkit-routr-edgeport-tcp`). |
| `uut.helm.entry.port` | integer | yes, with `uut.helm` | | Its port; SIPp sends to `<load balancer address>:<port>`. |
| `uut.helm.setup` | path | no | none | A shell script run with `bash <setup> <namespace> <users files>` (the benchmark's `load.register.users` and `load.uac.users`) once every pod is Ready, in a container with kubectl, helm and jq on the load generator, with `KUBECONFIG` and the `PERFKIT_*` variables set. |
| `uut.helm.pods` | list | yes, with `uut.helm` | | At least one. Sampled every 10 s from the Metrics API (CPU and working-set memory) with restart counts. |
| `uut.helm.pods[].name` | string | yes | | The name shown in the report. All the pods of the selector are summed. |
| `uut.helm.pods[].selector` | label selector | yes | | Like `service=edgeport` or `app.kubernetes.io/name=postgresql`. |
| `load.tool` | `sipp` | yes | | The only tool in v1. |
| `load.transport` | `udp` or `tcp` | no | `udp` | `tcp`: every SIPp role runs `-t tn`, one connection per call, with `-max_socket` sized to its open calls; scenarios use `[transport]`. Use TCP on DigitalOcean's load balancer, which drops UDP datagrams over 1,424 bytes. |
| `load.port` | integer | no | `5060` | The unit under test's SIP port SIPp sends to on the single server. Unused with `uut.helm`. |
| `load.uac.scenario` | path | yes | | The SIPp scenario that places calls. |
| `load.uac.users` | path | no | none | A SIPp injection CSV for the callers. |
| `load.register.scenario` | path | yes, if `register` is set | | `load.register` is optional, for either kind: it registers agents before the calls (a capacity ramp starts only once they have registered). |
| `load.register.users` | path | yes, if `register` is set | | The agents to register (CSV). |
| `load.register.expires` | integer (seconds) | no | `300` | The registration lifetime. |
| `load.uas.scenario` | path | yes, if `uas` is set | | `load.uas` is optional, for either kind: the SIPp scenario that answers calls. |
| `load.instances` | integer, 1 to 64 | no | `1` | How many SIPp processes place the calls. SIPp runs on one core, so a single process tops out at about 350 calls/s over TCP and a few thousand over UDP, however big the load generator is. With `instances: N`, perfkit starts N uac processes on the load generator, each with its share of the rate (`-r`, `-rate_increase`, `-rate_max`) in whole numbers that add up to the rate (50 over 8 is six 6s and two 7s, as SIPp's `-rate_increase` takes only integers; `rate.start` must be at least `instances`) and of the open calls (`-l`), its own local port (5080, 5081, ...) and Call-ID prefix (`uac-`, `uac2-`, ...), and its own share of `uac.users` (every N-th row, so a user belongs to one process). With a `register`, the callees are split the same way: `instances` callee processes (`sipp-register`, `sipp-register-2`, ...), each with its own share of `register.users` (every N-th row, so a callee belongs to one process), its own port (5070, then 5200 and up), Call-ID prefix and address; Routr sends a call to the process the callee registered from. A `uas` alone, with no `register`, stays one process. The report sums all of them. A capacity step is invalid when any one instance is over 80% of its core; set `instances` to about the cores you want to use, leaving a few for the callees and the sampler. A local cluster (`--local`, fixed SIPp addresses) accepts only `1`. |
| `load.hold` | duration | no | `0s` | How long each call stays up before BYE. |
| `load.unit` | string | no | `calls` | What one SIPp call is, as a lowercase plural noun shown on the page (`calls`, `messages`). Copied into each report.json benchmark as `unit`. |
| `load.rate.start` | number (calls/s) | *capacity*: yes | | The first step's rate. |
| `load.rate.step` | number (calls/s) | *capacity*: yes | | Added at each step. |
| `load.rate.every` | duration | *capacity*: yes | | How long each step lasts. A multiple of 10 s, because SIPp reports its counters every 10 s; `15s` is rejected (`expected a multiple of 10 s (SIPp reports every 10 s); got 15s`). |
| `load.rate.max` | number (calls/s) | *capacity*: yes | | The ramp stops here. Reaching it without breaking a rule makes the limit a lower bound. |
| `load.rate.cps` | number (calls/s) | *soak*: yes, without `fromCapacity` | | The fixed rate. Keep it well below saturation: a soak looks for leaks, not limits. |
| `load.rate.fromCapacity` | benchmark id | *soak*: instead of `cps` | | A capacity benchmark of this file. The soak runs at `fraction ×` the limit it measured in the same run, rounded down. |
| `load.rate.fraction` | number, more than 0, at most 1 | *soak*: yes, with `fromCapacity` | | Like `0.5`. |
| `load.rate.fallbackCps` | number (calls/s) | *soak*: yes, with `fromCapacity` | | The rate when that benchmark found no limit (failed, aborted, or inconclusive with no passing step), did not run, or the fraction rounds down to 0. When it was inconclusive because the load generator gave out and every step before passed, the highest of those steps is the limit, as a lower bound. The report records which: `load.rateSource`. |
| `telemetry` | object | no | `{ otlp: false }` | |
| `telemetry.otlp` | boolean | yes, if `telemetry` is set | | Collect OpenTelemetry spans, for the report's per-service hops. |
| `telemetry.sampleRatio` | number, more than 0, at most 1 | no | `0.01` | The share of calls traced. |
| `thresholds` | object | yes | | Exactly the thresholds of the kind, below. |

Thresholds:

| Field | Kind | Unit | Notes |
| :--- | :--- | :--- | :--- |
| `thresholds.p99LatencyMs` | capacity | ms | p99 time from INVITE to 200 OK. A step at or above it breaks the rule. |
| `thresholds.failedCallsPct` | capacity, soak | % (0 to 100) | Failed calls. |
| `thresholds.confirmSteps` | capacity | integer 1 to 5, default 2 | How many steps in a row must break a rule to end the ramp. A step that breaks a rule while the next one passes is a spike: the ramp goes on, the step stays in the report flagged `spike`, and it is not the limit. `1` ends the ramp at the first break. A break on the last step counts as confirmed; a step the load generator could not measure ends the ramp at once. |
| `thresholds.memoryGrowthMBPerHour` | soak | MB/h | Memory growth of each process after the warm-up. |
| `thresholds.restarts` | soak | count | Process restarts allowed. |

`capacity` requires `p99LatencyMs` and `failedCallsPct`, and takes `confirmSteps`. `soak` requires exactly
`memoryGrowthMBPerHour`, `failedCallsPct` and `restarts`.

A capacity uac gives up on any message it expects after 10 s (`-recv_timeout 10000`), and a call
that timed out counts as failed. With a hold, a call's teardown failure is counted when it
happens, up to `hold` + 10 s after the call starts, so `every` should be at least
4 × (hold + 10 s).

### Order of a run

The capacity benchmarks run first, one after another, in file order. Then every soak runs: soaks
of different targets (the server and the cluster) at the same time, soaks of one target one after
another. A soak that fails doesn't cut short the other target's: both run to their end, then the
run fails. A cluster benchmark's SIPp roles listen 1000 ports up (6080, 6070) and carry the `k8s-`
Call-ID prefix, so they never collide with the server's on the one load generator.

### A cluster benchmark

```yaml
infra:
  region: nyc3
  uut: { size: c-8 }
  loadgen: { size: c-16 }
  cluster: { size: c-8, nodes: 3 }        # DOKS node pool
benchmarks:
  - id: k8s-capacity
    kind: capacity
    title: Routr on Kubernetes
    narrative: { what: ..., why: ..., how: ... }
    uut:
      helm:
        chart: ../ops/charts/connect      # relative to perfkit.yaml
        values: k8s/values.yaml           # ${PERFKIT_ENTRY_IP}, ${PERFKIT_TARGET_VERSION}, ${PERFKIT_IMAGE_<NAME>}
        entry: { service: routr-edgeport-tcp, port: 5060 }
        setup: k8s/seed.sh                # bash k8s/seed.sh <namespace> <users files>
        pods:
          - { name: edgeport, selector: service=edgeport }
          - { name: postgres, selector: app.kubernetes.io/name=postgresql }
    load:
      tool: sipp
      transport: tcp
      register: { scenario: one-soak/uac_register.xml, users: one-soak/callees.csv }
      uas: { scenario: one-soak/uas_answer.xml }
      uac: { scenario: one-soak/uac_invite.xml, users: one-soak/callers.csv }
      hold: 5s
      rate: { start: 50, step: 50, every: 30s, max: 3000 }
    thresholds: { p99LatencyMs: 150, failedCallsPct: 0.1 }
  - id: k8s-soak
    kind: soak
    # title, narrative, duration, warmup, uut and the rest of load as usual
    load:
      rate: { fromCapacity: k8s-capacity, fraction: 0.5, fallbackCps: 50 }
```

For each helm benchmark perfkit installs metrics-server (chart 3.12.2, `--kubelet-insecure-tls`),
then the chart with `PERFKIT_ENTRY_IP` at `0.0.0.0`, waits up to 10 minutes for the entry
Service's load balancer address, runs `helm upgrade --wait` once with `PERFKIT_ENTRY_IP` resolved,
waits up to 5 minutes for every pod to be Ready, and runs the setup script. At the end it runs
`helm uninstall` and deletes the namespace.

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
  favicon: favicon.svg            # optional SVG; the browser tab's icon
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

### Scaling the load generator

One c-16 load generator with `load.instances: 12` places about 12 times what one SIPp does.
Beyond one machine the limits are network and source ports: over TCP each call holds a
connection (`ip_local_port_range` is 1024-65535 with `tcp_tw_reuse`), so about 60,000
connections per load generator address, which is `cps × (hold + TIME_WAIT)`.

`infra.loadgen.count` adds load generator droplets, each with its own address and its own
pool of source ports. `load.instances` stays the total number of uac SIPp processes and the
rate stays the benchmark's: the instances are spread round robin over the droplets (the
first on the first), each with its share of the callers, and so are the callees, each with its
share of the users. Two c-8 droplets cost about what one c-16 does and have twice the ports. The
others' SIPp files and sampler files are copied back to the first every 30 s and when the
benchmark ends. Every droplet runs its own sampler, so a SIPp process over 80% of its core, or UDP
drops, on any of them makes the step invalid.
The design is in `docs/design-loadgen-count.md`.
