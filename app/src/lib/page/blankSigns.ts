import { strings } from '../shared/strings';

const blankSigns: Readonly<Record<string, string>> = {
  '\t': strings.symbols.tab,
  '\r': strings.symbols.carriageReturn,
  ' ': strings.symbols.nonBreakingSpace,
  ' ': strings.symbols.nonBreakingSpace,
};

export const blank = /[ \t\r   -​  ⁠　﻿]/;

export const spacesBlanksAndText =
  / +|[ \t\r   -​  ⁠　﻿]|[^ \t\r   -​  ⁠　﻿]+/g;

export const blankSignOf = (character: string): string =>
  blankSigns[character] ?? strings.symbols.invisible;
