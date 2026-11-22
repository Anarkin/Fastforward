export const letterColumns = 3;

export const letterRows = 5;

const drawn: Readonly<Record<string, string>> = {
  A: '.#. #.# ### #.# #.#',
  B: '##. #.# ##. #.# ##.',
  C: '.## #.. #.. #.. .##',
  D: '##. #.# #.# #.# ##.',
  E: '### #.. ##. #.. ###',
  F: '### #.. ##. #.. #..',
  G: '.## #.. #.# #.# .##',
  H: '#.# #.# ### #.# #.#',
  I: '### .#. .#. .#. ###',
  K: '#.# #.# ##. #.# #.#',
  L: '#.. #.. #.. #.. ###',
  M: '#.# ### ### #.# #.#',
  N: '##. #.# #.# #.# #.#',
  O: '.#. #.# #.# #.# .#.',
  P: '##. #.# ##. #.. #..',
  Q: '.#. #.# #.# ### .##',
  R: '##. #.# ##. #.# #.#',
  S: '.## #.. .#. ..# ##.',
  T: '### .#. .#. .#. .#.',
  U: '#.# #.# #.# #.# ###',
  V: '#.# #.# #.# #.# .#.',
  X: '#.# #.# .#. #.# #.#',
  1: '.#. ##. .#. .#. ###',
  2: '##. ..# .#. #.. ###',
  3: '##. ..# .#. ..# ##.',
  4: '#.# #.# ### ..# ..#',
};

export interface Run {
  readonly row: number;
  readonly from: number;
  readonly to: number;
}

export function letterRuns(letter: string): Run[] {
  const rows = drawn[letter]?.split(' ');
  if (rows === undefined) {
    throw new Error(`No drawing of the letter ${letter}`);
  }
  return rows.flatMap((dots, row) =>
    Array.from(dots.matchAll(/#+/g), (run) => ({
      row,
      from: run.index,
      to: run.index + run[0].length,
    })),
  );
}
