import type {
  DiffLayout,
  TextRequest,
} from '../../../components/diff/shared/diffProtocol';
import type { DiffSettings } from '../../../components/diff/shared/diffSettings';
import {
  diffDefaults,
  type DiffActions,
  type DiffSource,
} from '../../../components/diff/page/diffSlice';
import type { KeptFocus } from '../../../lib/page/keptFocus';
import type { LoadedText } from '../../../components/diff/page/sideTexts';
import type { CompareView, DiffToWebview } from '../shared/protocol';

export interface CompareSource extends DiffSource {
  readonly tab: string | undefined;
  readonly compare: CompareView | undefined;
  readonly texts: ReadonlyMap<string, LoadedText>;
  readonly settings: DiffSettings;
}

export interface CompareActions extends DiffActions {
  readonly receive: (message: DiffToWebview) => void;
  readonly loadTexts: (requests: readonly TextRequest[]) => void;
  readonly setShowEntireFile: (show: boolean) => void;
  readonly setIgnoreWhitespace: (ignore: boolean) => void;
  readonly setDiffLayout: (layout: DiffLayout) => void;
  readonly focusOf: (tab: string) => KeptFocus | undefined;
  readonly keepFocus: (tab: string, focus: KeptFocus | undefined) => void;
  readonly keepTabs: () => void;
  readonly releaseTab: (tab: string) => string | undefined;
}

export type CompareState = CompareSource & CompareActions;

export const compareDefaults: CompareSource = {
  ...diffDefaults,
  tab: undefined,
  compare: undefined,
  texts: new Map(),
  settings: {
    showEntireFile: false,
    ignoreWhitespace: true,
    diffLayout: 'sideBySide',
  },
};
