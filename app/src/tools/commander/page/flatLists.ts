import type { FlatFolder } from '../shared/protocol';
import { sameGrouping } from './fileColors';
import type {
  FlatChoices,
  FromFlatWorker,
  SlottedFolder,
  ToFlatWorker,
} from './flatMessages';
import { flatRowOf, parentRow, type Row } from './listing';

export interface FlatWorker {
  postMessage(message: ToFlatWorker, transfer?: Transferable[]): void;
  addEventListener(
    type: 'message',
    listener: (event: { readonly data: FromFlatWorker }) => void,
  ): void;
}

export interface FlatBuilt {
  readonly rows: readonly Row[];
  readonly shown:
    { readonly query: string; readonly rows: readonly Row[] } | undefined;
}

export interface FlatTiming {
  readonly now: () => number;
  readonly later: (run: () => void, wait: number) => void;
}

const shortestGap = 100;

interface Kept {
  readonly walk: number;
  readonly parent: boolean;
  readonly bySlot: (Row | undefined)[];
  readonly slotsOf: Map<string, readonly number[]>;
  choices: FlatChoices;
  built: FlatBuilt | undefined;
  waiting: FromFlatWorker | undefined;
  timed: boolean;
  builtAt: number;
  took: number;
}

function sameChoices(one: FlatChoices, other: FlatChoices): boolean {
  return (
    one.sort.column === other.sort.column &&
    one.sort.descending === other.sort.descending &&
    one.sort.groupByColor === other.sort.groupByColor &&
    one.showHidden === other.showHidden &&
    one.query === other.query &&
    sameGrouping(one.fileColors, other.fileColors)
  );
}

const realTiming: FlatTiming = {
  now: () => performance.now(),
  later: (run, wait) => setTimeout(run, wait),
};

export class FlatLists {
  private worker: FlatWorker | undefined;
  private readonly kept = new Map<string, Kept>();

  constructor(
    private readonly create: () => FlatWorker,
    private readonly onBuilt: (pane: string) => void,
    private readonly timing: FlatTiming = realTiming,
  ) {}

  ensure(
    pane: string,
    walk: number,
    parent: boolean,
    choices: FlatChoices,
  ): void {
    const kept = this.kept.get(pane);
    if (kept?.walk === walk) {
      if (!sameChoices(kept.choices, choices)) {
        kept.choices = choices;
        this.tell({ type: 'choose', pane, walk, choices });
      }
      return;
    }
    this.kept.set(pane, {
      walk,
      parent,
      bySlot: [],
      slotsOf: new Map(),
      choices,
      built: undefined,
      waiting: undefined,
      timed: false,
      builtAt: -Infinity,
      took: 0,
    });
    this.tell({ type: 'start', pane, walk, choices });
  }

  files(pane: string, walk: number, folders: readonly FlatFolder[]): void {
    const kept = this.kept.get(pane);
    if (kept?.walk !== walk) {
      return;
    }
    const freed: number[] = [];
    const slotted: SlottedFolder[] = folders.map(({ under, entries }) => {
      for (const slot of kept.slotsOf.get(under) ?? []) {
        kept.bySlot[slot] = undefined;
        freed.push(slot);
      }
      const slots = entries.map((entry) => {
        kept.bySlot.push(flatRowOf(entry, under));
        return kept.bySlot.length - 1;
      });
      if (slots.length === 0) {
        kept.slotsOf.delete(under);
      } else {
        kept.slotsOf.set(under, slots);
      }
      return { under, entries, slots };
    });
    this.tell({ type: 'files', pane, walk, folders: slotted, freed });
  }

  built(pane: string, walk: number): FlatBuilt | undefined {
    const kept = this.kept.get(pane);
    return kept?.walk === walk ? kept.built : undefined;
  }

  panes(): string[] {
    return [...this.kept.keys()];
  }

  drop(pane: string): void {
    if (this.kept.delete(pane)) {
      this.tell({ type: 'drop', pane });
    }
  }

  private tell(message: ToFlatWorker): void {
    if (this.worker === undefined) {
      const worker = this.create();
      worker.addEventListener('message', ({ data }) => this.answered(data));
      this.worker = worker;
    }
    this.worker.postMessage(message);
  }

  private answered(answer: FromFlatWorker): void {
    const kept = this.kept.get(answer.pane);
    if (kept?.walk !== answer.walk) {
      return;
    }
    kept.waiting = answer;
    if (kept.timed) {
      return;
    }
    const wait =
      kept.builtAt + Math.max(shortestGap, 2 * kept.took) - this.timing.now();
    if (wait <= 0) {
      this.build(answer.pane, kept);
      return;
    }
    kept.timed = true;
    this.timing.later(() => {
      kept.timed = false;
      if (this.kept.get(answer.pane) === kept) {
        this.build(answer.pane, kept);
      }
    }, wait);
  }

  private build(pane: string, kept: Kept): void {
    const answer = kept.waiting;
    if (answer === undefined) {
      return;
    }
    kept.waiting = undefined;
    const started = this.timing.now();
    const rowsOf = (slots: Uint32Array) => {
      const rows: Row[] = kept.parent ? [parentRow] : [];
      for (const slot of slots) {
        const row = kept.bySlot[slot];
        if (row !== undefined) {
          rows.push(row);
        }
      }
      return rows;
    };
    kept.built = {
      rows: rowsOf(answer.order),
      shown:
        answer.shown === undefined
          ? undefined
          : { query: answer.query, rows: rowsOf(answer.shown) },
    };
    kept.builtAt = this.timing.now();
    kept.took = kept.builtAt - started;
    this.onBuilt(pane);
  }
}
