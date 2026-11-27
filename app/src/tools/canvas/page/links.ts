import { isWebLink } from '../shared/protocol';

export function pastedLink(text: string): string | undefined {
  const trimmed = text.trim();
  return /\s/.test(trimmed) || !isWebLink(trimmed) ? undefined : trimmed;
}

const wholePath = /^(?:[A-Za-z]:[\\/]|\\\\[^\\/]|\/)/;

export function pastedPaths(text: string): string[] | undefined {
  const lines = text
    .split(/\r\n|\r|\n/)
    .map((line) => line.trim().replace(/^"(.*)"$/, '$1'))
    .filter((line) => line !== '');
  return lines.length > 0 && lines.every((line) => wholePath.test(line))
    ? lines
    : undefined;
}

export function openLink(url: string): void {
  window.open(url, '_blank', 'noopener');
}
