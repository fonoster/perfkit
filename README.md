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
