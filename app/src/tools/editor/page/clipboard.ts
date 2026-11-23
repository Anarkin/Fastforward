import {
  EditorSelection,
  type EditorState,
  type Transaction,
} from '@codemirror/state';

interface Span {
  readonly from: number;
  readonly to: number;
}

export interface Copied {
  readonly text: string;
  readonly ranges: readonly Span[];
  readonly linewise: boolean;
}

export function copied(state: EditorState): Copied {
  const selected = state.selection.ranges.filter((range) => !range.empty);
  if (selected.length > 0) {
    return {
      text: selected
        .map(({ from, to }) => state.sliceDoc(from, to))
        .join(state.lineBreak),
      ranges: selected.map(({ from, to }) => ({ from, to })),
      linewise: false,
    };
  }
  const texts: string[] = [];
  const ranges: Span[] = [];
  let last = -1;
  for (const { from } of state.selection.ranges) {
    const line = state.doc.lineAt(from);
    if (line.number > last) {
      texts.push(line.text);
      ranges.push({
        from: line.from,
        to: Math.min(state.doc.length, line.to + 1),
      });
    }
    last = line.number;
  }
  return { text: texts.join(state.lineBreak), ranges, linewise: true };
}

export function cut(
  state: EditorState,
  { ranges }: Copied,
): Transaction | undefined {
  return state.readOnly
    ? undefined
    : state.update({
        changes: ranges.map(({ from, to }) => ({ from, to })),
        scrollIntoView: true,
        userEvent: 'delete.cut',
      });
}

export function pasted(
  state: EditorState,
  input: string,
  copiedLines: string | undefined,
): Transaction | undefined {
  if (state.readOnly) {
    return undefined;
  }
  const text = state.toText(input);
  const { ranges } = state.selection;
  const byLine = text.lines === ranges.length;
  const linewise =
    copiedLines !== undefined &&
    copiedLines === text.toString() &&
    ranges.every((range) => range.empty);
  let next = 1;
  const taken = () => {
    const line = text.line(next);
    next += 1;
    return line.text;
  };
  if (linewise) {
    let lastLine = -1;
    return state.update(
      state.changeByRange((range) => {
        const line = state.doc.lineAt(range.from);
        if (line.from === lastLine) {
          return { range };
        }
        lastLine = line.from;
        const insert = state.toText(
          (byLine ? taken() : input) + state.lineBreak,
        );
        return {
          changes: { from: line.from, insert },
          range: EditorSelection.cursor(range.from + insert.length),
        };
      }),
      { userEvent: 'input.paste', scrollIntoView: true },
    );
  }
  return state.update(
    byLine
      ? state.changeByRange((range) => {
          const insert = taken();
          return {
            changes: { from: range.from, to: range.to, insert },
            range: EditorSelection.cursor(range.from + insert.length),
          };
        })
      : state.replaceSelection(text),
    { userEvent: 'input.paste', scrollIntoView: true },
  );
}
