import type { DiffLayout, TextRequest } from '../../../lib/shared/changes';
import type { DiffSettings } from '../../../lib/shared/diffSettings';
import type {
  DiffMeasures,
  DiffMeasuring,
} from '../../../lib/page/diffMeasures';
import { unmeasuredDiff } from '../../../lib/page/diffMeasures';
import type { DiffPlace } from '../../../lib/page/diffPlace';
import type { KeptFind } from '../../../lib/page/diffFind';
import type { KeptFocus } from '../../../lib/page/keptFocus';
import type { LoadedText } from '../../../lib/page/sideTexts';
import type { CompareView, DiffToWebview } from '../shared/protocol';

export interface DiffSource {
  readonly tab: string | undefined;
  readonly compare: CompareView | undefined;
  readonly texts: ReadonlyMap<string, LoadedText>;
  readonly settings: DiffSettings;
  readonly measures: DiffMeasures;
  readonly finds: ReadonlyMap<string, KeptFind>;
  readonly languages: ReadonlyMap<string, string>;
}

export interface DiffActions extends DiffMeasuring {
  readonly receive: (message: DiffToWebview) => void;
  readonly loadTexts: (requests: readonly TextRequest[]) => void;
  readonly setShowEntireFile: (show: boolean) => void;
  readonly setIgnoreWhitespace: (ignore: boolean) => void;
  readonly setDiffLayout: (layout: DiffLayout) => void;
  readonly keepFind: (tab: string, find: KeptFind) => void;
  readonly closeFind: (tab: string) => void;
  readonly placeOf: (tab: string) => DiffPlace | undefined;
  readonly keepPlace: (tab: string, change: Partial<DiffPlace>) => void;
  readonly pickLanguage: (tab: string, language: string | undefined) => void;
  readonly focusOf: (tab: string) => KeptFocus | undefined;
  readonly keepFocus: (tab: string, focus: KeptFocus | undefined) => void;
  readonly keepTabs: () => void;
  readonly releaseTab: (tab: string) => string | undefined;
}

export type DiffState = DiffSource & DiffActions;

export const diffDefaults: DiffSource = {
  tab: undefined,
  compare: undefined,
  texts: new Map(),
  settings: {
    showEntireFile: false,
    ignoreWhitespace: true,
    diffLayout: 'sideBySide',
  },
  measures: unmeasuredDiff,
  finds: new Map(),
  languages: new Map(),
};
