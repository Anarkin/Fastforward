export const defaultTabSize = 4;

export interface FileTabSize {
  readonly size: number;
  readonly key: 'tab_width' | 'indent_size';
  readonly file?: string;
}
