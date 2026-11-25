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
    editorConfigRow(shown.rules, opening),
    linesRow(shown.lines),
    settingsRow(shown.rules.fallbackIndent ?? '    ', opening),
  ]);
}
