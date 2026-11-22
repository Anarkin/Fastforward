import {
  codesOfControlFont,
  controlFontFamily,
  controlNames,
  deleteName,
  nameOfControlFontCode,
  spaceName,
} from '../../lib/shared/controlFont';
import { pictureBoxes } from './controlFontDrawing';
import { trueTypeFont } from './trueTypeFont';

export interface FontCell {
  readonly unitsPerEm: number;
  readonly advance: number;
}

const ascentShare = 0.7;

const descentShare = 0.15;

const pictureNames: readonly string[] = [
  ...controlNames,
  spaceName,
  deleteName,
];

export function controlFont({
  unitsPerEm,
  advance,
}: FontCell): Uint8Array<ArrayBuffer> {
  return trueTypeFont({
    family: controlFontFamily,
    unitsPerEm,
    ascent: Math.round(ascentShare * unitsPerEm),
    descent: Math.round(descentShare * unitsPerEm),
    glyphs: [
      { advance, boxes: [] },
      ...pictureNames.map((name) => ({
        advance,
        boxes: pictureBoxes(name, advance),
      })),
    ],
    glyphOfCode: new Map(
      codesOfControlFont.map((code) => [
        code,
        pictureNames.indexOf(nameOfControlFontCode(code)) + 1,
      ]),
    ),
  });
}

const fixedPoint = 65536;

const fewestUnits = 1000;

const mostUnits = 16384;

const exactly = 1e-6;

export function fontCellOf(zero: number, size: number): FontCell | undefined {
  if (!(zero > 0) || !(size > 0)) {
    return undefined;
  }
  const share = zero / size;
  const wanted = Math.round(zero * fixedPoint);
  let nearest: FontCell = { unitsPerEm: fewestUnits, advance: 0 };
  let least = Infinity;
  for (let unitsPerEm = fewestUnits; unitsPerEm <= mostUnits; unitsPerEm++) {
    const advance = Math.round(share * unitsPerEm);
    const off = Math.abs((advance / unitsPerEm) * size * fixedPoint - wanted);
    if (off < least - exactly) {
      least = off;
      nearest = { unitsPerEm, advance };
      if (off <= exactly) {
        break;
      }
    }
  }
  return nearest;
}
