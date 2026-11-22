import { controlFont, fontCellOf } from './controlFontFile';
import {
  watchDevicePixels,
  type DisplayWindow,
} from '../../lib/page/devicePixels';
import {
  codesOfControlFont,
  controlFontFamily,
  unicodeRangeOf,
} from '../../lib/shared/controlFont';

export interface FontWindow extends DisplayWindow {
  readonly document: Document;
  readonly ResizeObserver: typeof ResizeObserver;
  readonly FontFace: typeof FontFace;
  getComputedStyle(element: Element): CSSStyleDeclaration;
}

const unicodeRange = unicodeRangeOf(codesOfControlFont);

export function installControlFont(view: FontWindow = window): () => void {
  const { document } = view;
  const sample = document.createElement('div');
  sample.setAttribute('aria-hidden', 'true');
  Object.assign(sample.style, {
    position: 'fixed',
    left: '0',
    top: '0',
    visibility: 'hidden',
    pointerEvents: 'none',
    whiteSpace: 'pre',
    width: 'max-content',
    fontFamily: 'var(--monospace-font-family)',
    fontSize: 'var(--monospace-font-size)',
  });
  sample.textContent = '0';
  document.body.append(sample);
  const measurer = document.createElement('canvas').getContext('2d');
  let face: FontFace | undefined;
  let drawn = '';
  const draw = () => {
    if (measurer === null) {
      return;
    }
    const { fontFamily, fontSize } = view.getComputedStyle(sample);
    measurer.font = `${fontSize} ${fontFamily}`;
    const cell = fontCellOf(
      measurer.measureText('0').width,
      parseFloat(fontSize),
    );
    const key = cell === undefined ? '' : `${cell.unitsPerEm} ${cell.advance}`;
    if (key === drawn) {
      return;
    }
    drawn = key;
    if (face !== undefined) {
      document.fonts.delete(face);
    }
    face =
      cell &&
      new view.FontFace(controlFontFamily, controlFont(cell), { unicodeRange });
    if (face !== undefined) {
      document.fonts.add(face);
    }
  };
  const resized = new view.ResizeObserver(draw);
  resized.observe(sample);
  const stopWatching = watchDevicePixels(draw, view);
  draw();
  return () => {
    resized.disconnect();
    stopWatching();
    sample.remove();
    if (face !== undefined) {
      document.fonts.delete(face);
    }
  };
}
