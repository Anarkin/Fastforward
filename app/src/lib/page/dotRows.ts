import type { DotLook } from './dotLook';

export type DotRows = readonly (readonly number[])[];

const figure = (value: number) => String(Math.round(value * 1000) / 1000);

export function dotsStyle(
  rows: DotRows,
  { advance, dot, start }: DotLook,
): Pick<React.CSSProperties, 'backgroundImage' | 'backgroundPosition'> {
  const images: string[] = [];
  const places: string[] = [];
  rows.forEach((columns, row) => {
    if (columns.length > 0) {
      const dots = columns.map((column) => {
        const left = column * advance + start;
        return `transparent 0 ${figure(left)}px,currentColor 0 ${figure(left + dot)}px`;
      });
      images.push(`linear-gradient(to right,${dots.join(',')},transparent 0)`);
      places.push(
        row === 0
          ? '0 var(--dot-top)'
          : `0 calc(${row} * var(--dot-row) + var(--dot-top))`,
      );
    }
  });
  return {
    backgroundImage: images.join(','),
    backgroundPosition: places.join(','),
  };
}

export const hasDots = (rows: DotRows | undefined): rows is DotRows =>
  rows?.some((columns) => columns.length > 0) === true;
