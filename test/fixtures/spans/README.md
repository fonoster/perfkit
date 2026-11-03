# spans

OpenTelemetry Collector file exporter output (OTLP JSON, one `{ resourceSpans }` object per
line), as perfkit collects it in `spans.jsonl`.

- `otelcol-telemetrygen.jsonl` is a real export. On 2026-11-03,
  `otel/opentelemetry-collector-contrib:0.112.0` with an OTLP gRPC receiver and the `file`
  exporter received `telemetrygen traces --traces 3 --child-spans 2 --service routr-test`
  (`ghcr.io/open-telemetry/opentelemetry-collector-contrib/telemetrygen:v0.112.0`). Each trace
  is a `lets-go` span of 0.246 ms with two `okey-dokey` children of 0.123 ms, so the parent's
  self time is 0.
- `grpc-hops.jsonl` was written by hand, shaped like Routr's gRPC instrumentation. Each of four
  traces has a Processor server span (`routr-connect`) of 10, 20, 30 and 500 ms, a Location
  client span under it of 4 ms, and a Location server span (`routr-location`) under that of
  3 ms. The 500 ms trace starts at 14:10Z, before a 30-minute warm-up from 14:00Z; the others
  start at 15:00Z, 15:01Z and 15:02Z.
