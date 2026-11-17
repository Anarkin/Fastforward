import { indentUnit } from '@codemirror/language';
import { StateField, type Extension, type Text } from '@codemirror/state';

const leadPattern = /^[ \t]*/;
const scannedLines = 10_000;

export function detectedIndent(doc: Text, fallback = '    '): string {
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
  return mostUsed === undefined ? fallback : ' '.repeat(mostUsed[0]);
}

export const indentField = StateField.define<string>({
  create: () => ' '.repeat(4),
  update: (unit) => unit,
  provide: (field) => indentUnit.from(field),
});

export function indentionOf(
  doc: Text,
  {
    indent,
    fallbackIndent,
  }: { readonly indent?: string; readonly fallbackIndent?: string },
): Extension {
  return indentField.init(() => indent ?? detectedIndent(doc, fallbackIndent));
}
