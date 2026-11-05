import { strings } from '../shared/strings';

const blankSigns: Readonly<Record<string, string>> = {
  '\t': strings.symbols.tab,
  '\r': strings.symbols.carriageReturn,
  ' ': strings.symbols.nonBreakingSpace,
  ' ': strings.symbols.nonBreakingSpace,
};

const blank = /[ \t\r   -​  ⁠　﻿]/;

const spacesBlanksAndText = / +|[ \t\r   -​  ⁠　﻿]|[^ \t\r   -​  ⁠　﻿]+/g;

function blankShown(part: string, key: number): React.ReactNode {
  if (part.startsWith(' ')) {
    return (
      <span key={key} className="spaces">
        {part}
      </span>
    );
  }
  return blank.test(part) ? (
    <span
      key={key}
      className="blank"
      data-glyph={blankSigns[part] ?? strings.symbols.invisible}
    >
      {part}
    </span>
  ) : (
    part
  );
}

export function blanksShown(text: string): React.ReactNode {
  if (!blank.test(text)) {
    return text;
  }
  return Array.from(text.matchAll(spacesBlanksAndText), ([part], index) =>
    blankShown(part, index),
  );
}
