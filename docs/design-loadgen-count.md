# Design: several load generator droplets (`infra.loadgen.count`)

Status: not implemented. `load.instances` (SIPp processes on one load generator) ships first.

## Why

One load generator address has about 60,000 TCP source ports per destination, so over TCP it
caps at `cps × (hold + TIME_WAIT) ≈ 60,000` (for example 500 calls/s with 120 s holds). A very
large run (a 100M-call challenge: 1,000 to 3,000 calls/s for 10 hours or more) needs more
addresses, and several load generators also give the load balancer more than one source IP.

## Shape

```yaml
infra:
  loadgen: { size: c-16, count: 4 }   # default 1
```

- `count` droplets, tagged like the load generator today; one is the primary (it runs the
  agent, the samplers' collection and the callees), the others are workers.
- Each worker runs its share of the uac: `instances` and the rate are per worker, so a
  benchmark offers `count × rate`. The users file is split across all `count × instances`
  processes.
- Raw results: every worker's trace files are copied into the benchmark's raw directory
  (distinct names, as SIPp's pid already makes them), and `readSippResults` already merges
  every pid. The sampler runs on each worker and writes `sampler-loadgen-<n>.jsonl`; the
  analysis names processes `sipp-uac@<n>` so saturation is judged per process.
- The callees (register and uas) stay on the primary: Routr routes a call to the address of the
  REGISTER's top Via.

## What it touches

- `src/infra`: create, tag, wait for and sweep N droplets (the sweep already works by tag and
  needs no change), the VPC and firewall rules for all of them, `RunState.hosts.loadgenIp`
  becoming a list.
- `src/orchestrate`: the agent's `Host` type has `"loadgen"` hard-wired (`run("loadgen", ...)`
  in `createRunBenchmark`, the sampler start, `collect`); it needs a worker address and a way to
  fetch each worker's raw directory (the `uut` file fetch in `collectUutFiles` is the model).
- Live page and the report need nothing: they already sum the merged files.

Cost: N × the load generator's hourly price; a c-16 is about $0.36/h, so `count: 4` adds about
$1.1/h over one.
