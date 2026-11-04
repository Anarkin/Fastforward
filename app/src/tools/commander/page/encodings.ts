import { strings } from '../../../shared/strings';
import type { ContextMenuItem } from '../../../ui/contextMenu';
import { textEncodings, type TextEncoding } from '../shared/protocol';

export type ShownEncoding = TextEncoding | 'bytes';

export type EncodingChoice = ShownEncoding | 'auto';

const encodingsShown: readonly ShownEncoding[] = ['bytes', ...textEncodings];

export function shownEncoding(
  choice: EncodingChoice,
  viewing: { readonly binary?: boolean; readonly detected?: TextEncoding } = {},
): ShownEncoding {
  if (choice !== 'auto') {
    return choice;
  }
  return viewing.detected ?? (viewing.binary === true ? 'bytes' : 'utf-8');
}

export function encodingMenu(
  choice: EncodingChoice,
  shown: ShownEncoding,
  choose: (choice: EncodingChoice) => void,
): ContextMenuItem[] {
  const { encodings, autoChoice } = strings.commander;
  return [
    {
      label: choice === 'auto' ? autoChoice(encodings[shown]) : encodings.auto,
      checked: choice === 'auto',
      onClick: () => choose('auto'),
    },
    { separator: true },
    ...encodingsShown.map((each) => ({
      label: encodings[each],
      checked: choice === each,
      onClick: () => choose(each),
    })),
  ];
}
