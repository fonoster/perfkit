/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { formatNumber } from "../format.js";
import { esc } from "../html.js";
import { icon } from "../icons.js";
import type { PageContext } from "../types.js";

/**
 * Test setup: the droplets and region, each image with its short digest,
 * the tools, and "Run it yourself" with the run's command.
 */
export function renderSetup(ctx: PageContext): string {
  const { run } = ctx.report;
  const machine = (m: typeof run.infra.uut, count = 1) =>
    `${count > 1 ? `${count} × ` : ""}${m.size} · ${m.vcpus} vCPU · ${formatNumber(m.memoryMB / 1024)} GB`;
  const servers: Array<[string, string]> = [
    ["Server under test", machine(run.infra.uut)],
    ["Load generator", machine(run.infra.loadgen, run.infra.loadgen.count)],
    ["Region", `DigitalOcean ${run.infra.region}`],
    ["OS", `${run.infra.os} · Docker ${run.infra.docker}`]
  ];
  const images = Object.entries(run.images).map(
    ([name, ref]): [string, string] => {
      const [repoTag = ref, digest = ""] = ref.split("@");
      const tag = repoTag.slice(repoTag.lastIndexOf(":") + 1);
      return [name, `${tag} · ${digest.slice(0, "sha256:".length + 12)}`];
    }
  );
  const tools: Array<[string, string]> = [
    ["Load generator", `SIPp ${run.tools.sipp}`],
    ...(run.tools.otelcol
      ? [
          ["Tracing", `OpenTelemetry Collector ${run.tools.otelcol}`] as [
            string,
            string
          ]
        ]
      : []),
    ["Harness", `perfkit ${run.tools.perfkit} · report schema v1`]
  ];
  const rows = (pairs: Array<[string, string]>) =>
    `<dl class="rows">${pairs.map(([k, v]) => `<div class="row"><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>`;

  return `<section class="setup" aria-labelledby="test-setup">
<div class="wrap">
<h2 class="setup-title" id="test-setup">Test setup</h2>
<div class="setup-grid">
<div class="card"><h3 class="card-title with-icon">${icon("server", 16)}Servers</h3>${rows(servers)}</div>
<div class="card"><h3 class="card-title with-icon">${icon("package", 16)}Software</h3>${rows([...images, ...tools])}</div>
<div class="card reproduce"><h3 class="card-title with-icon">${icon("terminal", 16)}Run it yourself</h3>
<p>Same servers, same images, same scenario. Needs a DigitalOcean token; the servers are deleted when the run ends.</p>
<pre class="command" tabindex="0"><code>$ ${esc(run.command)}</code></pre>
</div>
</div>
</div>
</section>`;
}
