/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { resolve } from "node:path";
import type { PerfkitConfig } from "../schemas/index.js";
import type { DocumentError, ValidateFileDeps } from "./types.js";

/**
 * Checks that every path a perfkit.yaml names exists, relative to the
 * directory the file is in. Returns one error per missing file, at the path
 * of the field that names it.
 */
export async function checkConfigPaths(
  config: PerfkitConfig,
  baseDir: string,
  isFile: ValidateFileDeps["isFile"]
): Promise<DocumentError[]> {
  const named: Array<[string, string | undefined]> = [
    ["project.logo", config.project.logo],
    ["project.favicon", config.project.favicon],
    ...config.benchmarks.flatMap(
      (benchmark, i): Array<[string, string | undefined]> => {
        const at = `benchmarks[${i}]`;
        const load = benchmark.load;
        return [
          [`${at}.uut.compose`, benchmark.uut.compose],
          [`${at}.uut.setup`, benchmark.uut.setup],
          [`${at}.load.uac.scenario`, load.uac.scenario],
          [`${at}.load.uac.users`, load.uac.users],
          ...(benchmark.kind === "soak"
            ? ([
                [
                  `${at}.load.register.scenario`,
                  benchmark.load.register?.scenario
                ],
                [`${at}.load.register.users`, benchmark.load.register?.users],
                [`${at}.load.uas.scenario`, benchmark.load.uas?.scenario]
              ] as Array<[string, string | undefined]>)
            : [])
        ];
      }
    )
  ];
  const present = named.filter(
    (entry): entry is [string, string] => entry[1] !== undefined
  );
  const found = await Promise.all(
    present.map(([, path]) => isFile(resolve(baseDir, path)))
  );
  return present
    .filter((_, i) => !found[i])
    .map(([field, path]) => ({
      path: field,
      message: `file not found: ${path}`
    }));
}
