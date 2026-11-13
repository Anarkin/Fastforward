import * as path from 'node:path';
import type { TextEncoding } from '../shared/protocol';
import type { EditorSettings } from '../../../shell/shared/editorSettings';
import { isLineEnding, type LineEnding } from '../shared/textMarks';
import type { EditorCharset, EditorConfig } from './editorConfig';

export interface TextDefaults {
  readonly ending: LineEnding;
  readonly encoding: TextEncoding;
  readonly bom: boolean;
  readonly indent?: string;
  readonly fallbackIndent: string;
}

export interface TextDefaultSources {
  readonly settings: EditorSettings;
  readonly editorConfig: (file: string) => Promise<EditorConfig>;
  readonly gitEnding: (file: string) => Promise<LineEnding | undefined>;
}

const encodingsOfCharsets: Readonly<
  Record<EditorCharset, readonly [TextEncoding, boolean]>
> = {
  'utf-8': ['utf-8', false],
  'utf-8-bom': ['utf-8', true],
  'utf-16le': ['utf-16le', true],
  'utf-16be': ['utf-16be', true],
  latin1: ['windows-1252', false],
};

function indentOf(config: EditorConfig): string | undefined {
  if (config.indentStyle === 'tab') {
    return '\t';
  }
  return config.indentStyle === 'space' || config.indentSize !== undefined
    ? ' '.repeat(config.indentSize ?? config.tabWidth ?? 4)
    : undefined;
}

export async function textDefaultsOf(
  file: string,
  made: boolean,
  { settings, editorConfig, gitEnding }: TextDefaultSources,
): Promise<TextDefaults> {
  const config = await editorConfig(file);
  const extension = path.extname(file).slice(1).toLowerCase();
  const rule = settings.files.find(({ extensions }) =>
    extensions.some((each) => each.toLowerCase() === extension),
  )?.endOfLine;
  const ending =
    config.endOfLine ??
    (made ? await gitEnding(file) : undefined) ??
    (isLineEnding(rule) ? rule : undefined) ??
    settings.endOfLine;
  const [encoding, bom] =
    encodingsOfCharsets[config.charset ?? settings.charset];
  const indent = indentOf(config);
  return {
    ending,
    encoding,
    bom,
    ...(indent !== undefined && { indent }),
    fallbackIndent:
      settings.indentStyle === 'tab' ? '\t' : ' '.repeat(settings.indentSize),
  };
}
