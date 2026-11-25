import { indentUnit } from '@codemirror/language';
import {
  Facet,
  StateEffect,
  StateField,
  type EditorState,
  type Extension,
  type Text,
} from '@codemirror/state';
import type { FileTabSize } from '../../../lib/shared/tabSize';

const leadPattern = /^[ \t]*/;
const scannedLines = 10_000;

export function shownIndent(doc: Text): string | undefined {
  let tabbed = 0;
  let spaced = 0;
  let previous = 0;
  const steps = new Map<number, number>();
  for (let number = 1; number <= Math.min(doc.lines, scannedLines); number++) {
    const { text } = doc.line(number);
    const lead = leadPattern.exec(text)?.[0] ?? '';
    if (lead.length === text.length) {
      continue;
    }
    if (lead.startsWith('\t')) {
      tabbed += 1;
      continue;
    }
    if (lead.length > 0) {
      spaced += 1;
    }
    const step = Math.abs(lead.length - previous);
    if (step >= 2 && step <= 8) {
      steps.set(step, (steps.get(step) ?? 0) + 1);
    }
    previous = lead.length;
  }
  if (tabbed > spaced) {
    return '\t';
  }
  const [mostUsed] = [...steps].toSorted(
    ([stepA, countA], [stepB, countB]) => countB - countA || stepA - stepB,
  );
  return mostUsed === undefined ? undefined : ' '.repeat(mostUsed[0]);
}

export function detectedIndent(doc: Text, fallback = '    '): string {
  return shownIndent(doc) ?? fallback;
}

export interface IndentRules {
  readonly indent?: string;
  readonly indentFile?: string;
  readonly fallbackIndent?: string;
  readonly tabSize?: FileTabSize;
}

const indentRules = Facet.define<IndentRules, IndentRules>({
  combine: (values) => values[0] ?? {},
});

const linesIndentField = StateField.define<string | undefined>({
  create: () => undefined,
  update: (unit) => unit,
});

export const setIndent = StateEffect.define<string>();

export const indentField = StateField.define<string>({
  create: () => ' '.repeat(4),
  update: (unit, transaction) =>
    transaction.effects.reduce(
      (set, effect) => (effect.is(setIndent) ? effect.value : set),
      unit,
    ),
  provide: (field) => indentUnit.from(field),
});

const convertedField = StateField.define<boolean>({
  create: () => false,
  update: (converted, transaction) =>
    converted || transaction.effects.some((effect) => effect.is(setIndent)),
});

export function drawnTabSize(state: EditorState): number | undefined {
  return state.facet(indentRules).tabSize?.size;
}

export interface IndentShown {
  readonly indent: string;
  readonly converted: boolean;
  readonly lines: string | undefined;
  readonly rules: IndentRules;
}

export function indentShownOf(state: EditorState): IndentShown {
  return {
    indent: state.field(indentField),
    converted: state.field(convertedField, false) ?? false,
    lines: state.field(linesIndentField, false),
    rules: state.facet(indentRules),
  };
}

export function indentionOf(doc: Text, rules: IndentRules): Extension {
  const lines = shownIndent(doc);
  return [
    indentRules.of(rules),
    linesIndentField.init(() => lines),
    indentField.init(
      () => rules.indent ?? lines ?? rules.fallbackIndent ?? ' '.repeat(4),
    ),
    convertedField,
  ];
}
