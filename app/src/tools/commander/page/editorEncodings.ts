import { strings } from '../../../lib/shared/strings';
import type { ContextMenuItem } from '../../../lib/page/contextMenu';
import type { TextEncoding } from '../shared/protocol';
import {
  inGroups,
  keywordsOf,
  textEncodingGroups,
  textEncodingMenu,
} from './encodings';

export interface ReadShown {
  readonly choice: TextEncoding | 'auto';
  readonly shown: TextEncoding;
}

export interface Encoded {
  readonly encoding: TextEncoding;
  readonly bom: boolean;
}

export interface SaveShown {
  readonly saving: TextEncoding;
  readonly bom: boolean;
  readonly onDisk: Encoded | undefined;
}

const bomsOf = (encoding: TextEncoding): readonly boolean[] =>
  encoding === 'utf-8' ? [false, true] : [encoding.startsWith('utf-16')];

export const savedName = (encoding: TextEncoding, bom: boolean): string =>
  bom && encoding === 'utf-8'
    ? strings.editor.shortWithBom(strings.commander.encodingShort[encoding])
    : strings.commander.encodingShort[encoding];

const encodedName = (encoding: TextEncoding, bom: boolean): string =>
  bom && encoding === 'utf-8'
    ? strings.editor.withBom(strings.commander.encodings[encoding])
    : strings.commander.encodings[encoding];

const withSources = (
  items: readonly ContextMenuItem[],
  sources: readonly ContextMenuItem[],
): ContextMenuItem[] => [
  ...items,
  ...(sources.length === 0 ? [] : [{ separator: true } as const, ...sources]),
];

export function readMenu(
  { choice, shown }: ReadShown,
  reopen: (choice: TextEncoding | 'auto') => void,
  sources: readonly ContextMenuItem[],
): ContextMenuItem[] {
  return withSources(textEncodingMenu(choice, shown, reopen), sources);
}

export function saveMenu(
  { saving, bom, onDisk }: SaveShown,
  saveIn: (encoding: TextEncoding | 'auto', bom: boolean) => void,
  sources: readonly ContextMenuItem[],
): ContextMenuItem[] {
  const auto = onDisk ?? { encoding: saving, bom };
  return withSources(
    [
      {
        label: strings.common.autoChoice(encodedName(auto.encoding, auto.bom)),
        keywords: keywordsOf(auto.encoding),
        checked: onDisk === undefined,
        onClick: () => saveIn('auto', false),
      },
      { separator: true },
      ...inGroups(textEncodingGroups, (each) =>
        bomsOf(each).map((withBom) => ({
          label: encodedName(each, withBom),
          keywords: keywordsOf(each),
          checked: onDisk !== undefined && each === saving && withBom === bom,
          onClick: () => saveIn(each, withBom),
        })),
      ),
    ],
    sources,
  );
}
