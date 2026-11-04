# Running perfkit from GitHub Actions

perfkit ships a reusable workflow, `fonoster/perfkit/.github/workflows/run.yaml`. A project calls
it by hand (`workflow_dispatch`) after a significant change; it creates the run's droplets,
waits for the benchmarks, uploads `report.json` and the raw results as an artifact, and deletes
the droplets.

## Why the run is split across jobs

GitHub stops a job after 6 hours, and a soak runs for longer than that. So the run is detached:
the `start` job creates the droplets and starts the agent on the load generator, which drives
the load on its own, and later jobs only follow it:

1. `start` runs `perfkit run --detach` and outputs the run id.
2. `wait-1` and `wait-2` each run `perfkit collect <id> --wait --timeout 5h50m`. Exit 4 (the run
   goes on) lets the next job wait; exit 0 skips the rest of the waiting. Each uploads the raw
   results so far as the artifact `perfkit-raw-<id>`, overwriting it.
3. `finish` downloads that artifact and runs `perfkit collect <id>`: it writes `report.json`,
   deletes the droplets, and uploads `.perfkit/<id>/` as `perfkit-report-<id>`. Exit 1 (a
   benchmark did not pass) still uploads.
4. `cleanup` always runs `perfkit sweep --run <id>`, so a cancelled or failed workflow leaves
   nothing billing.

Every job has `permissions: { contents: read }`. Each job runs on a new machine, so `collect`
adds that machine's IP to the run's firewall before it logs in, with `PERFKIT_SSH_KEY`.

## Inputs, secrets and outputs

| Input | Default | Meaning |
| :--- | :--- | :--- |
| `perfkit-ref` | required | The perfkit tag the workflow is called at, like `v0.1.0`; the jobs run that perfkit (`npx -y github:fonoster/perfkit#<perfkit-ref>`). A reusable workflow can't see its own ref, so pass the same tag as in `uses:`. |
| `config` | `perf/perfkit.yaml` | The project's perfkit.yaml. |
| `target-version` | required | The image tag under test, like `2.31.5`. |
| `commit` | required | The commit under test, written to report.json. The `perf/` config is read from the commit that called the workflow (`github.sha`), because a release tag under test can predate the config. |
| `benchmarks` | empty | Comma-separated benchmark ids; empty runs them all. |

| Secret | Meaning |
| :--- | :--- |
| `DIGITALOCEAN_TOKEN` | The DigitalOcean token, with the scopes in the README. It never reaches a droplet, a log or the report. |
| `PERFKIT_SSH_KEY` | An ed25519 private key in OpenSSH format, without a passphrase. Every job logs in to the droplets with it, registered in the account as `perfkit-shared`. Make one with `ssh-keygen -t ed25519 -N "" -f perfkit`. |

The workflow takes its secrets only through `secrets:`, so a caller has to name them: `secrets:
inherit` would hand it every secret of the repository.

| Output | Meaning |
| :--- | :--- |
| `run-id` | The run id, like `20261103T141210Z-bd3254a`. |
| `verdict` | Like `2 of 2 benchmarks passed`. |
| `artifact` | `perfkit-report-<run id>`: `report.json` and `raw/`. |

## A caller workflow

`.github/workflows/benchmarks.yaml` in the project:

```yaml
name: Benchmarks

on:
  workflow_dispatch:
    inputs:
      target-version:
        description: The image tag to benchmark, like 2.31.5
        required: true
      benchmarks:
        description: Comma-separated benchmark ids (empty runs them all)
        default: ""

permissions:
  contents: read

jobs:
  run:
    uses: fonoster/perfkit/.github/workflows/run.yaml@v0.1.0
    with:
      perfkit-ref: v0.1.0
      target-version: ${{ inputs.target-version }}
      commit: ${{ github.sha }}
      benchmarks: ${{ inputs.benchmarks }}
    secrets:
      DIGITALOCEAN_TOKEN: ${{ secrets.DIGITALOCEAN_TOKEN }}
      PERFKIT_SSH_KEY: ${{ secrets.PERFKIT_SSH_KEY }}

  publish:
    needs: run
    if: always() && needs.run.outputs.run-id != ''
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/download-artifact@v4
        with:
          name: ${{ needs.run.outputs.artifact }}
          path: run
      - uses: actions/checkout@v4
        with:
          ref: gh-pages
          path: pages
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm install -g npm@11
      - run: >-
          npx -y github:fonoster/perfkit#v0.1.0 render --report run/report.json
          --history pages/benchmarks/runs.json --out pages/benchmarks
      - working-directory: pages
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git add benchmarks
          git commit -m "benchmarks: ${{ needs.run.outputs.run-id }} (${{ needs.run.outputs.verdict }})"
          git push
```

Publishing to `gh-pages` is the caller's job; perfkit never pushes. Run `perfkit sweep` on a
schedule too, as the backstop for anything a lost run left.
