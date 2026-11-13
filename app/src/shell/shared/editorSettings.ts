export const editorEndings = ['lf', 'crlf', 'cr'] as const;
export const editorCharsets = [
  'utf-8',
  'utf-8-bom',
  'utf-16le',
  'utf-16be',
  'latin1',
] as const;
export const indentStyles = ['space', 'tab'] as const;

interface EditorFileRule {
  readonly extensions: readonly string[];
  readonly endOfLine: string;
}

export interface EditorSettings {
  readonly endOfLine: (typeof editorEndings)[number];
  readonly charset: (typeof editorCharsets)[number];
  readonly indentStyle: (typeof indentStyles)[number];
  readonly indentSize: number;
  readonly files: readonly EditorFileRule[];
}
