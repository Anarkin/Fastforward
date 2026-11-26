import {
  EditorSelection,
  type EditorState,
  type Text,
  type Transaction,
} from '@codemirror/state';
import { endingAfter, endingsField } from './endings';
import { endingTexts } from '../shared/textMarks';

interface Span {
  readonly from: number;
  readonly to: number;
}

export interface Copied {
  readonly text: string;
  readonly ranges: readonly Span[];
  readonly linewise: boolean;
}

const lastBreak = /(?:\r\n|\r|\n)$/;

function breakAfter(state: EditorState, lineEnd: number): string {
  const endings = state.field(endingsField, false);
  return endings === undefined
    ? state.lineBreak
    : endingTexts[endingAfter(endings, lineEnd)];
}

function mainBreak(state: EditorState): string {
  const endings = state.field(endingsField, false);
  return endings === undefined ? state.lineBreak : endingTexts[endings.ending];
}

function textBetween(state: EditorState, from: number, to: number): string {
  let text = '';
  for (let line = state.doc.lineAt(from); ;) {
    text += state.sliceDoc(Math.max(from, line.from), Math.min(to, line.to));
    if (line.to >= to) {
      return text;
    }
    text += breakAfter(state, line.to);
    line = state.doc.line(line.number + 1);
  }
}

export function copied(state: EditorState): Copied {
  const selected = state.selection.ranges.filter((range) => !range.empty);
  if (selected.length > 0) {
    return {
      text: selected
        .map(({ from, to }) => textBetween(state, from, to))
        .join(mainBreak(state)),
      ranges: selected.map(({ from, to }) => ({ from, to })),
      linewise: false,
    };
  }
  let text = '';
  const ranges: Span[] = [];
  let last = -1;
  for (const { from } of state.selection.ranges) {
    const line = state.doc.lineAt(from);
    if (line.number > last) {
      text += line.text + breakAfter(state, line.to);
      ranges.push({
        from: line.from,
        to: Math.min(state.doc.length, line.to + 1),
      });
    }
    last = line.number;
  }
  return { text, ranges, linewise: true };
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

function linesOf(
  state: EditorState,
  input: string,
  cursors: number,
): Text | undefined {
  const whole = state.toText(input);
  if (whole.lines === cursors) {
    return whole;
  }
  const body = state.toText(input.replace(lastBreak, ''));
  return cursors > 1 && lastBreak.test(input) && body.lines === cursors
    ? body
    : undefined;
}

export function pasted(
  state: EditorState,
  input: string,
  copiedLines: string | undefined,
): Transaction | undefined {
  if (state.readOnly) {
    return undefined;
  }
  const { ranges } = state.selection;
  const linewise =
    copiedLines !== undefined &&
    state.toText(copiedLines).eq(state.toText(input)) &&
    ranges.every((range) => range.empty);
  if (linewise) {
    const lineStarts = new Set(
      ranges.map((range) => state.doc.lineAt(range.from).from),
    );
    const body = state.toText(input.replace(lastBreak, ''));
    const byLine = body.lines === lineStarts.size;
    let next = 1;
    let lastLine = -1;
    return state.update(
      state.changeByRange((range) => {
        const line = state.doc.lineAt(range.from);
        if (line.from === lastLine) {
          return { range };
        }
        lastLine = line.from;
        const lines = byLine ? body.line(next).text : body.toString();
        next += 1;
        const insert = state.toText(lines + state.lineBreak);
        return {
          changes: { from: line.from, insert },
          range: EditorSelection.cursor(range.from + insert.length),
        };
      }),
      { userEvent: 'input.paste', scrollIntoView: true },
    );
  }
  const byLine = linesOf(state, input, ranges.length);
  if (byLine === undefined) {
    return state.update(state.replaceSelection(state.toText(input)), {
      userEvent: 'input.paste',
      scrollIntoView: true,
    });
  }
  let next = 1;
  return state.update(
    state.changeByRange((range) => {
      const insert = byLine.line(next).text;
      next += 1;
      return {
        changes: { from: range.from, to: range.to, insert },
        range: EditorSelection.cursor(range.from + insert.length),
      };
    }),
    { userEvent: 'input.paste', scrollIntoView: true },
  );
}
