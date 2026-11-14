export interface TextView {
  readonly wordWrap: boolean;
  readonly showWhitespace: boolean;
  readonly highlightSyntax: boolean;
}

export function isTextView(value: unknown): value is TextView {
  return (
    typeof value === 'object' &&
    value !== null &&
    'wordWrap' in value &&
    typeof value.wordWrap === 'boolean' &&
    'showWhitespace' in value &&
    typeof value.showWhitespace === 'boolean' &&
    'highlightSyntax' in value &&
    typeof value.highlightSyntax === 'boolean'
  );
}

export interface ImageView {
  readonly realSize: boolean;
}

export function isImageView(value: unknown): value is ImageView {
  return (
    typeof value === 'object' &&
    value !== null &&
    'realSize' in value &&
    typeof value.realSize === 'boolean'
  );
}
