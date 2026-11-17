import type { TextRequest } from '../../../components/diff/shared/protocol';
import {
  diffDefaults,
  type DiffActions,
  type DiffSource,
} from '../../../components/diff/page/slice';
import type { KeptFocus } from '../../../lib/page/viewFocus';
import type { LoadedText } from '../../../components/diff/page/sideTexts';
import type { CompareView, DiffToWebview } from '../shared/protocol';

export interface CompareSource extends DiffSource {
  readonly tab: string | undefined;
  readonly compare: CompareView | undefined;
  readonly texts: ReadonlyMap<string, LoadedText>;
  readonly focuses: ReadonlyMap<string, KeptFocus>;
}

export interface CompareActions extends DiffActions {
  readonly receive: (message: DiffToWebview) => void;
  readonly loadTexts: (requests: readonly TextRequest[]) => void;
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
  focuses: new Map(),
};
