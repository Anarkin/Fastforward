export type Rgb = readonly [number, number, number];

export type Picture = (x: number, y: number) => Rgb | undefined;

function samplesAcross(size: number): number {
  return size <= 64 ? 16 : size <= 256 ? 8 : 4;
}

export function rasterized(picture: Picture, size: number): Uint8Array {
  const samples = samplesAcross(size);
  const total = samples * samples;
  const rgba = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let red = 0;
      let green = 0;
      let blue = 0;
      let covered = 0;
      for (let row = 0; row < samples; row++) {
        for (let column = 0; column < samples; column++) {
          const color = picture(
            x + (column + 0.5) / samples,
            y + (row + 0.5) / samples,
          );
          if (color !== undefined) {
            red += color[0];
            green += color[1];
            blue += color[2];
            covered++;
          }
        }
      }
      if (covered > 0) {
        const at = (y * size + x) * 4;
        rgba[at] = Math.round(red / covered);
        rgba[at + 1] = Math.round(green / covered);
        rgba[at + 2] = Math.round(blue / covered);
        rgba[at + 3] = Math.round((255 * covered) / total);
      }
    }
  }
  return rgba;
}
