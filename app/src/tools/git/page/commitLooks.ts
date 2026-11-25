import type { FindRange } from '../../../lib/shared/textMatches';
import type { ShownBubble } from './commitHits';

export type RowLook =
  | {
      readonly kind: 'commit';
      readonly subject: string;
      readonly author: string;
      readonly date: string;
      readonly checkedOut: boolean;
      readonly selected: boolean;
      readonly compareFrom: boolean;
      readonly bubbles: readonly ShownBubble[];
      readonly lines: readonly number[] | undefined;
      readonly marks?: {
        readonly subject: readonly FindRange[];
        readonly author: readonly FindRange[];
      };
    }
  | {
      readonly kind: 'workingTree';
      readonly text: string;
      readonly empty: boolean;
      readonly selected: boolean;
      readonly compareFrom: boolean;
    }
  | { readonly kind: 'placeholder' };

export interface KeptLooks {
  readonly parts: readonly unknown[];
  readonly looks: Map<number, RowLook>;
  readonly before: ReadonlyMap<number, RowLook>;
}

const noLooks: ReadonlyMap<number, RowLook> = new Map();

export function keptLooksOf(
  kept: KeptLooks | undefined,
  parts: readonly unknown[],
): KeptLooks {
  if (
    kept !== undefined &&
    kept.parts.length === parts.length &&
    kept.parts.every((part, at) => part === parts[at])
  ) {
    return kept;
  }
  return { parts, looks: new Map(), before: kept?.looks ?? noLooks };
}

export function lookIn(
  kept: KeptLooks,
  index: number,
  fresh: (index: number) => RowLook | undefined,
): RowLook | undefined {
  const known = kept.looks.get(index);
  if (known !== undefined) {
    return known;
  }
  const look = fresh(index);
  if (look === undefined) {
    return undefined;
  }
  const before = kept.before.get(index);
  const shown =
    before !== undefined && JSON.stringify(before) === JSON.stringify(look)
      ? before
      : look;
  kept.looks.set(index, shown);
  return shown;
}
