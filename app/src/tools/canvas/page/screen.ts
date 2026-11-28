import type { SegmentsOf } from '../../../components/cells/page/cellPainting';
import type { ScreenRow } from '../../../components/cells/page/lines';
import type { TextSelection } from '../../../components/cells/page/textSelection';
import type { Box } from './grid';

export type Way = 'up' | 'right' | 'down' | 'left';

export const wayBits: Readonly<Record<Way, number>> = {
  up: 1,
  right: 2,
  down: 4,
  left: 8,
};

export const lightBits = 0x0f;

const ways: readonly Way[] = ['up', 'right', 'down', 'left'];

const armIndex: Readonly<Record<Way, number>> = {
  up: 0,
  right: 1,
  down: 2,
  left: 3,
};

export interface TextBlock {
  readonly owner: number;
  readonly column: number;
  readonly row: number;
  readonly rows: readonly ScreenRow[];
  readonly wrapAt: number | undefined;
  readonly room: number;
  readonly first?: number | undefined;
  readonly kind?: string | undefined;
  readonly selection?: TextSelection | undefined;
  readonly segmentsOf?: SegmentsOf | undefined;
}

export interface Caret {
  readonly start: number;
  readonly column: number;
  readonly row: number;
  readonly cells: number;
  readonly under: string;
}

export const outsideTop = 1;
export const outsideRight = 2;
export const outsideBottom = 4;
export const outsideLeft = 8;

export interface Screen {
  readonly column: number;
  readonly row: number;
  readonly columns: number;
  readonly rows: number;
  readonly glyphs: (string | undefined)[];
  readonly kinds: (string | undefined)[];
  readonly lines: Uint8Array;
  readonly armKinds: (string | undefined)[];
  readonly arrows: (Way | undefined)[];
  readonly covered: Uint8Array;
  readonly outside: Uint8Array;
  readonly chosen: Uint8Array;
  readonly edges: (string | undefined)[];
  readonly owners: Int32Array;
  readonly seen: (string | undefined)[];
  readonly texts: TextBlock[];
  readonly carets: Caret[];
  see: (() => void) | undefined;
}

let blank: undefined[] = [];

function unset<Value>(cells: number): (Value | undefined)[] {
  if (blank.length < cells) {
    blank = [];
    blank.length = cells;
    blank.fill(undefined);
  }
  return blank.slice(0, cells);
}

export function emptyScreen({ column, row, columns, rows }: Box): Screen {
  const cells = Math.max(0, columns * rows);
  return {
    column,
    row,
    columns,
    rows,
    glyphs: unset<string | undefined>(cells),
    kinds: unset<string | undefined>(cells),
    lines: new Uint8Array(cells),
    armKinds: unset<string | undefined>(cells * ways.length),
    arrows: unset<Way | undefined>(cells),
    covered: new Uint8Array(cells),
    outside: new Uint8Array(cells),
    chosen: new Uint8Array(cells),
    edges: unset<string | undefined>(cells),
    owners: new Int32Array(cells).fill(-1),
    seen: unset<string | undefined>(cells),
    texts: [],
    carets: [],
    see: undefined,
  };
}

export const armKindOf = (
  screen: Screen,
  at: number,
  way: Way,
): string | undefined => screen.armKinds[at * ways.length + armIndex[way]];

export class Painter {
  private owned = 0;

  constructor(readonly screen: Screen) {}

  nextOwner(): number {
    return this.owned++;
  }

  choose(column: number, row: number, chosen: boolean): void {
    const at = this.indexOf(column, row);
    if (at !== undefined) {
      this.screen.chosen[at] = chosen ? 1 : 0;
    }
  }

  claim(column: number, row: number, owner: number): void {
    const at = this.indexOf(column, row);
    if (at !== undefined) {
      this.screen.owners[at] = owner;
    }
  }

  text(block: TextBlock): void {
    this.screen.texts.push(block);
  }

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

  cover(column: number, row: number, outside = 0): void {
    const at = this.indexOf(column, row);
    if (at !== undefined) {
      this.screen.covered[at] = 1;
      this.screen.outside[at] = outside;
    }
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
    screen.armKinds.fill(undefined, at * ways.length, (at + 1) * ways.length);
    screen.arrows[at] = undefined;
    screen.edges[at] = undefined;
    screen.owners[at] = -1;
    screen.seen[at] = undefined;
  }

  unarrow(column: number, row: number): void {
    const at = this.indexOf(column, row);
    if (at !== undefined) {
      this.screen.arrows[at] = undefined;
    }
  }

  edge(column: number, row: number, id: string): void {
    const at = this.indexOf(column, row);
    if (at !== undefined) {
      this.screen.edges[at] = id;
    }
  }

  caret(caret: Caret): void {
    if (this.indexOf(caret.column, caret.row) !== undefined) {
      this.screen.carets.push(caret);
    }
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
    for (const way of ways) {
      if ((bits & wayBits[way]) !== 0) {
        screen.armKinds[at * ways.length + armIndex[way]] = kind;
      }
    }
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
      this.screen.armKinds[at * ways.length + armIndex[way]] = kind;
    }
  }
}
