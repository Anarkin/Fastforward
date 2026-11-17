import { createContext } from 'react';

interface PathVersion {
  readonly view?: () => void;
}

export interface PathMenuAsk {
  readonly path: string;
  readonly file: boolean;
  readonly at: { readonly x: number; readonly y: number };
  readonly extended: boolean;
  readonly version?: PathVersion;
}

export const pathMenuClass = 'path-menu';

export const PathMenuContext = createContext<(asked: PathMenuAsk) => void>(
  () => {},
);
