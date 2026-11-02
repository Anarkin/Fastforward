import { strings } from '../shared/strings';

const blankSigns: Readonly<Record<string, string>> = {
  ' ': strings.symbols.space,
  '\t': strings.symbols.tab,
  '\r': strings.symbols.carriageReturn,
  ' ': strings.symbols.nonBreakingSpace,
  ' ': strings.symbols.nonBreakingSpace,
};

const blank = /[ \t\r   -​  ⁠　﻿]/;

const blanksAndText = /[ \t\r   -​  ⁠　﻿]|[^ \t\r   -​  ⁠　﻿]+/g;

export function blanksShown(text: string): React.ReactNode {
  if (!blank.test(text)) {
    return text;
  }
  return Array.from(text.matchAll(blanksAndText), ([part], index) =>
    blank.test(part) ? (
      <span
        key={index}
        className="blank"
        data-glyph={blankSigns[part] ?? strings.symbols.invisible}
      >
        {part}
      </span>
    ) : (
      part
    ),
  );
}
