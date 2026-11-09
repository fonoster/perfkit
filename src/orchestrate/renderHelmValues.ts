/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */

/**
 * A Helm values file with every `${PERFKIT_*}` placeholder replaced from
 * `env`. Text outside the placeholders is kept byte for byte.
 *
 * @throws naming the placeholders `env` lacks, like
 *   `unknown placeholder ${PERFKIT_FOO} in k8s/values.yaml`
 */
export function renderHelmValues(
  text: string,
  env: Readonly<Record<string, string>>,
  file: string
): string {
  const unknown = [
    ...new Set(
      [...text.matchAll(/\$\{(PERFKIT_[A-Z0-9_]*)\}/g)]
        .map((match) => match[1] as string)
        .filter((name) => env[name] === undefined)
    )
  ];
  if (unknown.length > 0) {
    throw new Error(
      `unknown placeholder${unknown.length === 1 ? "" : "s"} ${unknown.map((name) => `\${${name}}`).join(", ")} in ${file}; known: ${Object.keys(env).sort().join(", ")}`
    );
  }
  return text.replace(
    /\$\{(PERFKIT_[A-Z0-9_]*)\}/g,
    (_, name: string) => env[name] as string
  );
}
