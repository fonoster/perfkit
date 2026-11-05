# The report page

`perfkit render` turns one run's `report.json` into a page. This is what each part of the page
shows and where its numbers come from. Every number on the page comes from the run's
`report.json` or from `runs.json`, the history of earlier runs.

Benchmarks run after significant changes to the code, triggered by hand. A page is one run;
the history shows the runs before it.

## Pages

- A site with no published runs yet (`perfkit render --config`) has only `/benchmarks/`: the
  project's title and lead and "No published runs yet. When a run is in progress it appears
  here live.", drawn from `data/site.json`. It goes live like the latest page.
- `/benchmarks/` is the latest run, the one with the newest `startedAt`. Its run picker marks it
  `latest`, and "Link to this run" points to its own page.
- `/benchmarks/runs/<id>/` is one run's page. It starts with "You're viewing the run of …" and a
  link to the latest run.

Both are drawn in the browser by the perfkit app the site was last published with, from
`data/runs.json` and the run's `data/runs/<id>/report.json`. A run's numbers never change, but its
history and picker list every run published since, and a newer perfkit redraws it.

## Nav and header

With `project.faviconSvg` in report.json, every page and shell links it as the tab's icon. The
nav has the project's logo, the run picker and a link to the run's `report.json`. The picker
lists up to 8 runs, newest first, each a link to its page; "See all" jumps to Previous runs.

The header has the verdict pill, `N of M benchmarks passed`, followed by how many were not run,
aborted or inconclusive; and the run's date (UTC), version, commit, region and the size of the
server under test.

## Headline numbers

Up to four numbers, in benchmark order:

- For a capacity benchmark, the limit (the highest rate where every rule passed) and p99
  latency at the limit. `at least N` means every rate up to the highest tested passed, so the
  real limit is higher. `below N` means no rate passed, starting at N.
- For a soak benchmark, how long it ran after warm-up, with its call count, and the largest
  memory growth of any process.

A number that wasn't measured shows `--` and why: not run, aborted or inconclusive.

### How a delta picks the run it compares with

Each delta compares a number with the most recent earlier run (by `startedAt`) in `runs.json`
that has the same number for the same benchmark. Runs where that benchmark was not run,
aborted, inconclusive or had no limit are skipped. Each delta says in words whether the change is
better or worse: a higher limit is better; lower latency and lower memory growth are better.

When every delta compares with the same run, one line under the numbers names it ("Compared
with v2.31.0, Oct 19, 2026"). Otherwise each delta names its own run ("vs v2.31.0, Oct 19").
With no earlier run, the page says "First run: nothing to compare with yet."

## Capacity benchmarks

- What it measures, why it matters and how it runs, written by the project.
- Latency as load rises: p50, p95 and p99 latency from request to 200 OK at each offered rate,
  the p99 limit as a dashed line, the capacity limit marked, and the rates over the limit
  shaded. "Numbers behind this chart" has the same data as a table.
- At the limit: latency, failed requests and retransmissions at the limit.
- The takeaway: the limit, and the step and rule that stopped the ramp.

## Soak benchmarks

- The load: duration after warm-up, warm-up, steady rate, call length and agents.
- Memory per process: resident memory over the run, with the warm-up shaded and each process's
  growth after warm-up next to its line. The table under it has each process's first, last and
  peak memory.
- Stability checks: each rule, `Passed` or `Failed`, with the measured value and its limit.
- Also measured: p99 in the first and last hour, open files, concurrent calls and failed
  re-registrations. These have no limit.
- Where the time goes: when the run collected traces, each service's median time per request,
  from a sample of OpenTelemetry traces.

## When a benchmark has no verdict

- Failed: the section says which rule failed, with the measured value and the limit.
- Aborted: how long it ran and why it stopped. The chart, if any, is marked Partial, and no
  rules are evaluated.
- Inconclusive: why the result can't be trusted (for example, the load generator saturated).
  A capacity benchmark reports no limit.
- Not run: the benchmark was not part of this run, with a link to its last result, if any.

## Previous runs

The capacity limit of the last 8 runs that have one, as a small trend line (from 2 runs), and a
table of this run and the runs before it: date, version, commit, limit, soak memory growth and
result. The row of the run you are viewing is marked `viewing`. The table shows 8 runs; "Show all
N runs" shows the rest.

## Test setup

The droplets and region, each image with its digest, the tools, and the command to run the same
benchmarks yourself.

## The live view

While a run is in progress, the latest page (the site root, never a run page) shows it live from
the agent's live.json, polled every 15 seconds; see "Live results" in the README. The design is
the "State / Live (preliminary)" frame of `designs/benchmarks.pen`.

- **Nav and banner.** The picker reads "Running now · v<version>" with a live dot and badge.
  Under the nav: "Running now. These numbers are preliminary and change every 15 seconds; the
  verdict appears when the run ends." and "updated N s ago", which turns warning-coloured after a
  minute and reads "connection lost, retrying" after 3 minutes or a failed poll.
- **Header and progress.** "LIVE · RUN <id>", "<Project> <version> is under test right now.",
  one card per step (setup, then each benchmark: done, running or queued with its expected start)
  and a bar with when the run should end.
- **Live numbers.** For the benchmark running now: the rate offered (and placed, last step),
  p99 and failed % of the last step (a soak: calls placed and failed % so far), and the time into
  the run with the time to go.
- **Capacity.** The same "Latency as load rises" chart as the report, drawn up to the step
  offered now, marked "now <rate>", the steps not run yet shaded; and "So far": what held, why the
  limit is not known yet, and the last published limit from `data/runs.json`.
- **Soak.** Raw memory per process with the warm-up shaded and a "now" line. Growth in MB/h shows
  only once there is a full hour of data after the warm-up.

When the run ends the page says the report is being published, and draws it once
`data/runs.json` lists the run. Animations stop under `prefers-reduced-motion`.
