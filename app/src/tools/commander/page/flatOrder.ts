import { filterWords, matchesFilter } from '../../../lib/shared/filter';
import type { Entry } from '../shared/protocol';
import { sameGrouping } from './fileColors';
import type { FlatChoices, SlottedFolder } from './flatMessages';
import { flatRowOf, type Row } from './listing';
import { fileGroupOf, mergedRows, sortedRows } from './rowOrder';

export type { FlatChoices } from './flatMessages';

type SlotRow = Row & { readonly entry: Entry; readonly slot: number };

export interface FlatResult {
  readonly order: Uint32Array;
  readonly shown: Uint32Array | undefined;
  readonly query: string;
}

function sortsAlike(one: FlatChoices, other: FlatChoices): boolean {
  return (
    one.sort.column === other.sort.column &&
    one.sort.descending === other.sort.descending &&
    one.sort.groupByColor === other.sort.groupByColor &&
    one.showHidden === other.showHidden &&
    (!one.sort.groupByColor || sameGrouping(one.fileColors, other.fileColors))
  );
}

interface Matching {
  readonly query: string;
  readonly words: readonly string[];
  readonly rows: Set<SlotRow>;
}

export class FlatOrder {
  private readonly bySlot = new Map<number, SlotRow>();
  private ordered: readonly SlotRow[] = [];
  private added: SlotRow[] = [];
  private readonly removed = new Set<SlotRow>();
  private sortedFor: FlatChoices | undefined;
  private matching: Matching | undefined;

  constructor(private choices: FlatChoices) {}

  put(folders: readonly SlottedFolder[], freed: readonly number[]): void {
    for (const slot of freed) {
      const row = this.bySlot.get(slot);
      if (row !== undefined) {
        this.bySlot.delete(slot);
        this.removed.add(row);
        this.matching?.rows.delete(row);
      }
    }
    for (const { under, entries, slots } of folders) {
      entries.forEach((entry, index) => {
        const row: SlotRow = { ...flatRowOf(entry, under), slot: slots[index] };
        this.bySlot.set(row.slot, row);
        this.added.push(row);
        if (
          this.matching !== undefined &&
          matchesFilter(this.matching.words, entry.name)
        ) {
          this.matching.rows.add(row);
        }
      });
    }
  }

  choose(choices: FlatChoices): void {
    this.choices = choices;
  }

  result(): FlatResult {
    const { choices } = this;
    const group = fileGroupOf(choices.sort, choices.fileColors);
    const shows = (row: SlotRow) => choices.showHidden || !row.entry.hidden;
    if (this.sortedFor === undefined || !sortsAlike(this.sortedFor, choices)) {
      this.ordered = sortedRows(
        [...this.bySlot.values()].filter(shows),
        choices.sort,
        group,
      );
    } else {
      const kept =
        this.removed.size === 0
          ? this.ordered
          : this.ordered.filter((row) => !this.removed.has(row));
      const added = this.added.filter(
        (row) => shows(row) && !this.removed.has(row),
      );
      this.ordered = mergedRows(kept, added, choices.sort, group);
    }
    this.added = [];
    this.removed.clear();
    this.sortedFor = choices;
    const matching = this.matchingOf(choices.query);
    return {
      order: Uint32Array.from(this.ordered, (row) => row.slot),
      shown:
        matching === undefined
          ? undefined
          : Uint32Array.from(
              this.ordered.filter((row) => matching.rows.has(row)),
              (row) => row.slot,
            ),
      query: choices.query,
    };
  }

  private matchingOf(query: string): Matching | undefined {
    const words = filterWords(query);
    if (words.length === 0) {
      this.matching = undefined;
    } else if (this.matching?.query !== query) {
      const rows = new Set<SlotRow>();
      for (const row of this.bySlot.values()) {
        if (matchesFilter(words, row.entry.name)) {
          rows.add(row);
        }
      }
      this.matching = { query, words, rows };
    }
    return this.matching;
  }
}
