import { createContext } from 'react';
import type { ContextMenuItem } from './contextMenuItem';

interface PathVersion {
  readonly view?: () => void;
}

export interface PathMenuAsk {
  readonly path: string;
  readonly file: boolean;
  readonly at: { readonly x: number; readonly y: number };
  readonly extended: boolean;
  readonly version?: PathVersion;
  readonly within?: (
    items: readonly ContextMenuItem[],
  ) => readonly ContextMenuItem[];
}

export const pathMenuClass = 'path-menu';

export const PathMenuContext = createContext<(asked: PathMenuAsk) => void>(
  () => {},
);

export const FollowPathContext = createContext<(path: string) => void>(
  () => {},
);
