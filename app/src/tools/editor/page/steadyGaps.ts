import { EditorState } from '@codemirror/state';

interface Gap {
  readonly from: number;
  readonly to: number;
}

export function steadyGaps<Kept extends Gap>(
  seen: readonly Kept[],
  around: readonly Kept[],
  line: Gap,
): Kept[] {
  const within = (gap: Gap) => gap.from >= line.from && gap.to <= line.to;
  return [
    ...seen.filter((gap) => !within(gap)),
    ...around.filter(within),
  ].toSorted((one, other) => one.from - other.from);
}

const isGap = (value: unknown): value is Gap =>
  typeof value === 'object' &&
  value !== null &&
  typeof Reflect.get(value, 'from') === 'number' &&
  typeof Reflect.get(value, 'to') === 'number';

const areGaps = (value: unknown): value is Gap[] =>
  Array.isArray(value) && value.every(isGap);

function headOf(target: unknown): number | undefined {
  const range: unknown =
    typeof target === 'object' && target !== null
      ? Reflect.get(target, 'range')
      : undefined;
  const head: unknown =
    typeof range === 'object' && range !== null
      ? Reflect.get(range, 'head')
      : undefined;
  return typeof head === 'number' ? head : undefined;
}

const steadied = new WeakSet<object>();

export function keepLineGapsSteady(view: object): void {
  const viewState: unknown = Reflect.get(view, 'viewState');
  const shared: unknown =
    typeof viewState === 'object' && viewState !== null
      ? Object.getPrototypeOf(viewState)
      : undefined;
  if (typeof shared !== 'object' || shared === null || steadied.has(shared)) {
    return;
  }
  const ensure: unknown = Reflect.get(shared, 'ensureLineGaps');
  if (typeof ensure !== 'function') {
    return;
  }
  steadied.add(shared);
  Reflect.set(
    shared,
    'ensureLineGaps',
    function ensureSteady(this: object, ...asked: unknown[]): unknown {
      const target: unknown = Reflect.get(this, 'scrollTarget');
      const state: unknown = Reflect.get(this, 'state');
      const head = headOf(target);
      const around: unknown = Reflect.apply(ensure, this, asked);
      if (
        head === undefined ||
        !(state instanceof EditorState) ||
        !areGaps(around)
      ) {
        return around;
      }
      Reflect.set(this, 'scrollTarget', null);
      let seen: unknown;
      try {
        seen = Reflect.apply(ensure, this, asked);
      } finally {
        Reflect.set(this, 'scrollTarget', target);
      }
      return areGaps(seen)
        ? steadyGaps(
            seen,
            around,
            state.doc.lineAt(Math.min(head, state.doc.length)),
          )
        : around;
    },
  );
}
