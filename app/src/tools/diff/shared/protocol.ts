import type { Sentence } from '../../../lib/shared/sentences';
import type {
  DiffSettingMessage,
  TextRequest,
} from '../../../components/diff/shared/protocol';
import type { DiffSettings } from '../../../components/diff/shared/settings';

export const viewVersion = 1;

export interface CompareView {
  readonly tab: string;
  readonly name: string;
  readonly old: string;
  readonly new: string;
  readonly patch: string;
  readonly entire: boolean;
  readonly version: number;
  readonly same?: 'identical' | 'whitespace';
  readonly error?: Sentence;
}

export type ComparedText = TextRequest & { readonly text: string | undefined };

export type DiffToHost =
  | { readonly type: 'loadTexts'; readonly requests: readonly TextRequest[] }
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
    };
