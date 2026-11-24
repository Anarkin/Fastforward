import type { TextEncoding } from '../../../components/encodings/shared/textEncodings';
import type { Sentence } from '../../../lib/shared/sentences';
import type {
  DiffSettingMessage,
  TextRequest,
} from '../../../components/diff/shared/protocol';
import type { DiffSettings } from '../../../components/diff/shared/settings';
import type { ListedVersions } from '../../../components/versions/shared/versions';

export const viewVersion = 1;

export type ComparedSide = 'old' | 'new';

export interface CompareView {
  readonly oldVersion?: string;
  readonly newVersion?: string;
  readonly tab: string;
  readonly name: string;
  readonly old: string;
  readonly new: string;
  readonly patch: string;
  readonly entire: boolean;
  readonly version: number;
  readonly same?: 'identical' | 'encoding' | 'whitespace';
  readonly encodings?: {
    readonly old?: TextEncoding;
    readonly new?: TextEncoding;
  };
  readonly withBom?: readonly ComparedSide[];
  readonly error?: Sentence;
}

export type ComparedText = TextRequest & { readonly text: string | undefined };

export type DiffToHost =
  | { readonly type: 'loadTexts'; readonly requests: readonly TextRequest[] }
  | {
      readonly type: 'chooseVersion';
      readonly side: ComparedSide;
      readonly rev?: string;
    }
  | DiffSettingMessage;

export type DiffToWebview =
  | {
      readonly type: 'show';
      readonly tab: string;
      readonly settings: DiffSettings;
    }
  | { readonly type: 'hide' }
  | { readonly type: 'closed'; readonly tab: string }
  | { readonly type: 'compare'; readonly compare: CompareView }
  | {
      readonly type: 'texts';
      readonly tab: string;
      readonly texts: readonly ComparedText[];
    }
  | ({
      readonly type: 'versions';
      readonly tab: string;
      readonly side: ComparedSide;
    } & ListedVersions);
