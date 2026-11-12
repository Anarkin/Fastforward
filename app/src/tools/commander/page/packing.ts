import { strings } from '../../../shared/strings';
import { packFormats, type PackFormat } from '../shared/packing';

function separatorsOf(platform: string | undefined): RegExp {
  return platform === 'win32' ? /[\\/]/ : /\//;
}

export function lastPart(file: string, platform: string | undefined): string {
  return (
    file.split(separatorsOf(platform)).findLast((part) => part !== '') ?? ''
  );
}

export function withoutTrailing(
  folder: string,
  platform: string | undefined,
): string {
  return folder.replace(platform === 'win32' ? /[\\/]+$/ : /\/+$/, '');
}

export function folderPart(file: string, platform: string | undefined): string {
  return withoutTrailing(
    file.slice(0, file.length - lastPart(file, platform).length),
    platform,
  );
}

const knownExtension = new RegExp(
  `\\.(?:${packFormats
    .toSorted((one, other) => other.length - one.length)
    .map((format) => format.replace('.', '\\.'))
    .join('|')})$`,
  'i',
);

export function namedPart(
  archive: string,
  platform: string | undefined,
): {
  readonly start: number;
  readonly end: number;
} {
  const start =
    Math.max(
      archive.lastIndexOf('/'),
      platform === 'win32' ? archive.lastIndexOf('\\') : -1,
    ) + 1;
  const extension = knownExtension.exec(archive.slice(start));
  return {
    start,
    end: extension === null ? archive.length : start + extension.index,
  };
}

export function withFormat(archive: string, format: PackFormat): string {
  return `${archive.replace(knownExtension, '')}.${format}`;
}

function baseOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(0, dot) : name;
}

export function archiveFor(
  names: readonly string[],
  folder: string,
  target: string,
  format: PackFormat,
  platform: string | undefined,
  onlyIsFolder = false,
): string {
  const [only, ...more] = names;
  const named =
    only !== undefined && more.length === 0
      ? onlyIsFolder
        ? lastPart(only, platform)
        : baseOf(lastPart(only, platform))
      : lastPart(folder, platform);
  const name =
    named === '' || named.endsWith(':') ? strings.commander.archiveName : named;
  const separator = platform === 'win32' ? '\\' : '/';
  const into = separatorsOf(platform).test(target.at(-1) ?? '')
    ? target
    : `${target}${separator}`;
  return `${into}${name}.${format}`;
}

const units: Readonly<Record<string, number>> = {
  b: 1,
  k: 1024,
  kb: 1024,
  m: 1024 ** 2,
  mb: 1024 ** 2,
  g: 1024 ** 3,
  gb: 1024 ** 3,
};

const sizePattern = /^(\d+(?:\.\d+)?)\s*([a-z]*)$/i;

export function volumeBytesOf(text: string): number | undefined {
  const [, number, unit = ''] = sizePattern.exec(text.trim()) ?? [];
  const scale = units[unit === '' ? 'mb' : unit.toLowerCase()];
  return number === undefined || scale === undefined
    ? undefined
    : Math.round(Number(number) * scale);
}

export const volumeSizes: readonly {
  readonly size: string;
  readonly label: string;
}[] = [
  { size: '100 MB', label: '100 MB' },
  { size: '700 MB', label: strings.commander.volumeCd },
  { size: '4092 MB', label: strings.commander.volumeFat32 },
  { size: '4480 MB', label: strings.commander.volumeDvd },
];
