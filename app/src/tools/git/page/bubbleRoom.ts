import { lookKey, type BubbleLook } from './bubbleLooks';

export interface BubbleRoom {
  readonly advances: ReadonlyMap<string, number>;
  readonly width: number;
}

export const noBubbleRoom: BubbleRoom = { advances: new Map(), width: 0 };

function pixels(value: string | undefined): number {
  return parseFloat(value ?? '') || 0;
}

export function roomOf(
  line: Element,
  row: Element,
  looks: readonly BubbleLook[],
): BubbleRoom {
  const lefts = Array.from(
    row.children,
    (child) => child.getBoundingClientRect().left,
  );
  const style = line.ownerDocument.defaultView?.getComputedStyle(line);
  return {
    advances: new Map(
      looks.map((look, at) => [
        lookKey(look),
        (lefts[at + 1] ?? 0) - (lefts[at] ?? 0),
      ]),
    ),
    width:
      line.getBoundingClientRect().width -
      pixels(style?.paddingLeft) -
      pixels(style?.paddingRight),
  };
}

export function sameRoom(a: BubbleRoom, b: BubbleRoom): boolean {
  if (a.width !== b.width || a.advances.size !== b.advances.size) {
    return false;
  }
  for (const [key, advance] of a.advances) {
    if (b.advances.get(key) !== advance) {
      return false;
    }
  }
  return true;
}
