/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { request } from "node:http";

export interface EngineResponse {
  status: number;
  body: Buffer;
}

/** A Docker Engine API request over its unix socket. */
export type EngineRequest = (
  method: string,
  path: string,
  body?: unknown
) => Promise<EngineResponse>;

/**
 * The Docker Engine API on a unix socket, with no client library: the agent
 * container has node but no docker binary.
 */
export function createDockerEngine(socketPath: string): EngineRequest {
  return (method, path, body) =>
    new Promise((resolve, reject) => {
      const payload = body === undefined ? undefined : JSON.stringify(body);
      const req = request(
        {
          socketPath,
          path: `/v1.43${path}`,
          method,
          headers: payload
            ? {
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(payload)
              }
            : {}
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (chunk: Buffer) => chunks.push(chunk));
          res.on("end", () =>
            resolve({
              status: res.statusCode ?? 0,
              body: Buffer.concat(chunks)
            })
          );
          res.on("error", reject);
        }
      );
      req.on("error", reject);
      if (payload) req.write(payload);
      req.end();
    });
}

/**
 * Splits a container's log stream (no TTY) into stdout and stderr: frames of
 * an 8-byte header (stream, 3 zero bytes, big-endian size) and the payload.
 */
export function demuxLogs(buffer: Buffer): { stdout: string; stderr: string } {
  const out: Buffer[] = [];
  const err: Buffer[] = [];
  // A loop, not recursion: a long command output arrives as tens of
  // thousands of frames, past the call stack's depth.
  let offset = 0;
  while (offset + 8 <= buffer.length) {
    const stream = buffer[offset];
    const size = buffer.readUInt32BE(offset + 4);
    (stream === 2 ? err : out).push(
      buffer.subarray(offset + 8, offset + 8 + size)
    );
    offset += 8 + size;
  }
  return {
    stdout: Buffer.concat(out).toString("utf8"),
    stderr: Buffer.concat(err).toString("utf8")
  };
}
