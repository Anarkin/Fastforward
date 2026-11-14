import type { FileChange } from '../shared/protocol';
import type { PatchScope } from './diffArgs';

const sectionStart = 'diff --git ';

export function whitespaceOnlyChanges(
  patch: string,
  files: readonly FileChange[],
): string[] {
  const headers = new Set<string>();
  for (let at = 0; at !== -1;) {
    if (patch.startsWith(sectionStart, at)) {
      const end = patch.indexOf('\n', at);
      headers.add(patch.slice(at, end === -1 ? undefined : end));
    }
    const next = patch.indexOf(`\n${sectionStart}`, at);
    at = next === -1 ? -1 : next + 1;
  }
  return files
    .filter((file) => file.status === 'M' && !headers.has(headerOf(file)))
    .map(({ path }) => path);
}

export function newSideUnchanged(patch: string): string {
  const hunk = patch.indexOf('\n@@ ');
  if (hunk === -1) {
    return patch;
  }
  const lines: string[] = [];
  let count = 0;
  let kept = false;
  for (const line of patch
    .slice(patch.indexOf('\n', hunk + 1) + 1)
    .split('\n')) {
    if (line.startsWith('\\')) {
      if (kept) {
        lines.push(`${line}\n`);
      }
      continue;
    }
    kept = line.startsWith(' ') || line.startsWith('+');
    if (kept) {
      lines.push(` ${line.slice(1)}\n`);
      count++;
    }
  }
  const range = count === 1 ? '1' : `1,${count}`;
  return `${patch.slice(0, hunk + 1)}@@ -${range} +${range} @@\n${lines.join('')}`;
}

export function headerOf(file: Pick<FileChange, 'path' | 'oldPath'>): string {
  return `diff --git ${gitQuoted(`a/${file.oldPath ?? file.path}`)} ${gitQuoted(`b/${file.path}`)}`;
}

const escapes: Readonly<Record<string, string>> = {
  '"': '\\"',
  '\\': '\\\\',
  '\x07': '\\a',
  '\b': '\\b',
  '\t': '\\t',
  '\n': '\\n',
  '\v': '\\v',
  '\f': '\\f',
  '\r': '\\r',
};

function escaped(name: string): string {
  let result = '';
  for (const character of name) {
    const code = character.charCodeAt(0);
    result +=
      escapes[character] ??
      (code < 0x20 || code === 0x7f
        ? `\\${code.toString(8).padStart(3, '0')}`
        : character);
  }
  return result;
}

export function gitQuoted(name: string): string {
  const result = escaped(name);
  return result === name ? name : `"${result}"`;
}

export function withoutFilesInside(
  patch: string,
  { path, oldPath }: PatchScope,
): string {
  if (path === undefined) {
    return patch;
  }
  const own = `${headerOf({ path, oldPath })}\n`;
  const insides = [...new Set([path, oldPath ?? path])].flatMap((folder) => [
    `${sectionStart}a/${folder}/`,
    `${sectionStart}"a/${escaped(folder)}/`,
  ]);
  return patch
    .split(/^(?=diff --git )/m)
    .filter(
      (section) =>
        section.startsWith(own) ||
        !insides.some((inside) => section.startsWith(inside)),
    )
    .join('');
}
