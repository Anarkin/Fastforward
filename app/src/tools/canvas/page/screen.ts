import type { Box } from './grid';

export type Way = 'up' | 'right' | 'down' | 'left';

export const wayBits: Readonly<Record<Way, number>> = {
  up: 1,
  right: 2,
  down: 4,
  left: 8,
};

export const doubleShift = 4;

export const lightBits = 0x0f;

export interface Screen {
  readonly column: number;
  readonly row: number;
  readonly columns: number;
  readonly rows: number;
  readonly glyphs: (string | undefined)[];
  readonly kinds: (string | undefined)[];
  readonly lines: Uint8Array;
  readonly lineKinds: (string | undefined)[];
  readonly arrows: (Way | undefined)[];
}

export function emptyScreen({ column, row, columns, rows }: Box): Screen {
  const cells = Math.max(0, columns * rows);
  return {
    column,
    row,
    columns,
    rows,
    glyphs: Array.from<string | undefined>({ length: cells }),
    kinds: Array.from<string | undefined>({ length: cells }),
    lines: new Uint8Array(cells),
    lineKinds: Array.from<string | undefined>({ length: cells }),
    arrows: Array.from<Way | undefined>({ length: cells }),
  };
}

export class Painter {
  constructor(readonly screen: Screen) {}

  indexOf(column: number, row: number): number | undefined {
    const across = column - this.screen.column;
    const down = row - this.screen.row;
    return across >= 0 &&
      down >= 0 &&
      across < this.screen.columns &&
      down < this.screen.rows
      ? down * this.screen.columns + across
      : undefined;
  }

  linesAt(column: number, row: number): number {
    const at = this.indexOf(column, row);
    return at === undefined ? 0 : (this.screen.lines[at] ?? 0);
  }

  clear(column: number, row: number): void {
    const at = this.indexOf(column, row);
    if (at === undefined) {
      return;
    }
    const { screen } = this;
    screen.glyphs[at] = undefined;
    screen.kinds[at] = undefined;
    screen.lines[at] = 0;
    screen.lineKinds[at] = undefined;
    screen.arrows[at] = undefined;
  }

  line(column: number, row: number, bits: number, kind?: string): void {
    const at = this.indexOf(column, row);
    if (
      at === undefined ||
      bits === 0 ||
      this.screen.arrows[at] !== undefined
    ) {
      return;
    }
    const { screen } = this;
    screen.glyphs[at] = undefined;
    screen.kinds[at] = undefined;
    screen.lines[at] = (screen.lines[at] ?? 0) | bits;
    screen.lineKinds[at] = kind;
  }

  glyph(
    column: number,
    row: number,
    cluster: string,
    cells: number,
    kind?: string,
  ): void {
    for (let cell = 0; cell < Math.max(1, cells); cell++) {
      this.clear(column + cell, row);
      const at = this.indexOf(column + cell, row);
      if (at !== undefined) {
        this.screen.glyphs[at] = cell === 0 ? cluster : '';
        this.screen.kinds[at] = kind;
      }
    }
  }

  arrow(column: number, row: number, way: Way, kind?: string): void {
    this.clear(column, row);
    const at = this.indexOf(column, row);
    if (at !== undefined) {
      this.screen.arrows[at] = way;
      this.screen.lineKinds[at] = kind;
    }
  }
}
