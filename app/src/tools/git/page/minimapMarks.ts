import { clicked, keymap, type Modifiers } from '../../../lib/shared/keymap';

export interface MinimapMark {
  readonly kind: 'added' | 'removed' | 'match';
  readonly top: number;
  readonly height: number;
}

export interface MinimapRow {
  readonly height: number;
  readonly change: 'added' | 'removed' | undefined;
}

function runMarks(
  rows: readonly MinimapRow[],
  kindOf: (row: MinimapRow, index: number) => MinimapMark['kind'] | undefined,
): MinimapMark[] {
  const total = rows.reduce((sum, row) => sum + row.height, 0);
  if (total === 0) {
    return [];
  }
  const marks: MinimapMark[] = [];
  let offset = 0;
  let run:
    { kind: MinimapMark['kind']; start: number; end: number } | undefined;
  const close = () => {
    if (run) {
      marks.push({
        kind: run.kind,
        top: run.start / total,
        height: (run.end - run.start) / total,
      });
      run = undefined;
    }
  };
  rows.forEach((row, index) => {
    const kind = kindOf(row, index);
    if (kind === undefined || kind !== run?.kind) {
      close();
    }
    if (kind !== undefined) {
      run ??= { kind, start: offset, end: offset };
      run.end = offset + row.height;
    }
    offset += row.height;
  });
  close();
  return marks;
}

export function minimapMarks(rows: readonly MinimapRow[]): MinimapMark[] {
  return runMarks(rows, (row) => row.change);
}

export function matchMarks(
  rows: readonly MinimapRow[],
  found: ReadonlySet<number>,
): MinimapMark[] {
  return runMarks(rows, (_, index) => (found.has(index) ? 'match' : undefined));
}

export function pointerFraction(
  clientY: number,
  box: { readonly top: number; readonly height: number },
): number {
  return box.height > 0 ? (clientY - box.top) / box.height : 0;
}

export function minimapScrollTop(
  fraction: number,
  total: number,
  viewport: number,
): number {
  const top = fraction * total - viewport / 2;
  return Math.max(0, Math.min(top, total - viewport));
}

export function grabPointer(
  event: Modifiers & {
    readonly button: number;
    readonly pointerId: number;
    readonly preventDefault: () => void;
    readonly currentTarget: { setPointerCapture: (id: number) => void };
  },
): boolean {
  if (!clicked(keymap.drag, event)) {
    return false;
  }
  event.preventDefault();
  event.currentTarget.setPointerCapture(event.pointerId);
  return true;
}
