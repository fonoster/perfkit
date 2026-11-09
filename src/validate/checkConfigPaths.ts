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
        const { uut } = benchmark;
        const uutPaths: Array<[string, string | undefined]> =
          "helm" in uut
            ? [
                [`${at}.uut.helm.chart`, `${uut.helm.chart}/Chart.yaml`],
                [`${at}.uut.helm.values`, uut.helm.values],
                [`${at}.uut.helm.setup`, uut.helm.setup]
              ]
            : [
                [`${at}.uut.compose`, uut.compose],
                [`${at}.uut.setup`, uut.setup]
              ];
        return [
          ...uutPaths,
          [`${at}.load.uac.scenario`, load.uac.scenario],
          [`${at}.load.uac.users`, load.uac.users],
          [`${at}.load.register.scenario`, load.register?.scenario],
          [`${at}.load.register.users`, load.register?.users],
          [`${at}.load.uas.scenario`, load.uas?.scenario]
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
