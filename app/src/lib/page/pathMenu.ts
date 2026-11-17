import { createContext } from 'react';

export interface PathMenuAsk {
  readonly path: string;
  readonly file: boolean;
  readonly at: { readonly x: number; readonly y: number };
  readonly extended: boolean;
}

export const pathMenuClass = 'path-menu';

export const PathMenuContext = createContext<(asked: PathMenuAsk) => void>(
  () => {},
);
