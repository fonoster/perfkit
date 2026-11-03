/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import type { Hops } from "../schemas/index.js";
import { nearestRank } from "./nearestRank.js";
import { roundTo } from "./roundTo.js";
import type { Span } from "./types.js";

/**
 * Per-service latency from spans. A span's time is its self time: its
 * duration minus the durations of its direct children (any span whose
 * parent it is). Only spans that start at or after `sinceMs` are counted;
 * children are looked up among all spans. Services are sorted by name.
 */
export function computeHops(
  spans: readonly Span[],
  sampleRatio: number,
  sinceMs: number
): Hops {
  const childTime = spans.reduce<Map<string, number>>((acc, span) => {
    if (span.parentSpanId === null) return acc;
    const key = `${span.traceId}/${span.parentSpanId}`;
    acc.set(key, (acc.get(key) ?? 0) + span.durationMs);
    return acc;
  }, new Map());
  const counted = spans.filter((span) => span.startMs >= sinceMs);
  const byService = counted.reduce<Map<string, number[]>>((acc, span) => {
    const self = Math.max(
      0,
      span.durationMs - (childTime.get(`${span.traceId}/${span.spanId}`) ?? 0)
    );
    const times = acc.get(span.service) ?? [];
    times.push(self);
    acc.set(span.service, times);
    return acc;
  }, new Map());
  return {
    sampleRatio,
    spans: counted.length,
    services: [...byService.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([service, times]) => ({
        service,
        p50Ms: roundTo(nearestRank(times, 50)),
        p99Ms: roundTo(nearestRank(times, 99))
      }))
  };
}
