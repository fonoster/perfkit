/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
/** Quotes one word for a POSIX shell: `it's` becomes `'it'\''s'`. */
export function shellQuote(word: string): string {
  if (/^[A-Za-z0-9_@%+=:,./-]+$/.test(word)) return word;
  return `'${word.replace(/'/g, `'\\''`)}'`;
}

/** A command line from words, each quoted as needed. */
export function shellJoin(words: readonly string[]): string {
  return words.map(shellQuote).join(" ");
}

/** A shell command that writes `content` to `path`, creating its directory. */
export function writeFileCommand(path: string, content: string): string {
  const dir = path.slice(0, path.lastIndexOf("/")) || "/";
  const data = Buffer.from(content, "utf8").toString("base64");
  return `mkdir -p ${shellQuote(dir)} && echo ${data} | base64 -d > ${shellQuote(path)}`;
}
