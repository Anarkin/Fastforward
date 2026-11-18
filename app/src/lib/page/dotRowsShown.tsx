import { dotsStyle, hasDots, type DotRows } from './dotRows';

export function DotRowsShown({
  rows,
  left,
  alone = false,
}: {
  readonly rows: DotRows;
  readonly left: string;
  readonly alone?: boolean;
}) {
  return hasDots(rows) ? (
    <span
      className="dot-rows"
      aria-hidden={alone || undefined}
      style={{ left, ...dotsStyle(rows) }}
    />
  ) : null;
}
