import { strings } from '../../../lib/shared/strings';

const blankSigns: Readonly<Record<string, string>> = {
  '\t': strings.symbols.tab,
  '\r': strings.symbols.carriageReturn,
  ' ': strings.symbols.nonBreakingSpace,
  ' ': strings.symbols.nonBreakingSpace,
};

const blank = /[ \t\r   -​  ⁠　﻿]/;

const signed = blank.source.slice(2, -1);

export const signedBlank = new RegExp(`[${signed}]`);

export const blankSignOf = (character: string): string =>
  blankSigns[character] ?? strings.symbols.invisible;
