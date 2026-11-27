export interface Thumb {
  readonly start: number;
  readonly length: number;
}

export interface Ends {
  readonly atStart: boolean;
  readonly atEnd: boolean;
}

export function rowEnds(top: number, lastTop: number): Ends {
  return { atStart: top <= 0, atEnd: top >= lastTop };
}
