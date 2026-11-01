import { textEncodings, type TextEncoding } from '../shared/protocol';

export type ShownEncoding = TextEncoding | 'bytes';

export type EncodingChoice = ShownEncoding | 'auto';

export const encodingChoices: readonly EncodingChoice[] = [
  'auto',
  ...textEncodings,
  'bytes',
];

export function shownEncoding(
  choice: EncodingChoice,
  viewing: { readonly binary?: boolean; readonly detected?: TextEncoding } = {},
): ShownEncoding {
  if (choice !== 'auto') {
    return choice;
  }
  return viewing.detected ?? (viewing.binary === true ? 'bytes' : 'utf-8');
}
