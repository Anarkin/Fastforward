import { isObject, type Json } from '../../lib/main/json';
import { valueAt, withValue } from './settings';

const gitSettingsOfVersion22 = [
  'collapseMerges',
  'showAllFiles',
  'ignoreWhitespace',
  'diffLayout',
  'solo',
  'autoFetch',
  'autoFetchMinutes',
  'hideDimmedButtons',
  'columnWidths',
];

const textSettingsOfVersion22 = ['wordWrap', 'showWhitespace'];

const changeColorsOfVersion22 = [
  'added',
  'added-line',
  'added-row',
  'added-minimap',
  'deleted',
  'deleted-line',
  'deleted-row',
  'deleted-minimap',
  'modified',
  'renamed',
];

const bubbleColorsOfVersion22 = [
  'bubble',
  'bubble-foreground',
  'bubble-border',
  'bubble-checked-out',
  'bubble-checked-out-foreground',
  'bubble-checked-out-border',
];

const chartColorOfVersion22 = 'chart-';

type Move = readonly [
  from: readonly string[],
  to: readonly string[] | undefined,
];

function colorMoveOfVersion22(theme: string, name: string): Move | undefined {
  const from = ['colors', theme, name];
  if (changeColorsOfVersion22.includes(name)) {
    return [from, ['colors', theme, `change-${name}`]];
  }
  if (bubbleColorsOfVersion22.includes(name)) {
    return [from, ['tools', 'git', 'colors', theme, name]];
  }
  if (name.startsWith(chartColorOfVersion22)) {
    const color = name.slice(chartColorOfVersion22.length);
    return [from, ['tools', 'git', 'colors', theme, `graph-${color}`]];
  }
  return undefined;
}

const settingMovesOfVersion22: readonly Move[] = [
  ...gitSettingsOfVersion22.map((key): Move => [[key], ['tools', 'git', key]]),
  [['entireFilePinned'], ['tools', 'git', 'showEntireFile']],
  ...textSettingsOfVersion22.map((key): Move => [[key], ['text', key]]),
  [['autoSortTabs'], undefined],
];

function movesOfVersion22(json: Json): Move[] {
  const colors = isObject(json.colors) ? json.colors : {};
  return [
    ...settingMovesOfVersion22,
    ...Object.entries(colors).flatMap(([theme, named]) =>
      isObject(named)
        ? Object.keys(named).flatMap((name) => {
            const move = colorMoveOfVersion22(theme, name);
            return move === undefined ? [] : [move];
          })
        : [],
    ),
  ];
}

export function migratedSettings(json: Json): Json | undefined {
  const moves = movesOfVersion22(json).filter(
    ([from]) => valueAt(json, from) !== undefined,
  );
  if (moves.length === 0) {
    return undefined;
  }
  return moves.reduce((result, [from, to]) => {
    const without = withValue(result, from, undefined);
    return to === undefined || valueAt(result, to) !== undefined
      ? without
      : withValue(without, to, valueAt(json, from));
  }, json);
}
