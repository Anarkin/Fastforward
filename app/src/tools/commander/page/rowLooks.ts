import type { LineState } from './lineLooks';
import type { Row } from './listing';

const stateKey = (
  { selected, marked, startsGroup, dropTarget }: LineState,
  more: string,
) => `${+selected}${+marked}${+startsGroup}${+dropTarget}${more}`;

export class RowLooks<Look> {
  private settings: object | undefined;
  private kept = new WeakMap<
    Row,
    { readonly key: string; readonly look: Look }
  >();

  of(
    row: Row,
    state: LineState,
    settings: object,
    more: string,
    make: () => Look,
  ): Look {
    if (settings !== this.settings) {
      this.settings = settings;
      this.kept = new WeakMap();
    }
    const key = stateKey(state, more);
    const known = this.kept.get(row);
    if (known?.key === key) {
      return known.look;
    }
    const look = make();
    this.kept.set(row, { key, look });
    return look;
  }
}

const signs = new WeakMap<object, string>();

export function signOf(look: object): string {
  const known = signs.get(look);
  if (known !== undefined) {
    return known;
  }
  const sign = JSON.stringify(look);
  signs.set(look, sign);
  return sign;
}
