import { useEffect, useState } from 'react';
import type { IUnicodeVersionProvider, Terminal } from '@xterm/xterm';
import { invisibleParts } from './invisibles';

export type CellTable = (cluster: string) => number;

const withInvisibles =
  (table: CellTable): CellTable =>
  (cluster) => {
    const parts = invisibleParts(cluster);
    return parts === undefined
      ? table(cluster)
      : parts.reduce(
          (cells, part) => cells + (part.hidden ? 1 : table(part.text)),
          0,
        );
  };

export const plainCells: CellTable = withInvisibles((cluster) =>
  cluster === '\t' || cluster === '\r' || cluster === '\n' ? 0 : 1,
);

let loadedTable: CellTable | undefined;

let loadingTable: Promise<CellTable> | undefined;

type Registering = Pick<Terminal, 'unicode'>;

interface TableAddon {
  activate(terminal: Registering): void;
}

const graphemesVersion = '15-graphemes';

const widthIn = (properties: number) => (properties >> 1) & 3;

const joinsPreceding = (properties: number) => (properties & 1) !== 0;

function cellsBy(provider: IUnicodeVersionProvider, cluster: string): number {
  let cells = 0;
  let preceding = 0;
  for (const char of cluster) {
    const properties = provider.charProperties(
      char.codePointAt(0) ?? 0,
      preceding,
    );
    cells +=
      widthIn(properties) -
      (joinsPreceding(properties) ? widthIn(preceding) : 0);
    preceding = properties;
  }
  return cells;
}

function tableOf(addon: TableAddon): CellTable {
  const registered: IUnicodeVersionProvider[] = [];
  addon.activate({
    unicode: {
      versions: [],
      activeVersion: '',
      register: (provider) => {
        registered.push(provider);
      },
    },
  });
  const provider = registered.find((each) => each.version === graphemesVersion);
  return provider === undefined
    ? plainCells
    : withInvisibles((cluster) => cellsBy(provider, cluster));
}

export function terminalCells(): Promise<CellTable> {
  loadingTable ??= import('@xterm/addon-unicode-graphemes').then(
    ({ UnicodeGraphemesAddon }) => {
      loadedTable = tableOf(new UnicodeGraphemesAddon());
      return loadedTable;
    },
  );
  return loadingTable;
}

export function useCellTable(): CellTable | undefined {
  const [table, setTable] = useState(() => loadedTable);
  useEffect(() => {
    if (table !== undefined) {
      return undefined;
    }
    let wanted = true;
    const keep = (loaded: CellTable) => {
      if (wanted) {
        setTable(() => loaded);
      }
    };
    terminalCells().then(keep, () => keep(plainCells));
    return () => {
      wanted = false;
    };
  }, [table]);
  return table;
}

export const currentCellTable = (): CellTable => loadedTable ?? plainCells;

export function cellsOf(
  cluster: string,
  table: CellTable = currentCellTable(),
): number {
  return table(cluster);
}
