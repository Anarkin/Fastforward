export interface Region {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

const registers = 256;
const bucketCount = 1 << 15;
const shortestRepeat = 4;

export function sixelOf(
  bgra: Uint8Array,
  frameWidth: number,
  region: Region,
  colors = registers,
): string {
  const { palette, indexOf } = paletteOf(bgra, frameWidth, region, colors);
  const parts = [
    `\x1bP0;1;0q"1;1;${region.width};${region.height}`,
    ...palette.map(
      ([r, g, b], index) =>
        `#${index};2;${percent(r)};${percent(g)};${percent(b)}`,
    ),
  ];
  const width = region.width;
  const bits = new Uint8Array(palette.length * width);
  const first = new Int32Array(palette.length);
  const last = new Int32Array(palette.length);
  const seen = new Uint8Array(palette.length);
  for (let top = 0; top < region.height; top += 6) {
    const used: number[] = [];
    const rows = Math.min(6, region.height - top);
    for (let row = 0; row < rows; row++) {
      let offset = ((region.y + top + row) * frameWidth + region.x) * 4;
      for (let x = 0; x < width; x++, offset += 4) {
        const color = indexOf[bucketOf(bgra, offset)];
        if (seen[color] === 0) {
          seen[color] = 1;
          used.push(color);
          first[color] = x;
          last[color] = x;
        } else if (x < first[color]) {
          first[color] = x;
        } else if (x > last[color]) {
          last[color] = x;
        }
        bits[color * width + x] |= 1 << row;
      }
    }
    used.sort((a, b) => a - b);
    const band = used.map((color) => {
      seen[color] = 0;
      const line = bits.subarray(color * width, (color + 1) * width);
      const text = `#${color}${runsOf(line, first[color], last[color])}`;
      line.fill(0, first[color], last[color] + 1);
      return text;
    });
    parts.push((top === 0 ? '' : '-') + band.join('$'));
  }
  parts.push('\x1b\\');
  return parts.join('');
}

function runsOf(line: Uint8Array, from: number, to: number): string {
  let text = from > 0 ? run('?', from) : '';
  let current = line[from];
  let count = 0;
  for (let x = from; x <= to; x++) {
    if (line[x] === current) {
      count++;
    } else {
      text += run(String.fromCharCode(63 + current), count);
      current = line[x];
      count = 1;
    }
  }
  return text + run(String.fromCharCode(63 + current), count);
}

function run(character: string, count: number): string {
  return count < shortestRepeat
    ? character.repeat(count)
    : `!${count}${character}`;
}

function percent(channel: number): number {
  return Math.round((channel * 100) / 255);
}

function bucketOf(bgra: Uint8Array, offset: number): number {
  return (
    ((bgra[offset + 2] >> 3) << 10) |
    ((bgra[offset + 1] >> 3) << 5) |
    (bgra[offset] >> 3)
  );
}

function paletteOf(
  bgra: Uint8Array,
  frameWidth: number,
  region: Region,
  colors: number,
): {
  palette: readonly (readonly [number, number, number])[];
  indexOf: Uint16Array;
} {
  const counts = new Uint32Array(bucketCount);
  const sums = new Float64Array(bucketCount * 3);
  const used: number[] = [];
  for (let y = region.y; y < region.y + region.height; y++) {
    let offset = (y * frameWidth + region.x) * 4;
    for (let x = 0; x < region.width; x++, offset += 4) {
      const bucket = bucketOf(bgra, offset);
      if (counts[bucket]++ === 0) {
        used.push(bucket);
      }
      sums[bucket * 3] += bgra[offset + 2];
      sums[bucket * 3 + 1] += bgra[offset + 1];
      sums[bucket * 3 + 2] += bgra[offset];
    }
  }
  used.sort((a, b) => counts[b] - counts[a]);
  const kept = used.slice(0, colors);
  const average = (bucket: number, channel: number) =>
    Math.round(sums[bucket * 3 + channel] / counts[bucket]);
  const palette = kept.map(
    (bucket) =>
      [average(bucket, 0), average(bucket, 1), average(bucket, 2)] as const,
  );
  const indexOf = new Uint16Array(bucketCount);
  kept.forEach((bucket, index) => {
    indexOf[bucket] = index;
  });
  for (const bucket of used.slice(colors)) {
    const r = sums[bucket * 3] / counts[bucket];
    const g = sums[bucket * 3 + 1] / counts[bucket];
    const b = sums[bucket * 3 + 2] / counts[bucket];
    let nearest = 0;
    let shortest = Infinity;
    palette.forEach(([pr, pg, pb], index) => {
      const distance = (pr - r) ** 2 + (pg - g) ** 2 + (pb - b) ** 2;
      if (distance < shortest) {
        shortest = distance;
        nearest = index;
      }
    });
    indexOf[bucket] = nearest;
  }
  return { palette, indexOf };
}
