import { fileURLToPath, pathToFileURL } from 'node:url';

function urisOf(files: readonly string[]): string[] {
  return files.map((file) => pathToFileURL(file).href);
}

export function uriListOf(files: readonly string[]): string {
  return urisOf(files).join('\r\n');
}

export function gnomeCopiedFiles(files: readonly string[]): string {
  return ['copy', ...urisOf(files)].join('\n');
}

function fileOf(line: string): string | undefined {
  if (line === '' || line.startsWith('#') || !/^file:/i.test(line)) {
    return undefined;
  }
  try {
    return fileURLToPath(line);
  } catch {
    return undefined;
  }
}

export function filesOfUriList(text: string): string[] {
  const files = text
    .split(/\r?\n/)
    .map((line) => fileOf(line.trim()))
    .filter((file) => file !== undefined);
  return [...new Set(files)];
}
