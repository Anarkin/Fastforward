export function isWebp(bytes: Uint8Array): boolean {
  const text = (from: number, to: number) =>
    String.fromCharCode(...bytes.subarray(from, to));
  return bytes.length >= 12 && text(0, 4) === 'RIFF' && text(8, 12) === 'WEBP';
}
