import { binary, sentence } from './samples.mts';

export const kib = 1024;
export const mib = 1024 * kib;
export const gib = 1024 * mib;

export const lines = (count: number, line: (i: number) => string) =>
  `${Array.from({ length: count }, (_, i) => line(i)).join('\n')}\n`;

export function* textOfSize(
  size: number,
  line: (i: number) => string,
  last = (length: number) => `${'.'.repeat(Math.max(0, length - 1))}\n`,
): Iterable<string> {
  let left = size;
  let batch = '';
  for (let i = 0; left > 0; i++) {
    const next = `${line(i)}\n`;
    const piece = next.length <= left ? next : last(left).slice(0, left);
    batch += piece;
    left -= piece.length;
    if (batch.length >= mib) {
      yield batch;
      batch = '';
    }
  }
  if (batch !== '') {
    yield batch;
  }
}

export function* oneLineOfSize(size: number): Iterable<string> {
  const block = `${sentence(3, 200_000)} `.slice(0, mib);
  for (let left = size - 1; left > 0; left -= block.length) {
    yield block.slice(0, Math.min(left, block.length));
  }
  yield '\n';
}

export function* randomOfSize(size: number, seed: number): Iterable<Buffer> {
  const block = binary(mib, seed);
  for (let at = 0; at < size; at += block.length) {
    const piece = Buffer.from(
      block.subarray(0, Math.min(block.length, size - at)),
    );
    piece.writeUInt32LE((at / block.length) >>> 0, 0);
    yield piece;
  }
}

export const logLine = (i: number) =>
  `2026-02-01T${String(Math.floor(i / 3600) % 24).padStart(2, '0')}:${String(Math.floor(i / 60) % 60).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}.${String(i % 1000).padStart(3, '0')}Z ${['INFO', 'DEBUG', 'WARN', 'INFO', 'ERROR'][i % 5]} worker-${i % 8} request ${100_000 + i} ${sentence(i, 5)} took ${(i * 7) % 900} ms`;

export const logOfSize = (size: number): Iterable<string> => {
  const needleAt = Math.floor((size * 0.98) / 110);
  return textOfSize(size, (i) =>
    i === needleAt
      ? `${logLine(i)} NEEDLE: the one line to find, near the end`
      : logLine(i),
  );
};

export const codeOfSize = (size: number) =>
  textOfSize(
    size,
    (i) =>
      i % 10 === 0
        ? `export function step${i}(value: number): number {`
        : i % 10 === 9
          ? '}'
          : `  value = value * ${i % 7} + ${i}; // ${sentence(i, 3)}`,
    (length) => `//${'.'.repeat(Math.max(0, length - 3))}\n`,
  );

export const markdownOfSize = (size: number) =>
  textOfSize(size, (i) =>
    i % 20 === 0
      ? `## Section ${i / 20 + 1}`
      : i % 20 === 1
        ? ''
        : `- Item ${i}: **${sentence(i, 3)}**, \`${sentence(i + 1, 2)}\` and ${sentence(i + 2, 6)}.`,
  );
