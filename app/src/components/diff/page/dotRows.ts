import type { DotLook } from '../../../lib/page/dotLook';

export type DotRows = readonly (readonly number[])[];

const figure = (value: number) => String(Math.round(value * 1000) / 1000);

const longRun = 8;

const widestGradient = 128;

interface Run {
  readonly from: number;
  readonly length: number;
}

function runsOf(columns: readonly number[]): Run[] {
  const runs: Run[] = [];
  for (const column of columns) {
    const last = runs.at(-1);
    if (last !== undefined && last.from + last.length === column) {
      runs[runs.length - 1] = { from: last.from, length: last.length + 1 };
    } else {
      runs.push({ from: column, length: 1 });
    }
  }
  return runs;
}

function stretchesOf(columns: readonly number[]): number[][] {
  const stretches: number[][] = [];
  for (const column of columns) {
    const last = stretches.at(-1);
    if (last !== undefined && column - (last[0] ?? column) < widestGradient) {
      last.push(column);
    } else {
      stretches.push([column]);
    }
  }
  return stretches;
}

export function dotsStyle(
  rows: DotRows,
  { advance, dot, start }: DotLook,
): Pick<
  React.CSSProperties,
  'backgroundImage' | 'backgroundPosition' | 'backgroundSize'
> {
  const images: string[] = [];
  const places: string[] = [];
  const sizes: string[] = [];
  const pattern = `repeating-linear-gradient(to right,transparent 0 ${figure(start)}px,currentColor 0 ${figure(start + dot)}px,transparent 0 ${figure(advance)}px)`;
  const layer = (image: string, from: number, columns: number, top: string) => {
    images.push(image);
    places.push(`${figure(from * advance)}px ${top}`);
    sizes.push(`${figure(columns * advance)}px var(--space-dot)`);
  };
  rows.forEach((columns, row) => {
    const top =
      row === 0
        ? 'var(--dot-top)'
        : `calc(${row} * var(--dot-row) + var(--dot-top))`;
    const runs = runsOf(columns);
    const short = runs
      .filter(({ length }) => length < longRun)
      .flatMap(({ from, length }) =>
        Array.from({ length }, (_, at) => from + at),
      );
    for (const stretch of stretchesOf(short)) {
      const [first = 0] = stretch;
      const dots = stretch.map((column) => {
        const left = (column - first) * advance + start;
        return `transparent 0 ${figure(left)}px,currentColor 0 ${figure(left + dot)}px`;
      });
      layer(
        `linear-gradient(to right,${dots.join(',')},transparent 0)`,
        first,
        (stretch.at(-1) ?? first) - first + 1,
        top,
      );
    }
    for (const { from, length } of runs) {
      if (length >= longRun) {
        layer(pattern, from, length, top);
      }
    }
  });
  return {
    backgroundImage: images.join(','),
    backgroundPosition: places.join(','),
    backgroundSize: sizes.join(','),
  };
}

export const hasDots = (rows: DotRows | undefined): rows is DotRows =>
  rows?.some((columns) => columns.length > 0) === true;
