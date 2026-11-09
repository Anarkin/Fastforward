import { strings } from '../../../shared/strings';

export const packFormats = ['zip', '7z', 'tar', 'tar.gz', 'tar.xz'] as const;

export type PackFormat = (typeof packFormats)[number];

export const packLevels = [
  'store',
  'fastest',
  'normal',
  'maximum',
  'ultra',
] as const;

export type PackLevel = (typeof packLevels)[number];

export const zipCiphers = ['aes256', 'zipCrypto'] as const;

export type ZipCipher = (typeof zipCiphers)[number];

export const smallestVolume = 64 * 1024;

export function isPackFormat(value: unknown): value is PackFormat {
  return packFormats.some((format) => format === value);
}

export function isPackLevel(value: unknown): value is PackLevel {
  return packLevels.some((level) => level === value);
}

export function isZipCipher(value: unknown): value is ZipCipher {
  return zipCiphers.some((cipher) => cipher === value);
}

export function compresses(format: PackFormat): boolean {
  return format !== 'tar';
}

export function encrypts(format: PackFormat): boolean {
  return format === 'zip' || format === '7z';
}

const ascii = /^[\x20-\x7e]*$/;

export function packPasswordProblem(
  password: string,
  format: PackFormat,
): string | undefined {
  if (password === '') {
    return strings.commander.noPassword;
  }
  return format === 'zip' && !ascii.test(password)
    ? strings.commander.zipPasswordAscii
    : undefined;
}
