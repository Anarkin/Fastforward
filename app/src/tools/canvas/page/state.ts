import type { Sentence } from '../../../lib/shared/sentences';
import type { Board } from '../shared/board';
import type { CanvasToWebview } from '../shared/protocol';

export interface BoardShown {
  readonly file: string;
  readonly board?: Board;
  readonly error?: Sentence;
}

export interface CanvasSource {
  readonly tab: string | undefined;
  readonly file: string | undefined;
  readonly boards: ReadonlyMap<string, BoardShown>;
}

export interface CanvasActions {
  readonly receive: (message: CanvasToWebview) => void;
  readonly keepTabs: () => void;
  readonly releaseTab: (tab: string) => string | undefined;
}

export type CanvasState = CanvasSource & CanvasActions;

export const canvasDefaults: CanvasSource = {
  tab: undefined,
  file: undefined,
  boards: new Map(),
};

export const boardShown = (state: CanvasSource): BoardShown | undefined =>
  state.tab === undefined ? undefined : state.boards.get(state.tab);
