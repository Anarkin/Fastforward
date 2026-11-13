import { strings } from '../../../shared/strings';
import type { ContextMenuItem } from '../../../ui/contextMenu';
import type { TextEncoding } from '../shared/protocol';

export type ShownEncoding = TextEncoding | 'bytes';

export type EncodingChoice = ShownEncoding | 'auto';

export const textEncodingGroups: readonly (readonly TextEncoding[])[] = [
  ['utf-8', 'utf-16be', 'utf-16le'],
  [
    'windows-874',
    'windows-1250',
    'windows-1251',
    'windows-1252',
    'windows-1253',
    'windows-1254',
    'windows-1255',
    'windows-1256',
    'windows-1257',
    'windows-1258',
  ],
  [
    'iso-8859-2',
    'iso-8859-3',
    'iso-8859-4',
    'iso-8859-5',
    'iso-8859-6',
    'iso-8859-7',
    'iso-8859-8',
    'iso-8859-8-i',
    'iso-8859-10',
    'iso-8859-13',
    'iso-8859-14',
    'iso-8859-15',
    'iso-8859-16',
  ],
  ['ibm866', 'koi8-r', 'koi8-u'],
  ['x-mac-cyrillic', 'macintosh'],
];

const encodingGroups: readonly (readonly ShownEncoding[])[] = [
  ['bytes'],
  ...textEncodingGroups,
];

const codePages: Partial<Record<ShownEncoding, number>> = {
  'utf-8': 65001,
  'utf-16le': 1200,
  'utf-16be': 1201,
  'iso-8859-8-i': 38598,
  'koi8-r': 20866,
  'koi8-u': 21866,
  ibm866: 866,
  macintosh: 10000,
  'x-mac-cyrillic': 10007,
};

const latinNumbers: Partial<Record<ShownEncoding, number>> = {
  'iso-8859-2': 2,
  'iso-8859-3': 3,
  'iso-8859-4': 4,
  'iso-8859-10': 6,
  'iso-8859-13': 7,
  'iso-8859-14': 8,
  'iso-8859-15': 9,
  'iso-8859-16': 10,
};

function codePageOf(encoding: ShownEncoding): number | undefined {
  const windows = /^windows-(\d+)$/.exec(encoding);
  const iso = /^iso-8859-(\d+)$/.exec(encoding);
  if (windows) {
    return Number(windows[1]);
  }
  return iso ? 28590 + Number(iso[1]) : codePages[encoding];
}

export function keywordsOf(encoding: ShownEncoding): string {
  const codePage = codePageOf(encoding);
  const latin = latinNumbers[encoding];
  return [
    encoding,
    ...(codePage === undefined ? [] : [`${codePage}`, `cp${codePage}`]),
    ...(latin === undefined ? [] : [`latin${latin}`]),
  ].join(' ');
}

export function shownEncoding(
  choice: EncodingChoice,
  viewing: { readonly binary?: boolean; readonly detected?: TextEncoding } = {},
): ShownEncoding {
  if (choice !== 'auto') {
    return choice;
  }
  return viewing.detected ?? (viewing.binary === true ? 'bytes' : 'utf-8');
}

export function inGroups<Encoding extends ShownEncoding>(
  groups: readonly (readonly Encoding[])[],
  itemsOf: (encoding: Encoding) => readonly ContextMenuItem[],
): ContextMenuItem[] {
  return groups.flatMap((group, index): ContextMenuItem[] => [
    ...(index === 0 ? [] : [{ separator: true } as const]),
    ...group.flatMap(itemsOf),
  ]);
}

function choiceItems<Encoding extends ShownEncoding>(
  choice: Encoding | 'auto',
  shown: Encoding,
  choose: (choice: Encoding | 'auto') => void,
  groups: readonly (readonly Encoding[])[],
): ContextMenuItem[] {
  const { encodings } = strings.commander;
  const { autoChoice } = strings.common;
  return [
    {
      label: choice === 'auto' ? autoChoice(encodings[shown]) : encodings.auto,
      keywords: choice === 'auto' ? keywordsOf(shown) : undefined,
      checked: choice === 'auto',
      onClick: () => choose('auto'),
    },
    { separator: true },
    ...inGroups(groups, (each) => [
      {
        label: encodings[each],
        keywords: keywordsOf(each),
        checked: choice === each,
        onClick: () => choose(each),
      },
    ]),
  ];
}

export function encodingMenu(
  choice: EncodingChoice,
  shown: ShownEncoding,
  choose: (choice: EncodingChoice) => void,
): ContextMenuItem[] {
  return choiceItems(choice, shown, choose, encodingGroups);
}

export function textEncodingMenu(
  choice: TextEncoding | 'auto',
  shown: TextEncoding,
  choose: (choice: TextEncoding | 'auto') => void,
): ContextMenuItem[] {
  return choiceItems(choice, shown, choose, textEncodingGroups);
}
