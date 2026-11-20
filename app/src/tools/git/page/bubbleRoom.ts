import { shapeKey, type BubbleLook } from './bubbleLooks';

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

interface ShapedText {
  readonly key: string;
  readonly shape: number;
  readonly text: string;
}

export function shapedLooks(looks: ReadonlyMap<string, BubbleLook>): {
  readonly shapes: ReadonlyMap<string, BubbleLook>;
  readonly texts: readonly ShapedText[];
} {
  const shapes = new Map<string, BubbleLook>();
  const at = new Map<string, number>();
  const texts: ShapedText[] = [];
  for (const [key, look] of looks) {
    const shaped = shapeKey(look);
    let shape = at.get(shaped);
    if (shape === undefined) {
      shape = at.size;
      at.set(shaped, shape);
      shapes.set(shaped, { ...look, text: '' });
    }
    texts.push({ key, shape, text: look.text });
  }
  return { shapes, texts };
}

export function advancesOf(
  row: Element,
  probe: Element,
  texts: readonly ShapedText[],
): ReadonlyMap<string, number> {
  const lefts = Array.from(
    row.children,
    (child) => child.getBoundingClientRect().left,
  );
  const widthOfText = textMeasure(probe);
  const advances = new Map<string, number>();
  for (const { key, shape, text } of texts) {
    advances.set(
      key,
      (lefts[shape + 1] ?? 0) - (lefts[shape] ?? 0) + widthOfText(text),
    );
  }
  return advances;
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
