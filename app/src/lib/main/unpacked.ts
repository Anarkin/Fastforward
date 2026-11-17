import { createRequire } from 'node:module';

export function unpacked(file: string): string {
  return file.replace(
    /([\\/])app\.asar([\\/])/,
    (_match, before: string, after: string) =>
      `${before}app.asar.unpacked${after}`,
  );
}

export function unpackedKoffi(): string {
  return unpacked(createRequire(__filename).resolve('koffi'));
}
