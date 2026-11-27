import type { Unit } from './grid';
import type { Cell } from './routes';
import type { KeptTyped } from '../../../lib/page/viewFocus';
import type { Sentence } from '../../../lib/shared/sentences';
import type { Board } from '../shared/board';
import type {
  NodeFile,
  PlacedBox,
  BoardEdit,
  CanvasToWebview,
} from '../shared/protocol';
import type { Origin } from './pan';
import type { Caret } from './typing';

export interface BoardShown {
  readonly file: string;
  readonly board?: Board;
  readonly error?: Sentence;
  readonly changed?: true;
}

export type Placing = 'text' | 'group';

export interface Typing extends Caret {
  readonly id: string;
  readonly session: number;
}

export interface Coloring {
  readonly nodes: readonly string[];
  readonly edges: readonly string[];
  readonly typed?: KeptTyped;
}

export interface CanvasSource {
  readonly tab: string | undefined;
  readonly file: string | undefined;
  readonly boards: ReadonlyMap<string, BoardShown>;
  readonly origins: ReadonlyMap<string, Origin>;
  readonly zooms: ReadonlyMap<string, number>;
  readonly selections: ReadonlyMap<string, readonly string[]>;
  readonly placing: Placing | undefined;
  readonly typings: ReadonlyMap<string, Typing>;
  readonly colorings: ReadonlyMap<string, Coloring>;
  readonly titles: ReadonlyMap<string, string>;
  readonly files: ReadonlyMap<string, Readonly<Record<string, NodeFile>>>;
}

export interface CanvasActions {
  readonly receive: (message: CanvasToWebview) => void;
  readonly pan: (tab: string, origin: Origin) => void;
  readonly zoom: (tab: string, step: number) => void;
  readonly originOf: (tab: string) => Origin | undefined;
  readonly typingOf: (tab: string) => Typing | undefined;
  readonly select: (tab: string, ids: readonly string[]) => void;
  readonly selectedOf: (tab: string) => readonly string[];
  readonly place: (placing: Placing | undefined) => void;
  readonly startTyping: (
    tab: string,
    id: string,
    span?: { readonly anchor: number; readonly head: number },
  ) => void;
  readonly typed: (tab: string, caret: Caret) => void;
  readonly stopTyping: (tab: string) => void;
  readonly edit: (tab: string, edit: BoardEdit) => void;
  readonly undo: (tab: string) => void;
  readonly redo: (tab: string) => void;
  readonly save: (tab: string) => void;
  readonly askColor: (
    tab: string,
    ids: Pick<Coloring, 'nodes' | 'edges'>,
  ) => void;
  readonly dropFiles: (
    tab: string,
    files: readonly File[],
    box: PlacedBox,
  ) => void;
  readonly pasteOnBoard: (
    tab: string,
    text: string,
    at: Cell,
    unit: Unit,
  ) => boolean;
  readonly keepColorTyped: (tab: string, typed: KeptTyped) => void;
  readonly answerColor: (tab: string, color: string | undefined) => void;
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
  zooms: new Map(),
  selections: new Map(),
  placing: undefined,
  typings: new Map(),
  colorings: new Map(),
  titles: new Map(),
  files: new Map(),
};

export const coloringShown = (state: CanvasSource): Coloring | undefined =>
  state.tab === undefined ? undefined : state.colorings.get(state.tab);

export const zoomShown = (state: CanvasSource): number =>
  (state.tab === undefined ? undefined : state.zooms.get(state.tab)) ?? 0;

export const originShown = (state: CanvasSource): Origin | undefined =>
  state.tab === undefined ? undefined : state.origins.get(state.tab);

export const boardShown = (state: CanvasSource): BoardShown | undefined =>
  state.tab === undefined ? undefined : state.boards.get(state.tab);

export const filesShown = (
  state: CanvasSource,
): Readonly<Record<string, NodeFile>> | undefined =>
  state.tab === undefined ? undefined : state.files.get(state.tab);

export const typingShown = (state: CanvasSource): Typing | undefined =>
  state.tab === undefined ? undefined : state.typings.get(state.tab);

export const selectedShown = (state: CanvasSource): readonly string[] =>
  (state.tab === undefined ? undefined : state.selections.get(state.tab)) ??
  noneSelected;
