import { letterColumns, letterRows, letterRuns } from './controlFontLetters';

export interface Box {
  readonly left: number;
  readonly bottom: number;
  readonly right: number;
  readonly top: number;
}

export const dotsAcross = 7.2;

const between = 1;

const topDot = 9;

export const pictureLetters = (name: string): readonly [string, string] => [
  name.charAt(0),
  name.charAt(name.length - 1),
];

export function pictureDots(name: string): Box[] {
  return pictureLetters(name).flatMap((letter, at) => {
    const left = at * (letterColumns + between);
    const top = topDot - at * (letterRows + between);
    return letterRuns(letter).map(({ row, from, to }) => ({
      left: left + from,
      right: left + to,
      top: top - row,
      bottom: top - row - 1,
    }));
  });
}

export function pictureBoxes(name: string, advance: number): Box[] {
  const dot = advance / dotsAcross;
  const units = (dots: number) => Math.round(dots * dot);
  return pictureDots(name).map(({ left, bottom, right, top }) => ({
    left: units(left),
    bottom: units(bottom),
    right: units(right),
    top: units(top),
  }));
}
