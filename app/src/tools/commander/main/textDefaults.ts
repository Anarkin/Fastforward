import * as path from 'node:path';
import type {
  EncodingSource,
  EndingSource,
  TextEncoding,
} from '../shared/protocol';
import type { EditorSettings } from '../../../shell/shared/editorSettings';
import { isLineEnding, type LineEnding } from '../shared/textMarks';
import type { EditorCharset, EditorConfig } from './editorConfig';
import type { GitEnding } from './gitEnding';

export interface TextDefaults {
  readonly ending: LineEnding;
  readonly encoding: TextEncoding;
  readonly bom: boolean;
  readonly indent?: string;
  readonly fallbackIndent: string;
  readonly charsets: readonly CharsetSource[];
  readonly trimTrailingWhitespace?: true;
  readonly insertFinalNewline?: true;
}

export interface TextDefaultSources {
  readonly settings: EditorSettings;
  readonly editorConfig: (file: string) => Promise<EditorConfig>;
  readonly gitEnding: (file: string) => Promise<GitEnding | undefined>;
}

type CharsetSource = Extract<
  EncodingSource,
  { readonly kind: 'editorConfig' | 'settings' }
>;

interface NewTextSources {
  readonly endings: readonly EndingSource[];
  readonly charsets: readonly CharsetSource[];
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

const charsetOf = (charset: EditorCharset) => {
  const [encoding, bom] = encodingsOfCharsets[charset];
  return { encoding, bom };
};

async function sourcesOf(
  file: string,
  asksGit: (config: EditorConfig) => boolean,
  { settings, editorConfig, gitEnding }: TextDefaultSources,
): Promise<{
  readonly config: EditorConfig;
  readonly sources: NewTextSources;
}> {
  const config = await editorConfig(file);
  const extension = path.extname(file).slice(1).toLowerCase();
  const rule = settings.files.find(({ extensions }) =>
    extensions.some((each) => each.toLowerCase() === extension),
  )?.endOfLine;
  const git = asksGit(config) ? await gitEnding(file) : undefined;
  return {
    config,
    sources: {
      endings: [
        {
          kind: 'editorConfig',
          ...(config.endOfLine !== undefined && { ending: config.endOfLine }),
          ...(config.setIn.endOfLine !== undefined && {
            file: config.setIn.endOfLine,
          }),
        },
        { kind: 'git', ...git },
        {
          kind: 'extension',
          extension,
          ...(isLineEnding(rule) && { ending: rule }),
        },
        { kind: 'settings', ending: settings.endOfLine },
      ],
      charsets: [
        {
          kind: 'editorConfig',
          ...(config.charset !== undefined && charsetOf(config.charset)),
          ...(config.setIn.charset !== undefined && {
            file: config.setIn.charset,
          }),
        },
        { kind: 'settings', ...charsetOf(settings.charset) },
      ],
    },
  };
}

export async function endingSourcesOf(
  file: string,
  of: TextDefaultSources,
): Promise<readonly EndingSource[]> {
  return (await sourcesOf(file, () => true, of)).sources.endings;
}

export async function textDefaultsOf(
  file: string,
  asksGit: boolean,
  of: TextDefaultSources,
): Promise<TextDefaults> {
  const { config, sources } = await sourcesOf(
    file,
    (read) => asksGit && read.endOfLine === undefined,
    of,
  );
  const { settings } = of;
  const ending =
    sources.endings.find((each) => each.ending !== undefined)?.ending ??
    settings.endOfLine;
  const charset = sources.charsets.find((each) => each.encoding !== undefined);
  const { encoding, bom } =
    charset?.encoding === undefined
      ? charsetOf(settings.charset)
      : { encoding: charset.encoding, bom: charset.bom === true };
  const indent = indentOf(config);
  return {
    ending,
    encoding,
    bom,
    ...(indent !== undefined && { indent }),
    fallbackIndent:
      settings.indentStyle === 'tab' ? '\t' : ' '.repeat(settings.indentSize),
    charsets: sources.charsets,
    ...(config.trimTrailingWhitespace === true && {
      trimTrailingWhitespace: true,
    }),
    ...(config.insertFinalNewline === true && { insertFinalNewline: true }),
  };
}
