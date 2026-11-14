import { useEffect, useState } from 'react';
import type { IUnicodeVersionProvider, Terminal } from '@xterm/xterm';

export type CellTable = (cluster: string) => number;

export const plainCells: CellTable = (cluster) =>
  (cluster.codePointAt(0) ?? 0) < 0x20 ? 0 : 1;

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
    : (cluster) => cellsBy(provider, cluster);
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

export function cellsOf(
  cluster: string,
  table: CellTable = loadedTable ?? plainCells,
): number {
  return table(cluster);
}
