import type { DotLook } from '../../../lib/page/dotLook';
import { dotsStyle, hasDots, type DotRows } from './dotRows';

export function DotRowsShown({
  rows,
  look,
  left,
  alone = false,
}: {
  readonly rows: DotRows;
  readonly look: DotLook;
  readonly left: string;
  readonly alone?: boolean;
}) {
  return hasDots(rows) ? (
    <span
      className="dot-rows"
      aria-hidden={alone || undefined}
      style={{ left, ...dotsStyle(rows, look) }}
    />
  ) : null;
}
