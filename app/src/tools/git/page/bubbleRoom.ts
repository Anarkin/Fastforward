import { lookKey, shapeKey, type BubbleLook } from './bubbleLooks';

function pixels(value: string | undefined): number {
  return parseFloat(value ?? '') || 0;
}

const measuredTexts = new Map<string, Map<string, number>>();

let canvas: OffscreenCanvasRenderingContext2D | null | undefined;

function textMeasure(probe: Element): (text: string) => number {
  const style = probe.ownerDocument.defaultView?.getComputedStyle(probe);
  const font = `${style?.fontStyle ?? ''} ${style?.fontWeight ?? ''} ${style?.fontSize ?? ''} ${style?.fontFamily ?? ''}`;
  const key = `${font}\n${probe.getBoundingClientRect().width}`;
  let known = measuredTexts.get(key);
  if (known === undefined) {
    measuredTexts.clear();
    known = new Map();
    measuredTexts.set(key, known);
  }
  canvas ??=
    typeof OffscreenCanvas === 'undefined'
      ? null
      : new OffscreenCanvas(1, 1).getContext('2d', {
          willReadFrequently: true,
        });
  const context = canvas;
  if (context === null) {
    return () => 0;
  }
  context.font = font;
  const widths = known;
  return (text) => {
    let width = widths.get(text);
    if (width === undefined) {
      width = context.measureText(text).width;
      widths.set(text, width);
    }
    return width;
  };
}

export function advancesOf(
  row: Element,
  probe: Element,
  shapes: readonly BubbleLook[],
  looks: readonly BubbleLook[],
): ReadonlyMap<string, number> {
  const lefts = Array.from(
    row.children,
    (child) => child.getBoundingClientRect().left,
  );
  const chrome = new Map(
    shapes.map((shape, at) => [
      shapeKey(shape),
      (lefts[at + 1] ?? 0) - (lefts[at] ?? 0),
    ]),
  );
  const widthOfText = textMeasure(probe);
  return new Map(
    looks.map((look) => [
      lookKey(look),
      (chrome.get(shapeKey(look)) ?? 0) + widthOfText(look.text),
    ]),
  );
}

export function widthOf(line: Element): number {
  const style = line.ownerDocument.defaultView?.getComputedStyle(line);
  return (
    line.getBoundingClientRect().width -
    pixels(style?.paddingLeft) -
    pixels(style?.paddingRight)
  );
}

export function sameAdvances(
  a: ReadonlyMap<string, number>,
  b: ReadonlyMap<string, number>,
): boolean {
  if (a.size !== b.size) {
    return false;
  }
  for (const [key, advance] of a) {
    if (b.get(key) !== advance) {
      return false;
    }
  }
  return true;
}
