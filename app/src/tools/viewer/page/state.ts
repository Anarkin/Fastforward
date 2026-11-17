import type { SearchOptions } from '../../../lib/shared/searchOptions';
import type { TextEncoding } from '../../../components/encodings/shared/textEncodings';
import type { EncodingChoice } from '../../../components/encodings/page/encodings';
import type {
  ByteRange,
  ViewedVersion,
  ViewerToWebview,
} from '../shared/protocol';
import type { PdfPlace } from '../shared/pdf';
import type { ViewMode } from './keymap';
import type { KeptViewer, ViewerTabView } from './tabParts';
import type { ToViewer, ViewerRequest, Viewing } from './viewing';

export interface ViewerChoices {
  readonly mode?: ViewMode;
  readonly encoding?: EncodingChoice;
  readonly language?: string;
}

export interface ListedVersions {
  readonly versions: readonly ViewedVersion[];
  readonly staged: boolean;
  readonly changed: boolean;
  readonly onDisk: boolean;
}

export interface ViewerSource {
  readonly tab: string | undefined;
  readonly file: string | undefined;
  readonly version: string | undefined;
  readonly versions: ReadonlyMap<string, ListedVersions>;
  readonly viewed: Viewing | undefined;
  readonly keptViewed: ReadonlyMap<string, Viewing>;
  readonly choices: ReadonlyMap<string, ViewerChoices>;
  readonly tabViews: ReadonlyMap<string, ViewerTabView>;
  readonly places: ReadonlyMap<string, number>;
  readonly caches: ReadonlyMap<string, Partial<KeptViewer>>;
}

export interface ViewerActions {
  readonly receive: (message: ViewerToWebview) => void;
  readonly request: (message: ViewerRequest) => void;
  readonly listenViewer: (handler: (message: ToViewer) => void) => () => void;
  readonly findText: (
    tab: string,
    encoding: TextEncoding,
    query: string,
    options: SearchOptions,
    onFound: (found: {
      readonly matches: readonly ByteRange[];
      readonly done: boolean;
    }) => void,
  ) => () => void;
  readonly readWholeText: (
    tab: string,
    encoding: TextEncoding,
    onText: (text: string) => void,
  ) => () => void;
  readonly readPdfPlace: (
    tab: string,
    fingerprint: string,
  ) => Promise<PdfPlace | undefined>;
  readonly keepPdfPlace: (
    tab: string,
    fingerprint: string,
    place: PdfPlace,
  ) => void;
  readonly flushPdfPlace: () => void;
  readonly choose: (choices: Partial<ViewerChoices>) => void;
  readonly chooseVersion: (rev: string | undefined) => void;
  readonly editViewed: (
    tab: string,
    at: number,
    encoding: TextEncoding | undefined,
  ) => void;
  readonly placeOf: (tab: string) => number;
  readonly keepPlace: (tab: string, byte: number) => void;
  readonly keptViewer: (tab: string) => KeptViewer;
  readonly keepViewer: (tab: string, change: Partial<KeptViewer>) => void;
  readonly keepTabs: () => void;
  readonly releaseTab: (tab: string) => string | undefined;
}

export type ViewerState = ViewerSource & ViewerActions;

export const viewerDefaults: ViewerSource = {
  tab: undefined,
  file: undefined,
  version: undefined,
  versions: new Map(),
  viewed: undefined,
  keptViewed: new Map(),
  choices: new Map(),
  tabViews: new Map(),
  places: new Map(),
  caches: new Map(),
};

const noChoices: ViewerChoices = {};

export function choicesOf(state: ViewerSource): ViewerChoices {
  return state.tab === undefined
    ? noChoices
    : (state.choices.get(state.tab) ?? noChoices);
}
