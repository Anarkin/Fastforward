import type { Sentence } from '../../../lib/shared/sentences';
import type { Board } from './board';

export const viewVersion = 1;

export type CanvasToHost = never;

export type CanvasToWebview =
  | { readonly type: 'show'; readonly tab: string; readonly file: string }
  | { readonly type: 'hide' }
  | { readonly type: 'closed'; readonly tab: string }
  | {
      readonly type: 'board';
      readonly tab: string;
      readonly file: string;
      readonly board?: Board;
      readonly error?: Sentence;
    };
