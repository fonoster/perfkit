/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { parseJsonLines } from "./parseJsonLines.js";
import { type OtlpAttribute, otlpLineSchema } from "./rawResults.schema.js";
import type { Span } from "./types.js";

const SERVER_KINDS = new Set<number | string>([2, "SPAN_KIND_SERVER"]);

/**
 * Parses spans.jsonl, the OpenTelemetry Collector file exporter's output: one
 * OTLP JSON `{ resourceSpans: [...] }` object per line. A gRPC server span
 * (kind server, with `rpc.service`) belongs to the last dot segment of its
 * `rpc.service`, lower-cased; any other span to its resource's
 * `service.name`, or `unknown` without one.
 */
export function parseOtlpSpans(text: string, file: string): Span[] {
  return parseJsonLines(text, file, otlpLineSchema).flatMap((line) =>
    (line.resourceSpans ?? []).flatMap((resourceSpans) => {
      const serviceName =
        stringAttribute(resourceSpans.resource?.attributes, "service.name") ??
        "unknown";
      return (resourceSpans.scopeSpans ?? []).flatMap((scope) =>
        (scope.spans ?? []).map<Span>((span) => {
          const rpcService = stringAttribute(span.attributes, "rpc.service");
          const isGrpcServer =
            span.kind !== undefined &&
            SERVER_KINDS.has(span.kind) &&
            rpcService !== undefined;
          const startNs = toNanos(span.startTimeUnixNano);
          const endNs = toNanos(span.endTimeUnixNano);
          return {
            traceId: span.traceId,
            spanId: span.spanId,
            parentSpanId:
              span.parentSpanId === undefined || span.parentSpanId === ""
                ? null
                : span.parentSpanId,
            service: isGrpcServer
              ? lastSegment(rpcService).toLowerCase()
              : serviceName,
            startMs: Number(startNs) / 1e6,
            durationMs: endNs > startNs ? Number(endNs - startNs) / 1e6 : 0
          };
        })
      );
    })
  );
}

function stringAttribute(
  attributes: OtlpAttribute[] | undefined,
  key: string
): string | undefined {
  return attributes?.find((attribute) => attribute.key === key)?.value
    .stringValue;
}

function lastSegment(value: string): string {
  return value.split(".").at(-1) ?? value;
}

/** OTLP JSON writes nanoseconds as strings; BigInt keeps them exact. */
function toNanos(value: string | number): bigint {
  return typeof value === "number" ? BigInt(Math.round(value)) : BigInt(value);
}
