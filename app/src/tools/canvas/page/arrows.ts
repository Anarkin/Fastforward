import type { BoardEdge, EdgeEnd } from '../shared/board';

export interface Ends {
  readonly fromEnd: EdgeEnd;
  readonly toEnd: EdgeEnd;
}

const turns: readonly Ends[] = [
  { fromEnd: 'none', toEnd: 'arrow' },
  { fromEnd: 'arrow', toEnd: 'none' },
  { fromEnd: 'arrow', toEnd: 'arrow' },
  { fromEnd: 'none', toEnd: 'none' },
];

export function nextEnds({
  fromEnd = 'none',
  toEnd = 'arrow',
}: BoardEdge): Ends {
  const at = turns.findIndex(
    (each) => each.fromEnd === fromEnd && each.toEnd === toEnd,
  );
  return turns[(at + 1) % turns.length] ?? turns[0] ?? { fromEnd, toEnd };
}
