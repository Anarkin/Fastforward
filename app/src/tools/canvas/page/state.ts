import type { Sentence } from '../../../lib/shared/sentences';
import type { Board } from '../shared/board';
import type { BoardEdit, CanvasToWebview } from '../shared/protocol';
import type { Origin } from './pan';

export interface BoardShown {
  readonly file: string;
  readonly board?: Board;
  readonly error?: Sentence;
  readonly changed?: true;
}

export type Placing = 'text' | 'group';

export interface CanvasSource {
  readonly tab: string | undefined;
  readonly file: string | undefined;
  readonly boards: ReadonlyMap<string, BoardShown>;
  readonly origins: ReadonlyMap<string, Origin>;
  readonly selections: ReadonlyMap<string, readonly string[]>;
  readonly placing: Placing | undefined;
}

export interface CanvasActions {
  readonly receive: (message: CanvasToWebview) => void;
  readonly pan: (tab: string, origin: Origin) => void;
  readonly originOf: (tab: string) => Origin | undefined;
  readonly select: (tab: string, ids: readonly string[]) => void;
  readonly selectedOf: (tab: string) => readonly string[];
  readonly place: (placing: Placing | undefined) => void;
  readonly edit: (tab: string, edit: BoardEdit) => void;
  readonly undo: (tab: string) => void;
  readonly redo: (tab: string) => void;
  readonly save: (tab: string) => void;
  readonly keepTabs: () => void;
  readonly releaseTab: (tab: string) => string | undefined;
}

export type CanvasState = CanvasSource & CanvasActions;

const noneSelected: readonly string[] = [];

export const canvasDefaults: CanvasSource = {
  tab: undefined,
  file: undefined,
  boards: new Map(),
  origins: new Map(),
  selections: new Map(),
  placing: undefined,
};

export const originShown = (state: CanvasSource): Origin | undefined =>
  state.tab === undefined ? undefined : state.origins.get(state.tab);

export const boardShown = (state: CanvasSource): BoardShown | undefined =>
  state.tab === undefined ? undefined : state.boards.get(state.tab);

export const selectedShown = (state: CanvasSource): readonly string[] =>
  (state.tab === undefined ? undefined : state.selections.get(state.tab)) ??
  noneSelected;
