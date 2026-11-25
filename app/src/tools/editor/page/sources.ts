import type { ContextMenuItem } from '../../../lib/page/contextMenuItem';
import {
  set,
  sourceItems,
  unset,
  type Row,
} from '../../../lib/page/sourceRows';
import { strings } from '../../../lib/shared/strings';
import type { EncodingSource, EndingSource } from '../shared/protocol';
import type { TextEncoding } from '../../../components/encodings/shared/textEncodings';
import type { LineEnding } from '../shared/textMarks';

export interface SourceOpening {
  readonly file: (file: string) => void;
  readonly settings: () => void;
}

const endingName = (ending: LineEnding) => strings.editor.endingNames[ending];

function endingRow(source: EndingSource, opening: SourceOpening): Row {
  switch (source.kind) {
    case 'editorConfig': {
      const { ending, file } = source;
      return ending === undefined || file === undefined
        ? unset(strings.editor.endingNotInEditorConfig)
        : set(
            strings.editor.endingFromEditorConfig(endingName(ending), file),
            () => opening.file(file),
          );
    }
    case 'git':
      return source.ending === undefined
        ? unset(strings.editor.endingNotInGit)
        : set(
            source.by === undefined || source.by === 'eol'
              ? strings.editor.endingFromGitAttribute(endingName(source.ending))
              : strings.editor.endingFromGitConfig(
                  endingName(source.ending),
                  source.by,
                ),
          );
    case 'extension':
      return source.ending === undefined
        ? unset(strings.editor.endingNotForExtension(source.extension))
        : set(
            strings.editor.endingFromExtension(
              endingName(source.ending),
              source.extension,
            ),
            opening.settings,
          );
    case 'settings':
      return set(
        strings.editor.endingFromSettings(endingName(source.ending)),
        opening.settings,
      );
    default:
      return source satisfies never;
  }
}

export function endingSourceItems(
  sources: readonly EndingSource[],
  lines: LineEnding | undefined,
  opening: SourceOpening,
): ContextMenuItem[] {
  return [
    ...sourceItems(strings.editor.newLinesEndIn, [
      lines === undefined
        ? unset(strings.editor.noLineBreak)
        : set(strings.editor.endingOfLines(endingName(lines))),
    ]),
    { separator: true },
    ...sourceItems(
      strings.editor.withoutLineBreak,
      sources.map((source) => endingRow(source, opening)),
    ),
  ];
}

const encodingName = (encoding: TextEncoding, bom = false) =>
  bom && encoding === 'utf-8'
    ? strings.editor.withBom(strings.encodings.names[encoding])
    : strings.encodings.names[encoding];

function encodingRow(source: EncodingSource, opening: SourceOpening): Row {
  switch (source.kind) {
    case 'chosen':
      return source.encoding === undefined
        ? unset(strings.editor.notChosen)
        : set(strings.editor.chosenEncoding(encodingName(source.encoding)));
    case 'bom':
      return source.encoding === undefined
        ? unset(strings.editor.noByteOrderMark)
        : set(strings.editor.fromByteOrderMark(encodingName(source.encoding)));
    case 'utf16':
      return source.encoding === undefined
        ? unset(strings.editor.notUtf16)
        : set(strings.editor.looksUtf16(encodingName(source.encoding)));
    case 'utf8':
      return source.encoding === undefined
        ? unset(strings.editor.notUtf8)
        : set(strings.editor.isUtf8);
    case 'codePage':
      return set(strings.editor.systemCodePage(encodingName(source.encoding)));
    case 'editorConfig': {
      const { encoding, file } = source;
      return encoding === undefined || file === undefined
        ? unset(strings.editor.charsetNotInEditorConfig)
        : set(
            strings.editor.charsetFromEditorConfig(
              encodingName(encoding, source.bom),
              file,
            ),
            () => opening.file(file),
          );
    }
    case 'settings':
      return set(
        strings.editor.charsetFromSettings(
          encodingName(source.encoding, source.bom),
        ),
        opening.settings,
      );
    default:
      return source satisfies never;
  }
}

export function encodingSourceItems(
  sources: readonly EncodingSource[],
  opening: SourceOpening,
): ContextMenuItem[] {
  return sourceItems(
    sources[0]?.kind === 'editorConfig'
      ? strings.editor.writtenIn
      : strings.editor.readIn,
    sources.map((source) => encodingRow(source, opening)),
  );
}
