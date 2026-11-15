import { png, shade } from './formats.mts';
import { images } from './gitImages.mts';

export const vector = (fill: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">\n  <rect width="96" height="96" rx="16" fill="#eee"/>\n  <circle cx="48" cy="48" r="32" fill="${fill}"/>\n</svg>\n`;
export const decoded = (text: string) => Buffer.from(text, 'base64');
export const imageKinds = [
  {
    extension: 'png',
    terms: ['png', 'portable network graphics'],
    versions: () => [
      png(48, 48, (x, y) => [shade(x * 0.3), shade(0.4 + y * 0.4), 200]),
      png(48, 48, (x, y) => [220, shade(0.4 + y * 0.4), shade(x * 0.3)]),
    ],
  },
  {
    extension: 'jpg',
    terms: ['jpg', 'jpeg', 'photo'],
    versions: () => images.jpg.map(decoded),
  },
  {
    extension: 'jpeg',
    terms: ['jpeg', 'jpg', 'photo'],
    versions: () => images.jpeg.map(decoded),
  },
  { extension: 'gif', terms: ['gif'], versions: () => images.gif.map(decoded) },
  {
    extension: 'webp',
    terms: ['webp'],
    versions: () => images.webp.map(decoded),
  },
  {
    extension: 'avif',
    terms: ['avif'],
    versions: () => images.avif.map(decoded),
  },
  {
    extension: 'bmp',
    terms: ['bmp', 'bitmap'],
    versions: () => images.bmp.map(decoded),
  },
  {
    extension: 'ico',
    terms: ['ico', 'icon', 'favicon'],
    versions: () => images.ico.map(decoded),
  },
  {
    extension: 'svg',
    terms: ['svg', 'vector', 'xml'],
    versions: () => [vector('#06c'), vector('#c60')],
  },
];

export const plainPng = (width: number, height: number, hue: number) =>
  png(width, height, (x, y) => {
    const angle = (hue / 360) * 2 * Math.PI;
    return [
      shade(0.5 + 0.4 * Math.cos(angle) * (1 - y)),
      shade(0.5 + 0.4 * Math.cos(angle + 2.1) * x),
      shade(0.5 + 0.4 * Math.cos(angle + 4.2)),
    ];
  });

export const orientedJpeg = (orientation: number) => {
  const jpeg = decoded(images.jpg[0]);
  const tiff = Buffer.from([
    0x4d,
    0x4d,
    0x00,
    0x2a,
    0x00,
    0x00,
    0x00,
    0x08,
    0x00,
    0x01,
    0x01,
    0x12,
    0x00,
    0x03,
    0x00,
    0x00,
    0x00,
    0x01,
    0x00,
    orientation,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
  ]);
  const body = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), tiff]);
  const marker = Buffer.alloc(4);
  marker.writeUInt16BE(0xffe1, 0);
  marker.writeUInt16BE(body.length + 2, 2);
  return Buffer.concat([jpeg.subarray(0, 2), marker, body, jpeg.subarray(2)]);
};
