import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { entriesOfIcns, icnsOf } from './icons/icns.mts';
import { icoOf, imagesOfIco } from './icons/ico.mts';
import { discPicture, platePicture } from './icons/pictures.mts';
import { decodedPng, encodedPng } from './icons/png.mts';
import { type Picture, rasterized } from './icons/raster.mts';
import { appIconSvg } from './icons/svg.mts';

export const windowsSizes = [
  16, 20, 24, 30, 32, 36, 40, 48, 60, 64, 72, 80, 96, 256,
] as const;

const linuxSizes = [16, 24, 32, 48, 64, 128, 256, 512] as const;

const macEntries = [
  ['icp4', 16],
  ['icp5', 32],
  ['icp6', 64],
  ['ic07', 128],
  ['ic08', 256],
  ['ic09', 512],
  ['ic10', 1024],
  ['ic11', 32],
  ['ic12', 64],
  ['ic13', 256],
  ['ic14', 512],
] as const;

function rendered(
  draw: (size: number) => Picture,
): (size: number) => Uint8Array {
  const pngs = new Map<number, Uint8Array>();
  return (size) => {
    const known = pngs.get(size);
    if (known !== undefined) {
      return known;
    }
    const png = encodedPng({
      width: size,
      height: size,
      rgba: rasterized(draw(size), size),
    });
    pngs.set(size, png);
    return png;
  };
}

function iconWriters(): Record<string, () => Uint8Array> {
  const disc = rendered((size) => discPicture(size));
  const plate = rendered(platePicture);
  return {
    'build/icon.svg': () => new TextEncoder().encode(appIconSvg()),
    'build/icon.ico': () =>
      icoOf(windowsSizes.map((size) => ({ size, png: disc(size) }))),
    'build/icon.icns': () =>
      icnsOf(macEntries.map(([type, size]) => ({ type, png: plate(size) }))),
    ...Object.fromEntries(
      linuxSizes.map((size) => [
        `build/icons/${size}x${size}.png`,
        () => disc(size),
      ]),
    ),
  };
}

export const iconFileNames = Object.keys(iconWriters());

export function iconFiles(): Record<string, Uint8Array> {
  return Object.fromEntries(
    Object.entries(iconWriters()).map(([file, write]) => [file, write()]),
  );
}

export function imagesOfIconFile(
  file: string,
  bytes: Uint8Array,
): Record<string, unknown> {
  if (file.endsWith('.svg')) {
    return { svg: new TextDecoder().decode(bytes).replaceAll('\r\n', '\n') };
  }
  if (file.endsWith('.ico')) {
    return Object.fromEntries(
      imagesOfIco(bytes).map(({ size, png }) => [size, decodedPng(png)]),
    );
  }
  if (file.endsWith('.icns')) {
    return Object.fromEntries(
      entriesOfIcns(bytes).map(({ type, png }) => [type, decodedPng(png)]),
    );
  }
  return { png: decodedPng(bytes) };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const app = path.join(import.meta.dirname, '..');
  for (const [file, bytes] of Object.entries(iconFiles())) {
    const target = path.join(app, file);
    if (fs.existsSync(target) && fs.readFileSync(target).equals(bytes)) {
      continue;
    }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, bytes);
    console.log(`Wrote ${file}.`);
  }
}
