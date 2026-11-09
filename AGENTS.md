# AGENTS.md

## Overview

perfkit runs benchmarks for Fonoster projects (Routr first, then Roomr and Fonoster) and
publishes one report format for all of them. It creates two DigitalOcean droplets per run (the
unit under test and a load generator), plus a DOKS cluster when a benchmark has `uut.helm` (kind
with `--local`), drives the load, collects the results into a
`report.json` (schema `perfkit/report/v1`), deletes the droplets, and renders a branded static
HTML report page. Each project keeps only its benchmark definitions in a `perf/` folder
(`perf/perfkit.yaml`) and pins a perfkit release. The design of the report page lives in Routr:
`designs/benchmarks.pen` in fonoster/routr (open it with Pencil or Nib, never as text).

## Commands

Node 22 (`.nvmrc`).

- Install: `npm ci`.
- Build: `npm run build`.
- Unit tests: `npm test` (`test/**/*.unit.test.ts`). They never reach the network and never
  read `DIGITALOCEAN_TOKEN`.
- Typecheck: `npm run typecheck`. Lint: `npm run lint` (ESLint and Prettier).
- JSON Schema files: `npm run schemas` rewrites `schemas/*.schema.json` from `src/schemas`;
  commit the result. A unit test fails when they drift.
- Check a file: `npx tsx src/cli.ts validate <perfkit.yaml|report.json|runs.json>`.
- A real run costs money: `DIGITALOCEAN_TOKEN=... npx perfkit run --config <perfkit.yaml>
  --target-version <tag>`. Not gated in CI.

## Conventions

Profile: typescript

Overrides:

- Single package (`src/`, `test/`), not a monorepo: one CLI, no service. Shared schemas live in
  `src/schemas/` instead of a `common` package.
- No database and no Prisma: state is files (`report.json`, `runs.json`).
- No tRPC: the surfaces are the CLI and the reusable workflow.
- `perfkit.yaml` is validated with Zod (the same schemas export the JSON Schema files).
- No logger: the CLI's output lines and exit codes are its contract, so functions return
  results instead of logging them.
- No husky or lint-staged: CI (`.github/workflows/test.yaml`) runs typecheck, lint and tests on
  every pull request.

## Areas

| Area label | Paths | Experts |
| :--- | :--- | :--- |
| (none) | src/infra, .github/workflows | release-engineer, security-engineer |
| (none) | src/analyze, src/orchestrate | performance-engineer, realtime-comms-engineer |
| (none) | src/render, designs | ux-designer, visual-designer |

## Compatibility

Breaking (a major release):

- `perfkit.yaml` v1, `report.json` v1 and `runs.json` v1. A breaking schema change is a new
  schema version, and old reports must still render.
- The CLI: commands, flags and exit codes.
- The reusable workflow `.github/workflows/run.yaml`: inputs, secrets and outputs.

## Risk hotspots

- Droplet and cluster teardown (`src/infra`, `src/cli/localTeardown.ts`): a missed delete leaves
  dedicated-CPU droplets, a DOKS node pool or its load balancers billing.
- `.github/workflows/run.yaml`: it receives `DIGITALOCEAN_TOKEN`; the token never goes onto a
  droplet, into a log, `report.json` or the HTML. The cluster's kubeconfig goes to the load
  generator's keys directory only.

## Release

- Releases are git tags `vX.Y.Z` on main. Callers run `npx -y github:fonoster/perfkit#vX.Y.Z`
  and `uses: fonoster/perfkit/.github/workflows/run.yaml@vX.Y.Z` at the same tag. perfkit is not
  published to npm.
- Each release notes what changed for `perfkit.yaml`, the report schema and the workflow
  inputs, because callers pin a version.

## Decisions

- 2026-11-03: perfkit lives in its own repo and serves Routr, Roomr and Fonoster; each project
  keeps only `perf/`.
- 2026-11-03: Two droplets per run (unit under test + load generator), dedicated CPU, same
  region, private VPC, images pinned by digest; droplets are deleted on every exit path.
- 2026-11-03: Benchmarks run after significant code changes, triggered by hand, not on every
  release. Report copy never says "every release".
- 2026-11-03: Reports are public static pages on each project's GitHub Pages under
  `/benchmarks`, published to the gh-pages branch, never through a push to main.
- 2026-11-08: Kubernetes benchmarks run over TCP: DigitalOcean's REGIONAL_NETWORK load balancer
  drops UDP datagrams over 1,424 bytes. Locally the cluster is kind with MetalLB, whose L2 load
  balancer keeps the client address and the Service port as DOKS's does.
