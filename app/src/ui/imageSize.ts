const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const jpegFrames = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
]);

const startOfScan = 0xda;

function text(bytes: Uint8Array, from: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(from, from + length));
}

function sized(width: number, height: number): PixelSize | undefined {
  return width > 0 && height > 0 ? { width, height } : undefined;
}

function pngSize(bytes: Uint8Array, view: DataView): PixelSize | undefined {
  return bytes.length >= 24 && text(bytes, 12, 4) === 'IHDR'
    ? sized(view.getUint32(16), view.getUint32(20))
    : undefined;
}

function storedJpegSize(
  bytes: Uint8Array,
  view: DataView,
): PixelSize | undefined {
  let at = 2;
  while (at + 4 <= bytes.length) {
    if (bytes[at] !== 0xff) {
      return undefined;
    }
    const marker = bytes[at + 1];
    if (marker === 0xff) {
      at++;
      continue;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
      at += 2;
      continue;
    }
    if (marker === startOfScan) {
      return undefined;
    }
    if (jpegFrames.has(marker)) {
      return at + 9 <= bytes.length
        ? { width: view.getUint16(at + 7), height: view.getUint16(at + 5) }
        : undefined;
    }
    at += 2 + view.getUint16(at + 2);
  }
  return undefined;
}

function webpSize(bytes: Uint8Array, view: DataView): PixelSize | undefined {
  const chunk = text(bytes, 12, 4);
  if (chunk === 'VP8X' && bytes.length >= 30) {
    const side = (at: number) =>
      (bytes[at] | (bytes[at + 1] << 8) | (bytes[at + 2] << 16)) + 1;
    return sized(side(24), side(27));
  }
  if (chunk === 'VP8L' && bytes.length >= 25 && bytes[20] === 0x2f) {
    const packed = view.getUint32(21, true);
    return sized((packed & 0x3fff) + 1, ((packed >>> 14) & 0x3fff) + 1);
  }
  if (
    chunk === 'VP8 ' &&
    bytes.length >= 30 &&
    bytes[23] === 0x9d &&
    bytes[24] === 0x01 &&
    bytes[25] === 0x2a
  ) {
    return sized(
      view.getUint16(26, true) & 0x3fff,
      view.getUint16(28, true) & 0x3fff,
    );
  }
  return undefined;
}

export function storedSizeOf(bytes: Uint8Array): PixelSize | undefined {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (pngSignature.every((value, index) => bytes[index] === value)) {
    return pngSize(bytes, view);
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    const stored = storedJpegSize(bytes, view);
    return stored && sized(stored.width, stored.height);
  }
  if (text(bytes, 0, 6) === 'GIF87a' || text(bytes, 0, 6) === 'GIF89a') {
    return bytes.length >= 10
      ? sized(view.getUint16(6, true), view.getUint16(8, true))
      : undefined;
  }
  if (text(bytes, 0, 4) === 'RIFF' && text(bytes, 8, 4) === 'WEBP') {
    return webpSize(bytes, view);
  }
  if (text(bytes, 0, 2) === 'BM' && bytes.length >= 26) {
    return sized(
      Math.abs(view.getInt32(18, true)),
      Math.abs(view.getInt32(22, true)),
    );
  }
  return undefined;
}

export interface PixelSize {
  readonly width: number;
  readonly height: number;
}

export function targetSide(
  longest: number,
  box: number,
  pixelRatio: number,
): number {
  return Math.max(1, Math.round(Math.min(box, longest) * pixelRatio));
}

export function bitmapResizing(
  stored: PixelSize | undefined,
  box: number,
  pixelRatio: number,
):
  | { readonly resizeWidth: number }
  | { readonly resizeHeight: number }
  | undefined {
  if (stored === undefined) {
    return undefined;
  }
  const target = targetSide(
    Math.max(stored.width, stored.height),
    box,
    pixelRatio,
  );
  return stored.width >= stored.height
    ? { resizeWidth: target }
    : { resizeHeight: target };
}

export function thumbnailPixels(drawn: PixelSize, target: number): PixelSize {
  const scale = target / Math.max(drawn.width, drawn.height, 1);
  return {
    width: Math.max(1, Math.round(drawn.width * scale)),
    height: Math.max(1, Math.round(drawn.height * scale)),
  };
}

export function jpegSize(bytes: Uint8Array): PixelSize | undefined {
  return bytes[0] === 0xff && bytes[1] === 0xd8
    ? storedJpegSize(
        bytes,
        new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength),
      )
    : undefined;
}

const jpegFractions = [8, 4, 2];

export function jpegScaling(
  stored: PixelSize,
  target: number,
): PixelSize | undefined {
  const longest = Math.max(stored.width, stored.height);
  const divisor = jpegFractions.find(
    (each) => Math.ceil(longest / each) >= target,
  );
  return divisor === undefined
    ? undefined
    : {
        width: Math.ceil(stored.width / divisor),
        height: Math.ceil(stored.height / divisor),
      };
}

export function halvings(from: PixelSize, to: PixelSize): PixelSize[] {
  const steps: PixelSize[] = [];
  let current = from;
  while (current.width / 2 >= to.width && current.height / 2 >= to.height) {
    current = {
      width: Math.round(current.width / 2),
      height: Math.round(current.height / 2),
    };
    steps.push(current);
  }
  return steps;
}
