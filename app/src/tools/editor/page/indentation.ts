import type { Text } from '@codemirror/state';
import type { ContextMenuItem } from '../../../lib/page/contextMenuItem';
import {
  set,
  sourceItems,
  unset,
  type Row,
} from '../../../lib/page/sourceRows';
import { strings } from '../../../lib/shared/strings';
import type { IndentShown } from './indent';
import type { SourceOpening } from './sources';

const { indentation } = strings;

const tab = '\t';

export function indentLabel(indent: string, tabSize: number): string {
  return indent === tab
    ? indentation.tabSize(tabSize)
    : indentation.spaces(indent.length);
}

const unitOf = (indent: string) =>
  indent === tab ? indentation.tabUnit : indentation.spacesUnit(indent.length);

function editorConfigRow(
  { indent, indentFile }: IndentShown['rules'],
  opening: SourceOpening,
): Row {
  return indent === undefined || indentFile === undefined
    ? unset(indentation.notInEditorConfig)
    : set(
        indentation.fromEditorConfig(
          unitOf(indent),
          indent === tab ? 'indent_style' : 'indent_size',
          indentFile,
        ),
        () => opening.file(indentFile),
      );
}

function linesRow(lines: string | undefined): Row {
  if (lines === undefined) {
    return unset(indentation.noIndentedLines);
  }
  return set(
    lines === tab
      ? indentation.fromTabbedLines
      : indentation.fromSpacedLines(unitOf(lines)),
  );
}

function settingsRow(fallback: string, opening: SourceOpening): Row {
  return set(
    indentation.fromIndentSettings(
      unitOf(fallback),
      fallback === tab ? 'tools.editor.indentStyle' : 'tools.editor.indentSize',
    ),
    opening.settings,
  );
}

export function indentItems(
  shown: IndentShown,
  opening: SourceOpening,
): ContextMenuItem[] {
  return sourceItems(indentation.indentHeading, [
    ...(shown.converted
      ? [set(indentation.converted(unitOf(shown.indent)))]
      : []),
    editorConfigRow(shown.rules, opening),
    linesRow(shown.lines),
    settingsRow(shown.rules.fallbackIndent ?? '    ', opening),
  ]);
}

export interface IndentChange {
  readonly from: number;
  readonly to: number;
  readonly insert: string;
}

const leadPattern = /^[ \t]*/;

function columnsOf(lead: string, tabSize: number): number {
  let column = 0;
  for (const char of lead) {
    column = char === tab ? column + tabSize - (column % tabSize) : column + 1;
  }
  return column;
}

export function indentationChanges(
  doc: Text,
  to: 'tabs' | 'spaces',
  tabSize: number,
): IndentChange[] {
  const changes: IndentChange[] = [];
  for (let number = 1; number <= doc.lines; number++) {
    const line = doc.line(number);
    const lead = leadPattern.exec(line.text)?.[0] ?? '';
    if (lead === '') {
      continue;
    }
    const columns = columnsOf(lead, tabSize);
    const insert =
      to === 'spaces'
        ? ' '.repeat(columns)
        : tab.repeat(Math.floor(columns / tabSize)) +
          ' '.repeat(columns % tabSize);
    if (insert !== lead) {
      changes.push({ from: line.from, to: line.from + lead.length, insert });
    }
  }
  return changes;
}
